import { state } from './state.js';

// ══ КЕШ РЕЗУЛЬТАТІВ ПОШУКУ ══════════════════════════════════
// Уникаємо повторного фільтрування/сортування при однаковому запиті.
// Інвалідуємо при зміні даних або фільтра.
let _cachedQuery      = null;
let _cachedLineFilter = null;
let _cachedHtml       = null;

export function invalidateSearchCache() {
  _cachedQuery = _cachedLineFilter = _cachedHtml = null;
}

// ── Debounce ──────────────────────────────────────────────────
// Пошук на кожен keystroke — зайвий рендер при швидкому наборі.
// 120 мс — непомітно для користувача, але усуває ~5-8 зайвих рендерів
// при швидкому наборі 6-значного слова.
let _debounceTimer = null;
function debounce(fn, ms) {
  return (...args) => {
    clearTimeout(_debounceTimer);
    _debounceTimer = setTimeout(() => fn(...args), ms);
  };
}

// ── Відсортований масив станцій ───────────────────────────────
// localeCompare('uk') — дорога операція (Intl.Collator під капотом).
// Базовий список станцій не змінюється — сортуємо один раз при ініціалізації.
// При ре-гідрації (reloadStationsData) — інвалідуємо.
let _sortedStations = null;

export function invalidateSortedStations() {
  _sortedStations = null;
  invalidateSearchCache();
}

function getSortedStations() {
  if (_sortedStations) return _sortedStations;
  if (!state.stationsData) return [];

  // Створюємо Intl.Collator один раз — ~10× швидше за повторні localeCompare виклики
  const collator = new Intl.Collator('uk', { sensitivity: 'base' });
  _sortedStations = Object.values(state.stationsData)
    .sort((a, b) => collator.compare(a.name, b.name));
  return _sortedStations;
}

// ── Рендер ────────────────────────────────────────────────────
export function renderSearchResults(query, container, lineFilter = new Set()) {
  if (!state.stationsData) {
    container.innerHTML = '<p class="fav-empty-text">Дані ще завантажуються…</p>';
    return;
  }

  // Порівнюємо кеш: lineFilter — Set, порівнюємо через серіалізацію
  const filterKey = [...lineFilter].sort().join(',');
  if (query === _cachedQuery && filterKey === _cachedLineFilter && _cachedHtml !== null) {
    container.innerHTML = _cachedHtml;
    return;
  }

  const stations = getSortedStations(); // вже відсортовані — sort() не викликається

  let filtered = stations;

  if (lineFilter.size > 0) {
    filtered = filtered.filter(s => lineFilter.has(s.line));
  }

  if (query) {
    const rawQuery      = query.toLowerCase().trim().replace(/[''`]/g, '');
    const queryWords    = rawQuery.split(/\s+/).filter(w => w.length > 0);
    const queryNoSpaces = rawQuery.replace(/\s+/g, '');

    filtered = filtered.filter(s =>
      queryWords.every(qWord => s._searchIndex.some(iWord => iWord.startsWith(qWord)))
      || s._searchIndex.includes(queryNoSpaces)
    );
  }

  let html;
  if (!filtered.length) {
    html = '<p class="fav-empty-text" style="padding-top:32px;">Станцію не знайдено</p>';
  } else {
    // Будуємо рядки через масив — уникаємо конкатенацій у циклі
    const parts = new Array(filtered.length);
    for (let i = 0; i < filtered.length; i++) {
      const s     = filtered[i];
      const color = MetroApp.LINE_COLOR[s.line];
      parts[i] = `<div class="search-item" data-slug="${s.slug}"><div class="search-item-line" style="background-color:${color}"></div><div>${s.name}</div></div>`;
    }
    html = parts.join('');
  }

  // Зберігаємо в кеш перед записом у DOM
  _cachedQuery      = query;
  _cachedLineFilter = filterKey;
  _cachedHtml       = html;

  container.innerHTML = html;
}

// Debounced-версія для прив'язки до 'input'
export const renderSearchResultsDebounced = debounce(renderSearchResults, 120);

// ══ ВІДКРИТТЯ ШТОРКИ ══════════════════════════════════════════
export function openSearchSheet() {
  MetroApp.pushSheetHistory();
  const sheetOverlay = document.getElementById('sheetOverlay');
  let searchSheet    = document.getElementById('searchSheet');

  if (!searchSheet) {
    searchSheet = document.createElement('div');
    searchSheet.id        = 'searchSheet';
    searchSheet.className = 'station-sheet search-station-sheet sheet-scrollable';

    const template = document.getElementById('tpl-search-sheet');
    searchSheet.appendChild(template.content.cloneNode(true));
    document.body.appendChild(searchSheet);

    document.getElementById('searchClose').addEventListener('click', () => {
      searchSheet._cleanupVP?.();
      searchSheet.style.maxHeight = '';
      document.getElementById('searchInput').blur();
      MetroApp.animateSheetClose(searchSheet, () => {
        searchSheet.classList.remove('sheet-open');
        if (!document.querySelectorAll('.station-sheet.sheet-open').length)
          sheetOverlay.classList.remove('overlay-visible');
      });
    });

    const input            = document.getElementById('searchInput');
    const resultsContainer = document.getElementById('searchResults');

    // ── Debounced input: не рендеримо на кожен keystroke ──
    input.addEventListener('input', e => {
      renderSearchResultsDebounced(
        e.target.value.trim().toLowerCase(),
        resultsContainer,
        state.activeLineFilter
      );
    });

    document.getElementById('searchLineFilter').addEventListener('click', e => {
      const btn = e.target.closest('.search-line-btn');
      if (!btn) return;
      const line   = btn.dataset.line;
      const allBtn = document.querySelector('.search-line-btn[data-line=""]');

      if (line === '') {
        state.activeLineFilter = new Set();
        document.querySelectorAll('.search-line-btn').forEach(b => b.classList.toggle('is-active', b === btn));
      } else {
        allBtn?.classList.remove('is-active');
        if (state.activeLineFilter.has(line)) state.activeLineFilter.delete(line);
        else state.activeLineFilter.add(line);
        btn.classList.toggle('is-active', state.activeLineFilter.has(line));
        if (state.activeLineFilter.size === 0) {
          state.activeLineFilter = new Set();
          allBtn?.classList.add('is-active');
        }
      }
      // Зміна фільтра — рендеримо одразу (без debounce), інвалідуємо кеш
      invalidateSearchCache();
      renderSearchResults(input.value.trim().toLowerCase(), resultsContainer, state.activeLineFilter);
    });

    resultsContainer.addEventListener('click', e => {
      const item = e.target.closest('.search-item');
      if (!item) return;
      document.getElementById('searchInput').blur();
      document.getElementById('searchClose').click();
      setTimeout(() => MetroApp.openStation?.(item.dataset.slug), 200);
    });

    MetroApp.initKinematicSwipe(searchSheet, searchSheet.querySelector('.sheet-body'), () => {
      document.getElementById('searchClose').click();
    });
  }

  // Адаптація під клавіатуру (visualViewport)
  if (window.visualViewport) {
    searchSheet._cleanupVP?.();
    const onVPResize = () => {
      const vp       = window.visualViewport;
      const vpTop    = vp.offsetTop ?? 0;
      const vpHeight = vp.height;
      const maxH     = vpHeight * 0.92;
      searchSheet.style.maxHeight = `${maxH}px`;
      const keyboardH = window.innerHeight - vpTop - vpHeight;
      searchSheet.style.bottom = `${Math.max(0, keyboardH)}px`;
    };
    onVPResize();
    window.visualViewport.addEventListener('resize', onVPResize);
    window.visualViewport.addEventListener('scroll', onVPResize);
    searchSheet._cleanupVP = () => {
      window.visualViewport.removeEventListener('resize', onVPResize);
      window.visualViewport.removeEventListener('scroll', onVPResize);
      searchSheet.style.bottom    = '';
      searchSheet.style.maxHeight = '';
    };
  }

  const input            = document.getElementById('searchInput');
  const resultsContainer = document.getElementById('searchResults');
  state.activeLineFilter = new Set();
  document.querySelectorAll('.search-line-btn').forEach((b, i) => b.classList.toggle('is-active', i === 0));
  input.value = '';
  invalidateSearchCache();
  renderSearchResults('', resultsContainer, new Set());

  document.querySelectorAll('.station-sheet').forEach(el => el.classList.remove('sheet-open'));
  searchSheet.classList.add('sheet-open');
  document.getElementById('sheetOverlay').classList.add('overlay-visible');
}
