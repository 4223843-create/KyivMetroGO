import Sortable       from 'sortablejs';
import { state }       from './state.js';
import { STORAGE_KEYS, Storage } from './storage.js';

const favSheet   = document.getElementById('favSheet');
const favBody    = document.getElementById('favBody');
const favClose   = document.getElementById('favClose');
const favBtn     = document.getElementById('favListBtn');
const sheetOverlay = document.getElementById('sheetOverlay');

// ══ ОБРАНІ СТАНЦІЇ ══
let favCache = null;

// Читає кеш без копіювання — для внутрішніх перевірок
function readFavCache() {
  if (!favCache) {
    try { favCache = JSON.parse(Storage.get(STORAGE_KEYS.FAVS) || '[]'); }
    catch (e) { console.warn('[KyivMetroGO] Помилка парсингу Обраних:', e); favCache = []; }
  }
  return favCache;
}

// Публічний API — завжди повертає копію, щоб зовнішній код не міг мутувати кеш
export function getFavs() {
  return [...readFavCache()];
}

export function saveFavs(arr) {
  favCache = [...arr];
  Storage.set(STORAGE_KEYS.FAVS, JSON.stringify(favCache));
}

export const isFav = slug => readFavCache().includes(slug);
export function toggleFav(slug) {
  let favs = getFavs();
  favs = favs.includes(slug) ? favs.filter(s => s !== slug) : [...favs, slug];
  saveFavs(favs);
  updateFavDock();
  return favs.includes(slug);
}

// ══ ОБРАНІ ВИХОДИ ══
let exitFavCache = null;

export function getExitFavs() {
  if (exitFavCache) return [...exitFavCache];
  try { exitFavCache = JSON.parse(Storage.get(STORAGE_KEYS.EXIT_FAVS) || '[]'); }
  catch (e) { console.warn('[KyivMetroGO] Помилка парсингу Обраних виходів:', e); exitFavCache = []; }
  return [...exitFavCache];
}

export function exitFavId(slug, dir, wagon, doors) { return `${slug}|${dir}|${wagon}|${doors}`; }

export function isExitFav(slug, dir, wagon, doors) {
  return getExitFavs().some(f => f.id === exitFavId(slug, dir, wagon, doors));
}

export function toggleExitFav(slug, dir, wagon, doors) {
  let favs = getExitFavs();
  const id  = exitFavId(slug, dir, wagon, doors);
  const idx = favs.findIndex(f => f.id === id);

  if (idx >= 0) {
    favs.splice(idx, 1);
    Storage.set(STORAGE_KEYS.EXIT_FAVS, JSON.stringify(favs));
    exitFavCache = [...favs];
    return { status: 'removed' };
  }

  const slugDirFavs = favs.filter(f => f.slug === slug && f.dir === dir);
  if (slugDirFavs.length >= 3) return { status: 'limit' };

  favs.push({ id, slug, dir, wagon, doors });

  let mainFavs = getFavs();
  if (!mainFavs.includes(slug)) { mainFavs.push(slug); saveFavs(mainFavs); }

  Storage.set(STORAGE_KEYS.EXIT_FAVS, JSON.stringify(favs));
  exitFavCache = [...favs];
  return { status: 'added' };
}

// ══ СИНХРОНІЗАЦІЯ ВКЛАДОК ══
window.addEventListener('storage', e => {
  if (e.key === STORAGE_KEYS.FAVS) {
    try { favCache = JSON.parse(e.newValue || '[]'); }
    catch { favCache = []; }
  } else if (e.key === STORAGE_KEYS.EXIT_FAVS) {
    try { exitFavCache = JSON.parse(e.newValue || '[]'); }
    catch { exitFavCache = []; }
  }
});

// ══ ПОРОЖНІЙ СТАН ══
export function getEmptyFavHtml() {
  const colors = ['var(--line-blue)', 'var(--line-red)', 'var(--line-green)'];
  const color  = colors[state.emptyFavColorIdx % colors.length];
  state.emptyFavColorIdx++;
  return `
    <div class="fav-empty-state">
      <p class="fav-empty-text-lg">
        Натисніть
        <svg viewBox="0 0 17 17" fill="${color}" class="fav-empty-heart">
          <path d="${MetroApp.Icons.heartOutlinePath}"></path>
        </svg> на картці станції, щоб зберегти її до Вибраного
      </p>
      <p class="fav-empty-text-lg">
        Збережіть потрібний вихід подвійним тапом по вагону і дверям
      </p>
    </div>`;
}

// ══ РЕНДЕР СПИСКУ ОБРАНОГО ══
export function renderFavList(favs) {
  if (!favs.length) { favBody.innerHTML = getEmptyFavHtml(); return; }

  const exitFavs   = getExitFavs();
  const items = [];

  favs.forEach(slug => {
    const s = state.stationsData?.[slug];
    if (!s) return;
    const stationExits = exitFavs.filter(f => f.slug === slug);
    if (!stationExits.length) {
      items.push({ slug, name: s.name, dir: '', color: MetroApp.LINE_COLOR[s.line], exits: [] });
    } else {
      const grouped = {};
      stationExits.forEach(e => { if (!grouped[e.dir]) grouped[e.dir] = []; grouped[e.dir].push(e); });
      Object.entries(grouped).forEach(([dir, eList]) => {
        items.push({ slug, name: s.name, dir, color: MetroApp.LINE_COLOR[s.line], exits: eList });
      });
    }
  });

  items.forEach(item => { item.rowId = `${item.slug}::${item.dir}`; });

  let savedOrder = [];
  try { savedOrder = JSON.parse(Storage.get(STORAGE_KEYS.FAV_ROWS_ORDER) || '[]'); }
  catch { savedOrder = []; }

  const getEffectiveIdx = item => {
    let idx = savedOrder.indexOf(item.rowId);
    if (idx !== -1) return idx;
    let siblingIdx = savedOrder.findIndex(id => id.startsWith(item.slug + '::'));
    return siblingIdx !== -1 ? siblingIdx + 0.5 : 99999;
  };

  items.sort((a, b) => {
    const va = getEffectiveIdx(a), vb = getEffectiveIdx(b);
    if (va === vb) return a.dir.localeCompare(b.dir);
    return va - vb;
  });

  const listHtml = items.map(item => {
    const displayName = MetroApp.FAV_DISPLAY_NAMES[item.slug] || item.name;

    let formattedDir = '';
    if (item.dir && item.dir !== 'undefined') {
      const lower = item.dir.toLowerCase().trim();
      if (lower === 'кінцева' || lower === 'вихід праворуч') {
        formattedDir = lower;
      } else if (lower.includes('довгий перехід')) {
        formattedDir = 'довгий перехід на Майдан Незалежності';
      } else {
        let stationName    = lower.replace(/^попередня\s+/, '');
        let formattedStation = MetroApp.properCase(stationName);
        if (item.exits.length > 1) {
          const fsLower = formattedStation.toLowerCase();
          formattedStation = MetroApp.DIR_SHORT_NAMES[fsLower] || formattedStation;
        }
        formattedDir = lower.startsWith('попередня') ? `попередня ${formattedStation}` : formattedStation;
      }
    }

    let squaresHtml = '';
    if (item.exits.length > 0) {
      const isCompact    = item.exits.length > 2;
      const containerClass = isCompact ? 'fav-exits-container fav-exits-compact' : 'fav-exits-container';
      const groupsHtml   = item.exits.map(f => `
        <div class="fav-exit-group">
          <div class="fav-pos-square" style="color:${item.color}">${f.wagon}</div>
          <div class="fav-pos-square" style="color:${item.color}">${f.doors}</div>
        </div>`).join('<div class="fav-exit-sep"></div>');
      squaresHtml = `<div class="${containerClass}">${groupsHtml}</div>`;
    }

    return `<div class="fav-item" data-slug="${item.slug}" data-row-id="${item.rowId}">
      <button class="fav-open-btn" data-slug="${item.slug}" style="border-left-color:${item.color}">
        <div class="fav-text-wrap">
          <span class="fav-station-name ${item.exits.length > 1 ? 'fav-small' : ''}">${displayName}</span>
          ${(formattedDir && item.exits.length > 0) ? `<span class="fav-dir-name ${item.exits.length > 1 ? 'fav-small-dir' : ''}">${formattedDir}</span>` : ''}
        </div>
        ${squaresHtml}
      </button>
      <div class="fav-drag-handle" aria-label="Перетягнути">⠿</div>
    </div>`;
  }).join('');

  favBody.innerHTML = listHtml;

  function saveOrder() {
    const rowIds   = [...favBody.querySelectorAll('.fav-item')].map(i => i.dataset.rowId).filter(Boolean);
    Storage.set(STORAGE_KEYS.FAV_ROWS_ORDER, JSON.stringify(rowIds));
    const domSlugs = [...new Set([...favBody.querySelectorAll('.fav-item')].map(i => i.dataset.slug).filter(Boolean))];
    // Захист від розсинхронізації DOM: якщо якась станція з favs не потрапила у DOM —
    // додаємо її в кінець, щоб не втратити.
    const missingSlugs = favs.filter(s => !domSlugs.includes(s));
    saveFavs([...domSlugs, ...missingSlugs]);
  }

  if (Sortable) {
    if (favBody._sortable) favBody._sortable.destroy();
    favBody._sortable = new Sortable(favBody, {
      draggable:     '.fav-item',
      handle:        '.fav-drag-handle',
      animation:     0,
      ghostClass:    'fav-ghost',
      dragClass:     'fav-dragging',
      fallbackOnBody: true,
      swapThreshold: 0.65,
      swap:          true,
      swapClass:     'fav-swap-highlight',
      forceFallback: true,
      onEnd:         saveOrder,
    });
  }
}

favBody.addEventListener('click', e => {
  const btn = e.target.closest('.fav-open-btn');
  if (btn?.dataset.slug) MetroApp.openStation?.(btn.dataset.slug);
});

// ══ ВІДКРИТТЯ / ЗАКРИТТЯ ══
export function openFavSheet() {
  MetroApp.pushSheetHistory(); // <--- ДОДАНО
  document.querySelectorAll('.station-sheet').forEach(el => el.classList.remove('sheet-open'));
  const favs = getFavs();
  if (!state.stationsData) favBody.innerHTML = `<p class="fav-empty-text">Дані ще завантажуються…</p>`;
  else if (!favs.length)   favBody.innerHTML = getEmptyFavHtml();
  else                     renderFavList(favs);
  favSheet.classList.add('sheet-open');
  sheetOverlay.classList.add('overlay-visible');
}

export function closeFavSheet() {
  MetroApp.animateSheetClose(favSheet, () => {
    favSheet.classList.remove('sheet-open');
    if (!document.getElementById('stationSheet').classList.contains('sheet-open'))
      sheetOverlay.classList.remove('overlay-visible');
  });
}

// Перемалювати обране після завантаження даних (викликається з stations.js)
MetroApp.renderFavOnLoad = () => {
  const favs = getFavs();
  if (!favs.length) favBody.innerHTML = getEmptyFavHtml();
  else renderFavList(favs);
};

// ══ DOCK-ІКОНКА ОБРАНОГО ══
export function updateFavDock() {
  const btn = document.getElementById('favListBtn');
  if (!btn) return;
  btn.innerHTML = getFavs().length > 0 ? MetroApp.Icons.dockHeartFilled : MetroApp.Icons.dockHeartEmpty;
}

// ══ EVENT LISTENERS ══
// Клік на favListBtn реєструється в main.js — тут не дублюємо
favClose.addEventListener('click', closeFavSheet);

// Кінематичний свайп
MetroApp.initKinematicSwipe(favSheet, favBody, closeFavSheet);