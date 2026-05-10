import Sortable        from 'sortablejs';
import { state }        from '../core/state.js';
import { STORAGE_KEYS, Storage } from '../core/storage.js';

const favSheet     = document.getElementById('favSheet');
const favBody      = document.getElementById('favBody');
const favClose     = document.getElementById('favClose');
const sheetOverlay = document.getElementById('sheetOverlay');

// ══ ОБРАНІ СТАНЦІЇ ══════════════════════════════════════════
let favCache = null;

function readFavCache() {
  if (!favCache) {
    try { favCache = JSON.parse(Storage.get(STORAGE_KEYS.FAVS) || '[]'); }
    catch (e) { console.warn('[KyivMetroGO] Помилка парсингу Обраних:', e); favCache = []; }
  }
  return favCache;
}

export function getFavs()     { return [...readFavCache()]; }
export function saveFavs(arr) { favCache = [...arr]; Storage.set(STORAGE_KEYS.FAVS, JSON.stringify(favCache)); }
export const isFav = slug => readFavCache().includes(slug);

export function toggleFav(slug) {
  let favs = getFavs();
  favs = favs.includes(slug) ? favs.filter(s => s !== slug) : [...favs, slug];
  saveFavs(favs);
  updateFavDock();
  return favs.includes(slug);
}

// ══ ОБРАНІ ВИХОДИ ═══════════════════════════════════════════
let exitFavCache = null;

function readExitFavCache() {
  if (exitFavCache) return exitFavCache;
  try { exitFavCache = JSON.parse(Storage.get(STORAGE_KEYS.EXIT_FAVS) || '[]'); }
  catch (e) { console.warn('[KyivMetroGO] Помилка парсингу Обраних виходів:', e); exitFavCache = []; }
  return exitFavCache;
}

export function getExitFavs() { return [...readExitFavCache()]; }
export function exitFavId(slug, dir, wagon, doors) { return `${slug}|${dir}|${wagon}|${doors}`; }

export function isExitFav(slug, dir, wagon, doors) {
  const id = exitFavId(slug, dir, wagon, doors);
  return readExitFavCache().some(f => f.id === id);
}

export function toggleExitFav(slug, dir, wagon, doors) {
  const favs = readExitFavCache();
  const id   = exitFavId(slug, dir, wagon, doors);
  const idx  = favs.findIndex(f => f.id === id);

  if (idx >= 0) {
    favs.splice(idx, 1);
    Storage.set(STORAGE_KEYS.EXIT_FAVS, JSON.stringify(favs));
    return { status: 'removed' };
  }

  const slugDirFavs = favs.filter(f => f.slug === slug && f.dir === dir);
  if (slugDirFavs.length >= 1) return { status: 'replace', existing: slugDirFavs[0] };

  favs.push({ id, slug, dir, wagon, doors });
  let mainFavs = getFavs();
  if (!mainFavs.includes(slug)) { mainFavs.push(slug); saveFavs(mainFavs); }
  Storage.set(STORAGE_KEYS.EXIT_FAVS, JSON.stringify(favs));
  return { status: 'added' };
}

export function replaceExitFav(slug, dir, oldWagon, oldDoors, newWagon, newDoors) {
  const favs  = readExitFavCache();
  const oldId = exitFavId(slug, dir, oldWagon, oldDoors);
  const idx   = favs.findIndex(f => f.id === oldId);
  if (idx >= 0) favs.splice(idx, 1);
  const newId = exitFavId(slug, dir, newWagon, newDoors);
  favs.push({ id: newId, slug, dir, wagon: newWagon, doors: newDoors });
  Storage.set(STORAGE_KEYS.EXIT_FAVS, JSON.stringify(favs));
  let mainFavs = getFavs();
  if (!mainFavs.includes(slug)) { mainFavs.push(slug); saveFavs(mainFavs); }
  updateFavDock();
  return { status: 'replaced' };
}

// ══ СИНХРОНІЗАЦІЯ ВКЛАДОК ════════════════════════════════════
window.addEventListener('storage', e => {
  if      (e.key === STORAGE_KEYS.FAVS)      { try { favCache     = JSON.parse(e.newValue || '[]'); } catch { favCache     = []; } }
  else if (e.key === STORAGE_KEYS.EXIT_FAVS) { try { exitFavCache = JSON.parse(e.newValue || '[]'); } catch { exitFavCache = []; } }
});

// ══ ПОРОЖНІЙ СТАН ════════════════════════════════════════════
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
        </svg> на картці станції,<br>щоб зберегти її до <span style="font-variant:small-caps;letter-spacing:0.04em">Вибраного</span>
      </p>
      <p class="fav-empty-text-lg">
        Двічі тапніть по
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="30 30 340 160" style="width: 72px; display: inline-block; vertical-align: -6px; margin: 0 4px;">
          <rect width="160" height="160" x="30" y="30" fill="var(--bg-card)" rx="36"/>
          <path fill="var(--text-muted)" d="M87 76.14c0-1.74-.94-3.04-2.4-3.52 1.02-.58 1.64-1.64 1.64-3.02 0-2.2-1.5-3.6-3.74-3.6h-3.84v14H83c2.38 0 4-1.52 4-3.86m-6.76-8.82h2.16c1.4 0 2.32.96 2.32 2.4s-.92 2.38-2.32 2.38h-2.16zm0 6.12h2.72c1.5 0 2.52 1.04 2.52 2.6 0 1.58-1.02 2.64-2.52 2.64h-2.72zm18.44 2.52 1.66 4.04h1.76l-6.06-14h-1.46l-6.06 14h1.76l1.7-4.04zm-3.36-8.02 2.8 6.66h-5.6zm16.36-.66V66h-6.98v14h1.52V67.28zM127.56 73c0-4.26-2.82-7.16-6.98-7.16-4.14 0-6.96 2.9-6.96 7.16 0 4.24 2.82 7.16 6.96 7.16 4.16 0 6.98-2.92 6.98-7.16m-12.38 0c0-3.44 2.2-5.78 5.4-5.78 3.22 0 5.42 2.34 5.42 5.78 0 3.42-2.2 5.78-5.42 5.78-3.2 0-5.4-2.36-5.4-5.78m24.64.58V80h1.52V66h-1.52v6.3h-7.74V66h-1.52v14h1.52v-6.42z" aria-label="ВАГОН"/>
          <path fill="#ABABAB" d="M126.45 145.16c0-5.32-2.24-9.1-6.02-11.55 2.87-2.1 4.62-5.25 4.62-9.52 0-8.12-6.09-13.79-15.05-13.79s-15.05 5.67-15.05 13.79h9.45c0-3.36 2.31-5.74 5.6-5.74s5.6 2.38 5.6 5.74-2.31 5.88-5.6 5.88h-3.22v7.56H110c4.13 0 7 3.22 7 7.63s-2.87 7.49-7 7.49-7-3.08-7-7.49h-9.45c0 9.17 6.65 15.54 16.45 15.54s16.45-6.37 16.45-15.54" aria-label="3"/>
          <rect width="160" height="160" x="210" y="30" fill="var(--bg-card)" rx="36"/>
          <path fill="var(--text-muted)" d="M275.58 80v3.2H277v-4.48h-1.5V66h-8.72v7.46c0 4.38-1.24 5.26-1.24 5.26h-1.24v4.48h1.42V80zm-7.24-6.52v-6.2h5.6v11.44h-6.7s1.1-1.02 1.1-5.24m19.84 2.66c0-1.74-.94-3.04-2.4-3.52 1.02-.58 1.64-1.64 1.64-3.02 0-2.2-1.5-3.6-3.74-3.6h-3.84v14h4.34c2.38 0 4-1.52 4-3.86m-6.76-8.82h2.16c1.4 0 2.32.96 2.32 2.4s-.92 2.38-2.32 2.38h-2.16zm0 6.12h2.72c1.5 0 2.52 1.04 2.52 2.6 0 1.58-1.02 2.64-2.52 2.64h-2.72zm11.4 5.28v-5.14h5.22V72.3h-5.22v-5.02h5.88V66h-7.4v14h7.5v-1.28zm13.1-4.9c2.42 0 4.06-1.52 4.06-3.9S308.34 66 305.92 66h-3.8v14h1.58v-6.18zm-2.22-6.5h2.22c1.5 0 2.5 1.04 2.5 2.6 0 1.54-1 2.58-2.5 2.58h-2.22zm9.28-1.32v14h1.52V66z" aria-label="ДВЕРІ"/>
          <path fill="#ABABAB" d="M286.54 152.3c17.08-17.08 19.39-22.61 19.39-28 0-9.17-6.79-14-15.68-14-10.29 0-16.52 6.51-16.52 16.1h9.45c0-4.62 2.38-7.98 7.14-7.98 3.22 0 6.16 1.54 6.16 6.44 0 2.87-.98 6.23-22.54 27.79V160h31.99v-7.7z" aria-label="2"/>
        </svg>
      (вагону і дверям),
      <br>щоб додати до <span style="font-variant:small-caps;letter-spacing:0.04em">Вибраного</span> потрібний вихід
      </p>
    </div>`;
}

// ══ РЕНДЕР СПИСКУ ОБРАНОГО ═══════════════════════════════════
export function renderFavList(favs) {
  if (!favs.length) { favBody.innerHTML = getEmptyFavHtml(); return; }

  const exitFavs = readExitFavCache();
  const items    = [];

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

  const orderMap = new Map(savedOrder.map((id, i) => [id, i]));
  const getEffectiveIdx = item => {
    const direct = orderMap.get(item.rowId);
    if (direct !== undefined) return direct;
    for (const [id, i] of orderMap) {
      if (id.startsWith(item.slug + '::')) return i + 0.5;
    }
    return 99999;
  };

  items.sort((a, b) => {
    const va = getEffectiveIdx(a), vb = getEffectiveIdx(b);
    if (va === vb) return a.dir.localeCompare(b.dir);
    return va - vb;
  });

  const listHtml = items.map(item => {
    const displayName = MetroApp.FAV_DISPLAY_NAMES?.[item.slug] || item.name;

    let formattedDir = '';
    if (item.dir && item.dir !== 'undefined') {
      const cleanDir = item.dir.trim();
      const lower    = cleanDir.toLowerCase();
      if (lower === 'кінцева' || lower === 'вихід праворуч') {
        formattedDir = lower;
      } else if (lower.includes('довгий перехід')) {
        formattedDir = 'довгий перехід на Майдан Незалежності';
      } else {
        const isPrev = lower.startsWith('попередня');
        let stationName = cleanDir.replace(/^попередня\s+/i, '').trim();
        const targetSlug = MetroApp.slugByName?.(stationName);
        if (targetSlug && MetroApp.FAV_DISPLAY_NAMES?.[targetSlug]) {
          stationName = MetroApp.FAV_DISPLAY_NAMES[targetSlug];
        } else if (item.exits.length > 1) {
          stationName = MetroApp.DIR_SHORT_NAMES?.[stationName.toLowerCase()] || stationName;
        }
        formattedDir = isPrev ? `попередня ${stationName}` : stationName;
      }
    }

    let squaresHtml = '';
    if (item.exits.length > 0) {
      const isCompact      = item.exits.length > 2;
      const containerClass = isCompact ? 'fav-exits-container fav-exits-compact' : 'fav-exits-container';
      const groupsHtml     = item.exits.map(f =>
        `<div class="fav-exit-group"><div class="fav-pos-square" style="color:${item.color}">${f.wagon}</div><div class="fav-pos-square" style="color:${item.color}">${f.doors}</div></div>`
      ).join('<div class="fav-exit-sep"></div>');
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
    saveFavs([...domSlugs, ...favs.filter(s => !domSlugs.includes(s))]);
  }

  if (Sortable) {
    if (favBody._sortable) favBody._sortable.destroy();
    favBody._sortable = new Sortable(favBody, {
      draggable:      '.fav-item',
      handle:         '.fav-drag-handle',
      animation:      0,
      ghostClass:     'fav-ghost',
      dragClass:      'fav-dragging',
      fallbackOnBody: true,
      swapThreshold:  0.65,
      swap:           true,
      swapClass:      'fav-swap-highlight',
      forceFallback:  true,
      onEnd:          saveOrder,
    });
  }
}

favBody.addEventListener('click', e => {
  const btn = e.target.closest('.fav-open-btn');
  if (btn?.dataset.slug) MetroApp.openStation?.(btn.dataset.slug);
});

// ══ ВІДКРИТТЯ / ЗАКРИТТЯ ═════════════════════════════════════
export function openFavSheet() {
  MetroApp.pushSheetHistory();
  document.querySelectorAll('.station-sheet').forEach(el => el.classList.remove('sheet-open'));
  const favs = getFavs();
  if (!state.stationsData) favBody.innerHTML = `<p class="fav-empty-text">Дані ще завантажуються…</p>`;
  else if (!favs.length)   favBody.innerHTML = getEmptyFavHtml();
  else                     renderFavList(favs);
  favSheet.classList.add('sheet-open');
  sheetOverlay.classList.add('overlay-visible');

  const hideInfo   = Storage.get(STORAGE_KEYS.HIDE_INFO_BLOCKS) === 'true';
  const startOnFav = Storage.get(STORAGE_KEYS.START_ON_FAV) === 'true';

  // ЗАДАЧА 2: рахуємо стрік тільки якщо є хоча б одна станція у Вибраному
  const hasAnyFavs = getFavs().length > 0 || readExitFavCache().length > 0;

  if (!hideInfo && !startOnFav && hasAnyFavs) {
    const streak = parseInt(Storage.get(STORAGE_KEYS.FAV_ONLY_STREAK) || '0', 10) + 1;
    Storage.set(STORAGE_KEYS.FAV_ONLY_STREAK, String(streak));
    if (streak >= 5 && !document.getElementById('favOnlyHint')) {
      MetroApp.insertFavOnlyHint();
    }
  }
}

export function closeFavSheet() {
  MetroApp.animateSheetClose(favSheet, () => {
    favSheet.classList.remove('sheet-open');
    if (!document.querySelectorAll('.station-sheet.sheet-open').length)
      sheetOverlay.classList.remove('overlay-visible');
  });
}

MetroApp.renderFavOnLoad = () => {
  const favs = getFavs();
  if (!favs.length) favBody.innerHTML = getEmptyFavHtml();
  else renderFavList(favs);
};

// ══ DOCK-ІКОНКА ══════════════════════════════════════════════
export function updateFavDock() {
  const btn = document.getElementById('favListBtn');
  if (!btn) return;
  btn.innerHTML = getFavs().length > 0 ? MetroApp.Icons.dockHeartFilled : MetroApp.Icons.dockHeartEmpty;
}

// ══ ПІДКАЗКА «ВИБРАНЕ ПРИ ЗАПУСКУ» ══════════════════════════
MetroApp.insertFavOnlyHint = function() {
  if (document.getElementById('favOnlyHint')) return;
  const hint = document.createElement('p');
  hint.id        = 'favOnlyHint';
  hint.className = 'fav-empty-text-lg';
  hint.innerHTML = `Внесли до <span style="font-variant: small-caps; letter-spacing: 0.04em;">Вибраного</span> все, чого&nbsp;потребуєте для&nbsp;швидкої навігації в&nbsp;метро? <br>Активуйте в&nbsp;налаштуваннях режим „Показувати&nbsp;<span style="font-variant: small-caps; letter-spacing: 0.04em;">Вибране</span> при&nbsp;запуску"`;
  favBody.insertBefore(hint, favBody.firstChild);
};

MetroApp.dismissFavOnlyHint = function() {
  Storage.set(STORAGE_KEYS.FAV_ONLY_STREAK, '0');
  document.getElementById('favOnlyHint')?.remove();
};

favClose.addEventListener('click', closeFavSheet);
setTimeout(() => {
  MetroApp.initKinematicSwipe?.(favSheet, favBody, closeFavSheet);
}, 0);
