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
      const s = stationsData[slug];
      
      // 1. Спочатку застосовуємо правки до існуючих позицій
      let posIdx = 0;
      for (const dir of s.directions) {
        for (const exit of dir.exits) {
          for (let i = 0; i < exit.positions.length; i++) {
            if (posEdits[posIdx] !== undefined && !posEdits[posIdx].isNew) {
              const edit = posEdits[posIdx];
              exit.positions[i] = { ...exit.positions[i], ...edit, _edited: true, _slug: slug, _posIdx: posIdx };
            }
            posIdx++;
          }
        }
      }

      // 2. ДОДАЄМО НОВІ ВИХОДИ, ЯКИХ НЕМАЄ В БАЗІ
      Object.keys(posEdits).forEach(idx => {
        const edit = posEdits[idx];
        if (edit.isNew) {
          // Шукаємо потрібний напрямок у станції
          const targetDir = s.directions.find(d => d.from === edit.dir);
          if (targetDir) {
            // Створюємо новий об'єкт виходу
            const newExit = {
              label: edit.label || '',
              positions: [{ wagon: String(edit.wagon), doors: String(edit.doors), _edited: true, _slug: slug, _posIdx: parseInt(idx) }]
            };
            targetDir.exits.push(newExit);
            // Також додаємо в загальний список positions (для внутрішньої логіки)
            s.positions.push({ dir: edit.dir, exit: newExit.label, wagon: String(edit.wagon), doors: String(edit.doors) });
          }
        }
      });
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

  function getOppositeDoors(w, d) {
    // Дзеркальне відображення: вагон (6 - w), двері (5 - d)
    return { w: 6 - parseInt(w), d: 5 - parseInt(d) };
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

    // 1. Спочатку перевіряємо, чи є АБСОЛЮТНО НОВІ додані виходи
    for (const i in fbState.current) {
      if (fbState.current[i] && fbState.current[i].isNew) {
        isDirty = true;
        break;
      }
    }

    // 2. Якщо нових немає, порівнюємо всі поточні значення зі старими
    if (!isDirty) {
      for (const i in fbState.original) {
        const orig = fbState.original[i];
        const cur = fbState.current[i];
        if (!cur) continue;
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
    }

    // 3. Перевіряємо текстові описи виходів
    if (!isDirty) {
      document.querySelectorAll('.fb-exit-label-input').forEach(inp => {
        if (inp.dataset.changed === "true") isDirty = true;
      });
    }

    // Запам'ятовуємо результат
    fbState.isDirty = isDirty;
    MetroApp.fbUnsaved = isDirty;
    
    // Вмикаємо або вимикаємо кнопку
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

      // ── КНОПКА «i» — підказка ──
      const infoBtn = event.target.closest('.fb-add-doors-info');
      if (infoBtn) {
        const idx = infoBtn.dataset.idx;
        const hint = document.getElementById(`fbHint${idx}`);
        if (!hint) return;
        const isOpen = hint.classList.contains('fb-hint-open');
        closeAllHints();
        if (!isOpen) hint.classList.add('fb-hint-open');
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
// --- ЛОГІКА ДОДАВАННЯ НОВОГО ВИХОДУ ---
      const addExitBtn = event.target.closest('.fb-add-exit-btn');
      if (addExitBtn) {
        const dir = addExitBtn.dataset.dir;
        const newIdx = Object.keys(fbState.current).length;
        
        // Шукаємо, які вагони/двері ВЖЕ є в цьому напрямку
        let defaultW = 1;
        let defaultD = 1;
        
        const existingExits = Object.values(fbState.current).filter(st => st.dir === dir && !st.isNew);
        if (existingExits.length > 0) {
          // Беремо перший існуючий вихід в цьому напрямку і робимо йому "дзеркало"
          const existing = existingExits[0];
          const opposite = getOppositeDoors(existing.wMain, existing.dMain);
          defaultW = opposite.w;
          defaultD = opposite.d;
        }
        
        // Створюємо стан для нового виходу з розумними дефолтами
        fbState.current[newIdx] = { 
          wMain: defaultW, dMain: defaultD, wEx: '-', dEx: '-', wEx2: '-', dEx2: '-', 
          hasExtra: false, hasThird: false, isClosed: false, isNew: true, dir: dir 
        };
        fbState.labels[newIdx] = '';
        
        // Миттєво перемальовуємо через глобальне посилання
        if (typeof MetroApp._renderFeedbackPositions === 'function') {
          MetroApp._renderFeedbackPositions(fbState.slug);
        }
        
        // Фокусуємось на полі "додати опис" нового виходу
        setTimeout(() => {
          const btn = document.querySelector(`.fb-add-desc-btn[data-item-idx="${newIdx}"]`);
          btn?.click(); 
        }, 100);

        markFeedbackDirty();
        return;
      }

      // --- ЛОГІКА ДОДАВАННЯ ДРУГИХ ДВЕРЕЙ (+1) ---
      const addDoorsBtn = event.target.closest('.fb-add-doors-link');
      if (addDoorsBtn) {
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
        const posEl      = document.getElementById('fbPositions');
        const sendBtn    = document.getElementById('fbSend');
        const resultEl   = document.getElementById('fbResult');
        const stationHidden = document.getElementById('fbStation');
        const lineHidden    = document.getElementById('fbLine');
        const lineFilter    = document.getElementById('fbLineFilter');
        const stationList   = document.getElementById('fbStationList');

        // ── Пілюлі гілок ──
        lineFilter.addEventListener('click', e => {
          const btn = e.target.closest('.search-line-btn');
          if (!btn) return;
          const line = btn.dataset.line;
          
          lineFilter.querySelectorAll('.search-line-btn').forEach(b => b.classList.remove('is-active'));
          btn.classList.add('is-active');
          lineHidden.value = line;
          
          // Скидаємо вибрану станцію і позиції
          stationHidden.value = '';
          posEl.innerHTML = '';
          sendBtn.disabled = true;
          MetroApp.fbUnsaved = false;
          closeAllHints();
          
          // Завжди показуємо перелік станцій при кліку на фільтр
          const allSt = Object.entries(MetroApp.currentStationsData)
            .map(([sl, st]) => ({ slug: sl, ...st }))
            .filter(st => line === '' || st.line === line) // 'Всі' покаже всі
            .sort((a, b) => a.name.localeCompare(b.name, 'uk'));
            
          stationList.innerHTML = allSt.map(st =>
            `<div class="search-item fb-station-item${st.slug === stationHidden.value ? ' fb-station-active' : ''}" data-slug="${st.slug}">` +
            `<div class="search-item-line" style="background-color:${MetroApp.LINE_COLOR[st.line]}"></div>` +
            `<div>${st.name}</div></div>`
          ).join('');
          stationList.hidden = false;
          
          if (typeof renderResetBtn === 'function') renderResetBtn();
        });

// ── Клік по станції зі списку ──
        stationList.addEventListener('click', e => {
          const item = e.target.closest('.fb-station-item');
          if (!item) return;
          stationHidden.value = item.dataset.slug;
          
          // ХОВАЄМО СПИСОК ПІСЛЯ ВИБОРУ
          stationList.hidden = true;
          
          MetroApp.fbUnsaved = false;
          closeAllHints();
          renderFeedbackPositions(stationHidden.value);
        });
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
            MetroApp.invalidateLocalEditsCache?.();
            if (fbState.current[idx]) fbState.current[idx].isClosed = false;
            if (typeof MetroApp.applyLocalEdits === 'function') MetroApp.applyLocalEdits(MetroApp.currentStationsData);
            MetroApp.refreshCurrentStation?.();
            renderFeedbackPositions(slug);
            if (typeof renderResetBtn === 'function') renderResetBtn();
            return;
          }

          const closeBtn = e.target.closest('.fb-close-exit');
          if (closeBtn) {
            const idx = parseInt(closeBtn.dataset.idx);
            if (fbState.current[idx] && fbState.current[idx].isNew) {
              delete fbState.current[idx];
              delete fbState.labels[idx];
              delete fbState.original[idx];
              const edits = getLocalEdits();
              if (edits[slug] && edits[slug][idx]) {
                delete edits[slug][idx];
                if (Object.keys(edits[slug]).length === 0) delete edits[slug];
                if (Object.keys(edits).length === 0) clearAllLocalEdits();
                else localStorage.setItem(LOCAL_EDITS_KEY, JSON.stringify(edits));
              }
              renderFeedbackPositions(slug);
              markFeedbackDirty();
              if (typeof renderResetBtn === 'function') renderResetBtn();
              return;
            }
            const p = MetroApp.currentStationsData[fbState.slug]?.positions[idx];
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
            const loc = [p.dir, p.exit].filter(Boolean).join(' · ');
            saveLocalEdit(slug, idx, { wagon: p.wagon, doors: p.doors, closed: true });
            if (typeof MetroApp.applyLocalEdits === 'function') MetroApp.applyLocalEdits(MetroApp.currentStationsData);
            MetroApp.invalidateLocalEditsCache?.();
            fbState.current[idx].isClosed = true;
            renderFeedbackPositions(slug);
            if (typeof renderResetBtn === 'function') renderResetBtn();
            MetroApp.refreshCurrentStation?.();
            fetch(FORMSPREE_URL, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ station: s.name, slug, line: LINE_NAMES[s.line], changes: `${loc}: ВИХІД ЗАКРИТО` })
            }).catch(e => console.warn('[Feedback] Background report failed', e));
          }
        });

        sendBtn.addEventListener('click', () => { if (typeof MetroApp.triggerFeedbackSubmit === 'function') MetroApp.triggerFeedbackSubmit(false); });
        document.getElementById('feedbackClose').addEventListener('click', closeFeedbackSheet);
        bindSteppersOptimized(posEl);

        let swY = 0; let isHandleSwipeFB = false;
        sheet.addEventListener('touchstart', e => { swY = e.touches[0].clientY; isHandleSwipeFB = !!e.target.closest('.sheet-handle-bar'); }, { passive: true });
        sheet.addEventListener('touchend', e => { if (isHandleSwipeFB && (e.changedTouches[0].clientY - swY > 60)) closeFeedbackSheet(); });
      }

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
        
        // Ініціалізуємо стан лише при ПЕРШОМУ виборі станції, 
        // щоб при додаванні виходу (перемальовуванні) дані не скидались
        if (fbState.slug !== slug) initFeedbackState(slug);
        
        const s = MetroApp.currentStationsData[slug];
        const groupsMap = new Map();

        // 1. Спочатку додаємо існуючі позиції з бази
        s?.positions?.forEach((p, i) => {
          let g = groupsMap.get(p.dir);
          if (!g) { g = { dir: p.dir, items: [] }; groupsMap.set(p.dir, g); }
          g.items.push({ p, i });
        });

        // 2. Додаємо абсолютно нові виходи, які юзер створив кнопкою "+"
        Object.keys(fbState.current).forEach(idx => {
          const state = fbState.current[idx];
          if (state.isNew) {
            let g = groupsMap.get(state.dir);
            if (!g) { g = { dir: state.dir, items: [] }; groupsMap.set(state.dir, g); }
            // Створюємо фейковий об'єкт позиції для рендеру
            g.items.push({ p: { dir: state.dir, exit: fbState.labels[idx] || '', wagon: state.wMain, doors: state.dMain }, i: parseInt(idx) });
          }
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
          
// Дозволяємо додавати лише для конкретних станцій
          const canAddMore = ['R.Zhytomyrska', 'G.Osokorky', 'G.Chervonyi_khutir'].includes(slug);
          // Перевіряємо, чи юзер ВЖЕ додав новий вихід у цьому напрямку
          const hasNewAlready = Object.values(fbState.current).some(st => st.isNew && st.dir === g.dir);
          
          // Показуємо кнопку, ТІЛЬКИ якщо ще не додано новий вихід
         const addBtnHtml = (canAddMore && !hasNewAlready) ? `<div class="fb-add-exit-row"><button type="button" class="fb-add-exit-btn" data-dir="${g.dir}">+ Додати ще один вихід</button></div>` : '';

          return `<div class="fb-pos-row"><div class="fb-dir-label-wrap"><div class="fb-dir-label">${dirLabel}</div></div>${itemsHtml}${addBtnHtml}</div>`;
        }).join('');
        
        renderResetBtn();
        markFeedbackDirty(); // <--- Дозволяємо системі самій вирішити, вмикати кнопку чи ні
      }
      MetroApp._renderFeedbackPositions = renderFeedbackPositions;



MetroApp.triggerFeedbackSubmit = async function(background = false) {
        if (MetroApp._isSubmitting) return;
        MetroApp._isSubmitting = true;

        const slug = stationEl.value;
        if (!slug) { MetroApp._isSubmitting = false; return; }

        try {
          const s = MetroApp.currentStationsData[slug];

          // Збираємо змінені позиції, порівнюючи current з original
          const posChanges = [];
          s.positions.forEach((p, i) => {
            const orig = fbState.original[i];
            const cur  = fbState.current[i];
            if (!orig || !cur) return;

            // Вихід щойно позначено як закритий
            if (cur.isClosed && !orig.isClosed) {
              posChanges.push({ i, p, closed: true });
              return;
            }

            // Числові зміни вагону/дверей
            const vals     = extractFinalValues(cur);
            const origVals = extractFinalValues(orig);
            if (!vals || !origVals) return;
            if (vals.finalW !== origVals.finalW || vals.finalD !== origVals.finalD) {
              posChanges.push({ i, p, nw: vals.finalW, nd: vals.finalD });
            }
          });

          // Абсолютно нові виходи
          const newExits = Object.keys(fbState.current)
            .filter(idx => fbState.current[idx].isNew)
            .map(idx => {
              const st   = fbState.current[idx];
              const vals = extractFinalValues(st);
              return vals ? { idx, st, vals } : null;
            }).filter(Boolean);

          // Зміни текстових описів
          const labelChanges = [];
          document.querySelectorAll('.fb-exit-label-input').forEach(inp => {
            if (inp.dataset.changed === 'true') {
              const idx = inp.id.replace('fbLabelInput', '');
              const p   = s.positions[idx];
              const loc = [p?.dir, p?.exit].filter(Boolean).join(' · ');
              labelChanges.push(`${loc}: НОВИЙ ОПИС [${inp.value}]`);
              inp.dataset.changed = 'false';
            }
          });

          if (!posChanges.length && !newExits.length && !labelChanges.length) {
            if (!background) {
              resultEl.innerHTML = '<p class="fb-note">Змін не виявлено.</p>';
              setTimeout(() => { resultEl.innerHTML = ''; }, 3000);
            }
            MetroApp.fbUnsaved = false;
            MetroApp._isSubmitting = false;
            return;
          }

          // Зберігаємо локально
          posChanges.forEach(c => saveLocalEdit(slug, c.i,
            c.closed
              ? { wagon: c.p.wagon, doors: c.p.doors, closed: true }
              : { wagon: c.nw, doors: c.nd }
          ));
          newExits.forEach(({ idx, st, vals }) => saveLocalEdit(slug, idx, {
            wagon: vals.finalW, doors: vals.finalD,
            dir: st.dir, label: fbState.labels[idx], isNew: true
          }));

          MetroApp.invalidateLocalEditsCache?.();
          if (typeof MetroApp.applyLocalEdits === 'function') MetroApp.applyLocalEdits(MetroApp.currentStationsData);
          MetroApp.refreshCurrentStation?.();
          MetroApp.fbUnsaved = false;
          fbState.slug = null; // примусова переініціалізація baseline після збереження

          if (!background) {
            sendBtn.disabled = true;
            sendBtn.innerHTML = '<span class="fb-send-spinner"></span>';
            renderFeedbackPositions(slug);
            resultEl.innerHTML = '';
          }

          // Формуємо текст для Formspree
          const formspreeLines = [
            ...posChanges.map(c => changeText(c.p, c.nw ?? c.p.wagon, c.nd ?? c.p.doors, !!c.closed)),
            ...newExits.map(({ st, vals }) => `${st.dir}: НОВИЙ ВИХІД (вагон ${vals.finalW}, двері ${vals.finalD})`),
            ...labelChanges
          ];

          const response = await fetch(FORMSPREE_URL, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ station: s.name, slug, line: LINE_NAMES[s.line], changes: formspreeLines.join('\n') })
          });

          if (!response.ok) throw new Error('HTTP ' + response.status);

          // Успіх
          if (!background) {
            sendBtn.textContent = 'Зміни застосовано';
            sendBtn.style.color = 'var(--text-muted)';
            sendBtn.disabled = true;
            resultEl.innerHTML = '';
          }
        } catch (error) {
          // Локальні зміни вже збережено — просто повертаємо кнопку в нейтральний стан
          console.warn('[KyivMetroGO] Formspree недоступний, зміни збережено локально:', error);
          if (!background) {
            sendBtn.textContent = 'Застосувати';
            sendBtn.style.color = '';
            sendBtn.disabled = true;
            resultEl.innerHTML = '';
          }
        } finally {
          MetroApp._isSubmitting = false;
        }
      };

// === СКИДАННЯ ФОРМИ ДО СТАРТОВОГО СТАНУ ===
      const stationHidden2 = document.getElementById('fbStation');
      const lineHidden2    = document.getElementById('fbLine');
      const lineFilterEl   = document.getElementById('fbLineFilter');
      const stationListEl  = document.getElementById('fbStationList');

      if (stationHidden2) stationHidden2.value = '';
      if (lineHidden2)    lineHidden2.value = '';
      if (lineFilterEl)   lineFilterEl.querySelectorAll('.search-line-btn').forEach(b => b.classList.remove('is-active'));
      if (stationListEl)  { stationListEl.hidden = true; stationListEl.innerHTML = ''; }
      if (posEl) posEl.innerHTML = '';
      if (resultEl) resultEl.innerHTML = '';
      if (sendBtn) { sendBtn.textContent = 'Застосувати'; sendBtn.disabled = true; sendBtn.style.color = ''; }


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
    // Надійне читання стану з JS-змінної замість парсингу DOM
    return !!MetroApp.fbUnsaved;
  };


function closeFeedbackSheet() {
    try {
      if (MetroApp.hasUnsavedFeedback && MetroApp.hasUnsavedFeedback()) {
        if (typeof MetroApp.showCustomConfirm === 'function') {
          const stationSlug = document.getElementById('fbStation')?.value || '';
          const stationData = stationSlug ? MetroApp.currentStationsData?.[stationSlug] : null;
          const stationName = stationData?.name || '';
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