import { STORAGE_KEYS, Storage } from '../core/storage.js';
import { bus }                   from '../core/eventBus.js';

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
  favs = favs.includes(slug)
    ? favs.filter(s => s !== slug)
    : [...favs, slug];
  saveFavs(favs);
  bus.emit('fav:updated');
  return favs.includes(slug);
}

// ══ КЕШ ОБРАНИХ ВИХОДІВ ══════════════════════════════════════

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

/**
 * Повертає копію масиву обраних виходів.
 * @returns {Array<{id:string, slug:string, dir:string, wagon:string, doors:string}>}
 */
export function getExitFavs() {
  return [..._readExitFavCache()];
}

/**
 * Формує унікальний ідентифікатор обраного виходу.
 * @returns {string}
 */
export function exitFavId(slug, dir, wagon, doors) {
  return `${slug}|${dir}|${wagon}|${doors}`;
}

/**
 * Перевіряє, чи є вихід в Обраному.
 * @returns {boolean}
 */
export function isExitFav(slug, dir, wagon, doors) {
  const id = exitFavId(slug, dir, wagon, doors);
  return _readExitFavCache().some(f => f.id === id);
}

/**
 * Додає або видаляє вихід з Обраного.
 * Якщо по цій станції/напрямку вже є інший вихід — повертає статус 'replace'
 * без змін, щоб UI міг показати підтвердження.
 * При додаванні автоматично додає slug до головного Обраного.
 *
 * @returns {{ status: 'added'|'removed'|'replace', existing?: object }}
 */
export function toggleExitFav(slug, dir, wagon, doors) {
  const favs = _readExitFavCache();
  const id   = exitFavId(slug, dir, wagon, doors);
  const idx  = favs.findIndex(f => f.id === id);

  if (idx >= 0) {
    favs.splice(idx, 1);
    Storage.set(STORAGE_KEYS.EXIT_FAVS, JSON.stringify(favs));
    return { status: 'removed' };
  }

  // Перевірка: по цій станції+напрямку вже є запис — пропонуємо замінити
  const slugDirFavs = favs.filter(f => f.slug === slug && f.dir === dir);
  if (slugDirFavs.length >= 1) {
    return { status: 'replace', existing: slugDirFavs[0] };
  }

  // Додаємо новий запис
  favs.push({ id, slug, dir, wagon, doors });

  // Якщо станція ще не в головному Обраному — додаємо
  const mainFavs = getFavs();
  if (!mainFavs.includes(slug)) {
    mainFavs.push(slug);
    saveFavs(mainFavs);
  }

  Storage.set(STORAGE_KEYS.EXIT_FAVS, JSON.stringify(favs));
  return { status: 'added' };
}

/**
 * Замінює існуючий обраний вихід новим по тій самій станції та напрямку.
 * Після зміни емітує 'fav:updated' для оновлення UI-шару.
 *
 * @returns {{ status: 'replaced' }}
 */
export function replaceExitFav(slug, dir, oldWagon, oldDoors, newWagon, newDoors) {
  const favs  = _readExitFavCache();
  const oldId = exitFavId(slug, dir, oldWagon, oldDoors);
  const idx   = favs.findIndex(f => f.id === oldId);
  if (idx >= 0) favs.splice(idx, 1);

  const newId = exitFavId(slug, dir, newWagon, newDoors);
  favs.push({ id: newId, slug, dir, wagon: newWagon, doors: newDoors });
  Storage.set(STORAGE_KEYS.EXIT_FAVS, JSON.stringify(favs));

  // Якщо станція ще не в головному Обраному — додаємо
  const mainFavs = getFavs();
  if (!mainFavs.includes(slug)) {
    mainFavs.push(slug);
    saveFavs(mainFavs);
  }

  bus.emit('fav:updated');
  return { status: 'replaced' };
}

// ══ СИНХРОНІЗАЦІЯ КЕШУ МІЖ ВКЛАДКАМИ ════════════════════════
// Оновлюємо тільки кеш (data-concerns), UI-реакцію делегуємо
// в features/favorites/index.js через bus.on('fav:externally-updated').

window.addEventListener('storage', e => {
  if (e.key === STORAGE_KEYS.FAVS) {
    try { _favCache = JSON.parse(e.newValue || '[]'); }
    catch { _favCache = []; }
    bus.emit('fav:externally-updated', { key: e.key });
  } else if (e.key === STORAGE_KEYS.EXIT_FAVS) {
    try { _exitFavCache = JSON.parse(e.newValue || '[]'); }
    catch { _exitFavCache = []; }
    bus.emit('fav:externally-updated', { key: e.key });
  }
});