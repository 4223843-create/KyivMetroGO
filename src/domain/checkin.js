// ══ DOMAIN: CHECK-IN — ЧИСТА БІЗНЕС-ЛОГІКА ══
// Відповідальність: управління даними відвідань (check-in),
// відмінювання іменників, статистика по гілках.
// ПРАВИЛО: жодного DOM, жодних UI-функцій.
// Крос-модульні сигнали — виключно через EventBus.

import { state }                from '../core/state.js';
import { STORAGE_KEYS, Storage } from '../core/storage.js';
import { bus }                   from '../core/eventBus.js';

// ══ КОНСТАНТИ ГІЛОК ══════════════════════════════════════════

export const LINE_NAMES = { blue: 'Синя', red: 'Червона', green: 'Зелена' };
export const LINE_ORDER = ['blue', 'red', 'green'];

// ══ ВНУТРІШНІ РОЗУМНІ ХЕЛПЕРИ ЗІСТАВЛЕННЯ ════════════════════

const norm = (str) =>
  String(str || '').trim().toLowerCase().replace(/[\s\u00a0\u202f\u2009]+/g, ' ');

/**
 * Очищувач префіксів. Зрізає «до», «попередня», «ст.» та пробіли.
 * Гарантує стабільне зіставлення колій незалежно від форматування в UI.
 */
const cleanStr = (s) =>
  String(s || '')
    .toLowerCase()
    // Нормалізуємо &nbsp; (буквальний текст із JSON) та реальний U+00A0
    // (який browser/DOM textContent повертає після рендеру &nbsp;)
    // до звичайного пробілу — інакше вони по-різному переживають фільтр нижче
    // ("&nbsp;" лишає літери n/b/s/p, бо вони у дозволеному діапазоні a-z).
    .replace(/&nbsp;|\u00a0/g, ' ')
    .replace(/(?:до|станції|ст\.|напрямок|на|попередня)\s+/g, '')
    .replace(/^[rbg]\./, '')
    .replace(/[^a-z0-9а-яіїєґ]/g, '')
    .trim();

const parseTokens = (s) => {
  const str = String(s);
  if (str.includes('-')) {
    const [start, end] = str.split('-').map(Number);
    const arr = [];
    for (let i = start; i <= end; i++) arr.push(i);
    return arr;
  }
  return str.split(',').map(x => parseInt(x.trim())).filter(Boolean);
};

// ВИНЯТКИ: станції, де токен-перетин (1 входить у "1-3") створює
// хибну неоднозначність між двома РІЗНИМИ фізичними виходами, що
// навмисно діляться тим самим вагоном/дверима за даними (напр.
// Хрещатик: "короткий перехід" 2/"1-3" перетинається з "вихід в
// місто" 2/"1"). Для них зіставлення йде по точному рядку, а не
// по перетину токенів. Решту станцій це НЕ зачіпає.
const EXACT_EXIT_MATCH_STATIONS = new Set(['R.Khreshchatyk']);

const exitContainsPin = (ex, w, d, exact = false) =>
  (ex.positions || []).some(p => {
    if (p.closed) return false;
    if (exact) {
      return String(p.wagon).trim() === String(w).trim()
          && String(p.doors).trim() === String(d).trim();
    }
    const pW = parseTokens(p.wagon); const cW = parseTokens(w);
    const pD = parseTokens(p.doors); const cD = parseTokens(d);
    return cW.some(n => pW.includes(n)) && cD.some(n => pD.includes(n));
  });

/**
 * Математичне віддзеркалення вагона або дверей (за ідеєю 6 - Вагон, 5 - Двері).
 * Працює навіть з діапазонами ("1-3") та переліками ("1, 2").
 */
function mirrorValue(str, max) {
  if (!str || str === '-') return str;
  if (String(str).includes('-')) {
    const [start, end] = String(str).split('-').map(Number);
    return `${max - end + 1}-${max - start + 1}`;
  }
  return String(str).split(',').map(x => {
    const n = parseInt(x.trim());
    return isNaN(n) ? x.trim() : String(max - n + 1);
  }).join(', ');
}

/**
 * Інтелектуальний локатор. Знаходить точний об'єкт виходу та справжню назву колії.
 */
function resolveDirectionAndExit(slug, dir, wagon, doors) {
  const station = state.stationsData?.[slug];
  const exact   = EXACT_EXIT_MATCH_STATIONS.has(slug);
  let clickedExit = null;
  let correctedDir = dir;

  if (station?.directions) {
    const cleanedDir = cleanStr(dir);

    // Етап 1: Шукаємо вихід СУВОРО всередині вказаного напрямку
    if (cleanedDir !== '') {
      const targetDir = station.directions.find(d => cleanStr(d.from) === cleanedDir);
      if (targetDir) {
        clickedExit = (targetDir.exits || []).find(ex => exitContainsPin(ex, wagon, doors, exact));
        if (clickedExit) correctedDir = targetDir.from;
      }
    }

    // Етап 2: Фолбек-скан (якщо dir порожній через баг розмітки кінцевих)
    if (!clickedExit) {
      outerLoop: for (const d of station.directions) {
        if (norm(d.from) === '__long_transfer__') continue;
        const ex = (d.exits || []).find(e => exitContainsPin(e, wagon, doors, exact));
        if (ex) {
          clickedExit = ex;
          correctedDir = d.from;
          break outerLoop;
        }
      }
    }
  }
  return { clickedExit, correctedDir };
}

// ══ КЕШ ══════════════════════════════════════════════════════

let _checkinsCache = null;

export function invalidateCheckinsCache() {
  _checkinsCache = null;
}

export function getCheckins() {
  if (_checkinsCache) return _checkinsCache;
  try {
    _checkinsCache = JSON.parse(Storage.get(STORAGE_KEYS.CHECKINS) || '{}');
  } catch {
    _checkinsCache = {};
  }
  return _checkinsCache;
}

// ══ РЕЖИМ CHECK-IN ════════════════════════════════════════════

export function isCheckinMode() {
  return Storage.get(STORAGE_KEYS.CHECKIN_MODE) !== 'false';
}

// ══ ІДЕНТИФІКАТОР ════════════════════════════════════════════

export function checkinId(slug, dir, wagon, doors) {
  const cleanDir = String(dir || '').trim().toLowerCase().replace(/[\s\u00a0\u202f\u2009]+/g, ' ');
  return `${slug}|${cleanDir}|${String(wagon).trim()}|${String(doors).trim()}`;
}

/**
 * Повертає канонічний ключ «фізичного виходу» для піна (slug, dir, wagon, doors).
 *
 * Коли ввімкнено «Check-in по виходах» (CHECKIN_BY_EXIT), той самий фізичний
 * вихід доступний з обох колій станції — тож піни з протилежних напрямків,
 * що зіставляються між собою (за назвою, дзеркальним номером або індексом —
 * ЗА ТІЄЮ Ж логікою, що й у toggleCheckin), мають належати ОДНІЙ групі.
 * Ключ не залежить від того, з якого боку його порахували, тож його можна
 * однаково використовувати і для «відвіданих», і для «усіх доступних» пінів.
 *
 * Коли CHECKIN_BY_EXIT вимкнено — дзеркалювання не відбувається,
 * тож кожен пін лишається окремим виходом (як і раніше).
 */
export function exitGroupKey(slug, dir, wagon, doors) {
  const isByExit = Storage.get(STORAGE_KEYS.CHECKIN_BY_EXIT) !== 'false';
  if (!isByExit) return checkinId(slug, dir, wagon, doors);

  const station = state.stationsData?.[slug];
  const { clickedExit, correctedDir } = resolveDirectionAndExit(slug, dir, wagon, doors);
  if (!clickedExit || !station?.directions) return checkinId(slug, dir, wagon, doors);

  const exact        = EXACT_EXIT_MATCH_STATIONS.has(slug);
  const clickedLabel = norm(clickedExit.label || '');
  const sourceDir     = station.directions.find(d => d.from === correctedDir);
  const sourceIndex   = sourceDir ? (sourceDir.exits || []).indexOf(clickedExit) : -1;
  const mW = mirrorValue(wagon, 5);
  const mD = mirrorValue(doors, 4);

  const members = [];
  for (const d of station.directions) {
    if (norm(d.from) === '__long_transfer__') continue;

    let targetExit = null;
    if (d.from === correctedDir) {
      targetExit = clickedExit;
    } else {
      if (!targetExit && clickedLabel !== '') {
        targetExit = (d.exits || []).find(ex => norm(ex.label || '') === clickedLabel);
      }
      if (!targetExit) {
        targetExit = (d.exits || []).find(ex => exitContainsPin(ex, mW, mD, exact));
      }
      if (!targetExit && sourceIndex !== -1) {
        targetExit = (d.exits || [])[sourceIndex];
      }
    }

    const firstOpen = targetExit ? (targetExit.positions || []).find(p => !p.closed) : null;
    if (firstOpen) members.push(`${d.from}\u0001${firstOpen.wagon}\u0001${firstOpen.doors}`);
  }

  members.sort();
  return members.length ? `${slug}\u0002${members.join('\u0003')}` : checkinId(slug, dir, wagon, doors);
}

// ══ ЧИТАННЯ СТАНУ ════════════════════════════════════════════

export function isCheckedIn(slug, dir, wagon, doors) {
  const { correctedDir } = resolveDirectionAndExit(slug, dir, wagon, doors);
  return !!getCheckins()[checkinId(slug, correctedDir, wagon, doors)];
}

// ══ МУТАЦІЯ СТАНУ (УЛЬТИМАТИВНА КАСКАДНА СИНХРОНІЗАЦІЯ) ══════

export function toggleCheckin(slug, dir, wagon, doors, lineColor) {
  const all      = getCheckins();
  const isByExit = Storage.get(STORAGE_KEYS.CHECKIN_BY_EXIT) !== 'false';
  const station  = state.stationsData?.[slug];
  const exact    = EXACT_EXIT_MATCH_STATIONS.has(slug);

  const { clickedExit, correctedDir } = resolveDirectionAndExit(slug, dir, wagon, doors);

  const targets = new Map();
  const addPin = (d, w, drs) => {
    const key = `${norm(d)}\0${String(w).trim()}\0${String(drs).trim()}`;
    if (!targets.has(key)) {
      targets.set(key, { dir: d, wagon: String(w).trim(), doors: String(drs).trim() });
    }
  };

  if (isByExit && clickedExit && station?.directions) {
    const clickedLabel = norm(clickedExit.label || '');
    const sourceDir    = station.directions.find(d => d.from === correctedDir);
    const sourceIndex  = sourceDir ? (sourceDir.exits || []).indexOf(clickedExit) : -1;

    // Рахуємо математичне дзеркало для підстраховки
    const mW = mirrorValue(wagon, 5);
    const mD = mirrorValue(doors, 4);

    for (const d of station.directions) {
      if (norm(d.from) === '__long_transfer__') continue;

      let targetExit = null;

      // Якщо це ТА САМА колія — підсвічуємо весь блок клікнутого виходу
      if (d.from === correctedDir) {
        targetExit = clickedExit;
      } else {
        // КАСКАД ДЗЕРКАЛ ДЛЯ ПРОТИЛЕЖНОЇ КОЛІЇ:

        // 1. Label Sync (Шукаємо таку саму назву, наприклад "до Мінського ринку")
        if (!targetExit && clickedLabel !== '') {
          targetExit = (d.exits || []).find(ex => norm(ex.label || '') === clickedLabel);
        }

        // 2. Math Sync (Шукаємо математичне дзеркало 6-W, 5-D, якщо немає назви)
        if (!targetExit) {
          targetExit = (d.exits || []).find(ex => exitContainsPin(ex, mW, mD, exact));
        }

        // 3. Index Sync (Резервний варіант для станцій з одним виходом)
        if (!targetExit && sourceIndex !== -1) {
          targetExit = (d.exits || [])[sourceIndex];
        }
      }

      if (targetExit && targetExit.positions) {
        for (const p of targetExit.positions) {
          if (!p.closed) addPin(d.from, p.wagon, p.doors);
        }
      }
    }
  }

  // Завжди додаємо первинний клікнутий елемент як надійний фолбек
  addPin(correctedDir, wagon, doors);

  const primaryId   = checkinId(slug, correctedDir, wagon, doors);
  const willCheckIn = !all[primaryId];

  // Транзакція в базу
  for (const t of targets.values()) {
    const tId = checkinId(slug, t.dir, t.wagon, t.doors);
    if (willCheckIn) {
      all[tId] = { slug, dir: t.dir, wagon: t.wagon, doors: t.doors, color: lineColor, ts: Date.now() };
    } else {
      delete all[tId];
    }
  }

  Storage.set(STORAGE_KEYS.CHECKINS, JSON.stringify(all));
  _checkinsCache = all;

  bus.emit('checkin:updated');
  return willCheckIn;
}

// ══ ФОРМАТУВАННЯ ЧАСУ ════════════════════════════════════════

export function formatCheckinTime(ts) {
  const d   = new Date(ts);
  const pad = n => String(n).padStart(2, '0');
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ══ ВІДМІНЮВАННЯ ІМЕННИКІВ ════════════════════════════════════

export function stationWord(n) {
  const mod10  = Math.abs(n) % 10;
  const mod100 = Math.abs(n) % 100;
  if (mod100 >= 11 && mod100 <= 14) return 'станцій';
  if (mod10 === 1)                   return 'станція';
  if (mod10 >= 2 && mod10 <= 4)     return 'станції';
  return 'станцій';
}

export function exitWord(n) {
  const mod10  = Math.abs(n) % 10;
  const mod100 = Math.abs(n) % 100;
  if (mod100 >= 11 && mod100 <= 14) return 'виходів';
  if (mod10 === 1)                   return 'вихід';
  if (mod10 >= 2 && mod10 <= 4)     return 'виходи';
  return 'виходів';
}

export function declineStantsiya(n) { return `${n} ${stationWord(n)}`; }
export function declineVykhid(n) { return `${n} ${exitWord(n)}`; }

// ══ СТАТИСТКА ПО ГІЛКАХ ══════════════════════════════════════

/**
 * Рахує загальну кількість фізичних виходів станції (з урахуванням
 * дзеркалювання при активному Check-in по виходах) та кількість
 * фактично відвіданих із них.
 *
 * @param {string} slug
 * @param {object[]} entries — усі записи check-in (Object.values(getCheckins()))
 * @returns {{ total: number, visited: number }}
 */
export function getStationExitStats(slug, entries) {
  const station = state.stationsData?.[slug];
  if (!station?.directions) return { total: 0, visited: 0 };

  const totalKeys = new Set();
  for (const d of station.directions) {
    if (norm(d.from) === '__long_transfer__') continue;
    for (const ex of (d.exits || [])) {
      for (const p of (ex.positions || [])) {
        if (p.closed) continue;
        totalKeys.add(exitGroupKey(slug, d.from, p.wagon, p.doors));
      }
    }
  }

  const visitedKeys = new Set();
  for (const e of entries) {
    if (e.slug !== slug) continue;
    visitedKeys.add(exitGroupKey(slug, e.dir, e.wagon, e.doors));
  }

  return { total: totalKeys.size, visited: visitedKeys.size };
}

export function buildLineStats(entries) {
  const lineStats = {};
  for (const line of LINE_ORDER) {
    lineStats[line] = { totalStations: 0, visitedStations: 0, totalExits: 0, visitedExits: 0 };
  }
  if (!state.stationsData) return lineStats;

  const visitedSlugs = new Set(entries.map(e => e.slug));

  for (const [slug, st] of Object.entries(state.stationsData)) {
    const line = st.line;
    if (!lineStats[line]) continue;

    const { total, visited } = getStationExitStats(slug, entries);
    lineStats[line].totalStations++;
    lineStats[line].totalExits  += total;
    lineStats[line].visitedExits += visited;

    if (visitedSlugs.has(slug)) lineStats[line].visitedStations++;
  }
  return lineStats;
}