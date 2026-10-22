// ══ ОЗНАЙОМЧИЙ ТУР ══
// Запускається при першому запуску. Підсвічує елемент і просить на нього
// натиснути; до наступного кроку тур переходить лише після цієї дії.
// Порядок: станція на карті → підказки з картки станції (hints.js, серед них
// Check-in) → статистика й штриховка Check-in → Вибране → пошук → «Про застосунок». Тур можна пропустити, а з меню
// розробника — запустити знову.
//
// Затемнення — .tour-blocker з дірками (clip-path) на місці підсвічених
// елементів; він же ловить дотики поза ними, тож натиснути можна лише підсвічене.
// .tour-spot — прозорі рамки над дірками (позначають ціль, нічого не малюють).

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
import { isCheckinMode, isStationCheckinMode, getCheckins } from '../domain/checkin.js';
import { showToast }             from '../ui/toast.js';
import { openFavSheet }          from './favorites/index.js';
import { openSearchSheet }       from './search.js';
import { openAboutSheet }        from '../sheets/aboutSheet.js';
import { isFav, isExitFav }      from '../domain/favorites.js';
import { openCheckinSheet }      from './checkin/index.js';

const PAD          = 6;    // поле навколо підсвіченого елемента, px
const NEXT_DELAY   = 900;  // пауза після дії, щоб людина побачила результат, мс
const START_DELAY  = 700;  // після заставки
const AFTER_DELAY  = 3000; // скільки підсвічене розгорнуте після дії, мс

const TAP_SHOW     = 520;  // скільки триває показ дотику перед дією, мс
const SEARCH_DEMO  = 'Володимирська, 57'; // Будинок Центральної Ради УНР

// Станції, які пропонуємо натиснути на карті (перша видима).
const MAP_STATIONS = ['B.Ploshcha_Ukrainskikh_heroiv', 'B.Kontraktova_ploshcha', 'R.Teatralna', 'G.Zoloti_vorota', 'B.Olimpiiska'];

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

// Станція, з якої почались кроки картки («Назад» із сусідньої повертає на неї)
let _cardSlug = null;
function _reopenTourCard() {
  if (!_cardSlug || (isOpen('stationSheet') && state.currentStationSlug === _cardSlug)) return;
  bus.emit('station:open', { slug: _cardSlug });
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

// Розгорнуте після дії — підсвічується кілька секунд, щоб людина його роздивилась
const AFTER_TARGETS = {
  exitNumbers: () => _card('.pos-numbered-exits.panel-open'),
  clock:       () => _card('#stationClockPanel.panel-open'),
  neighbour:   () => isOpen('stationSheet') ? $('stationTitleMain') : null,
};

/** Перші вагон і двері — разом із підписом пересадки над ними, якщо він є. */
function _nearestTarget() {
  const pills = _card('.fav-tap-target');
  const label = pills?.closest('.position-row')?.previousElementSibling;
  return label?.querySelector('.transfer-label') ? _unionRect([label, pills]) : pills;
}

const CARD_TARGETS = {
  exitFav:     () => _card('.fav-tap-target'),
  exitNumbers: _numberedTarget,
  clock:       () => isOpen('stationSheet') ? $('sheetClockBtn') : null,
  // Назва цієї станції й підпис сусідньої, на яку перейдемо
  neighbour:   () => isOpen('stationSheet') ? [$('stationTitleMain'), _card('.nav-link')].filter(Boolean) : null,
  stationFav:  () => isOpen('stationSheet') ? $('stationSheet').querySelector('.fav-btn-bar') : null,
  // «За станціями» — пін угорі картки, «за виходами» — пін першого виходу
  checkin:     () => isStationCheckinMode()
    ? (isOpen('stationSheet') && !$('sheetCheckinBtn')?.hidden ? $('sheetCheckinBtn') : null)
    : _card('.row-checkin-btn'),
};

// ── Кроки ──
// target()  — елемент для підсвічування (null — ще не з'явився)
// wait      — 'tap' (натиск на ціль), 'hint' (useHint з тим самим id),
//             'station' (відкрилась картка), 'fav' (станцію додали у Вибране),
//             'next' (кнопка «Далі»)
// menu()    — ціль у меню: поки меню закрите, підсвічуємо кнопку меню
// tapTarget() — що натискає «Далі», коли підсвічено кілька елементів
// skip()    — що зробити замість людини, коли вона натискає «Далі»
//             (типово — натиснути ціль; дотик показуємо кружечком)
// lost()    — людина вийшла з потрібного стану (закрила картку чи меню):
//             повертаємось на крок lostTo
// restore() — відкриває шторку чи меню кроку, коли на нього прийшли кнопкою
// after()   — що підсвітити кілька секунд після дії (розгорнута панель)

function _mapStep() {
  const slug = _pickMapStation();
  return {
    id: 'map', wait: 'station', slug,
    text: 'Натисніть на&nbsp;станцію, на&nbsp;якій плануєте виходити',
    target: () => _unionRect(_zoneEls(slug)),
    enter: () => { if (getOpenSheet() || dropMenuOpen()) closeAllSheets(true); },
  };
}

/** Відвідані станції на карті (Check-in) — кожна окремою рамкою. */
function _visitedZones() {
  const slugs = [...new Set(Object.values(getCheckins()).map(e => e.slug))];
  return slugs.map(slug => _unionRect(_zoneEls(slug))).filter(Boolean);
}

/** Поле пошуку й перші результати. */
function _searchTarget() {
  if (!isOpen('searchSheet')) return null;
  const rows = [...($('searchResults')?.children || [])].slice(0, 3);
  return _unionRect([$('searchSheet').querySelector('.search-input-wrap'), ...rows].filter(Boolean));
}

/** Вводить у пошук адресу-приклад, як людина (без клавіатури поверх підказки). */
function _searchDemo() {
  setTimeout(() => {
    const input = $('searchInput');
    if (!input || !isOpen('searchSheet')) return;
    input.value = SEARCH_DEMO;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.blur();
  }, 400);
}

const _lineColor = () => lineTextColor(LINE_COLOR[state.stationsData?.[state.currentStationSlug]?.line] || '');

function _cardSteps(station) {
  const card = { card: true, lost: () => !isOpen('stationSheet'), lostTo: 'map', restore: _reopenTourCard };
  // Спершу — що показує картка, далі підказки, які чекають на дію
  return [
    { ...card, id: 'nearest', wait: 'next',
      text: 'Ці вагон і&nbsp;двері найближчі до&nbsp;виходу з&nbsp;метро або&nbsp;пересадки',
      target: _nearestTarget },
    ...tourHints(station)
      .filter(h => !_doneHints.has(h.id))
      .flatMap(h => {
        const step = { ...card, id: h.id, wait: 'hint', hint: h.id,
          text: () => h.text(_lineColor()),
          target: CARD_TARGETS[h.id],
          after: AFTER_TARGETS[h.id] };
        // «Далі» на збереженні виходу зберігає його сам (подвійний дотик)
        if (h.id === 'exitFav') return [{ ...step, skip: () => {
          const t = CARD_TARGETS.exitFav();
          if (t && !isExitFav(state.currentStationSlug, t.dataset.pos)) { t.click(); t.click(); }
        } }];
        // Повторний дотик зняв би відмітку
        if (h.id === 'checkin') return [{ ...step, skip: () => {
          const t = CARD_TARGETS.checkin();
          if (t && !t.classList.contains('is-checked')) t.click();
        } }];
        // Відкриту раніше панель годинника дотик закрив би — закриваємо заздалегідь
        if (h.id === 'clock') return [{ ...step, enter: () => {
          if ($('stationClockPanel')?.classList.contains('panel-open')) $('sheetClockBtn')?.click();
        } }];
        if (h.id !== 'neighbour') return [step];
        // На сусідній станції — додати її серцем: у Вибраному будуть і вихід, і станція
        return [
          { ...step, tapTarget: () => _card('.nav-link') },
          { ...card, id: 'stationFav', wait: 'fav',
            text: `Натисніть серце, щоб&nbsp;додати станцію до&nbsp;${_sc('Вибраного')}`,
            target: CARD_TARGETS.stationFav, restore: _reopenCard,
            skip: () => { if (!isFav(state.currentStationSlug)) CARD_TARGETS.stationFav()?.click(); } },
        ];
      }),
  ];
}

const _closeSheets = () => { if (getOpenSheet() || dropMenuOpen()) closeAllSheets(true); };
const _sheetRect   = id => isOpen(id) ? $(id) : null;
const _closeMenu   = () => { const m = $('dropMenu'); if (m) { m.classList.remove('show'); m.hidden = true; } };

/** Меню вже розгорнуте, коли показуємо підказку про його пункт. */
function _openMenu() {
  if (getOpenSheet()) closeAllSheets(true);
  if (!dropMenuOpen()) $('menuBtn')?.click();
}

// «Вибране» в текстах — капітеллю, як у решті застосунку
const _sc = word => `<span style="font-variant:small-caps;letter-spacing:0.04em">${word}</span>`;

/** Крок із ціллю в меню: спершу — кнопка меню, після її натиску — сам пункт. */
function _inMenu(id) {
  return { menu: true, target: () => dropMenuOpen() ? $(id) : $('menuBtn') };
}

const REST_STEPS = [
  // Check-in: відмітку поставили в картці — далі статистика й карта
  { id: 'checkinBtn', wait: 'tap', enter: _closeSheets, when: isCheckinMode, ..._inMenu('checkinBtn'),
    text: () => `Розгорніть меню і&nbsp;натисніть ${_pinIcon()}, щоб&nbsp;відкрити статистику відвіданих станцій` },
  { id: 'checkinInfo', wait: 'next', lost: () => !isOpen('checkinSheet'), restore: openCheckinSheet, when: isCheckinMode,
    text: `На&nbsp;сторінці ${_sc('Check-in')} відображається, який відсоток станцій ви відвідали`,
    target: () => _sheetRect('checkinSheet') },
  { id: 'checkinMap', wait: 'next', enter: _closeSheets, when: isCheckinMode,
    text: () => isStationCheckinMode()
      ? 'Відвідані станції штрихуються на&nbsp;карті'
      : 'Відвідані станції штрихуються на&nbsp;карті. Якщо відвідані всі виходи на&nbsp;станції, штриховка змінить напрямок і&nbsp;стане темнішою',
    target: _visitedZones },

  { id: 'favBtn', wait: 'tap', enter: _closeSheets,
    text: `У&nbsp;${_sc('Вибраному')} можна зберігати як&nbsp;станції, так&nbsp;і&nbsp;окремі виходи зі&nbsp;станцій`,
    target: () => $('favListBtn') },
  { id: 'favInfo', wait: 'next', lost: () => !isOpen('favSheet'), restore: openFavSheet,
    text: `${_sc('Вибране')} може відображатись при&nbsp;запуску застосунку, якщо задане відповідне налаштування`,
    target: () => _sheetRect('favSheet') },

  { id: 'searchBtn', wait: 'tap', enter: _closeSheets,
    text: 'Пошук по&nbsp;станціям та&nbsp;адресам',
    target: () => $('searchBtnTop') },
  { id: 'searchInfo', wait: 'next', lost: () => !isOpen('searchSheet'), restore: openSearchSheet,
    enter: _searchDemo,
    text: 'Вкажіть адресу, щоб&nbsp;дізнатися, яка станція найближча. Тут також можна шукати станції за&nbsp;назвою',
    target: _searchTarget },

  { id: 'menuAbout', wait: 'tap', enter: _closeSheets, ..._inMenu('aboutItem'),
    text: `В&nbsp;меню ${_sc('Про застосунок')} ви знайдете інформацію про&nbsp;базові функції та&nbsp;зможете підтримати розробку застосунку` },
  // Вікно говорить саме за себе — лише кнопки
  { id: 'aboutInfo', wait: 'next', lost: () => !isOpen('aboutSheet'), restore: openAboutSheet, enter: _closeMenu,
    text: '', target: () => _sheetRect('aboutSheet'), bubbleAt: 'bottom' },

  // Останнє: меню вже розгорнуте, налаштування відкриваються на кілька секунд,
  // потім тур закриває все
  { id: 'settings', wait: 'tap', enter: _openMenu, target: () => dropMenuOpen() ? $('settingsItem') : null,
    text: 'Налаштуйте зовнішній вигляд та&nbsp;додатковий функціонал тут',
    after: () => _sheetRect('settingsSheet') },
];

const _pinIcon = () => `<span class="hint-inline-icon">${Icons.dockPinFilled.replace('width="26" height="26"', 'aria-hidden="true"')}</span>`;

// ── Стан ──
let _steps     = null;
let _idx       = 0;
let _layer     = null;
let _raf       = 0;
let _timer     = 0;
let _waiting   = false;   // дія виконана, чекаємо паузу перед наступним кроком
let _tapping   = false;   // «Далі» показує дотик, за мить виконає дію
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

/** @param {string} [fromId] — почати з кроку (режим розробника): 'favBtn', 'searchBtn', 'menuAbout' */
export function startTour(fromId) {
  if (_steps) return;
  _doneHints = new Set();
  const rest = REST_STEPS.filter(s => !s.when || s.when());
  const from = rest.findIndex(s => s.id === fromId);
  _steps = from >= 0 ? rest.slice(from) : [_mapStep(), ...rest];
  _idx = 0;
  setHintsPaused(true);
  _buildLayer();
  _offs = [
    bus.on('station:open', _onStationOpen),
    bus.on('fav:updated', () => {
      if (_cur()?.wait === 'fav' && isFav(state.currentStationSlug)) _advanceLater();
    }),
    bus.on('hint:used', ({ id }) => {
      _doneHints.add(id);
      const step = _cur();
      if (step?.hint === id) _advanceLater(step.after ? AFTER_DELAY : NEXT_DELAY);
    }),
  ];
  document.addEventListener('click', _onDocClick, true);
  _enter();
  _loop();
}

export function endTour(result = 'done') {
  if (!_steps) return;
  _steps = null;
  _tapping = false;
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
    _cardSlug = state.currentStationSlug;
    const station = state.stationsData?.[_cardSlug];
    _steps.splice(_idx + 1, 0, ..._cardSteps(station));
    _advanceLater(400);
  }, 0);
}

function _onDocClick(e) {
  const step = _cur();
  if (step?.wait !== 'tap' || _waiting) return;
  if (step.menu && !dropMenuOpen()) return; // це лише відкрило меню
  const t = step.target();
  if (t instanceof Element && t.contains(e.target)) _advanceLater(step.after ? AFTER_DELAY : 350);
}

/** «Далі»: на кроці з дією — показує дотик і робить її замість людини,
 *  далі все як після справжнього натиску. Інакше — просто наступний крок. */
function _next() {
  const step = _cur();
  if (_waiting || _tapping) return;
  if (step.last) { endTour('done'); closeAllSheets(true); return; }
  const target = step.wait !== 'next' && (step.tapTarget || step.target)();
  if (!(target instanceof Element)) { _skipTo(step); return; }

  _tapping = true;
  _showTaps(target, step.hint === 'exitFav' ? 2 : 1);
  setTimeout(() => {
    _tapping = false;
    if (_cur() !== step) return;
    if (step.menu && !dropMenuOpen()) {
      // Спершу відкриваємо меню, потім так само «натискаємо» пункт
      target.click();
      setTimeout(_next, 350);
      return;
    }
    if (step.skip) step.skip(); else target.click();
    // Дія могла нічого не змінити (вже у Вибраному) — тоді йдемо далі самі.
    // Одинарний дотик до вагона спрацьовує із затримкою (чекає на другий).
    setTimeout(() => { if (_cur() === step && !_waiting) _skipTo(step); }, 600);
  }, TAP_SHOW);
}

function _skipTo(step) {
  if (_cur() !== step) return;
  clearTimeout(_timer);
  _go(_idx + 1);
  _cur()?.restore?.();
}

/** Кружечок дотику посередині елемента (двічі — подвійний дотик). */
function _showTaps(el, count) {
  const r = el.getBoundingClientRect();
  for (let i = 0; i < count; i++) {
    const dot = document.createElement('div');
    dot.className = 'tour-tap';
    Object.assign(dot.style, { left: `${r.left + r.width / 2}px`, top: `${r.top + r.height / 2}px`, animationDelay: `${i * 200}ms` });
    _layer.appendChild(dot);
    setTimeout(() => dot.remove(), 420 + i * 200 + 100);
  }
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
  if (!_steps || i >= _steps.length) { endTour('done'); closeAllSheets(true); return; }
  _idx = i;
  _enter();
}

/** «Назад»: попередній крок, з тією шторкою чи меню, що були на ньому. */
function _back() {
  if (_waiting || _tapping || _idx === 0) return;
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
  bubble.querySelector('.tour-text').innerHTML = text;
  bubble.querySelector('.tour-next').textContent = step.last ? 'Готово' : 'Далі';
  // Невидимі, але займають місце — кнопки не стрибають між кроками
  bubble.querySelector('.tour-skip').classList.toggle('is-invisible', !!step.last);
  bubble.querySelector('.tour-back').classList.toggle('is-invisible', _idx === 0);
  // На карті — лише натиснути станцію (або пропустити тур)
  bubble.querySelector('.tour-next').classList.toggle('is-invisible', step.wait === 'station');
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
      '<div class="tour-text"></div>' +
      '<div class="tour-actions">' +
        '<button type="button" class="tour-back confirm-main-btn confirm-btn-neutral">Назад</button>' +
        '<button type="button" class="tour-skip">Пропустити тур</button>' +
        '<button type="button" class="tour-next confirm-main-btn confirm-btn-save">Далі</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(_layer);

  const blocker = _layer.querySelector('.tour-blocker');
  // Дотики повз підсвічений елемент нікуди не йдуть (і не закривають меню)
  ['click', 'pointerdown', 'touchstart', 'mousedown'].forEach(type =>
    blocker.addEventListener(type, e => { e.stopPropagation(); if (type === 'click') e.preventDefault(); }));

  _layer.querySelector('.tour-skip').addEventListener('click', () => {
    endTour('skipped');
    showToast('Тур можна пройти знову в\u00a0меню «Про застосунок»');
  });
  // Не пускаємо натиск далі: інакше закриття меню «по дотику повз нього»
  // одразу закриє меню, яке крок щойно відкрив
  _layer.querySelector('.tour-back').addEventListener('click', e => { e.stopPropagation(); _back(); });
  _layer.querySelector('.tour-next').addEventListener('click', e => { e.stopPropagation(); _next(); });
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
  // Ціль — елемент, прямокутник або кілька елементів (кожен підсвічується окремо).
  // Після дії з after() — розгорнуте, без підказки поверх нього.
  const after = _waiting && step.after?.();
  _layer.classList.toggle('is-after', !!after);
  const t = after || step.target();
  const rects = (Array.isArray(t) ? t : [t])
    .map(x => x instanceof Element ? x.getBoundingClientRect() : x)
    .filter(r => r && (r.width || r.height));
  _render(rects.length ? rects : null);
}

/** Потрібна кількість вікон підсвічування (зайві прибираються). */
function _spots(n) {
  let spots = [..._layer.querySelectorAll('.tour-spot')];
  while (spots.length < n) {
    const s = document.createElement('div');
    s.className = 'tour-spot';
    spots.at(-1).after(s);
    spots.push(s);
  }
  spots.slice(n).forEach(s => s.remove());
  return spots.slice(0, n);
}

/** Крок без цілі: усе затемнене, підказка посередині. */
function _renderCenter() {
  if (_placed) return;
  _spots(1)[0].classList.add('is-empty');
  _layer.querySelector('.tour-blocker').style.clipPath = '';
  const bubble = _layer.querySelector('.tour-bubble');
  bubble.style.top = `${Math.max(16, (window.innerHeight - bubble.offsetHeight) / 2)}px`;
  bubble.classList.add('is-shown');
  _placed = true;
  _lastKey = '';
}

const RADIUS = 12;
function _roundRect(x1, y1, x2, y2) {
  const r = Math.min(RADIUS, (x2 - x1) / 2, (y2 - y1) / 2);
  return `M${x1 + r} ${y1}H${x2 - r}A${r} ${r} 0 0 1 ${x2} ${y1 + r}V${y2 - r}A${r} ${r} 0 0 1 ${x2 - r} ${y2}` +
         `H${x1 + r}A${r} ${r} 0 0 1 ${x1} ${y2 - r}V${y1 + r}A${r} ${r} 0 0 1 ${x1 + r} ${y1}Z`;
}

function _render(rects) {
  const spots   = _spots(rects?.length || 1);
  const spot    = spots[0];
  const blocker = _layer.querySelector('.tour-blocker');
  const bubble  = _layer.querySelector('.tour-bubble');
  const vw = window.innerWidth, vh = window.innerHeight;

  if (!rects) {
    // Ціль ще не з'явилась (шторка відкривається) — просто затемнюємо все
    spot.classList.add('is-empty');
    blocker.style.clipPath = '';
    bubble.classList.remove('is-shown');
    _placed = false;
    return;
  }

  const boxes = rects.map(r => [
    Math.max(0, r.left - PAD), Math.max(0, r.top - PAD),
    Math.min(vw, r.right + PAD), Math.min(vh, r.bottom + PAD),
  ]);
  const key = boxes.flat().map(Math.round).join(',');
  if (key === _lastKey && _placed) return;
  _lastKey = key;

  // Кожен елемент — окрема дірка з заокругленими кутами
  let holes = '';
  boxes.forEach(([x1, y1, x2, y2], i) => {
    spots[i].classList.remove('is-empty');
    Object.assign(spots[i].style, { left: `${x1}px`, top: `${y1}px`, width: `${x2 - x1}px`, height: `${y2 - y1}px` });
    holes += _roundRect(x1, y1, x2, y2);
  });
  blocker.style.clipPath = `path(evenodd, "M0 0H${vw}V${vh}H0Z${holes}")`;
  const y1 = Math.min(...boxes.map(b => b[1])), y2 = Math.max(...boxes.map(b => b[3]));

  // Підказка — під ціллю, якщо там є місце, інакше над нею, інакше поверх угорі
  const bh = bubble.offsetHeight, gap = 14;
  const safeTop = 16 + (parseFloat(getComputedStyle(_layer).paddingTop) || 0); // env(safe-area-inset-top)
  let top;
  if (_cur()?.bubbleAt === 'bottom')  top = vh - 16 - bh; // шторка на весь екран — підказка внизу
  else if (y2 + gap + bh <= vh - 16)  top = y2 + gap;
  else if (y1 - gap - bh >= safeTop)  top = y1 - gap - bh;
  else                                top = safeTop;
  bubble.style.top = `${top}px`;
  bubble.classList.add('is-shown');
  _placed = true;
}
