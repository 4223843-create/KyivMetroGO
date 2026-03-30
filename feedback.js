/* ══ FEEDBACK SHEET ══ */
(function() {

const FORMSPREE_URL = 'https://formspree.io/f/mgopobnd';
const LINE_COLOR = { red: '#c8523a', blue: '#5b9bd5', green: '#5aaa6a' };
const LINE_NAMES = { red: 'Червона', blue: 'Синя', green: 'Зелена' };
const LINE_ORDER = ['red', 'blue', 'green'];
const LOCAL_EDITS_KEY = 'metro_local_edits';

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
            exit.positions[i] = { ...exit.positions[i], ...posEdits[posIdx], _edited: true };
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
function bindSteppers(container) {
  container.querySelectorAll('.fb-step').forEach(btn => {
    btn.addEventListener('click', () => {
      const el  = document.getElementById(btn.dataset.id);
      const min = parseInt(btn.dataset.min);
      const max = parseInt(btn.dataset.max);
      let val = parseInt(el.textContent) + (btn.classList.contains('fb-step-up') ? 1 : -1);
      el.textContent = Math.max(min, Math.min(max, val));
    });
  });
}

/* ── Формуємо рядок змін для відправки ── */
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
  let sheet = document.getElementById('feedbackSheet');
  if (!sheet) {
    sheet = document.createElement('div');
    sheet.id = 'feedbackSheet';
    sheet.className = 'station-sheet';
    document.body.appendChild(sheet);
  }

  const allStations = Object.entries(STATIONS_FOR_FORM)
    .map(([slug, s]) => ({ slug, ...s }))
    .sort((a, b) => a.name.localeCompare(b.name, 'uk'));

  function stationOptions(filterLine) {
    const list = filterLine ? allStations.filter(s => s.line === filterLine) : allStations;
    return `<option value="" style="text-align:center">— оберіть —</option>` +
      list.map(s => `<option value="${s.slug}">${s.name}</option>`).join('');
  }

  const isAndroid = /android/i.test(navigator.userAgent);

  // На Android — кастомні dropdown, на iOS/інших — нативний <select>
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
      <span class="sheet-sheet-title">Запропонувати зміни</span>
      <button class="sheet-close-btn" id="feedbackClose">✕</button>
    </div>
    <div class="sheet-body" id="feedbackBody">
      <div class="fb-selectors">
        <div class="fb-select-wrap">
          <label class="fb-label">Гілка</label>
          ${lineSelectHtml}
        </div>
        <div class="fb-select-wrap">
          <label class="fb-label">Станція</label>
          ${stationSelectHtml}
        </div>
      </div>
      ${isAndroid ? '<div id="fbLineDropdown" class="fb-dropdown" hidden></div><div id="fbStationDropdown" class="fb-dropdown" hidden></div>' : ''}
      <div id="fbPositions"></div>
      <button id="fbSend" class="fb-send-btn" disabled>Надіслати зміни</button>
      <div id="fbResult"></div>
      <div id="fbResetWrap"></div>
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
      lineDD.querySelectorAll('.fb-dropdown-item').forEach(b => b.addEventListener('click', () => {
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
      stationDD.querySelectorAll('.fb-dropdown-item').forEach(b => b.addEventListener('click', () => {
        stationEl.value = b.dataset.value;
        stationLbl.textContent = b.textContent;
        closeAllDD();
        const s = STATIONS_FOR_FORM[stationEl.value];
        if (s && !lineEl.value) { lineEl.value = s.line; lineLbl.textContent = LINE_NAMES[s.line]; }
        renderPositions(stationEl.value);
      }));
    }

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
    setTimeout(() => document.addEventListener('click', closeAllDD), 0);

  } else {
    // iOS / desktop — нативні select
    lineEl    = document.getElementById('fbLine');
    stationEl = document.getElementById('fbStation');

    lineEl.addEventListener('change', () => {
      stationEl.innerHTML = stationOptions(lineEl.value);
      stationEl.value = '';
      posEl.innerHTML = '';
      sendBtn.disabled = true;
    });

    stationEl.addEventListener('change', () => {
      const slug = stationEl.value;
      if (!slug) { posEl.innerHTML = ''; sendBtn.disabled = true; return; }
      const s = STATIONS_FOR_FORM[slug];
      if (s && !lineEl.value) lineEl.value = s.line;
      renderPositions(slug);
    });
  } // end platform if

  function renderResetBtn() {
    resetWrap.innerHTML = hasLocalEdits()
      ? `<button id="fbReset" class="fb-reset-btn">Скинути локальні зміни</button>` : '';
    document.getElementById('fbReset')?.addEventListener('click', () => {
      if (!confirm('Скинути всі локальні зміни та повернутись до стандартних даних?')) return;
      clearAllLocalEdits();
      fetch('stations.json').then(r => r.json()).then(d => {
        Object.keys(stationsData).forEach(k => delete stationsData[k]);
        d.stations.forEach(s => { stationsData[s.slug] = s; });
        applyLocalEdits(stationsData);
      });
      resetWrap.innerHTML = '<p class="fb-note fb-success">✓ Локальні зміни скинуто.</p>';
      renderPositions(stationEl.value);
    });
  }

  function renderPositions(slug) {
    if (!slug) { posEl.innerHTML = ''; sendBtn.disabled = true; return; }
    const s = STATIONS_FOR_FORM[slug];
    if (!s?.positions?.length) {
      posEl.innerHTML = '<p class="fb-note">Для цієї станції немає позицій.</p>';
      return;
    }
    const edits = getLocalEdits()[slug] || {};
    posEl.innerHTML = s.positions.map((p, i) => {
      const w = parseInt(edits[i]?.wagon ?? p.wagon) || 1;
      const d = parseInt(edits[i]?.doors  ?? p.doors) || 1;
      const isEdited = edits[i] !== undefined;
      const isClosed = edits[i]?.closed;
      // Функція правильного регістру назви станції
      function properCase(name) {
        // Слова що завжди з великої всередині назви
        const alwaysCap = new Set(['україна','україни','українських','дніпра','незалежності','небесної','сотні','спорту','центр','площа','площі','героїв','лівий','правий']);
        return name.split(' ').map((w, i) => {
          const wl = w.toLowerCase();
          if (i === 0 || alwaysCap.has(wl)) return wl.charAt(0).toUpperCase() + wl.slice(1);
          return wl;
        }).join(' ');
      }
      let dirLabel;
      const dirLower = p.dir.toLowerCase();
      if (dirLower === 'кінцева' || dirLower === 'вихід праворуч' || dirLower === '__long_transfer__') {
        dirLabel = p.dir;
      } else {
        const rawName = p.dir.replace(/^[Пп]опередня\s+/, '');
        dirLabel = `попередня ${properCase(rawName)}`;
      }
      // Форматуємо exit
      let exitHtml = '';
      if (p.exit) {
        const EMOJI_COLOR = { '🟥': '#c8523a', '🟦': '#5b9bd5', '🟩': '#5aaa6a' };
        // Визначаємо колір за emoji
        const emojiMatch = [...p.exit.matchAll(/[\u{1F7E5}\u{1F7E6}\u{1F7E9}]/gu)].find(m => EMOJI_COLOR[m[0]]);
        const lineColor = emojiMatch ? EMOJI_COLOR[emojiMatch[0]] : null;
        // Прибираємо emoji і nbsp
        const cleanExit = p.exit.replace(/[\u{1F7E5}\u{1F7E6}\u{1F7E9}]/gu,'').replace(/[\u00a0\u202f]/g,' ').replace(/\s+/g,' ').trim();
        const isPересадка = /пересадка|перехід/i.test(cleanExit);
        if (isPересадка) {
          // Зберігаємо "пересадка на" + | Назва |
          const prefix = cleanExit.match(/^(пересадка на|короткий перехід на|довгий перехід на|перехід на)\s*/i)?.[0] || 'пересадка на ';
          const name = cleanExit.slice(prefix.length).trim();
          const color = lineColor || 'var(--text-muted)';
          exitHtml = `<div class="fb-exit-label fb-transfer">
            <span class="fb-transfer-prefix">${prefix.trim()}</span>
            <span class="fb-transfer-bar" style="background:${color}"></span>
            <span>${name}</span>
            <span class="fb-transfer-bar" style="background:${color}"></span>
          </div>`;
        } else {
          exitHtml = `<div class="fb-exit-label">${cleanExit}</div>`;
        }
      }
      return `<div class="fb-pos-row${isClosed ? ' fb-pos-closed' : ''}" data-idx="${i}">
        <div class="fb-dir-label">${dirLabel}${isEdited ? ' <span class="fb-edited-mark">✏</span>' : ''}</div>
        ${exitHtml}
        ${isClosed
          ? `<div class="fb-closed-note">Вихід позначено як недоступний</div>`
          : `<div class="fb-pos-wrap"><div class="fb-pos-inputs">${stepperHtml(`fbW${i}`, w, 1, 5, 'вагон')}${stepperHtml(`fbD${i}`, d, 1, 4, 'двері')}</div><button type="button" class="fb-close-exit" data-idx="${i}" title="Позначити вихід як недоступний">✕</button></div>`
        }
      </div>`;
    }).join('');
    bindSteppers(posEl);
    sendBtn.disabled = false;

    // п.3: кнопки закриття виходу
    posEl.querySelectorAll('.fb-close-exit').forEach(btn => {
      btn.addEventListener('click', async () => {
        const idx = parseInt(btn.dataset.idx);
        const p   = s.positions[idx];
        const loc = [p.dir.startsWith('попередня') ? p.dir : `Попередня ${p.dir}`, p.exit].filter(Boolean).join(' · ');
        if (!confirm(`Позначити вихід як недоступний?\n${loc}`)) return;

        // Відправити
        await fetch(FORMSPREE_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ station: s.name, slug, line: LINE_NAMES[s.line], changes: `${loc}: ВИХІД ЗАКРИТО` })
        }).catch(e => console.warn(e));

        // Питання локально
        if (confirm('Застосувати локально?\n(Вихід не відображатиметься у вашому додатку)')) {
          saveLocalEdit(slug, idx, { wagon: p.wagon, doors: p.doors, closed: true });
          applyLocalEdits(stationsData);
          renderPositions(slug);
          renderResetBtn();
        }
      });
    });
    renderResetBtn();
  }

  // change listeners — вище в else блоці

  sendBtn.addEventListener('click', async () => {
    const slug = stationEl.value;
    if (!slug) return;
    const s      = STATIONS_FOR_FORM[slug];
    const changes = s.positions.map((p, i) => {
      const nw = String(document.getElementById(`fbW${i}`)?.textContent ?? p.wagon);
      const nd = String(document.getElementById(`fbD${i}`)?.textContent ?? p.doors);
      return (nw !== p.wagon || nd !== p.doors) ? { i, p, nw, nd } : null;
    }).filter(Boolean);

    if (!changes.length) { resultEl.innerHTML = '<p class="fb-note">Змін не виявлено.</p>'; return; }
    sendBtn.disabled = true;
    sendBtn.textContent = 'Надсилаємо…';

    await fetch(FORMSPREE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        station: s.name, slug, line: LINE_NAMES[s.line],
        changes: changes.map(c => changeText(c.p, c.nw, c.nd, false)).join('\n')
      })
    }).catch(e => console.warn(e));

    // п.9: оновлений текст
    resultEl.innerHTML = `
      <div class="fb-confirm">
        <p>Дякуємо, зміни надіслано.<br>Застосувати їх локально?</p>
        <div class="fb-confirm-btns">
          <button id="fbApplyYes" class="fb-confirm-btn fb-yes">Так</button>
          <button id="fbApplyNo"  class="fb-confirm-btn fb-no">Ні</button>
        </div>
      </div>`;

    document.getElementById('fbApplyYes').addEventListener('click', () => {
      changes.forEach(c => saveLocalEdit(slug, c.i, { wagon: c.nw, doors: c.nd }));
      applyLocalEdits(stationsData);
      resultEl.innerHTML = '<p class="fb-note fb-success">✓ Зміни застосовано локально.</p>';
      sendBtn.textContent = 'Надіслати зміни';
      sendBtn.disabled = false;
      renderResetBtn();
      renderPositions(slug);
    });
    document.getElementById('fbApplyNo').addEventListener('click', () => {
      resultEl.innerHTML = '<p class="fb-note">Зміни надіслано автору.</p>';
      sendBtn.textContent = 'Надіслати зміни';
      sendBtn.disabled = false;
    });
  });

  document.getElementById('feedbackClose').addEventListener('click', closeFeedbackSheet);
  renderResetBtn();
  document.getElementById('aboutSheet')?.classList.remove('sheet-open');
  document.getElementById('stationSheet')?.classList.remove('sheet-open');
  sheet.classList.add('sheet-open');
  document.getElementById('sheetOverlay').classList.add('overlay-visible');
  let swY = 0;
  sheet.addEventListener('touchstart', e => { swY = e.touches[0].clientY; }, { passive: true });
  sheet.addEventListener('touchend',   e => { if (e.changedTouches[0].clientY - swY > 60) closeFeedbackSheet(); });
  } catch(err) { console.error('[FeedbackSheet ERROR]', err); alert('Помилка: ' + err.message); }
}

function closeFeedbackSheet() {
  document.getElementById('feedbackSheet')?.classList.remove('sheet-open');
  // Ховаємо overlay тільки якщо жодне інше вікно не відкрите
  const anyOpen = document.querySelectorAll('.station-sheet.sheet-open').length > 0;
  if (!anyOpen) document.getElementById('sheetOverlay')?.classList.remove('overlay-visible');
}

window.openFeedbackSheet  = openFeedbackSheet;
window.closeFeedbackSheet = closeFeedbackSheet;
window.applyLocalEdits    = applyLocalEdits;
})();
