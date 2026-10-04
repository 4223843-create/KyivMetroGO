// ══ DOMAIN: CHECK-IN — ЧИСТА БІЗНЕС-ЛОГІКА ══
// Відповідальність: управління даними відвідань (check-in),
// відмінювання іменників, статистика по гілках.
// ПРАВИЛО: жодного DOM, жодних UI-функцій.
// Крос-модульні сигнали — виключно через EventBus.

import { state }                from '../core/state.js';
import { STORAGE_KEYS, Storage } from '../core/storage.js';
import { getPref } from '../core/prefs.js';
import { bus }                   from '../core/eventBus.js';
import { traversePositions, findPosition, positionId, isLongTransferDir } from '../data/positions.js';
import { matchLegacyPosition }   from '../data/legacyExitMatch.js';

// ══ КОНСТАНТИ ГІЛОК ══════════════════════════════════════════

export const LINE_NAMES = { blue: 'Синя', red: 'Червона', green: 'Зелена' };
export const LINE_ORDER = ['blue', 'red', 'green'];

// ══ КЕШ ══════════════════════════════════════════════════════

let _checkinsCache = null;

export function invalidateCheckinsCache() {
  _checkinsCache = null;
}

// Чекіни змінили в іншій вкладці
bus.on('storage:changed', ({ key }) => {
  if (key !== STORAGE_KEYS.CHECKINS) return;
  _checkinsCache = null;
  bus.emit('station:refresh');
});

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
  return getPref('checkinMode');
}

// ══ ІДЕНТИФІКАТОР ════════════════════════════════════════════
// Запис чекіну: ключ «slug|id позиції», значення { slug, pos, dir, wagon, doors, color, ts }.
// Ідентичність — лише id позиції зі stations.json; dir/wagon/doors — знімок на
// момент чекіну (для журналу), на зіставлення не впливають.

export function checkinId(slug, pos) {
  return `${slug}|${pos}`;
}

/** Позиції довгого переходу й закриті — не окремі виходи, чекін на них не ставиться. */
const _isCountable = ({ dir, position }) => !isLongTransferDir(dir) && !position.closed;

/**
 * Канонічний ключ «фізичного виходу» для позиції.
 *
 * Коли ввімкнено «Check-in по виходах» (CHECKIN_BY_EXIT), той самий фізичний
 * вихід доступний з обох колій станції. У stations.json такі позиції посилаються
 * на той самий запис exits_catalog (однаковий exit.id), тож вони — одна група.
 * Коли CHECKIN_BY_EXIT вимкнено — кожна позиція є окремим виходом.
 */
export function exitGroupKey(slug, pos) {
  const isByExit = getPref('checkinByExit');
  const found    = findPosition(state.stationsData?.[slug], pos);
  if (isByExit && found?.exit.id && !isLongTransferDir(found.dir)) {
    return `${slug}|exit:${found.exit.id}`;
  }
  return checkinId(slug, pos);
}

// ══ ЧИТАННЯ СТАНУ ════════════════════════════════════════════

export function isCheckedIn(slug, pos) {
  return !!pos && !!getCheckins()[checkinId(slug, pos)];
}

// ══ МУТАЦІЯ СТАНУ ════════════════════════════════════════════

/**
 * Ставить або знімає чекін позиції. При «Check-in по виходах» — разом з
 * усіма відкритими позиціями того самого фізичного виходу на інших коліях.
 * @returns {boolean} true — чекін поставлено
 */
export function toggleCheckin(slug, pos, lineColor) {
  const all     = getCheckins();
  const station = state.stationsData?.[slug];
  const found   = findPosition(station, pos);
  if (!found) return false;

  const group   = exitGroupKey(slug, pos);
  const targets = [found];
  traversePositions(station, ctx => {
    if (ctx.position !== found.position && _isCountable(ctx)
        && exitGroupKey(slug, positionId(ctx.position)) === group) {
      targets.push(ctx);
    }
  });

  const willCheckIn = !all[checkinId(slug, pos)];
  const ts = Date.now();
  for (const { dir, position } of targets) {
    const id = positionId(position);
    if (willCheckIn) {
      all[checkinId(slug, id)] = {
        slug, pos: id, dir: dir.from,
        wagon: String(position.wagon), doors: String(position.doors),
        color: lineColor, ts,
      };
    } else {
      delete all[checkinId(slug, id)];
    }
  }

  Storage.set(STORAGE_KEYS.CHECKINS, JSON.stringify(all));
  _checkinsCache = all;

  bus.emit('checkin:updated');
  return willCheckIn;
}

// ══ ПЕРЕХІД ЗІ СТАРОГО ФОРМАТУ ═══════════════════════════════
// Раніше ключем був «slug|напрямок|вагон|двері». Після завантаження даних
// зіставляємо такі записи з позиціями; незіставлені лишаються як є (станція
// рахується відвіданою, але вихід — ні).

bus.on('data:stations-hydrated', ({ stationsData }) => {
  const all = getCheckins();
  const legacy = Object.entries(all).filter(([, e]) => e && !e.pos);
  if (!legacy.length) return;
  let changed = false;
  for (const [key, entry] of legacy) {
    const pos = matchLegacyPosition(stationsData[entry.slug], entry);
    if (!pos) continue;
    delete all[key];
    const newKey = checkinId(entry.slug, pos);
    if (!all[newKey] || (all[newKey].ts ?? 0) < (entry.ts ?? 0)) all[newKey] = { ...entry, pos };
    changed = true;
  }
  if (!changed) return;
  Storage.set(STORAGE_KEYS.CHECKINS, JSON.stringify(all));
  _checkinsCache = all;
});

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
 * Рахує загальну кількість фізичних виходів станції (при активному Check-in
 * по виходах позиції з однаковим exit.id — один вихід) та кількість
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
  traversePositions(station, ctx => {
    if (_isCountable(ctx)) totalKeys.add(exitGroupKey(slug, positionId(ctx.position)));
  });

  const visitedKeys = new Set();
  for (const e of entries) {
    if (e.slug !== slug || !e.pos) continue;
    const key = exitGroupKey(slug, e.pos);
    if (totalKeys.has(key)) visitedKeys.add(key);
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