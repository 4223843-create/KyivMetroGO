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
import { pushSheetHistory }  from '../ui/system.js';
import { animateSheetClose } from '../ui/animations.js';
import { getPositionDescriptorsForStation } from './renderStation.js';
import {
  renderDevAuthSection, getAllDevNotes, getAllStationNotes,
  getDevBacklog, setDevBacklog, isVerified,
  getExitsCatalogStatus, getExitsCatalogCount, cycleExitsCatalogStatus,
  setExitsCatalogVerified, resetExitsCatalogVerified,
} from '../features/devmode.js';

const sheetOverlay = document.getElementById('sheetOverlay');

// Активний фільтр по гілці для секції "Потребують перевірки" —
// живе тільки на час відкритої шторки, не зберігається між сесіями.
let _verifyLine = '';
let _exitsLine  = '';

// ── Допоміжне: один рядок "станція → вихід" для секції "Нотатки" ──
function _rowHtml(slug, stationName, descriptor, extra) {
  const parts = [descriptor.dirFrom, descriptor.exitLabel].filter(Boolean).join(' · ');
  return `<button type="button" class="dev-menu-row" data-slug="${slug}">
    <div class="dev-menu-row-station">${stationName}</div>
    <div class="dev-menu-row-detail">${parts || 'вихід'} (${descriptor.wagonDoors || '—'})</div>
    ${extra ? `<div class="dev-menu-row-extra">${extra}</div>` : ''}
  </button>`;
}

/**
 * Будує вміст секції "Нотатки" — усі DEV_NOTES, розшифровані у людський
 * опис через getPositionDescriptorsForStation, згруповані по станції.
 */
function _renderNotesSection(container) {
  const notes        = getAllDevNotes();
  const stationNotes = getAllStationNotes();
  const slugs = new Set([...Object.keys(notes), ...Object.keys(stationNotes)]);

  if (!slugs.size) {
    container.innerHTML = `<div class="dev-menu-empty">Нотаток ще немає</div>`;
    return;
  }

  let html = '';
  for (const slug of slugs) {
    const station = state.stationsData?.[slug];
    if (!station) continue;
    const color       = LINE_COLOR[station.line] || '#888888';
    const descriptors = getPositionDescriptorsForStation(station, color);

    let rows = '';

    // Загальна нотатка станції — окремим рядком, без прив'язки до виходу
    if (stationNotes[slug]) {
      rows += `<button type="button" class="dev-menu-row" data-slug="${slug}">
        <div class="dev-menu-row-station">${station.name}</div>
        <div class="dev-menu-row-detail">загальна нотатка станції</div>
        <div class="dev-menu-row-extra">«${stationNotes[slug]}»</div>
      </button>`;
    }

    rows += Object.entries(notes[slug] || {}).map(([posIdx, text]) => {
      const d = descriptors[Number(posIdx)];
      if (!d) return '';
      return _rowHtml(slug, station.name, d, `«${text}»`);
    }).filter(Boolean).join('');

    if (rows) html += `<div class="dev-menu-group">${rows}</div>`;
  }

  container.innerHTML = html || `<div class="dev-menu-empty">Нотаток ще немає</div>`;
}

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
      const unverified   = descriptors.filter(d => !isVerified(slug, d.posIdx));
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
  const notesEl   = sheet.querySelector('#devMenuNotes');
  const verifyEl  = sheet.querySelector('#devMenuVerify');
  const backlogEl = sheet.querySelector('#devMenuBacklog');
  const authEl    = sheet.querySelector('#devMenuAuth');

  if (notesEl)  { _renderNotesSection(notesEl);  _bindNotesClicks(notesEl); }
  if (verifyEl) { _renderVerificationSection(verifyEl); _bindVerifyClicks(verifyEl); _bindVerifyLineFilter(sheet); }
  const exitsEl  = sheet.querySelector('#devMenuExits');
  if (exitsEl)  { _renderExitsSection(exitsEl); _bindExitsLineFilter(sheet); }
  if (backlogEl) {
    // Оновлюємо значення поля актуальними даними при кожному відкритті/рендері
    backlogEl.value = getDevBacklog();
    if (!backlogEl.dataset.bound) {
      backlogEl.addEventListener('input', () => setDevBacklog(backlogEl.value));
      backlogEl.dataset.bound = '1';
    }
  }
  if (authEl) renderDevAuthSection(authEl);

  _setupCollapsibles(sheet);
}

export function openDevMenuSheet() {
  pushSheetHistory();

  let sheet = document.getElementById('devMenuSheet');
  if (!sheet) {
    sheet = document.createElement('div');
    sheet.id        = 'devMenuSheet';
    sheet.className = 'station-sheet dev-menu-sheet';
    const template = document.getElementById('tpl-dev-menu-sheet');
    sheet.appendChild(template.content.cloneNode(true));
    document.body.appendChild(sheet);

    sheet.querySelector('#devMenuClose')?.addEventListener('click', () => {
      animateSheetClose(sheet, () => {
        sheet.classList.remove('sheet-open');
        if (!document.querySelectorAll('.station-sheet.sheet-open').length)
          sheetOverlay.classList.remove('overlay-visible');
      });
    });

    // Перемальовуємо нотатки/верифікацію, якщо синхронізація щось підтягнула
    bus.on('devmenu:refresh', () => { if (sheet.classList.contains('sheet-open')) _renderAll(sheet); });
    bus.on('station:refresh', () => { if (sheet.classList.contains('sheet-open')) _renderAll(sheet); });
  }

  _renderAll(sheet);

  document.querySelectorAll('.station-sheet').forEach(el => el.classList.remove('sheet-open'));
  sheet.classList.add('sheet-open', 'sheet-fullscreen', 'sheet-scrollable');
  sheetOverlay.classList.add('overlay-visible');
}

// Дозволяє відкрити меню розробника зовні (наприклад, з компактної кнопки
// в About-шторці, коли розробник ще не залогінений і треба показати форму входу).
bus.on('devmenu:open', openDevMenuSheet);
