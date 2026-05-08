import { state } from '../core/state.js';
import { STORAGE_KEYS, Storage } from '../core/storage.js';

// Глобальні змінні стану (щоб не було помилок ReferenceError)
let ciSortMode = 'date';
let ciViewMode = 'visited';

const CHECKIN_PIN_SVG_OFF = `<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><path d="M16,1C9.925,1,5,5.925,5,12c0,9,11,18,11,18s11-9,11-18C27,5.925,22.075,1,16,1z M16,28.677 C13.71,26.629,6,19.202,6,12C6,6.486,10.486,2,16,2s10,4.486,10,10C26,19.202,18.29,26.629,16,28.677z M16,6c-3.314,0-6,2.686-6,6 s2.686,6,6,6s6-2.686,6-6S19.314,6,16,6z M16,17c-2.757,0-5-2.243-5-5s2.243-5,5-5s5,2.243,5,5S18.757,17,16,17z" fill="currentColor" stroke="currentColor" stroke-width="0.5"/></svg>`;

let checkinsCache = null;

export function invalidateCheckinsCache() { checkinsCache = null; }

export function getCheckins() {
  if (checkinsCache) return checkinsCache;
  try { checkinsCache = JSON.parse(Storage.get(STORAGE_KEYS.CHECKINS) || '{}'); }
  catch { checkinsCache = {}; }
  return checkinsCache;
}

export function isCheckinMode() {
  const val = Storage.get(STORAGE_KEYS.CHECKIN_MODE);
  return val === null ? true : val === 'true';
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
  checkinsCache = all;
  updateCheckinDock();
  return !!all[id];
}

const _pinSvgCache = new Map();
function checkinPinSvg(checked, lineColor) {
  if (!checked) return CHECKIN_PIN_SVG_OFF;
  if (_pinSvgCache.has(lineColor)) return _pinSvgCache.get(lineColor);
  const svg = `<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
      <path fill-rule="evenodd" clip-rule="evenodd" d="M16,1C9.925,1,5,5.925,5,12c0,9,11,18,11,18s11-9,11-18C27,5.925,22.075,1,16,1z M16,17c-2.757,0-5-2.243-5-5s2.243-5,5-5s5,2.243,5,5S18.757,17,16,17z" fill="${lineColor}" stroke="${lineColor}" stroke-width="0.5"/>
  </svg>`;
  _pinSvgCache.set(lineColor, svg);
  return svg;
}

let _checkinCount = null;
function getCheckinCount() {
  if (_checkinCount !== null) return _checkinCount;
  _checkinCount = Object.keys(getCheckins()).length;
  return _checkinCount;
}

export function updateCheckinDock() {
  const btn = document.getElementById('checkinBtn');
  if (!btn) return;
  btn.hidden    = !isCheckinMode();
  _checkinCount = null;
  btn.innerHTML = getCheckinCount() > 0
    ? MetroApp.Icons.dockPinFilled
    : MetroApp.Icons.dockPinEmpty;
}

MetroApp.attachCheckinButtons = function(sheetEl, slug, lineColor) {
  if (!isCheckinMode()) return;
  const body = sheetEl.id === 'sheetBody' ? sheetEl : sheetEl.querySelector('#sheetBody') || document.getElementById('sheetBody');
  if (!body) return;

  body.querySelectorAll('.position-row').forEach((row) => {
    const pills = row.querySelectorAll('.pos-pill');
    if (!pills.length) return;
    const wagon = pills[0]?.querySelector('.pos-pill-num')?.textContent?.trim();
    const doors = pills[1]?.querySelector('.pos-pill-num')?.textContent?.trim();
    if (!wagon || !doors) return;

    const dirBlock = row.closest('.direction-block') || row.closest('.long-transfer-block');
    const labelEl = dirBlock ? (dirBlock.querySelector('.direction-label') || dirBlock.querySelector('.transfer-text')) : null;
    const dir = labelEl?.textContent?.trim() || '';

    const checked = isCheckedIn(slug, dir, wagon, doors);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `checkin-btn row-checkin-btn${checked ? ' is-checked' : ''}`;
    btn.innerHTML = checkinPinSvg(checked, checked ? lineColor : null);
    btn.style.color = checked ? lineColor : '';
    row.appendChild(btn);

    btn.addEventListener('click', e => {
      e.stopPropagation();
      const nowChecked = toggleCheckin(slug, dir, wagon, doors, lineColor);
      btn.classList.toggle('is-checked', nowChecked);
      btn.innerHTML = checkinPinSvg(nowChecked, nowChecked ? lineColor : null);
      btn.style.color = nowChecked ? lineColor : '';
      _checkinCount = null;
    });
  });
};

export function formatCheckinTime(ts) {
  const d = new Date(ts);
  const pad = n => String(n).padStart(2, '0');
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function openCheckinSheet() {
  MetroApp.pushSheetHistory();
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
    const s = document.getElementById('checkinSheet');
    const all = getCheckins();
    const entries = Object.values(all);
    let bodyHtml = '';

    const uniqueExitsVisited = new Set(entries.map(e => `${e.slug}|${e.wagon}|${e.doors}`)).size;
    const totalExitsAll = state.stationsData
      ? Object.values(state.stationsData).reduce((sum, st) => sum + (st.positions ? st.positions.filter(p => !p.closed).length : 0), 0)
      : 0;
    
    const coverage = totalExitsAll > 0 ? Math.floor((uniqueExitsVisited / totalExitsAll) * 100) : 0;

    bodyHtml = `
      <div class="ci-stats-bar">
        <div class="ci-stat"><span class="ci-stat-num">${new Set(entries.map(e => e.slug)).size}</span><span class="ci-stat-lbl">станцій</span></div>
        <div class="ci-stat-sep"></div>
        <div class="ci-stat"><span class="ci-stat-num">${uniqueExitsVisited}</span><span class="ci-stat-lbl">виходів</span></div>
        <div class="ci-stat-sep"></div>
        <div class="ci-stat"><span class="ci-stat-num">${coverage}%</span><span class="ci-stat-lbl">охоплення</span></div>
      </div>
      <div class="ci-coverage-track"><div class="ci-coverage-fill" style="width:${coverage}%"></div></div>
      <div class="ci-sort-bar">
        <button class="ci-sort-btn${ciSortMode === 'date' && ciViewMode === 'visited' ? ' ci-sort-active' : ''}" data-sort="date">Нові ↓</button>
        <button class="ci-sort-btn${ciSortMode === 'alpha' && ciViewMode === 'visited' ? ' ci-sort-active' : ''}" data-sort="alpha">А→Я</button>
        <button class="ci-sort-btn ci-unvisited-btn${ciViewMode === 'unvisited' ? ' ci-sort-active' : ''}" data-view="unvisited">Не відвідані</button>
      </div>`;

    let listHtml = '';
    
    // ОСЬ ТУТ ВИПРАВЛЕНО: Використовуємо змінні, які реально є у styles.css, і такий самий розмір/вагу шрифту.
    const badgeStyle = 'color: var(--text-muted) !important; opacity: 1 !important; font-size: var(--fs-md) !important; font-weight: var(--fw-normal) !important;';

    if (ciViewMode === 'unvisited') {
      const visitedKeys = new Set(entries.map(e => `${e.slug}|${e.wagon}|${e.doors}`));
      const unvisitedStations = Object.entries(state.stationsData || {})
        .map(([slug, st]) => {
          const unvisited = st.positions?.filter(p => !p.closed && !visitedKeys.has(`${slug}|${p.wagon}|${p.doors}`)) || [];
          return { slug, name: st.name, line: st.line, unvisitedCount: unvisited.length, total: st.positions?.filter(p => !p.closed).length || 0 };
        })
        .filter(s => s.unvisitedCount > 0)
        .sort((a, b) => a.name.localeCompare(b.name, 'uk'));

      listHtml = unvisitedStations.map(s => {
        const color = MetroApp.LINE_COLOR[s.line] || 'var(--text-muted)';
        return `<button class="checkin-station-card" data-slug="${s.slug}" style="--ci-accent:${color}">
          <div class="checkin-card-top">
            <span class="checkin-station-name-text">${s.name}</span>
            <span class="checkin-count-badge" style="${badgeStyle}">${s.total - s.unvisitedCount} / ${s.total}</span>
          </div>
        </button>`;
      }).join('') || `<p class="fav-empty-text-lg" style="text-align:center;padding:32px 16px;">Всі виходи відвідані 🎉</p>`;
    } else {
      if (!entries.length) {
        listHtml = `<p class="fav-empty-text-lg" style="margin-top:40px;text-align:center;">Журнал порожній</p>`;
      } else {
        const byStation = {};
        entries.forEach(e => { if (!byStation[e.slug]) byStation[e.slug] = []; byStation[e.slug].push(e); });
        
        let stationEntries = Object.entries(byStation);
        if (ciSortMode === 'date') {
          stationEntries.sort(([, a], [, b]) => Math.max(...b.map(e => e.ts)) - Math.max(...a.map(e => e.ts)));
        } else {
          stationEntries.sort(([slugA], [slugB]) => (state.stationsData?.[slugA]?.name || "").localeCompare(state.stationsData?.[slugB]?.name || "", 'uk'));
        }

        listHtml = stationEntries.map(([slug, items]) => {
          const st = state.stationsData?.[slug];
          const color = items[0].color || (st ? MetroApp.LINE_COLOR[st.line] : 'var(--text-muted)');
          const totalExits = st?.positions ? st.positions.filter(p => !p.closed).length : 0;
          const visitedExitsCount = new Set(items.map(e => `${e.wagon}|${e.doors}`)).size;
          const lastTs = Math.max(...items.map(e => e.ts));

          return `<button class="checkin-station-card" data-slug="${slug}" style="--ci-accent:${color}">
            <div class="checkin-card-top">
              <span class="checkin-station-name-text">${st?.name || slug}</span>
              <span class="checkin-time">${formatCheckinTime(lastTs)}</span>
            </div>
            <div class="checkin-card-bottom" style="margin-top:4px;">
              <span class="checkin-count-badge" style="${badgeStyle}">${visitedExitsCount} / ${totalExits}</span>
            </div>
          </button>`;
        }).join('');
      }
    }

    s.innerHTML = `
      <div class="sheet-handle-bar">
        <div class="sheet-handle"></div>
        <span class="sheet-sheet-title">Check-in</span>
        <button class="sheet-close-btn" id="checkinClose" aria-label="Закрити">✕</button>
      </div>
      <div class="sheet-body">${bodyHtml}${listHtml}</div>`;

    s.querySelector('#checkinClose').addEventListener('click', closeHandler);

    s.querySelectorAll('.ci-sort-btn[data-sort]').forEach(btn => {
      btn.addEventListener('click', () => { ciViewMode = 'visited'; ciSortMode = btn.dataset.sort; renderCheckinContent(); });
    });
    s.querySelector('.ci-unvisited-btn').addEventListener('click', () => { ciViewMode = 'unvisited'; renderCheckinContent(); });

    s.querySelectorAll('.checkin-station-card').forEach(card => {
      card.addEventListener('click', () => {
        const sl = card.dataset.slug;
        if (sl) { closeHandler(); setTimeout(() => MetroApp.openStation?.(sl), 380); }
      });
    });
  };

  if (!checkinSheet) {
    checkinSheet = document.createElement('div');
    checkinSheet.id = 'checkinSheet';
    checkinSheet.className = 'station-sheet checkin-journal-sheet';
    document.body.appendChild(checkinSheet);
  }

  renderCheckinContent();
  document.querySelectorAll('.station-sheet').forEach(el => el.classList.remove('sheet-open'));
  checkinSheet.classList.add('sheet-open', 'sheet-fullscreen', 'sheet-scrollable');
  sheetOverlay.classList.add('overlay-visible');
}