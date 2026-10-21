// ══ ОЗНАЙОМЧИЙ ТУР ══
// Запускається при першому запуску. Підсвічує елемент і просить на нього
// натиснути; до наступного кроку тур переходить лише після цієї дії.
// Порядок: станція на карті → підказки з картки станції (hints.js) → Вибране →
// пошук → налаштування → «Про застосунок». Тур можна пропустити, а з меню
// розробника — запустити знову.
//
// Затемнення — тінь навколо «вікна» (.tour-spot). Дотики поза вікном ловить
// .tour-blocker з дірою (clip-path), тож натиснути можна лише підсвічене.

import { STORAGE_KEYS, Storage } from '../core/storage.js';
import { bus }                   from '../core/eventBus.js';
import { state }                 from '../core/state.js';
import { LINE_COLOR }            from '../core/constants.js';
import { Icons }                 from '../ui/icons.js';
import { lineTextColor }         from '../ui/components.js';
import { getOpenSheet }          from '../ui/sheetNav.js';
import { closeAllSheets }        from '../sheets/sheetsManager.js';
import { findPosition }          from '../data/positions.js';
import { tourHints, setHintsPaused } from './hints.js';
import { isCheckinMode }         from '../domain/checkin.js';
import { openFavSheet }          from './favorites/index.js';
import { openSearchSheet }       from './search.js';
import { openSettingsSheet }     from './settings.js';
import { openAboutSheet }        from '../sheets/aboutSheet.js';

const PAD          = 6;    // поле навколо підсвіченого елемента, px
const NEXT_DELAY   = 900;  // пауза після дії, щоб людина побачила результат, мс
const START_DELAY  = 700;  // після заставки

// Станції, які пропонуємо натиснути на карті (перша видима).
const MAP_STATIONS = ['B.Kontraktova_ploshcha', 'R.Teatralna', 'G.Zoloti_vorota', 'B.Poshtova_ploshcha', 'B.Olimpiiska'];

const $ = id => document.getElementById(id);
const isOpen = id => !!$(id)?.classList.contains('sheet-open');
const dropMenuOpen = () => !!$('dropMenu')?.classList.contains('show');

// ── Цілі ──

function _zoneEls(slug) {
  return [...document.querySelectorAll('#mapInner [id]')].filter(el => el.id.replace(/\d+$/, '') === slug);
}

function _unionRect(els) {
  const rects = els.map(el => el.getBoundingClientRect()).filter(r => r.width || r.height);
  if (!rects.length) return null;
  const left = Math.min(...rects.map(r => r.left)), top = Math.min(...rects.map(r => r.top));
  const right = Math.max(...rects.map(r => r.right)), bottom = Math.max(...rects.map(r => r.bottom));
  return { left, top, right, bottom, width: right - left, height: bottom - top };
}

function _pickMapStation() {
  const vw = window.innerWidth, vh = window.innerHeight - 90; // над доком
  const visible = slug => {
    const r = _unionRect(_zoneEls(slug));
    return r && r.left >= 0 && r.top >= 0 && r.right <= vw && r.bottom <= vh;
  };
  const slugs = Object.keys(state.stationsData || {});
  return MAP_STATIONS.find(visible) || slugs.find(visible) || MAP_STATIONS[0];
}

function _reopenCard() {
  if (!isOpen('stationSheet') && state.currentStationSlug) bus.emit('station:open', { slug: state.currentStationSlug });
}

const _card = sel => isOpen('stationSheet') ? $('sheetBody')?.querySelector(sel) : null;

function _numberedTarget() {
  const s = state.stationsData?.[state.currentStationSlug];
  const targets = isOpen('stationSheet') ? [...$('sheetBody').querySelectorAll('.fav-tap-target')] : [];
  return targets.find(t => {
    const exit = findPosition(s, t.dataset.pos)?.exit;
    return (exit?.numbered_exits || exit?.exit_numbers)?.length;
  }) || targets[0] || null;
}

const CARD_TARGETS = {
  exitFav:     () => _card('.fav-tap-target'),
  exitNumbers: _numberedTarget,
  clock:       () => isOpen('stationSheet') ? $('sheetClockBtn') : null,
  neighbour:   () => _card('.nav-link'),
  checkin:     () => _card('.row-checkin-btn'),
};

// ── Кроки ──
// target()  — елемент для підсвічування (null — ще не з'явився)
// wait      — 'tap' (натиск на ціль), 'hint' (useHint з тим самим id),
//             'station' (відкрилась картка), 'next' (кнопка «Далі»)
// lost()    — людина вийшла з потрібного стану (закрила картку чи меню):
//             повертаємось на back кроків назад

function _mapStep() {
  const slug = _pickMapStation();
  return {
    id: 'map', wait: 'station',
    text: 'Натисніть на&nbsp;станцію, на&nbsp;якій плануєте виходити',
    target: () => _unionRect(_zoneEls(slug)),
    enter: () => { if (getOpenSheet() || dropMenuOpen()) closeAllSheets(true); },
  };
}

const _lineColor = () => lineTextColor(LINE_COLOR[state.stationsData?.[state.currentStationSlug]?.line] || '');

// Check-in — необов'язковий, про нього окремий крок наприкінці туру
function _cardSteps(station) {
  const card = { card: true, lost: () => !isOpen('stationSheet'), lostTo: 'map', restore: _reopenCard };
  // Спершу — що показує картка, далі підказки, які чекають на дію
  return [
    { ...card, id: 'nearest', wait: 'next',
      text: 'Ці вагон і&nbsp;двері&nbsp;— найближчі до&nbsp;виходу з&nbsp;метро',
      target: CARD_TARGETS.exitFav },
    ...tourHints(station)
      .filter(h => h.id !== 'checkin' && !_doneHints.has(h.id))
      .map(h => ({ ...card, id: h.id, wait: 'hint', hint: h.id,
        text: () => h.text(_lineColor()),
        target: CARD_TARGETS[h.id] })),
  ];
}

const _closeSheets = () => { if (getOpenSheet() || dropMenuOpen()) closeAllSheets(true); };
const _sheetRect   = id => isOpen(id) ? $(id) : null;
// «Назад» на крок, якому потрібна відкрита шторка чи меню
const _openMenu    = () => { _closeSheets(); if (!dropMenuOpen()) $('menuBtn')?.click(); };

const REST_STEPS = [
  { id: 'favBtn', wait: 'tap', enter: _closeSheets,
    text: 'Для&nbsp;швидкого доступу додавайте станції та&nbsp;окремі виходи до&nbsp;Вибраного. Натисніть, щоб&nbsp;відкрити його',
    target: () => $('favListBtn') },
  { id: 'favInfo', wait: 'next', lost: () => !isOpen('favSheet'), restore: openFavSheet,
    text: 'Станцію додають серцем у&nbsp;картці, а&nbsp;вихід&nbsp;— подвійним дотиком до&nbsp;вагона й&nbsp;дверей. У&nbsp;налаштуваннях можна зробити так, щоб&nbsp;Вибране відкривалося одразу при&nbsp;запуску',
    target: () => _sheetRect('favSheet') },

  { id: 'searchBtn', wait: 'tap', enter: _closeSheets,
    text: 'Натисніть, щоб&nbsp;відкрити пошук',
    target: () => $('searchBtnTop') },
  { id: 'searchInfo', wait: 'next', lost: () => !isOpen('searchSheet'), restore: openSearchSheet,
    enter: () => setTimeout(() => $('searchInput')?.blur(), 400), // без клавіатури поверх підказки
    text: 'Вкажіть адресу, щоб&nbsp;дізнатися, яка станція найближча. Тут також можна шукати станції за&nbsp;назвою',
    target: () => _sheetRect('searchSheet') },

  { id: 'menuSettings', wait: 'tap', enter: _closeSheets,
    text: 'Натисніть, щоб&nbsp;відкрити меню',
    target: () => $('menuBtn') },
  { id: 'settingsItem', wait: 'tap', lost: () => !dropMenuOpen(), lostTo: 'menuSettings', restore: _openMenu,
    text: 'Натисніть «Налаштування»',
    target: () => dropMenuOpen() ? $('settingsItem') : null },
  { id: 'settingsInfo', wait: 'next', lost: () => !isOpen('settingsSheet'), restore: openSettingsSheet,
    text: 'Тут оновлення даних, тема, доступність, Check&#8209;in і&nbsp;режим редагування',
    target: () => _sheetRect('settingsSheet') },

  { id: 'menuAbout', wait: 'tap', enter: _closeSheets,
    text: 'Ще раз відкрийте меню',
    target: () => $('menuBtn') },
  { id: 'aboutItem', wait: 'tap', lost: () => !dropMenuOpen(), lostTo: 'menuAbout', restore: _openMenu,
    text: 'Натисніть «Про застосунок»',
    target: () => dropMenuOpen() ? $('aboutItem') : null },
  { id: 'aboutInfo', wait: 'next', lost: () => !isOpen('aboutSheet'), restore: openAboutSheet,
    text: 'Тут коротко про&nbsp;можливості застосунку, ранній доступ до&nbsp;Android-версії та&nbsp;звʼязок з&nbsp;розробником',
    target: () => _sheetRect('aboutSheet') },

  // Необов'язкове — без підсвічування, посередині екрана
  { id: 'checkin', wait: 'next', last: true, center: true, enter: _closeSheets,
    text: () => isCheckinMode()
      ? `Відмічайте виходи, якими скористались: натисніть ${_pinIcon()} у&nbsp;картці станції. Check&#8209;in можна вимкнути в&nbsp;налаштуваннях. Гарних поїздок!`
      : `Увімкніть Check&#8209;in у&nbsp;налаштуваннях і&nbsp;відмічайте виходи, якими скористались. Гарних поїздок!`,
    target: () => null },
];

const _pinIcon = () => `<span class="hint-inline-icon">${Icons.dockPinFilled.replace('width="26" height="26"', 'aria-hidden="true"')}</span>`;

// ── Стан ──
let _steps     = null;
let _idx       = 0;
let _layer     = null;
let _raf       = 0;
let _timer     = 0;
let _waiting   = false;   // дія виконана, чекаємо паузу перед наступним кроком
let _doneHints = new Set();
let _offs      = [];

export const isTourActive = () => !!_steps;

/** Перший запуск: ще нічого не збережено на пристрої (ключі режиму розробника не рахуємо). */
function _isFirstLaunch() {
  return !Object.values(STORAGE_KEYS).some(k => !k.startsWith('metro_dev_') && Storage.get(k) != null);
}

/** Викликається з main.js після запуску. Існуючим користувачам тур не показуємо. */
export function maybeStartTour() {
  if (Storage.get(STORAGE_KEYS.TOUR_DONE)) return;
  if (!_isFirstLaunch()) { Storage.set(STORAGE_KEYS.TOUR_DONE, 'skipped'); return; }
  setTimeout(startTour, START_DELAY);
}

/** @param {string} [fromId] — почати з кроку (режим розробника): 'favBtn', 'searchBtn', 'menuSettings', 'menuAbout' */
export function startTour(fromId) {
  if (_steps) return;
  _doneHints = new Set();
  const from = REST_STEPS.findIndex(s => s.id === fromId);
  _steps = from >= 0 ? REST_STEPS.slice(from) : [_mapStep(), ...REST_STEPS];
  _idx = 0;
  setHintsPaused(true);
  _buildLayer();
  _offs = [
    bus.on('station:open', _onStationOpen),
    bus.on('hint:used', ({ id }) => {
      _doneHints.add(id);
      if (_cur()?.hint === id) _advanceLater();
    }),
  ];
  document.addEventListener('click', _onDocClick, true);
  _enter();
  _loop();
}

export function endTour(result = 'done') {
  if (!_steps) return;
  _steps = null;
  clearTimeout(_timer);
  cancelAnimationFrame(_raf);
  _offs.forEach(off => off());
  _offs = [];
  document.removeEventListener('click', _onDocClick, true);
  _layer?.remove();
  _layer = null;
  setHintsPaused(false);
  Storage.set(STORAGE_KEYS.TOUR_DONE, result);
  bus.emit('station:refresh'); // повернути в картку звичайні підказки
}

const _cur = () => _steps?.[_idx];

function _onStationOpen() {
  const step = _cur();
  if (step?.wait !== 'station') return;
  // Кроки картки — за станцією, яку відкрили
  setTimeout(() => {
    if (_cur() !== step) return;
    const station = state.stationsData?.[state.currentStationSlug];
    _steps.splice(_idx + 1, 0, ..._cardSteps(station));
    _advanceLater(400);
  }, 0);
}

function _onDocClick(e) {
  const step = _cur();
  if (step?.wait !== 'tap' || _waiting) return;
  const t = step.target();
  if (t instanceof Element && t.contains(e.target)) _advanceLater(350);
}

function _advanceLater(delay = NEXT_DELAY) {
  if (_waiting) return;
  _waiting = true;
  _layer?.classList.add('is-waiting');
  clearTimeout(_timer);
  _timer = setTimeout(() => _go(_idx + 1), delay);
}

function _go(i) {
  _waiting = false;
  _layer?.classList.remove('is-waiting');
  // Кроки картки, які вже виконали (напр. після повернення на карту), пропускаємо
  while (_steps?.[i]?.hint && _doneHints.has(_steps[i].hint)) i++;
  if (!_steps || i >= _steps.length) { endTour('done'); return; }
  _idx = i;
  _enter();
}

/** «Назад»: попередній крок, з тією шторкою чи меню, що були на ньому. */
function _back() {
  if (_waiting || _idx === 0) return;
  const prev = _steps[_idx - 1];
  if (prev.id === 'map') {
    // Картку перебудуємо, коли станцію відкриють знову
    _steps = _steps.filter(s => !s.card);
    _doneHints.clear();
    _idx = 0;
    _enter();
    return;
  }
  if (prev.hint) _doneHints.delete(prev.hint); // крок знову чекає на дію
  _idx--;
  prev.restore?.();
  _enter();
}

function _enter() {
  const step = _cur();
  step.enter?.();
  const bubble = _layer.querySelector('.tour-bubble');
  const text   = typeof step.text === 'function' ? step.text() : step.text;
  const color  = lineTextColor(LINE_COLOR[state.stationsData?.[state.currentStationSlug]?.line] || '');
  bubble.querySelector('.tour-text').innerHTML = text;
  bubble.querySelector('.tour-icon').style.color = step.hint ? color : '';
  const next = bubble.querySelector('.tour-next');
  next.hidden = step.wait !== 'next';
  next.textContent = step.last ? 'Готово' : 'Далі';
  bubble.querySelector('.tour-skip').hidden = !!step.last;
  bubble.querySelector('.tour-back').hidden = _idx === 0;
  bubble.classList.remove('is-shown');
  _placed = false;
}

// ── Шар туру ──

function _buildLayer() {
  _layer = document.createElement('div');
  _layer.className = 'tour-layer';
  _layer.innerHTML =
    '<div class="tour-blocker"></div>' +
    '<div class="tour-spot"></div>' +
    '<div class="tour-bubble" role="dialog" aria-live="polite" aria-label="Ознайомчий тур">' +
      `<span class="tour-icon">${Icons.info}</span>` +
      '<div class="tour-text"></div>' +
      '<div class="tour-actions">' +
        '<button type="button" class="tour-skip">Пропустити тур</button>' +
        '<button type="button" class="tour-back confirm-main-btn confirm-btn-neutral" hidden>Назад</button>' +
        '<button type="button" class="tour-next confirm-main-btn confirm-btn-save" hidden>Далі</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(_layer);

  const blocker = _layer.querySelector('.tour-blocker');
  // Дотики повз підсвічений елемент нікуди не йдуть (і не закривають меню)
  ['click', 'pointerdown', 'touchstart', 'mousedown'].forEach(type =>
    blocker.addEventListener(type, e => { e.stopPropagation(); if (type === 'click') e.preventDefault(); }));

  _layer.querySelector('.tour-skip').addEventListener('click', () => endTour('skipped'));
  _layer.querySelector('.tour-back').addEventListener('click', _back);
  _layer.querySelector('.tour-next').addEventListener('click', () => {
    const step = _cur();
    if (step.last) { endTour('done'); closeAllSheets(true); return; }
    _go(_idx + 1);
  });
}

let _placed = false;
let _lastKey = '';

function _loop() {
  _raf = requestAnimationFrame(_loop);
  const step = _cur();
  if (!step || !_layer) return;

  if (!_waiting && step.lost?.()) {
    const back = step.lostTo ? _steps.findIndex(s => s.id === step.lostTo) : -1;
    if (back >= 0) {
      if (step.lostTo === 'map') _steps = _steps.filter(s => !s.card); // картку перебудуємо
      _go(_steps.findIndex(s => s.id === step.lostTo));
    } else if (step.wait === 'next') _go(_idx + 1);   // шторку закрили — далі
    return;
  }

  if (step.center) { _renderCenter(); return; }
  const t = step.target();
  const r = t instanceof Element ? t.getBoundingClientRect() : t;
  _render(r && (r.width || r.height) ? r : null);
}

/** Крок без цілі: усе затемнене, підказка посередині. */
function _renderCenter() {
  if (_placed) return;
  _layer.querySelector('.tour-spot').classList.add('is-empty');
  _layer.querySelector('.tour-blocker').style.clipPath = '';
  const bubble = _layer.querySelector('.tour-bubble');
  bubble.style.top = `${Math.max(16, (window.innerHeight - bubble.offsetHeight) / 2)}px`;
  bubble.classList.add('is-shown');
  _placed = true;
  _lastKey = '';
}

function _render(r) {
  const spot    = _layer.querySelector('.tour-spot');
  const blocker = _layer.querySelector('.tour-blocker');
  const bubble  = _layer.querySelector('.tour-bubble');
  const vw = window.innerWidth, vh = window.innerHeight;

  if (!r) {
    // Ціль ще не з'явилась (шторка відкривається) — просто затемнюємо все
    spot.classList.add('is-empty');
    blocker.style.clipPath = '';
    bubble.classList.remove('is-shown');
    _placed = false;
    return;
  }

  const x1 = Math.max(0, r.left - PAD),  y1 = Math.max(0, r.top - PAD);
  const x2 = Math.min(vw, r.right + PAD), y2 = Math.min(vh, r.bottom + PAD);
  const key = [x1, y1, x2, y2].map(Math.round).join(',');
  if (key === _lastKey && _placed) return;
  _lastKey = key;

  spot.classList.remove('is-empty');
  Object.assign(spot.style, { left: `${x1}px`, top: `${y1}px`, width: `${x2 - x1}px`, height: `${y2 - y1}px` });
  blocker.style.clipPath =
    `polygon(evenodd, 0 0, ${vw}px 0, ${vw}px ${vh}px, 0 ${vh}px, 0 0, ${x1}px ${y1}px, ${x2}px ${y1}px, ${x2}px ${y2}px, ${x1}px ${y2}px, ${x1}px ${y1}px)`;

  // Підказка — під ціллю, якщо там є місце, інакше над нею, інакше поверх угорі
  const bh = bubble.offsetHeight, gap = 14;
  const safeTop = 16 + (parseFloat(getComputedStyle(_layer).paddingTop) || 0); // env(safe-area-inset-top)
  let top;
  if (y2 + gap + bh <= vh - 16)       top = y2 + gap;
  else if (y1 - gap - bh >= safeTop)  top = y1 - gap - bh;
  else                                top = safeTop;
  bubble.style.top = `${top}px`;
  bubble.classList.add('is-shown');
  _placed = true;
}
