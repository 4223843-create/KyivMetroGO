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
          if (Storage.get(STORAGE_KEYS.HIDE_INFO_BLOCKS) === 'true') return;
          if (Storage.get(STORAGE_KEYS.CHECKIN_HINT_SEEN) === 'true') return;
          const sheetBodyEl = document.getElementById('sheetBody');
          if (!sheetBodyEl || document.getElementById('checkinHint')) return;
          
          const checkinHint = document.createElement('div');
          checkinHint.id = 'checkinHint';
          checkinHint.className = 'onboarding-hint';
          checkinHint.innerHTML = `<span class="hint-icon-wrap" style="color:${lineColor}">${MetroApp.Icons.info}</span>Натисніть на&nbsp;шпильку, щоб&nbsp;позначити вихід зі&nbsp;станції як&nbsp;відвіданий`;
          
          sheetBodyEl.insertBefore(checkinHint, sheetBodyEl.firstChild);
        }

        const onboardingHint = document.getElementById('onboardingHint');
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
    MetroApp.pushSheetHistory();
    state.currentStationSlug = slug;
    const s     = state.stationsData[slug];
    const color = MetroApp.LINE_COLOR[s.line] || 'var(--text-muted)';
    const fav   = isFav(slug);

    const hideInfoBlocks = Storage.get(STORAGE_KEYS.HIDE_INFO_BLOCKS) === 'true';
    const onboardingHtml = (!hideInfoBlocks && getExitFavs().length === 0)
      ? `<div class="onboarding-hint" id="onboardingHint"><span class="hint-icon-wrap" style="color:${color}">${MetroApp.Icons.info}</span>Натисніть двічі на вагон та двері, щоб зберегти вихід</div>`
      : '';

    stationTitleMain.textContent = s.name;

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
      sheetOverlay.classList.add('overlay-visible');
    }

    attachExitFavListeners(sheetBody, slug, color);
    attachDevModeUI(sheetBody, slug);
    sheet.querySelector('.row-checkin-btn')?.remove();
    MetroApp.attachCheckinButtons?.(sheet, slug, color);
  }
}

// ══ ЗАКРИТТЯ ВСІХ ШТОРОК ══
export function closeAllSheets(force = false) {
  if (!force) {
    if (withUnsavedCheck(() => closeAllSheets(true))) return false;
  }

  if (history.state?.isSheetOpen) {
    history.back(); 
    return; 
  }

  const openSheets = [...document.querySelectorAll('.station-sheet.sheet-open')];
  if (dropMenuEl) { dropMenuEl.classList.remove('show'); dropMenuEl.hidden = true; }

  if (!openSheets.length) { sheetOverlay?.classList.remove('overlay-visible'); return; }

  const topSheet = openSheets[openSheets.length - 1];
  MetroApp.animateSheetClose(topSheet, () => {
    openSheets.forEach(el => el.classList.remove('sheet-open'));
    sheetOverlay?.classList.remove('overlay-visible');
  });
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


const LOGOS = [
  // 1. ОРИГІНАЛЬНЕ ЛОГО
  `<img src="icon-96x96.png" id="aboutLogoImg" style="border-radius: 16px;">`,
  
  // 2. ПЕРША ПАСХАЛКА (Червоно-зелена)
  // Змінено viewBox для додавання внутрішнього відступу (щоб розмір збігався з PNG)
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-0.82 -0.82 6.93 6.93" id="aboutLogoImg">
    <path d="M132.557 112.715h5.292v1.323h-5.292z" style="fill:#c8523a;fill-opacity:1;stroke-width:.0267705" transform="translate(-132.556 -110.067)"/>
    <g style="fill:#c8523a;fill-opacity:1"><g style="fill:#5aaa6a;fill-opacity:1"><path d="M190.554 82.982h14.974v2.314h-14.974z" style="fill:#5aaa6a;fill-opacity:1;stroke-width:.0595478" transform="matrix(.08834 0 0 .57185 -16.834 -44.805)"/></g></g>
    <g style="fill:#c8523a;fill-opacity:1"><g style="fill:#5aaa6a;fill-opacity:1"><path d="M190.554 82.982h14.974v2.314h-14.974z" style="fill:#5aaa6a;fill-opacity:1;stroke-width:.0595478" transform="matrix(.17669 0 0 .57185 -33.668 -47.453)"/></g></g>
    <g style="stroke:none;paint-order:markers stroke fill"><path d="M49.904 120.033h10v10h-10z" style="fill:#5aaa6a;fill-opacity:1;stroke:none;paint-order:markers stroke fill" transform="matrix(.52917 0 0 .13256 -26.408 -14.586)"/></g>
    <g style="fill:#c8523a;fill-opacity:1"><path d="M25.38 77.668h14.995v2.314H25.38Z" style="fill:#c8523a;fill-opacity:1;stroke-width:.0595893" transform="matrix(.08827 0 0 .57285 -2.24 -43.166)"/></g>
    <g style="fill:#c8523a;fill-opacity:1"><path d="M25.38 77.668h14.995v2.314H25.38Z" style="fill:#c8523a;fill-opacity:1;stroke-width:.0595893" transform="matrix(.08827 0 0 1.14398 -.92 -86.203)"/></g>
    <g style="fill:#c8523a;fill-opacity:1"><path d="M120.43 105.01h5v5.001h-5z" style="fill:#c8523a;fill-opacity:1;stroke-width:.0505848" transform="matrix(.52913 0 0 .26507 -63.723 -23.866)"/></g>
    <g style="fill:#c8523a;fill-opacity:1"><g style="fill:#5aaa6a;fill-opacity:1"><path d="M190.554 82.982h14.974v2.314h-14.974z" style="fill:#5aaa6a;fill-opacity:1;stroke-width:.0595478" transform="matrix(.08834 0 0 1.14573 -15.514 -95.075)"/></g></g>
  </svg>`,

  // 3. ДРУГА ПАСХАЛКА (Синьо-червона)
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-0.82 -0.82 6.93 6.93" id="aboutLogoImg">
    <path d="M0 2.646h5.292v1.323H0Z" style="fill:#c8523a;fill-opacity:1;stroke-width:.0267733"/>
    <g style="fill:#c8523a;fill-opacity:1"><path d="M25.38 77.668h14.995v2.314H25.38Z" style="fill:#c8523a;fill-opacity:1;stroke-width:.0595893" transform="matrix(.17645 0 0 .57179 -1.832 -40.44)"/> </g>
    <path d="M159.544 125.677h5.29V127h-5.29z" style="fill:#5b9bd5;fill-opacity:1;stroke-width:.0267672" transform="translate(-159.544 -124.354)"/>
    <g style="fill:#c8523a;fill-opacity:1"><path d="M25.38 77.668h14.995v2.314H25.38Z" style="fill:#c8523a;fill-opacity:1;stroke-width:.0595893" transform="matrix(.08823 0 0 .57179 1.73 -43.087)"/></g>
    <path d="M163.513 127h1.323v1.323h-1.323z" style="fill:#5b9bd5;fill-opacity:1;stroke-width:.013384" transform="translate(-159.544 -124.354)"/>
    <path d="M162.189 124.354h2.646v1.323h-2.646z" style="fill:#5b9bd5;fill-opacity:1;stroke-width:.0189279" transform="translate(-159.544 -124.354)"/>
    <g style="fill:#c8523a;fill-opacity:1"><path d="M25.38 77.668h14.995v2.314H25.38Z" style="fill:#c8523a;fill-opacity:1;stroke-width:.0595893" transform="matrix(.08823 0 0 1.14374 .413 -86.186)"/></g>
  </svg>`
];

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

  // Пасхалка з логотипом
  let logoIdx = parseInt(Storage.get(STORAGE_KEYS.LOGO_STATE) || '0');
  


  
  function updateLogo() {
    const oldLogo = aboutSheet.querySelector('#aboutLogoImg') || aboutSheet.querySelector('img[src="icon-96x96.png"]');
    if (!oldLogo) return;
    
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = LOGOS[logoIdx];
    const newLogo = tempDiv.firstChild;
    oldLogo.replaceWith(newLogo);
    
    let taps = 0;
    let tapTimer = null;
    let lastTapTime = 0; // Захист від подвійних спрацьовувань

    newLogo.addEventListener('click', (e) => {
      const now = Date.now();
      if (now - lastTapTime < 50) return; // Ігноруємо фантомні кліки
      lastTapTime = now;

      taps++;
      clearTimeout(tapTimer);

      if (taps >= 3) {
        taps = 0;
        logoIdx = (logoIdx + 1) % LOGOS.length;
        Storage.set(STORAGE_KEYS.LOGO_STATE, logoIdx);
        updateLogo();
      } else {
        tapTimer = setTimeout(() => { taps = 0; }, 1000);
      }
    });
  }
  updateLogo();
  updateDevModeIndicator(aboutSheet, isDevMode());

  MetroApp.pushSheetHistory();
  document.querySelectorAll('.station-sheet').forEach(el => el.classList.remove('sheet-open'));
  aboutSheet.classList.add('sheet-open', 'sheet-fullscreen', 'sheet-scrollable');
  sheetOverlay.classList.add('overlay-visible');
}

// ══ EVENT LISTENERS ══
sheetClose.addEventListener('click', () => closeAllSheets());

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeAllSheets();
});

sheetBody.addEventListener('click', e => {
  const navLabel = e.target.closest('.nav-label');
  if (navLabel) {
    const target = slugByName(navLabel.dataset.name || '');
    if (target && target !== state.currentStationSlug) { e.stopPropagation(); openStation(target); return; }
  }

  const pencil = e.target.closest('.pos-edited-mark');
  if (pencil) {
    e.stopPropagation();
    const row  = pencil.closest('.position-row');
    const slug = pencil.dataset.slug;
    const idx  = pencil.dataset.idx;

    let panel = row.nextElementSibling;
    if (panel?.classList.contains('edit-info-panel')) {
      panel.classList.remove('panel-open');
      setTimeout(() => { if (!panel.classList.contains('panel-open')) panel.remove(); }, TIMING.PANEL_CLOSE);
      return;
    }

    document.querySelectorAll('.edit-info-panel').forEach(p => {
      p.classList.remove('panel-open');
      setTimeout(() => p.remove(), TIMING.PANEL_CLOSE);
    });

    panel = document.createElement('div');
    panel.className = 'edit-info-panel';
    panel.innerHTML = `<div class="fb-closed-note-wrap" style="pointer-events:auto;margin:4px 0 0"><span class="fb-closed-note">Значення змінено користувачем</span><button class="fb-restore-exit edit-info-cancel" style="pointer-events:auto" data-slug="${slug}" data-idx="${idx}">${MetroApp.Icons.undo}</button></div>`;
    row.after(panel);
    requestAnimationFrame(() => panel.classList.add('panel-open'));

    panel.querySelector('.edit-info-cancel').addEventListener('click', ev => {
      ev.stopPropagation();
      try {
        const edits = JSON.parse(Storage.get(STORAGE_KEYS.LOCAL_EDITS) || '{}');
        if (edits[slug]?.[idx]) {
          delete edits[slug][idx];
          if (!Object.keys(edits[slug]).length) delete edits[slug];
          Storage.set(STORAGE_KEYS.LOCAL_EDITS, JSON.stringify(edits));
          MetroApp.invalidateLocalEditsCache?.();
        }
        panel.classList.remove('panel-open');
        setTimeout(() => panel.remove(), TIMING.PANEL_CLOSE);
        MetroApp.reloadStationsData(true)
          .then(() => openStation(slug))
          .catch(() => MetroApp.showCustomConfirm?.('Помилка з\'єднання. Спробуйте ще раз.', () => {}, null, null));
      } catch (err) { console.error('edit reset failed', err); }
    });
  }
});

sheet.querySelector('.fav-btn-bar')?.addEventListener('click', e => {
  const btn   = e.currentTarget;
  const slug  = btn.dataset.slug;
  if (!slug) return;
  const color  = btn.dataset.color || 'var(--text-muted)';
  const nowFav = toggleFav(slug);
  btn.innerHTML = heartSvg(nowFav, slug, color);
  btn.classList.toggle('fav-active', nowFav);
});

sheetOverlay.addEventListener('click', e => {
  if (e.target !== sheetOverlay) return;
  if (dropMenuEl?.classList.contains('show')) return;

  sheetOverlay.style.pointerEvents = 'none';
  const elUnder = document.elementFromPoint(e.clientX, e.clientY);
  sheetOverlay.style.pointerEvents = '';

  const zone = elUnder?.closest('[id]');
  if (zone?.id) {
    const rawId = zone.id.replace(/\d+$/, '').toLowerCase();
    const slug  = MetroApp.SLUG_BY_LOWER[rawId];
    if (slug && slug !== state.currentStationSlug) { openStation(slug); return; }
  }
  closeAllSheets();
});

MetroApp.initKinematicSwipe(sheet, sheetBody, () => closeAllSheets());

MetroApp.openStation    = openStation;
MetroApp.closeAllSheets = closeAllSheets;
MetroApp.openAboutSheet = openAboutSheet;