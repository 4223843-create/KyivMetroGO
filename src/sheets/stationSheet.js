import { state }                   from '../core/state.js';
import { heartSvg, lineTextColor } from '../ui/components.js';
import { isFav }                   from '../features/favorites/index.js';
import { renderHintSlot, useHint, initHintGestures } from '../features/hints.js';
import { attachDevModeUI, setupDevStationNoteButton } from '../features/devHooks.js';
import { bus }                     from '../core/eventBus.js';
import { showSheet, hideSheet }    from '../ui/sheetNav.js';
import { withUnsavedCheck }        from '../core/unsavedCheck.js';
import { renderDirections, renderStationConnections, renderStationClock, hasStationClock,
         stationColor, renderStationClosedNotice } from './renderStation.js';
import { bindSheetGestures, applyInitialFavStyles,
         getOpenNumberedExitsIdx, reopenNumberedExitsPanel } from './stationEvents.js';

// ══ STATION SHEET ══
// Відповідальність: рендеринг та відкриття картки станції.
// Кешує HTML рядків renderDirections
// для уникнення повторних обчислень при повторних відкриттях.

// ══ DOM-вузли ══
const sheet            = document.getElementById('stationSheet');
const sheetBody        = document.getElementById('sheetBody');
const stationTitleMain = document.getElementById('stationTitleMain');
const clockBtn         = document.getElementById('sheetClockBtn');
// Панель годинника живе на початку sheetBody (під назвою станції) і
// перемальовується разом з ним.
const CLOCK_PANEL_HTML = '<div id="stationClockPanel" class="station-clock-panel"></div>';

/** Поки панель годинника розгорнута, кнопка світиться кольором гілки. */
function _syncClockBtn() {
  if (!clockBtn) return;
  const isOpen = !!document.getElementById('stationClockPanel')?.classList.contains('panel-open');
  const s      = state.stationsData?.[state.currentStationSlug];
  clockBtn.classList.toggle('is-active', isOpen);
  clockBtn.style.color = isOpen && s ? lineTextColor(stationColor(s)) : '';
}

// ══ КЕШІ (module scope) ══════════════════════════════════════

// Кеш HTML рядка renderDirections.
// Ключ: slug. Інвалідується при station:refresh (дані змінились).
const _directionsHtmlCache = new Map(); // slug → html

// ── ПОСИЛАННЯ НА ІНШІ СТАНЦІЇ ─────────────────────────────────
// Підпис веде на станцію, лише якщо в даних є data-target (transfer_to,
// link_to виходу або from_slug напрямку) — без пошуку назви в тексті.

function applyNavLinks(slug) {
  sheetBody.querySelectorAll('.nav-label[data-target]').forEach(el => {
    const target = el.dataset.target;
    if (!target || target === slug || !state.stationsData?.[target]) return;
    el.classList.add('nav-link');
    el.setAttribute('role', 'button');
    el.setAttribute('tabindex', '0');
  });
}

// ── ВМІСТ КАРТКИ ──────────────────────────────────────────────

const _EMPTY_NOTE_STYLE = 'text-align:center;margin:40px 0 0 0;width:100%;';

/**
 * Увесь вміст картки під назвою — і при відкритті, і при перемальовуванні
 * (серце, check-in, правка), щоб заглушки «немає даних» / «усі виходи закриті»
 * не губилися після station:refresh.
 */
function _cardBodyHtml(s, color) {
  const hasDirections  = s.directions?.length > 0;
  const allExitsClosed = hasDirections && !s.directions.some(dir =>
    dir.exits?.some(exit => exit.positions?.some(pos => !pos.closed))
  );
  if (!hasDirections || allExitsClosed) {
    const text = hasDirections ? 'Усі виходи закриті' : 'Дані про виходи відсутні';
    return CLOCK_PANEL_HTML + renderStationClosedNotice(s) +
      `<p class="fav-empty-text" style="${_EMPTY_NOTE_STYLE}">${text}</p>`;
  }
  let directionsHtml = _directionsHtmlCache.get(s.slug);
  if (!directionsHtml) {
    directionsHtml = renderDirections(s, color);
    _directionsHtmlCache.set(s.slug, directionsHtml);
  }
  return CLOCK_PANEL_HTML + renderStationClosedNotice(s) + renderStationConnections(s) +
    renderHintSlot(s, color) + directionsHtml;
}

// ── ВІДКРИТТЯ СТАНЦІЇ ─────────────────────────────────────────

export function openStation(slug) {
  withUnsavedCheck(() => actualOpenStation(slug));
}

function actualOpenStation(slug) {
  if (!state.stationsData?.[slug]) return;

  const s     = state.stationsData[slug];
  const color = stationColor(s);

  // Guard: та сама станція вже відкрита — пропускаємо повний re-render
  if (state.currentStationSlug === slug && sheet.classList.contains('sheet-open')) {
    // Лише оновлюємо fav-кнопку (стан міг змінитись ззовні)
    _updateFavBtn(slug, color);
    _syncClockBtn();
    return;
  }

  state.currentStationSlug = slug;
  bus.emit('fav:dismiss-hint');

  stationTitleMain.textContent = s.name;
  if (clockBtn) clockBtn.hidden = !hasStationClock(s);

  sheetBody.innerHTML = _cardBodyHtml(s, color);

  sheetBody.scrollTop = 0;
  applyNavLinks(slug);

  if (s.slug === 'R.Khreshchatyk') {
    sheet.classList.add('sheet-fullscreen', 'sheet-scrollable');
    sheet.style.maxHeight = '';
  } else {
    sheet.style.maxHeight = '';
    sheet.classList.remove('sheet-fullscreen', 'sheet-scrollable');
  }

  const handle = sheet.querySelector('.sheet-handle');
  if (handle) handle.style.background = lineTextColor(color);

  _updateFavBtn(slug, color);
  _syncClockBtn();

  showSheet(sheet);   // інші шторки (feedback, settings, checkin тощо) ховаються

  applyInitialFavStyles(sheetBody, slug, color);
  attachDevModeUI(sheetBody, slug);
  setupDevStationNoteButton(sheet, slug, color);
  // querySelectorAll (не querySelector) — видаляємо ВСІ старі кнопки
  sheet.querySelectorAll('.row-checkin-btn').forEach(btn => btn.remove());
  bus.emit('checkin:attach-buttons', { sheetEl: sheet, slug, color });
}

function _updateFavBtn(slug, color) {
  const favBtnBar = sheet.querySelector('.fav-btn-bar');
  if (!favBtnBar) return;
  favBtnBar.dataset.slug  = slug;
  favBtnBar.dataset.color = color;
  favBtnBar.innerHTML     = heartSvg(isFav(slug), slug, color);
  favBtnBar.classList.toggle('fav-active', isFav(slug));
}

// ── ОНОВЛЕННЯ ПОТОЧНОЇ КАРТКИ ─────────────────────────────────

export function refreshCurrentStation() {
  if (!state.currentStationSlug) return;

  const s = state.stationsData?.[state.currentStationSlug];
  if (!s || !sheet.classList.contains('sheet-open')) return;

  const slug       = state.currentStationSlug;
  const color      = stationColor(s);
  const prevScroll = sheetBody.scrollTop;

  // Відкрита панель годинника не має закриватися від перемальовування (напр. дотик до шпильки check-in)
  const clockWasOpen = !!document.getElementById('stationClockPanel')?.classList.contains('panel-open');
  const numberedExitsIdx = getOpenNumberedExitsIdx(sheetBody);
  const connWasOpen = !!document.getElementById('stationConnectionsWrap')?.classList.contains('is-open');

  // Перемальовуємо зі свіжих даних (не з кешу: серця чи правки могли змінитись)
  _directionsHtmlCache.delete(slug);
  stationTitleMain.textContent = s.name;
  sheetBody.innerHTML = _cardBodyHtml(s, color);
  if (connWasOpen) {
    const wrap = document.getElementById('stationConnectionsWrap');
    wrap?.classList.add('is-open');
    wrap?.querySelector('.station-connections-toggle')?.setAttribute('aria-expanded', 'true');
  }

  const handle = sheet.querySelector('.sheet-handle');
  if (handle) handle.style.background = lineTextColor(color);

  if (clockBtn) clockBtn.hidden = !hasStationClock(s);
  if (clockWasOpen && !clockBtn?.hidden) {
    const clockPanel = document.getElementById('stationClockPanel');
    clockPanel.innerHTML = renderStationClock(s);
    clockPanel.classList.add('panel-open');
  }
  _updateFavBtn(slug, color);
  _syncClockBtn();

  applyNavLinks(slug);
  applyInitialFavStyles(sheetBody, slug, color);
  attachDevModeUI(sheetBody, slug);
  setupDevStationNoteButton(sheet, slug, color);
  // Всі кнопки, а не тільки перша
  sheet.querySelectorAll('.row-checkin-btn').forEach(btn => btn.remove());
  bus.emit('checkin:attach-buttons', { sheetEl: sheet, slug, color });

  if (numberedExitsIdx >= 0) reopenNumberedExitsPanel(sheetBody, numberedExitsIdx, slug, color);

  sheetBody.scrollTop = prevScroll;
}

// ══ ЗАПУСК ══════════════════════════════════════════════════

let _started = false;

/** Кнопка годинника, жести картки й bus-підписки. Повторний виклик нічого не робить. */
export function initStationSheet() {
  if (_started) return;
  _started = true;

  // ══ ГОДИННИК: години роботи та поточний інтервал ══
  // Налаштування змінились — ховаємо кнопку, якщо показувати нічого, і оновлюємо відкриту панель.
  bus.on('station:clock-settings', () => {
    const s = state.stationsData?.[state.currentStationSlug];
    if (clockBtn) clockBtn.hidden = !hasStationClock(s);
    const clockPanel = document.getElementById('stationClockPanel');
    if (!clockPanel) return;
    if (clockBtn?.hidden) clockPanel.classList.remove('panel-open');
    else if (clockPanel.classList.contains('panel-open')) clockPanel.innerHTML = renderStationClock(s);
    _syncClockBtn();
  });
  // Вміст рахується в момент натискання — за київським часом (core/clock.js).
  clockBtn?.addEventListener('click', e => {
    e.stopPropagation();
    const clockPanel = document.getElementById('stationClockPanel');
    if (!clockPanel) return;
    if (clockPanel.classList.toggle('panel-open')) {
      const s = state.stationsData?.[state.currentStationSlug];
      clockPanel.innerHTML = s ? renderStationClock(s) : '';
      useHint('clock', s);
    }
    _syncClockBtn();
  });

  // ══ ІНІЦІАЛІЗАЦІЯ ЖЕСТІВ ══
  bindSheetGestures(
    sheetBody,
    () => ({
      slug:      state.currentStationSlug,
      lineColor: stationColor(state.stationsData?.[state.currentStationSlug]),
    }),
  );
  initHintGestures(sheetBody);

  // ── BUS-ПІДПИСКИ ──────────────────────────────────────────────

  // При оновленні даних — інвалідуємо кеш HTML поточної станції
  bus.on('station:refresh', () => {
    _directionsHtmlCache.clear();
    refreshCurrentStation();
  });

  // Обране змінилось (зокрема при заміні виходу) — оновлюємо серце в шапці
  bus.on('fav:updated', () => {
    const slug = state.currentStationSlug;
    if (!slug || !sheet.classList.contains('sheet-open')) return;
    _updateFavBtn(slug, stationColor(state.stationsData?.[slug]));
  });

  // Вибране змінили в іншій вкладці — оновлюємо серця відкритої картки
  bus.on('fav:externally-updated', () => refreshCurrentStation());

  bus.on('station:open', ({ slug }) => openStation(slug));

  bus.on('sheet:open-feedback-for', ({ slug: editSlug }) => {
    hideSheet(sheet, { onClosed: () => {
      bus.emit('sheet:open-feedback');
      setTimeout(() => {
        document.querySelector(`.fb-station-item[data-slug="${editSlug}"]`)?.click();
      }, 50);
    } });
  });
}
