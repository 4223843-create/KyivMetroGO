import { state }               from '../core/state.js';
import { STORAGE_KEYS, Storage } from '../core/storage.js';
import { TIMING }              from '../core/timing.js';
import { pill, heartSvg }      from '../ui/components.js';
import { slugByName }          from '../data/stations.js';
import { applyExitLabels }     from '../data/localEdits.js';
import {
  isFav, getExitFavs, isExitFav, toggleExitFav, replaceExitFav,
} from '../features/favorites.js';
import { attachDevModeUI }     from '../features/devmode.js';

const sheet            = document.getElementById('stationSheet');
const sheetBody        = document.getElementById('sheetBody');
const sheetOverlay     = document.getElementById('sheetOverlay');
const stationTitleMain = document.getElementById('stationTitleMain');

// ══ ФОРМАТУВАННЯ ══
function formatDirLabel(raw) {
  if (!raw) return raw;
  const match = raw.trim().match(/^([^\s&]+)(?:\s+|&nbsp;)(.*)$/i);
  if (!match) return raw;
  return `${match[1].toLowerCase()} <span class="dir-name-caps">${match[2]}</span>`;
}

function formatLabel(raw) {
  const text      = raw.trim();
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
    const p = positions[0];
    const isMulti    = String(p.wagon).includes(',');
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

  const renderExitLabel = (exit) => {
    if (!exit.label) return '';
    
    const editedMark = exit._labelEdited ? `<span class="pos-edited-mark label-pencil" data-slug="${exit._slug}">${MetroApp.Icons.pencil}</span>` : '';
    
    return `<div class="exit-label nav-label" data-name="${exit.label}">
              <div style="position: relative; display: inline-flex; align-items: center; justify-content: center;">
                ${formatLabel(exit.label)}
                ${editedMark}
              </div>
            </div>`;
  };

  if (isKhreshchatyk) {
    const mainDirs = s.directions.filter(d => d.from !== '__long_transfer__');
    const longDir  = s.directions.find(d => d.from === '__long_transfer__');
    
    const mainHtml = mainDirs.map(dir => `
      <div class="direction-block">
        <div class="direction-label nav-label" data-name="${dir.from}">${formatDirLabel(dir.from)}</div>
        ${dir.exits.map(exit => `${renderExitLabel(exit)}${renderPositions(exit.positions, color, true)}`).join('')}
      </div>`).join('');
      
    let longHtml = '';
    if (longDir) {
      const rows = longDir.exits.map(exit => {
        const posRows = exit.positions.map(p =>
          `<div class="long-transfer-pos-row">${pill('вагон', p.wagon, color)}${pill('двері', p.doors, color)}</div>`
        ).join('');
        const editedMark = exit._labelEdited ? `<span class="pos-edited-mark" data-slug="${exit._slug}">${MetroApp.Icons.pencil}</span>` : '';
        return `<div class="long-transfer-exit"><div class="long-transfer-exit-label" style="position: relative;">${editedMark}${exit.label}</div>${posRows}</div>`;
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
          ${dir.exits.map(exit => `${renderExitLabel(exit)}${renderPositions(exit.positions, color, false)}`).join('')}
        </div>`;
    }
    return `<div class="direction-block">
      <div class="direction-label nav-label" data-name="${dir.from}">${formatDirLabel(dir.from)}</div>
      ${dir.exits.map(exit => `${renderExitLabel(exit)}${renderPositions(exit.positions, color, false)}`).join('')}
    </div>`;
  }).join('');
}

function applyFavPillStyles(container, lineColor, isFaved) {
  container.querySelectorAll('.pos-pill').forEach(p => {
    p.style.background = isFaved ? lineColor : '';
    const num = p.querySelector('.pos-pill-num');
    const lbl = p.querySelector('.pos-pill-label');
    if (num) num.style.color = isFaved ? 'var(--bg)' : lineColor;
    if (lbl) lbl.style.color = isFaved ? 'var(--bg)' : '';
  });
}

function showExitReplaceConfirm(row, existing, slug, dirLabel, newWagon, newDoors, lineColor) {
  document.querySelectorAll('.exit-replace-confirm').forEach(el => {
    el.classList.remove('exit-replace-open');
    setTimeout(() => el.remove(), 280);
  });
  const confirmEl = document.createElement('div');
  confirmEl.className = 'exit-replace-confirm';
  confirmEl.innerHTML =
    `<p class="exit-replace-text">Ви вже додали до&nbsp;<span style="font-variant:small-caps;letter-spacing:0.04em">Вибраного</span> інший вихід з&nbsp;цієї станції. Замінити на цей?</p>` +
    `<div class="exit-replace-btns"><button class="exit-replace-btn confirm-btn-save">Замінити</button><button class="exit-replace-btn confirm-btn-discard">Скасувати</button></div>`;
  row.after(confirmEl);
  requestAnimationFrame(() => confirmEl.classList.add('exit-replace-open'));

  const close = () => { confirmEl.classList.remove('exit-replace-open'); setTimeout(() => confirmEl.remove(), 280); };
  confirmEl.querySelector('.confirm-btn-save').addEventListener('click', e => {
    e.stopPropagation();
    replaceExitFav(slug, dirLabel, existing.wagon, existing.doors, newWagon, newDoors);
    close();
    MetroApp.refreshCurrentStation?.();
  });
  confirmEl.querySelector('.confirm-btn-discard').addEventListener('click', e => { e.stopPropagation(); close(); });
}






function attachExitFavListeners(container, slug, lineColor) {
  
  container.querySelectorAll('.pos-edited-mark').forEach(pencilBtn => {
    pencilBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const editSlug = pencilBtn.dataset.slug;
      if (!editSlug) return;
      
      MetroApp.animateSheetClose?.(document.getElementById('stationSheet'), () => {
        document.getElementById('stationSheet').classList.remove('sheet-open');
        MetroApp.openFeedbackSheet?.();
        
        setTimeout(() => {
          const stationItem = document.querySelector(`.fb-station-item[data-slug="${editSlug}"]`);
          if (stationItem) stationItem.click();
        }, 50);
      });
    });
  });

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
          Storage.set(STORAGE_KEYS.CHECKIN_HINT_SEEN, 'true');
          const hint = document.createElement('div');
          hint.id = 'checkinHint';
          hint.className = 'onboarding-hint';
          hint.innerHTML = `<span class="hint-icon-wrap" style="color:${lineColor}">${MetroApp.Icons.info}</span>Натисніть на&nbsp;шпильку, щоб&nbsp;позначити вихід зі&nbsp;станції як&nbsp;відвіданий`;
          sheetBodyEl.insertBefore(hint, sheetBodyEl.firstChild);
        }
        const onboardingHint = document.getElementById('onboardingHint');
        if (onboardingHint) MetroApp.dismissHintWithDoors(onboardingHint, insertCheckinHint);
        else insertCheckinHint();
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

    // === ДОДАНИЙ КОД ДЛЯ ОЛІВЦЯ ===
    const pencilBtn = row.querySelector('.pos-edited-mark');
    if (pencilBtn) {
      pencilBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const editSlug = pencilBtn.dataset.slug;
        if (!editSlug) return;
        
        MetroApp.animateSheetClose?.(document.getElementById('stationSheet'), () => {
          document.getElementById('stationSheet').classList.remove('sheet-open');
          MetroApp.openFeedbackSheet?.();
          
          setTimeout(() => {
            const stationItem = document.querySelector(`.fb-station-item[data-slug="${editSlug}"]`);
            if (stationItem) stationItem.click();
          }, 50);
        });
      });
    }
    // ==============================

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

// ══ ВІДКРИТТЯ СТАНЦІЇ ══
export function openStation(slug) {
  // withUnsavedCheck re-imported via sheetsManager to avoid circular dep
  const proceed = () => actualOpenStation(slug);
  if (MetroApp.hasUnsavedFeedback?.()) {
    const _fbSlug = document.getElementById('fbStation')?.value || '';
    const stationName = (_fbSlug ? state.stationsData?.[_fbSlug]?.name : '') || '';
    const question = stationName
      ? `Зберегти зміни для станції <span style="white-space:nowrap">${stationName}?</span>`
      : 'Зберегти зміни?';
    MetroApp.showCustomConfirm?.(question,
      () => { MetroApp.triggerFeedbackSubmit?.(true); MetroApp.fbUnsaved = false; proceed(); },
      () => { MetroApp.fbUnsaved = false; proceed(); },
      () => {}
    );
    return;
  }
  proceed();
}

function actualOpenStation(slug) {
  if (!state.stationsData?.[slug]) return;
  state.currentStationSlug = slug;

  MetroApp.dismissFavOnlyHint?.();
  const s     = state.stationsData[slug];
  const color = MetroApp.LINE_COLOR[s.line] || 'var(--text-muted)';
  const fav   = isFav(slug);

  let hideInfoBlocks = false;
  try { hideInfoBlocks = localStorage.getItem('metro_hide_info_blocks') === 'true'; } catch(e) {}

  const onboardingHtml = (!hideInfoBlocks && getExitFavs().length === 0)
    ? `<div class="onboarding-hint" id="onboardingHint"><span class="hint-icon-wrap" style="color:${color}">${MetroApp.Icons.info}</span>Натисніть двічі на вагон та двері, щоб зберегти вихід</div>`
    : '';

  document.getElementById('stationTitleMain').textContent = s.name;

  const hasDirections  = s.directions?.length > 0;
  const allExitsClosed = hasDirections && !s.directions.some(dir =>
    dir.exits?.some(exit => exit.positions?.some(pos => !pos.closed))
  );

  if (!hasDirections) {
    sheetBody.innerHTML = `<p class="fav-empty-text" style="text-align:center;margin:40px 0 0 0;width:100%;">Дані про виходи відсутні</p>`;
  } else if (allExitsClosed) {
    sheetBody.innerHTML = `<p class="fav-empty-text" style="text-align:center;margin:40px 0 0 0;width:100%;">Усі виходи закриті</p>`;
  } else {
    sheetBody.innerHTML = `${onboardingHtml}${renderDirections(s, color)}`;
  }

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
  attachDevModeUI(sheetBody, slug);
  sheet.querySelector('.row-checkin-btn')?.remove();
  MetroApp.attachCheckinButtons?.(sheet, slug, color);
}

// ══ ОНОВЛЕННЯ ПОТОЧНОЇ КАРТКИ ══
export function refreshCurrentStation() {
  if (!state.currentStationSlug) return;
  applyExitLabels(state.stationsData);
  const s = state.stationsData?.[state.currentStationSlug];
  if (!s || !sheet.classList.contains('sheet-open')) return;

  const color         = MetroApp.LINE_COLOR[s.line] || 'var(--text-muted)';
  const prevScrollTop = sheetBody.scrollTop;

  stationTitleMain.textContent = s.name;
  sheetBody.innerHTML = renderDirections(s, color);

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
}

// Реєструємо на MetroApp для devmode.js і feedback.js
MetroApp.refreshCurrentStation = refreshCurrentStation;
