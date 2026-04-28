import { STORAGE_KEYS, Storage } from './storage.js';
import { state } from './state.js';

const FORMSPREE_URL = 'https://formspree.io/f/mgopobnd';
const LINE_NAMES = { red: 'Червона', blue: 'Синя', green: 'Зелена' };
const STATIONS_CAN_ADD_EXIT = new Set(['R.Zhytomyrska', 'G.Osokorky', 'G.Chervonyi_khutir']);

// =========================================================
// РОБОТА З ДАНИМИ ТА КЕШЕМ
// =========================================================
let localEditsCache = null;
let exitLabelsCache = null;
MetroApp.fbUnsaved = false;
MetroApp.invalidateLocalEditsCache = () => { localEditsCache = null; exitLabelsCache = null; };

function getExitLabels() {
  if (exitLabelsCache) return exitLabelsCache;
  try { exitLabelsCache = JSON.parse(Storage.get(STORAGE_KEYS.EXIT_LABELS) || '{}'); }
  catch (e) { console.warn('[KyivMetroGO] Помилка парсингу описів виходів:', e); exitLabelsCache = {}; }
  return exitLabelsCache;
}

function saveExitLabel(slug, posIdx, label) {
  const labels = getExitLabels();
  if (!labels[slug]) labels[slug] = {};
  if (label.trim()) labels[slug][posIdx] = label.trim();
  else { delete labels[slug][posIdx]; if (!Object.keys(labels[slug]).length) delete labels[slug]; }
  Storage.set(STORAGE_KEYS.EXIT_LABELS, JSON.stringify(labels));
  exitLabelsCache = null;
}

MetroApp.getExitLabel = function(slug, posIdx) {
  return getExitLabels()[slug]?.[posIdx] ?? null;
};

MetroApp.applyExitLabels = function(stationsData) {
  const labels = getExitLabels();
  for (const [slug, posLabels] of Object.entries(labels)) {
    if (!stationsData[slug]) continue;
    let posIdx = 0;
    for (const dir of stationsData[slug].directions) {
      for (const exit of dir.exits) {
        if (posLabels[posIdx] !== undefined) exit.label = posLabels[posIdx];
        for (let i = 0; i < exit.positions.length; i++) posIdx++;
      }
    }
  }
};

function getLocalEdits() {
  if (localEditsCache) return localEditsCache;
  try { localEditsCache = JSON.parse(Storage.get(STORAGE_KEYS.LOCAL_EDITS) || '{}'); }
  catch (e) { console.warn('[KyivMetroGO] Помилка парсингу локальних змін:', e); localEditsCache = {}; }
  return localEditsCache;
}

function saveLocalEdit(slug, posIdx, data) {
  const edits = getLocalEdits();
  if (!edits[slug]) edits[slug] = {};
  edits[slug][posIdx] = data;
  Storage.set(STORAGE_KEYS.LOCAL_EDITS, JSON.stringify(edits));
}

function clearAllLocalEdits() {
  localEditsCache = null;
  Storage.remove(STORAGE_KEYS.LOCAL_EDITS);
}

function hasLocalEdits() { return Object.keys(getLocalEdits()).length > 0; }

MetroApp.applyLocalEdits = function(stationsData) {
  const edits = getLocalEdits();
  for (const [slug, posEdits] of Object.entries(edits)) {
    if (!stationsData[slug]) continue;
    const s = stationsData[slug];
    
    let posIdx = 0;
    for (const dir of s.directions) {
      for (const exit of dir.exits) {
        for (let i = 0; i < exit.positions.length; i++) {
          if (posEdits[posIdx] !== undefined && !posEdits[posIdx].isNew) {
            exit.positions[i] = { ...exit.positions[i], ...posEdits[posIdx], _edited: true, _slug: slug, _posIdx: posIdx };
          }
          posIdx++;
        }
      }
    }

    Object.keys(posEdits).forEach(idx => {
      const edit = posEdits[idx];
      if (edit.isNew) {
        const targetDir = s.directions.find(d => d.from === edit.dir);
        if (targetDir) {
          const newExit = {
            label: edit.label || '',
            positions: [{ wagon: String(edit.wagon), doors: String(edit.doors), _edited: true, _slug: slug, _posIdx: parseInt(idx) }]
          };
          targetDir.exits.push(newExit);
          s.positions.push({ dir: edit.dir, exit: newExit.label, wagon: String(edit.wagon), doors: String(edit.doors) });
        }
      }
    });
  }
};

// =========================================================
// УПРАВЛІННЯ СТАНОМ ФОРМИ
// =========================================================
const fbState = {
  slug: null,
  original: {},
  current: {},
  labels: {},
  isDirty: false
};

function initFeedbackState(slug) {
  fbState.slug = slug;
  fbState.original = {};
  fbState.current = {};
  fbState.labels = {};
  fbState.isDirty = false;

  if (!slug || !state.stationsData[slug]) return;

  const s = state.stationsData[slug];
  const edits = getLocalEdits()[slug] || {};

  s.positions.forEach((p, i) => {
    const rawW = String(edits[i]?.wagon ?? p.wagon);
    const rawD = String(edits[i]?.doors ?? p.doors);
    const parsed = parseDoorValues(rawW, rawD);
    
    fbState.original[i] = { ...parsed, isClosed: !!edits[i]?.closed };
    fbState.current[i] = JSON.parse(JSON.stringify(fbState.original[i]));
    fbState.labels[i] = MetroApp.getExitLabel(slug, i) ?? (p.exit ? p.exit.trim() : '');
  });

  MetroApp.fbUnsaved = false;
}

function syncCurrentStateFromDOM(idx) {
  const cur = fbState.current[idx];
  if (!cur) return;
  const rd = (id) => document.getElementById(id)?.textContent ?? '-';
  cur.wMain = rd(`fbW${idx}`);
  cur.dMain = rd(`fbD${idx}`);
  cur.wEx   = rd(`fbW_ex${idx}`);
  cur.dEx   = rd(`fbD_ex${idx}`);
  cur.wEx2  = rd(`fbW_ex2_${idx}`);
  cur.dEx2  = rd(`fbD_ex2_${idx}`);
}

function markFeedbackDirty() {
  if (!fbState.slug) return;
  let isDirty = false;

  for (const i in fbState.current) {
    if (fbState.current[i] && fbState.current[i].isNew) { isDirty = true; break; }
  }

  if (!isDirty) {
    for (const i in fbState.original) {
      const orig = fbState.original[i];
      const cur = fbState.current[i];
      if (!cur) continue;
      if (
        String(orig.wMain) !== String(cur.wMain) || String(orig.dMain) !== String(cur.dMain) ||
        String(orig.wEx) !== String(cur.wEx) || String(orig.dEx) !== String(cur.dEx) ||
        String(orig.wEx2) !== String(cur.wEx2) || String(orig.dEx2) !== String(cur.dEx2) ||
        orig.isClosed !== cur.isClosed
      ) { isDirty = true; break; }
    }
  }

  if (!isDirty) {
    document.querySelectorAll('.fb-exit-label-input').forEach(inp => {
      if (inp.dataset.changed === "true") isDirty = true;
    });
  }

  fbState.isDirty = isDirty;
  MetroApp.fbUnsaved = isDirty;
  
  const sendBtn = document.getElementById('fbSend');
  if (sendBtn) {
    sendBtn.textContent = 'Застосувати';
    sendBtn.style.color = '';
    sendBtn.disabled = !isDirty;
  }
}

// =========================================================
// УТИЛІТИ ФОРМАТУВАННЯ
// =========================================================
function stepperHtml(id, value, min, max, label) {
  return `<div class="fb-input-wrap">
    <span class="fb-input-label">${label}</span>
    <div class="fb-stepper">
      <button type="button" class="fb-step fb-step-down" aria-label="Зменшити ${label}" data-id="${id}" data-min="${min}" data-max="${max}">−</button>
      <span class="fb-step-val" id="${id}" aria-live="polite">${value}</span>
      <button type="button" class="fb-step fb-step-up" aria-label="Збільшити ${label}" data-id="${id}" data-min="${min}" data-max="${max}">+</button>
    </div>
  </div>`;
}

function getAdjacentDoors(w, d) {
  const adj = [];
  if (d > 1) adj.push({w: w, d: d - 1});
  if (d < 4) adj.push({w: w, d: d + 1});
  if (d === 4 && w < 5) adj.push({w: w + 1, d: 1});
  if (d === 1 && w > 1) adj.push({w: w - 1, d: 4});
  return adj;
}

function getOppositeDoors(w, d) {
  return { w: 6 - parseInt(w), d: 5 - parseInt(d) };
}

function closeAllHints() {
  document.getElementById('feedbackInfoPanel')?.classList.remove('fb-info-open');
  document.querySelectorAll('.fb-add-doors-hint.fb-hint-open').forEach(h => h.classList.remove('fb-hint-open'));
  document.querySelectorAll('.fb-add-doors-info.is-active').forEach(b => b.classList.remove('is-active'));
}

function changeText(p, nw, nd, closed) {
  const loc = [p.dir, p.exit].filter(Boolean).join(' · ');
  if (closed) return `${loc}: ВИХІД ЗАКРИТО`;
  const parts = [];
  if (nw !== p.wagon) parts.push(`вагон ${p.wagon}→${nw}`);
  if (nd !== p.doors) parts.push(`двері ${p.doors}→${nd}`);
  return `${loc}: ${parts.join(', ')}`;
}

function extractFinalValues(stateObj) {
  if (!stateObj || stateObj.isClosed) return null;
  let finalW = String(stateObj.wMain);
  let finalD = String(stateObj.dMain);

  const hasEx  = stateObj.wEx !== '-' && stateObj.dEx !== '-';
  const hasEx2 = stateObj.wEx2 !== '-' && stateObj.dEx2 !== '-';

  if (hasEx && hasEx2) {
    const doors = [parseInt(finalD), parseInt(stateObj.dEx), parseInt(stateObj.dEx2)].sort((a,b) => a-b);
    finalD = `${doors[0]}-${doors[2]}`;
  } else if (hasEx) {
    const exW = String(stateObj.wEx); const exD = String(stateObj.dEx);
    if (finalW === exW) {
      const d1 = Math.min(parseInt(finalD), parseInt(exD));
      const d2 = Math.max(parseInt(finalD), parseInt(exD));
      finalD = `${d1}-${d2}`;
    } else {
      const w1 = parseInt(finalW); const w2 = parseInt(exW);
      const door1 = parseInt(finalD); const door2 = parseInt(exD);
      if (w1 < w2) { finalW = `${w1}, ${w2}`; finalD = `${door1}, ${door2}`; }
      else         { finalW = `${w2}, ${w1}`; finalD = `${door2}, ${door1}`; }
    }
  }
  return { finalW, finalD };
}

function parseDoorValues(rawW, rawD) {
  const rD = String(rawD);
  const rW = String(rawW);
  let wMain = parseInt(rW) || 1, dMain = parseInt(rD) || 1;
  let wEx = '-', dEx = '-', wEx2 = '-', dEx2 = '-';
  let hasExtra = false, hasThird = false;

  if (rD.includes(',')) {
    hasExtra = true;
    const wParts = rW.split(',');
    const dParts = rD.split(',');
    wMain = parseInt(wParts[0]); dMain = parseInt(dParts[0]);
    wEx = parseInt(wParts[1]);   dEx = parseInt(dParts[1]);
  } else if (rD.includes('-')) {
    const dParts = rD.split('-');
    const d1 = parseInt(dParts[0]);
    const d2 = parseInt(dParts[1]);
    wMain = parseInt(rW); dMain = d1;
    wEx = wMain; dEx = d2;
    hasExtra = true;
    if (d2 - d1 >= 2) {
      hasThird = true;
      wEx2 = wMain; dEx2 = d2;
      dEx = d1 + 1;
    }
  }
  return { wMain, dMain, wEx, dEx, wEx2, dEx2, hasExtra, hasThird };
}

// =========================================================
// ОСНОВНІ ФУНКЦІЇ РЕНДЕРУ (Винесені з вкладеності)
// =========================================================

function renderResetBtn() {
  const resetWrap = document.getElementById('fbResetWrap');
  if (!resetWrap) return;
  resetWrap.innerHTML = (hasLocalEdits() && !fbState.slug) ? `<button id="fbReset" class="fb-reset-btn">Скинути локальні зміни</button>` : '';
  document.getElementById('fbReset')?.addEventListener('click', () => {
    MetroApp.showCustomConfirm('Скинути всі локальні зміни та повернутись до стандартних даних?', () => {
      clearAllLocalEdits();
      if (typeof MetroApp.reloadStationsData === 'function') {
        MetroApp.reloadStationsData(true).then(() => {
          resetWrap.innerHTML = '<p class="fb-note fb-success">✓ Локальні зміни скинуто.</p>';
          renderFeedbackPositions(fbState.slug);
        });
      }
    });
  });
}

function renderFeedbackPositions(slug) {
  const posEl = document.getElementById('fbPositions');
  const sendBtn = document.getElementById('fbSend');
  if (!posEl || !sendBtn) return;

  if (!slug) { posEl.innerHTML = ''; sendBtn.disabled = true; return; }
  
  if (fbState.slug !== slug) initFeedbackState(slug);
  
  const s = state.stationsData[slug];
  const fbLineColor = MetroApp.LINE_COLOR[s?.line] || 'var(--text-muted)';
  const groupsMap = new Map();

  s?.positions?.forEach((p, i) => {
    let g = groupsMap.get(p.dir);
    if (!g) { g = { dir: p.dir, items: [] }; groupsMap.set(p.dir, g); }
    g.items.push({ p, i });
  });

  Object.keys(fbState.current).forEach(idx => {
    const st = fbState.current[idx];
    if (st.isNew) {
      let g = groupsMap.get(st.dir);
      if (!g) { g = { dir: st.dir, items: [] }; groupsMap.set(st.dir, g); }
      g.items.push({ p: { dir: st.dir, exit: fbState.labels[idx] || '', wagon: st.wMain, doors: st.dMain }, i: parseInt(idx) });
    }
  });

  const groups = [...groupsMap.values()];

  posEl.innerHTML = groups.map(g => {
    let dirLabel = g.dir === '__long_transfer__' ? 'Довгий перехід на Майдан Незалежності'
                   : (['кінцева', 'вихід праворуч'].includes(g.dir.toLowerCase())) ? g.dir
                   : `Попередня ${MetroApp.properCase(g.dir.replace(/^[Пп]опередня[\s\u00a0]+/, ''))}`;

    const itemsHtml = g.items.map((item, index) => {
      const st = fbState.current[item.i];
      const isClosed = st.isClosed;
      const dividerHtml = (index !== g.items.length - 1) ? `<div class="fb-item-divider"></div>` : '';
      const rawExit = fbState.labels[item.i];

      const exitLabelHtml = '<div class="fb-exit-label-row">'
        + '<div class="fb-exit-label-row-inner">'
        + '<span class="fb-exit-label-text">' + rawExit + '</span>'
        + (rawExit
          ? '<button type="button" class="fb-exit-label-edit-btn" data-item-idx="' + item.i + '" aria-label="Редагувати">' + MetroApp.Icons.pencil + '</button>'
          : '<button type="button" class="fb-add-desc-btn" data-item-idx="' + item.i + '">додати опис</button>')
        + '</div></div>'
        + '<div class="fb-exit-label-input-wrap" id="fbLabelWrap' + item.i + '">'
        + '<input type="text" class="fb-exit-label-input" id="fbLabelInput' + item.i + '" value="' + rawExit.replace(/"/g, '&quot;') + '" maxlength="60">'
        + '</div>';
        
      return exitLabelHtml + `
      <div class="fb-item-inner ${st.hasExtra ? 'fb-pos-multi has-extra-doors' : ''} ${st.hasThird ? 'has-three-doors' : ''} ${isClosed ? 'fb-pos-closed' : ''}" data-idx="${item.i}" id="fbItemInner${item.i}">
        ${isClosed
          ? `<div class="fb-closed-note-wrap"><span class="fb-closed-note">Вихід позначено як недоступний</span><button type="button" class="fb-restore-exit" data-idx="${item.i}" aria-label="Відновити вихід">${MetroApp.Icons.undo}</button></div>`
          : `<div class="fb-pos-wrap"><div class="fb-side-actions-left"><button type="button" class="fb-add-doors-info" style="color:${fbLineColor}" data-idx="${item.i}">${MetroApp.Icons.info}</button></div>
             <div class="fb-pos-inputs">${stepperHtml(`fbW${item.i}`, st.wMain, 1, 5, 'вагон')}${stepperHtml(`fbD${item.i}`, st.dMain, 1, 4, 'двері')}</div>
             <div class="fb-side-actions"><button type="button" class="fb-close-exit" style="color:${fbLineColor}" data-idx="${item.i}">✕</button></div></div>
             <div class="fb-extra-door-wrap ${st.hasExtra ? '' : 'is-hidden'}" id="fbExtraWrap${item.i}"><div class="fb-pos-wrap" style="margin-top: 4px;"><div class="fb-side-actions-left"></div><div class="fb-pos-inputs">${stepperHtml(`fbW_ex${item.i}`, st.wEx, 1, 5, 'вагон')}${stepperHtml(`fbD_ex${item.i}`, st.dEx, 1, 4, 'двері')}</div><div class="fb-side-actions"><button type="button" class="fb-cancel-extra-btn" style="color:${fbLineColor}" data-idx="${item.i}">✕</button></div></div></div>
             <div class="fb-extra-door-wrap ${st.hasThird ? '' : 'is-hidden'}" id="fbExtraWrap2_${item.i}"><div class="fb-pos-wrap" style="margin-top: 4px;"><div class="fb-side-actions-left"></div><div class="fb-pos-inputs">${stepperHtml(`fbW_ex2_${item.i}`, st.wEx2, 1, 5, 'вагон')}${stepperHtml(`fbD_ex2_${item.i}`, st.dEx2, 1, 4, 'двері')}</div><div class="fb-side-actions"><button type="button" class="fb-cancel-third-btn" style="color:${fbLineColor}" data-idx="${item.i}">✕</button></div></div></div>
             <div class="fb-add-doors-row ${st.hasExtra ? 'is-hidden' : ''}" id="fbAddDoorsRow${item.i}" style="justify-content:center;"><button type="button" class="fb-add-doors-link" id="fbAddBtn${item.i}" data-idx="${item.i}" data-can-have-third="${st.hasThird ? '1' : '0'}">+1</button></div>
             <div class="fb-add-doors-hint" id="fbHint${item.i}"><div class="fb-add-doors-hint-inner"><div class="hint-1-door"><p>+1 — другі зручні двері для виходу. Можна&nbsp;обрати тільки&nbsp;сусідні&nbsp;двері</p><p><span style="color:var(--line-red)">✕</span> позначає&nbsp;вихід як&nbsp;тимчасово&nbsp;недоступний</p></div><div class="hint-2-doors"><p><span style="color:var(--line-blue)">✕</span> скасовує додавання других дверей.</p></div></div></div>`
        }
      </div>${dividerHtml}`;
    }).join('');
    
    const canAddMore = STATIONS_CAN_ADD_EXIT.has(slug);
    const hasNewAlready = Object.values(fbState.current).some(st => st.isNew && st.dir === g.dir);
    const addBtnHtml = (canAddMore && !hasNewAlready) ? `<div class="fb-add-exit-row"><button type="button" class="fb-add-exit-btn" data-dir="${g.dir}">+ Додати ще один вихід</button></div>` : '';

    return `<div class="fb-pos-row"><div class="fb-dir-label-wrap"><div class="fb-dir-label">${dirLabel}</div></div>${itemsHtml}${addBtnHtml}</div>`;
  }).join('');
  
  renderResetBtn();
  markFeedbackDirty(); 
}

MetroApp.triggerFeedbackSubmit = async function(background = false) {
  if (MetroApp._isSubmitting) return;
  MetroApp._isSubmitting = true;

  const slug = fbState.slug;
  const sendBtn = document.getElementById('fbSend');
  const resultEl = document.getElementById('fbResult');

  if (!slug) { MetroApp._isSubmitting = false; return; }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  try {
    const s = state.stationsData[slug];

    const posChanges = [];
    s.positions.forEach((p, i) => {
      const orig = fbState.original[i];
      const cur  = fbState.current[i];
      if (!orig || !cur) return;

      if (cur.isClosed && !orig.isClosed) {
        posChanges.push({ i, p, closed: true });
        return;
      }

      const vals = extractFinalValues(cur);
      const origVals = extractFinalValues(orig);
      if (!vals || !origVals) return;
      if (vals.finalW !== origVals.finalW || vals.finalD !== origVals.finalD) {
        posChanges.push({ i, p, nw: vals.finalW, nd: vals.finalD });
      }
    });

    const newExits = Object.keys(fbState.current)
      .filter(idx => fbState.current[idx].isNew)
      .map(idx => {
        const st = fbState.current[idx];
        const vals = extractFinalValues(st);
        return vals ? { idx, st, vals } : null;
      }).filter(Boolean);

    const labelChanges = [];
    document.querySelectorAll('.fb-exit-label-input').forEach(inp => {
      if (inp.dataset.changed === 'true') {
        const idx = inp.id.replace('fbLabelInput', '');
        const p = s.positions[idx];
        const loc = [p?.dir, p?.exit].filter(Boolean).join(' · ');
        labelChanges.push(`${loc}: НОВИЙ ОПИС [${inp.value}]`);
        inp.dataset.changed = 'false';
      }
    });

    if (!posChanges.length && !newExits.length && !labelChanges.length) {
      if (!background && resultEl) {
        resultEl.innerHTML = '<p class="fb-note">Змін не виявлено.</p>';
        setTimeout(() => { resultEl.innerHTML = ''; }, 3000);
      }
      MetroApp.fbUnsaved = false;
      MetroApp._isSubmitting = false;
      return;
    }

    posChanges.forEach(c => saveLocalEdit(slug, c.i,
      c.closed ? { wagon: c.p.wagon, doors: c.p.doors, closed: true } : { wagon: c.nw, doors: c.nd }
    ));
    newExits.forEach(({ idx, st, vals }) => saveLocalEdit(slug, idx, {
      wagon: vals.finalW, doors: vals.finalD,
      dir: st.dir, label: fbState.labels[idx], isNew: true
    }));

    MetroApp.invalidateLocalEditsCache?.();
    if (typeof MetroApp.applyLocalEdits === 'function') MetroApp.applyLocalEdits(state.stationsData);
    MetroApp.refreshCurrentStation?.();
    MetroApp.fbUnsaved = false;
    fbState.slug = null;

    if (!background && sendBtn) {
      sendBtn.disabled = true;
      sendBtn.innerHTML = '<span class="fb-send-spinner"></span>';
      renderFeedbackPositions(slug);
      if (resultEl) resultEl.innerHTML = '';
    }

    const formspreeLines = [
      ...posChanges.map(c => changeText(c.p, c.nw ?? c.p.wagon, c.nd ?? c.p.doors, !!c.closed)),
      ...newExits.map(({ st, vals }) => `${st.dir}: НОВИЙ ВИХІД (вагон ${vals.finalW}, двері ${vals.finalD})`),
      ...labelChanges
    ];

    const response = await fetch(FORMSPREE_URL, {
      method: 'POST', 
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ station: s.name, slug, line: LINE_NAMES[s.line], changes: formspreeLines.join('\n') }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);
    if (!response.ok) throw new Error('HTTP ' + response.status);

    if (!background && sendBtn) {
      MetroApp.hapticImpact?.('heavy');
      sendBtn.textContent = 'Зміни застосовано';
      sendBtn.style.color = 'var(--text-muted)';
      sendBtn.disabled = true;
      if (resultEl) resultEl.innerHTML = '';
    }
  } catch (error) {
    clearTimeout(timeoutId);
    console.warn('[KyivMetroGO] Formspree недоступний, зміни збережено локально:', error);
    if (!background && sendBtn) {
      MetroApp.hapticImpact?.('heavy');
      sendBtn.textContent = 'Збережено локально';
      sendBtn.style.color = '';
      sendBtn.disabled = true;
      if (resultEl) resultEl.innerHTML = '';
    }
  } finally {
    MetroApp._isSubmitting = false;
  }
};

function bindSteppersOptimized(container) {
  // Захист від повторного біндингу
  if (container._isBound) return;
  container._isBound = true;

  container.addEventListener('change', (event) => {
    const input = event.target.closest('.fb-exit-label-input');
    if (input) {
      input.dataset.changed = "true";
      const slug = document.getElementById('fbStation')?.value;
      const wrapId = input.id.replace('fbLabelInput', '');
      if (slug && wrapId !== '') {
        saveExitLabel(slug, parseInt(wrapId), input.value);
        const wrap = document.getElementById('fbLabelWrap' + wrapId);
        const row = wrap?.previousElementSibling;
        if (row?.classList.contains('fb-exit-label-row')) {
          const textSpan = row.querySelector('.fb-exit-label-text');
          if (textSpan) textSpan.textContent = input.value.trim();
          const editBtn = row.querySelector('.fb-exit-label-edit-btn, .fb-add-desc-btn');
          if (editBtn && input.value.trim()) {
            editBtn.className = 'fb-exit-label-edit-btn';
            editBtn.innerHTML = PENCIL_SVG_LABEL;
            editBtn.setAttribute('aria-label', 'Редагувати');
            editBtn.removeAttribute('style');
          } else if (editBtn && !input.value.trim()) {
            editBtn.className = 'fb-add-desc-btn';
            editBtn.innerHTML = 'додати опис';
          }
        }
        if (typeof MetroApp.applyExitLabels === 'function' && state.stationsData) {
          MetroApp.applyExitLabels(state.stationsData);
        }
        if (typeof MetroApp.refreshCurrentStation === 'function') {
          MetroApp.refreshCurrentStation();
        }
        markFeedbackDirty();
      }
    }
  });

  container.addEventListener('click', (event) => {
    const btn = event.target.closest('.fb-step');
    if (btn) {
      MetroApp.hapticImpact?.('light');
      const id = btn.dataset.id;
      const el = document.getElementById(id);
      if (!el) return;
      const isExtra = id.includes('_ex');
      const idx = id.replace(/[^0-9]/g, '');

      if (isExtra) {
        const mainW = parseInt(document.getElementById(`fbW${idx}`).textContent);
        const mainD = parseInt(document.getElementById(`fbD${idx}`).textContent);
        const adj = getAdjacentDoors(mainW, mainD);

        let curW = document.getElementById(`fbW_ex${idx}`).textContent;
        let curD = document.getElementById(`fbD_ex${idx}`).textContent;

        if (curW === '-' || curD === '-') {
          curW = adj[0].w; curD = adj[0].d;
        } else {
          curW = parseInt(curW); curD = parseInt(curD);
          const curIdx = adj.findIndex(a => a.w === curW && a.d === curD);
          if (curIdx === -1) { curW = adj[0].w; curD = adj[0].d; } 
          else if (adj.length > 1) {
            const nextIdx = (curIdx + (btn.classList.contains('fb-step-up') ? 1 : -1) + adj.length) % adj.length;
            curW = adj[nextIdx].w; curD = adj[nextIdx].d;
          }
        }
        document.getElementById(`fbW_ex${idx}`).textContent = curW;
        document.getElementById(`fbD_ex${idx}`).textContent = curD;

        const ex2WNode2 = document.getElementById(`fbW_ex2_${idx}`);
        const ex2DNode2 = document.getElementById(`fbD_ex2_${idx}`);
        const wrap2b = document.getElementById(`fbExtraWrap2_${idx}`);
        if (ex2WNode2 && ex2DNode2 && wrap2b && !wrap2b.classList.contains('is-hidden')) {
          const adj3 = getAdjacentDoors(curW, curD);
          const mainW3 = parseInt(document.getElementById(`fbW${idx}`).textContent);
          const mainD3 = parseInt(document.getElementById(`fbD${idx}`).textContent);
          const validAdj3 = adj3.filter(a => !(a.w === mainW3 && a.d === mainD3));
          if (validAdj3.length) { ex2WNode2.textContent = validAdj3[0].w; ex2DNode2.textContent = validAdj3[0].d; }
        }
      } else {
        const min = parseInt(btn.dataset.min);
        const max = parseInt(btn.dataset.max);
        let val = parseInt(el.textContent) + (btn.classList.contains('fb-step-up') ? 1 : -1);
        el.textContent = Math.max(min, Math.min(max, val));
      }
      syncCurrentStateFromDOM(parseInt(idx));
      markFeedbackDirty();
      return;
    }

    const cancelExtraBtn = event.target.closest('.fb-cancel-extra-btn');
    if (cancelExtraBtn) {
      MetroApp.hapticImpact?.('light');
      const idx = cancelExtraBtn.dataset.idx;
      document.getElementById(`fbW_ex${idx}`).textContent = '-';
      document.getElementById(`fbD_ex${idx}`).textContent = '-';
      document.getElementById(`fbExtraWrap${idx}`).classList.add('is-hidden');
      const w2 = document.getElementById(`fbExtraWrap2_${idx}`);
      if (w2) { document.getElementById(`fbW_ex2_${idx}`).textContent = '-'; document.getElementById(`fbD_ex2_${idx}`).textContent = '-'; w2.classList.add('is-hidden'); }
      const addRow = document.getElementById(`fbAddDoorsRow${idx}`);
      if (addRow) addRow.classList.remove('is-hidden');
      document.getElementById(`fbItemInner${idx}`).classList.remove('has-extra-doors');
      syncCurrentStateFromDOM(parseInt(idx));
      markFeedbackDirty();
      return;
    }

    const infoBtn = event.target.closest('.fb-add-doors-info');
    if (infoBtn) {
      const idx = infoBtn.dataset.idx;
      const hint = document.getElementById(`fbHint${idx}`);
      if (!hint) return;
      const isOpen = hint.classList.contains('fb-hint-open');
      closeAllHints();
      if (!isOpen) { hint.classList.add('fb-hint-open'); infoBtn.classList.add('is-active'); }
      return;
    }

    const labelEditBtn = event.target.closest('.fb-exit-label-edit-btn, .fb-add-desc-btn');
    if (labelEditBtn) {
      const itemIdx = labelEditBtn.dataset.itemIdx;
      const wrap = document.getElementById('fbLabelWrap' + itemIdx);
      const input = document.getElementById('fbLabelInput' + itemIdx);
      if (wrap && input) {
        const isOpen = wrap.classList.contains('label-input-open');
        document.querySelectorAll('.fb-exit-label-input-wrap.label-input-open').forEach(w => {
          if (w !== wrap) w.classList.remove('label-input-open');
        });
        if (!isOpen) { wrap.classList.add('label-input-open'); setTimeout(() => input.focus(), 250); }
        else wrap.classList.remove('label-input-open');
      }
      return;
    }

    const addExitBtn = event.target.closest('.fb-add-exit-btn');
    if (addExitBtn) {
      MetroApp.hapticImpact?.('medium');
      const dir = addExitBtn.dataset.dir;
      const newIdx = Object.keys(fbState.current).length;
      
      let defaultW = 1, defaultD = 1;
      const existingExits = Object.values(fbState.current).filter(st => st.dir === dir && !st.isNew);
      if (existingExits.length > 0) {
        const opposite = getOppositeDoors(existingExits[0].wMain, existingExits[0].dMain);
        defaultW = opposite.w; defaultD = opposite.d;
      }
      
      fbState.current[newIdx] = { 
        wMain: defaultW, dMain: defaultD, wEx: '-', dEx: '-', wEx2: '-', dEx2: '-', 
        hasExtra: false, hasThird: false, isClosed: false, isNew: true, dir: dir 
      };
      fbState.labels[newIdx] = '';
      
      if (typeof MetroApp._renderFeedbackPositions === 'function') MetroApp._renderFeedbackPositions(fbState.slug);
      setTimeout(() => document.querySelector(`.fb-add-desc-btn[data-item-idx="${newIdx}"]`)?.click(), 100);
      markFeedbackDirty();
      return;
    }

    const addDoorsBtn = event.target.closest('.fb-add-doors-link');
    if (addDoorsBtn) {
      MetroApp.hapticImpact?.('light');
      const idx = addDoorsBtn.dataset.idx;
      document.getElementById(`fbExtraWrap${idx}`).classList.remove('is-hidden');
      addDoorsBtn.parentNode.classList.add('is-hidden');
      document.getElementById(`fbItemInner${idx}`).classList.add('has-extra-doors');

      const mainW = parseInt(document.getElementById(`fbW${idx}`).textContent);
      const mainD = parseInt(document.getElementById(`fbD${idx}`).textContent);
      const adj = getAdjacentDoors(mainW, mainD);
      
      document.getElementById(`fbW_ex${idx}`).textContent = adj[0].w;
      document.getElementById(`fbD_ex${idx}`).textContent = adj[0].d;

      syncCurrentStateFromDOM(parseInt(idx));
      markFeedbackDirty();
      return;
    }

    const cancelThirdBtn = event.target.closest('.fb-cancel-third-btn');
    if (cancelThirdBtn) {
      MetroApp.hapticImpact?.('light');
      const idx = cancelThirdBtn.dataset.idx;
      document.getElementById(`fbW_ex2_${idx}`).textContent = '-';
      document.getElementById(`fbD_ex2_${idx}`).textContent = '-';
      document.getElementById(`fbExtraWrap2_${idx}`).classList.add('is-hidden');
      const addBtn3 = document.getElementById(`fbAddBtn${idx}`);
      if (addBtn3 && addBtn3.dataset.canHaveThird === '1') {
        const addRow3 = document.getElementById(`fbAddDoorsRow${idx}`);
        if (addRow3) addRow3.classList.remove('is-hidden');
      }
      syncCurrentStateFromDOM(parseInt(idx));
      markFeedbackDirty();
    }
  });
}

function openFeedbackSheet(stationsData) {
  try {
    MetroApp.pushSheetHistory();

    let sheet = document.getElementById('feedbackSheet');
    if (!sheet) {
      sheet = document.createElement('div');
      sheet.id = 'feedbackSheet';
      sheet.className = 'station-sheet';
      
      const template = document.getElementById('tpl-feedback-sheet');
      sheet.appendChild(template.content.cloneNode(true));
      document.body.appendChild(sheet);

      // Глобальні слухачі для DOM-елементів всередині шторки
      const posEl = document.getElementById('fbPositions');
      const sendBtn = document.getElementById('fbSend');
      const stationHidden = document.getElementById('fbStation');
      const lineHidden = document.getElementById('fbLine');
      const lineFilter = document.getElementById('fbLineFilter');
      const stationList = document.getElementById('fbStationList');

      lineFilter.addEventListener('click', e => {
        const btn = e.target.closest('.search-line-btn');
        if (!btn) return;
        const line = btn.dataset.line;
        
        lineFilter.querySelectorAll('.search-line-btn').forEach(b => b.classList.remove('is-active'));
        btn.classList.add('is-active');
        lineHidden.value = line;
        
        stationHidden.value = '';
        posEl.innerHTML = '';
        sendBtn.disabled = true;
        MetroApp.fbUnsaved = false;
        closeAllHints();
        
        const allSt = Object.entries(state.stationsData)
          .map(([sl, st]) => ({ slug: sl, ...st }))
          .filter(st => line === '' || st.line === line)
          .sort((a, b) => a.name.localeCompare(b.name, 'uk'));
          
        stationList.innerHTML = allSt.map(st =>
          `<div class="search-item fb-station-item${st.slug === stationHidden.value ? ' fb-station-active' : ''}" data-slug="${st.slug}">` +
          `<div class="search-item-line" style="background-color:${MetroApp.LINE_COLOR[st.line]}"></div>` +
          `<div>${st.name}</div></div>`
        ).join('');
        stationList.hidden = false;
        renderResetBtn();
      });

      stationList.addEventListener('click', e => {
        const item = e.target.closest('.fb-station-item');
        if (!item) return;
        stationHidden.value = item.dataset.slug;
        
        stationList.hidden = true;
        document.getElementById('fbLineFilterWrap').hidden = true;
        document.getElementById('fbChangeStation').hidden = false;
        
        MetroApp.fbUnsaved = false;
        closeAllHints();
        renderFeedbackPositions(stationHidden.value);
      });

      document.getElementById('fbChangeStation').addEventListener('click', () => {
        document.getElementById('fbLineFilterWrap').hidden = false;
        document.getElementById('fbChangeStation').hidden = true;
        stationHidden.value = '';
        posEl.innerHTML = '';
        stationList.hidden = false;
        sendBtn.disabled = true;
      });

      posEl.addEventListener('click', (e) => {
        const slug = stationHidden.value;
        if (!slug) return;

        const restoreBtn = e.target.closest('.fb-restore-exit');
        if (restoreBtn) {
          e.preventDefault(); e.stopPropagation();
          const idx = restoreBtn.dataset.idx;
          const edits = getLocalEdits();
          if (edits[slug] && edits[slug][idx]) {
            delete edits[slug][idx];
            if (Object.keys(edits[slug]).length === 0) delete edits[slug];
            if (Object.keys(edits).length === 0) clearAllLocalEdits();
            else Storage.set(STORAGE_KEYS.LOCAL_EDITS, JSON.stringify(edits));
          }
          MetroApp.invalidateLocalEditsCache?.();
          if (fbState.current[idx]) fbState.current[idx].isClosed = false;
          if (typeof MetroApp.applyLocalEdits === 'function') MetroApp.applyLocalEdits(state.stationsData);
          MetroApp.refreshCurrentStation?.();
          renderFeedbackPositions(slug);
          renderResetBtn();
          return;
        }

        const closeBtn = e.target.closest('.fb-close-exit');
        if (closeBtn) {
          const idx = parseInt(closeBtn.dataset.idx);
          if (fbState.current[idx] && fbState.current[idx].isNew) {
            delete fbState.current[idx]; delete fbState.labels[idx]; delete fbState.original[idx];
            const edits = getLocalEdits();
            if (edits[slug] && edits[slug][idx]) {
              delete edits[slug][idx];
              if (Object.keys(edits[slug]).length === 0) delete edits[slug];
              if (Object.keys(edits).length === 0) clearAllLocalEdits();
              else Storage.set(STORAGE_KEYS.LOCAL_EDITS, JSON.stringify(edits));
            }
            renderFeedbackPositions(slug);
            markFeedbackDirty();
            renderResetBtn();
            return;
          }
          const p = state.stationsData[fbState.slug]?.positions[idx];
          if (!p) return;
          const exWrap = document.getElementById(`fbExtraWrap${idx}`);
          if (exWrap && !exWrap.classList.contains('is-hidden')) {
            document.getElementById(`fbW${idx}`).textContent = document.getElementById(`fbW_ex${idx}`).textContent;
            document.getElementById(`fbD${idx}`).textContent = document.getElementById(`fbD_ex${idx}`).textContent;
            document.getElementById(`fbW_ex${idx}`).textContent = '-'; document.getElementById(`fbD_ex${idx}`).textContent = '-';
            exWrap.classList.add('is-hidden');
            const addRow = document.getElementById(`fbAddDoorsRow${idx}`);
            if (addRow) addRow.classList.remove('is-hidden');
            document.getElementById(`fbItemInner${idx}`).classList.remove('has-extra-doors');
            syncCurrentStateFromDOM(idx);
            markFeedbackDirty();
            return;
          }
          saveLocalEdit(slug, idx, { wagon: p.wagon, doors: p.doors, closed: true });
          if (typeof MetroApp.applyLocalEdits === 'function') MetroApp.applyLocalEdits(state.stationsData);
          MetroApp.invalidateLocalEditsCache?.();
          fbState.current[idx].isClosed = true;
          renderFeedbackPositions(slug);
          renderResetBtn();
          MetroApp.refreshCurrentStation?.();
        }
      });

      sendBtn.addEventListener('click', () => { 
        MetroApp.hapticImpact?.('medium');
        MetroApp.triggerFeedbackSubmit(false); 
      });
      document.getElementById('feedbackClose').addEventListener('click', closeFeedbackSheet);
      bindSteppersOptimized(posEl);

      MetroApp.initKinematicSwipe(sheet, document.getElementById('feedbackBody'), closeFeedbackSheet);
    }

    // Скидання UI при кожному відкритті шторки
    document.getElementById('fbStation').value = '';
    document.getElementById('fbLine').value = '';
    document.getElementById('fbLineFilter').querySelectorAll('.search-line-btn').forEach(b => b.classList.remove('is-active'));
    document.getElementById('fbStationList').hidden = true; 
    document.getElementById('fbStationList').innerHTML = '';
    document.getElementById('fbPositions').innerHTML = '';
    document.getElementById('fbResult').innerHTML = '';
    
    const sendBtn = document.getElementById('fbSend');
    sendBtn.textContent = 'Застосувати'; 
    sendBtn.disabled = true; 
    sendBtn.style.color = '';

    renderResetBtn();
    
    document.querySelectorAll('.station-sheet').forEach(el => el.classList.remove('sheet-open'));
    sheet.classList.add('sheet-open'); 
    document.getElementById('sheetOverlay').classList.add('overlay-visible');      
  } catch(err) { console.error('[FeedbackSheet ERROR]', err); }
}

function forceCloseFeedbackSheet() {
  MetroApp.fbUnsaved = false;
  const s = document.getElementById('feedbackSheet');
  MetroApp.animateSheetClose(s, () => {
    s?.classList.remove('sheet-open');
    const anyOpen = document.querySelectorAll('.station-sheet.sheet-open').length > 0;
    if (!anyOpen) document.getElementById('sheetOverlay')?.classList.remove('overlay-visible');
  });
}

MetroApp.hasUnsavedFeedback = function() {
  return !!MetroApp.fbUnsaved;
};

function closeFeedbackSheet() {
  try {
    if (MetroApp.hasUnsavedFeedback && MetroApp.hasUnsavedFeedback()) {
      if (typeof MetroApp.showCustomConfirm === 'function') {
        const stationSlug = document.getElementById('fbStation')?.value || '';
        const stationData = stationSlug ? state.stationsData?.[stationSlug] : null;
        const stationName = stationData?.name || '';
        const question = stationName ? `Зберегти зміни для станції <span style="white-space: nowrap;">${stationName}?</span>` : 'Зберегти зміни?';
        
        MetroApp.showCustomConfirm(question, () => {
          MetroApp.triggerFeedbackSubmit(true);
          forceCloseFeedbackSheet();
        }, () => { forceCloseFeedbackSheet(); }, () => {});
        return;
      }
    }
  } catch(e) { 
    console.error('[KyivMetroGO] Критична помилка збереження:', e); 
  }
  forceCloseFeedbackSheet(); 
}

MetroApp.openFeedbackSheet  = openFeedbackSheet;
MetroApp.closeFeedbackSheet = closeFeedbackSheet;