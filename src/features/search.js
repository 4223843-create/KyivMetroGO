import { state } from '../core/state.js';

const SEARCH_ALIASES = {
  'площа льва толстого': 'B.Ploshcha_Ukrainskikh_heroiv',
  'петрівка': 'B.Pochaina',
  'дружби народів': 'G.Zvirynetska',
  };

export function renderSearchResults(query, container, lineFilter = new Set()) {
  if (!state.stationsData) {
    container.innerHTML = '<p class="fav-empty-text">Дані ще завантажуються…</p>';
    return;
  }

  let filtered = Object.values(state.stationsData);

  if (query) {
    const rawQuery      = query.toLowerCase().trim().replace(/[''`]/g, '');
    const queryWords    = rawQuery.split(/\s+/).filter(w => w.length > 0);
    const queryNoSpaces = rawQuery.replace(/\s+/g, '');

    filtered = filtered.filter(s => {
      const isAliasMatch = Object.entries(SEARCH_ALIASES).some(([alias, slug]) => 
        slug === s.slug && (alias.startsWith(rawQuery) || alias.includes(rawQuery))
      );
      if (isAliasMatch) return true;

      const isWordMatch = queryWords.every(qWord =>
        s._searchIndex.some(idxWord => idxWord.startsWith(qWord))
      );
      if (isWordMatch) return true;

      const abbrev = s._searchIndex.map(w => w[0]).join('');
      if (abbrev.startsWith(rawQuery)) return true;

      if (s._searchIndex.length > 1) {
        const abbrevLong = (s._searchIndex[0].substring(0, 2)) + s._searchIndex.slice(1).map(w => w[0]).join('');
        if (abbrevLong.startsWith(rawQuery)) return true;
      }

      return s._searchIndex.join('').includes(queryNoSpaces);
    });
  }

  // Фільтрація по лініях
  if (lineFilter.size > 0) {
    filtered = filtered.filter(s => lineFilter.has(s.line));
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

/**
 * Знаходження slug за назвою станції (враховуючи аліаси)
 */
/**
 * Відкриття шторки пошуку
 */
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

    // Закриття
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

    // Обробка вводу
    input.addEventListener('input', e => {
      renderSearchResults(e.target.value.trim().toLowerCase(), resultsContainer, state.activeLineFilter);
    });

    // Фільтри ліній
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

    // Клік по результату
    resultsContainer.addEventListener('click', e => {
      const item = e.target.closest('.search-item');
      if (!item) return;
      document.getElementById('searchInput').blur();
      document.getElementById('searchClose').click();
      setTimeout(() => MetroApp.openStation?.(item.dataset.slug), 200);
    });

    // Кінематичний свайп
    MetroApp.initKinematicSwipe(searchSheet, searchSheet.querySelector('.sheet-body'), () => {
      document.getElementById('searchClose').click();
    });
  }

  // Адаптація під клавіатуру (visualViewport)
  if (window.visualViewport) {
    searchSheet._cleanupVP?.();
    const onVPResize = () => {
      const vp = window.visualViewport;
      const vpTop    = vp.offsetTop ?? 0;
      const vpHeight = vp.height;
      const maxH = vpHeight * 0.92;
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
      searchSheet.style.bottom = '';
      searchSheet.style.maxHeight = '';
    };
  }

  const input            = document.getElementById('searchInput');
  const resultsContainer = document.getElementById('searchResults');
  
  state.activeLineFilter = new Set();
  document.querySelectorAll('.search-line-btn').forEach((b, i) => b.classList.toggle('is-active', i === 0));
  
  input.value = '';
  renderSearchResults('', resultsContainer, new Set());

  // Відкриття шторки
  document.querySelectorAll('.station-sheet').forEach(el => el.classList.remove('sheet-open'));
  searchSheet.classList.add('sheet-open');
  document.getElementById('sheetOverlay').classList.add('overlay-visible');
}