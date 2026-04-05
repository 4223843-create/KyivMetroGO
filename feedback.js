/* ══ FEEDBACK SHEET ══ */
(function() {

const FORMSPREE_URL = 'https://formspree.io/f/mgopobnd';
const LINE_COLOR = { red: '#c8523a', blue: '#5b9bd5', green: '#5aaa6a' };
const LINE_NAMES = { red: 'Червона', blue: 'Синя', green: 'Зелена' };
const LINE_ORDER = ['red', 'blue', 'green'];
const LOCAL_EDITS_KEY = 'metro_local_edits';
let currentStationsData = null; // Глобально для попапу збереження

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
  for (const [slug, posEdits] of Object.entries(edits)) {
    if (!stationsData[slug]) continue;
    let posIdx = 0;
    for (const dir of stationsData[slug].directions) {
      for (const exit of dir.exits) {
        for (let i = 0; i < exit.positions.length; i++) {
          if (posEdits[posIdx] !== undefined) {
            exit.positions[i] = { ...exit.positions[i], ...posEdits[posIdx], _edited: true, _slug: slug, _posIdx: posIdx };
          }
          posIdx++;
        }
      }
    }
  }
}

/* ── Stepper ── */
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
/* ── Логіка сусідніх дверей ── */
function getAdjacentDoors(w, d) {
  const adj = [];
  if (d > 1) adj.push({w: w, d: d - 1});
  if (d < 4) adj.push({w: w, d: d + 1});
  if (d === 4 && w < 5) adj.push({w: w + 1, d: 1});
  if (d === 1 && w > 1) adj.push({w: w - 1, d: 4});
  return adj;
}







/* ── Логіка сусідніх дверей ── */
function getAdjacentDoors(w, d) {
  const adj = [];
  if (d > 1) adj.push({w: w, d: d - 1});
  if (d < 4) adj.push({w: w, d: d + 1});
  // Handle wagon transitions
  if (d === 4 && w < 5) adj.push({w: w + 1, d: 1});
  if (d === 1 && w > 1) adj.push({w: w - 1, d: 4});
  return adj;
}

function bindSteppers(container) {
  container.querySelectorAll('.fb-step').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      const el = document.getElementById(id);
      const isExtra = id.includes('_ex');
      const idx = id.replace(/[^0-9]/g, '');

      if (isExtra) {
        // Додаткові двері: циклічно перемикаємо тільки між сусідами!
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
            if (curIdx === -1) {
                // Should not happen, but for safety
                curW = adj[0].w; curD = adj[0].d;
            } else if (adj.length > 1) {
                const nextIdx = (curIdx + (btn.classList.contains('fb-step-up') ? 1 : -1) + adj.length) % adj.length;
                curW = adj[nextIdx].w; curD = adj[nextIdx].d;
            }
        }
        document.getElementById(`fbW_ex${idx}`).textContent = curW;
        document.getElementById(`fbD_ex${idx}`).textContent = curD;
      } else {
        // Основні двері: звичайна логіка +/-
        const min = parseInt(btn.dataset.min);
        const max = parseInt(btn.dataset.max);
        let val = parseInt(el.textContent) + (btn.classList.contains('fb-step-up') ? 1 : -1);
        el.textContent = Math.max(min, Math.min(max, val));

        // Якщо змінили основні двері, перевіряємо чи додаткові досі валідні
        const exWNode = document.getElementById(`fbW_ex${idx}`);
        const exDNode = document.getElementById(`fbD_ex${idx}`);
        if (exWNode && exDNode && exWNode.textContent !== '-') {
            const newMainW = parseInt(document.getElementById(`fbW${idx}`).textContent);
            const newMainD = parseInt(document.getElementById(`fbD${idx}`).textContent);
            const adj = getAdjacentDoors(newMainW, newMainD);
            const isValid = adj.some(a => a.w === parseInt(exWNode.textContent) && a.d === parseInt(exDNode.textContent));
            if (!isValid) {
                // Якщо невалідні, підставляємо першого сусіда
                exWNode.textContent = adj[0].w;
                exDNode.textContent = adj[0].d;
            }
        }
      }

      // Показуємо напис, тільки якщо він був прихований (для авто-відкритих діапазонів)
      const noteEl = document.getElementById(`fbExtraNote${idx}`);
      if (noteEl && noteEl.style.display === 'none') {
          noteEl.style.display = 'block';
      }

      window.fbUnsaved = true;
      const sendBtn = document.getElementById('fbSend');
      if (sendBtn) { sendBtn.textContent = 'Запропонувати зміни'; sendBtn.disabled = false; }
    });
  });

  // Іконка-довідка біля "Додати двері"
  // Кнопка довідки "i" — лише розкриває/ховає підказку, пілюль не чіпає
  container.querySelectorAll('.fb-add-doors-info').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = btn.dataset.idx;
      // Підказка живе всередині fbExtraWrap — показуємо її там де вона є
      // але сам fbExtraWrap НЕ відкриваємо
      const hint = document.getElementById(`fbHint${idx}`);
      if (hint) hint.classList.toggle('fb-hint-open');
    });
  });

  // Кнопка "Додати двері"
  container.querySelectorAll('.fb-add-doors-link').forEach(btn => {
     btn.addEventListener('click', () => {
         const idx = btn.dataset.idx;
document.getElementById(`fbAddDoorsRow${idx}`).style.display = 'none';
document.getElementById(`fbExtraWrap${idx}`).style.display = 'block';

         // Автоматично підставляємо найближчі сусідні двері
         const exWNode = document.getElementById(`fbW_ex${idx}`);
         const exDNode = document.getElementById(`fbD_ex${idx}`);
         if (exWNode.textContent === '-') {
             const mainW = parseInt(document.getElementById(`fbW${idx}`).textContent);
             const mainD = parseInt(document.getElementById(`fbD${idx}`).textContent);
             const adj = getAdjacentDoors(mainW, mainD);
             exWNode.textContent = adj[0].w;
             exDNode.textContent = adj[0].d;
         }
         
         window.fbUnsaved = true;
         const sendBtn = document.getElementById('fbSend');
         if (sendBtn) { sendBtn.textContent = 'Запропонувати зміни'; sendBtn.disabled = false; }
     });
  });

  // Кнопка "Скасувати" (НИЖНІЙ ХРЕСТИК)
  container.querySelectorAll('.fb-cancel-extra-btn').forEach(btn => {
     btn.addEventListener('click', () => {
         const idx = btn.dataset.idx;
         document.getElementById(`fbW_ex${idx}`).textContent = '-';
         document.getElementById(`fbD_ex${idx}`).textContent = '-';
         document.getElementById(`fbExtraWrap${idx}`).style.display = 'none';
         // Відновлюємо кнопку "Додати двері"
const addRow = document.getElementById(`fbAddDoorsRow${idx}`);
if (addRow) addRow.style.display = 'flex';

         window.fbUnsaved = true;
         const sendBtn = document.getElementById('fbSend');
         if (sendBtn) { sendBtn.textContent = 'Запропонувати зміни'; sendBtn.disabled = false; }
     });
  });

}

function changeText(p, nw, nd, closed) {
  const loc = [p.dir, p.exit].filter(Boolean).join(' · ');
  if (closed) return `${loc}: ВИХІД ЗАКРИТО`;
  const parts = [];
  if (nw !== p.wagon) parts.push(`вагон ${p.wagon}→${nw}`);
  if (nd !== p.doors)  parts.push(`двері ${p.doors}→${nd}`);
  return `${loc}: ${parts.join(', ')}`;
}

function openFeedbackSheet(stationsData) {
  try {
  currentStationsData = stationsData;
  
  // ДОДАЄМО ЦЕЙ БЛОК: Робимо плоский масив позицій, щоб форма їх бачила
  Object.values(currentStationsData).forEach(s => {
    if (!s.positions) {
      s.positions = [];
      s.directions?.forEach(dir => {
        dir.exits?.forEach(exit => {
          exit.positions?.forEach(pos => {
            s.positions.push({
              dir: dir.from,
              exit: exit.label || '',
              wagon: pos.wagon,
              doors: pos.doors
            });
          });
        });
      });
    }
  });

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

  function stationOptions(filterLine) {
    const list = filterLine ? allStations.filter(s => s.line === filterLine) : allStations;
    return `<option value="" style="text-align:center">— оберіть —</option>` +
      list.map(s => `<option value="${s.slug}">${s.name}</option>`).join('');
  }

  const isAndroid = true;

  const lineSelectHtml = isAndroid
    ? `<button type="button" class="fb-custom-select" id="fbLineBtn">
         <span id="fbLineLabel">— всі —</span>
         <span class="fb-select-arrow">&#8964;</span>
       </button>
       <input type="hidden" id="fbLine" value="">`
    : `<select id="fbLine" class="fb-select">
         <option value="">— всі —</option>
         ${LINE_ORDER.map(l => `<option value="${l}">${LINE_NAMES[l]}</option>`).join('')}
       </select>`;

  const stationSelectHtml = isAndroid
    ? `<button type="button" class="fb-custom-select" id="fbStationBtn">
         <span id="fbStationLabel">— оберіть —</span>
         <span class="fb-select-arrow">&#8964;</span>
       </button>
       <input type="hidden" id="fbStation" value="">`
    : `<select id="fbStation" class="fb-select">${stationOptions('')}</select>`;

  sheet.innerHTML = `
    <div class="sheet-handle-bar">
      <div class="sheet-handle"></div>
      <button class="sheet-info-btn" id="feedbackInfo" aria-label="Довідка">i</button>
      <span class="sheet-sheet-title">Запропонувати зміни</span>
      <button class="sheet-close-btn" id="feedbackClose">✕</button>
    </div>
    <div class="fb-info-panel" id="feedbackInfoPanel">
      <div class="fb-info-panel-content">
        <p>Якщо дані неточні, оберіть станцію та введіть коректні значення. Зміни одразу застосуються локально та надійдуть розробнику.</p>
        <p>Хрестик <span style="color:#c8523a">✕</span> поряд з вагоном позначає вихід як тимчасово недоступний.</p>
       <p>“Додати двері” — додайте другі зручні двері для виходу. Можете обрати тільки сусідні двері.
      </div>
    </div>
    <div class="sheet-body" id="feedbackBody">
      <div class="fb-selectors">
        <div class="fb-select-wrap">
          <div id="fbLineDropdown" class="fb-dropdown" hidden></div>
          <div class="fb-select-inner">
            <label class="fb-label">Гілка</label>
            ${lineSelectHtml}
          </div>
        </div>
        <div class="fb-select-wrap">
          <div id="fbStationDropdown" class="fb-dropdown" hidden></div>
          <div class="fb-select-inner">
            <label class="fb-label">Станція</label>
            ${stationSelectHtml}
          </div>
        </div>
      </div>
      <div id="fbPositions"></div>
      
      <div class="fb-footer-sticky">
        <button id="fbSend" class="fb-send-btn" disabled>Запропонувати зміни</button>
        <div id="fbResult"></div>
        <div id="fbResetWrap"></div>
      </div>
    </div>`;

  const posEl     = document.getElementById('fbPositions');
  const sendBtn   = document.getElementById('fbSend');
  const resultEl  = document.getElementById('fbResult');
  const resetWrap = document.getElementById('fbResetWrap');

  // --- Логіка селектів ---
  let lineEl, stationEl;

  if (isAndroid) {
    const lineHidden    = document.getElementById('fbLine');
    const stationHidden = document.getElementById('fbStation');
    const lineBtn       = document.getElementById('fbLineBtn');
    const stationBtn    = document.getElementById('fbStationBtn');
    const lineLbl       = document.getElementById('fbLineLabel');
    const stationLbl    = document.getElementById('fbStationLabel');
    const lineDD        = document.getElementById('fbLineDropdown');
    const stationDD     = document.getElementById('fbStationDropdown');

    lineEl    = { get value() { return lineHidden.value; }, set value(v) { lineHidden.value = v; } };
    stationEl = { get value() { return stationHidden.value; }, set value(v) { stationHidden.value = v; } };

    function closeAllDD() {
      lineDD.hidden = true; stationDD.hidden = true;
      lineBtn.classList.remove('fb-select-open');
      stationBtn.classList.remove('fb-select-open');
    }

    function buildLineDD() {
      const items = [{ value: '', label: '— всі —' },
        ...LINE_ORDER.map(l => ({ value: l, label: LINE_NAMES[l] }))];
      lineDD.innerHTML = items.map(it =>
        `<button type="button" class="fb-dropdown-item${it.value === lineEl.value ? ' fb-dropdown-selected' : ''}" data-value="${it.value}">${it.label}</button>`
      ).join('');
      lineDD.querySelectorAll('.fb-dropdown-item').forEach(b => b.addEventListener('click', (e) => { e.stopPropagation();
        lineEl.value = b.dataset.value;
        lineLbl.textContent = b.textContent;
        closeAllDD();
        stationEl.value = ''; stationLbl.textContent = '— оберіть —';
        posEl.innerHTML = ''; sendBtn.disabled = true;
      }));
    }

    function buildStationDD() {
      const list = lineEl.value ? allStations.filter(s => s.line === lineEl.value) : allStations;
      stationDD.innerHTML = list.map(s =>
        `<button type="button" class="fb-dropdown-item${s.slug === stationEl.value ? ' fb-dropdown-selected' : ''}" data-value="${s.slug}">${s.name}</button>`
      ).join('');
      stationDD.querySelectorAll('.fb-dropdown-item').forEach(b => b.addEventListener('click', (e) => { e.stopPropagation();
        stationEl.value = b.dataset.value;
        stationLbl.textContent = b.textContent;
        closeAllDD();
        const s = currentStationsData[stationEl.value];
        if (s && !lineEl.value) { lineEl.value = s.line; lineLbl.textContent = LINE_NAMES[s.line]; }
        window.fbUnsaved = false;
        renderPositions(stationEl.value);
      }));
    }

    lineDD.addEventListener('click', e => e.stopPropagation());
    stationDD.addEventListener('click', e => e.stopPropagation());
    lineBtn.addEventListener('click', e => {
      e.stopPropagation();
      const open = !lineDD.hidden; closeAllDD();
      if (!open) { buildLineDD(); lineDD.hidden = false; lineBtn.classList.add('fb-select-open'); }
    });
    stationBtn.addEventListener('click', e => {
      e.stopPropagation();
      const open = !stationDD.hidden; closeAllDD();
      if (!open) { buildStationDD(); stationDD.hidden = false; stationBtn.classList.add('fb-select-open'); }
    });
    setTimeout(() => { document.addEventListener('click', closeAllDD); }, 0);
    sheet._closeAllDD = closeAllDD;

  } else {
    lineEl    = document.getElementById('fbLine');
    stationEl = document.getElementById('fbStation');

lineEl.addEventListener('change', () => {
    stationEl.innerHTML = stationOptions(lineEl.value);
    stationEl.value = '';
    posEl.innerHTML = '';
    sendBtn.disabled = true;
    renderResetBtn(); // <--- Додали оновлення кнопки
  });

  stationEl.addEventListener('change', () => {
    const slug = stationEl.value;
    if (!slug) { 
      posEl.innerHTML = ''; 
      sendBtn.disabled = true; 
      renderResetBtn(); // <--- Додали оновлення кнопки, якщо скинули вибір
      return; 
    }
    const s = currentStationsData[slug];
    if (s && !lineEl.value) lineEl.value = s.line;
    renderPositions(slug);
  });
  }

function renderResetBtn() {
    resetWrap.innerHTML = (hasLocalEdits() && !stationEl.value)
      ? `<button id="fbReset" class="fb-reset-btn">Скинути локальні зміни</button>` : '';
      
    document.getElementById('fbReset')?.addEventListener('click', () => {
      window.showCustomConfirm('Скинути всі локальні зміни та повернутись до стандартних даних?', () => {
        clearAllLocalEdits();
        fetch('stations.json').then(r => r.json()).then(d => {
          Object.keys(stationsData).forEach(k => delete stationsData[k]);
          d.stations.forEach(s => { stationsData[s.slug] = s; });
          applyLocalEdits(stationsData);
        });
        resetWrap.innerHTML = '<p class="fb-note fb-success">✓ Локальні зміни скинуто.</p>';
        renderPositions(stationEl.value);
      });
    });
  }

function rebuildPositions(targetData) {
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
function renderPositions(slug) {
    if (!slug) { posEl.innerHTML = ''; sendBtn.disabled = true; return; }
    const s = currentStationsData[slug];
        if (!s?.positions?.length) {
      posEl.innerHTML = '<p class="fb-note">Для цієї станції немає позицій.</p>';
      return;
    }
    const edits = getLocalEdits()[slug] || {};

    const groups = [];
    s.positions.forEach((p, i) => {
      const key = p.dir;
      let g = groups.find(g => g.key === key);
      if (!g) {
        g = { key, dir: p.dir, items: [] };
        groups.push(g);
      }
      g.items.push({ p, i });
    });

    function properCase(name) {
      const alwaysCap = new Set(['україна','україни','українських','дніпра','незалежності','небесної','сотні','спорту','центр','площа','площі','героїв','лівий','правий']);
      return name.split(' ').map((w, index) => {
        const wl = w.toLowerCase();
        if (index === 0 || alwaysCap.has(wl)) return wl.charAt(0).toUpperCase() + wl.slice(1);
        return wl;
      }).join(' ');
    }




posEl.innerHTML = groups.map(g => {
      let dirLabel;
      const dirLower = g.dir.toLowerCase();
      if (dirLower === 'кінцева' || dirLower === 'вихід праворуч' || dirLower === '__long_transfer__') {
        dirLabel = g.dir;
      } else {
        const rawName = g.dir.replace(/^[Пп]опередня\s+/, '');
        dirLabel = `Попередня ${properCase(rawName)}`;
      }

      const itemsHtml = g.items.map((item, index) => {
        const rawW = String(edits[item.i]?.wagon ?? item.p.wagon);
        const rawD = String(edits[item.i]?.doors ?? item.p.doors);
        let wMain = parseInt(rawW) || 1;
        let dMain = parseInt(rawD) || 1;
        let wEx = '-'; let dEx = '-';
        let hasExtra = false;

        // Розбираємо збережені дані (якщо там є кома або тире)
        if (rawD.includes('-') || rawD.includes(',')) {
            hasExtra = true;
            if (rawW.includes(',')) {
                const wParts = rawW.split(',');
                const dParts = rawD.split(',');
                wMain = parseInt(wParts[0]); dMain = parseInt(dParts[0]);
                wEx = parseInt(wParts[1]); dEx = parseInt(dParts[1]);
            } else if (rawD.includes('-')) {
                const dParts = rawD.split('-');
                wMain = parseInt(rawW); dMain = parseInt(dParts[0]);
                wEx = wMain; dEx = parseInt(dParts[1]);
            }
        }
        const isClosed = edits[item.i]?.closed;
        
        let exitHtml = '';
        if (item.p.exit) {
          // ... (тут багато коду, що малює іконки пересадок, прокрути його) ...
        }

return `
        ${exitHtml}
        <div class="fb-pos-row ${hasExtra ? 'fb-pos-multi' : ''} ${isClosed ? 'fb-pos-closed' : ''}" data-idx="${item.i}">
          ${isClosed
            ? `<div class="fb-closed-note" style="padding: 0;">Вихід позначено як недоступний</div>`
            : `<div class="fb-info-anchor" id="fbInfoAnchor${item.i}" style="display:flex; justify-content:center; margin-top:-6px; margin-bottom:10px;">
                 <button type="button" class="fb-add-doors-info" id="fbInfoBtn${item.i}" data-idx="${item.i}" aria-label="Довідка">i</button>
               </div>
               <div class="fb-add-doors-hint" id="fbHint${item.i}">
                 <div class="fb-add-doors-hint-inner">
                   <p>Хрестик <span style="color:#c8523a">✕</span> поряд з вагоном позначає вихід як тимчасово недоступний.</p>
                   <p>«Додати двері» — другі зручні двері для виходу, сусідні з першими.</p>
                 </div>
               </div>

               <div class="fb-pos-wrap">
                 <div class="fb-pos-inputs">
                   ${stepperHtml(`fbW${item.i}`, wMain, 1, 5, 'вагон')}
                   ${stepperHtml(`fbD${item.i}`, dMain, 1, 4, 'двері')}
                 </div>
                 <div class="fb-side-actions">
                   <button type="button" class="fb-close-exit" data-idx="${item.i}">✕</button>
                 </div>
               </div>

               <div class="fb-extra-door-wrap" id="fbExtraWrap${item.i}" style="display: ${hasExtra ? 'block' : 'none'};">
                 <div class="fb-pos-wrap" style="margin-top: 4px;">
                   <div class="fb-pos-inputs">
                     ${stepperHtml(`fbW_ex${item.i}`, wEx, 1, 5, 'вагон')}
                     ${stepperHtml(`fbD_ex${item.i}`, dEx, 1, 4, 'двері')}
                   </div>
                   <div class="fb-side-actions">
                     <button type="button" class="fb-cancel-extra-btn" data-idx="${item.i}">✕</button>
                   </div>
                 </div>
               </div>

               <div class="fb-add-doors-row" id="fbAddDoorsRow${item.i}" style="display:${hasExtra ? 'none' : 'flex'}; justify-content:center;">
                 <button type="button" class="fb-add-doors-link" id="fbAddBtn${item.i}" data-idx="${item.i}">Додати двері</button>
               </div>`
          }
        </div>`;
      }).join('<div style="height: 6px;"></div>');
      // ДОДАНО: Тут ми остаточно прибрали зайві олівці з назв напрямків
      return `<div class="fb-pos-row">
        <div class="fb-dir-label">${dirLabel}</div>
        <div style="margin-top: 4px;">
          ${itemsHtml}
        </div>
      </div>`;
    }).join('');

    bindSteppers(posEl);
    sendBtn.disabled = false;





posEl.querySelectorAll('.fb-close-exit').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.idx);
        const p   = s.positions[idx];
        const loc = [p.dir.startsWith('попередня') ? p.dir : `Попередня ${p.dir}`, p.exit].filter(Boolean).join(' · ');
        
        const exWrap = document.getElementById(`fbExtraWrap${idx}`);
        const isExtraVisible = exWrap && exWrap.style.display !== 'none';

        if (isExtraVisible) {
            // Прибираємо ПЕРШІ двері, другі стають на їхнє місце, а панель других зникає
            const wMain = document.getElementById(`fbW${idx}`);
            const dMain = document.getElementById(`fbD${idx}`);
            const wEx = document.getElementById(`fbW_ex${idx}`);
            const dEx = document.getElementById(`fbD_ex${idx}`);
            
            wMain.textContent = wEx.textContent;
            dMain.textContent = dEx.textContent;
            
            wEx.textContent = '-';
            dEx.textContent = '-';
            exWrap.style.display = 'none';
const addRow = document.getElementById(`fbAddDoorsRow${idx}`);
if (addRow) addRow.style.display = 'flex';
            
            window.fbUnsaved = true;
            const sendBtn = document.getElementById('fbSend');
            if (sendBtn) { sendBtn.textContent = 'Запропонувати зміни'; sendBtn.disabled = false; }
            return; // Виходимо, щоб не викликати попап закриття
        }

window.showCustomConfirm('Позначити вихід як недоступний?', () => {

          saveLocalEdit(slug, idx, { wagon: p.wagon, doors: p.doors, closed: true });
          applyLocalEdits(stationsData);
          window.fbUnsaved = false;
          renderPositions(slug);
          if (typeof renderResetBtn === 'function') renderResetBtn();

          fetch(FORMSPREE_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({ station: s.name, slug, line: LINE_NAMES[s.line], changes: `${loc}: ВИХІД ЗАКРИТО` })
          }).catch(e => console.warn(e));

          resultEl.innerHTML = `
            <p class="fb-note fb-success" style="padding-bottom: 0; margin-bottom: 6px; line-height: 1.4;">
              Дякуємо, пропозицію надіслано,<br>зміни застосовано локально.
            </p>
            <button id="fbUndoCurrent" class="fb-reset-btn" style="margin-top: 0; padding-top: 8px;">Скасувати ці зміни</button>
          `;

          document.getElementById('fbUndoCurrent')?.addEventListener('click', () => {


            const edits = getLocalEdits();
            if (edits[slug]) {
              delete edits[slug];
              if (Object.keys(edits).length === 0) clearAllLocalEdits();
              else localStorage.setItem(LOCAL_EDITS_KEY, JSON.stringify(edits));
            }
            fetch('stations.json').then(r => r.json()).then(d => {
              const targetData = currentStationsData || stationsData;
              Object.keys(targetData).forEach(k => delete targetData[k]);
              d.stations.forEach(st => { targetData[st.slug] = st; });
              rebuildPositions(targetData);
              if (window.applyLocalEdits) window.applyLocalEdits(targetData);
              resultEl.innerHTML = '<p class="fb-note">Зміни скасовано.</p>';
              renderPositions(slug);
              if (typeof renderResetBtn === 'function') renderResetBtn();
            });
          });
        });
      });
    });


                renderResetBtn();
  }
// Робимо функцію глобальною, щоб її міг викликати script.js при закритті вікон
window.triggerFeedbackSubmit = async function(background = false) {
    const slug = stationEl.value;
    if (!slug) return;
    const s = currentStationsData[slug];
    const changes = s.positions.map((p, i) => {
      const vals = extractFinalValues(i);
      if (!vals) return null;
      return (vals.finalW !== String(p.wagon) || vals.finalD !== String(p.doors)) 
             ? { i, p, nw: vals.finalW, nd: vals.finalD } : null;
    }).filter(Boolean);

    if (!changes.length) { 
      if (!background) resultEl.innerHTML = '<p class="fb-note">Змін не виявлено.</p>'; 
      window.fbUnsaved = false;
      return; 
    }
    
    // 1. ОДРАЗУ ЗБЕРІГАЄМО ЛОКАЛЬНО
    changes.forEach(c => saveLocalEdit(slug, c.i, { wagon: c.nw, doors: c.nd }));
    if (typeof window.applyLocalEdits === 'function') window.applyLocalEdits(currentStationsData || stationsData);
    window.fbUnsaved = false; // Зміни збережено

    // Якщо це робиться фоном (при закритті вікна), далі не оновлюємо UI
    if (!background) {
      sendBtn.disabled = true;
      sendBtn.textContent = 'Надсилаємо…';
      renderPositions(slug); // Миттєво перемальовуємо форму (щоб з'явилися олівці)
      resultEl.innerHTML = '';
    }

    // Допоміжна функція для кнопки скасування
    const attachUndoBtn = () => {
      document.getElementById('fbUndoCurrent')?.addEventListener('click', () => {
        const edits = getLocalEdits();
        if (edits[slug]) {
          delete edits[slug];
          if (Object.keys(edits).length === 0) clearAllLocalEdits();
          else localStorage.setItem(LOCAL_EDITS_KEY, JSON.stringify(edits));
        }
        fetch('stations.json').then(r => r.json()).then(d => {
          const targetData = currentStationsData || stationsData;
          Object.keys(targetData).forEach(k => delete targetData[k]);
          d.stations.forEach(st => { targetData[st.slug] = st; });
          rebuildPositions(targetData);
          if (window.applyLocalEdits) window.applyLocalEdits(targetData);
          resultEl.innerHTML = '<p class="fb-note">Зміни скасовано.</p>';
          renderPositions(slug);
          if (typeof renderResetBtn === 'function') renderResetBtn();
        });
      });
    };

    try {
      // 2. ВІДПРАВЛЯЄМО НА СЕРВЕР ФОНОМ
      const response = await fetch(FORMSPREE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          station: s.name, slug, line: LINE_NAMES[s.line],
          changes: changes.map(c => changeText(c.p, c.nw, c.nd, false)).join('\n')
        })
      });

if (!response.ok) throw new Error('Помилка сервера');

      if (!background) {
        sendBtn.textContent = '✓';
        sendBtn.disabled = true; // Блокуємо кнопку, щоб не дублювати відправку
        
        // 3. ВИВОДИМО ТЕКСТ УСПІХУ ТА КНОПКУ СКАСУВАННЯ
        resultEl.innerHTML = `
          <p class="fb-note fb-success" style="padding-bottom: 0; margin-bottom: 6px; line-height: 1.4;">
            Дякуємо, пропозицію надіслано,<br>зміни застосовано локально.
          </p>
          <button id="fbUndoCurrent" class="fb-reset-btn" style="margin-top: 0; padding-top: 8px;">Скасувати ці зміни</button>
        `;
        attachUndoBtn();
      }
    } catch (error) {
      console.warn(error);
      if (!background) {
        sendBtn.textContent = 'Запропонувати зміни';
        sendBtn.disabled = false;
        // Навіть якщо помилка інтернету, локально ми вже зберегли
        resultEl.innerHTML = `
          <p class="fb-note" style="color: #c8523a; padding-bottom: 0; margin-bottom: 6px; line-height: 1.4;">
            Немає зв'язку з сервером.<br>Але зміни збережено локально.
          </p>
          <button id="fbUndoCurrent" class="fb-reset-btn" style="margin-top: 0; padding-top: 8px;">Скасувати ці зміни</button>
        `;
        attachUndoBtn();
      }
    }
  };

  // При кліку на кнопку викликаємо функцію
  sendBtn.addEventListener('click', () => {
    if (typeof window.triggerFeedbackSubmit === 'function') {
      window.triggerFeedbackSubmit(false);
    }
  });

  document.getElementById('feedbackInfo').addEventListener('click', () => {
    const panel = document.getElementById('feedbackInfoPanel');
    panel.classList.toggle('fb-info-open');
  });
  document.getElementById('feedbackClose').addEventListener('click', closeFeedbackSheet);
  renderResetBtn();
  document.getElementById('aboutSheet')?.classList.remove('sheet-open');
  document.getElementById('stationSheet')?.classList.remove('sheet-open');
  sheet.classList.add('sheet-open');
  document.getElementById('sheetOverlay').classList.add('overlay-visible');
let swY = 0;
  let isHandleSwipeFB = false;
  sheet.addEventListener('touchstart', e => { 
      swY = e.touches[0].clientY; 
      // Свайп спрацює ТІЛЬКИ якщо ми торкнулися верхньої шапки
      isHandleSwipeFB = !!e.target.closest('.sheet-handle-bar');
  }, { passive: true });
  sheet.addEventListener('touchend', e => { 
      if (isHandleSwipeFB && (e.changedTouches[0].clientY - swY > 60)) closeFeedbackSheet(); 
  });
  } catch(err) { console.error('[FeedbackSheet ERROR]', err); alert('Помилка: ' + err.message); }
}

function forceCloseFeedbackSheet() {
  window.fbUnsaved = false;
  const s = document.getElementById('feedbackSheet');
  if (s?._closeAllDD) { document.removeEventListener('click', s._closeAllDD); s._closeAllDD = null; }
  s?.classList.remove('sheet-open');
  const anyOpen = document.querySelectorAll('.station-sheet.sheet-open').length > 0;
  if (!anyOpen) document.getElementById('sheetOverlay')?.classList.remove('overlay-visible');
}
function extractFinalValues(i) {
    const wNode = document.getElementById(`fbW${i}`);
    const dNode = document.getElementById(`fbD${i}`);
    if (!wNode || !dNode) return null;

    let finalW = wNode.textContent;
    let finalD = dNode.textContent;

    const exWNode = document.getElementById(`fbW_ex${i}`);
    const exDNode = document.getElementById(`fbD_ex${i}`);
    if (exWNode && exWNode.textContent !== '-' && exDNode && exDNode.textContent !== '-') {
        const exW = exWNode.textContent; const exD = exDNode.textContent;
        if (finalW === exW) {
            // Якщо вагон той самий, робимо діапазон (напр., "1-2")
            const d1 = Math.min(parseInt(finalD), parseInt(exD));
            const d2 = Math.max(parseInt(finalD), parseInt(exD));
            finalD = `${d1}-${d2}`;
        } else {
            // Якщо вагони різні, зберігаємо через кому
            const w1 = parseInt(finalW); const w2 = parseInt(exW);
            const door1 = parseInt(finalD); const door2 = parseInt(exD);
            if (w1 < w2) { finalW = `${w1}, ${w2}`; finalD = `${door1}, ${door2}`; } 
            else { finalW = `${w2}, ${w1}`; finalD = `${door2}, ${door1}`; }
        }
    }
    return { finalW, finalD };
  }

// === РОЗУМНА ПЕРЕВІРКА НА ЗМІНИ ===
window.hasUnsavedFeedback = function() {
  try {
    const fbSheet = document.getElementById('feedbackSheet');
    if (!fbSheet || !fbSheet.classList.contains('sheet-open')) return false;

    const stationEl = document.getElementById('fbStation');
    if (!stationEl || !stationEl.value) return false;
    
    // Надійний доступ до даних
    const data = (typeof STATIONS_FOR_FORM !== 'undefined') ? STATIONS_FOR_FORM : (currentStationsData || {});
    const s = data[stationEl.value];
    if (!s || !s.positions) return false;

    const edits = getLocalEdits()[stationEl.value] || {};
    let dirty = false;
    
    // Перевіряємо, чи змінились цифри безпосередньо в інтерфейсі
    s.positions.forEach((p, i) => {
      const vals = extractFinalValues(i);
      if (vals) {
        const rawW = String(edits[i]?.wagon ?? p.wagon);
        const rawD = String(edits[i]?.doors ?? p.doors);
        
        let wMain = parseInt(rawW) || 1;
        let dMain = parseInt(rawD) || 1;
        let wEx = '-'; let dEx = '-';
        
        if (rawD.includes('-') || rawD.includes(',')) {
            if (rawW.includes(',')) {
                const wParts = rawW.split(',');
                const dParts = rawD.split(',');
                wMain = parseInt(wParts[0]); dMain = parseInt(dParts[0]);
                wEx = parseInt(wParts[1]); dEx = parseInt(dParts[1]);
            } else if (rawD.includes('-')) {
                const dParts = rawD.split('-');
                wMain = parseInt(rawW); dMain = parseInt(dParts[0]);
                wEx = wMain; dEx = parseInt(dParts[1]);
            }
        }

        const exWNode = document.getElementById(`fbW_ex${i}`);
        const exDNode = document.getElementById(`fbD_ex${i}`);
        
        let currentWEx = exWNode ? exWNode.textContent : '-';
        let currentDEx = exDNode ? exDNode.textContent : '-';
        let currentWMain = document.getElementById(`fbW${i}`).textContent;
        let currentDMain = document.getElementById(`fbD${i}`).textContent;

        if (currentWMain !== String(wMain) || currentDMain !== String(dMain) || 
            currentWEx !== String(wEx) || currentDEx !== String(dEx)) {
          dirty = true;
        }
      }
    });
    return dirty;
  } catch(e) {
    console.error("hasUnsavedFeedback error:", e);
    return false; // Якщо сталася будь-яка помилка, дозволяємо закрити вікно
  }
};

function forceCloseFeedbackSheet() {
  window.fbUnsaved = false;
  if (typeof window.closeAllSheets === 'function') {
    window.closeAllSheets(true);
  } else {
    document.getElementById('feedbackSheet')?.classList.remove('sheet-open');
    const anyOpen = document.querySelectorAll('.station-sheet.sheet-open').length > 0;
    if (!anyOpen) document.getElementById('sheetOverlay')?.classList.remove('overlay-visible');
  }
}

function closeFeedbackSheet() {
  try {
    if (window.hasUnsavedFeedback && window.hasUnsavedFeedback()) {
      if (typeof window.showCustomConfirm === 'function') {
        window.showCustomConfirm('Застосувати зміни локально та повідомити розробника?', () => {
          if (typeof window.triggerFeedbackSubmit === 'function') window.triggerFeedbackSubmit(true);
          forceCloseFeedbackSheet();
        }, () => {
          forceCloseFeedbackSheet();
        });
        return;
      }
    }
  } catch(e) { console.error(e); }
  
  forceCloseFeedbackSheet(); // Примусове закриття
}

window.openFeedbackSheet  = openFeedbackSheet;
window.closeFeedbackSheet = closeFeedbackSheet;
window.applyLocalEdits    = applyLocalEdits;
})();