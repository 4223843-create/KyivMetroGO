// ══ FEEDBACK EVENTS ══
// Відповідальність: event delegation + sheet lifecycle.
// Правило: не генерує HTML, не робить fetch.
//          Читає DOM → оновлює fbState → викликає callbacks.

import { state as appState }         from '../../core/state.js';
import { bus }                       from '../../core/eventBus.js';
import { STORAGE_KEYS, Storage }     from '../../core/storage.js';
import { getLocalEdits, saveExitLabel,
         clearAllLocalEdits, invalidateLocalEditsCache,
         applyLocalEdits, applyExitLabels }  from '../../data/localEdits.js';
import { fbState, syncCurrentFromDOM, computeIsDirty } from './fbState.js';
import { getAdjacentDoors, getOppositeDoors }           from './fbUtils.js';
import { renderFeedbackPositions, renderResetBtn,
         stationListHtml }                              from './fbRenderer.js';
import { initKinematicSwipe } from '../../ui/swipe.js';
import { Icons }              from '../../ui/icons.js';

// ── Внутрішні DOM-хелпери ────────────────────────────────────

/** Закриває всі відкриті підказки «+1» та info-панель */
export function closeAllHints() {
  document.getElementById('feedbackInfoPanel')?.classList.remove('fb-info-open');
  document.querySelectorAll('.fb-add-doors-hint.fb-hint-open')
    .forEach(h => h.classList.remove('fb-hint-open'));
  document.querySelectorAll('.fb-add-doors-info.is-active')
    .forEach(b => b.classList.remove('is-active'));
}

// ── Dirty-tracking ───────────────────────────────────────────

/**
 * Перераховує isDirty, синхронізує кнопку «Застосувати».
 * Єдина точка запису fbState.isDirty.
 */
export function markFeedbackDirty() {
  if (!fbState.slug) return;

  const changedLabels = [...document.querySelectorAll('.fb-exit-label-input')]
    .filter(inp => inp.dataset.changed === 'true')
    .map(inp => inp.id);

  fbState.isDirty = computeIsDirty(changedLabels);
  bus.emit('feedback:dirty-changed', { isDirty: fbState.isDirty });

  const sendBtn = document.getElementById('fbSend');
  if (sendBtn) {
    sendBtn.textContent = 'Застосувати';
    sendBtn.style.color = '';
    sendBtn.disabled    = !fbState.isDirty;
  }
}

// ── Основний bind ─────────────────────────────────────────────

/**
 * Прив'язує всі listeners до feedbackSheet.
 * Викликається ОДИН РАЗ після createElement.
 *
 * @param {HTMLElement} sheet
 * @param {{\n * onClose:  () => void,
 * onSubmit: () => void,
 * }} callbacks
 */
export function bindFeedbackSheet(sheet, { onClose, onSubmit }) {
  const posEl         = document.getElementById('fbPositions');
  const sendBtn       = document.getElementById('fbSend');
  const stationHidden = document.getElementById('fbStation');
  const lineHidden    = document.getElementById('fbLine');
  const lineFilter    = document.getElementById('fbLineFilter');
  const stationList   = document.getElementById('fbStationList');

  const afterRender = () => markFeedbackDirty();

  // ── Вибір лінії ──────────────────────────────────────
  lineFilter.addEventListener('click', e => {
    const btn = e.target.closest('.search-line-btn');
    if (!btn) return;

    const line = btn.dataset.line;
    lineFilter.querySelectorAll('.search-line-btn').forEach(b => b.classList.remove('is-active'));
    btn.classList.add('is-active');
    lineHidden.value     = line;
    stationHidden.value  = '';
    posEl.innerHTML      = '';
    sendBtn.disabled     = true;
    fbState.isDirty      = false;
    closeAllHints();

    stationList.innerHTML = stationListHtml(line);
    stationList.hidden    = false;

    renderResetBtn({
      onReset: _handleReset.bind(null, afterRender),
    });
  });

  // ── Вибір станції ─────────────────────────────────────
  stationList.addEventListener('click', e => {
    const item = e.target.closest('.fb-station-item');
    if (!item) return;

    stationHidden.value = item.dataset.slug;
    stationList.hidden  = true;
    document.getElementById('fbLineFilterWrap').hidden = true;
    document.getElementById('fbChangeStation').hidden  = false;
    fbState.isDirty = false;
    closeAllHints();
    renderFeedbackPositions(stationHidden.value, { onAfterRender: afterRender });
  });

  // ── «Змінити станцію» ─────────────────────────────────
  document.getElementById('fbChangeStation').addEventListener('click', () => {
    document.getElementById('fbLineFilterWrap').hidden = false;
    document.getElementById('fbChangeStation').hidden  = true;
    document.getElementById('fbStationTitle').hidden   = true;
    document.getElementById('fbSheetTitle').hidden     = false;

    stationHidden.value  = '';
    posEl.innerHTML      = '';
    stationList.hidden   = false;
    sendBtn.disabled     = true;
  });

  // ── Event delegation: posEl (stepper, кнопки позицій) ─
  posEl.addEventListener('click', e => _handlePosClick(e, stationHidden, afterRender));

  // ── Event delegation: label inputs ────────────────────
  posEl.addEventListener('change', e => {
    const input = e.target.closest('.fb-exit-label-input');
    if (!input) return;
    _handleLabelChange(input, stationHidden.value);
    afterRender();
  });

  // ── Submit ────────────────────────────────────────────
  sendBtn.addEventListener('click', onSubmit);

  // ── Закрити ───────────────────────────────────────────
  document.getElementById('feedbackClose').addEventListener('click', onClose);

  // ── Swipe — один раз, getter щоб завжди брати актуальний body ─
  initKinematicSwipe(
    sheet,
    () => document.getElementById('feedbackBody'),
    onClose,
  );
}

// ── Приватні обробники ────────────────────────────────────────

/** Delegation: клік у зоні posEl */
function _handlePosClick(e, stationHidden, afterRender) {
  const slug = stationHidden.value;
  if (!slug) return;

  // Відновити закритий вихід
  const restoreBtn = e.target.closest('.fb-restore-exit');
  if (restoreBtn) {
    e.preventDefault(); e.stopPropagation();
    _handleRestore(restoreBtn.dataset.idx, slug, afterRender);
    return;
  }

  // Закрити / прибрати вихід
  const closeBtn = e.target.closest('.fb-close-exit');
  if (closeBtn) {
    _handleCloseExit(parseInt(closeBtn.dataset.idx), slug, afterRender);
    return;
  }

  // Скасувати другі двері
  const cancelExtraBtn = e.target.closest('.fb-cancel-extra-btn');
  if (cancelExtraBtn) {
    _cancelExtra(cancelExtraBtn.dataset.idx);
    afterRender();
    return;
  }

  // Скасувати треті двері
  const cancelThirdBtn = e.target.closest('.fb-cancel-third-btn');
  if (cancelThirdBtn) {
    _cancelThird(cancelThirdBtn.dataset.idx);
    afterRender();
    return;
  }

  // Stepper ±
  const stepBtn = e.target.closest('.fb-step');
  if (stepBtn) {
    _handleStep(stepBtn);
    afterRender();
    return;
  }

  // Info-підказка
  const infoBtn = e.target.closest('.fb-add-doors-info');
  if (infoBtn) {
    const hint   = document.getElementById(`fbHint${infoBtn.dataset.idx}`);
    if (!hint) return;
    const isOpen = hint.classList.contains('fb-hint-open');
    closeAllHints();
    if (!isOpen) { hint.classList.add('fb-hint-open'); infoBtn.classList.add('is-active'); }
    return;
  }

  // Редагувати / додати опис виходу
  const labelBtn = e.target.closest('.fb-exit-label-edit-btn, .fb-add-desc-btn');
  if (labelBtn) {
    _toggleLabelInput(labelBtn.dataset.itemIdx);
    return;
  }

  // Додати новий вихід
  const addExitBtn = e.target.closest('.fb-add-exit-btn');
  if (addExitBtn) {
    _handleAddExit(addExitBtn.dataset.dir, slug, afterRender);
    return;
  }

  // Показати другі двері
  const addDoorsBtn = e.target.closest('.fb-add-doors-link');
  if (addDoorsBtn) {
    _handleAddDoors(addDoorsBtn.dataset.idx);
    afterRender();
  }
}

// ── Атомарні обробники ─────────────────────────────────────────

function _handleRestore(idx, slug, afterRender) {
  const edits = getLocalEdits();
  if (edits[slug]?.[idx]) {
    delete edits[slug][idx];
    if (!Object.keys(edits[slug]).length) delete edits[slug];
    if (!Object.keys(edits).length)       clearAllLocalEdits();
    else Storage.set(STORAGE_KEYS.LOCAL_EDITS, JSON.stringify(edits));
  }
  invalidateLocalEditsCache();
  if (fbState.current[idx]) fbState.current[idx].isClosed = false;
  applyLocalEdits(appState.stationsData);
  bus.emit('station:refresh');
  renderFeedbackPositions(slug, { onAfterRender: afterRender });
  renderResetBtn({ onReset: () => _handleReset(afterRender) });
}

function _handleCloseExit(idx, slug, afterRender) {
  if (fbState.current[idx]?.isNew) {
    delete fbState.current[idx];
    delete fbState.labels[idx];
    delete fbState.original[idx];
    const edits = getLocalEdits();
    if (edits[slug]?.[idx]) {
      delete edits[slug][idx];
      if (!Object.keys(edits[slug]).length) delete edits[slug];
      if (!Object.keys(edits).length)       clearAllLocalEdits();
      else Storage.set(STORAGE_KEYS.LOCAL_EDITS, JSON.stringify(edits));
    }
    renderFeedbackPositions(slug, { onAfterRender: afterRender });
    renderResetBtn({ onReset: () => _handleReset(afterRender) });
    return;
  }

  const exWrap = document.getElementById(`fbExtraWrap${idx}`);
  if (exWrap && !exWrap.classList.contains('is-hidden')) {
    document.getElementById(`fbW${idx}`).textContent = document.getElementById(`fbW_ex${idx}`).textContent;
    document.getElementById(`fbD${idx}`).textContent = document.getElementById(`fbD_ex${idx}`).textContent;
    document.getElementById(`fbW_ex${idx}`).textContent = '-';
    document.getElementById(`fbD_ex${idx}`).textContent = '-';
    exWrap.classList.add('is-hidden');
    document.getElementById(`fbAddDoorsRow${idx}`)?.classList.remove('is-hidden');
    document.getElementById(`fbItemInner${idx}`)?.classList.remove('has-extra-doors');
    syncCurrentFromDOM(idx);
    afterRender();
    return;
  }

  const p = appState.stationsData[fbState.slug]?.positions[idx];
  if (!p) return;
  saveLocalEdit(slug, idx, { wagon: p.wagon, doors: p.doors, closed: true });
  applyLocalEdits(appState.stationsData);
  invalidateLocalEditsCache();
  fbState.current[idx].isClosed = true;
  bus.emit('station:refresh');
  renderFeedbackPositions(slug, { onAfterRender: afterRender });
  renderResetBtn({ onReset: () => _handleReset(afterRender) });
}

function _cancelExtra(idx) {
  document.getElementById(`fbW_ex${idx}`).textContent = '-';
  document.getElementById(`fbD_ex${idx}`).textContent = '-';
  document.getElementById(`fbExtraWrap${idx}`).classList.add('is-hidden');

  const w2 = document.getElementById(`fbExtraWrap2_${idx}`);
  if (w2) {
    document.getElementById(`fbW_ex2_${idx}`).textContent = '-';
    document.getElementById(`fbD_ex2_${idx}`).textContent = '-';
    w2.classList.add('is-hidden');
  }

  document.getElementById(`fbAddDoorsRow${idx}`)?.classList.remove('is-hidden');
  document.getElementById(`fbItemInner${idx}`)?.classList.remove('has-extra-doors');
  syncCurrentFromDOM(parseInt(idx));
}

function _cancelThird(idx) {
  document.getElementById(`fbW_ex2_${idx}`).textContent = '-';
  document.getElementById(`fbD_ex2_${idx}`).textContent = '-';
  document.getElementById(`fbExtraWrap2_${idx}`).classList.add('is-hidden');

  const addBtn = document.getElementById(`fbAddBtn${idx}`);
  if (addBtn?.dataset.canHaveThird === '1') {
    document.getElementById(`fbAddDoorsRow${idx}`)?.classList.remove('is-hidden');
  }
  syncCurrentFromDOM(parseInt(idx));
}

function _handleStep(btn) {
  const id  = btn.dataset.id;
  const el  = document.getElementById(id);
  if (!el) return;

  const isExtra = id.includes('_ex');
  const idx     = parseInt(id.replace(/[^0-9]/g, ''));

  if (isExtra) {
    const mainW = parseInt(document.getElementById(`fbW${idx}`).textContent);
    const mainD = parseInt(document.getElementById(`fbD${idx}`).textContent);
    const adj   = getAdjacentDoors(mainW, mainD);

    let curW = document.getElementById(`fbW_ex${idx}`).textContent;
    let curD = document.getElementById(`fbD_ex${idx}`).textContent;

    if (curW === '-' || curD === '-') {
      curW = adj[0].w; curD = adj[0].d;
    } else {
      curW = parseInt(curW); curD = parseInt(curD);
      const curIdx = adj.findIndex(a => a.w === curW && a.d === curD);
      const step   = btn.classList.contains('fb-step-up') ? 1 : -1;
      const nextI  = curIdx === -1 ? 0 : (curIdx + step + adj.length) % adj.length;
      curW = adj[nextI].w; curD = adj[nextI].d;
    }

    document.getElementById(`fbW_ex${idx}`).textContent = curW;
    document.getElementById(`fbD_ex${idx}`).textContent = curD;

    const ex2W  = document.getElementById(`fbW_ex2_${idx}`);
    const ex2D  = document.getElementById(`fbD_ex2_${idx}`);
    const wrap2 = document.getElementById(`fbExtraWrap2_${idx}`);
    if (ex2W && ex2D && wrap2 && !wrap2.classList.contains('is-hidden')) {
      const adj3     = getAdjacentDoors(curW, curD);
      const validAdj = adj3.filter(a => !(a.w === mainW && a.d === mainD));
      if (validAdj.length) { ex2W.textContent = validAdj[0].w; ex2D.textContent = validAdj[0].d; }
    }
  } else {
    const min = parseInt(btn.dataset.min);
    const max = parseInt(btn.dataset.max);
    let val   = parseInt(el.textContent) + (btn.classList.contains('fb-step-up') ? 1 : -1);
    el.textContent = Math.max(min, Math.min(max, val));
  }

  syncCurrentFromDOM(idx);
}

function _handleLabelChange(input, slug) {
  input.dataset.changed = 'true';
  const wrapId = input.id.replace('fbLabelInput', '');
  if (slug && wrapId !== '') saveExitLabel(slug, parseInt(wrapId), input.value);

  const wrap = document.getElementById(`fbLabelWrap${wrapId}`);
  const row  = wrap?.previousElementSibling;
  if (!row?.classList.contains('fb-exit-label-row')) return;

  const textSpan = row.querySelector('.fb-exit-label-text');
  if (textSpan) textSpan.textContent = input.value.trim();

  const editBtn = row.querySelector('.fb-exit-label-edit-btn, .fb-add-desc-btn');
  if (!editBtn) return;
  if (input.value.trim()) {
    editBtn.className = 'fb-exit-label-edit-btn';
    editBtn.innerHTML = Icons.pencil;
    editBtn.setAttribute('aria-label', 'Редагувати');
    editBtn.removeAttribute('style');
  } else {
    editBtn.className   = 'fb-add-desc-btn';
    editBtn.textContent = 'додати опис';
  }

  if (appState.stationsData) applyExitLabels(appState.stationsData);
  bus.emit('station:refresh');
}

function _toggleLabelInput(itemIdx) {
  const wrap  = document.getElementById(`fbLabelWrap${itemIdx}`);
  const input = document.getElementById(`fbLabelInput${itemIdx}`);
  if (!wrap || !input) return;

  const isOpen = wrap.classList.contains('label-input-open');
  document.querySelectorAll('.fb-exit-label-input-wrap.label-input-open').forEach(w => {
    if (w !== wrap) w.classList.remove('label-input-open');
  });

  if (!isOpen) {
    wrap.classList.add('label-input-open');
    setTimeout(() => input.focus(), 250);
  } else {
    wrap.classList.remove('label-input-open');
  }
}

function _handleAddExit(dir, slug, afterRender) {
  const newIdx   = Object.keys(fbState.current).length;
  const sameDir  = Object.values(fbState.current).filter(s => s.dir === dir && !s.isNew);
  const { w, d } = sameDir.length
    ? getOppositeDoors(sameDir[0].wMain, sameDir[0].dMain)
    : { w: 1, d: 1 };

  fbState.current[newIdx] = {
    wMain: w, dMain: d, wEx: '-', dEx: '-', wEx2: '-', dEx2: '-',
    hasExtra: false, hasThird: false, isClosed: false, isNew: true, dir,
  };
  fbState.labels[newIdx] = '';

  renderFeedbackPositions(fbState.slug, { onAfterRender: afterRender });
  setTimeout(() =>
    document.querySelector(`.fb-add-desc-btn[data-item-idx="${newIdx}"]`)?.click(), 100);
}

function _handleAddDoors(idx) {
  document.getElementById(`fbExtraWrap${idx}`)?.classList.remove('is-hidden');
  document.getElementById(`fbAddDoorsRow${idx}`)?.classList.add('is-hidden');
  document.getElementById(`fbItemInner${idx}`)?.classList.add('has-extra-doors');

  const mainW = parseInt(document.getElementById(`fbW${idx}`).textContent);
  const mainD = parseInt(document.getElementById(`fbD${idx}`).textContent);
  const adj   = getAdjacentDoors(mainW, mainD);

  document.getElementById(`fbW_ex${idx}`).textContent = adj[0].w;
  document.getElementById(`fbD_ex${idx}`).textContent = adj[0].d;
  syncCurrentFromDOM(parseInt(idx));
}

function _handleReset(afterRender) {
  bus.emit('ui:confirm', {
    message: 'Скинути всі локальні зміни та повернутись до стандартних даних?',
    onYes: async () => {
      clearAllLocalEdits();
      bus.emit('data:reload-stations', {
        onDone: () => {
          document.getElementById('fbResetWrap').innerHTML =
            '<p class="fb-note fb-success">✓ Локальні зміни скинуто.</p>';
          renderFeedbackPositions(fbState.slug, { onAfterRender: afterRender });
        },
      });
    },
    onNo:     () => {},
    onCancel: () => {},
  });
}