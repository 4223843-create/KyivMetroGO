// ══ FEEDBACK — ПУБЛІЧНЕ API ══
// Єдина точка входу для зовнішніх модулів.

import { bus }                                   from '@core/eventBus.js';
import { state as appState }                     from '@core/state.js';
import { fbState, resetFbState, computeIsDirty } from './fbState.js';
import { submitFeedback }                        from './fbApi.js';
import { bindFeedbackSheet, markFeedbackDirty }  from './fbEvents.js';

// РЕЕКСПОРТ: передаємо функцію далі назовні (для devmode.js)
export { renderFeedbackPositions }               from './fbRenderer.js';

bus.on('sheet:open-feedback', openFeedbackSheet);

// ── Синхронізація прапора для core/unsavedCheck (Dependency Rule: core не імпортує features) ──
bus.on('feedback:dirty-changed', ({ isDirty }) => { appState.hasUnsavedFeedback = isDirty; });

// ── Fire-and-forget submit із unsavedCheck (без прямого імпорту fbApi у core) ──
bus.on('feedback:submit-silent', () => submitFeedback(true));

let _sheetEl    = null;   // кешований DOM-вузол
let _sheetBound = false;  // чи вже підписані listeners

// ── Ядро: відкрити / закрити ────────────────────────────────

export function openFeedbackSheet() {
  try {
    _ensureSheetDOM();            // створює DOM + одразу bind listeners (один раз)
    _resetSheetUI();              // скидає поля, прибирає старі дані
    _openSheetDOM();              // клас .sheet-open + overlay
  } catch (err) {
    console.error('[FeedbackSheet] openFeedbackSheet failed:', err);
  }
}

export function closeFeedbackSheet() {
  if (!hasUnsavedFeedback()) { _forceClose(); return; }

  const fbSlug      = document.getElementById('fbStation')?.value || '';
  const stationName = (fbSlug ? appState.stationsData?.[fbSlug]?.name : '') || '';
  const question    = stationName
    ? `Зберегти зміни для станції <span style="white-space:nowrap;font-variant:small-caps;letter-spacing:0.04em;">${stationName}?</span>`
    : 'Зберегти зміни?';

  bus.emit('ui:confirm', {
    message:  question,
    onYes:    () => { submitFeedback(true); },
    onNo:     () => { resetFbState(); _forceClose(); },
    onCancel: () => {},
  });
}

function hasUnsavedFeedback() {
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
  // Q-4 fix: bind одразу після createElement — _resetSheetUI відповідає лише за скидання полів
  _bindOnce();
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
  document.getElementById('fbStation').value       = '';
  document.getElementById('fbLine').value          = '';
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
  bus.emit('sheet:close', { sheetEl: _sheetEl });
}
