// ══ DOMAIN: CHECK-IN — ЧИСТА БІЗНЕС-ЛОГІКА ══
// Відповідальність: управління даними відвідань (check-in),
// відмінювання іменників, статистика по гілках.
// ПРАВИЛО: жодного DOM, жодних UI-функцій.
// Крос-модульні сигнали — виключно через EventBus.
//
// Публічне API:
//   getCheckins()                         → Record<string, CheckinEntry>
//   invalidateCheckinsCache()             → void
//   isCheckinMode()                       → boolean
//   checkinId(slug, dir, wagon, doors)    → string
//   isCheckedIn(slug, dir, wagon, doors)  → boolean
//   toggleCheckin(slug, dir, wagon, doors, lineColor) → boolean  (emits 'checkin:updated')
//   formatCheckinTime(ts)                 → string
//   stationWord(n)                        → string
//   exitWord(n)                           → string
//   declineStantsiya(n)                   → string
//   declineVykhid(n)                      → string
//   buildLineStats(entries)               → LineStats
//   LINE_NAMES                            → Record<string, string>
//   LINE_ORDER                            → string[]

import { state }                from '../core/state.js';
import { STORAGE_KEYS, Storage } from '../core/storage.js';
import { bus }                   from '../core/eventBus.js';

// ══ КОНСТАНТИ ГІЛОК (використовуються також у features/checkin) ══

export const LINE_NAMES = { blue: 'Синя', red: 'Червона', green: 'Зелена' };
export const LINE_ORDER = ['blue', 'red', 'green'];

// ══ КЕШ ══════════════════════════════════════════════════════

let _checkinsCache = null;

/** Скидає кеш check-in (наприклад, після зовнішніх змін Storage). */
export function invalidateCheckinsCache() {
  _checkinsCache = null;
}

/**
 * Повертає об'єкт усіх check-in з кешу або Storage.
 * Ключ — результат checkinId(), значення — CheckinEntry.
 * @returns {Record<string, {slug:string, dir:string, wagon:string, doors:string, color:string, ts:number}>}
 */
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

/**
 * Повертає true, якщо режим Check-in активований у налаштуваннях.
 * Вимкнено за замовчуванням (null → false).
 * @returns {boolean}
 */
export function isCheckinMode() {
  return Storage.get(STORAGE_KEYS.CHECKIN_MODE) === 'true';
}

// ══ ІДЕНТИФІКАТОР ════════════════════════════════════════════

/**
 * Формує унікальний ключ для запису check-in.
 * Автоматично нормалізує регістр та пробіли напрямку для уникнення конфліктів з DOM-капітеллю.
 * @returns {string}
 */
export function checkinId(slug, dir, wagon, doors) {
  const cleanDir = String(dir || '').trim().toLowerCase().replace(/\s+/g, ' ');
  return `${slug}|${cleanDir}|${String(wagon).trim()}|${String(doors).trim()}`;
}

// ══ ЧИТАННЯ СТАНУ ════════════════════════════════════════════

/**
 * Перевіряє, чи позначений вихід як відвіданий.
 * @returns {boolean}
 */
export function isCheckedIn(slug, dir, wagon, doors) {
  return !!getCheckins()[checkinId(slug, dir, wagon, doors)];
}

// ══ МУТАЦІЯ ══════════════════════════════════════════════════

/**
 * Додає або видаляє запис check-in. Зберігає в Storage.
 * Після зміни емітує 'checkin:updated' — features/checkin/index.js
 * підписується і оновлює dock-іконку та heatmap карти.
 *
 * @param {string}  slug
 * @param {string}  dir
 * @param {string}  wagon
 * @param {string}  doors
 * @param {string}  lineColor — колір гілки (зберігається в записі для heatmap)
 * @returns {boolean} — true якщо вихід тепер позначений як відвіданий
 */



export function toggleCheckin(slug, dir, wagon, doors, lineColor) {
  const id  = checkinId(slug, dir, wagon, doors);
  const all = getCheckins();
  const isByExit = Storage.get(STORAGE_KEYS.CHECKIN_BY_EXIT) !== 'false';

  const willCheckIn = !all[id];
  const targets = [];

  const normalizeStr = (str) => String(str || '').trim().toLowerCase().replace(/\s+/g, ' ');

  const parseTokens = (s) => {
    if (String(s).includes('-')) {
      const [start, end] = String(s).split('-').map(Number);
      const arr = [];
      for (let i = start; i <= end; i++) arr.push(i);
      return arr;
    }
    return String(s).split(',').map(x => parseInt(x.trim())).filter(Boolean);
  };

  const matchMirror = (w1, d1, w2, d2) => {
    const mW = parseTokens(w1).map(w => 6 - w).sort();
    const mD = parseTokens(d1).map(d => 5 - d).sort();
    const pW = parseTokens(w2).sort();
    const pD = parseTokens(d2).sort();
    return JSON.stringify(mW) === JSON.stringify(pW) && JSON.stringify(mD) === JSON.stringify(pD);
  };

  const station = state.stationsData?.[slug];
  // Оголошуємо змінні на рівні функції, щоб вони були доступні нижче по коду
  let sourceDirIdx = -1;
  let sourceExitIdx = -1;

  if (isByExit && station?.directions) {
    // ПЕРЕВІРКА НА ОДИН ВИХІД: якщо в кожному напрямку є строго по 1 блоку виходу
    const isSingleExitStation = station.directions.every(d => (d.exits || []).length === 1);

    if (isSingleExitStation) {
      // ПРОСТИЙ ШЛЯХ: без жодних розрахунків копіюємо чекін на всі піни цієї станції
      station.directions.forEach(d => {
        (d.exits[0]?.positions || []).forEach(p => {
          targets.push({ dir: d.from, wagon: String(p.wagon), doors: String(p.doors) });
        });
      });
    } else {
      // СКЛАДНИЙ ШЛЯХ (Хрещатик): перевикористовуємо змінні без повторного let
      sourceDirIdx = -1;
      sourceExitIdx = -1;

      for (let dIdx = 0; dIdx < station.directions.length; dIdx++) {
        const d = station.directions[dIdx];
        if (normalizeStr(d.from) === normalizeStr(dir)) {
          for (let eIdx = 0; eIdx < d.exits.length; eIdx++) {
            const ex = d.exits[eIdx];
            const hasPos = ex.positions?.some(p => 
              String(p.wagon).trim() === String(wagon).trim() &&
              String(p.doors).trim() === String(doors).trim()
            );
            if (hasPos) {
              sourceDirIdx = dIdx;
              sourceExitIdx = eIdx;
              break;
            }
          }
        }
        if (sourceExitIdx !== -1) break;
      }

      if (sourceExitIdx !== -1) {
        const sourceExit = station.directions[sourceDirIdx].exits[sourceExitIdx];
        const sourceExitPositions = sourceExit.positions || [];
        const matchedExits = [];

        station.directions.forEach((d, dIdx) => {
          d.exits.forEach((ex, eIdx) => {
            let isMatch = false;

            if (dIdx === sourceDirIdx && eIdx === sourceExitIdx) {
              isMatch = true;
            } else if (sourceExit.label && ex.label && normalizeStr(sourceExit.label) === normalizeStr(ex.label)) {
              isMatch = true;
            } else if (eIdx === sourceExitIdx && station.directions[sourceDirIdx].from !== '__long_transfer__' && d.from !== '__long_transfer__') {
              isMatch = true;
            } else {
              isMatch = (ex.positions || []).some(p2 => 
                sourceExitPositions.some(p1 => matchMirror(p1.wagon, p1.doors, p2.wagon, p2.doors))
              );
            }

            if (isMatch) {
              matchedExits.push({ dirFrom: d.from, exitsBlock: ex });
            }
          });
        });

        matchedExits.forEach(item => {
          (item.exitsBlock.positions || []).forEach(p => {
            const alreadyAdded = targets.some(t =>
              normalizeStr(t.dir) === normalizeStr(item.dirFrom) &&
              String(t.wagon).trim() === String(p.wagon).trim() &&
              String(t.doors).trim() === String(p.doors).trim()
            );
            if (!alreadyAdded) {
              targets.push({ dir: item.dirFrom, wagon: String(p.wagon), doors: String(p.doors) });
            }
          });
        });
      }
    }
  }

  // Крок 2: Збираємо всі пов'язані блоки виходів по всій станції
  if (isByExit && sourceExitIdx !== -1) {
    const sourceExit = station.directions[sourceDirIdx].exits[sourceExitIdx];
    const sourceExitPositions = sourceExit.positions || [];
    const matchedExits = [];

    station.directions.forEach((d, dIdx) => {
      d.exits.forEach((ex, eIdx) => {
        let isMatch = false;

        if (dIdx === sourceDirIdx && eIdx === sourceExitIdx) {
          isMatch = true;
        } else if (sourceExit.label && ex.label && normalizeStr(sourceExit.label) === normalizeStr(ex.label)) {
          isMatch = true;
        } else if (eIdx === sourceExitIdx && station.directions[sourceDirIdx].from !== '__long_transfer__' && d.from !== '__long_transfer__') {
          // Збіг індексів для головних виходів без текстових назв (як на Хрещатику)
          isMatch = true;
        } else {
          // Збіг по геометричному дзеркалу платформ
          isMatch = (ex.positions || []).some(p2 => 
            sourceExitPositions.some(p1 => matchMirror(p1.wagon, p1.doors, p2.wagon, p2.doors))
          );
        }

        if (isMatch) {
          matchedExits.push({ dirFrom: d.from, exitsBlock: ex });
        }
      });
    });

    // Розгортаємо знайдені блоки у плоский список на чекін
    matchedExits.forEach(item => {
      (item.exitsBlock.positions || []).forEach(p => {
        const alreadyAdded = targets.some(t =>
          normalizeStr(t.dir) === normalizeStr(item.dirFrom) &&
          String(t.wagon).trim() === String(p.wagon).trim() &&
          String(t.doors).trim() === String(p.doors).trim()
        );
        if (!alreadyAdded) {
          targets.push({ dir: item.dirFrom, wagon: String(p.wagon), doors: String(p.doors) });
        }
      });
    });
  }

  // Гарантований фолбек: якщо налаштування вимкнено — маркуємо тільки один клікнутий пін
  if (!targets.some(t => normalizeStr(t.dir) === normalizeStr(dir) && String(t.wagon).trim() === String(wagon).trim() && String(t.doors).trim() === String(doors).trim())) {
    targets.push({ dir, wagon, doors });
  }

  // Застосовуємо єдиний стан (вкл/викл) для всього пулу цільових точок
  targets.forEach(t => {
    const tId = checkinId(slug, t.dir, t.wagon, t.doors);
    if (willCheckIn) {
      all[tId] = { slug, dir: t.dir, wagon: t.wagon, doors: t.doors, color: lineColor, ts: Date.now() };
    } else {
      delete all[tId];
    }
  });

  Storage.set(STORAGE_KEYS.CHECKINS, JSON.stringify(all));
  _checkinsCache = all;

  bus.emit('checkin:updated');
  return willCheckIn;
}

// ══ ФОРМАТУВАННЯ ЧАСУ ════════════════════════════════════════

/**
 * Форматує Unix-timestamp у рядок виду "ДД.ММ ГГ:ХХ".
 * @param {number} ts
 * @returns {string}
 */
export function formatCheckinTime(ts) {
  const d   = new Date(ts);
  const pad = n => String(n).padStart(2, '0');
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ══ ВІДМІНЮВАННЯ ІМЕННИКІВ ════════════════════════════════════

/**
 * Повертає відмінену форму слова «станція» для числа n.
 * @param {number} n
 * @returns {string}
 */
export function stationWord(n) {
  const mod10  = Math.abs(n) % 10;
  const mod100 = Math.abs(n) % 100;
  if (mod100 >= 11 && mod100 <= 14) return 'станцій';
  if (mod10 === 1)                   return 'станція';
  if (mod10 >= 2 && mod10 <= 4)     return 'станції';
  return 'станцій';
}

/**
 * Повертає відмінену форму слова «вихід» для числа n.
 * @param {number} n
 * @returns {string}
 */
export function exitWord(n) {
  const mod10  = Math.abs(n) % 10;
  const mod100 = Math.abs(n) % 100;
  if (mod100 >= 11 && mod100 <= 14) return 'виходів';
  if (mod10 === 1)                   return 'вихід';
  if (mod10 >= 2 && mod10 <= 4)     return 'виходи';
  return 'виходів';
}

/**
 * Повертає рядок «N станція/станції/станцій».
 * @param {number} n
 * @returns {string}
 */
export function declineStantsiya(n) {
  return `${n} ${stationWord(n)}`;
}

/**
 * Повертає рядок «N вихід/виходи/виходів».
 * @param {number} n
 * @returns {string}
 */
export function declineVykhid(n) {
  return `${n} ${exitWord(n)}`;
}

// ══ СТАТИСТИКА ПО ГІЛКАХ ══════════════════════════════════════

/**
 * @typedef {{
 *   totalStations:   number,
 *   visitedStations: number,
 *   totalExits:      number,
 *   visitedExits:    number,
 * }} LineStatEntry
 *
 * @typedef {Record<string, LineStatEntry>} LineStats
 */

/**
 * Обчислює статистику відвідань по кожній гілці метро.
 * Чиста функція — читає state.stationsData, не торкається DOM.
 *
 * @param {Array<{slug:string, wagon:string, doors:string}>} entries
 *   Масив значень з getCheckins() (Object.values).
 * @returns {LineStats}
 */
export function buildLineStats(entries) {
  /** @type {LineStats} */
  const lineStats = {};

  for (const line of LINE_ORDER) {
    lineStats[line] = {
      totalStations:   0,
      visitedStations: 0,
      totalExits:      0,
      visitedExits:    0,
    };
  }

  if (!state.stationsData) return lineStats;

  // Будуємо індекс відвіданих виходів по slug для швидкого lookup
  /** @type {Record<string, Set<string>>} */
  const visitedBySlug = {};
  for (const e of entries) {
    if (!visitedBySlug[e.slug]) visitedBySlug[e.slug] = new Set();
    visitedBySlug[e.slug].add(`${e.wagon}|${e.doors}`);
  }

  for (const [slug, st] of Object.entries(state.stationsData)) {
    const line = st.line;
    if (!lineStats[line]) continue;

    const openExits = st.positions?.filter(p => !p.closed) ?? [];
    lineStats[line].totalStations++;
    lineStats[line].totalExits += openExits.length;

    const visited = visitedBySlug[slug];
    if (visited) {
      lineStats[line].visitedStations++;
      for (const p of openExits) {
        if (visited.has(`${p.wagon}|${p.doors}`)) {
          lineStats[line].visitedExits++;
        }
      }
    }
  }

  return lineStats;
}