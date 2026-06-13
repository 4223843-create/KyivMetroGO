// ══ FEATURE: ПОШУК СТАНЦІЙ — UI-ШАР ══
// Відповідальність: рендеринг результатів пошуку та управління шторкою.
// Нечіткий пошук з підтримкою транслітерації, акронімів та аліасів.
//
// Публічне API:
//   renderSearchResults(query, container, lineFilter) → void
//   invalidateSearchCache()                          → void
//   openSearchSheet()                                → void

import { state } from '../core/state.js';
import { fuzzyMatchToken } from '../utils/stringMatchers.js';
import { pushSheetHistory }   from '../ui/system.js';
import { animateSheetClose }  from '../ui/animations.js';
import { initKinematicSwipe } from '../ui/swipe.js';
import { bus }                from '../core/eventBus.js';
import { LINE_COLOR } from '../core/constants.js';

const SEARCH_ALIASES = {
  'площа льва толстого': 'B.Ploshcha_Ukrainskikh_heroiv',
  'плуг': 'B.Ploshcha_Ukrainskikh_heroiv',
  'пуг': 'B.Ploshcha_Ukrainskikh_heroiv',
  'петрівка':            'B.Pochaina',
  'дружби народів':      'G.Zvirynetska',
  'кпі':                 'R.Politekhnychnyi_instytut',
};

// Підняти в module scope — не алокуємо масив в циклі по станціях
const SEARCH_ALIASES_ENTRIES = Object.entries(SEARCH_ALIASES);

// Кеш HTML для порожнього запиту без лінійних фільтрів
// Інвалідується при зміні stationsData (нове посилання після reloadStationsData)
let _emptyQueryHtml    = null;
let _emptyQueryDataRef = null;

/** Скидає кеш HTML порожнього запиту (викликається після reloadStationsData). */
export function invalidateSearchCache() {
  _emptyQueryHtml    = null;
  _emptyQueryDataRef = null;
}

/**
 * Відмальовує результати пошуку у container.innerHTML.
 * При порожньому query без фільтра повертає кешований HTML.
 *
 * @param {string}  query       — нормалізований рядок запиту
 * @param {Element} container   — DOM-вузол для вставки результатів
 * @param {Set<string>} lineFilter — активні лінії (порожній Set = всі)
 */
export function renderSearchResults(query, container, lineFilter = new Set()) {
  if (!state.stationsData) {
    container.innerHTML = '<p class="fav-empty-text">Дані ще завантажуються…</p>';
    return;
  }

  let stations = Object.values(state.stationsData);

  if (lineFilter.size > 0) {
    stations = stations.filter(s => lineFilter.has(s.line));
  }

  // ── Порожній запит без фільтра: повертаємо кешований HTML ─
  if (!query && lineFilter.size === 0) {
    if (_emptyQueryDataRef !== state.stationsData || !_emptyQueryHtml) {
      // Сортуємо і рендеримо лише один раз між перезавантаженнями
      const sorted = [...stations].sort((a, b) => a.name.localeCompare(b.name, 'uk'));
      _emptyQueryHtml    = sorted.map(s => _renderItem(s, false, null)).join('');
      _emptyQueryDataRef = state.stationsData;
    }
    container.innerHTML = _emptyQueryHtml;
    return;
  }

  // ── Порожній запит з фільтром лінії ───────────────────────
  if (!query) {
    stations.sort((a, b) => a.name.localeCompare(b.name, 'uk'));
    container.innerHTML = stations.map(s => _renderItem(s, false, null)).join('');
    return;
  }

  const rawQuery      = query.toLowerCase().trim().replace(/[''`]/g, '');
  const queryWords    = rawQuery.split(/\s+/).filter(w => w.length > 0);
  const queryNoSpaces = rawQuery.replace(/\s+/g, '');

  const matched = [];

for (const s of stations) {
    const isAlias = SEARCH_ALIASES_ENTRIES.some(([alias, slug]) =>
      slug === s.slug && (alias.startsWith(rawQuery) || alias.includes(rawQuery))
    );

    // ПРОСТА ЛОГІКА: кожне слово з пошуку має збігатися з початком хоча б одного слова в індексі станції
    const isNameMatch = isAlias || queryWords.every(qWord =>
      s._searchIndex.some(idx => idx.startsWith(qWord))
    );

    if (isNameMatch) {
      matched.push({ s, isExitOnly: false, exitHint: null });
      continue;
    }

    // Пошук по виходах (якщо треба) залишаємо як є
    if (s._exitIndex?.length) {
      const hitTok = s._exitIndex.find(tok => tok.startsWith(rawQuery));
      if (hitTok) {
        matched.push({ s, isExitOnly: true, exitHint: _findExitLabel(s, hitTok) });
      }
    }
  }

  matched.sort((a, b) => {
    // 1. Виходи завжди нижче за станції
    if (a.isExitOnly !== b.isExitOnly) return a.isExitOnly ? 1 : -1;

    // 2. ПРІОРИТЕТ ПЕРШОГО СЛОВА
    // _searchIndex[0] - це завжди перше слово оригінальної назви
    const qFirst = queryWords[0] || '';
    const aFirstWordMatch = a.s._searchIndex[0].startsWith(qFirst);
    const bFirstWordMatch = b.s._searchIndex[0].startsWith(qFirst);

    if (aFirstWordMatch && !bFirstWordMatch) return -1; // 'a' вище
    if (!aFirstWordMatch && bFirstWordMatch) return 1;  // 'b' вище

    // 3. Алфавітне сортування для всіх інших (однакових за пріоритетом)
    return a.s.name.localeCompare(b.s.name, 'uk');
  });

  container.innerHTML = matched.map(({ s, isExitOnly, exitHint }) =>
    _renderItem(s, isExitOnly, exitHint)
  ).join('');
}

function _findExitLabel(s, hitTok) {
  for (const dir of (s.directions || [])) {
    for (const ex of (dir.exits || [])) {
      if (!ex.label) continue;
      if (ex.label.toLowerCase().includes(hitTok)) return ex.label;
    }
  }
  return null;
}

function _renderItem(s, isExitOnly, exitHint) {
  const color = LINE_COLOR[s.line];
  const hintHtml = isExitOnly && exitHint
    ? `<span class="search-item-hint">${exitHint}</span>`
    : '';
  return `<div class="search-item" data-slug="${s.slug}">
    <div class="search-item-line" style="background-color:${color}"></div>
    <div class="search-item-text"><span>${s.name}</span>${hintHtml}</div>
  </div>`;
}

/**
 * Відкриття шторки пошуку
 */
/** Відкриває шторку пошуку станцій. */
export function openSearchSheet() {
  pushSheetHistory();
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
      animateSheetClose(searchSheet, () => {
        searchSheet.classList.remove('sheet-open');
        if (!document.querySelectorAll('.station-sheet.sheet-open').length)
          sheetOverlay.classList.remove('overlay-visible');
      });
    });

    const input            = document.getElementById('searchInput');
    const resultsContainer = document.getElementById('searchResults');

    // Обробка вводу
    let _searchRaf     = null;
    let _lastQuery     = Symbol(); // унікальна мітка, щоб перший раз 100% спрацювало
    let _lastFilterKey = '';

    input.addEventListener('input', e => {
      if (_searchRaf) cancelAnimationFrame(_searchRaf);
      _searchRaf = requestAnimationFrame(() => {
        _searchRaf = null;
        
        const q         = e.target.value.trim().toLowerCase();
        const filterKey = [...state.activeLineFilter].sort().join(',');
        
        // Guard: Якщо текст запиту і вибрані гілки не змінилися — нічого не перемальовуємо
        if (q === _lastQuery && filterKey === _lastFilterKey) return;
        
        _lastQuery     = q;
        _lastFilterKey = filterKey;
        
        renderSearchResults(q, resultsContainer, state.activeLineFilter);
      });
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
      setTimeout(() => bus.emit('station:open', { slug: item.dataset.slug }), 200);
    });

    // Кінематичний свайп
    initKinematicSwipe(searchSheet, searchSheet.querySelector('.sheet-body'), () => {
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