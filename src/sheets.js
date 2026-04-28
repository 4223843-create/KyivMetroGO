import { state }                                          from './state.js';
import { STORAGE_KEYS, Storage } from './storage.js';
import { pill, heartSvg }                                 from './ui.js';
import { slugByName }                                     from './stations.js';
import { getFavs, isFav, toggleFav, getExitFavs,
         isExitFav, toggleExitFav, updateFavDock }        from './favorites.js';
import { isCheckinMode, openCheckinSheet }                 from './checkin.js';

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

  setTimeout(() => { el.remove(); onDone?.(); }, 200);
  setTimeout(() => { L.remove(); R.remove(); }, 600);
};
const sheet       = document.getElementById('stationSheet');
const sheetBody   = document.getElementById('sheetBody');
const sheetClose  = document.getElementById('sheetClose');
const sheetOverlay = document.getElementById('sheetOverlay');

// ══ ФОРМАТУВАННЯ НАПИСУ ВИХОДУ ══
function formatLabel(raw) {
  let text = raw.replace(/\u00a0/g, ' ').trim();
  const isTransfer = text.toLowerCase().includes('пересадка') || text.toLowerCase().includes('перехід');

  if (isTransfer) {
    const targetSlug = slugByName(text);
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
// ⚠️ Khreshchatyk-спецкейс збережено!
function renderDirections(s, color) {
  const isKhreshchatyk = s.slug === 'R.Khreshchatyk';

  if (isKhreshchatyk) {
    const mainDirs = s.directions.filter(d => d.from !== '__long_transfer__');
    const longDir  = s.directions.find(d => d.from === '__long_transfer__');

    const mainHtml = mainDirs.map(dir => `
      <div class="direction-block">
        <div class="direction-label nav-label" data-name="${dir.from}">${dir.from}</div>
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
    if (dir.from === 'вихід праворуч')
      return `<div class="direction-block direction-exit-right"><div class="direction-label">вихід праворуч</div></div>`;
    return `<div class="direction-block">
      <div class="direction-label nav-label" data-name="${dir.from}">${dir.from}</div>
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
      if (existing) { existing.classList.remove('fav-note-open'); setTimeout(() => existing?.remove(), 300); }
      if (!added) return;
      const pv = getPillValues(); if (!pv) return;
      const toast = document.createElement('div');
      toast.className = 'exit-fav-toast';
      toast.setAttribute('role', 'status');
      toast.setAttribute('aria-live', 'polite');
      toast.innerHTML = '<span class="exit-fav-toast-text">Вихід&nbsp;додано<br>до&nbsp;вибраного</span>';
      row.prepend(toast);
      requestAnimationFrame(() => toast.classList.add('fav-note-open'));
      setTimeout(() => { toast.classList.remove('fav-note-open'); setTimeout(() => toast.remove(), 300); }, 2500);
    }

    function triggerExitFav() {
      const pv = getPillValues(); if (!pv) return;
      const dirBlock = row.closest('.direction-block') || row.closest('.long-transfer-block');
      const labelEl  = dirBlock ? (dirBlock.querySelector('.direction-label') || dirBlock.querySelector('.transfer-text')) : null;
      const dirLabel = labelEl ? labelEl.textContent.trim() : '';
      const result   = toggleExitFav(slug, dirLabel, pv.wagon, pv.doors);

      if (result.status === 'added') {
        function insertCheckinHint() {
          const sheetBodyEl = document.getElementById('sheetBody');
          if (!sheetBodyEl || document.getElementById('checkinHint')) return;
          const checkinHint = document.createElement('div');
          checkinHint.id = 'checkinHint';
          checkinHint.className = 'onboarding-hint';
          // lineColor — параметр attachExitFavListeners (раніше помилково писали color)
          checkinHint.innerHTML = `<span class="hint-icon-wrap" style="color:${lineColor}">${MetroApp.Icons.info}</span>Натисніть на&nbsp;шпильку, щоб&nbsp;позначити вихід зі&nbsp;станції як&nbsp;відвіданий`;
          sheetBodyEl.insertBefore(checkinHint, sheetBodyEl.firstChild);
        }

        const onboardingHint = document.getElementById('onboardingHint');
        if (onboardingHint) {
          // Є підказка «додай вихід» — анімуємо її зникнення, потім показуємо підказку про шпильку
          MetroApp.dismissHintWithDoors(onboardingHint, insertCheckinHint);
        } else {
          // Підказки вже немає (повторне відкриття картки) — відразу показуємо підказку про шпильку
          insertCheckinHint();
        }
      }

      if (result.status === 'limit') {
        MetroApp.showCustomConfirm?.('Ліміт: можна зберегти не більше 3 виходів для одного напрямку.', () => {});
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

    // Ініціалізація кольору якщо вихід вже в обраному
    const pv = getPillValues();
    if (pv) {
      const dirBlock = row.closest('.direction-block') || row.closest('.long-transfer-block');
      const labelEl  = dirBlock ? (dirBlock.querySelector('.direction-label') || dirBlock.querySelector('.transfer-text')) : null;
      const dirLabel = labelEl ? labelEl.textContent.trim() : '';
      if (isExitFav(slug, dirLabel, pv.wagon, pv.doors)) applyFavPillStyles(row, lineColor, true);
    }

    // Довгий тап (мобільний)
    let longPressTimer = null;
    row.addEventListener('touchstart', e => {
      if (!e.target.closest('.fav-tap-target')) return;
      longPressTimer = setTimeout(() => { longPressTimer = null; triggerExitFav(); }, 600);
    }, { passive: true });
    row.addEventListener('touchend',  () => { clearTimeout(longPressTimer); longPressTimer = null; }, { passive: true });
    row.addEventListener('touchmove', () => { clearTimeout(longPressTimer); longPressTimer = null; }, { passive: true });

    // Подвійний клік (десктоп)
    let tapCount = 0, tapTimer = null;
    row.addEventListener('click', e => {
      if (!e.target.closest('.fav-tap-target')) return;
      if (e.target.closest('.pos-edited-mark, .exit-fav-cancel, .edit-info-panel')) return;
      tapCount++;
      clearTimeout(tapTimer);
      tapTimer = setTimeout(() => { tapCount = 0; }, 500);
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
      ? `Зберегти зміни для станції <span style="white-space: nowrap;">${stationName}?</span>`
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
    MetroApp.pushSheetHistory(); // <--- ДОДАНО
    state.currentStationSlug = slug;
    const s     = state.stationsData[slug];
    const color = MetroApp.LINE_COLOR[s.line] || 'var(--text-muted)';
    const fav   = isFav(slug);

    const onboardingHtml = getExitFavs().length === 0
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

    sheetBody.querySelectorAll('.nav-label').forEach(el => {
      const target = slugByName(el.dataset.name || '');
      if (target && target !== slug) {
        el.classList.add('nav-link');
        el.setAttribute('role', 'button');
        el.setAttribute('tabindex', '0');
      }
    });

    // ⚠️ Спецкейс для Хрещатика — збережено!
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
    sheet.querySelector('.row-checkin-btn')?.remove();
    MetroApp.attachCheckinButtons?.(sheet, slug, color);
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

  document.getElementById('stationTitleMain').textContent = s.name;
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
  sheet.querySelector('.row-checkin-btn')?.remove();
  MetroApp.attachCheckinButtons?.(sheet, state.currentStationSlug, color);
  sheetBody.scrollTop = prevScrollTop;
};

// ══ ШТОРКА «ПРО ДОДАТОК» ══
export function openAboutSheet() {
  const sheetOverlayEl = document.getElementById('sheetOverlay');
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
          sheetOverlayEl.classList.remove('overlay-visible');
      });
    });

    const betaForm = document.getElementById('aboutBetaForm');
    if (betaForm) {
      betaForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = betaForm.querySelector('.about-beta-btn');
        btn.disabled = true;
        btn.textContent = '...';
        try {
          const res = await fetch('https://formspree.io/f/ТВІЙ_ID', {
            method: 'POST',
            headers: { 'Accept': 'application/json' },
            body: new FormData(betaForm),
          });
          if (res.ok) {
            betaForm.hidden = true;
            document.getElementById('aboutBetaSuccess').hidden = false;
          } else {
            btn.disabled = false;
            btn.textContent = 'Записатись';
          }
        } catch {
          btn.disabled = false;
          btn.textContent = 'Записатись';
        }
      });
    }
  } 


  const BETA_COLORS = ['var(--line-red)', 'var(--line-blue)', 'var(--line-green)'];
  try {
    const idx = parseInt(localStorage.getItem('betaBtnColorIdx') || '0') % 3;
    localStorage.setItem('betaBtnColorIdx', (idx + 1) % 3);
    const betaBtn = document.querySelector('#aboutSheet .about-beta-btn');
    if (betaBtn && !betaBtn.disabled) betaBtn.style.background = BETA_COLORS[idx];
  } catch (e) {}

  MetroApp.pushSheetHistory(); // <--- ДОДАНО  document.querySelectorAll('.station-sheet').forEach(el => el.classList.remove('sheet-open'));
  aboutSheet.classList.add('sheet-open', 'sheet-fullscreen', 'sheet-scrollable');
  sheetOverlayEl.classList.add('overlay-visible');
}

// ══ EVENT LISTENERS ══

// Закрити кнопкою
sheetClose.addEventListener('click', () => closeAllSheets());

// Escape
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeAllSheets();
});

// Кліки всередині sheetBody (nav-labels та олівець)
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
      setTimeout(() => { if (!panel.classList.contains('panel-open')) panel.remove(); }, 300);
      return;
    }

    document.querySelectorAll('.edit-info-panel').forEach(p => {
      p.classList.remove('panel-open');
      setTimeout(() => p.remove(), 300);
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
        setTimeout(() => panel.remove(), 300);
        MetroApp.reloadStationsData(true)
          .then(() => openStation(slug))
          .catch(() => MetroApp.showCustomConfirm?.('Помилка з\'єднання. Спробуйте ще раз.', () => {}, null, null));
      } catch (err) { console.error('edit reset failed', err); }
    });
  }
});

// Кнопка-серце у шапці
sheet.querySelector('.fav-btn-bar')?.addEventListener('click', e => {
  const btn   = e.currentTarget;
  const slug  = btn.dataset.slug;
  if (!slug) return;
  const color  = btn.dataset.color || 'var(--text-muted)';
  const nowFav = toggleFav(slug);
  btn.innerHTML = heartSvg(nowFav, slug, color);
  btn.classList.toggle('fav-active', nowFav);
});

// Оверлей
sheetOverlay.addEventListener('click', e => {
  if (e.target !== sheetOverlay) return;
  const dropMenu = document.getElementById('dropMenu');
  if (dropMenu?.classList.contains('show')) return;

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

// Кінематичний свайп вниз
MetroApp.initKinematicSwipe(sheet, sheetBody, () => closeAllSheets());

// Публікуємо
MetroApp.openStation    = openStation;
MetroApp.closeAllSheets = closeAllSheets;
MetroApp.openAboutSheet = openAboutSheet;