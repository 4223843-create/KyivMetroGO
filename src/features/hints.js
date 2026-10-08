// ══ ПІДКАЗКИ У КАРТЦІ СТАНЦІЇ ══
// Одна підказка за раз — перша з переліку, яку ще не використали і яка має
// сенс для цієї станції. Підказка показується на кожній картці, доки людина
// не скористається функцією або не змахне підказку вбік. Після цього вона
// більше не з'являється. «Приховати підказки» в налаштуваннях ховає всі.

import { STORAGE_KEYS, Storage } from '../core/storage.js';
import { getPref }               from '../core/prefs.js';
import { bus }                   from '../core/eventBus.js';
import { state }                 from '../core/state.js';
import { Icons }                 from '../ui/icons.js';
import { lineTextColor }         from '../ui/components.js';
import { dismissHintWithDoors }  from '../ui/animations.js';
import { getExitFavs }           from '../domain/favorites.js';
import { getCheckins, isCheckinMode } from '../domain/checkin.js';
import { hasStationClock }       from '../sheets/renderStation.js';

const CLOCK_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9.5"/><path d="M12 6.5V12l3.5 2"/></svg>`;
const PIN_ICON   = Icons.dockPinFilled.replace('width="26" height="26"', 'aria-hidden="true"');
const inlineIcon = (svg, color) => `<span class="hint-inline-icon" style="color:${color}">${svg}</span>`;

const hasNumberedExits = s => !!s.directions?.some(d =>
  d.exits?.some(ex => (ex.numbered_exits || ex.exit_numbers)?.length));

// Порядок = черговість показу.
const HINTS = [
  {
    id:      'exitFav',
    applies: () => true,
    used:    () => getExitFavs().length > 0,
    text:    () => 'Натисніть двічі на&nbsp;вагон і&nbsp;двері, щоб&nbsp;зберегти вихід',
  },
  {
    id:      'exitNumbers',
    applies: s => hasNumberedExits(s),
    text:    () => 'Натисніть на&nbsp;вагон і&nbsp;двері, щоб&nbsp;побачити номери виходів та&nbsp;назви орієнтирів',
  },
  {
    id:      'clock',
    applies: s => hasStationClock(s),
    text:    c => `Натисніть ${inlineIcon(CLOCK_ICON, c)} угорі, щоб&nbsp;побачити інтервал руху та&nbsp;попередження про&nbsp;скоре закриття станції`,
  },
  {
    id:      'neighbour',
    applies: s => !!s.directions?.some(d => d.from_slug && d.from_slug !== s.slug && state.stationsData?.[d.from_slug]),
    text:    () => 'Ви можете швидко перейти до&nbsp;сусідньої станції, натиснувши на&nbsp;назву попередньої станції',
  },
  {
    id:      'checkin',
    applies: () => isCheckinMode(),
    used:    () => Object.keys(getCheckins()).length > 0,
    text:    c => `Натисніть ${inlineIcon(PIN_ICON, c)}, щоб&nbsp;позначити вихід зі&nbsp;станції як&nbsp;відвіданий`,
  },
];

// ── Що вже використано ──
function _doneSet() {
  try {
    const list = JSON.parse(Storage.get(STORAGE_KEYS.HINTS_DONE) || '[]');
    return new Set(Array.isArray(list) ? list : []);
  } catch {
    return new Set();
  }
}

function _isDone(hint) {
  return _doneSet().has(hint.id) || !!hint.used?.();
}

function _markDone(id) {
  const done = _doneSet();
  if (done.has(id)) return;
  done.add(id);
  Storage.set(STORAGE_KEYS.HINTS_DONE, JSON.stringify([...done]));
}

// Підказка, що зараз у картці: перемальовування картки має показати ту саму,
// а не перескочити на наступну без анімації.
let _shown = null; // { id, slug }

function _pick(station) {
  if (!station || getPref('hideInfoBlocks')) return null;
  if (_shown?.slug === station.slug) {
    const same = HINTS.find(h => h.id === _shown.id);
    if (same && same.applies(station) && !_isDone(same)) return same;
  }
  return HINTS.find(h => h.applies(station) && !_isDone(h)) || null;
}

function _hintHtml(hint, color) {
  const c = lineTextColor(color);
  return `<div class="onboarding-hint" id="stationHint" data-hint="${hint.id}" role="note">` +
    `<span class="hint-icon-wrap" style="color:${c}">${Icons.info}</span>` +
    `<span class="hint-text">${hint.text(c)}</span></div>`;
}

/**
 * Місце для підказки в картці станції (порожнє, якщо показувати нічого).
 * Викликається при кожному рендері картки.
 */
export function renderHintSlot(station, color) {
  const hint = _pick(station);
  _shown = hint ? { id: hint.id, slug: station.slug } : null;
  return `<div class="hint-slot" id="hintSlot" data-color="${color}">${hint ? _hintHtml(hint, color) : ''}</div>`;
}

/** Показує в уже відкритій картці наступну підказку (після використання попередньої). */
function _showNext(station) {
  const slot = document.getElementById('hintSlot');
  if (!slot || slot.firstElementChild) return;
  const hint = _pick(station);
  if (!hint) return;
  _shown = { id: hint.id, slug: station.slug };
  slot.innerHTML = _hintHtml(hint, slot.dataset.color);
}

/**
 * Людина скористалася функцією, про яку підказка: більше її не показуємо.
 * Якщо саме ця підказка зараз у картці — вона розсувається і на її місці
 * з'являється наступна.
 */
export function useHint(id, station = state.stationsData?.[state.currentStationSlug]) {
  _markDone(id);
  const el = document.getElementById('stationHint');
  if (!el || el.dataset.hint !== id) return;
  _shown = null;
  dismissHintWithDoors(el, () => _showNext(station));
}

// ── Змахнути підказку вбік = використати її ──
const SWIPE_DISTANCE = 0.3;  // частка ширини підказки
const SWIPE_SPEED    = 0.5;  // px/мс — швидкий змах спрацьовує й на коротшій відстані

let _drag = null;

function _onPointerDown(e) {
  const el = e.target.closest('#stationHint');
  if (!el || (e.pointerType === 'mouse' && e.button !== 0)) return;
  _drag = { el, id: e.pointerId, x0: e.clientX, y0: e.clientY, t0: e.timeStamp, dx: 0, active: false };
}

function _onPointerMove(e) {
  if (!_drag || e.pointerId !== _drag.id) return;
  const dx = e.clientX - _drag.x0;
  const dy = e.clientY - _drag.y0;
  if (!_drag.active) {
    if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { _drag = null; return; } // прокрутка
    if (Math.abs(dx) < 8) return;
    _drag.active = true;
    _drag.el.setPointerCapture?.(e.pointerId);
    _drag.el.classList.add('is-dragging');
  }
  _drag.dx = dx;
  const w = _drag.el.offsetWidth || 1;
  _drag.el.style.transform = `translateX(${dx}px)`;
  _drag.el.style.opacity   = String(Math.max(0.15, 0.85 * (1 - Math.abs(dx) / w)));
}

function _onPointerUp(e) {
  if (!_drag || e.pointerId !== _drag.id) return;
  const { el, dx, t0, active } = _drag;
  _drag = null;
  if (!active) return;
  el.classList.remove('is-dragging');
  const speed = Math.abs(dx) / Math.max(1, e.timeStamp - t0);
  const far   = Math.abs(dx) > el.offsetWidth * SWIPE_DISTANCE;
  if (e.type === 'pointerup' && (far || speed > SWIPE_SPEED)) _flyAway(el, Math.sign(dx));
  else { el.style.transform = ''; el.style.opacity = ''; }
}

function _flyAway(el, dir) {
  _markDone(el.dataset.hint);
  _shown = null;
  el.style.transform = `translateX(${dir * 110}%)`;
  el.style.opacity   = '0';
  el.classList.add('is-leaving'); // згортає висоту, щоб картка не смикалась
  setTimeout(() => el.remove(), 320);
}

export function initHintGestures(sheetBody) {
  sheetBody.addEventListener('pointerdown',   _onPointerDown);
  sheetBody.addEventListener('pointermove',   _onPointerMove);
  sheetBody.addEventListener('pointerup',     _onPointerUp);
  sheetBody.addEventListener('pointercancel', _onPointerUp);
}

// Перша відмітка Check-in — з картки станції чи з будь-якого іншого місця
bus.on('checkin:updated', () => {
  if (Object.keys(getCheckins()).length > 0) useHint('checkin');
});
