// ══ FEEDBACK — ПУБЛІЧНЕ API ══
// Єдина точка входу для зовнішніх модулів.
// Містить MetroApp-сумісний фасад для поетапної міграції.

import { bus }                       from '@core/eventBus.js';
import { state as appState }         from '@core/state.js';
import { fbState, resetFbState, computeIsDirty } from './fbState.js';
import { submitFeedback }            from './fbApi.js';
import { renderFeedbackPositions }   from './fbRenderer.js';
import { bindFeedbackSheet, markFeedbackDirty } from './fbEvents.js';

let _sheetEl         = null;   // кешований DOM-вузол
let _sheetBound      = false;  // чи вже підписані listeners

// ── Ядро: відкрити / закрити ────────────────────────────────

export function openFeedbackSheet() {
  try {
    _ensureSheetDOM();            // створює + bind listeners (один раз)
    _resetSheetUI();              // скидає поля, прибирає старі дані
    _openSheetDOM();              // клас .sheet-open + overlay
  } catch (err) {
    console.error('[FeedbackSheet] openFeedbackSheet failed:', err);
  }
}

export function closeFeedbackSheet() {
  if (!hasUnsavedFeedback()) { _forceClose(); return; }

  const slug = document.getElementById('fbStation')?.value || '';
  const name = (slug ? appState.stationsData?.[slug]?.name : '') || '';
  const q    = name
    ? `Зберегти зміни для станції <span style="white-space:nowrap">${name}?</span>`
    : 'Зберегти зміни?';

  // Використовуємо bus замість MetroApp.showCustomConfirm
  bus.emit('ui:confirm', {
    message:  q,
    onYes:    () => { submitFeedback(true); _forceClose(); },
    onNo:     () => { resetFbState(); _forceClose(); },
    onCancel: () => {},
  });
}

export function hasUnsavedFeedback() {
  return fbState.isDirty;
}

// ── Внутрішні хелпери ───────────────────────────────────────

function _ensureSheetDOM() {
  if (_sheetEl) return;
  _sheetEl = document.createElement('div');
  _sheetEl.id        = 'feedbackSheet';
  _sheetEl.className = 'station-sheet';
  const tpl = document.getElementById('tpl-feedback-sheet');
  _sheetEl.appendChild(tpl.content.cloneNode(true));
  document.body.appendChild(_sheetEl);
}

function _bindOnce() {
  if (_sheetBound) return;
  _sheetBound = true;
  bindFeedbackSheet(_sheetEl, {
    onClose:  closeFeedbackSheet,
    onSubmit: () => submitFeedback(false),
    onDirty:  markFeedbackDirty,
  });
}

function _resetSheetUI() {
  _bindOnce();  // гарантовано після createElement
  document.getElementById('fbStation').value   = '';
  document.getElementById('fbLine').value      = '';
  document.getElementById('fbPositions').innerHTML = '';
  document.getElementById('fbResult').innerHTML    = '';
  const changeBtn      = document.getElementById('fbChangeStation');
  const lineFilterWrap = document.getElementById('fbLineFilterWrap');
  const sendBtn        = document.getElementById('fbSend');
  if (changeBtn)      changeBtn.hidden      = true;
  if (lineFilterWrap) lineFilterWrap.hidden = false;
  if (sendBtn) { sendBtn.textContent = 'Застосувати'; sendBtn.disabled = true; sendBtn.style.color = ''; }
  // Клік по «Всі лінії» — показати список станцій
  document.querySelector('#fbLineFilter .search-line-btn[data-line=""]')?.click();
}

function _openSheetDOM() {
  document.querySelectorAll('.station-sheet').forEach(el => el.classList.remove('sheet-open'));
  _sheetEl.classList.add('sheet-open');
  document.getElementById('sheetOverlay').classList.add('overlay-visible');
}

function _forceClose() {
  resetFbState();
  // Анімація через bus — не через MetroApp напряму
  bus.emit('sheet:close', { sheetEl: _sheetEl });
}

// ── Підписка на зовнішні події ──────────────────────────────
// stationSheet.js емітить 'station:refresh' — ми нічого не робимо.
// Але якщо хтось емітить 'ui:confirm' — confirm.js обробляє.

// ── MetroApp-сумісний фасад (перехідний шар) ────────────────
// TODO: після міграції всіх викликів — видалити цей блок.
MetroApp.openFeedbackSheet    = openFeedbackSheet;
MetroApp.closeFeedbackSheet   = closeFeedbackSheet;
MetroApp.hasUnsavedFeedback   = () => hasUnsavedFeedback();
MetroApp.triggerFeedbackSubmit = submitFeedback;
MetroApp._renderFeedbackPositions = renderFeedbackPositions; // для devmode.js

// ── Підключення слухачів bus у зовнішніх модулях ────────────
// stationSheet.js має замінити:
//   MetroApp.refreshCurrentStation?.()
// на:
//   bus.emit('station:refresh')
// і підписатись:
//   bus.on('station:refresh', refreshCurrentStation)
//
// confirm.js має підписатись:
//   bus.on('ui:confirm', ({ message, onYes, onNo, onCancel }) =>
//     showCustomConfirm(message, onYes, onNo, onCancel))