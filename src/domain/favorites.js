// ══ DOMAIN: ОБРАНЕ — ЧИСТА БІЗНЕС-ЛОГІКА ══
// Відповідальність: зберігання та управління Обраними станціями та виходами.
// ПРАВИЛО: жодного DOM, жодних UI-функцій.
// Крос-модульні сигнали — виключно через EventBus.
//
// Публічне API:
//   getFavs()                                    → string[]
//   saveFavs(arr)                                → void
//   isFav(slug)                                  → boolean
//   toggleFav(slug)                              → boolean
//   getExitFavs()                                → ExitFav[]
//   exitFavId(slug, pos)                         → string
//   isExitFav(slug, pos)                         → boolean   (pos — id позиції)
//   toggleExitFav(slug, pos)                     → ToggleResult
//   replaceExitFav(slug, existing, newPos)       → { status: 'replaced' }

import { STORAGE_KEYS, Storage } from '../core/storage.js';
import { bus }                   from '../core/eventBus.js';
import { state }                 from '../core/state.js';
import { findPosition, displayDirOf } from '../data/positions.js';
import { matchLegacyPosition }   from '../data/legacyExitMatch.js';

// ══ КЕШ ОБРАНИХ СТАНЦІЙ ══════════════════════════════════════

let _favCache = null;

function _readFavCache() {
  if (_favCache) return _favCache;
  try {
    _favCache = JSON.parse(Storage.get(STORAGE_KEYS.FAVS) || '[]');
  } catch (e) {
    console.warn('[domain/favorites] Помилка парсингу Обраних:', e);
    _favCache = [];
  }
  return _favCache;
}

/**
 * Повертає копію масиву slug обраних станцій.
 * @returns {string[]}
 */
export function getFavs() {
  return [..._readFavCache()];
}

/**
 * Зберігає масив slug обраних станцій у Storage та кеш.
 * Не емітує подій — викликається там, де зміна вже відома.
 * @param {string[]} arr
 */
export function saveFavs(arr) {
  _favCache = [...arr];
  Storage.set(STORAGE_KEYS.FAVS, JSON.stringify(_favCache));
}

/**
 * Перевіряє, чи є станція в Обраному.
 * @param {string} slug
 * @returns {boolean}
 */
export const isFav = slug => _readFavCache().includes(slug);

/**
 * Додає або видаляє станцію з Обраного.
 * Після зміни емітує 'fav:updated' для оновлення UI-шару.
 * @param {string} slug
 * @returns {boolean} — true якщо станція тепер у Обраному
 */
export function toggleFav(slug) {
  let favs = getFavs();
  const removing = favs.includes(slug);
  favs = removing
    ? favs.filter(s => s !== slug)
    : [...favs, slug];
  saveFavs(favs);

  // Станцію прибрали з Обраного — прибираємо й її збережені виходи,
  // інакше пілюлі лишаються зафарбованими, а станції в Обраному вже немає.
  if (removing) {
    const exits = _readExitFavCache();
    if (exits.some(f => f.slug === slug)) {
      _exitFavCache = exits.filter(f => f.slug !== slug);
      Storage.set(STORAGE_KEYS.EXIT_FAVS, JSON.stringify(_exitFavCache));
      bus.emit('station:refresh');
    }
  }

  bus.emit('fav:updated');
  return favs.includes(slug);
}

// ══ КЕШ ОБРАНИХ ВИХОДІВ ══════════════════════════════════════
// Запис: { id: «slug|id позиції», slug, pos, dir, wagon, doors }.
// Ідентичність — лише slug + pos (id позиції зі stations.json); dir/wagon/doors —
// знімок для показу, якщо позиції вже немає в даних. Зберігаються «як є»,
// а getExitFavs() підставляє актуальні значення з даних.

let _exitFavCache = null;

function _readExitFavCache() {
  if (_exitFavCache) return _exitFavCache;
  try {
    _exitFavCache = JSON.parse(Storage.get(STORAGE_KEYS.EXIT_FAVS) || '[]');
  } catch (e) {
    console.warn('[domain/favorites] Помилка парсингу Обраних виходів:', e);
    _exitFavCache = [];
  }
  return _exitFavCache;
}

function _writeExitFavs(favs) {
  _exitFavCache = favs;
  Storage.set(STORAGE_KEYS.EXIT_FAVS, JSON.stringify(favs));
}

/** Очищує всі обрані виходи (і в сховищі, і в пам'яті). */
export function clearExitFavs() {
  _exitFavCache = [];
  Storage.remove(STORAGE_KEYS.EXIT_FAVS);
}

/** Позиція запису в поточних даних (з урахуванням локальних правок) або null. */
function _locate(slug, pos) {
  return pos ? findPosition(state.stationsData?.[slug], pos) : null;
}

/** Знімок для показу: напрямок, вагон і двері так, як їх видно в картці. */
function _snapshot(slug, pos) {
  const found = _locate(slug, pos);
  if (!found) return null;
  return {
    dir:   displayDirOf(found.dir),
    wagon: String(found.position.wagon),
    doors: String(found.position.doors),
  };
}

/** Ключ колії запису: «одна збережена позиція на станцію й напрямок». */
function _trackOf(fav) {
  const found = _locate(fav.slug, fav.pos);
  return found ? found.dir.from : `legacy:${fav.dir}`;
}

/**
 * Повертає копію масиву обраних виходів з актуальними вагоном/дверима/напрямком.
 * @returns {Array<{id:string, slug:string, pos:string, dir:string, wagon:string, doors:string}>}
 */
export function getExitFavs() {
  return _readExitFavCache().map(f => ({ ...f, ...(_snapshot(f.slug, f.pos) ?? {}) }));
}

/** Унікальний ідентифікатор обраного виходу. */
export function exitFavId(slug, pos) {
  return `${slug}|${pos}`;
}

/**
 * Перевіряє, чи є позиція в Обраному.
 * @param {string} slug
 * @param {string} pos — id позиції
 */
export function isExitFav(slug, pos) {
  return !!pos && _readExitFavCache().some(f => f.slug === slug && f.pos === pos);
}

/**
 * Додає або видаляє позицію з Обраного.
 * Якщо по цій станції/напрямку вже є інша — повертає статус 'replace'
 * без змін, щоб UI міг показати підтвердження.
 * При додаванні автоматично додає slug до головного Обраного.
 *
 * @returns {{ status: 'added'|'removed'|'replace'|'unknown', existing?: object }}
 */
export function toggleExitFav(slug, pos) {
  const snapshot = _snapshot(slug, pos);
  if (!snapshot) return { status: 'unknown' };

  const favs = _readExitFavCache();
  const idx  = favs.findIndex(f => f.slug === slug && f.pos === pos);

  if (idx >= 0) {
    favs.splice(idx, 1);
    _writeExitFavs(favs);
    return { status: 'removed' };
  }

  // Перевірка: по цій станції+напрямку вже є запис — пропонуємо замінити
  const track    = _locate(slug, pos).dir.from;
  const existing = favs.find(f => f.slug === slug && _trackOf(f) === track);
  if (existing) return { status: 'replace', existing };

  favs.push({ id: exitFavId(slug, pos), slug, pos, ...snapshot });
  _ensureStationFav(slug);
  _writeExitFavs(favs);
  bus.emit('fav:updated');
  return { status: 'added' };
}

/**
 * Замінює існуючий обраний вихід новим по тій самій станції та напрямку.
 * Після зміни емітує 'fav:updated' для оновлення UI-шару.
 *
 * @param {string} slug
 * @param {{ id: string }} existing — запис, який замінюємо
 * @param {string} newPos — id нової позиції
 * @returns {{ status: 'replaced' }}
 */
export function replaceExitFav(slug, existing, newPos) {
  const favs = _readExitFavCache().filter(f => f.id !== existing.id);
  const snapshot = _snapshot(slug, newPos);
  if (snapshot) favs.push({ id: exitFavId(slug, newPos), slug, pos: newPos, ...snapshot });
  _ensureStationFav(slug);
  _writeExitFavs(favs);
  bus.emit('fav:updated');
  return { status: 'replaced' };
}

function _ensureStationFav(slug) {
  const mainFavs = getFavs();
  if (!mainFavs.includes(slug)) {
    mainFavs.push(slug);
    saveFavs(mainFavs);
  }
}

// ══ ПЕРЕХІД ЗІ СТАРОГО ФОРМАТУ ═══════════════════════════════
// Раніше запис ідентифікувався текстом напрямку з картки + вагоном + дверима.
// Після завантаження даних зіставляємо такі записи з позиціями; ті, що не
// вдалося зіставити, лишаються як є (показуються зі збереженими значеннями).

bus.on('data:stations-hydrated', ({ stationsData }) => {
  const favs = _readExitFavCache();
  if (!favs.some(f => !f.pos)) return;
  let changed = false;
  const next = [];
  const seen = new Set();
  for (const f of favs) {
    if (f.pos) { next.push(f); seen.add(f.id); continue; }
    const pos = matchLegacyPosition(stationsData[f.slug], f);
    if (!pos) { next.push(f); continue; }
    changed = true;
    const id = exitFavId(f.slug, pos);
    if (seen.has(id)) continue;
    seen.add(id);
    next.push({ id, slug: f.slug, pos, dir: f.dir, wagon: f.wagon, doors: f.doors });
  }
  if (changed) _writeExitFavs(next);
});

// ══ СИНХРОНІЗАЦІЯ КЕШУ МІЖ ВКЛАДКАМИ ════════════════════════
// Оновлюємо тільки кеш (data-concerns), UI-реакцію делегуємо
// в features/favorites/index.js через bus.on('fav:externally-updated').

bus.on('storage:changed', ({ key }) => {
  if (key === STORAGE_KEYS.FAVS)           _favCache = null;
  else if (key === STORAGE_KEYS.EXIT_FAVS) _exitFavCache = null;
  else return;
  bus.emit('fav:externally-updated', { key });
});