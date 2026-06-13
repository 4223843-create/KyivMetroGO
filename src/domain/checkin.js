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
 * @returns {string}
 */
export function checkinId(slug, dir, wagon, doors) {
  return `${slug}|${dir}|${wagon}|${doors}`;
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

  if (all[id]) {
    delete all[id];
  } else {
    all[id] = { slug, dir, wagon, doors, color: lineColor, ts: Date.now() };
  }

  Storage.set(STORAGE_KEYS.CHECKINS, JSON.stringify(all));
  _checkinsCache = all;

  // UI-шар підписаний через bus.on('checkin:updated'):
  //   features/checkin/index.js → updateCheckinDock() + bus.emit('map:sync-checkins')
  bus.emit('checkin:updated');

  return !!all[id];
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