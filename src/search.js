import { state } from './state.js';

export function renderSearchResults(query, container, lineFilter) {
  if (lineFilter === undefined) lineFilter = new Set();
  if (!state.stationsData) {
    container.innerHTML = '<p class="fav-empty-text">Дані ще завантажуються...</p>';
    return;
  }

  let filtered = Object.values(state.stationsData);

  if (query) {
    const rawQuery     = query.toLowerCase().trim().replace(/[''`]/g, '');
    const queryWords   = rawQuery.split(/\s+/).filter(w => w.length > 0);
    const queryNoSpaces = rawQuery.replace(/\s+/g, '');
    filtered = filtered.filter(s =>
      queryWords.every(qWord => s._searchIndex.some(idxWord => idxWord.startsWith(qWord)))
      || s._searchIndex.includes(queryNoSpaces)
    );
  }

  if (lineFilter instanceof Set && lineFilter.size > 0) {
    filtered = filtered.filter(s => lineFilter.has(s.line));
  } else if (typeof lineFilter === 'string' && lineFilter) {
    filtered = filtered.filter(s => s.line === lineFilter);
  }

  filtered.sort((a, b) => a.name.localeCompare(b.name, 'uk'));

  if (!filtered.length) {
    container.innerHTML = '<p class="fav-empty-text" style="padding-top:32px;">Станцію не знайдено</p>';
    return;
  }

  container.innerHTML = filtered.map(s => {
    const color = MetroApp.LINE_COLOR[s.line];
    return `<div class="search-item" data-slug="${s.slug}">
      <div class="search-item-line" style="background-color:${color}"></div>
      <div>${s.name}</div>
    </div>`;
  }).join('');
}

export function openSearchSheet() {
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

    input.addEventListener('input', e => {
      renderSearchResults(e.target.value.trim().toLowerCase(), resultsContainer, state.activeLineFilter);
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
      renderSearchResults(input.value.trim().toLowerCase(), resultsContainer, state.activeLineFilter);
    });

    resultsContainer.addEventListener('click', e => {
      const item = e.target.closest('.search-item');
      if (!item) return;
      document.getElementById('searchInput').blur();
      document.getElementById('searchClose').click();
      setTimeout(() => MetroApp.openStation?.(item.dataset.slug), 200);
    });

    let swY = 0, isHandleSearch = false;
    searchSheet.addEventListener('touchstart', e => {
      swY = e.touches[0].clientY;
      isHandleSearch = !!e.target.closest('.sheet-handle-bar');
    }, { passive: true });
    searchSheet.addEventListener('touchend', e => {
      if (isHandleSearch && (e.changedTouches[0].clientY - swY > 60))
        document.getElementById('searchClose').click();
    });
  }

  // Адаптація під клавіатуру (visualViewport)
  if (window.visualViewport) {
    const onVPResize = () => { searchSheet.style.maxHeight = window.visualViewport.height + 'px'; };
    onVPResize();
    window.visualViewport.addEventListener('resize', onVPResize);
    searchSheet._cleanupVP = () => window.visualViewport.removeEventListener('resize', onVPResize);
  }

  const input            = document.getElementById('searchInput');
  const resultsContainer = document.getElementById('searchResults');
  state.activeLineFilter = new Set();
  document.querySelectorAll('.search-line-btn').forEach((b, i) => b.classList.toggle('is-active', i === 0));
  input.value = '';
  renderSearchResults('', resultsContainer, '');

  document.querySelectorAll('.station-sheet').forEach(el => el.classList.remove('sheet-open'));
  searchSheet.classList.add('sheet-open');
  document.getElementById('sheetOverlay').classList.add('overlay-visible');
}
