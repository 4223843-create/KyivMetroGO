/* ══ FEEDBACK SHEET ══ */
(function() {

  /* ==========================================================================
     1. КОНСТАНТИ ТА ГЛОБАЛЬНИЙ СТАН
     ========================================================================== */
  const FORMSPREE_URL = 'https://formspree.io/f/mgopobnd';
  const LINE_COLOR = { red: '#c8523a', blue: '#5b9bd5', green: '#5aaa6a' };
  const LINE_NAMES = { red: 'Червона', blue: 'Синя', green: 'Зелена' };
  const LINE_ORDER = ['red', 'blue', 'green'];
  const LOCAL_EDITS_KEY = 'metro_local_edits';
  
  let currentStationsData = null; 

  /* ==========================================================================
     2. РОБОТА З LOCAL STORAGE
     ========================================================================== */
  function getLocalEdits() {
    try { return JSON.parse(localStorage.getItem(LOCAL_EDITS_KEY) || '{}'); } catch { return {}; }
  }
  
  function saveLocalEdit(slug, posIdx, data) {
    const edits = getLocalEdits();
    if (!edits[slug]) edits[slug] = {};
    edits[slug][posIdx] = data;
    localStorage.setItem(LOCAL_EDITS_KEY, JSON.stringify(edits));
  }
  
  function clearAllLocalEdits() { localStorage.removeItem(LOCAL_EDITS_KEY); }
  
  function hasLocalEdits() { return Object.keys(getLocalEdits()).length > 0; }

  function applyLocalEdits(stationsData) {
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
              // Skip corrupt edits with NaN wagon/doors values
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
      if (Object.keys(edits).length === 0) localStorage.removeItem('metro_local_edits');
      else localStorage.setItem('metro_local_edits', JSON.stringify(edits));
    }
  }

  /* ==========================================================================
     3. ДОПОМІЖНІ ФУНКЦІЇ (HELPERS)
     ========================================================================== */
  function stepperHtml(id, value, min, max, label) {
    return `<div class="fb-input-wrap">
      <span class="fb-input-label">${label}</span>
      <div class="fb-stepper">
        <button type="button" class="fb-step fb-step-down" data-id="${id}" data-min="${min}" data-max="${max}">−</button>
        <span class="fb-step-val" id="${id}">${value}</span>
        <button type="button" class="fb-step fb-step-up" data-id="${id}" data-min="${min}" data-max="${max}">+</button>
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

  function markFeedbackDirty() {
    window.fbUnsaved = true;
    const sendBtn = document.getElementById('fbSend');
    if (sendBtn) {
      sendBtn.textContent = 'Запропонувати зміни';
      sendBtn.disabled = false;
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

  function extractFinalValues(i) {
    const wNode = document.getElementById(`fbW${i}`);
    const dNode = document.getElementById(`fbD${i}`);
    if (!wNode || !dNode) return null;

    let finalW = wNode.textContent;
    let finalD = dNode.textContent;

    const exWNode  = document.getElementById(`fbW_ex${i}`);
    const exDNode  = document.getElementById(`fbD_ex${i}`);
    const ex2WNode = document.getElementById(`fbW_ex2_${i}`);
    const ex2DNode = document.getElementById(`fbD_ex2_${i}`);

    const hasEx  = exWNode  && exWNode.textContent  !== '-' && exDNode  && exDNode.textContent  !== '-';
    const hasEx2 = ex2WNode && ex2WNode.textContent !== '-' && ex2DNode && ex2DNode.textContent !== '-';

    if (hasEx && hasEx2) {
      // Три двері в одному вагоні → діапазон "d1-d3"
      const doors = [parseInt(finalD), parseInt(exDNode.textContent), parseInt(ex2DNode.textContent)].sort((a,b) => a-b);
      finalD = `${doors[0]}-${doors[2]}`;
    } else if (hasEx) {
      const exW = exWNode.textContent; const exD = exDNode.textContent;
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

  // Парсинг значень дверей:
  //   '1'       → одні двері
  //   '3-4'     → дві сусідні двері (вагон3 двері1..двері2)
  //   '1-3'     → три двері діапазоном (Хрещатик: 1, 2, 3)
  //   '1, 2'    → два різні входи (різні вагони)
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
      // Формат "1, 4" — два різних входи з різними вагонами
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
      // Три двері: діапазон охоплює більше 2 (напр. 1-3 = двері 1, 2, 3)
      if (d2 - d1 >= 2) {
        hasThird = true;
        wEx2 = wMain; dEx2 = d2;
        dEx = d1 + 1; // середні двері
      }
    }
    return { wMain, dMain, wEx, dEx, wEx2, dEx2, hasExtra, hasThird };
  }

  // НОВЕ: Універсальна підготовка масиву positions
  function normalizeStationsData(targetData) {
    Object.values(targetData).forEach(s => {
      s.positions = [];
      s.directions?.forEach(dir => {
        dir.exits?.forEach(exit => {
          exit.positions?.forEach(pos => {
            s.positions.push({ dir: dir.from, exit: exit.label || '', wagon: pos.wagon, doors: pos.doors });
          });
        });
      });
    });
  }

  /* ==========================================================================
     4. ОБРОБНИКИ КНОПОК ТА ПОДІЙ (BINDERS)
     ========================================================================== */
  /* ==========================================================================
     5. РЕНДЕРИНГ ІНТЕРФЕЙСУ ТА КЕРУВАННЯ ФОРМОЮ
     ========================================================================== */
  function bindSteppersOptimized(container) {
    if (container._fbSteppersBound) return;
    container._fbSteppersBound = true;

    container.addEventListener('click', (event) => {
      const btn = event.target.closest('.fb-step');
      if (btn) {
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

          // Cascade to third door if it exists
          const ex2WNode2 = document.getElementById(`fbW_ex2_${idx}`);
          const ex2DNode2 = document.getElementById(`fbD_ex2_${idx}`);
          const wrap2b = document.getElementById(`fbExtraWrap2_${idx}`);
          if (ex2WNode2 && ex2DNode2 && wrap2b && wrap2b.style.display !== 'none') {
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
            // Cascade to third door if exists
            const ex2WNode = document.getElementById(`fbW_ex2_${idx}`);
            const ex2DNode = document.getElementById(`fbD_ex2_${idx}`);
            const wrap2 = document.getElementById(`fbExtraWrap2_${idx}`);
            if (ex2WNode && ex2DNode && wrap2 && wrap2.style.display !== 'none') {
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

        const noteEl = document.getElementById(`fbExtraNote${idx}`);
        if (noteEl && noteEl.style.display === 'none') noteEl.style.display = 'block';
        markFeedbackDirty();
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
        document.getElementById(`fbAddDoorsRow${idx}`).style.display = 'none';
        document.getElementById(`fbExtraWrap${idx}`).style.display = 'block';
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

        markFeedbackDirty();
        return;
      }

      const cancelExtraBtn = event.target.closest('.fb-cancel-extra-btn');
      if (cancelExtraBtn) {
        const idx = cancelExtraBtn.dataset.idx;
        document.getElementById(`fbW_ex${idx}`).textContent = '-';
        document.getElementById(`fbD_ex${idx}`).textContent = '-';
        document.getElementById(`fbExtraWrap${idx}`).style.display = 'none';

        const addRow = document.getElementById(`fbAddDoorsRow${idx}`);
        if (addRow) addRow.style.display = 'flex';

        document.getElementById(`fbItemInner${idx}`).classList.remove('has-extra-doors');
        markFeedbackDirty();
      }

      const cancelThirdBtn = event.target.closest('.fb-cancel-third-btn');
      if (cancelThirdBtn) {
        const idx = cancelThirdBtn.dataset.idx;
        document.getElementById(`fbW_ex2_${idx}`).textContent = '-';
        document.getElementById(`fbD_ex2_${idx}`).textContent = '-';
        document.getElementById(`fbExtraWrap2_${idx}`).style.display = 'none';
        // Reshow +1 button so user can add third door again
        const addRow3 = document.getElementById(`fbAddDoorsRow${idx}`);
        if (addRow3) addRow3.style.display = 'flex';
        markFeedbackDirty();
      }
    });
  }

  function markFeedbackDirty() {
    window.fbUnsaved = true;
    const sendBtn = document.getElementById('fbSend');
    if (sendBtn) {
      sendBtn.textContent = 'Запропонувати зміни';
      sendBtn.disabled = false;
    }
  }

  function openFeedbackSheet(stationsData) {
    try {
      currentStationsData = stationsData;
      normalizeStationsData(currentStationsData); // Використовуємо новий хелпер
      window.fbUnsaved = false;

      let sheet = document.getElementById('feedbackSheet');
      if (!sheet) {
        sheet = document.createElement('div');
        sheet.id = 'feedbackSheet';
        sheet.className = 'station-sheet';
        document.body.appendChild(sheet);
      }

      const allStations = Object.entries(currentStationsData)
        .map(([slug, s]) => ({ slug, ...s }))
        .sort((a, b) => a.name.localeCompare(b.name, 'uk'));

      const lineSelectHtml = `<button type="button" class="fb-custom-select" id="fbLineBtn"><span id="fbLineLabel">— всі —</span><span class="fb-select-arrow">&#8964;</span></button><input type="hidden" id="fbLine" value="">`;
      const stationSelectHtml = `<button type="button" class="fb-custom-select" id="fbStationBtn"><span id="fbStationLabel">— оберіть —</span><span class="fb-select-arrow">&#8964;</span></button><input type="hidden" id="fbStation" value="">`;

      sheet.innerHTML = `
        <div class="sheet-handle-bar">
          <div class="sheet-handle"></div><span class="sheet-sheet-title">Запропонувати зміни</span><button class="sheet-close-btn" id="feedbackClose">✕</button>
        </div>
        <div class="sheet-body" id="feedbackBody">
          <p class="fb-main-intro-text">Виправте неточності. Зміни застосуються&nbsp;локально та надійдуть&nbsp;розробнику</p>
          <div class="fb-selectors">
            <div class="fb-select-wrap"><div id="fbLineDropdown" class="fb-dropdown" hidden></div><div class="fb-select-inner"><label class="fb-label">Гілка</label>${lineSelectHtml}</div></div>
            <div class="fb-select-wrap"><div id="fbStationDropdown" class="fb-dropdown" hidden></div><div class="fb-select-inner"><label class="fb-label">Станція</label>${stationSelectHtml}</div></div>
          </div>
          <div id="fbPositions"></div>
          <div class="fb-footer-sticky">
            <button id="fbSend" class="fb-send-btn" disabled>Запропонувати зміни</button>
            <div id="fbResult"></div><div id="fbResetWrap"></div>
          </div>
        </div>`;

      const posEl     = document.getElementById('fbPositions');
      const sendBtn   = document.getElementById('fbSend');
      const resultEl  = document.getElementById('fbResult');
      const resetWrap = document.getElementById('fbResetWrap');
      let lineEl, stationEl;

      const lineHidden = document.getElementById('fbLine'), stationHidden = document.getElementById('fbStation');
        const lineBtn = document.getElementById('fbLineBtn'), stationBtn = document.getElementById('fbStationBtn');
        const lineLbl = document.getElementById('fbLineLabel'), stationLbl = document.getElementById('fbStationLabel');
        const lineDD = document.getElementById('fbLineDropdown'), stationDD = document.getElementById('fbStationDropdown');

        lineEl = { get value() { return lineHidden.value; }, set value(v) { lineHidden.value = v; } };
        stationEl = { get value() { return stationHidden.value; }, set value(v) { stationHidden.value = v; } };

        function closeAllDD() {
          lineDD.hidden = true; stationDD.hidden = true;
          lineBtn.classList.remove('fb-select-open'); stationBtn.classList.remove('fb-select-open');
        }

        function buildLineDD() {
          const items = [{ value: '', label: '— всі —' }, ...LINE_ORDER.map(l => ({ value: l, label: LINE_NAMES[l] }))];
          lineDD.innerHTML = items.map(it => `<button type="button" class="fb-dropdown-item${it.value === lineEl.value ? ' fb-dropdown-selected' : ''}" data-value="${it.value}">${it.label}</button>`).join('');
          lineDD.querySelectorAll('.fb-dropdown-item').forEach(b => b.addEventListener('click', (e) => { 
            e.stopPropagation(); lineEl.value = b.dataset.value; lineLbl.textContent = b.textContent; closeAllDD();
            stationEl.value = ''; stationLbl.textContent = '— оберіть —'; posEl.innerHTML = ''; sendBtn.disabled = true;
          }));
        }

        function buildStationDD() {
          const list = lineEl.value ? allStations.filter(s => s.line === lineEl.value) : allStations;
          stationDD.innerHTML = list.map(s => `<button type="button" class="fb-dropdown-item${s.slug === stationEl.value ? ' fb-dropdown-selected' : ''}" data-value="${s.slug}">${s.name}</button>`).join('');
          stationDD.querySelectorAll('.fb-dropdown-item').forEach(b => b.addEventListener('click', (e) => { 
            e.stopPropagation(); stationEl.value = b.dataset.value; stationLbl.textContent = b.textContent; closeAllDD();
            const s = currentStationsData[stationEl.value];
            if (s && !lineEl.value) { lineEl.value = s.line; lineLbl.textContent = LINE_NAMES[s.line]; }
            window.fbUnsaved = false; closeAllHints(); renderPositions(stationEl.value);
          }));
        }

        lineDD.addEventListener('click', e => e.stopPropagation()); stationDD.addEventListener('click', e => e.stopPropagation());
        lineBtn.addEventListener('click', e => { e.stopPropagation(); const open = !lineDD.hidden; closeAllDD(); if (!open) { buildLineDD(); lineDD.hidden = false; lineBtn.classList.add('fb-select-open'); } });
        stationBtn.addEventListener('click', e => { e.stopPropagation(); const open = !stationDD.hidden; closeAllDD(); if (!open) { buildStationDD(); stationDD.hidden = false; stationBtn.classList.add('fb-select-open'); } });
        if (sheet._closeAllDD) document.removeEventListener('click', sheet._closeAllDD);
        setTimeout(() => { document.addEventListener('click', closeAllDD); }, 0);
        sheet._closeAllDD = closeAllDD;

      function renderResetBtn() {
        resetWrap.innerHTML = (hasLocalEdits() && !stationEl.value) ? `<button id="fbReset" class="fb-reset-btn">Скинути локальні зміни</button>` : '';
        document.getElementById('fbReset')?.addEventListener('click', () => {
          window.showCustomConfirm('Скинути всі локальні зміни та повернутись до стандартних даних?', () => {
            clearAllLocalEdits();
            if (typeof window.reloadStationsData === 'function') {
              window.reloadStationsData(true);
            } else {
              fetch(`stations.json?nc=${Date.now()}`).then(r => r.json()).then(d => {
                Object.keys(stationsData).forEach(k => delete stationsData[k]);
                d.stations.forEach(s => { stationsData[s.slug] = s; });
                applyLocalEdits(stationsData);
              });
            }
            resetWrap.innerHTML = '<p class="fb-note fb-success">✓ Локальні зміни скинуто.</p>';
            renderPositions(stationEl.value);
          });
        });
      }

      function renderPositions(slug) {
        if (!slug) { posEl.innerHTML = ''; sendBtn.disabled = true; return; }
        const s = currentStationsData[slug];
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

        function properCase(name) {
          const alwaysCap = new Set(['україна','україни','українських','дніпра','незалежності','небесної','сотні','спорту','центр','площа','площі','героїв','лівий','правий']);
          return name.split(' ').map((w, index) => {
            const wl = w.toLowerCase();
            return (index === 0 || alwaysCap.has(wl)) ? wl.charAt(0).toUpperCase() + wl.slice(1) : wl;
          }).join(' ');
        }

        posEl.innerHTML = groups.map(g => {
          let dirLabel = g.dir === '__long_transfer__' ? 'Довгий перехід на Майдан Незалежності'
                         : (['кінцева', 'вихід праворуч'].includes(g.dir.toLowerCase())) ? g.dir
                         : `Попередня ${properCase(g.dir.replace(/^[Пп]опередня\s+/, ''))}`;

          const itemsHtml = g.items.map((item, index) => {
            const rawW = String(edits[item.i]?.wagon ?? item.p.wagon);
            const rawD = String(edits[item.i]?.doors ?? item.p.doors);
            const { wMain, dMain, wEx, dEx, wEx2, dEx2, hasExtra, hasThird } = parseDoorValues(rawW, rawD);
            
            const isClosed = edits[item.i]?.closed;
            const dividerHtml = (index !== g.items.length - 1) ? `<div class="fb-item-divider"></div>` : '';

            const exitSubLabel = item.p.exit ? `<div class="fb-exit-label" style="font-size:12px;color:var(--text-muted);text-align:center;margin:0 0 6px;opacity:0.8;">${item.p.exit.replace(/[🟥🟦🟩]/g,'').trim()}</div>` : '';
            return `${exitSubLabel}
            <div class="fb-item-inner ${hasExtra ? 'fb-pos-multi has-extra-doors' : ''} ${hasThird ? 'has-three-doors' : ''} ${isClosed ? 'fb-pos-closed' : ''}" data-idx="${item.i}" id="fbItemInner${item.i}">
              ${isClosed
                ? `<div class="fb-closed-note-wrap"><span class="fb-closed-note">Вихід позначено як недоступний</span><button type="button" class="fb-restore-exit" data-idx="${item.i}" aria-label="Відновити вихід"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/></svg></button></div>`
: `<div class="fb-pos-wrap"><div class="fb-side-actions-left"><button type="button" class="fb-add-doors-info" data-idx="${item.i}"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 26 42" fill="currentColor"><path d="m312.043 291.275-2.063 8.438q-9.28 3.656-14.812 5.53-5.531 1.97-12.844 1.97-11.25 0-17.531-5.438-6.188-5.531-6.188-13.969 0-3.28.47-6.656.468-3.469 1.5-7.781l7.687-27.375q1.031-3.938 1.687-7.406.75-3.563.75-6.47 0-5.25-2.156-7.312t-8.25-2.062q-3 0-6.188.937-3.093.938-5.343 1.782l2.062-8.438q7.594-3.094 14.531-5.25 6.938-2.25 13.125-2.25 11.157 0 17.157 5.438 6.093 5.343 6.093 13.968 0 1.782-.468 6.282-.375 4.5-1.5 8.25l-7.688 27.28q-.937 3.282-1.687 7.5-.75 4.22-.75 6.376 0 5.437 2.437 7.406 2.438 1.969 8.438 1.969 2.812 0 6.375-.938 3.562-1.03 5.156-1.78m1.969-114.469q0 7.125-5.438 12.188-5.344 4.969-12.937 4.969-7.594 0-13.032-4.97-5.437-5.062-5.437-12.187t5.437-12.187 13.032-5.063 12.937 5.063q5.438 5.062 5.438 12.187" transform="translate(-65.818 -42.216)scale(.26458)"/></svg></button></div>
                   <div class="fb-pos-inputs">${stepperHtml(`fbW${item.i}`, wMain, 1, 5, 'вагон')}${stepperHtml(`fbD${item.i}`, dMain, 1, 4, 'двері')}</div>
                   <div class="fb-side-actions"><button type="button" class="fb-close-exit" data-idx="${item.i}">✕</button></div></div>                   <div class="fb-extra-door-wrap" id="fbExtraWrap${item.i}" style="display: ${hasExtra ? 'block' : 'none'};"><div class="fb-pos-wrap" style="margin-top: 4px;"><div class="fb-side-actions-left"></div><div class="fb-pos-inputs">${stepperHtml(`fbW_ex${item.i}`, wEx, 1, 5, 'вагон')}${stepperHtml(`fbD_ex${item.i}`, dEx, 1, 4, 'двері')}</div><div class="fb-side-actions"><button type="button" class="fb-cancel-extra-btn" data-idx="${item.i}">✕</button></div></div></div>
                   <div class="fb-extra-door-wrap" id="fbExtraWrap2_${item.i}" style="display: ${hasThird ? 'block' : 'none'};"><div class="fb-pos-wrap" style="margin-top: 4px;"><div class="fb-side-actions-left"></div><div class="fb-pos-inputs">${stepperHtml(`fbW_ex2_${item.i}`, wEx2, 1, 5, 'вагон')}${stepperHtml(`fbD_ex2_${item.i}`, dEx2, 1, 4, 'двері')}</div><div class="fb-side-actions"><button type="button" class="fb-cancel-third-btn" data-idx="${item.i}">✕</button></div></div></div>
                   <div class="fb-add-doors-row" id="fbAddDoorsRow${item.i}" style="display:${hasExtra ? 'none' : 'flex'}; justify-content:center;"><button type="button" class="fb-add-doors-link" id="fbAddBtn${item.i}" data-idx="${item.i}">+1</button></div>
                   <div class="fb-add-doors-hint" id="fbHint${item.i}"><div class="fb-add-doors-hint-inner"><div class="hint-1-door"><p>+1 — другі зручні двері для виходу. Можна&nbsp;обрати тільки&nbsp;сусідні&nbsp;двері.</p><p>Якщо двері лише одні, <span style="color:#c8523a">✕</span> позначить&nbsp;вихід як&nbsp;тимчасово&nbsp;недоступний</p></div><div class="hint-2-doors"><p><span style="color:#5B9BD5">✕</span> скасовує додавання других дверей.</p></div></div></div>`
              }
            </div>${dividerHtml}`;
          }).join('');
          return `<div class="fb-pos-row"><div class="fb-dir-label-wrap"><div class="fb-dir-label">${dirLabel}</div></div>${itemsHtml}</div>`;
        }).join('');

        bindSteppersOptimized(posEl);
        sendBtn.disabled = false;

        posEl.querySelectorAll('.fb-restore-exit').forEach(btn => {
          btn.addEventListener('click', (e) => {
            e.preventDefault(); e.stopPropagation(); 
            const idx = btn.dataset.idx; const slug = document.getElementById('fbStation').value; const edits = getLocalEdits();
            if (edits[slug] && edits[slug][idx]) {
              delete edits[slug][idx];
              if (Object.keys(edits[slug]).length === 0) delete edits[slug];
              if (Object.keys(edits).length === 0) clearAllLocalEdits(); else localStorage.setItem(LOCAL_EDITS_KEY, JSON.stringify(edits));
            }
            renderPositions(slug); if (typeof renderResetBtn === 'function') renderResetBtn();
          });
        });

        posEl.querySelectorAll('.fb-close-exit').forEach(btn => {
          btn.addEventListener('click', () => {
            const idx = parseInt(btn.dataset.idx); const p = s.positions[idx];
            const loc = [p.dir.startsWith('попередня') ? p.dir : `Попередня ${p.dir}`, p.exit].filter(Boolean).join(' · ');
            const exWrap = document.getElementById(`fbExtraWrap${idx}`);
            if (exWrap && exWrap.style.display !== 'none') {
                document.getElementById(`fbW${idx}`).textContent = document.getElementById(`fbW_ex${idx}`).textContent;
                document.getElementById(`fbD${idx}`).textContent = document.getElementById(`fbD_ex${idx}`).textContent;
                document.getElementById(`fbW_ex${idx}`).textContent = '-'; document.getElementById(`fbD_ex${idx}`).textContent = '-';
                exWrap.style.display = 'none';
                if (document.getElementById(`fbAddDoorsRow${idx}`)) document.getElementById(`fbAddDoorsRow${idx}`).style.display = 'flex';
                document.getElementById(`fbItemInner${idx}`).classList.remove('has-extra-doors');
                window.fbUnsaved = true; sendBtn.textContent = 'Запропонувати зміни'; sendBtn.disabled = false;
                return; 
            }
            window.showCustomConfirm('Позначити вихід як недоступний?', () => {
              saveLocalEdit(slug, idx, { wagon: p.wagon, doors: p.doors, closed: true }); applyLocalEdits(stationsData); window.fbUnsaved = false; renderPositions(slug);
              fetch(FORMSPREE_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ station: s.name, slug, line: LINE_NAMES[s.line], changes: `${loc}: ВИХІД ЗАКРИТО` }) }).catch(e => console.warn(e));
              resultEl.innerHTML = `<p class="fb-note fb-success" style="padding-bottom: 0; margin-bottom: 6px;">Дякуємо, пропозицію надіслано,<br>зміни застосовано локально.</p><button id="fbUndoCurrent" class="fb-reset-btn" style="margin-top: 0; padding-top: 8px;">Скасувати ці зміни</button>`;
              attachUndoBtn(slug, resultEl, renderPositions, renderResetBtn);
            });
          });
        });
        renderResetBtn();
      }

      function attachUndoBtn(slug, resultContainer, renderFn, resetBtnFn) {
        document.getElementById('fbUndoCurrent')?.addEventListener('click', () => {
          const edits = getLocalEdits();
          if (edits[slug]) {
            delete edits[slug];
            if (Object.keys(edits).length === 0) clearAllLocalEdits(); else localStorage.setItem(LOCAL_EDITS_KEY, JSON.stringify(edits));
          }

          const reloadPromise = typeof window.reloadStationsData === 'function'
            ? window.reloadStationsData(true)
            : fetch(`stations.json?nc=${Date.now()}`).then(r => r.json()).then(d => {
                Object.keys(currentStationsData).forEach(k => delete currentStationsData[k]);
                d.stations.forEach(st => { currentStationsData[st.slug] = st; });
              });

          Promise.resolve(reloadPromise).then(() => {
            normalizeStationsData(currentStationsData);
            applyLocalEdits(currentStationsData);
            resultContainer.innerHTML = '<p class="fb-note">Зміни скасовано.</p>';
            renderFn(slug); if (typeof resetBtnFn === 'function') resetBtnFn();
          });
        });
      }

      window.triggerFeedbackSubmit = async function(background = false) {
        const slug = stationEl.value;
        if (!slug) return;
        const s = currentStationsData[slug];
        const changes = s.positions.map((p, i) => {
          const vals = extractFinalValues(i);
          if (!vals) return null;
          return (vals.finalW !== String(p.wagon) || vals.finalD !== String(p.doors)) ? { i, p, nw: vals.finalW, nd: vals.finalD } : null;
        }).filter(Boolean);

        if (!changes.length) { 
          if (!background) resultEl.innerHTML = '<p class="fb-note">Змін не виявлено.</p>'; 
          window.fbUnsaved = false; return; 
        }
        
        changes.forEach(c => saveLocalEdit(slug, c.i, { wagon: c.nw, doors: c.nd }));
        if (typeof window.applyLocalEdits === 'function') window.applyLocalEdits(currentStationsData);
        window.fbUnsaved = false; 

        if (!background) { sendBtn.disabled = true; sendBtn.textContent = 'Надсилаємо…'; renderPositions(slug); resultEl.innerHTML = ''; }

        try {
          const response = await fetch(FORMSPREE_URL, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ station: s.name, slug, line: LINE_NAMES[s.line], changes: changes.map(c => changeText(c.p, c.nw, c.nd, false)).join('\n') })
          });
          if (!response.ok) throw new Error('Помилка сервера');
          if (!background) {
            sendBtn.textContent = '✓'; sendBtn.disabled = true; 
            resultEl.innerHTML = `<p class="fb-note fb-success" style="padding-bottom: 0; margin-bottom: 6px;">Дякуємо, пропозицію надіслано,<br>зміни застосовано локально.</p><button id="fbUndoCurrent" class="fb-reset-btn" style="margin-top: 0; padding-top: 8px;">Скасувати ці зміни</button>`;
            attachUndoBtn(slug, resultEl, renderPositions, renderResetBtn);
          }
        } catch (error) {
          if (!background) {
            sendBtn.textContent = 'Запропонувати зміни'; sendBtn.disabled = false;
            resultEl.innerHTML = `<p class="fb-note" style="color: #c8523a; padding-bottom: 0; margin-bottom: 6px;">Немає зв'язку з сервером.<br>Але зміни збережено локально.</p><button id="fbUndoCurrent" class="fb-reset-btn" style="margin-top: 0; padding-top: 8px;">Скасувати ці зміни</button>`;
            attachUndoBtn(slug, resultEl, renderPositions, renderResetBtn);
          }
        }
      };

      sendBtn.addEventListener('click', () => { if (typeof window.triggerFeedbackSubmit === 'function') window.triggerFeedbackSubmit(false); });
      document.getElementById('feedbackClose').addEventListener('click', closeFeedbackSheet);
      renderResetBtn();
      
      document.getElementById('aboutSheet')?.classList.remove('sheet-open'); document.getElementById('stationSheet')?.classList.remove('sheet-open');
      sheet.classList.add('sheet-open'); document.getElementById('sheetOverlay').classList.add('overlay-visible');
      
      let swY = 0; let isHandleSwipeFB = false;
      sheet.addEventListener('touchstart', e => { swY = e.touches[0].clientY; isHandleSwipeFB = !!e.target.closest('.sheet-handle-bar'); }, { passive: true });
      sheet.addEventListener('touchend', e => { if (isHandleSwipeFB && (e.changedTouches[0].clientY - swY > 60)) closeFeedbackSheet(); });
      
    } catch(err) { console.error('[FeedbackSheet ERROR]', err); alert('Помилка: ' + err.message); }
  }

  /* ==========================================================================
     6. СТАН ФОРМИ ТА ЗАКРИТТЯ
     ========================================================================== */
  function forceCloseFeedbackSheet() {
    window.fbUnsaved = false;
    const s = document.getElementById('feedbackSheet');
    if (s?._closeAllDD) { document.removeEventListener('click', s._closeAllDD); s._closeAllDD = null; }
    s?.classList.remove('sheet-open');
    const anyOpen = document.querySelectorAll('.station-sheet.sheet-open').length > 0;
    if (!anyOpen) document.getElementById('sheetOverlay')?.classList.remove('overlay-visible');
  }

  window.hasUnsavedFeedback = function() {
    try {
      const fbSheet = document.getElementById('feedbackSheet');
      if (!fbSheet || !fbSheet.classList.contains('sheet-open')) return false;

      const stationEl = document.getElementById('fbStation');
      if (!stationEl || !stationEl.value) return false;
      
      const s = currentStationsData[stationEl.value];
      if (!s || !s.positions) return false;

      const edits = getLocalEdits()[stationEl.value] || {};
      let dirty = false;
      
      s.positions.forEach((p, i) => {
        const vals = extractFinalValues(i);
        if (vals) {
          const rawW = String(edits[i]?.wagon ?? p.wagon);
          const rawD = String(edits[i]?.doors ?? p.doors);
          const { wMain, dMain, wEx, dEx, wEx2, dEx2 } = parseDoorValues(rawW, rawD);

          const currentWMain = document.getElementById(`fbW${i}`)?.textContent ?? '-';
          const currentDMain = document.getElementById(`fbD${i}`)?.textContent ?? '-';
          const currentWEx   = document.getElementById(`fbW_ex${i}`)?.textContent ?? '-';
          const currentDEx   = document.getElementById(`fbD_ex${i}`)?.textContent ?? '-';
          const currentWEx2  = document.getElementById(`fbW_ex2_${i}`)?.textContent ?? '-';
          const currentDEx2  = document.getElementById(`fbD_ex2_${i}`)?.textContent ?? '-';

          if (currentWMain !== String(wMain) || currentDMain !== String(dMain) ||
              currentWEx !== String(wEx)   || currentDEx !== String(dEx) ||
              currentWEx2 !== String(wEx2) || currentDEx2 !== String(dEx2)) {
            dirty = true;
          }
        }
      });
      return dirty;
    } catch(e) { return false; }
  };

  function closeFeedbackSheet() {
    try {
      if (window.hasUnsavedFeedback && window.hasUnsavedFeedback()) {
        if (typeof window.showCustomConfirm === 'function') {
          window.showCustomConfirm('Застосувати зміни локально та повідомити&nbsp;розробника?', () => {
            if (typeof window.triggerFeedbackSubmit === 'function') window.triggerFeedbackSubmit(true);
            forceCloseFeedbackSheet();
          }, () => { forceCloseFeedbackSheet(); });
          return;
        }
      }
    } catch(e) { console.error(e); }
    forceCloseFeedbackSheet(); 
  }

  window.openFeedbackSheet  = openFeedbackSheet;
  window.closeFeedbackSheet = closeFeedbackSheet;
  window.applyLocalEdits    = applyLocalEdits;

})();
