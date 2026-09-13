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
  renderDevAuthSection, getAllDevNotes, getAllDevVerified,
  getDevBacklog, setDevBacklog, isVerified,
} from '../features/devmode.js';

const sheetOverlay = document.getElementById('sheetOverlay');

// Активний фільтр по гілці для секції "Потребують перевірки" —
// живе тільки на час відкритої шторки, не зберігається між сесіями.
let _verifyLine = '';

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
  const notes = getAllDevNotes();
  const slugs = Object.keys(notes);

  if (!slugs.length) {
    container.innerHTML = `<div class="dev-menu-empty">Нотаток ще немає</div>`;
    return;
  }

  let html = '';
  for (const slug of slugs) {
    const station = state.stationsData?.[slug];
    if (!station) continue;
    const color       = LINE_COLOR[station.line] || '#888888';
    const descriptors = getPositionDescriptorsForStation(station, color);

    const rows = Object.entries(notes[slug]).map(([posIdx, text]) => {
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

function _renderAll(sheet) {
  const notesEl   = sheet.querySelector('#devMenuNotes');
  const verifyEl  = sheet.querySelector('#devMenuVerify');
  const backlogEl = sheet.querySelector('#devMenuBacklog');
  const authEl    = sheet.querySelector('#devMenuAuth');

  if (notesEl)  { _renderNotesSection(notesEl);  _bindNotesClicks(notesEl); }
  if (verifyEl) { _renderVerificationSection(verifyEl); _bindVerifyClicks(verifyEl); _bindVerifyLineFilter(sheet); }
  if (backlogEl && !backlogEl.dataset.bound) {
    backlogEl.value = getDevBacklog();
    backlogEl.addEventListener('input', () => setDevBacklog(backlogEl.value));
    backlogEl.dataset.bound = '1';
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