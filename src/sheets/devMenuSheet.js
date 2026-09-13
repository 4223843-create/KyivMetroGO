// ══ МЕНЮ РОЗРОБНИКА ══
// Окрема повноекранна шторка, доступна плаваючою кнопкою зверху карти
// (лише коли Dev Mode активний). Секції: авторизація/синхронізація Firebase,
// узагальнені нотатки по всіх станціях, список непозначених-як-перевірені
// виходів, і простий беклог ідей.

import { state }   from '../core/state.js';
import { bus }     from '../core/eventBus.js';
import { LINE_COLOR } from '../core/constants.js';
import { pushSheetHistory }  from '../ui/system.js';
import { animateSheetClose } from '../ui/animations.js';
import { getPositionDescriptorsForStation } from './renderStation.js';
import {
  renderDevAuthSection, getAllDevNotes, getAllDevVerified,
  getDevBacklog, setDevBacklog, isVerified,
} from '../features/devmode.js';

const sheetOverlay = document.getElementById('sheetOverlay');

// ── Допоміжне: один рядок "станція → вихід" клікабельний до відкриття станції ──
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
 * Будує вміст секції "Потребують перевірки" — усі позиції всіх станцій,
 * яких немає в DEV_VERIFIED. Проходить кожну станцію зі state.stationsData.
 */
function _renderVerificationSection(container) {
  const stationsData = state.stationsData || {};
  let html = '';

  for (const slug of Object.keys(stationsData)) {
    const station = stationsData[slug];
    const color   = LINE_COLOR[station.line] || '#888888';
    const descriptors = getPositionDescriptorsForStation(station, color);

    const rows = descriptors
      .filter(d => !isVerified(slug, d.posIdx))
      .map(d => _rowHtml(slug, station.name, d))
      .join('');

    if (rows) html += `<div class="dev-menu-group">${rows}</div>`;
  }

  container.innerHTML = html || `<div class="dev-menu-empty">Усі виходи позначені як перевірені 🎉</div>`;
}

function _bindRowClicks(container) {
  container.querySelectorAll('.dev-menu-row').forEach(row => {
    row.addEventListener('click', () => {
      const slug = row.dataset.slug;
      if (slug) bus.emit('station:open', { slug });
    });
  });
}

function _renderAll(sheet) {
  const notesEl  = sheet.querySelector('#devMenuNotes');
  const verifyEl = sheet.querySelector('#devMenuVerify');
  const backlogEl = sheet.querySelector('#devMenuBacklog');
  const authEl   = sheet.querySelector('#devMenuAuth');

  if (notesEl)  { _renderNotesSection(notesEl);  _bindRowClicks(notesEl); }
  if (verifyEl) { _renderVerificationSection(verifyEl); _bindRowClicks(verifyEl); }
  if (backlogEl && !backlogEl.dataset.bound) {
    backlogEl.value = getDevBacklog();
    backlogEl.addEventListener('input', () => setDevBacklog(backlogEl.value));
    backlogEl.dataset.bound = '1';
  }
  if (authEl) renderDevAuthSection(authEl);
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