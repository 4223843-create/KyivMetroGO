// ══ FEEDBACK — ПУБЛІЧНЕ API ══
// Єдина точка входу для зовнішніх модулів.

import { bus }                                   from '../../core/eventBus.js';
import { state as appState }                     from '../../core/state.js';
import { fbState, resetFbState }                 from './fbState.js';
import { submitFeedback }                        from './fbApi.js';
import { bindFeedbackSheet, markFeedbackDirty }  from './fbEvents.js';

export { renderFeedbackPositions }               from './fbRenderer.js';

bus.on('sheet:open-feedback', openFeedbackSheet);
bus.on('feedback:dirty-changed', ({ isDirty }) => { appState.hasUnsavedFeedback = isDirty; });
bus.on('feedback:submit-silent', () => submitFeedback(true));

bus.on('feedback:submit-ui', ({ status, background }) => {
  if (background) return;

  const resultEl = document.getElementById('fbResult');
  const sendBtn  = document.getElementById('fbSend');
  if (!resultEl) return;

  if (sendBtn) {
    sendBtn.disabled    = false;
    sendBtn.textContent = 'Застосувати';
  }

  if (status === 'success') {
    resultEl.innerHTML =
      '<p class="fb-note fb-success">✓ Дякуємо! Зміни надіслано та збережено локально.</p>';
  } else if (status === 'network-error') {
    resultEl.innerHTML =
      '<p class="fb-note fb-warn">Немає з\'єднання з інтернетом — зміни збережено локально ' +
      'і будуть надіслані при наступному запуску з мережею.</p>';
  } else if (status === 'local-only') {
    resultEl.innerHTML =
      '<p class="fb-note fb-success">✓ Зміни збережено локально.</p>';
  }
});

let _sheetEl    = null;   
let _sheetBound = false;  

export function openFeedbackSheet() {
  try {
    _ensureSheetDOM();            
    _resetSheetUI();              
    _openSheetDOM();              
  } catch (err) {
    console.error('[FeedbackSheet] openFeedbackSheet failed:', err);
  }
}

export function closeFeedbackSheet() {
  if (!fbState.isDirty) { _forceClose(); return; }

  const fbSlug      = document.getElementById('fbStation')?.value || '';
  const stationName = (fbSlug ? appState.stationsData?.[fbSlug]?.name : '') || '';
  const question = stationName
    ? `Зберегти зміни для станції <span style="white-space:nowrap;font-variant:small-caps;letter-spacing:0.04em;">${stationName}?</span>`
    : 'Зберегти зміни?';

  bus.emit('ui:confirm', {
    message:  question,
    onYes:    () => { submitFeedback(true); },
    onNo:     () => { resetFbState(); _forceClose(); },
    onCancel: () => {},
  });
}

function _ensureSheetDOM() {
  if (_sheetEl) return;
  _sheetEl = document.createElement('div');
  _sheetEl.id        = 'feedbackSheet';
  _sheetEl.className = 'station-sheet';
  const tpl = document.getElementById('tpl-feedback-sheet');
  _sheetEl.appendChild(tpl.content.cloneNode(true));
  document.body.appendChild(_sheetEl);
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