MetroApp.addExitToStation = function(slug, dir) {
  console.log('[KyivMetroGO] TODO addExit:', slug, dir);
};

(function() {

  const FORMSPREE_URL = 'https://formspree.io/f/mgopobnd';
  const LINE_NAMES = { red: 'Червона', blue: 'Синя', green: 'Зелена' };
  const LINE_ORDER = ['red', 'blue', 'green'];
  const LOCAL_EDITS_KEY = 'metro_local_edits';
  const EXIT_LABELS_KEY = 'metro_exit_labels';
  const PENCIL_SVG_LABEL = MetroApp.Icons.pencil;

function getExitLabels() {
    try { return JSON.parse(localStorage.getItem(EXIT_LABELS_KEY) || '{}'); } 
    catch (e) { console.warn('[KyivMetroGO] Помилка парсингу описів виходів:', e); return {}; }
  }
  function saveExitLabel(slug, posIdx, label) {
    const labels = getExitLabels();
    if (!labels[slug]) labels[slug] = {};
    if (label.trim()) labels[slug][posIdx] = label.trim();
    else { delete labels[slug][posIdx]; if (!Object.keys(labels[slug]).length) delete labels[slug]; }
    localStorage.setItem(EXIT_LABELS_KEY, JSON.stringify(labels));
  }
  
  MetroApp.getExitLabel = function(slug, posIdx) {
    const labels = getExitLabels();
    return labels[slug]?.[posIdx] ?? null;
  };

  MetroApp.applyExitLabels = function(stationsData) {
    const labels = getExitLabels();
    for (const [slug, posLabels] of Object.entries(labels)) {
      if (!stationsData[slug]) continue;
      let posIdx = 0;
      for (const dir of stationsData[slug].directions) {
        for (const exit of dir.exits) {
          if (posLabels[posIdx] !== undefined) {
            exit.label = posLabels[posIdx];
          }
          for (let i = 0; i < exit.positions.length; i++) { posIdx++; }
        }
      }
    }
  };

  let localEditsCache = null;
  MetroApp.fbUnsaved = false;
  MetroApp.invalidateLocalEditsCache = () => { localEditsCache = null; };

function getLocalEdits() {
    if (localEditsCache) return localEditsCache;
    try { localEditsCache = JSON.parse(localStorage.getItem(LOCAL_EDITS_KEY) || '{}'); }
    catch (e) { console.warn('[KyivMetroGO] Помилка парсингу локальних змін:', e); localEditsCache = {}; }
    return localEditsCache;
  }

  function saveLocalEdit(slug, posIdx, data) {
    const edits = getLocalEdits();
    if (!edits[slug]) edits[slug] = {};
    edits[slug][posIdx] = data;
    localStorage.setItem(LOCAL_EDITS_KEY, JSON.stringify(edits));
  }

  function clearAllLocalEdits() {
    localEditsCache = null;
    localStorage.removeItem(LOCAL_EDITS_KEY);
  }

  function hasLocalEdits() { return Object.keys(getLocalEdits()).length > 0; }

  MetroApp.applyLocalEdits = function(stationsData) {
    const edits = getLocalEdits();
    let editsChanged = false;
    for (const [slug, posEdits] of Object.entries(edits)) {
      if (!stationsData[slug]) continue;
      let posIdx = 0;
      for (const dir of stationsData[slug].directions) {
        for (const exit of dir.exits) {
          for (let i = 0; i < exit.positions.length; i++) {
            if (posEdits[posIdx] !== undefined) {
              const edit = posEdits[posIdx];
              const wStr = String(edit.wagon ?? '');
              const dStr = String(edit.doors ?? '');
              if (wStr.includes('NaN') || dStr.includes('NaN') || wStr === 'undefined' || dStr === 'undefined') {
                delete posEdits[posIdx];
                editsChanged = true;
              } else {
                exit.positions[i] = { ...exit.positions[i], ...edit, _edited: true, _slug: slug, _posIdx: posIdx };
              }
            }
            posIdx++;
          }
        }
      }
      if (Object.keys(posEdits).length === 0) delete edits[slug];
    }
    if (editsChanged) {
      if (Object.keys(edits).length === 0) { localEditsCache = null; localStorage.removeItem('metro_local_edits'); }
      else localStorage.setItem('metro_local_edits', JSON.stringify(edits));
    }
  };

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

  function closeAllHints() {
    document.getElementById('feedbackInfoPanel')?.classList.remove('fb-info-open');
    document.querySelectorAll('.fb-add-doors-hint.fb-hint-open').forEach(h => h.classList.remove('fb-hint-open'));
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

    // Порівнюємо поточний Стейт з Оригіналом
    for (const i in fbState.original) {
      const orig = fbState.original[i];
      const cur = fbState.current[i];
      if (
        String(orig.wMain) !== String(cur.wMain) || 
        String(orig.dMain) !== String(cur.dMain) ||
        String(orig.wEx) !== String(cur.wEx) || 
        String(orig.dEx) !== String(cur.dEx) ||
        String(orig.wEx2) !== String(cur.wEx2) || 
        String(orig.dEx2) !== String(cur.dEx2) ||
        orig.isClosed !== cur.isClosed
      ) {
        isDirty = true;
        break;
      }
    }

    // 3. Перевіряємо текстові описи виходів
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

  function changeText(p, nw, nd, closed) {
    const loc = [p.dir, p.exit].filter(Boolean).join(' · ');
    if (closed) return `${loc}: ВИХІД ЗАКРИТО`;
    const parts = [];
    if (nw !== p.wagon) parts.push(`вагон ${p.wagon}→${nw}`);
    if (nd !== p.doors)  parts.push(`двері ${p.doors}→${nd}`);
    return `${loc}: ${parts.join(', ')}`;
  }

function extractFinalValues(stateObj) {
    // Тепер функція не знає про HTML, вона працює з чистим JS-об'єктом!
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
    let wMain = parseInt(rW) || 1;
    let dMain = parseInt(rD) || 1;
    let wEx = '-'; let dEx = '-';
    let wEx2 = '-'; let dEx2 = '-';
    let hasExtra = false;
    let hasThird = false;

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

function bindSteppersOptimized(container) {
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
          if (typeof MetroApp.applyExitLabels === 'function' && MetroApp.currentStationsData) {
            MetroApp.applyExitLabels(MetroApp.currentStationsData);
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
        const id = btn.dataset.id;
        const el = document.getElementById(id);
        if (!el) return;
        const isExtra = id.includes('_ex');
        const idx = id.replace(/[^0-9]/g, '');

        // 1. ФІКСУЄМО СТАН ДО КЛІКУ
        const stateBefore = [
          document.getElementById(`fbW${idx}`)?.textContent,
          document.getElementById(`fbD${idx}`)?.textContent,
          document.getElementById(`fbW_ex${idx}`)?.textContent,
          document.getElementById(`fbD_ex${idx}`)?.textContent,
          document.getElementById(`fbW_ex2_${idx}`)?.textContent,
          document.getElementById(`fbD_ex2_${idx}`)?.textContent
        ].join('|');

        if (isExtra) {
          const mainW = parseInt(document.getElementById(`fbW${idx}`).textContent);
          const mainD = parseInt(document.getElementById(`fbD${idx}`).textContent);
          const adj = getAdjacentDoors(mainW, mainD);

          let curW = document.getElementById(`fbW_ex${idx}`).textContent;
          let curD = document.getElementById(`fbD_ex${idx}`).textContent;

          if (curW === '-' || curD === '-') {
            curW = adj[0].w;
            curD = adj[0].d;
          } else {
            curW = parseInt(curW);
            curD = parseInt(curD);
            const curIdx = adj.findIndex(a => a.w === curW && a.d === curD);
            if (curIdx === -1) {
              curW = adj[0].w;
              curD = adj[0].d;
            } else if (adj.length > 1) {
              const nextIdx = (curIdx + (btn.classList.contains('fb-step-up') ? 1 : -1) + adj.length) % adj.length;
              curW = adj[nextIdx].w;
              curD = adj[nextIdx].d;
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

          const exWNode = document.getElementById(`fbW_ex${idx}`);
          const exDNode = document.getElementById(`fbD_ex${idx}`);
          if (exWNode && exDNode && exWNode.textContent !== '-') {
            const newMainW = parseInt(document.getElementById(`fbW${idx}`).textContent);
            const newMainD = parseInt(document.getElementById(`fbD${idx}`).textContent);
            const adj = getAdjacentDoors(newMainW, newMainD);
            const isValid = adj.some(a => a.w === parseInt(exWNode.textContent) && a.d === parseInt(exDNode.textContent));
            if (!isValid) {
              exWNode.textContent = adj[0].w;
              exDNode.textContent = adj[0].d;
            }
            const ex2WNode = document.getElementById(`fbW_ex2_${idx}`);
            const ex2DNode = document.getElementById(`fbD_ex2_${idx}`);
            const wrap2 = document.getElementById(`fbExtraWrap2_${idx}`);
            if (ex2WNode && ex2DNode && wrap2 && !wrap2.classList.contains('is-hidden')) {
              const curExW = parseInt(exWNode.textContent);
              const curExD = parseInt(exDNode.textContent);
              const adj2 = getAdjacentDoors(curExW, curExD);
              const mainW2 = parseInt(document.getElementById(`fbW${idx}`).textContent);
              const mainD2 = parseInt(document.getElementById(`fbD${idx}`).textContent);
              const validAdj2 = adj2.filter(a => !(a.w === mainW2 && a.d === mainD2));
              if (validAdj2.length) { ex2WNode.textContent = validAdj2[0].w; ex2DNode.textContent = validAdj2[0].d; }
            }
          }
        }

        // 2. ФІКСУЄМО СТАН ПІСЛЯ КЛІКУ
        const stateAfter = [
          document.getElementById(`fbW${idx}`)?.textContent,
          document.getElementById(`fbD${idx}`)?.textContent,
          document.getElementById(`fbW_ex${idx}`)?.textContent,
          document.getElementById(`fbD_ex${idx}`)?.textContent,
          document.getElementById(`fbW_ex2_${idx}`)?.textContent,
          document.getElementById(`fbD_ex2_${idx}`)?.textContent
        ].join('|');

        // 3. ВИКЛИКАЄМО ОНОВЛЕННЯ ТІЛЬКИ ЯКЩО БУЛИ ЗМІНИ
        if (stateBefore !== stateAfter) {
          syncCurrentStateFromDOM(parseInt(idx));
          const noteEl = document.getElementById(`fbExtraNote${idx}`);
          if (noteEl && noteEl.classList.contains('is-hidden')) noteEl.classList.remove('is-hidden');
          markFeedbackDirty();
        }
        return;
      }

      const infoBtn = event.target.closest('.fb-add-doors-info');
      if (infoBtn) {
        event.preventDefault();
        event.stopPropagation();
        const hint = document.getElementById(`fbHint${infoBtn.dataset.idx}`);
        document.querySelectorAll('.fb-add-doors-hint.fb-hint-open').forEach(h => {
          if (h !== hint) h.classList.remove('fb-hint-open');
        });
        if (hint) hint.classList.toggle('fb-hint-open');
        return;
      }

      const addDoorsBtn = event.target.closest('.fb-add-doors-link');
      if (addDoorsBtn) {
        const idx = addDoorsBtn.dataset.idx;
        const canHaveThird = addDoorsBtn.dataset.canHaveThird === '1';
        document.getElementById(`fbAddDoorsRow${idx}`).classList.add('is-hidden');
        document.getElementById(`fbExtraWrap${idx}`).classList.remove('is-hidden');
        document.getElementById(`fbItemInner${idx}`).classList.add('has-extra-doors');

        const exWNode = document.getElementById(`fbW_ex${idx}`);
        const exDNode = document.getElementById(`fbD_ex${idx}`);
        if (exWNode.textContent === '-') {
          const mainW = parseInt(document.getElementById(`fbW${idx}`).textContent);
          const mainD = parseInt(document.getElementById(`fbD${idx}`).textContent);
          const adj = getAdjacentDoors(mainW, mainD);
          exWNode.textContent = adj[0].w;
          exDNode.textContent = adj[0].d;
        }

        if (canHaveThird) {
          const wrap2 = document.getElementById(`fbExtraWrap2_${idx}`);
          if (wrap2 && wrap2.classList.contains('is-hidden')) {
            document.getElementById(`fbAddDoorsRow${idx}`).classList.remove('is-hidden');
          } else if (wrap2 && !wrap2.classList.contains('is-hidden')) {
            document.getElementById(`fbAddDoorsRow${idx}`).classList.add('is-hidden');
          }
        }

        syncCurrentStateFromDOM(parseInt(idx));
        markFeedbackDirty();
        return;
      }

      const cancelExtraBtn = event.target.closest('.fb-cancel-extra-btn');
      if (cancelExtraBtn) {
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

      const cancelThirdBtn = event.target.closest('.fb-cancel-third-btn');
      if (cancelThirdBtn) {
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

// =========================================================
  // STATE MANAGEMENT (Управління станом форми фідбеку)
  // =========================================================
  const fbState = {
    slug: null,         // Поточна станція
    original: {},       // Те, що прийшло з бази/кешу (для порівняння)
    current: {},        // Те, що зараз накликав юзер
    labels: {},         // Описи виходів
    isDirty: false      // Чи є незбережені зміни
  };

  // Функція ініціалізації стану при відкритті станції
  function initFeedbackState(slug) {
    fbState.slug = slug;
    fbState.original = {};
    fbState.current = {};
    fbState.labels = {};
    fbState.isDirty = false;

    if (!slug || !MetroApp.currentStationsData[slug]) return;

    const s = MetroApp.currentStationsData[slug];
    const edits = getLocalEdits()[slug] || {};

    // Заповнюємо стан даними
    s.positions.forEach((p, i) => {
      // Беремо оригінальні значення або локальні правки
      const rawW = String(edits[i]?.wagon ?? p.wagon);
      const rawD = String(edits[i]?.doors ?? p.doors);
      
      // Використовуємо твою ж функцію парсингу
      const parsed = parseDoorValues(rawW, rawD);
      
      // Зберігаємо базовий стан
      fbState.original[i] = { ...parsed, isClosed: !!edits[i]?.closed };
      
      // Глибока копія для поточного стану (щоб юзер міг їх міняти незалежно)
      fbState.current[i] = JSON.parse(JSON.stringify(fbState.original[i]));
      
      // Описи
      fbState.labels[i] = MetroApp.getExitLabel(slug, i) ?? (p.exit ? p.exit.trim() : '');
    });

    // Оновлюємо статус глобальної змінної
    MetroApp.fbUnsaved = false;
  }

function openFeedbackSheet(stationsData) {
    try {
      MetroApp.currentStationsData = stationsData;

      let sheet = document.getElementById('feedbackSheet');
      if (!sheet) {
        sheet = document.createElement('div');
        sheet.id = 'feedbackSheet';
        sheet.className = 'station-sheet';
        
        const template = document.getElementById('tpl-feedback-sheet');
        sheet.appendChild(template.content.cloneNode(true));
        
        document.body.appendChild(sheet);

        // =========================================================
        // ІНІЦІАЛІЗАЦІЯ СЛУХАЧІВ (ВИКОНУЄТЬСЯ РІВНО 1 РАЗ)
        // =========================================================
        const posEl     = document.getElementById('fbPositions');
        const sendBtn   = document.getElementById('fbSend');
        const resultEl  = document.getElementById('fbResult');
        const stationHidden = document.getElementById('fbStation');
        const lineHidden = document.getElementById('fbLine');
        const lineBtn = document.getElementById('fbLineBtn');
        const stationBtn = document.getElementById('fbStationBtn');
        const lineLbl = document.getElementById('fbLineLabel');
        const stationLbl = document.getElementById('fbStationLabel');
        const lineDD = document.getElementById('fbLineDropdown');
        const stationDD = document.getElementById('fbStationDropdown');

        posEl.addEventListener('click', (e) => {
          const slug = stationHidden.value;
          if (!slug) return;
          const s = MetroApp.currentStationsData[slug];

          const restoreBtn = e.target.closest('.fb-restore-exit');
          if (restoreBtn) {
            e.preventDefault(); e.stopPropagation(); 
            const idx = restoreBtn.dataset.idx; 
            const edits = getLocalEdits();
            if (edits[slug] && edits[slug][idx]) {
              delete edits[slug][idx];
              if (Object.keys(edits[slug]).length === 0) delete edits[slug];
              if (Object.keys(edits).length === 0) clearAllLocalEdits(); 
              else localStorage.setItem(LOCAL_EDITS_KEY, JSON.stringify(edits));
            }
            renderFeedbackPositions(slug); 
            if (typeof renderResetBtn === 'function') renderResetBtn();
            return;
          }






const closeBtn = e.target.closest('.fb-close-exit');
          if (closeBtn) {
            const idx = parseInt(closeBtn.dataset.idx); 
            const p = s.positions[idx];
            const loc = [p.dir.startsWith('попередня') ? p.dir : `Попередня ${p.dir}`, p.exit].filter(Boolean).join(' · ');
            
            const exWrap = document.getElementById(`fbExtraWrap${idx}`);
            if (exWrap && !exWrap.classList.contains('is-hidden')) {
                document.getElementById(`fbW${idx}`).textContent = document.getElementById(`fbW_ex${idx}`).textContent;
                document.getElementById(`fbD${idx}`).textContent = document.getElementById(`fbD_ex${idx}`).textContent;
                document.getElementById(`fbW_ex${idx}`).textContent = '-'; document.getElementById(`fbD_ex${idx}`).textContent = '-';
                exWrap.classList.add('is-hidden');
                if (document.getElementById(`fbAddDoorsRow${idx}`)) document.getElementById(`fbAddDoorsRow${idx}`).classList.remove('is-hidden');
                document.getElementById(`fbItemInner${idx}`).classList.remove('has-extra-doors');
                MetroApp.fbUnsaved = true; sendBtn.textContent = 'Застосувати'; sendBtn.disabled = false;
                return;
            }

            // МИТТЄВЕ ЗАКРИТТЯ ВИХОДУ
            saveLocalEdit(slug, idx, { wagon: p.wagon, doors: p.doors, closed: true });
            if (typeof MetroApp.applyLocalEdits === 'function') MetroApp.applyLocalEdits(MetroApp.currentStationsData);
            
            // Оновлюємо інтерфейс — одразу з'явиться плашка "Вихід недоступний" з кнопкою відміни (стрілкою)
            renderFeedbackPositions(slug);
            if (typeof renderResetBtn === 'function') renderResetBtn();

            // Відправляємо розробнику у фоні (тихо)
            fetch(FORMSPREE_URL, { 
              method: 'POST', 
              headers: { 'Content-Type': 'application/json' }, 
              body: JSON.stringify({ 
                station: s.name, 
                slug, 
                line: LINE_NAMES[s.line], 
                changes: `${loc}: ВИХІД ЗАКРИТО` 
              }) 
            }).catch(e => console.warn('[Feedback] Background report failed', e));
          }
        });


function closeAllDD() {
          lineDD.hidden = true; stationDD.hidden = true;
          lineBtn.classList.remove('fb-select-open'); stationBtn.classList.remove('fb-select-open');
          lineBtn.setAttribute('aria-expanded', 'false');
          stationBtn.setAttribute('aria-expanded', 'false');
        }
        sheet._closeAllDD = closeAllDD;

        lineDD.addEventListener('click', (e) => {
          const b = e.target.closest('.fb-dropdown-item');
          if (!b) return;
          e.stopPropagation(); lineHidden.value = b.dataset.value; lineLbl.textContent = b.textContent; closeAllDD();
          stationHidden.value = ''; stationLbl.textContent = '— оберіть —'; posEl.innerHTML = ''; sendBtn.disabled = true;
        });

        stationDD.addEventListener('click', (e) => {
          const b = e.target.closest('.fb-dropdown-item');
          if (!b) return;
          e.stopPropagation(); stationHidden.value = b.dataset.value; stationLbl.textContent = b.textContent; closeAllDD();
          const s = MetroApp.currentStationsData[stationHidden.value];
          if (s && !lineHidden.value) { lineHidden.value = s.line; lineLbl.textContent = LINE_NAMES[s.line]; }
          MetroApp.fbUnsaved = false; closeAllHints(); renderFeedbackPositions(stationHidden.value);
        });

        lineDD.addEventListener('click', e => e.stopPropagation()); 
        stationDD.addEventListener('click', e => e.stopPropagation());
        
        lineBtn.addEventListener('click', e => { 
          e.stopPropagation(); const open = !lineDD.hidden; closeAllDD(); 
          if (!open) { 
            lineDD.innerHTML = [{ value: '', label: '— всі —' }, ...LINE_ORDER.map(l => ({ value: l, label: LINE_NAMES[l] }))].map(it => `<button type="button" role="option" aria-selected="${it.value === lineHidden.value}" class="fb-dropdown-item${it.value === lineHidden.value ? ' fb-dropdown-selected' : ''}" data-value="${it.value}">${it.label}</button>`).join('');
            lineDD.hidden = false; lineBtn.classList.add('fb-select-open'); 
            lineBtn.setAttribute('aria-expanded', 'true');
          } 
        });
        
        stationBtn.addEventListener('click', e => { 
          e.stopPropagation(); const open = !stationDD.hidden; closeAllDD(); 
          if (!open) { 
            const allSt = Object.entries(MetroApp.currentStationsData).map(([sl, st]) => ({ slug: sl, ...st })).sort((a, b) => a.name.localeCompare(b.name, 'uk'));
            const list = lineHidden.value ? allSt.filter(st => st.line === lineHidden.value) : allSt;
            stationDD.innerHTML = list.map(st => `<button type="button" role="option" aria-selected="${st.slug === stationHidden.value}" class="fb-dropdown-item${st.slug === stationHidden.value ? ' fb-dropdown-selected' : ''}" data-value="${st.slug}">${st.name}</button>`).join('');
            stationDD.hidden = false; stationBtn.classList.add('fb-select-open'); 
            stationBtn.setAttribute('aria-expanded', 'true');
          } 
        });

sendBtn.addEventListener('click', () => { if (typeof MetroApp.triggerFeedbackSubmit === 'function') MetroApp.triggerFeedbackSubmit(false); });
        document.getElementById('feedbackClose').addEventListener('click', closeFeedbackSheet);

        // ВІШАЄМО СКЛАДНУ ЛОГІКУ ПЛЮСІВ/МІНУСІВ РІВНО 1 РАЗ!
        bindSteppersOptimized(posEl);

        let swY = 0; let isHandleSwipeFB = false;
        sheet.addEventListener('touchstart', e => { swY = e.touches[0].clientY; isHandleSwipeFB = !!e.target.closest('.sheet-handle-bar'); }, { passive: true });
        sheet.addEventListener('touchend', e => { if (isHandleSwipeFB && (e.changedTouches[0].clientY - swY > 60)) closeFeedbackSheet(); });
      }

      if (sheet._closeDDTimer) clearTimeout(sheet._closeDDTimer);
            sheet._closeDDTimer = setTimeout(() => { document.addEventListener('click', sheet._closeAllDD); }, 0);

      // Глобальні змінні для інших функцій всередині форми
      const posEl = document.getElementById('fbPositions');
      const sendBtn = document.getElementById('fbSend');
      const resultEl = document.getElementById('fbResult');
      const resetWrap = document.getElementById('fbResetWrap');
      const stationEl = { get value() { return document.getElementById('fbStation').value; }, set value(v) { document.getElementById('fbStation').value = v; } };

function renderResetBtn() {
        resetWrap.innerHTML = (hasLocalEdits() && !stationEl.value) ? `<button id="fbReset" class="fb-reset-btn">Скинути локальні зміни</button>` : '';
        document.getElementById('fbReset')?.addEventListener('click', () => {
          MetroApp.showCustomConfirm('Скинути всі локальні зміни та повернутись до стандартних даних?', () => {
            clearAllLocalEdits();
            if (typeof MetroApp.reloadStationsData === 'function') {
              MetroApp.reloadStationsData(true).then(() => {
                resetWrap.innerHTML = '<p class="fb-note fb-success">✓ Локальні зміни скинуто.</p>';
                renderFeedbackPositions(stationEl.value);
              });
            }
          });
        });
      }

      function renderFeedbackPositions(slug) {
        if (!slug) { posEl.innerHTML = ''; sendBtn.disabled = true; return; }
        initFeedbackState(slug);
        const s = MetroApp.currentStationsData[slug];
        if (!s?.positions?.length) { posEl.innerHTML = '<p class="fb-note">Для цієї станції немає позицій.</p>'; return; }
        const edits = getLocalEdits()[slug] || {};

        const groupsMap = new Map();
        s.positions.forEach((p, i) => {
          const key = p.dir;
          let g = groupsMap.get(key);
          if (!g) {
            g = { key, dir: p.dir, items: [] };
            groupsMap.set(key, g);
          }
          g.items.push({ p, i });
        });
        const groups = [...groupsMap.values()];



posEl.innerHTML = groups.map(g => {
          let dirLabel = g.dir === '__long_transfer__' ? 'Довгий перехід на Майдан Незалежності'
                         : (['кінцева', 'вихід праворуч'].includes(g.dir.toLowerCase())) ? g.dir
                         : `Попередня ${MetroApp.properCase(g.dir.replace(/^[Пп]опередня[\s\u00a0]+/, ''))}`;

          const itemsHtml = g.items.map((item, index) => {
            // Читаємо ВСЕ напряму з нашого Стейту, жодних обчислень у рендері!
            const state = fbState.current[item.i];
            const isClosed = state.isClosed;
            const dividerHtml = (index !== g.items.length - 1) ? `<div class="fb-item-divider"></div>` : '';
            const rawExit = fbState.labels[item.i];

            const exitLabelHtml = '<div class="fb-exit-label-row">'
              + '<div class="fb-exit-label-row-inner">'
              + '<span class="fb-exit-label-text">' + rawExit + '</span>'
              + (rawExit
                ? '<button type="button" class="fb-exit-label-edit-btn" data-item-idx="' + item.i + '" aria-label="Редагувати">' + MetroApp.Icons.pencil + '</button>'
                : '<button type="button" class="fb-add-desc-btn" data-item-idx="' + item.i + '">додати опис</button>')
              + '</div>'
              + '</div>'
              + '<div class="fb-exit-label-input-wrap" id="fbLabelWrap' + item.i + '">'
              + '<input type="text" class="fb-exit-label-input" id="fbLabelInput' + item.i + '" value="' + rawExit.replace(/"/g, '&quot;') + '" maxlength="60">'
              + '</div>';
              
            return exitLabelHtml + `
            <div class="fb-item-inner ${state.hasExtra ? 'fb-pos-multi has-extra-doors' : ''} ${state.hasThird ? 'has-three-doors' : ''} ${isClosed ? 'fb-pos-closed' : ''}" data-idx="${item.i}" id="fbItemInner${item.i}">
              ${isClosed
                ? `<div class="fb-closed-note-wrap"><span class="fb-closed-note">Вихід позначено як недоступний</span><button type="button" class="fb-restore-exit" data-idx="${item.i}" aria-label="Відновити вихід">${MetroApp.Icons.undo}</button></div>`
                : `<div class="fb-pos-wrap"><div class="fb-side-actions-left"><button type="button" class="fb-add-doors-info" data-idx="${item.i}">${MetroApp.Icons.info}</button></div>
                   <div class="fb-pos-inputs">${stepperHtml(`fbW${item.i}`, state.wMain, 1, 5, 'вагон')}${stepperHtml(`fbD${item.i}`, state.dMain, 1, 4, 'двері')}</div>
                   <div class="fb-side-actions"><button type="button" class="fb-close-exit" data-idx="${item.i}">✕</button></div></div>
                   <div class="fb-extra-door-wrap ${state.hasExtra ? '' : 'is-hidden'}" id="fbExtraWrap${item.i}"><div class="fb-pos-wrap" style="margin-top: 4px;"><div class="fb-side-actions-left"></div><div class="fb-pos-inputs">${stepperHtml(`fbW_ex${item.i}`, state.wEx, 1, 5, 'вагон')}${stepperHtml(`fbD_ex${item.i}`, state.dEx, 1, 4, 'двері')}</div><div class="fb-side-actions"><button type="button" class="fb-cancel-extra-btn" data-idx="${item.i}">✕</button></div></div></div>
                   <div class="fb-extra-door-wrap ${state.hasThird ? '' : 'is-hidden'}" id="fbExtraWrap2_${item.i}"><div class="fb-pos-wrap" style="margin-top: 4px;"><div class="fb-side-actions-left"></div><div class="fb-pos-inputs">${stepperHtml(`fbW_ex2_${item.i}`, state.wEx2, 1, 5, 'вагон')}${stepperHtml(`fbD_ex2_${item.i}`, state.dEx2, 1, 4, 'двері')}</div><div class="fb-side-actions"><button type="button" class="fb-cancel-third-btn" data-idx="${item.i}">✕</button></div></div></div>
                   <div class="fb-add-doors-row ${state.hasExtra ? 'is-hidden' : ''}" id="fbAddDoorsRow${item.i}" style="justify-content:center;"><button type="button" class="fb-add-doors-link" id="fbAddBtn${item.i}" data-idx="${item.i}" data-can-have-third="${state.hasThird ? '1' : '0'}">+1</button></div>
                   <div class="fb-add-doors-hint" id="fbHint${item.i}"><div class="fb-add-doors-hint-inner"><div class="hint-1-door"><p>+1 — другі зручні двері для виходу. Можна&nbsp;обрати тільки&nbsp;сусідні&nbsp;двері</p><p><span style="color:#c8523a">✕</span> позначає&nbsp;вихід як&nbsp;тимчасово&nbsp;недоступний</p></div><div class="hint-2-doors"><p><span style="color:#5B9BD5">✕</span> скасовує додавання других дверей.</p></div></div></div>`
              }
            </div>${dividerHtml}`;
          }).join('');
          
          // Звідси також прибрано 'мертвий код' про додавання виходів, який ти просив видалити раніше
          return `<div class="fb-pos-row"><div class="fb-dir-label-wrap"><div class="fb-dir-label">${dirLabel}</div></div>${itemsHtml}</div>`;
        }).join('');

        sendBtn.disabled = true;
        renderResetBtn();
      }




MetroApp.triggerFeedbackSubmit = async function(background = false) {
        // Запобіжник від подвійних кліків
        if (MetroApp._isSubmitting) return;
        MetroApp._isSubmitting = true;

        const slug = stationEl.value;
        if (!slug) { MetroApp._isSubmitting = false; return; }
        
        try {
          const s = MetroApp.currentStationsData[slug];
          
          // Збираємо зміни позицій
          const posChanges = s.positions.map((p, i) => {
            // Передаємо в функцію об'єкт стану, а не індекс!
            const vals = extractFinalValues(fbState.current[i]);
            if (!vals) return null;
            return (vals.finalW !== String(p.wagon) || vals.finalD !== String(p.doors)) ? { i, p, nw: vals.finalW, nd: vals.finalD } : null;
          }).filter(Boolean);

          // Збираємо зміни описів
          const labelChanges = [];
          document.querySelectorAll('.fb-exit-label-input').forEach(inp => {
             if (inp.dataset.changed === "true") {
                const idx = inp.id.replace('fbLabelInput', '');
                const p = s.positions[idx];
                const loc = [p?.dir, p?.exit].filter(Boolean).join(' · '); 
                labelChanges.push(`${loc}: НОВИЙ ОПИС [${inp.value}]`);
                inp.dataset.changed = "false";
             }
          });

          // Якщо змін немає
          if (!posChanges.length && !labelChanges.length) { 
            if (!background) {
                resultEl.innerHTML = '<p class="fb-note">Змін не виявлено.</p>';
                // Видаляємо напис через 3 секунди, щоб повернути розмір
                setTimeout(() => { resultEl.innerHTML = ''; }, 3000);
            }
            MetroApp.fbUnsaved = false; 
            MetroApp._isSubmitting = false;
            return; 
          }
          
          // Застосовуємо локально
          posChanges.forEach(c => saveLocalEdit(slug, c.i, { wagon: c.nw, doors: c.nd }));
          if (typeof MetroApp.applyLocalEdits === 'function') MetroApp.applyLocalEdits(MetroApp.currentStationsData);
          MetroApp.fbUnsaved = false; 

          if (!background) { 
            sendBtn.disabled = true;
            sendBtn.innerHTML = '<span class="fb-send-spinner"></span>';
            renderFeedbackPositions(slug); 
            resultEl.innerHTML = '';
          }

          let formspreeBody = posChanges.map(c => changeText(c.p, c.nw, c.nd, false));
          formspreeBody = formspreeBody.concat(labelChanges); 

          const response = await fetch(FORMSPREE_URL, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ station: s.name, slug, line: LINE_NAMES[s.line], changes: formspreeBody.join('\n') })
          });
          
          if (!response.ok) throw new Error('Помилка сервера');
          
          // === УСПІШНЕ ЗАВЕРШЕННЯ ===
          if (!background) {
            sendBtn.textContent = 'Зміни застосовано';
            sendBtn.style.color = 'var(--text-muted)';
            sendBtn.disabled = true;
            resultEl.innerHTML = '';
          }
        } catch (error) {
          console.error('[KyivMetroGO] Помилка відправки:', error);
          if (!background) {
            sendBtn.textContent = 'Спробувати ще раз'; 
            sendBtn.disabled = false;
            resultEl.innerHTML = ''; // Навіть при помилці тримаємо вікно стабільним
          }
        } finally {
          MetroApp._isSubmitting = false;
        }
      };

// === СКИДАННЯ ФОРМИ ДО СТАРТОВОГО СТАНУ ===
      const stationHidden = document.getElementById('fbStation');
      const lineHidden = document.getElementById('fbLine');
      const stationLbl = document.getElementById('fbStationLabel');
      const lineLbl = document.getElementById('fbLineLabel');
      
      if (stationHidden) stationHidden.value = '';
      if (lineHidden) lineHidden.value = '';
      if (stationLbl) stationLbl.textContent = '— оберіть —';
      if (lineLbl) lineLbl.textContent = '— всі —';
      if (posEl) posEl.innerHTML = '';
      if (resultEl) resultEl.innerHTML = '';
      if (sendBtn) {
        sendBtn.textContent = 'Застосувати';
        sendBtn.disabled = true;
        sendBtn.style.color = ''; // Повертаємо стандартний колір
      }
      if (sheet._closeAllDD) sheet._closeAllDD(); // Закриваємо дропдауни, якщо вони були відкриті

      renderResetBtn();
      
      document.querySelectorAll('.station-sheet').forEach(el => el.classList.remove('sheet-open'));
      sheet.classList.add('sheet-open'); 
      document.getElementById('sheetOverlay').classList.add('overlay-visible');      
    } catch(err) { console.error('[FeedbackSheet ERROR]', err); }
  }
  function forceCloseFeedbackSheet() {
    MetroApp.fbUnsaved = false;
    const s = document.getElementById('feedbackSheet');
    if (s?._closeAllDD) { document.removeEventListener('click', s._closeAllDD); s._closeAllDD = null; }
    s?.classList.remove('sheet-open');
    const anyOpen = document.querySelectorAll('.station-sheet.sheet-open').length > 0;
    if (!anyOpen) document.getElementById('sheetOverlay')?.classList.remove('overlay-visible');
  }

MetroApp.hasUnsavedFeedback = function() {
    // Надійне читання стану з JS-змінної замість парсингу DOM
    return !!MetroApp.fbUnsaved;
  };


function closeFeedbackSheet() {
    try {
      if (MetroApp.hasUnsavedFeedback && MetroApp.hasUnsavedFeedback()) {
        if (typeof MetroApp.showCustomConfirm === 'function') {
          const stationName = document.getElementById('fbStationLabel')?.textContent || '';
          const question = stationName ? `Зберегти зміни для станції <span style="white-space: nowrap;">${stationName}?</span>` : 'Зберегти зміни?';
          
          MetroApp.showCustomConfirm(question, () => {
            if (typeof MetroApp.triggerFeedbackSubmit === 'function') MetroApp.triggerFeedbackSubmit(true);
            forceCloseFeedbackSheet();
          }, () => { forceCloseFeedbackSheet(); }, () => { /* Скасувати */ });
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

})();