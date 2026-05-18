// ══ FEATURE: CHECK-IN — UI-ШАР ══
// Відповідальність: рендеринг та взаємодія UI для check-in.
// Бізнес-логіка — у domain/checkin.js.
//
// Публічне API:
//   updateCheckinDock()  → оновлює іконку dock
//   openCheckinSheet()   → відкриває журнал check-in
//
// Ре-експорти з domain (для зворотної сумісності зі settings.js):
//   isCheckinMode, getCheckins, invalidateCheckinsCache
//
// Bus-підписки:
//   'checkin:attach-buttons' → attachCheckinButtons(sheetEl, slug, color)
//   'checkin:updated'        → updateCheckinDock() + bus.emit('map:sync-checkins')

import { state }              from '../../core/state.js';
import { STORAGE_KEYS, Storage } from '../../core/storage.js';
import { bus }                from '../../core/eventBus.js';
import { Icons }              from '../../ui/icons.js';
import { LINE_COLOR }         from '../../core/constants.js';
import { animateSheetClose }  from '../../ui/animations.js';
import { initKinematicSwipe } from '../../ui/swipe.js';
import { pushSheetHistory }   from '../../ui/system.js';

import {
  getCheckins,
  isCheckinMode,
  invalidateCheckinsCache,
  isCheckedIn,
  toggleCheckin,
  formatCheckinTime,
  stationWord,
  exitWord,
  buildLineStats,
  LINE_NAMES,
  LINE_ORDER,
} from '../../domain/checkin.js';

// ── Ре-експорти для settings.js ──────────────────────────────
export { isCheckinMode, getCheckins, invalidateCheckinsCache };

// ══ UI-СТАН ══════════════════════════════════════════════════

let ciSortMode    = 'date';
let ciViewMode    = 'visited';
let selectedLines = new Set();

// ══ ЗНАЧОК ПИНУ (SVG) ════════════════════════════════════════

const CHECKIN_PIN_SVG_OFF = `<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><path d="M16,1C9.925,1,5,5.925,5,12c0,9,11,18,11,18s11-9,11-18C27,5.925,22.075,1,16,1z M16,28.677 C13.71,26.629,6,19.202,6,12C6,6.486,10.486,2,16,2s10,4.486,10,10C26,19.202,18.29,26.629,16,28.677z M16,6c-3.314,0-6,2.686-6,6 s2.686,6,6,6s6-2.686,6-6S19.314,6,16,6z M16,17c-2.757,0-5-2.243-5-5s2.243-5,5-5s5,2.243,5,5S18.757,17,16,17z" fill="currentColor" stroke="currentColor" stroke-width="0.5"/></svg>`;

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

// ══ DOCK-ІКОНКА ══════════════════════════════════════════════

let _checkinCount = null;

function getCheckinCount() {
  if (_checkinCount !== null) return _checkinCount;
  _checkinCount = Object.keys(getCheckins()).length;
  return _checkinCount;
}

/**
 * Оновлює видимість та іконку кнопки check-in у dock-панелі.
 */
export function updateCheckinDock() {
  const btn = document.getElementById('checkinBtn');
  if (!btn) return;
  btn.hidden    = !isCheckinMode();
  _checkinCount = null;
  btn.innerHTML = getCheckinCount() > 0
    ? Icons.dockPinFilled
    : Icons.dockPinEmpty;
}

// ══ ПРИКРІПЛЕННЯ КНОПОК CHECK-IN ═════════════════════════════

/**
 * Додає pin-кнопки до рядків позицій у відкритій шторці станції.
 * Викликається через bus.on('checkin:attach-buttons').
 */
function attachCheckinButtons(sheetEl, slug, lineColor) {
  if (!isCheckinMode()) return;
  const body = sheetEl.id === 'sheetBody'
    ? sheetEl
    : sheetEl.querySelector('#sheetBody') || document.getElementById('sheetBody');
  if (!body) return;

  body.querySelectorAll('.position-row').forEach(row => {
    const pills = row.querySelectorAll('.pos-pill');
    if (!pills.length) return;
    const wagon = pills[0]?.querySelector('.pos-pill-num')?.textContent?.trim();
    const doors = pills[1]?.querySelector('.pos-pill-num')?.textContent?.trim();
    if (!wagon || !doors) return;

    const dirBlock = row.closest('.direction-block') || row.closest('.long-transfer-block');
    const labelEl  = dirBlock
      ? (dirBlock.querySelector('.direction-label') || dirBlock.querySelector('.transfer-text'))
      : null;
    const dir = labelEl?.textContent?.trim() || '';

    const checked = isCheckedIn(slug, dir, wagon, doors);
    const btn     = document.createElement('button');
    btn.type      = 'button';
    btn.className = `checkin-btn row-checkin-btn${checked ? ' is-checked' : ''}`;
    btn.innerHTML = checkinPinSvg(checked, checked ? lineColor : null);
    btn.style.color = checked ? lineColor : '';
    row.appendChild(btn);

    btn.addEventListener('click', e => {
      e.stopPropagation();
      const nowChecked = toggleCheckin(slug, dir, wagon, doors, lineColor);
      btn.classList.toggle('is-checked', nowChecked);
      btn.innerHTML   = checkinPinSvg(nowChecked, nowChecked ? lineColor : null);
      btn.style.color = nowChecked ? lineColor : '';
      _checkinCount   = null;
    });
  });
}

// ══ РЕНДЕР КІЛЕЦЬ ГІЛОК ══════════════════════════════════════

function renderLineRings(lineStats) {
  const byExits = Storage.get(STORAGE_KEYS.CHECKIN_BY_STATION) === 'exits';
  const rings = LINE_ORDER.map(line => {
    const s        = lineStats[line];
    const color    = LINE_COLOR[line] || 'var(--text-muted)';
    const name     = LINE_NAMES[line];
    const pct      = byExits
      ? (s.totalExits    > 0 ? s.visitedExits    / s.totalExits    : 0)
      : (s.totalStations > 0 ? s.visitedStations / s.totalStations : 0);
    const R        = 26;
    const SW       = 5;
    const C        = +(2 * Math.PI * R).toFixed(3);
    const fill     = +(C * pct).toFixed(3);
    const stLabel  = `${s.visitedStations}/${s.totalStations}`;
    const isActive = selectedLines.has(line);

    return `<button class="ci-line-ring-card${isActive ? ' ci-ring-active' : ''}" data-line="${line}" aria-label="${name} гілка: ${stLabel} станцій">
      <svg class="ci-ring-svg" viewBox="0 0 64 64" width="64" height="64" aria-hidden="true">
        <circle cx="32" cy="32" r="${R}" fill="none" stroke="var(--border)" stroke-width="${SW}"/>
        <circle cx="32" cy="32" r="${R}" fill="none"
          stroke="${color}" stroke-width="${SW}"
          stroke-linecap="round"
          stroke-dasharray="${fill} ${C}"
          transform="rotate(-90 32 32)"/>
      </svg>
      <span class="ci-ring-label" style="color:${color}">${name}</span>
      <span class="ci-ring-sub">${stLabel} ст.</span>
    </button>`;
  }).join('');

  return `<div class="ci-line-rings-row">${rings}</div>`;
}

// ══ ВІДКРИТТЯ ШТОРКИ ЖУРНАЛУ ══════════════════════════════════

/**
 * Відкриває шторку журналу check-in.
 */
export function openCheckinSheet() {
  pushSheetHistory();
  let checkinSheet   = document.getElementById('checkinSheet');
  const sheetOverlay = document.getElementById('sheetOverlay');

  const closeHandler = () => {
    const s = document.getElementById('checkinSheet');
    animateSheetClose(s, () => {
      s?.classList.remove('sheet-open', 'sheet-fullscreen', 'sheet-scrollable');
      if (!document.querySelectorAll('.station-sheet.sheet-open').length)
        sheetOverlay.classList.remove('overlay-visible');
    });
  };

  const renderCheckinContent = () => {
    const s       = document.getElementById('checkinSheet');
    const all     = getCheckins();
    const entries = Object.values(all);
    let bodyHtml  = '';
    let listHtml  = '';
    const badgeStyle = 'color: var(--text-muted) !important; opacity: 1 !important; font-size: var(--fs-md) !important; font-weight: var(--fw-normal) !important;';

    if (!entries.length) {
      const colors = ['var(--line-blue)', 'var(--line-red)', 'var(--line-green)'];
      if (typeof state.emptyFavColorIdx !== 'number') state.emptyFavColorIdx = 0;
      const color  = colors[state.emptyFavColorIdx % colors.length];
      state.emptyFavColorIdx++;

      const coloredPin = Icons.dockPinFilled
        .replace(/currentColor/g, color)
        .replace('translateY(-3px)', 'translateY(0)')
        .replace('width="26" height="26"', 'width="20" height="20"')
        .replace('opacity="0.5"', '');
      const pinInline = `<span style="display:inline-block;width:20px;height:20px;vertical-align:-3px;">${coloredPin}</span>`;

      listHtml = `
        <div class="fav-empty-state" style="margin-top: 40px;">
          <p class="fav-empty-text-lg">
            Натисніть ${pinInline} щоб&nbsp;позначити<br>вихід зі&nbsp;станції як&nbsp;відвіданий
          </p>
        </div>`;

      ciViewMode    = 'visited';
      ciSortMode    = 'date';
      selectedLines = new Set();
    } else {
      const uniqueStations     = new Set(entries.map(e => e.slug)).size;
      const uniqueExitsVisited = new Set(entries.map(e => `${e.slug}|${e.wagon}|${e.doors}`)).size;
      const totalExitsAll      = state.stationsData
        ? Object.values(state.stationsData).reduce(
            (sum, st) => sum + (st.positions ? st.positions.filter(p => !p.closed).length : 0), 0
          )
        : 0;
      const totalStationsAll = state.stationsData ? Object.keys(state.stationsData).length : 0;
      const byExits          = Storage.get(STORAGE_KEYS.CHECKIN_BY_STATION) === 'exits';

      let coverageValue = 0;
      let coverageText  = '0%';
      const covNum   = byExits ? uniqueExitsVisited : uniqueStations;
      const covDenom = byExits ? totalExitsAll      : totalStationsAll;

      if (covDenom > 0 && covNum > 0) {
        const raw = Math.floor((covNum / covDenom) * 100);
        if (covNum === covDenom) { coverageText = '100%';    coverageValue = 100; }
        else if (raw === 0)      { coverageText = '< 1%';    coverageValue = 1;   }
        else if (raw === 100)    { coverageText = '> 99%';   coverageValue = 99;  }
        else                     { coverageText = `${raw}%`; coverageValue = raw; }
      }

      bodyHtml = `
        <div class="ci-stats-bar">
          <div class="ci-stat"><span class="ci-stat-num">${uniqueStations}</span><span class="ci-stat-lbl">${stationWord(uniqueStations)}</span></div>
          <div class="ci-stat-sep"></div>
          <div class="ci-stat"><span class="ci-stat-num">${uniqueExitsVisited}</span><span class="ci-stat-lbl">${exitWord(uniqueExitsVisited)}</span></div>
          <div class="ci-stat-sep"></div>
          <div class="ci-stat"><span class="ci-stat-num">${coverageText}</span><span class="ci-stat-lbl">охоплення</span></div>
        </div>
        <div class="ci-coverage-track"><div class="ci-coverage-fill" style="width:${coverageValue}%"></div></div>
        ${renderLineRings(buildLineStats(entries))}
        ${selectedLines.size > 0 ? `
        <div class="ci-sort-bar">
          <button class="ci-sort-btn${ciSortMode === 'date' && ciViewMode === 'visited' ? ' ci-sort-active' : ''}" data-sort="date">Нові ↓</button>
          <button class="ci-sort-btn${ciSortMode === 'alpha' && ciViewMode === 'visited' ? ' ci-sort-active' : ''}" data-sort="alpha">А→Я</button>
          <button class="ci-sort-btn ci-unvisited-btn${ciViewMode === 'unvisited' ? ' ci-sort-active' : ''}" data-view="unvisited">Не відвідані</button>
        </div>` : ''}
      `;

      if (selectedLines.size > 0) {
        const lineEntries = entries.filter(e => {
          const st = state.stationsData?.[e.slug];
          return st && selectedLines.has(st.line);
        });

        if (ciViewMode === 'unvisited') {
          const visitedKeys       = new Set(entries.map(e => `${e.slug}|${e.wagon}|${e.doors}`));
          const unvisitedStations = Object.entries(state.stationsData || {})
            .map(([slug, st]) => {
              const unvisited = st.positions?.filter(
                p => !p.closed && !visitedKeys.has(`${slug}|${p.wagon}|${p.doors}`)
              ) || [];
              return {
                slug,
                name:           st.name,
                line:           st.line,
                unvisitedCount: unvisited.length,
                total:          st.positions?.filter(p => !p.closed).length || 0,
              };
            })
            .filter(s => s.unvisitedCount > 0 && selectedLines.has(s.line))
            .sort((a, b) => a.name.localeCompare(b.name, 'uk'));

          listHtml = unvisitedStations.map(s => {
            const color = LINE_COLOR[s.line] || 'var(--text-muted)';
            return `<button class="checkin-station-card" data-slug="${s.slug}" style="--ci-accent:${color}">
              <div class="checkin-card-top">
                <span class="checkin-station-name-text">${s.name}</span>
                <span class="checkin-count-badge" style="${badgeStyle}">${s.total - s.unvisitedCount} / ${s.total}</span>
              </div>
            </button>`;
          }).join('') || `<p class="fav-empty-text-lg" style="text-align:center;padding:32px 16px;">Всі виходи відвідані 🎉</p>`;

        } else {
          const byStation    = {};
          lineEntries.forEach(e => {
            if (!byStation[e.slug]) byStation[e.slug] = [];
            byStation[e.slug].push(e);
          });
          let stationEntries = Object.entries(byStation);

          if (ciSortMode === 'date') {
            stationEntries.sort(([, a], [, b]) =>
              Math.max(...b.map(e => e.ts)) - Math.max(...a.map(e => e.ts))
            );
          } else {
            stationEntries.sort(([sA], [sB]) =>
              (state.stationsData?.[sA]?.name || '').localeCompare(
                state.stationsData?.[sB]?.name || '', 'uk'
              )
            );
          }

          listHtml = stationEntries.map(([slug, items]) => {
            const st              = state.stationsData?.[slug];
            const color           = items[0].color || (st ? LINE_COLOR[st.line] : 'var(--text-muted)');
            const totalExits      = st?.positions ? st.positions.filter(p => !p.closed).length : 0;
            const visitedExitsCnt = new Set(items.map(e => `${e.wagon}|${e.doors}`)).size;
            const lastTs          = Math.max(...items.map(e => e.ts));

            return `<button class="checkin-station-card" data-slug="${slug}" style="--ci-accent:${color}">
              <div class="checkin-card-top">
                <span class="checkin-station-name-text">${st?.name || slug}</span>
                <span class="checkin-time">${formatCheckinTime(lastTs)}</span>
              </div>
              <div class="checkin-card-bottom" style="margin-top:4px;">
                <span class="checkin-count-badge" style="${badgeStyle}">${visitedExitsCnt} / ${totalExits}</span>
              </div>
            </button>`;
          }).join('');
        }
      }
    }

    s.innerHTML = `
      <div class="sheet-handle-bar">
        <div class="sheet-handle"></div>
        <span class="sheet-sheet-title">Check-in</span>
        <button class="sheet-close-btn" id="checkinClose" aria-label="Закрити">✕</button>
      </div>
      <div class="sheet-body" id="checkinBody">${bodyHtml}${listHtml}</div>`;

    s.querySelector('#checkinClose').addEventListener('click', closeHandler);

    s.querySelectorAll('.ci-sort-btn[data-sort]').forEach(btn => {
      btn.addEventListener('click', () => {
        ciViewMode = 'visited';
        ciSortMode = btn.dataset.sort;
        renderCheckinContent();
      });
    });

    const unvisitedBtn = s.querySelector('.ci-unvisited-btn');
    if (unvisitedBtn) {
      unvisitedBtn.addEventListener('click', () => {
        ciViewMode = 'unvisited';
        renderCheckinContent();
      });
    }

    s.querySelector('.ci-line-rings-row')?.addEventListener('click', e => {
      const card = e.target.closest('.ci-line-ring-card');
      if (!card) return;
      const line = card.dataset.line;
      if (selectedLines.has(line)) selectedLines.delete(line);
      else selectedLines.add(line);
      renderCheckinContent();
    });

    s.querySelectorAll('.checkin-station-card').forEach(card => {
      card.addEventListener('click', () => {
        const sl = card.dataset.slug;
        if (sl) { closeHandler(); setTimeout(() => bus.emit('station:open', { slug: sl }), 380); }
      });
    });
  };

  if (!checkinSheet) {
    checkinSheet            = document.createElement('div');
    checkinSheet.id         = 'checkinSheet';
    checkinSheet.className  = 'station-sheet checkin-journal-sheet';
    document.body.appendChild(checkinSheet);
  }

  renderCheckinContent();

  if (!checkinSheet._swipeBound) {
    checkinSheet._swipeBound = true;
    initKinematicSwipe(
      checkinSheet,
      () => document.getElementById('checkinBody'),
      closeHandler,
    );
  }

  document.querySelectorAll('.station-sheet').forEach(el => el.classList.remove('sheet-open'));
  checkinSheet.classList.add('sheet-open', 'sheet-fullscreen', 'sheet-scrollable');
  sheetOverlay.classList.add('overlay-visible');
}

// ══ BUS-ПІДПИСКИ ══════════════════════════════════════════════

// Замінює: MetroApp.attachCheckinButtons = function(sheetEl, slug, lineColor) {...}
bus.on('checkin:attach-buttons', ({ sheetEl, slug, color }) => {
  attachCheckinButtons(sheetEl, slug, color);
});

// Після toggleCheckin (domain/checkin) → оновлюємо dock та синхронізуємо карту.
// Замінює прямі виклики updateCheckinDock() + MetroApp.syncMapWithCheckins?.() у toggleCheckin.
bus.on('checkin:updated', () => {
  _checkinCount = null;
  updateCheckinDock();
  bus.emit('map:sync-checkins');
});