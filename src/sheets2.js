import { state }                                          from './state.js';
import { STORAGE_KEYS, Storage } from './storage.js';
import { TIMING }                                         from './timing.js';
import { pill, heartSvg }                                 from './ui.js';
import { slugByName }                                     from './stations.js';
import { getFavs, isFav, toggleFav, getExitFavs,
         isExitFav, toggleExitFav, replaceExitFav, updateFavDock } from './favorites.js';
import { isCheckinMode, openCheckinSheet }                 from './checkin.js';
import { attachDevModeUI, setupDevModeTapCounter, updateDevModeIndicator, isDevMode } from './devmode.js';

// Анімація розсування для inline-елементів (підказки всередині шторки)
MetroApp.dismissHintWithDoors = function(el, onDone) {
  if (!el || !document.body.contains(el)) { onDone?.(); return; }
  const rect = el.getBoundingClientRect();
  if (rect.height < 4) { el.remove(); onDone?.(); return; }

  const baseStyle = [
    'position:fixed',
    `top:${rect.top}px`, `left:${rect.left}px`,
    `width:${rect.width}px`, `height:${rect.height}px`,
    'margin:0', 'transform:none', 'pointer-events:none', 'z-index:9999',
    'transition:transform 0.55s cubic-bezier(0.32,0.72,0,1),opacity 0.4s ease',
  ].join(';');

  const L = el.cloneNode(true); L.removeAttribute('id');
  const R = el.cloneNode(true); R.removeAttribute('id');
  L.style.cssText = baseStyle + ';clip-path:inset(0 50% 0 0)';
  R.style.cssText = baseStyle + ';clip-path:inset(0 0 0 50%)';
  document.body.appendChild(L);
  document.body.appendChild(R);

  // Ховаємо оригінал — клони вже на його місці
  el.style.visibility = 'hidden';
  void L.offsetWidth; // reflow — без нього transition не спрацює

  L.style.transform = 'translateX(-52%)'; L.style.opacity = '0';
  R.style.transform = 'translateX(52%)';  R.style.opacity = '0';

  setTimeout(() => { el.remove(); onDone?.(); }, TIMING.HINT_CALLBACK);
  setTimeout(() => { L.remove(); R.remove(); }, TIMING.HINT_CLEANUP);
};

const sheet            = document.getElementById('stationSheet');
const sheetBody        = document.getElementById('sheetBody');
const sheetClose       = document.getElementById('sheetClose');
const sheetOverlay     = document.getElementById('sheetOverlay');
const stationTitleMain = document.getElementById('stationTitleMain');
const dropMenuEl       = document.getElementById('dropMenu');

// ══ ФОРМАТУВАННЯ НАПИСУ ВИХОДУ ══
function formatDirLabel(raw) {
  if (!raw) return raw;
  
  const match = raw.trim().match(/^([^\s&]+)(?:\s+|&nbsp;)(.*)$/i);
  if (!match) return raw;

  const prefix = match[1].toLowerCase(); 
  const stationName = match[2];          

  return `${prefix} <span class="dir-name-caps">${stationName}</span>`;
}

function formatLabel(raw) {
  const text = raw.trim();
  const cleanText = text.replace(/&nbsp;/g, ' ').toLowerCase();
  const isTransfer = cleanText.includes('пересадка') || cleanText.includes('перехід');

  if (isTransfer) {
    const targetSlug = slugByName(cleanText);
    if (targetSlug && state.stationsData?.[targetSlug]) {
      const color = MetroApp.LINE_COLOR[state.stationsData[targetSlug].line];
      return `<span class="transfer-label"><span class="transfer-line" style="background:${color}"></span><span class="transfer-text">${text}</span><span class="transfer-line" style="background:${color}"></span></span>`;
    }
  }
  
  return `<span class="exit-label-text">${text}</span>`;
}

// ══ РЕНДЕР ПОЗИЦІЙ ══
function renderPositions(positions, color, multiRow) {
  positions = positions.filter(p => !p.closed);
  if (!positions.length) return '';

  function generatePills(wStr, dStr) {
    const wArr = String(wStr).split(',').map(s => s.trim());
    const dArr = String(dStr).split(',').map(s => s.trim());
    const blocks = [];
    const count  = Math.max(wArr.length, dArr.length);
    for (let i = 0; i < count; i++) {
      blocks.push(`${pill('вагон', wArr[i] || wArr[0], color)}\n${pill('двері', dArr[i] || dArr[0], color)}`);
    }
    return blocks.join('<span class="pos-multi-sep" style="margin: 0 6px;">·</span>');
  }

  if (positions.length === 1) {
    const p       = positions[0];
    const isMulti = String(p.wagon).includes(',');
    const editedMark = p._edited ? `<span class="pos-edited-mark" data-slug="${p._slug}" data-idx="${p._posIdx}">${MetroApp.Icons.pencil}</span>` : '';
    return `<div class="position-row ${isMulti ? 'position-row-multi' : ''}">${editedMark}<div class="fav-tap-target" style="display:flex; gap:6px; align-items:center;">${generatePills(p.wagon, p.doors)}</div></div>`;
  }

  if (multiRow) {
    const editedPos  = positions.find(p => p._edited);
    const editedMark = editedPos ? `<span class="pos-edited-mark" data-slug="${editedPos._slug}" data-idx="${editedPos._posIdx}">${MetroApp.Icons.pencil}</span>` : '';
    const spacer     = editedPos ? `<span class="pos-edited-spacer"></span>` : '';
    return `<div class="position-row position-row-multi">${editedMark}` +
      positions.map((p, i) =>
        `${i > 0 ? '<span class="pos-multi-sep">·</span>' : ''}<div class="fav-tap-target" style="display:flex; gap:6px; align-items:center;">${generatePills(p.wagon, p.doors)}</div>`
      ).join('') + `${spacer}</div>`;
  }

  return positions.map(p =>
    `<div class="position-row ${String(p.wagon).includes(',') ? 'position-row-multi' : ''}"><div class="fav-tap-target" style="display:flex; gap:6px; align-items:center;">${generatePills(p.wagon, p.doors)}</div></div>`
  ).join('');
}

// ══ РЕНДЕР НАПРЯМКІВ ══
function renderDirections(s, color) {
  const isKhreshchatyk = s.slug === 'R.Khreshchatyk';

  if (isKhreshchatyk) {
    const mainDirs = s.directions.filter(d => d.from !== '__long_transfer__');
    const longDir  = s.directions.find(d => d.from === '__long_transfer__');

    const mainHtml = mainDirs.map(dir => `
      <div class="direction-block">
        <div class="direction-label nav-label" data-name="${dir.from}">${formatDirLabel(dir.from)}</div>
        ${dir.exits.map(exit =>
          `${exit.label ? `<div class="exit-label nav-label" data-name="${exit.label}">${formatLabel(exit.label)}</div>` : ''}${renderPositions(exit.positions, color, true)}`
        ).join('')}
      </div>`).join('');

    let longHtml = '';
    if (longDir) {
      const rows = longDir.exits.map(exit => {
        const posRows = exit.positions.map(p =>
          `<div class="long-transfer-pos-row">${pill('вагон', p.wagon, color)}${pill('двері', p.doors, color)}</div>`
        ).join('');
        return `<div class="long-transfer-exit"><div class="long-transfer-exit-label">${exit.label}</div>${posRows}</div>`;
      }).join('');
      longHtml = `<div class="long-transfer-block"><div class="long-transfer-title"><span class="transfer-label"><span class="transfer-line" style="background:${MetroApp.LINE_COLOR['blue']}"></span><span class="transfer-text">довгий&nbsp;перехід на&nbsp;Майдан&nbsp;Незалежності</span><span class="transfer-line" style="background:${MetroApp.LINE_COLOR['blue']}"></span></span></div>${rows}</div>`;
    }
    return mainHtml + longHtml;
  }

  return s.directions.map(dir => {
    if (dir.from === 'вихід праворуч') {
      return `<div class="direction-block direction-exit-right"><div class="direction-label">вихід праворуч</div></div>`;
    }

    if (dir.from.trim().toLowerCase() === 'кінцева') {
      return `
        <div class="direction-block direction-exit-right" style="margin-bottom: 10px;">
          <div class="direction-label" style="margin: 0;">кінцева</div>
        </div>
        <div class="direction-block">
          ${dir.exits.map(exit =>
            `${exit.label ? `<div class="exit-label nav-label" data-name="${exit.label}">${formatLabel(exit.label)}</div>` : ''}${renderPositions(exit.positions, color, false)}`
          ).join('')}
        </div>
      `;
    }

    return `<div class="direction-block">
      <div class="direction-label nav-label" data-name="${dir.from}">${formatDirLabel(dir.from)}</div>
      ${dir.exits.map(exit =>
        `${exit.label ? `<div class="exit-label nav-label" data-name="${exit.label}">${formatLabel(exit.label)}</div>` : ''}${renderPositions(exit.positions, color, false)}`
      ).join('')}
    </div>`;
  }).join('');
}

// ══ СТИЛІ ОБРАНОГО ВИХОДУ ══
function applyFavPillStyles(container, lineColor, isFaved) {
  container.querySelectorAll('.pos-pill').forEach(pill => {
    if (isFaved) {
      pill.style.background = lineColor;
      const num = pill.querySelector('.pos-pill-num');
      const lbl = pill.querySelector('.pos-pill-label');
      if (num) num.style.color = 'var(--bg)';
      if (lbl) lbl.style.color = 'var(--bg)';
    } else {
      pill.style.background = '';
      const num = pill.querySelector('.pos-pill-num');
      const lbl = pill.querySelector('.pos-pill-label');
      if (num) num.style.color = lineColor;
      if (lbl) lbl.style.color = '';
    }
  });
}

// ══ INLINE ПІДТВЕРДЖЕННЯ ЗАМІНИ ВИХОДУ ══
function showExitReplaceConfirm(row, existing, slug, dirLabel, newWagon, newDoors, lineColor) {
  document.querySelectorAll('.exit-replace-confirm').forEach(el => {
    el.classList.remove('exit-replace-open');
    setTimeout(() => el.remove(), 280);
  });

  const confirmEl = document.createElement('div');
  confirmEl.className = 'exit-replace-confirm';
  confirmEl.innerHTML =
    `<p class="exit-replace-text">Ви вже додали до&nbsp;<span style="font-variant:small-caps;letter-spacing:0.04em">Вибраного</span> інший вихід з&nbsp;цієї станції. Замінити на цей?</p>` +
    `<div class="exit-replace-btns">` +
      `<button class="exit-replace-btn confirm-btn-save">Замінити</button>` +
      `<button class="exit-replace-btn confirm-btn-discard">Скасувати</button>` +
    `</div>`;
  row.after(confirmEl);
  requestAnimationFrame(() => confirmEl.classList.add('exit-replace-open'));

  function closeConfirm() {
    confirmEl.classList.remove('exit-replace-open');
    setTimeout(() => confirmEl.remove(), 280);
  }

  confirmEl.querySelector('.confirm-btn-save').addEventListener('click', e => {
    e.stopPropagation();
    replaceExitFav(slug, dirLabel, existing.wagon, existing.doors, newWagon, newDoors);
    closeConfirm();
    MetroApp.refreshCurrentStation?.();
  });

  confirmEl.querySelector('.confirm-btn-discard').addEventListener('click', e => {
    e.stopPropagation();
    closeConfirm();
  });
}

// ══ СЛУХАЧІ ОБРАНИХ ВИХОДІВ ══
function attachExitFavListeners(container, slug, lineColor) {
  container.querySelectorAll('.position-row').forEach(row => {
    function getPillValues() {
      const nums = row.querySelectorAll('.pos-pill-num');
      if (nums.length < 2) return null;
      return { wagon: nums[0].textContent.trim(), doors: nums[1].textContent.trim() };
    }

    function showExitFavToast(row, added) {
      let existing = row.querySelector('.exit-fav-toast');
      if (existing) { existing.classList.remove('fav-note-open'); setTimeout(() => existing?.remove(), TIMING.TOAST_FADE); }
      if (!added) return;
      const pv = getPillValues(); if (!pv) return;
      const toast = document.createElement('div');
      toast.className = 'exit-fav-toast';
      toast.setAttribute('role', 'status');
      toast.setAttribute('aria-live', 'polite');
      toast.innerHTML = '<span class="exit-fav-toast-text">вихід&nbsp;додано<br>до&nbsp;<span style="font-variant: small-caps; letter-spacing: 0.04em;">Вибраного</span></span>';
      row.prepend(toast);
      requestAnimationFrame(() => toast.classList.add('fav-note-open'));
      setTimeout(() => { toast.classList.remove('fav-note-open'); setTimeout(() => toast.remove(), TIMING.TOAST_FADE); }, TIMING.TOAST_SHOW);
    }

    function triggerExitFav() {
      const pv = getPillValues(); if (!pv) return;
      const dirBlock = row.closest('.direction-block') || row.closest('.long-transfer-block');
      const labelEl  = dirBlock ? (dirBlock.querySelector('.direction-label') || dirBlock.querySelector('.transfer-text')) : null;
      const dirLabel = labelEl ? labelEl.textContent.trim() : '';
      const result   = toggleExitFav(slug, dirLabel, pv.wagon, pv.doors);

      if (result.status === 'added') {
        function insertCheckinHint() {
          if (Storage.get(STORAGE_KEYS.HIDE_INFO_BLOCKS) === 'true') { console.log('[hint] blocked by HIDE_INFO_BLOCKS'); return; }
          if (Storage.get(STORAGE_KEYS.CHECKIN_HINT_SEEN) === 'true') { console.log('[hint] blocked by CHECKIN_HINT_SEEN'); return; }
          const sheetBodyEl = document.getElementById('sheetBody');
          if (!sheetBodyEl) { console.log('[hint] sheetBody not found'); return; }
          if (document.getElementById('checkinHint')) { console.log('[hint] checkinHint already exists'); return; }
          console.log('[hint] inserting checkinHint');
          const checkinHint = document.createElement('div');
          checkinHint.id = 'checkinHint';
          checkinHint.className = 'onboarding-hint';
          checkinHint.innerHTML = `<span class="hint-icon-wrap" style="color:${lineColor}">${MetroApp.Icons.info}</span>Натисніть на&nbsp;шпильку, щоб&nbsp;позначити вихід зі&nbsp;станції як&nbsp;відвіданий`;
          
          sheetBodyEl.insertBefore(checkinHint, sheetBodyEl.firstChild);
          console.log('[hint] checkinHint inserted, sheetBody firstChild:', sheetBodyEl.firstChild?.id);
        }

        const onboardingHint = document.getElementById('onboardingHint');
        console.log('[hint] onboardingHint found:', !!onboardingHint);
        if (onboardingHint) {
          MetroApp.dismissHintWithDoors(onboardingHint, insertCheckinHint);
        } else {
          insertCheckinHint();
        }
      }

      if (result.status === 'replace') {
        showExitReplaceConfirm(row, result.existing, slug, dirLabel, pv.wagon, pv.doors, lineColor);
        return;
      }

      const added = result.status === 'added';
      applyFavPillStyles(row, lineColor, added);
      showExitFavToast(row, added);

      const favBtnBar = document.querySelector('.fav-btn-bar');
      if (favBtnBar?.dataset.slug === slug) {
        const nowFav = isFav(slug);
        favBtnBar.innerHTML = heartSvg(nowFav, slug, lineColor);
        favBtnBar.classList.toggle('fav-active', nowFav);
      }
    }

    const pv = getPillValues();
    if (pv) {
      const dirBlock = row.closest('.direction-block') || row.closest('.long-transfer-block');
      const labelEl  = dirBlock ? (dirBlock.querySelector('.direction-label') || dirBlock.querySelector('.transfer-text')) : null;
      const dirLabel = labelEl ? labelEl.textContent.trim() : '';
      if (isExitFav(slug, dirLabel, pv.wagon, pv.doors)) applyFavPillStyles(row, lineColor, true);
    }

    let longPressTimer = null;
    row.addEventListener('touchstart', e => {
      if (!e.target.closest('.fav-tap-target')) return;
      longPressTimer = setTimeout(() => { longPressTimer = null; triggerExitFav(); }, TIMING.LONG_PRESS);
    }, { passive: true });
    row.addEventListener('touchend',  () => { clearTimeout(longPressTimer); longPressTimer = null; }, { passive: true });
    row.addEventListener('touchmove', () => { clearTimeout(longPressTimer); longPressTimer = null; }, { passive: true });

    let tapCount = 0, tapTimer = null;
    row.addEventListener('click', e => {
      if (!e.target.closest('.fav-tap-target')) return;
      if (e.target.closest('.pos-edited-mark, .exit-fav-cancel, .edit-info-panel')) return;
      tapCount++;
      clearTimeout(tapTimer);
      tapTimer = setTimeout(() => { tapCount = 0; }, TIMING.DOUBLE_TAP);
      if (tapCount >= 2) { tapCount = 0; clearTimeout(tapTimer); triggerExitFav(); }
    });
  });
}

// ══ ПЕРЕВІРКА НЕЗБЕРЕЖЕНИХ ЗМІН ══
export function withUnsavedCheck(proceed) {
  if (MetroApp.hasUnsavedFeedback?.()) {
    const _fbSlug = document.getElementById('fbStation')?.value || '';
    const _fbData = _fbSlug ? state.stationsData?.[_fbSlug] : null;
    const stationName = _fbData?.name || '';
    const question    = stationName
      ? `Зберегти зміни для станції <span style="white-space: nowrap; font-variant: small-caps; letter-spacing: 0.04em;">${stationName}?</span>`
      : 'Зберегти зміни?';
    MetroApp.showCustomConfirm(question,
      () => { MetroApp.triggerFeedbackSubmit?.(true); MetroApp.fbUnsaved = false; proceed(); },
      () => { MetroApp.fbUnsaved = false; proceed(); },
      () => {}
    );
    return true;
  }
  proceed();
  return false;
}


// ══ ВІДКРИТТЯ СТАНЦІЇ ══
export function openStation(slug) {
  withUnsavedCheck(actualOpenStation);

  function actualOpenStation() {
    if (!state.stationsData?.[slug]) return;
    state.currentStationSlug = slug;
    const s     = state.stationsData[slug];
    const color = MetroApp.LINE_COLOR[s.line] || 'var(--text-muted)';
    const fav   = isFav(slug);

    // Безпечне отримання налаштувань
    let hideInfoBlocks = false;
    try { hideInfoBlocks = localStorage.getItem('metro_hide_info_blocks') === 'true'; } catch(e){}

    const onboardingHtml = (!hideInfoBlocks && getExitFavs().length === 0)
      ? `<div class="onboarding-hint" id="onboardingHint"><span class="hint-icon-wrap" style="color:${color}">${MetroApp.Icons.info}</span>Натисніть двічі на вагон та двері, щоб зберегти вихід</div>`
      : '';

    document.getElementById('stationTitleMain').textContent = s.name;

    const hasDirections = s.directions?.length > 0;
    const allExitsClosed = hasDirections && !s.directions.some(dir =>
      dir.exits?.some(exit => exit.positions?.some(pos => !pos.closed))
    );
    const dirsHtml = hasDirections ? renderDirections(s, color) : '';

    if (!hasDirections) {
      sheetBody.innerHTML = `<p class="fav-empty-text" style="text-align: center; margin: 40px 0 0 0; width: 100%;">Дані про виходи відсутні</p>`;
    } else if (allExitsClosed) {
      sheetBody.innerHTML = `<p class="fav-empty-text" style="text-align: center; margin: 40px 0 0 0; width: 100%;">Усі виходи закриті</p>`;
    } else {
      sheetBody.innerHTML = `${onboardingHtml}${dirsHtml}`;
    }

    // 💡 БЕЗШОВНЕ ПЕРЕМИКАННЯ: Скидаємо скрол догори
    sheetBody.scrollTop = 0;

    sheetBody.querySelectorAll('.nav-label').forEach(el => {
      const target = slugByName(el.dataset.name || '');
      if (target && target !== slug) {
        el.classList.add('nav-link');
        el.setAttribute('role', 'button');
        el.setAttribute('tabindex', '0');
      }
    });

    if (s.slug === 'R.Khreshchatyk') {
      sheet.classList.add('sheet-fullscreen', 'sheet-scrollable');
      sheet.style.maxHeight = '';
    } else {
      sheet.style.maxHeight = '';
      sheet.classList.remove('sheet-fullscreen', 'sheet-scrollable');
    }

    const handle = sheet.querySelector('.sheet-handle');
    if (handle) handle.style.background = color;

    const favBtnBar = sheet.querySelector('.fav-btn-bar');
    if (favBtnBar) {
      favBtnBar.dataset.slug  = slug;
      favBtnBar.dataset.color = color;
      favBtnBar.innerHTML     = heartSvg(fav, slug, color);
      favBtnBar.classList.toggle('fav-active', fav);
    }

    document.querySelectorAll('.station-sheet').forEach(el => {
      if (el.id !== 'stationSheet') el.classList.remove('sheet-open');
    });

    if (!sheet.classList.contains('sheet-open')) {
      sheet.classList.add('sheet-open');
      if (sheetOverlay) sheetOverlay.classList.add('overlay-visible');
    }

    attachExitFavListeners(sheetBody, slug, color);
    
    // Відновлюємо dev mode кнопки, якщо функція підключена
    if (typeof attachDevModeUI === 'function') {
      attachDevModeUI(sheetBody, slug);
    }
    
    sheet.querySelector('.row-checkin-btn')?.remove();
    if (typeof MetroApp.attachCheckinButtons === 'function') {
      MetroApp.attachCheckinButtons(sheet, slug, color);
    }
  }
}

// ══ ЗАКРИТТЯ ВСІХ ШТОРОК ══
export function closeAllSheets(force = false) {
  if (!force) {
    if (withUnsavedCheck(() => closeAllSheets(true))) return false;
  }

  const openSheets = [...document.querySelectorAll('.station-sheet.sheet-open')];
  const dropMenu   = document.getElementById('dropMenu');
  if (dropMenu) { dropMenu.classList.remove('show'); dropMenu.hidden = true; }

  if (!openSheets.length) { 
    if (sheetOverlay) sheetOverlay.classList.remove('overlay-visible'); 
    return; 
  }

  const topSheet = openSheets[openSheets.length - 1];
  if (typeof MetroApp.animateSheetClose === 'function') {
    MetroApp.animateSheetClose(topSheet, () => {
      openSheets.forEach(el => el.classList.remove('sheet-open'));
      if (sheetOverlay) sheetOverlay.classList.remove('overlay-visible');
    });
  } else {
    openSheets.forEach(el => el.classList.remove('sheet-open'));
    if (sheetOverlay) sheetOverlay.classList.remove('overlay-visible');
  }
}
// ══ ОНОВЛЕННЯ ПОТОЧНОЇ КАРТКИ ══
MetroApp.refreshCurrentStation = function() {
  if (!state.currentStationSlug) return;
  if (typeof MetroApp.applyExitLabels === 'function') MetroApp.applyExitLabels(state.stationsData);
  const s = state.stationsData?.[state.currentStationSlug];
  if (!s || !sheet.classList.contains('sheet-open')) return;

  const color = MetroApp.LINE_COLOR[s.line] || 'var(--text-muted)';
  const prevScrollTop = sheetBody.scrollTop;

  stationTitleMain.textContent = s.name;
  sheetBody.innerHTML = `${renderDirections(s, color)}`;

  sheetBody.querySelectorAll('.nav-label').forEach(el => {
    const target = slugByName(el.dataset.name || '');
    if (target && target !== state.currentStationSlug) {
      el.classList.add('nav-link');
      el.setAttribute('role', 'button');
      el.setAttribute('tabindex', '0');
    }
  });

  attachExitFavListeners(sheetBody, state.currentStationSlug, color);
  attachDevModeUI(sheetBody, state.currentStationSlug);
  sheet.querySelector('.row-checkin-btn')?.remove();
  MetroApp.attachCheckinButtons?.(sheet, state.currentStationSlug, color);
  sheetBody.scrollTop = prevScrollTop;
};

// ══ ДОПОМІЖНІ ФУНКЦІЇ ДЛЯ КОЛЬОРІВ ТА АНІМАЦІЇ ══
const getThemeColors = () => {
  const rs = getComputedStyle(document.documentElement);
  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  return {
    red:   rs.getPropertyValue('--line-red').trim()   || "#c8523a",
    blue:  rs.getPropertyValue('--line-blue').trim()  || "#5b9bd5",
    green: rs.getPropertyValue('--line-green').trim() || "#5aaa6a",
    base:  rs.getPropertyValue('--bg-card').trim()    || (isLight ? "#ffffff" : "#2c2c2e")
  };
};

const hexToRgb = (hex) => {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const lerp = (a, b, t) => Math.round(a + (b - a) * t);
const mixColors = (colorHex, baseHex, t) => {
  const [r1, g1, b1] = hexToRgb(colorHex);
  const [r2, g2, b2] = hexToRgb(baseHex);
  return `rgb(${lerp(r2, r1, t)},${lerp(g2, g1, t)},${lerp(b2, b1, t)})`;
};

const LOGOS = [
  // 0. ТВОЄ АВТОРСЬКЕ ЛОГО v2 (Оригінал для циклу)
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 26 26" id="aboutLogoImg">
    <g style="fill: var(--line-green); fill-opacity:1">
      <path d="M49.904 120.033h10v10h-10z" style="fill: var(--line-green); stroke-width:.10117" transform="matrix(.3355 0 0 1 -3.751 -117.033)"/>
      <path d="M59.82 120.033h10v10h-10z" style="fill: var(--line-green); stroke-width:.10117" transform="matrix(.3355 0 0 1 -3.751 -117.033)"/>
      <path d="M69.736 120.033h10v10h-10z" style="fill: var(--line-green); stroke-width:.10117" transform="matrix(.3355 0 0 1 -3.751 -117.033)"/>
    </g>
    <g style="fill: var(--line-blue); fill-opacity:1">
      <path d="M62.836 114.963H82.78v8H62.836z" style="fill: var(--line-blue); stroke-width:.127791" transform="matrix(.50098 0 0 1.25 -28.48 -140.705)"/>
    </g>
    <g style="fill: var(--line-green); fill-opacity:1">
      <path d="M144.141 82.952h14.995v2.314h-14.995z" style="fill: var(--line-green); stroke-width:.0595893" transform="matrix(.33374 0 0 2.16109 -40.118 -176.267)"/>
      <path d="M144.141 82.952h14.995v2.314h-14.995z" style="fill: var(--line-green); stroke-width:.0595893" transform="matrix(.33374 0 0 6.48327 -35.122 -529.802)"/>
    </g>
    <path d="M96.983 35h5v5h-5z" style="fill: var(--line-blue); stroke-width:.0505852" transform="matrix(1.00085 0 0 1 -84.074 -32)"/>
    <path d="M91.983 40h5v15h-5z" style="fill: var(--line-blue); stroke-width:.0876163" transform="matrix(1.00085 0 0 1 -84.074 -32)"/>
  </svg>`,

  // 1. ЧЕРВОНО-ЗЕЛЕНА ПАСХАЛКА
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-0.82 -0.82 6.93 6.93" id="aboutLogoImg">
    <path d="M132.557 112.715h5.292v1.323h-5.292z" style="fill: var(--line-red);" transform="translate(-132.556 -110.067)"/>
    <g><path d="M190.554 82.982h14.974v2.314h-14.974z" style="fill: var(--line-green);" transform="matrix(.08834 0 0 .57185 -16.834 -44.805)"/></g>
    <g><path d="M190.554 82.982h14.974v2.314h-14.974z" style="fill: var(--line-green);" transform="matrix(.17669 0 0 .57185 -33.668 -47.453)"/></g>
    <g><path d="M49.904 120.033h10v10h-10z" style="fill: var(--line-green);" transform="matrix(.52917 0 0 .13256 -26.408 -14.586)"/></g>
    <g><path d="M25.38 77.668h14.995v2.314H25.38Z" style="fill: var(--line-red);" transform="matrix(.08827 0 0 .57285 -2.24 -43.166)"/></g>
    <g><path d="M25.38 77.668h14.995v2.314H25.38Z" style="fill: var(--line-red);" transform="matrix(.08827 0 0 1.14398 -.92 -86.203)"/></g>
    <g><path d="M120.43 105.01h5v5.001h-5z" style="fill: var(--line-red);" transform="matrix(.52913 0 0 .26507 -63.723 -23.866)"/></g>
    <g><path d="M190.554 82.982h14.974v2.314h-14.974z" style="fill: var(--line-green);" transform="matrix(.08834 0 0 1.14573 -15.514 -95.075)"/></g>
  </svg>`,

  // 2. СИНЬО-ЧЕРВОНА ПАСХАЛКА
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-0.82 -0.82 6.93 6.93" id="aboutLogoImg">
    <path d="M0 2.646h5.292v1.323H0Z" style="fill: var(--line-red);"/>
    <g><path d="M25.38 77.668h14.995v2.314H25.38Z" style="fill: var(--line-red);" transform="matrix(.17645 0 0 .57179 -1.832 -40.44)"/> </g>
    <path d="M159.544 125.677h5.29V127h-5.29z" style="fill: var(--line-blue);" transform="translate(-159.544 -124.354)"/>
    <g><path d="M25.38 77.668h14.995v2.314H25.38Z" style="fill: var(--line-red);" transform="matrix(.08823 0 0 .57179 1.73 -43.087)"/></g>
    <path d="M163.513 127h1.323v1.323h-1.323z" style="fill: var(--line-blue);" transform="translate(-159.544 -124.354)"/>
    <path d="M162.189 124.354h2.646v1.323h-2.646z" style="fill: var(--line-blue);" transform="translate(-159.544 -124.354)"/>
    <g><path d="M25.38 77.668h14.995v2.314H25.38Z" style="fill: var(--line-red);" transform="matrix(.08823 0 0 1.14374 .413 -86.186)"/></g>
  </svg>`
];

const HANDLE_GRADIENTS = [
  'linear-gradient(to right, var(--line-green) 50%, var(--line-blue) 50%)', 
  'linear-gradient(to right, var(--line-red) 50%, var(--line-green) 50%)', 
  'linear-gradient(to right, var(--line-blue) 50%, var(--line-red) 50%)'
];

// ══ ФУНКЦІЯ САЛЮТУ-ПОДЯКИ (ДЛЯ BETA-ФОРМИ ТА MONO) ══
function bindBottomLoader(aboutSheet) {
  const supportCard = aboutSheet.querySelector('.about-support-card');
  if (!supportCard) return;

  let overlay = supportCard.querySelector('#supportLoaderWrap');
  if (!overlay) {
    supportCard.style.position = 'relative';
    supportCard.style.overflow = 'hidden';
    
    overlay = document.createElement('div');
    overlay.id = 'supportLoaderWrap';
    overlay.style.cssText = 'display: none; position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: var(--bg-card); border-radius: inherit; z-index: 10; justify-content: center; align-items: center; flex-direction: row; opacity: 0; transition: opacity 0.3s ease;';
    
    overlay.innerHTML = `
      <div id="saluteTextLeft" style="flex: 1; text-align: right; font-size: 14px; font-weight: 500; color: var(--text-muted); font-variant: small-caps; letter-spacing: 0.04em; transition: opacity 1s ease;"></div>
      
      <svg version="1.1" viewBox="-4 -4 44.3 45.1" style="width: 100px; height: 100px; overflow: visible; flex-shrink: 0; margin: 0 10px;">
        <g transform="translate(-162.85484,-126.18087)">
          <g transform="translate(32.460036,2.9988233)">
            <g class="eggPetals" transform="matrix(0.60937788,0,0,0.62637748,2.7606092,-11.401414)">
              <path class="st4" d="m 239.25,232.16 c 2.9,0 5.7,-2.9 5,-8 -0.6,-4.8 -3.3,-8.9 -5,-9.3 -1.9,0.5 -4.4,4.7 -5,9.3 -0.5,5.1 2.1,8 5,8 z" />
              <path class="st4" d="m 226.85,244.46 c 0,-2.9 -2.9,-5.6 -8,-4.9 -4.9,0.6 -9,3.3 -9.4,4.9 0.5,1.9 4.7,4.4 9.4,4.9 5.1,0.6 8,-2 8,-4.9 z" />
              <path class="st4" d="m 239.25,256.76 c -2.9,0 -5.6,2.9 -5,8 0.6,4.8 3.3,8.9 5,9.3 1.9,-0.5 4.4,-4.7 5,-9.3 0.6,-5.1 -2.1,-8 -5,-8 z" />
              <path class="st4" d="m 251.65,244.46 c 0,-2.9 2.9,-5.6 8,-4.9 4.9,0.6 9,3.3 9.4,4.9 -0.5,1.9 -4.7,4.4 -9.4,4.9 -5.1,0.6 -8,-2 -8,-4.9 z" />
              <path class="st4" d="m 230.45,235.76 c 2.1,-2 2,-6 -2.2,-9.1 -3.9,-3 -8.7,-4 -10.2,-3.1 -1,1.7 0.2,6.4 3.1,10.1 3.4,4 7.3,4.1 9.3,2.1 z" />
              <path class="st4" d="m 230.45,253.16 c -2.1,-2 -6,-1.9 -9.2,2.2 -3,3.9 -4,8.7 -3.1,10.1 1.7,1 6.5,-0.2 10.2,-3.1 4,-3.3 4.2,-7.2 2.1,-9.2 z" />
              <path class="st4" d="m 248.05,253.16 c 2.1,-2 6,-1.9 9.2,2.2 3,3.9 4,8.7 3.1,10.1 -1.7,1 -6.5,-0.2 -10.2,-3.1 -4,-3.3 -4.2,-7.2 -2.1,-9.2 z" />
              <path class="st4" d="m 248.05,235.76 c -2.1,-2 -2,-6 2.2,-9.1 -3.9,-3 8.7,-4 10.2,-3.1 1,1.7 -0.2,6.4 -3.1,10.1 -3.4,4 -7.3,4.1 -9.3,2.1 z" />
              <path class="st4" d="m 227.95,217.46 c 2.1,-0.9 4.2,-1.3 4.8,1.4 0.5,2.5 -0.6,5.3 -1.7,6 -1.5,0.3 -4.1,-1 -5.5,-3 -1.4,-2.4 0.3,-3.6 2.4,-4.4 z" />
              <path class="st4" d="m 212.05,255.66 c -0.9,-2.1 -1.3,-4.2 1.4,-4.7 2.5,-0.5 5.4,0.6 6,1.7 0.3,1.5 -1,4.1 -3.1,5.4 -2.2,1.4 -3.5,-0.3 -4.3,-2.4 z" />
              <path class="st4" d="m 250.75,271.96 c 2.1,-0.9 3.9,-2.1 2.4,-4.4 -1.4,-2.1 -4.2,-3.3 -5.5,-3 -1.3,0.8 -2.2,3.6 -1.7,6 0.6,2.7 2.7,2.3 4.8,1.4 z" />
              <path class="st4" d="m 212.05,233.26 c 0.9,-2.1 2.1,-3.9 4.4,-2.4 2.2,1.4 3.4,4.2 3.1,5.4 -0.8,1.3 -3.6,2.2 -6,1.7 -2.8,-0.6 -2.4,-2.6 -1.5,-4.7 z" />
              <path class="st4" d="m 228.35,271.46 c -2.1,-0.9 -3.9,-2.1 -2.4,-4.4 1.4,-2.1 4.2,-3.3 5.5,-3 1.3,0.8 2.2,3.6 1.7,6 -0.6,2.7 -2.7,2.3 -4.8,1.4 z" />
              <path class="st4" d="m 250.55,217.46 c 2.1,0.9 3.9,2.1 2.4,4.4 -1.4,2.1 -4.2,3.3 -5.5,3 -1.3,-0.8 -2.2,-3.6 -1.7,-6 0.6,-2.7 2.7,-2.3 4.8,-1.4 z" />
              <path class="st4" d="m 266.45,233.26 c -0.9,-2.1 -2.1,-3.9 -4.4,-2.4 -2.2,1.4 -3.4,4.2 -3.1,5.4 0.8,1.3 3.6,2.2 6,1.7 2.8,-0.6 2.4,-2.6 1.5,-4.7 z" />
              <path class="st4" d="m 266.45,255.66 c 0.9,-2.1 1.3,-4.2 -1.4,-4.7 -2.5,-0.5 -5.4,0.6 -6,1.7 -0.3,1.5 1,4.1 3.1,5.4 2.2,1.4 3.5,-0.3 4.3,-2.4 z" />
            </g>
            <path class="eggCenter" d="m 155.49793,141.52659 c 0,3.8 -2.9,6.8 -6.4,6.8 -3.6,0 -6.4,-3 -6.4,-6.8 v 0 c 0,-3.8 2.9,-6.8 6.4,-6.8 3.5,0 6.4,3.1 6.4,6.8 z" style="fill: var(--line-red)"/>
          </g>
        </g>
      </svg>
      
      <div id="saluteTextRight" style="flex: 1; text-align: left; font-size: 14px; font-weight: 500; color: var(--text-muted); font-variant: small-caps; letter-spacing: 0.04em; transition: opacity 1s ease;"></div>
    `;
    supportCard.appendChild(overlay);
  }

  const form = aboutSheet.querySelector('#aboutBetaForm');
  const input = aboutSheet.querySelector('.about-beta-input');
  const monoBtn = aboutSheet.querySelector('.about-donate-btn-mono');
  
  const textLeft = overlay.querySelector('#saluteTextLeft');
  const textRight = overlay.querySelector('#saluteTextRight');
  let saluteTimer = null;
  let animTimer = null;
  let centerTimer = null;

  function stopSalute() {
    overlay.style.opacity = '0';
    setTimeout(() => {
      overlay.style.display = 'none';
      textLeft.style.opacity = '1';
      textRight.style.opacity = '1';
      clearTimeout(animTimer);
      cancelAnimationFrame(centerTimer);
    }, 300);
  }

  function startSalute(leftStr, rightStr) {
    clearTimeout(saluteTimer); 
    
    textLeft.innerHTML = leftStr;
    textRight.innerHTML = rightStr;
    textLeft.style.opacity = '1';
    textRight.style.opacity = '1';
    
    overlay.style.display = 'flex';
    void overlay.offsetWidth; 
    overlay.style.opacity = '1';

    const THEME_COLORS = getThemeColors();
    const petalsUnsorted = Array.from(overlay.querySelectorAll('.st4'));
    const center = overlay.querySelector('.eggCenter');

    const centerBox = center.getBoundingClientRect();
    const centerX = centerBox.left + centerBox.width / 2;
    const centerY = centerBox.top + centerBox.height / 2;

    const petals = petalsUnsorted.map(petal => {
      const box = petal.getBoundingClientRect();
      const x = box.left + box.width / 2;
      const y = box.top + box.height / 2;
      let angle = Math.atan2(y - centerY, x - centerX) * 180 / Math.PI;
      return { element: petal, angle: (angle + 90 + 360) % 360 };
    }).sort((a, b) => a.angle - b.angle).map(p => p.element);

    let cycle = parseInt(Storage.get('LOGO_EGG_CYCLE') || 0);
    Storage.set('LOGO_EGG_CYCLE', cycle + 1);

    const SCHEMES = [
      { center: THEME_COLORS.red,   petals: [THEME_COLORS.blue, THEME_COLORS.green] },
      { center: THEME_COLORS.blue,  petals: [THEME_COLORS.red, THEME_COLORS.green] },
      { center: THEME_COLORS.green, petals: [THEME_COLORS.red, THEME_COLORS.blue] }
    ];
    const activeScheme = SCHEMES[cycle % 3];

    petals.forEach(p => { 
      p.style.fill = THEME_COLORS.base; 
      p.style.transition = "fill 0.25s ease"; 
    });

    const runPetalAnim = () => {
      if (overlay.style.display === 'none') return; 
      const pIdx = Math.floor(Math.random() * petals.length);
      const p = petals[pIdx];
      const c = activeScheme.petals[pIdx % 2]; 
      
      p.style.fill = mixColors(c, THEME_COLORS.base, 0.85);
      setTimeout(() => { p.style.fill = THEME_COLORS.base; }, 400); 
      animTimer = setTimeout(runPetalAnim, 180 + Math.random() * 250); 
    };

    const runCenterAnim = () => {
      if (overlay.style.display === 'none') return;
      const phase = (Date.now() / 1000) % 1.2; 
      const intensity = 0.35 + Math.abs(Math.sin(phase * Math.PI)) * 0.65;
      center.style.fill = mixColors(activeScheme.center, THEME_COLORS.base, intensity);
      centerTimer = requestAnimationFrame(runCenterAnim);
    };

    runPetalAnim();
    runCenterAnim();

    // Плавно ховаємо текст через 2 секунди
    setTimeout(() => {
      if (overlay.style.display !== 'none') {
        textLeft.style.opacity = '0';
        textRight.style.opacity = '0';
      }
    }, 2000);

    // Повністю ховаємо салют через 10 секунд
    saluteTimer = setTimeout(() => {
      stopSalute();
    }, 10000);
  }

  // Обробка Beta-форми
  if (form && input) {
    form.onsubmit = (e) => {
      e.preventDefault();
      const val = input.value.trim();
      const isValid = val.length >= 3 && /^[a-zA-Z0-9.]+$/.test(val);
      
      if (isValid) {
        input.blur();
        // Перехід на окрему сторінку
        window.location.href = 'thanks.html?type=beta';
      } else {
        const originalColor = input.style.color;
        input.style.color = "var(--line-red)";
        setTimeout(() => input.style.color = originalColor, 1500);
      }
    };
  }

  // Обробка Monobank-кнопки
  if (monoBtn) {
    monoBtn.addEventListener('click', () => {
      startSalute('Дякуємо', 'за підтримку!');
    });
  }
}

export function openAboutSheet() {
  let aboutSheet = document.getElementById('aboutSheet');
  if (!aboutSheet) {
    aboutSheet = document.createElement('div');
    aboutSheet.id        = 'aboutSheet';
    aboutSheet.className = 'station-sheet about-station-sheet';
    const template = document.getElementById('tpl-about-sheet');
    aboutSheet.appendChild(template.content.cloneNode(true));
    document.body.appendChild(aboutSheet);

    document.getElementById('aboutClose').addEventListener('click', () => {
      MetroApp.animateSheetClose(aboutSheet, () => {
        aboutSheet.classList.remove('sheet-open');
        if (!document.querySelectorAll('.station-sheet.sheet-open').length)
          sheetOverlay.classList.remove('overlay-visible');
      });
    });

    setupDevModeTapCounter(aboutSheet);
  }

  let logoState = Storage.get(STORAGE_KEYS.LOGO_STATE); 
  
  function updateLogo() {
    const logoEl = aboutSheet.querySelector('#aboutLogoImg');
    const handleEl = aboutSheet.querySelector('.sheet-handle');
    if (!logoEl) return;
    
    let currentIdx = 0;
    if (logoState !== null) {
      currentIdx = parseInt(logoState);
      if (isNaN(currentIdx) || currentIdx >= LOGOS.length || currentIdx < 0) {
        currentIdx = 0;
        Storage.set(STORAGE_KEYS.LOGO_STATE, 0);
      }
      
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = LOGOS[currentIdx];
      const newLogo = tempDiv.firstChild;
      logoEl.replaceWith(newLogo);
    }
    
    if (handleEl) {
      handleEl.style.background = HANDLE_GRADIENTS[currentIdx];
    }
    
    const currentLogo = aboutSheet.querySelector('#aboutLogoImg');
    if (!currentLogo) return;

    let taps = 0, tapTimer = null, lastTapTime = 0;

    currentLogo.addEventListener('click', (e) => {
      const now = Date.now();
      if (now - lastTapTime < 50) return;
      lastTapTime = now;
      taps++;
      clearTimeout(tapTimer);

      if (taps >= 3) {
        taps = 0;
        logoState = (logoState === null) ? 1 : (parseInt(logoState) + 1) % LOGOS.length;
        Storage.set(STORAGE_KEYS.LOGO_STATE, logoState);
        updateLogo();
      } else {
        tapTimer = setTimeout(() => { taps = 0; }, 1000);
      }
    });
  }
  
  updateLogo();
  bindBottomLoader(aboutSheet);


// --- Обробка кнопок "i" для розкриття підказок (Акордеон + Колір + Смарт-скрол) ---
  const btnInfoAndroid = aboutSheet.querySelector('#btnInfoAndroid');
  const hintAndroid = aboutSheet.querySelector('#hintAndroid');
  const btnInfoIOS = aboutSheet.querySelector('#btnInfoIOS');
  const hintIOS = aboutSheet.querySelector('#hintIOS');

  function updateInfoBtnState(btn, isOpen) {
    if (!btn) return;
    if (isOpen) {
      btn.classList.add('info-btn-active');
    } else {
      btn.classList.remove('info-btn-active');
    }
  }

  // Розумний плавний скрол
  function scrollToHint(hintEl) {
    // Даємо трохи більше часу на рендер розгорнутого блоку
    setTimeout(() => {
      if (hintEl.hidden) return;
      const rect = hintEl.getBoundingClientRect();
      const sheetRect = aboutSheet.getBoundingClientRect();
      
      // Якщо підказка виходить за нижню межу шторки
      if (rect.bottom > sheetRect.bottom - 20) {
        hintEl.scrollIntoView({ behavior: 'smooth', block: 'end' });
      }
    }, 100); 
  }

  if (btnInfoAndroid && hintAndroid && btnInfoIOS && hintIOS) {
    btnInfoAndroid.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpening = hintAndroid.hidden;
      
      hintAndroid.hidden = !isOpening;
      updateInfoBtnState(btnInfoAndroid, isOpening);
      
      if (isOpening) {
        hintIOS.hidden = true;
        updateInfoBtnState(btnInfoIOS, false);
        scrollToHint(hintAndroid); // Викликаємо перевірку скролу
      }
    });

    btnInfoIOS.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpening = hintIOS.hidden;
      
      hintIOS.hidden = !isOpening;
      updateInfoBtnState(btnInfoIOS, isOpening);
      
      if (isOpening) {
        hintAndroid.hidden = true;
        updateInfoBtnState(btnInfoAndroid, false);
        scrollToHint(hintIOS); // Викликаємо перевірку скролу
      }
    });
  }

MetroApp.pushSheetHistory?.();
  document.querySelectorAll('.station-sheet').forEach(el => el.classList.remove('sheet-open'));
  aboutSheet.classList.add('sheet-open', 'sheet-fullscreen', 'sheet-scrollable');
  sheetOverlay.classList.add('overlay-visible');
}
// ════════════════════════════════════════════════════════════
// ══ ОБРОБНИКИ ПОДІЙ (ВІДНОВЛЕНО ПОВНІСТЮ) ══
// ════════════════════════════════════════════════════════════

if (sheetClose) {
  sheetClose.addEventListener('click', () => closeAllSheets());
}

if (sheetOverlay) {
  sheetOverlay.addEventListener('click', e => {
    if (e.target !== sheetOverlay) return;
    if (dropMenuEl?.classList.contains('show')) return;

    // Магія "пробивання" кліку крізь оверлей на карту
    sheetOverlay.style.pointerEvents = 'none';
    const elUnder = document.elementFromPoint(e.clientX, e.clientY);
    sheetOverlay.style.pointerEvents = '';

    const zone = elUnder?.closest('[id]');
    if (zone?.id) {
      const rawId = zone.id.replace(/\d+$/, '').toLowerCase();
      const slug  = MetroApp.SLUG_BY_LOWER[rawId];
      if (slug && slug !== state.currentStationSlug) { 
        openStation(slug); 
        return; // ⬅️ ВАЖЛИВО: не закриваємо, а одразу відкриваємо нову!
      }
    }
    closeAllSheets();
  });
}

if (sheetBody) {
  sheetBody.addEventListener('click', e => {
    const navLabel = e.target.closest('.nav-label');
    if (navLabel) {
      const target = slugByName(navLabel.dataset.name || '');
      if (target && target !== state.currentStationSlug) {
        e.stopPropagation();
        openStation(target); // Безшовний перехід по пересадках
      }
    }
  });
}

// Слухач для кнопки "Вибране" (сердечко) у шапці картки
const mainFavBtn = sheet.querySelector('.fav-btn-bar');
if (mainFavBtn) {
  mainFavBtn.addEventListener('click', e => {
    const btn = e.currentTarget, slug = btn.dataset.slug;
    if (!slug) return;
    const nowFav = toggleFav(slug);
    btn.innerHTML = heartSvg(nowFav, slug, btn.dataset.color || 'var(--text-muted)');
    btn.classList.toggle('fav-active', nowFav);
  });
}

// Додаємо свайп вниз для основної картки станції
if (window.MetroApp && typeof MetroApp.initKinematicSwipe === 'function') {
  MetroApp.initKinematicSwipe(sheet, sheetBody, () => closeAllSheets());
}

