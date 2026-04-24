import { state }       from './state.js';
import { STORAGE_KEYS, Storage } from './storage.js';

const CHECKIN_PIN_SVG_OFF = `<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><path d="M16,1C9.925,1,5,5.925,5,12c0,9,11,18,11,18s11-9,11-18C27,5.925,22.075,1,16,1z M16,28.677 C13.71,26.629,6,19.202,6,12C6,6.486,10.486,2,16,2s10,4.486,10,10C26,19.202,18.29,26.629,16,28.677z M16,6c-3.314,0-6,2.686-6,6 s2.686,6,6,6s6-2.686,6-6S19.314,6,16,6z M16,17c-2.757,0-5-2.243-5-5s2.243-5,5-5s5,2.243,5,5S18.757,17,16,17z" fill="currentColor" stroke="currentColor" stroke-width="0.5"/></svg>`;

let checkinsCache = null;

export function getCheckins() {
  if (checkinsCache) return checkinsCache;
  try { checkinsCache = JSON.parse(Storage.get(STORAGE_KEYS.CHECKINS) || '{}'); }
  catch { checkinsCache = {}; }
  return checkinsCache;
}

export function isCheckinMode() {
  return Storage.get(STORAGE_KEYS.CHECKIN_MODE) === 'true';
}

export function checkinId(slug, dir, wagon, doors) { return `${slug}|${dir}|${wagon}|${doors}`; }

export function isCheckedIn(slug, dir, wagon, doors) {
  return !!getCheckins()[checkinId(slug, dir, wagon, doors)];
}

export function toggleCheckin(slug, dir, wagon, doors, lineColor) {
  const id  = checkinId(slug, dir, wagon, doors);
  const all = getCheckins();
  if (all[id]) delete all[id];
  else all[id] = { slug, dir, wagon, doors, color: lineColor, ts: Date.now() };
  Storage.set(STORAGE_KEYS.CHECKINS, JSON.stringify(all));
  checkinsCache = null;
  updateCheckinDock();
  return !!all[id];
}

function checkinPinSvg(checked, lineColor) {
  if (!checked) return CHECKIN_PIN_SVG_OFF;
  return `<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" style="transform: translateY(-2px);">
    <path fill-rule="evenodd" clip-rule="evenodd" d="M16,1C9.925,1,5,5.925,5,12c0,9,11,18,11,18s11-9,11-18C27,5.925,22.075,1,16,1z M16,17c-2.757,0-5-2.243-5-5s2.243-5,5-5s5,2.243,5,5S18.757,17,16,17z" fill="${lineColor}" stroke="${lineColor}" stroke-width="0.5"/>
  </svg>`;
}

export function updateCheckinDock() {
  const btn = document.getElementById('checkinBtn');
  if (!btn) return;
  btn.hidden = !isCheckinMode();
  btn.innerHTML = Object.keys(getCheckins()).length > 0
    ? MetroApp.Icons.dockPinFilled
    : MetroApp.Icons.dockPinEmpty;
}

// ══ ШПИЛЬКИ НА КАРТЦІ СТАНЦІЇ ══
MetroApp.attachCheckinButtons = function(sheetEl, slug, lineColor) {
  if (!isCheckinMode()) return;
  const body = sheetEl.id === 'sheetBody'
    ? sheetEl
    : sheetEl.querySelector('#sheetBody') || document.getElementById('sheetBody');

  body.querySelectorAll('.position-row').forEach(row => {
    if (row.querySelector('.row-checkin-btn')) return;
    const nums = row.querySelectorAll('.pos-pill-num');
    if (nums.length < 2) return;

    const wagon    = nums[0].textContent.trim();
    const doors    = nums[1].textContent.trim();
    const dirBlock = row.closest('.direction-block') || row.closest('.long-transfer-block');
    const labelEl  = dirBlock ? (dirBlock.querySelector('.direction-label') || dirBlock.querySelector('.transfer-text')) : null;
    const dir      = labelEl ? labelEl.textContent.trim() : '';

    const btn = document.createElement('button');
    btn.className   = 'row-checkin-btn';
    btn.setAttribute('aria-label', 'Check-in для цього виходу');

    function refreshBtn() {
      const checked = isCheckedIn(slug, dir, wagon, doors);
      btn.classList.toggle('is-checked-in', checked);
      btn.innerHTML = checkinPinSvg(checked, checked ? lineColor : null);
    }
    refreshBtn();
    row.appendChild(btn);

    btn.addEventListener('click', e => {
      e.stopPropagation();
      toggleCheckin(slug, dir, wagon, doors, lineColor);
      refreshBtn();
      updateCheckinDock();
    });
  });
};

MetroApp.removeCheckinButton = function(sheetEl) {
  const body = sheetEl.id === 'sheetBody'
    ? sheetEl
    : sheetEl.querySelector('#sheetBody') || document.getElementById('sheetBody');
  body.querySelectorAll('.row-checkin-btn').forEach(b => b.remove());
};

// ══ ФОРМАТУВАННЯ ЧАСУ ══
export function formatCheckinTime(ts) {
  if (!ts) return '';
  const d      = new Date(ts);
  const diffMs = Date.now() - ts;
  const diffH  = Math.floor(diffMs / 3600000);
  if (diffH < 1) { const m = Math.floor(diffMs / 60000); return m < 1 ? 'щойно' : `${m} хв тому`; }
  if (diffH < 24) return `${diffH} год тому`;
  return d.toLocaleDateString('uk-UA', { day: 'numeric', month: 'short' });
}

// ══ ШТОРКА CHECK-IN ══
export function openCheckinSheet() {
  let checkinSheet = document.getElementById('checkinSheet');
  const sheetOverlay = document.getElementById('sheetOverlay');

  const closeHandler = () => {
    const s = document.getElementById('checkinSheet');
    MetroApp.animateSheetClose(s, () => {
      s?.classList.remove('sheet-open', 'sheet-fullscreen', 'sheet-scrollable');
      if (!document.querySelectorAll('.station-sheet.sheet-open').length)
        sheetOverlay.classList.remove('overlay-visible');
    });
  };

  const renderCheckinContent = () => {
    const s    = document.getElementById('checkinSheet');
    const all  = getCheckins();
    const entries = Object.values(all);
    let bodyHtml  = '';

    if (!entries.length) {
      const colors = ['#5b9bd5', '#c8523a', '#5aaa6a'];
      const color  = colors[state.emptyFavColorIdx % colors.length];
      state.emptyFavColorIdx++;
      const coloredPin = MetroApp.Icons.dockPinFilled
        .replace(/currentColor/g, color)
        .replace('translateY(-3px)', 'translateY(3px)');
      bodyHtml = `<p class="fav-empty-text">Натисніть ${coloredPin} на картці станції, щоб зберегти станцію та вихід.</p>`;
    } else {
      const byStation    = {};
      entries.forEach(e => { if (!byStation[e.slug]) byStation[e.slug] = []; byStation[e.slug].push(e); });
      const totalCheckins = entries.length;
      const totalExitsAll = state.stationsData
        ? Object.values(state.stationsData).reduce((sum, st) => sum + (st.positions ? st.positions.filter(p => !p.closed).length : 0), 0)
        : 0;
      const stationCount = Object.keys(byStation).length;
      const coverage     = totalExitsAll > 0 ? Math.round(totalCheckins / totalExitsAll * 100) : 0;

      bodyHtml += `<div class="ci-stats-bar">
        <div class="ci-stat"><span class="ci-stat-num">${stationCount}</span><span class="ci-stat-lbl">станцій</span></div>
        <div class="ci-stat-sep"></div>
        <div class="ci-stat"><span class="ci-stat-num">${totalCheckins}</span><span class="ci-stat-lbl">виходів</span></div>
        <div class="ci-stat-sep"></div>
        <div class="ci-stat"><span class="ci-stat-num">${coverage}%</span><span class="ci-stat-lbl">охоплення</span></div>
      </div>`;

      bodyHtml += Object.entries(byStation).map(([slug, items]) => {
        const st         = state.stationsData?.[slug];
        const color      = items[0].color || (st ? MetroApp.LINE_COLOR[st.line] : 'var(--text-muted)');
        const name       = st ? st.name : slug;
        const totalExits = st?.positions ? st.positions.filter(p => !p.closed).length : 0;
        const checkedCount = items.length;
        const lastTs     = Math.max(...items.map(e => e.ts || 0));
        const maxDots    = Math.min(totalExits, 40);
        const dotsHtml   = Array.from({ length: maxDots }, (_, i) =>
          i < checkedCount
            ? `<span class="checkin-dot is-visited" style="--ci-color:${color}"></span>`
            : `<span class="checkin-dot is-empty"></span>`
        ).join('');

        return `<button class="checkin-station-card" data-slug="${slug}">
          <div class="checkin-card-row">
            <div class="checkin-card-left">
              <span class="checkin-station-name-text">${name}</span>
              <span class="checkin-time">${formatCheckinTime(lastTs)}</span>
            </div>
            <div class="checkin-card-right">
              <span class="checkin-fraction">${checkedCount}<span class="checkin-fraction-total">/${totalExits}</span></span>
            </div>
          </div>
          ${dotsHtml ? `<div class="checkin-dots">${dotsHtml}</div>` : ''}
        </button>`;
      }).join('');
    }

    s.innerHTML = `
      <div class="sheet-handle-bar">
        <div class="sheet-handle"></div>
        <span class="sheet-sheet-title">Check-in</span>
        <button class="sheet-close-btn" id="checkinClose" aria-label="Закрити">✕</button>
      </div>
      <div class="sheet-body">${bodyHtml}</div>`;

    s.querySelector('#checkinClose').addEventListener('click', closeHandler);
    s.querySelectorAll('.checkin-station-card').forEach(card => {
      card.addEventListener('click', () => {
        const sl = card.dataset.slug;
        if (sl) { closeHandler(); setTimeout(() => MetroApp.openStation?.(sl), 380); }
      });
    });

    let swY2 = 0, isSwipeCI = false;
    s.addEventListener('touchstart', e => { swY2 = e.touches[0].clientY; isSwipeCI = !!e.target.closest('.sheet-handle-bar'); }, { passive: true });
    s.addEventListener('touchend',   e => { if (isSwipeCI && e.changedTouches[0].clientY - swY2 > 60) closeHandler(); });
  };

  if (!checkinSheet) {
    checkinSheet = document.createElement('div');
    checkinSheet.id        = 'checkinSheet';
    checkinSheet.className = 'station-sheet checkin-journal-sheet';
    document.body.appendChild(checkinSheet);
  }

  renderCheckinContent();
  document.querySelectorAll('.station-sheet').forEach(el => el.classList.remove('sheet-open'));
  checkinSheet.classList.add('sheet-open', 'sheet-fullscreen', 'sheet-scrollable');
  sheetOverlay.classList.add('overlay-visible');
}
