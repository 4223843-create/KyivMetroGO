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

// ── Кеш SVG шпильок по кольору лінії ───────────────────────
// Оригінал: checkinPinSvg() будує template string на кожен виклик.
// Кольорів ліній рівно 3 (red, blue, green) — кешуємо результат.
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

// ── Кеш кількості check-ins для updateCheckinDock ───────────
// Оригінал: Object.keys(getCheckins()).length — створює масив ключів кожен раз.
// Зберігаємо лічильник окремо.
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
  _checkinCount = null; // інвалідуємо лічильник
  btn.innerHTML = getCheckinCount() > 0
    ? MetroApp.Icons.dockPinFilled
    : MetroApp.Icons.dockPinEmpty;
}

// ══ ШПИЛЬКИ НА КАРТЦІ СТАНЦІЇ ════════════════════════════════
MetroApp.attachCheckinButtons = function(sheetEl, slug, lineColor) {
  if (!isCheckinMode()) return;
  const body = sheetEl.id === 'sheetBody'
    ? sheetEl
    : sheetEl.querySelector('#sheetBody') || document.getElementById('sheetBody');

  if (!body) return;

  body.querySelectorAll('.position-row').forEach((row, posIdx) => {
    const pills   = row.querySelectorAll('.pos-pill');
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

    const btn = document.createElement('button');
    btn.type      = 'button';
    btn.className = `checkin-btn row-checkin-btn${checked ? ' is-checked' : ''}`;
    btn.setAttribute('aria-label', 'Відмітити вихід');
    btn.innerHTML = checkinPinSvg(checked, checked ? lineColor : null);
    btn.style.color = checked ? lineColor : '';
    row.appendChild(btn);

    btn.addEventListener('click', e => {
      e.stopPropagation();
      const nowChecked = toggleCheckin(slug, dir, wagon, doors, lineColor);
      btn.classList.toggle('is-checked', nowChecked);
      btn.innerHTML  = checkinPinSvg(nowChecked, nowChecked ? lineColor : null);
      btn.style.color = nowChecked ? lineColor : '';
      _checkinCount   = null; // інвалідуємо лічильник після toggle
    });
  });
};

// ══ ШТОРКА CHECK-INS ═════════════════════════════════════════
export function formatCheckinTime(ts) {
  const d = new Date(ts);
  const pad = n => String(n).padStart(2, '0');
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function openCheckinSheet() {
  MetroApp.pushSheetHistory?.();
  let s = document.getElementById('checkinSheet');
  const overlay = document.getElementById('sheetOverlay');

  if (!s) {
    s = document.createElement('div');
    s.id        = 'checkinSheet';
    s.className = 'station-sheet sheet-scrollable';
    const tpl   = document.getElementById('tpl-checkin-sheet');
    if (tpl) s.appendChild(tpl.content.cloneNode(true));
    document.body.appendChild(s);

    document.getElementById('checkinClose')?.addEventListener('click', () => {
      MetroApp.animateSheetClose?.(s, () => {
        s.classList.remove('sheet-open');
        if (!document.querySelectorAll('.station-sheet.sheet-open').length)
          overlay.classList.remove('overlay-visible');
      });
    });
    MetroApp.initKinematicSwipe?.(s, s.querySelector('.sheet-body'), () => {
      document.getElementById('checkinClose')?.click();
    });
  }

  const body    = s.querySelector('.sheet-body') || s.querySelector('#checkinBody');
  const all     = getCheckins();
  const entries = Object.values(all).sort((a, b) => b.ts - a.ts);

  if (!body) { s.classList.add('sheet-open'); overlay.classList.add('overlay-visible'); return; }

  if (!entries.length) {
    body.innerHTML = `<p class="fav-empty-text" style="text-align:center; margin-top:40px;">Ще нічого не відмічено</p>`;
  } else {
    const parts = new Array(entries.length);
    for (let i = 0; i < entries.length; i++) {
      const e       = entries[i];
      const station = state.stationsData?.[e.slug];
      const name    = station?.name || e.slug;
      parts[i] = `<div class="checkin-item">
        <div class="checkin-item-line" style="background:${e.color}"></div>
        <div class="checkin-item-body">
          <div class="checkin-item-name">${name}</div>
          <div class="checkin-item-meta">${e.dir ? e.dir + ' · ' : ''}вагон ${e.wagon}, двері ${e.doors}</div>
          <div class="checkin-item-time">${formatCheckinTime(e.ts)}</div>
        </div>
      </div>`;
    }
    body.innerHTML = parts.join('');
  }

  document.querySelectorAll('.station-sheet').forEach(el => el.classList.remove('sheet-open'));
  s.classList.add('sheet-open');
  overlay.classList.add('overlay-visible');
}
