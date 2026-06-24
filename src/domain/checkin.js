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
  const cleanDir = String(dir || '').trim().toLowerCase().replace(/[\s\u00a0\u202f\u2009]+/g, ' ');
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
  const all      = getCheckins();
  const isByExit = Storage.get(STORAGE_KEYS.CHECKIN_BY_EXIT) !== 'false';

  const norm = (str) =>
    String(str || '').trim().toLowerCase().replace(/[\s\u00a0\u202f\u2009]+/g, ' ');

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

  /** Чи містить блок exits[eIdx] пін (wagon, doors)? */
  const exitContainsPin = (ex, w, d) =>
    (ex.positions || []).some(p => {
      const pW = parseTokens(p.wagon); const cW = parseTokens(w);
      const pD = parseTokens(p.doors); const cD = parseTokens(d);
      return cW.some(n => pW.includes(n)) && cD.some(n => pD.includes(n));
    });

  const id          = checkinId(slug, dir, wagon, doors);
  const willCheckIn = !all[id];

  // ── Збираємо всі піни, що мають бути перемикнуті ────────────────────────
  // targets — Set рядків вигляду "dir\0wagon\0doors", щоб уникнути дублів.
  // Використовуємо Map для фінального збору об'єктів.
  /** @type {Map<string, {dir:string, wagon:string, doors:string}>} */
  const targets = new Map();

  const addPin = (d, w, drs) => {
    const key = `${norm(d)}\0${String(w).trim()}\0${String(drs).trim()}`;
    if (!targets.has(key)) {
      targets.set(key, { dir: d, wagon: String(w).trim(), doors: String(drs).trim() });
    }
  };

  const station = state.stationsData?.[slug];

  if (isByExit && station?.directions) {
    // ── КРОК 1: Знаходимо напрямок і блок виходу клікнутого піна ───────────
    let sourceDirIdx  = -1;
    let sourceExitIdx = -1;
    let sourceLabel   = null; // нормалізований ex.label, або null

    outer: for (let dIdx = 0; dIdx < station.directions.length; dIdx++) {
      const d = station.directions[dIdx];
      if (norm(d.from) !== norm(dir)) continue;
      for (let eIdx = 0; eIdx < (d.exits || []).length; eIdx++) {
        if (exitContainsPin(d.exits[eIdx], wagon, doors)) {
          sourceDirIdx  = dIdx;
          sourceExitIdx = eIdx;
          sourceLabel   = d.exits[eIdx].label ? norm(d.exits[eIdx].label) : null;
          break outer;
        }
      }
    }

    if (sourceDirIdx !== -1) {
      // ── КРОК 2: Визначаємо режим синхронізації ──────────────────────────
      //
      // ПРАВИЛО 1 — «один-до-одного»:
      //   Кожен напрямок має рівно один вихід (exits.length === 1).
      //   Тоді будь-який клік синхронізує єдиний вихід з кожного напрямку.
      //   Покриває Вокзальну та будь-яку іншу станцію з одним виходом на напрямок.
      //
      // ПРАВИЛО 2 — «за підписом»:
      //   Хоча б один напрямок має більше одного виходу.
      //   Синхронізуємо лише ті виходи інших напрямків, у яких ex.label
      //   збігається з label клікнутого виходу (після нормалізації).
      //   Якщо у клікнутого виходу немає label — синхронізації немає,
      //   додаємо лише сам клікнутий пін.

      const allHaveOneExit = station.directions.every(d => (d.exits || []).length === 1);

      if (allHaveOneExit) {
        // Правило 1: беремо перший (і єдиний) вихід з кожного напрямку
        for (const d of station.directions) {
          const ex = d.exits[0];
          for (const p of (ex.positions || [])) {
            addPin(d.from, p.wagon, p.doors);
          }
        }
      } else if (sourceLabel) {
        // Правило 2: збираємо виходи з label === sourceLabel в усіх напрямках
        for (const d of station.directions) {
          for (const ex of (d.exits || [])) {
            if (ex.label && norm(ex.label) === sourceLabel) {
              for (const p of (ex.positions || [])) {
                addPin(d.from, p.wagon, p.doors);
              }
            }
          }
        }
      }
    }
  }

  // ── КРОК 3: Фолбек — гарантовано додаємо клікнутий пін ─────────────────
  // Спрацьовує якщо: isByExit вимкнено, станція без directions,
  // пін не знайдено в JSON, або Правило 2 без label.
  addPin(dir, wagon, doors);

  // ── КРОК 4: Атомарно записуємо або видаляємо всі зібрані піни ──────────
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