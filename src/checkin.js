import { state }       from './state.js';
import { STORAGE_KEYS, Storage } from './storage.js';

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
  return val === null ? true : val === 'true'; // за замовч. увімкнено
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

      // При першому натисканні шпильки — прибираємо підказку про check-in
      const checkinHint = document.getElementById('checkinHint');
      if (checkinHint) MetroApp.dismissHintWithDoors?.(checkinHint);
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
let ciSortMode = 'date'; // 'date' | 'alpha'
let ciViewMode = 'visited'; // 'visited' | 'unvisited'

export function openCheckinSheet() {
  MetroApp.pushSheetHistory(); // <--- ДОДАНО
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
    const s       = document.getElementById('checkinSheet');
    const all     = getCheckins();
    const entries = Object.values(all);
    let bodyHtml  = '';

    if (!entries.length) {
      const colors = Object.values(MetroApp.LINE_COLOR);
      const color  = colors[state.emptyFavColorIdx % colors.length];
      state.emptyFavColorIdx++;
      // Іконка пін — зменшена та вирівняна в рядку тексту (розмір і відступ як у серці у «Вибраному»)
      const coloredPin = MetroApp.Icons.dockPinFilled
        .replace(/currentColor/g, color)
        .replace('translateY(-3px)', 'translateY(0)') // Прибрали зсув самої іконки
        .replace('width="26" height="26"', 'width="20" height="20"')
        .replace('opacity="0.5"', '');
      // Змінили vertical-align з -7px на -3px
      const pinInline = `<span style="display:inline-block;width:20px;height:20px;vertical-align:-3px;">${coloredPin}</span>`;
      bodyHtml = `<p class="fav-empty-text-lg">Натисніть ${pinInline} щоб&nbsp;позначити вихід зі&nbsp;станції як&nbsp;відвіданий</p>`;
    } else {
      const byStation = {};
      entries.forEach(e => { if (!byStation[e.slug]) byStation[e.slug] = []; byStation[e.slug].push(e); });

      // Унікальні фізичні виходи: один вихід (вагон+двері) може мати check-in для кількох
      // напрямків — це все одна точка зупинки. Рахуємо її лише раз.
      const uniqueExits   = new Set(entries.map(e => `${e.slug}|${e.wagon}|${e.doors}`)).size;
const totalExitsAll = state.stationsData
        ? Object.values(state.stationsData).reduce((sum, st) => sum + (st.positions ? st.positions.filter(p => !p.closed).length : 0), 0)
        : 0;
      const stationCount = Object.keys(byStation).length;

      // ── НОВА РОЗУМНА ЛОГІКА ВІДСОТКІВ ──
      const rawPercent = totalExitsAll > 0 ? (uniqueExits / totalExitsAll) * 100 : 0;
      let coverage = "0";

      if (totalExitsAll > 0 && uniqueExits > 0) {
        if (uniqueExits === totalExitsAll) {
          coverage = "100";
        } else if (rawPercent < 1) {
          coverage = "&lt;1"; // Використовуємо &lt; замість < для коректного HTML
        } else if (rawPercent > 99) {
          coverage = "&gt;99"; // Використовуємо &gt; замість >
        } else {
          coverage = Math.floor(rawPercent).toString();
        }
      }
      bodyHtml += `<div class="ci-stats-bar">
        <div class="ci-stat"><span class="ci-stat-num">${stationCount}</span><span class="ci-stat-lbl">станцій</span></div>
        <div class="ci-stat-sep"></div>
        <div class="ci-stat"><span class="ci-stat-num">${uniqueExits}</span><span class="ci-stat-lbl">виходів</span></div>
        <div class="ci-stat-sep"></div>
        <div class="ci-stat"><span class="ci-stat-num">${coverage}%</span><span class="ci-stat-lbl">охоплення</span></div>
      </div>
      <div class="ci-coverage-track"><div class="ci-coverage-fill" style="width:${coverage}%"></div></div>`;

      // ── Сортування ──
      bodyHtml += `<div class="ci-sort-bar">
        <button class="ci-sort-btn${ciSortMode === 'date'  ? ' ci-sort-active' : ''}" data-sort="date">Нові ↓</button>
        <button class="ci-sort-btn${ciSortMode === 'alpha' ? ' ci-sort-active' : ''}" data-sort="alpha">А→Я</button>
        <button class="ci-sort-btn ci-unvisited-btn${ciViewMode === 'unvisited' ? ' ci-sort-active' : ''}" data-view="unvisited">Не відвідані</button>
      </div>`;

      // ── Режим «Не відвідані» ──
      if (ciViewMode === 'unvisited') {
        const checkins = getCheckins();
        const visitedKeys = new Set(Object.values(checkins).map(e => `${e.slug}|${e.wagon}|${e.doors}`));
        let unvisitedHtml = '';
        if (state.stationsData) {
          const stationList = Object.entries(state.stationsData)
            .filter(([, st]) => st.positions && st.positions.some(p => !p.closed))
            .sort(([, a], [, b]) => a.name.localeCompare(b.name, 'uk'));
          stationList.forEach(([slug, st]) => {
            const unvisited = st.positions.filter(p => !p.closed && !visitedKeys.has(`${slug}|${p.wagon}|${p.doors}`));
            if (!unvisited.length) return;
            const color = MetroApp.LINE_COLOR[st.line] || 'var(--text-muted)';
            const exitLabels = unvisited.map(p => {
              const label = p.label || p.exit || '';
              return label ? `<span class="ci-unvisited-exit">${label}</span>` : `<span class="ci-unvisited-exit">вагон ${p.wagon} · дв. ${p.doors}</span>`;
            }).join('');
            unvisitedHtml += `<div class="checkin-station-card ci-unvisited-card" data-slug="${slug}" style="--ci-accent:${color}">
              <div class="checkin-card-top">
                <span class="checkin-station-name-text">${st.name}</span>
                <span class="ci-unvisited-count">${unvisited.length}</span>
              </div>
              <div class="ci-unvisited-exits">${exitLabels}</div>
            </div>`;
          });
        }
        bodyHtml += unvisitedHtml || `<p class="fav-empty-text-lg" style="text-align:center;padding:32px 16px;">Всі виходи відвідані 🎉</p>`;
        // skip normal visited rendering below
        const s = document.getElementById('checkinSheet');
        s.innerHTML = `
          <div class="sheet-handle-bar">
            <div class="sheet-handle"></div>
            <span class="sheet-sheet-title">Check-in</span>
            <button class="sheet-close-btn" id="checkinClose" aria-label="Закрити">✕</button>
          </div>
          <div class="sheet-body">${bodyHtml}</div>`;
        s.querySelector('#checkinClose').addEventListener('click', closeHandler);
        s.querySelectorAll('.ci-sort-btn[data-sort]').forEach(btn => {
          btn.addEventListener('click', e => { e.stopPropagation(); ciViewMode = 'visited'; ciSortMode = btn.dataset.sort; renderCheckinContent(); });
        });
        s.querySelector('.ci-unvisited-btn').addEventListener('click', e => { e.stopPropagation(); ciViewMode = 'unvisited'; renderCheckinContent(); });
        s.querySelectorAll('.ci-unvisited-card').forEach(card => {
          card.addEventListener('click', () => {
            const sl = card.dataset.slug;
            if (sl) { closeHandler(); setTimeout(() => MetroApp.openStation?.(sl), 380); }
          });
        });
        return;
      }

      let stationEntries = Object.entries(byStation);
      if (ciSortMode === 'date') {
        // Нещодавні вгорі
        stationEntries.sort(([, a], [, b]) =>
          Math.max(...b.map(e => e.ts || 0)) - Math.max(...a.map(e => e.ts || 0))
        );
      } else {
        // За алфавітом (uk locale)
        stationEntries.sort(([slugA], [slugB]) => {
          const nameA = state.stationsData?.[slugA]?.name || slugA;
          const nameB = state.stationsData?.[slugB]?.name || slugB;
          return nameA.localeCompare(nameB, 'uk');
        });
      }

      bodyHtml += stationEntries.map(([slug, items]) => {
        const st           = state.stationsData?.[slug];
        const color        = items[0].color || (st ? MetroApp.LINE_COLOR[st.line] : 'var(--text-muted)');
        const name         = st ? st.name : slug;
        const totalExits   = st?.positions ? st.positions.filter(p => !p.closed).length : 0;
        const checkedCount = items.length;
        const lastTs       = Math.max(...items.map(e => e.ts || 0));
        const maxDots      = Math.min(totalExits, 40);
        const dotsHtml     = Array.from({ length: maxDots }, (_, i) =>
          i < checkedCount
            ? `<span class="checkin-dot is-visited" style="--ci-color:${color}"></span>`
            : `<span class="checkin-dot is-empty"></span>`
        ).join('');

        return `<button class="checkin-station-card" data-slug="${slug}" style="--ci-accent:${color}">
          <div class="checkin-card-top">
            <span class="checkin-station-name-text">${name}</span>
            <span class="checkin-time">${formatCheckinTime(lastTs)}</span>
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

    // ── Перемикач сортування / режиму ──
    s.querySelectorAll('.ci-sort-btn[data-sort]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        ciViewMode = 'visited';
        ciSortMode = btn.dataset.sort;
        renderCheckinContent();
      });
    });
    const unvisitedBtn = s.querySelector('.ci-unvisited-btn');
    if (unvisitedBtn) {
      unvisitedBtn.addEventListener('click', e => {
        e.stopPropagation();
        ciViewMode = 'unvisited';
        renderCheckinContent();
      });
    }

    s.querySelectorAll('.checkin-station-card').forEach(card => {
      card.addEventListener('click', () => {
        const sl = card.dataset.slug;
        if (sl) { closeHandler(); setTimeout(() => MetroApp.openStation?.(sl), 380); }
      });
    });
  };

  if (!checkinSheet) {
    checkinSheet = document.createElement('div');
    checkinSheet.id        = 'checkinSheet';
    checkinSheet.className = 'station-sheet checkin-journal-sheet';
    document.body.appendChild(checkinSheet);
  }

  // Оновлюємо посилання на closeHandler для swipe-слухача (реєструється лише раз)
  checkinSheet._closeHandler = closeHandler;
  if (!checkinSheet._hasSwipeListener) {
    MetroApp.initKinematicSwipe(checkinSheet, checkinSheet.querySelector('.sheet-body'), () => {
      checkinSheet._closeHandler?.();
    });
    checkinSheet._hasSwipeListener = true;
  }

  renderCheckinContent();
  document.querySelectorAll('.station-sheet').forEach(el => el.classList.remove('sheet-open'));
  checkinSheet.classList.add('sheet-open', 'sheet-fullscreen', 'sheet-scrollable');
  sheetOverlay.classList.add('overlay-visible');
}
