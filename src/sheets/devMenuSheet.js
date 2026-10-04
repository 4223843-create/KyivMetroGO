// ══ МЕНЮ РОЗРОБНИКА ══
// Окрема повноекранна шторка, доступна плаваючою кнопкою зверху карти
// (лише коли Dev Mode активний). Секції: авторизація/синхронізація Firebase,
// узагальнені нотатки по всіх станціях, список станцій з непозначеними
// виходами (дизайн скопійовано зі списку станцій "Запропонувати зміни" —
// кольорові кружечки ліній + фільтр по гілці), і простий беклог ідей.
// Усі три розгортні секції (Нотатки/Потребують перевірки/Backlog)
// пам'ятають стан згорнуто/розгорнуто між відкриттями (Storage).

import { state }   from '../core/state.js';
import { bus }     from '../core/eventBus.js';
import { STORAGE_KEYS, Storage } from '../core/storage.js';
import { LINE_COLOR } from '../core/constants.js';
import { showSheet, hideSheet } from '../ui/sheetNav.js';
import { getPositionDescriptorsForStation } from './renderStation.js';
import {
  renderDevAuthSection, getAllDevNotes, getAllStationNotes,
  getDevBacklog, setDevBacklog, isVerified,
  setDevNote, setStationNote,
  getExitsCatalogStatus, getExitsCatalogCount, cycleExitsCatalogStatus,
  setExitsCatalogVerified, resetExitsCatalogVerified,
} from '../features/devmode.js';
import { escapeHtml, richText } from '../ui/html.js';


// ── Стан кнопок видалення нотаток ─────────────────────────────────────────
// _expandedRows: стрілку натиснуто → видно кнопку «Видалити»
// _pendingDeletes: «Видалити» натиснуто → кнопка стала «Скасувати», таймер іде
const DELETE_CONFIRM_MS = 4000;
const _pendingDeletes   = new Map(); // deleteId → timerId
const _expandedRows     = new Set(); // deleteId рядків зі стрілкою у відкритому стані

// Активний фільтр по гілці для секції "Потребують перевірки" —
// живе тільки на час відкритої шторки, не зберігається між сесіями.
let _verifyLine = '';
let _exitsLine  = '';

// ── Нотатки по станціях ──────────────────────────────────────────────────────
// Три групи за лінією (як у "Потребують перевірки"), сортування — за часом
// останнього редагування (поле t у tombstone-форматі), найновіші — вгорі.

// Стан розгорнутості груп — живе між перерендерами в межах відкритої шторки





/** Витягає рядкове значення нотатки з об'єкта або legacy-рядка. */
function _noteText(raw) {
  if (!raw) return '';
  if (typeof raw === 'string') return raw;
  if (raw.d) return '';
  return raw.v ?? '';
}

/** Таймстамп останнього редагування нотатки (0 для legacy). */
function _noteTs(raw) {
  if (!raw || typeof raw === 'string') return 0;
  return raw.t ?? 0;
}

/**
 * Рендерить секцію «Нотатки по станціях».
 * Плаский список, відсортований за часом останнього редагування (нові вгорі).
 * Фільтрація по лінії — через кнопки над списком (без розгортальних груп).
 */
function _renderStationNotesSection(container, lineFilter) {
  const raw = getAllStationNotes();

  const entries = [];
  for (const [slug, entry] of Object.entries(raw)) {
    const text = _noteText(entry);
    if (!text) continue;
    const station = state.stationsData?.[slug];
    if (!station) continue;
    if (lineFilter && station.line !== lineFilter) continue;
    entries.push({ slug, station, text, ts: _noteTs(entry) });
  }

  if (!entries.length) {
    container.innerHTML = '<div class="dev-menu-empty">Нотаток по станціях ще немає</div>';
    return;
  }

  entries.sort((a, b) => b.ts - a.ts);

  container.innerHTML = entries.map(({ slug, station, text }) => {
    const deleteId  = 'sn-' + slug;
    const expanded  = _expandedRows.has(deleteId);
    const pending   = _pendingDeletes.has(deleteId);
    return _noteRowHtml({ deleteId, slug, text: station.name, extra: text, expanded, pending });
  }).join('');

  _bindNotesClicks(container);
  _bindNoteRowControls(container, (deleteId, slug) => {
    setStationNote(slug, '', false);
  }, (container) => _renderStationNotesSection(container, _stationNotesLine));
}

/**
 * Рендерить секцію «Нотатки по виходах».
 * Один рядок = один вихід (slug + posIdx) з описом і текстом нотатки.
 * Групи = лінії метро, сортування за часом редагування.
 */
/**
 * Рендерить секцію «Нотатки по виходах».
 * Один рядок = один вихід.
 * Плоский список, сортування за часом редагування.
 * Фільтрація по лінії — через кнопки над списком.
 */
function _renderExitNotesSection(container, lineFilter) {
  const raw = getAllDevNotes();
  const entries = [];

  for (const [slug, positions] of Object.entries(raw)) {
    const station = state.stationsData?.[slug];
    if (!station) continue;
    if (lineFilter && station.line !== lineFilter) continue;

    const color = LINE_COLOR[station.line] || '#888888';
    const descriptors = getPositionDescriptorsForStation(station, color);

    for (const [posIdx, entry] of Object.entries(positions)) {
      const text = _noteText(entry);
      if (!text) continue;

      // Ключ — devRowKey рядка; числовий — старий запис, який не вдалося перевести
      const d = descriptors.find(x => x.key === posIdx) ?? descriptors[Number(posIdx)];
      if (!d) continue;

      entries.push({
        slug,
        station,
        text,
        ts: _noteTs(entry),
        descriptor: d,
        posIdx,
      });
    }
  }

  if (!entries.length) {
    container.innerHTML =
      '<div class="dev-menu-empty">Нотаток по виходах ще немає</div>';
    return;
  }

  entries.sort((a, b) => b.ts - a.ts);

  container.innerHTML = entries.map(({ slug, station, text, descriptor: d, posIdx }) => {
    const parts    = [d.dirFrom, d.exitLabel].filter(Boolean).join(' · ');
    const label    = station.name + (parts ? ' · ' + parts : '');
    const deleteId = 'en-' + slug + '-' + posIdx;
    const expanded = _expandedRows.has(deleteId);
    const pending  = _pendingDeletes.has(deleteId);
    return _noteRowHtml({ deleteId, slug, posIdx, text: label, extra: text, expanded, pending });
  }).join('');

  _bindNotesClicks(container);
  _bindNoteRowControls(container, (deleteId, slug, posIdx) => {
    setDevNote(slug, posIdx, '');
  }, (container) => _renderExitNotesSection(container, _exitNotesLine));
}

// Фільтри по лінії для двох нових секцій — живуть між відкриттями шторки
let _stationNotesLine = '';
let _exitNotesLine    = '';

/**
 * Будує вміст секції "Потребують перевірки" — дизайн один-в-один
 * скопійований зі списку станцій "Запропонувати зміни" (stationListHtml
 * у fbRenderer.js): кольоровий кружечок лінії (.search-item-line) + назва
 * (.search-item), фільтр по гілці (.search-line-filter/.search-line-btn).
 * На відміну від нотаток, тут один рядок = одна станція (не один рядок на
 * вихід) — клік одразу відкриває станцію.
 */
function _renderVerificationSection(container) {
  const stationsData = state.stationsData || {};

  const entries = Object.entries(stationsData)
    .map(([slug, station]) => {
      const color       = LINE_COLOR[station.line] || '#888888';
      const descriptors = getPositionDescriptorsForStation(station, color);
      const unverified   = descriptors.filter(d => !isVerified(slug, d.key));
      return { slug, station, color, count: unverified.length };
    })
    .filter(e => e.count > 0 && (_verifyLine === '' || e.station.line === _verifyLine))
    .sort((a, b) => a.station.name.localeCompare(b.station.name, 'uk'));

  if (!entries.length) {
    container.innerHTML = `<div class="dev-menu-empty">Усі виходи позначені як перевірені 🎉</div>`;
    return;
  }

  container.innerHTML = entries.map(({ slug, station, color, count }) => `
    <div class="search-item dev-menu-verify-item" data-slug="${slug}">
      <div class="search-item-line" style="background-color:${color}"></div>
      <div class="search-item-text">
        <div>${station.name}</div>
        <div class="search-item-hint">${count} ${count === 1 ? 'вихід' : 'виходів'}</div>
      </div>
    </div>`).join('');
}

/**
 * HTML одного рядка нотатки з механікою розкриття кнопки видалення.
 * Структура:
 *   [кнопка-рядок (назва + preview)] [стрілка›] → [Видалити] → [Скасувати]
 * 
 * Стрілка (›) і кнопки видалення/скасування розміщені на 3 годині рядка.
 * При натисканні стрілки: expanded=true → з'являється маленька кнопка «Видалити».
 * При натисканні «Видалити»: pending=true → кнопка стає «Скасувати» (сіра), таймер 4с.
 * При натисканні «Скасувати»: таймер скидається, кнопка повертається до «Видалити».
 */
function _noteRowHtml({ deleteId, slug, posIdx, text, extra, expanded, pending }) {
  const posAttr = posIdx !== undefined ? ' data-pos-idx="' + posIdx + '"' : '';
  let actionHtml;
  if (pending) {
    actionHtml =
      '<button type="button" class="dev-note-undo-btn" ' +
      'data-delete-id="' + deleteId + '" data-slug="' + slug + '"' + posAttr + '>Скасувати</button>';
  } else if (expanded) {
    actionHtml =
      '<button type="button" class="dev-note-delete-btn" ' +
      'data-delete-id="' + deleteId + '" data-slug="' + slug + '"' + posAttr + '>Видалити</button>' +
      '<button type="button" class="dev-note-collapse-btn" ' +
      'data-delete-id="' + deleteId + '" aria-label="Закрити">&times;</button>';
  } else {
    actionHtml =
      '<button type="button" class="dev-note-expand-btn" ' +
      'data-delete-id="' + deleteId + '" aria-label="Дії">›</button>';
  }
  return (
    '<div class="dev-note-row-wrap">' +
      '<button type="button" class="dev-menu-row dev-menu-row--with-action" data-slug="' + slug + '">' +
        '<div class="dev-menu-row-station">' + richText(text) + '</div>' +
        '<div class="dev-menu-row-extra">' + escapeHtml(extra) + '</div>' +
      '</button>' +
      '<div class="dev-note-action-zone">' + actionHtml + '</div>' +
    '</div>'
  );
}

/**
 * Прив'язує логіку стрілки / «Видалити» / «Скасувати» до контейнера.
 * @param {HTMLElement}  container
 * @param {Function}     deleteFn(deleteId, slug, posIdx) — фізичне видалення через tombstone
 * @param {Function}     rerenderFn(container) — перемальовує секцію після видалення
 */
function _bindNoteRowControls(container, deleteFn, rerenderFn) {
  // Стрілка › — розкриває кнопку «Видалити»
  container.querySelectorAll('.dev-note-expand-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const deleteId = btn.dataset.deleteId;
      _expandedRows.add(deleteId);
      rerenderFn(container);
    });
  });

  // Кнопка «Видалити» — переходить у режим «Скасувати», запускає таймер
  container.querySelectorAll('.dev-note-delete-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const deleteId = btn.dataset.deleteId;
      const slug     = btn.dataset.slug;
      const posIdx   = btn.dataset.posIdx;

      const timerId = setTimeout(() => {
        _pendingDeletes.delete(deleteId);
        _expandedRows.delete(deleteId);
        deleteFn(deleteId, slug, posIdx);
        rerenderFn(container);
      }, DELETE_CONFIRM_MS);

      _pendingDeletes.set(deleteId, timerId);
      rerenderFn(container);
    });
  });

  // Кнопка «Скасувати» — скидає таймер, залишає expanded (кнопка «Видалити» видима)
  container.querySelectorAll('.dev-note-undo-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const deleteId = btn.dataset.deleteId;
      clearTimeout(_pendingDeletes.get(deleteId));
      _pendingDeletes.delete(deleteId);
      rerenderFn(container);
    });
  });

  // Кнопка × — закриває зону дій (expanded → false), нічого не видаляє
  container.querySelectorAll('.dev-note-collapse-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      _expandedRows.delete(btn.dataset.deleteId);
      rerenderFn(container);
    });
  });
}

function _bindNotesClicks(container) {
  container.querySelectorAll('.dev-menu-row').forEach(row => {
    row.addEventListener('click', () => {
      const slug = row.dataset.slug;
      if (slug) bus.emit('station:open', { slug });
    });
  });
}

function _bindVerifyClicks(container) {
  container.querySelectorAll('.dev-menu-verify-item').forEach(row => {
    row.addEventListener('click', () => {
      const slug = row.dataset.slug;
      if (slug) bus.emit('station:open', { slug });
    });
  });
}

function _bindVerifyLineFilter(sheet) {
  const filter = sheet.querySelector('#devVerifyLineFilter');
  if (!filter || filter.dataset.bound) return;
  filter.dataset.bound = '1';

  filter.querySelectorAll('.search-line-btn').forEach(b => {
    b.classList.toggle('is-active', b.dataset.line === _verifyLine);
  });

  filter.addEventListener('click', e => {
    const btn = e.target.closest('.search-line-btn');
    if (!btn) return;
    filter.querySelectorAll('.search-line-btn').forEach(b => b.classList.remove('is-active'));
    btn.classList.add('is-active');
    _verifyLine = btn.dataset.line;

    const verifyEl = sheet.querySelector('#devMenuVerify');
    _renderVerificationSection(verifyEl);
    _bindVerifyClicks(verifyEl);
  });
}

function _bindStationNotesLineFilter(sheet) {
  const filter = sheet.querySelector('#devStationNotesLineFilter');
  if (!filter || filter.dataset.bound) return;
  filter.dataset.bound = '1';

  filter.querySelectorAll('.search-line-btn').forEach(b => {
    b.classList.toggle('is-active', b.dataset.line === _stationNotesLine);
  });

  filter.addEventListener('click', e => {
    const btn = e.target.closest('.search-line-btn');
    if (!btn) return;
    filter.querySelectorAll('.search-line-btn').forEach(b => b.classList.remove('is-active'));
    btn.classList.add('is-active');
    _stationNotesLine = btn.dataset.line;
    const el = sheet.querySelector('#devMenuStationNotes');
    if (el) { _renderStationNotesSection(el, _stationNotesLine); }
  });
}

function _bindExitNotesLineFilter(sheet) {
  const filter = sheet.querySelector('#devExitNotesLineFilter');
  if (!filter || filter.dataset.bound) return;
  filter.dataset.bound = '1';

  filter.querySelectorAll('.search-line-btn').forEach(b => {
    b.classList.toggle('is-active', b.dataset.line === _exitNotesLine);
  });

  filter.addEventListener('click', e => {
    const btn = e.target.closest('.search-line-btn');
    if (!btn) return;
    filter.querySelectorAll('.search-line-btn').forEach(b => b.classList.remove('is-active'));
    btn.classList.add('is-active');
    _exitNotesLine = btn.dataset.line;
    const el = sheet.querySelector('#devMenuExitNotes');
    if (el) { _renderExitNotesSection(el, _exitNotesLine); }
  });
}

// ── Розгортні секції (Нотатки / Потребують перевірки / Backlog) ──
// Стан пам'ятається в Storage — при повторному відкритті шторки секції
// лишаються в тому вигляді, в якому їх залишили минулого разу.
function _getSectionsState() {
  try { return JSON.parse(Storage.get(STORAGE_KEYS.DEV_MENU_SECTIONS) || '{}'); }
  catch(e) { return {}; }
}

function _setupCollapsibles(sheet) {
  const sectionsState = _getSectionsState();

  sheet.querySelectorAll('.dev-menu-collapsible').forEach(section => {
    const key    = section.dataset.section;
    const toggle = section.querySelector('.dev-menu-section-toggle');
    if (!toggle || toggle.dataset.bound) return;
    toggle.dataset.bound = '1';

    // За замовчуванням (нема збереженого стану) — розгорнуто.
    const collapsed = sectionsState[key] === false;
    section.classList.toggle('is-collapsed', collapsed);

    toggle.addEventListener('click', () => {
      const nowCollapsed = !section.classList.contains('is-collapsed');
      section.classList.toggle('is-collapsed', nowCollapsed);

      const current = _getSectionsState();
      current[key] = !nowCollapsed;
      Storage.set(STORAGE_KEYS.DEV_MENU_SECTIONS, JSON.stringify(current));
    });
  });
}


// ── Підрахунок пронумерованих виходів станції ────────────────────────────────
// «Вихід» = exit_numbers із непорожнім полем num ("1", "2" тощо).
// Використовується для лічильника у галочці.

function _countStationExits(station) {
  const catalog = station.exits_catalog;
  if (!catalog) return 0;
  let count = 0;
  for (const ev of Object.values(catalog)) {
    for (const en of (ev.exit_numbers || [])) {
      if ((en.num || '').trim()) count++;
    }
  }
  return count;
}

const DEV_CHECK_SVG = `<svg viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path fill="currentColor" d="M14.83 4.89l1.34.94-5.81 8.38H9.02L5.78 9.67l1.34-1.25 2.57 2.4z"/></svg>`;


function _renderExitsGroupHtml(title, items, groupKey) {
  const isOpen = _exitsGroupOpen[groupKey] ?? false;
  const bodyHtml = items.length
    ? items.map(e => _exitStationRowHtml(e.slug, e.station, e.color, e.status, e.total, e.count)).join('')
    : `<div class="dev-menu-empty dev-exits-empty">Немає станцій</div>`;

  return `<div class="dev-exits-group${isOpen ? '' : ' is-collapsed'}" data-group="${groupKey}">
    <div class="dev-exits-group-toggle">
      <span class="dev-exits-group-title">${title} <span class="dev-exits-count">${items.length}</span></span>
      <svg class="dev-exits-group-arrow" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="M6 9l6 6 6-6"/></svg>
    </div>
    <div class="dev-exits-group-body">
      ${bodyHtml}
    </div>
  </div>`;
}

// Зберігаємо стан розгорнутості груп між перерендерами.
// Ключі: 'unverified' | 'partial' | 'full'
const _exitsGroupOpen = { unverified: false, partial: false, full: false };

const _EXITS_GROUP_KEYS = ['unverified', 'partial', 'full'];

function _renderExitsSection(container, openGroupKey) {
  const stationsData = state.stationsData || {};

  const unverified = [];
  const partial    = [];
  const full       = [];

  for (const [slug, station] of Object.entries(stationsData)) {
    if (_exitsLine && station.line !== _exitsLine) continue;
    const color  = LINE_COLOR[station.line] || '#888888';
    const total  = _countStationExits(station);
    const status = getExitsCatalogStatus(slug);
    const { count } = getExitsCatalogCount(slug, total);

    const entry = { slug, station, color, status, total, count };
    if (status === 'full')         full.push(entry);
    else if (status === 'partial') partial.push(entry);
    else                           unverified.push(entry);
  }

  const byName = (a, b) => a.station.name.localeCompare(b.station.name, 'uk');
  unverified.sort(byName);
  partial.sort(byName);
  full.sort(byName);

  // Якщо після дії станція переїхала до іншої групи — відкриваємо ту групу
  if (openGroupKey) _exitsGroupOpen[openGroupKey] = true;

  container.innerHTML =
    _renderExitsGroupHtml('Неперевірені',        unverified, 'unverified') +
    _renderExitsGroupHtml('Частково перевірені', partial,    'partial')    +
    _renderExitsGroupHtml('Повністю перевірені', full,       'full');

  _bindExitsClicks(container);
}

function _exitStationRowHtml(slug, station, color, status, total, count) {
  // ── Ліва галочка (цикл: unverified → partial → … → full → unverified) ──
  const cycleColor   = (status === 'partial' || status === 'full') ? color : 'var(--text-muted)';
  const cycleOpacity = (status === 'partial' || status === 'full') ? '1' : '0.25';

  // ── Права кнопка (одразу → full) ──
  const fullColor   = status === 'full' ? color : 'var(--text-muted)';
  const fullOpacity = status === 'full' ? '1' : '0.25';

  // ── Лічильник під назвою (тільки partial) ──
  const showCounter = status === 'partial' && count > 0 && total > 0;
  const counter = showCounter
    ? `<span class="dev-exits-counter">${count}/${total}</span>`
    : '';

  return `<div class="dev-exits-row dev-exits-row--${status}" data-slug="${slug}" data-total="${total}">
    <button type="button" class="dev-exits-cycle-btn" data-slug="${slug}" data-total="${total}" aria-label="Змінити статус перевірки">
      <span class="dev-exits-check" style="color:${cycleColor}; opacity:${cycleOpacity}">${DEV_CHECK_SVG}</span>
    </button>
    <div class="dev-exits-row-center">
      <span class="dev-exits-row-name">${station.name}</span>
      ${counter}
    </div>
    <button type="button" class="dev-exits-full-btn" data-slug="${slug}" data-total="${total}" aria-label="Позначити як повністю перевірені">
      <span class="dev-exits-check" style="color:${fullColor}; opacity:${fullOpacity}">${DEV_CHECK_SVG}</span>
      <span class="dev-exits-check" style="color:${fullColor}; opacity:${fullOpacity}">${DEV_CHECK_SVG}</span>
    </button>
  </div>`;
}

function _bindExitsClicks(container) {
  container.querySelectorAll('.dev-exits-group-toggle').forEach(toggle => {
    toggle.addEventListener('click', e => {
      e.stopPropagation();
      const group = toggle.closest('.dev-exits-group');
      if (!group) return;
      const key = group.dataset.group;
      const nowOpen = group.classList.toggle('is-collapsed') === false;
      // classList.toggle повертає true якщо клас ДОДАНИЙ (тобто згорнуто)
      // тому інвертуємо: якщо клас додано — nowOpen = false
      _exitsGroupOpen[key] = !group.classList.contains('is-collapsed');
    });
  });

  container.querySelectorAll('.dev-exits-row').forEach(row => {
    row.addEventListener('click', e => {
      if (e.target.closest('.dev-exits-cycle-btn, .dev-exits-full-btn')) return;
      const { slug } = row.dataset;
      if (slug) bus.emit('station:open', { slug });
    });
  });

  container.querySelectorAll('.dev-exits-cycle-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const { slug } = btn.dataset;
      const total = Number(btn.dataset.total) || 0;
      const oldStatus = getExitsCatalogStatus(slug);
      const newStatus = cycleExitsCatalogStatus(slug, total);
      const el = document.getElementById('devMenuExits');
      if (!el) return;
      // Якщо станція переїхала до іншого розділу — відкриваємо той розділ
      const openKey = newStatus !== oldStatus ? newStatus : null;
      _renderExitsSection(el, openKey);
    });
  });

  container.querySelectorAll('.dev-exits-full-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const { slug } = btn.dataset;
      const oldStatus = getExitsCatalogStatus(slug);
      // Якщо вже full — скидаємо до unverified; інакше — одразу full
      const newStatus = oldStatus === 'full' ? 'unverified' : 'full';
      if (newStatus === 'full') {
        setExitsCatalogVerified(slug);
      } else {
        resetExitsCatalogVerified(slug);
      }
      const el = document.getElementById('devMenuExits');
      if (!el) return;
      const openKey = newStatus !== oldStatus ? newStatus : null;
      _renderExitsSection(el, openKey);
    });
  });
}

function _bindExitsLineFilter(sheet) {
  if (!sheet) return;
  const filter = sheet.querySelector('#devExitsLineFilter');
  if (!filter || filter.dataset.bound) return;
  filter.dataset.bound = '1';

  // Синхронізуємо візуальний стан кнопок зі збереженим значенням фільтра
  filter.querySelectorAll('.search-line-btn').forEach(b => {
    b.classList.toggle('is-active', b.dataset.line === _exitsLine);
  });

  filter.addEventListener('click', e => {
    const btn = e.target.closest('.search-line-btn');
    if (!btn) return;
    filter.querySelectorAll('.search-line-btn').forEach(b => b.classList.remove('is-active'));
    btn.classList.add('is-active');
    _exitsLine = btn.dataset.line;
    const el = sheet.querySelector('#devMenuExits');
    if (el) _renderExitsSection(el);
  });
}

function _renderAll(sheet) {
  const stationNotesEl = sheet.querySelector('#devMenuStationNotes');
  const exitNotesEl    = sheet.querySelector('#devMenuExitNotes');
  const verifyEl       = sheet.querySelector('#devMenuVerify');
  const backlogEl      = sheet.querySelector('#devMenuBacklog');
  const authEl         = sheet.querySelector('#devMenuAuth');

  if (stationNotesEl) {
    _renderStationNotesSection(stationNotesEl, _stationNotesLine);
    _bindStationNotesLineFilter(sheet);
  }
  if (exitNotesEl) {
    _renderExitNotesSection(exitNotesEl, _exitNotesLine);
    _bindExitNotesLineFilter(sheet);
  }
  if (verifyEl) { _renderVerificationSection(verifyEl); _bindVerifyClicks(verifyEl); _bindVerifyLineFilter(sheet); }
  const exitsEl = sheet.querySelector('#devMenuExits');
  if (exitsEl)  { _renderExitsSection(exitsEl); _bindExitsLineFilter(sheet); }
  if (backlogEl) {
    // iOS WebKit скидає позицію курсора при будь-якому .value= навіть з тим самим текстом.
    // Пропускаємо перезапис поки textarea у фокусі.
    if (document.activeElement !== backlogEl) {
      backlogEl.value = getDevBacklog();
    }
    if (!backlogEl.dataset.bound) {
      backlogEl.addEventListener('input', () => setDevBacklog(backlogEl.value));
      backlogEl.dataset.bound = '1';
    }
  }
  if (authEl) renderDevAuthSection(authEl);

  _setupCollapsibles(sheet);
}

export function openDevMenuSheet() {

  let sheet = document.getElementById('devMenuSheet');
  if (!sheet) {
    sheet = document.createElement('div');
    sheet.id        = 'devMenuSheet';
    sheet.className = 'station-sheet dev-menu-sheet';
    const template = document.getElementById('tpl-dev-menu-sheet');
    sheet.appendChild(template.content.cloneNode(true));
    document.body.appendChild(sheet);

    sheet.querySelector('#devMenuClose')?.addEventListener('click', () => {
      hideSheet(sheet);
    });

    // Перемальовуємо нотатки/верифікацію, якщо синхронізація щось підтягнула
    bus.on('devmenu:refresh', () => { if (sheet.classList.contains('sheet-open')) _renderAll(sheet); });
    bus.on('station:refresh', () => { if (sheet.classList.contains('sheet-open')) _renderAll(sheet); });
  }

  _renderAll(sheet);

  showSheet(sheet, 'sheet-fullscreen', 'sheet-scrollable');
}

// Дозволяє відкрити меню розробника зовні (наприклад, з компактної кнопки
// в About-шторці, коли розробник ще не залогінений і треба показати форму входу).
bus.on('devmenu:open', openDevMenuSheet);