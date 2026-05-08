import Sortable        from 'sortablejs';
import { state }        from '../core/state.js';
import { STORAGE_KEYS, Storage } from '../core/storage.js';

const favSheet    = document.getElementById('favSheet');
const favBody     = document.getElementById('favBody');
const favClose    = document.getElementById('favClose');
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

export function getFavs()         { return [...readFavCache()]; }
export function saveFavs(arr)     { favCache = [...arr]; Storage.set(STORAGE_KEYS.FAVS, JSON.stringify(favCache)); }
export const    isFav = slug => readFavCache().includes(slug);

export function toggleFav(slug) {
  let favs = getFavs();
  favs = favs.includes(slug) ? favs.filter(s => s !== slug) : [...favs, slug];
  saveFavs(favs);
  updateFavDock();
  return favs.includes(slug);
}

// ══ ОБРАНІ ВИХОДИ ═══════════════════════════════════════════
let exitFavCache = null;

// Повертає живий кеш — тільки для внутрішнього читання
function readExitFavCache() {
  if (exitFavCache) return exitFavCache;
  try { exitFavCache = JSON.parse(Storage.get(STORAGE_KEYS.EXIT_FAVS) || '[]'); }
  catch (e) { console.warn('[KyivMetroGO] Помилка парсингу Обраних виходів:', e); exitFavCache = []; }
  return exitFavCache;
}

export function getExitFavs()    { return [...readExitFavCache()]; }
export function exitFavId(slug, dir, wagon, doors) { return `${slug}|${dir}|${wagon}|${doors}`; }

// ── isExitFav: читаємо живий кеш без копіювання ──────────────
// Оригінал: getExitFavs() → spread → .some() — зайва копія масиву.
export function isExitFav(slug, dir, wagon, doors) {
  const id = exitFavId(slug, dir, wagon, doors);
  return readExitFavCache().some(f => f.id === id);
}

export function toggleExitFav(slug, dir, wagon, doors) {
  const favs = readExitFavCache(); // живий кеш, мутуємо напряму
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
        </svg> на картці станції, щоб зберегти її до Вибраного
      </p>
      <p class="fav-empty-text-lg">
        Збережіть потрібний вихід подвійним тапом по вагону і дверям
      </p>
    </div>`;
}

// ══ РЕНДЕР СПИСКУ ОБРАНОГО ═══════════════════════════════════
export function renderFavList(favs) {
  if (!favs.length) { favBody.innerHTML = getEmptyFavHtml(); return; }

  const exitFavs = readExitFavCache(); // живий кеш — без spread
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

  // ── Оптимізація: Map замість indexOf ─────────────────────────
  // Оригінал: getEffectiveIdx() викликає savedOrder.indexOf() — O(m) —
  // для кожного порівняння у sort. Загальна складність O(n × m × log n).
  // Map: O(1) lookup → O(n × log n).
  const orderMap = new Map(savedOrder.map((id, i) => [id, i]));

  const getEffectiveIdx = item => {
    const direct = orderMap.get(item.rowId);
    if (direct !== undefined) return direct;
    // Сусідня запис того ж slug — беремо її позицію + 0.5
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
          const stLower = stationName.toLowerCase();
          stationName = MetroApp.DIR_SHORT_NAMES?.[stLower] || stationName;
        }
        formattedDir = isPrev ? `попередня ${stationName}` : stationName;
      }
    }

    let squaresHtml = '';
    if (item.exits.length > 0) {
      const isCompact    = item.exits.length > 2;
      const containerClass = isCompact ? 'fav-exits-container fav-exits-compact' : 'fav-exits-container';
      const groupsHtml   = item.exits.map(f =>
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
    const rowIds    = [...favBody.querySelectorAll('.fav-item')].map(i => i.dataset.rowId).filter(Boolean);
    Storage.set(STORAGE_KEYS.FAV_ROWS_ORDER, JSON.stringify(rowIds));
    const domSlugs  = [...new Set([...favBody.querySelectorAll('.fav-item')].map(i => i.dataset.slug).filter(Boolean))];
    const missingSlugs = favs.filter(s => !domSlugs.includes(s));
    saveFavs([...domSlugs, ...missingSlugs]);
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
  if (!hideInfo && !startOnFav) {
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