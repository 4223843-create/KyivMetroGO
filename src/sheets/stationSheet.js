// ══ STATION SHEET ══
// Відповідальність: відкриття/оновлення/закриття картки станції.
//
// Розподіл логіки:
//   Рендер HTML   → renderStation.js     (renderDirections, applyFavPillStyles)
//   Жести / події → stationEvents.js     (bindSheetGestures, applyInitialFavStyles)
//   Unsaved guard → core/unsavedCheck.js (withUnsavedCheck)
//   Міжмодульний зв'язок → core/eventBus.js (bus)

import { state }                   from '../core/state.js';
import { STORAGE_KEYS, Storage }   from '../core/storage.js';
import { heartSvg }                from '../ui/components.js';
import { slugByName }              from '../data/stations.js';
import { applyExitLabels }         from '../data/localEdits.js';
import { isFav, getExitFavs }      from '../features/favorites.js';
import { attachDevModeUI }         from '../features/devmode.js';
import { bus }                     from '../core/eventBus.js';
import { withUnsavedCheck }        from '../core/unsavedCheck.js';
import { renderDirections }        from './renderStation.js';
import { bindSheetGestures, applyInitialFavStyles } from './stationEvents.js';

// ══ DOM-вузли (існують в index.html, ніколи не lazy) ══
const sheet            = document.getElementById('stationSheet');
const sheetBody        = document.getElementById('sheetBody');
const sheetOverlay     = document.getElementById('sheetOverlay');
const stationTitleMain = document.getElementById('stationTitleMain');

// ══ ІНІЦІАЛІЗАЦІЯ ЖЕСТІВ (один раз на весь час сесії) ══
// getCtx() — getter, бо slug і color змінюються між відкриттями,
// а сам listener залишається незмінним.
bindSheetGestures(
  sheetBody,
  () => ({
    slug:      state.currentStationSlug,
    lineColor: MetroApp.LINE_COLOR[state.stationsData?.[state.currentStationSlug]?.line]
               ?? 'var(--text-muted)',
  }),
);

// ══ BUS-ПІДПИСКИ ══

// feedback/index.js та devmode.js емітують 'station:refresh'
bus.on('station:refresh', refreshCurrentStation);

// stationEvents.js емітує 'station:open' при кліку на nav-link
bus.on('station:open', ({ slug }) => openStation(slug));

// stationEvents.js емітує 'sheet:open-feedback-for' при кліку на олівець
bus.on('sheet:open-feedback-for', ({ slug: editSlug }) => {
  MetroApp.animateSheetClose?.(sheet, () => {
    sheet.classList.remove('sheet-open');
    MetroApp.openFeedbackSheet?.();
    setTimeout(() => {
      document.querySelector(`.fb-station-item[data-slug="${editSlug}"]`)?.click();
    }, 50);
  });
});

// ══ ХЕЛПЕР: позначити nav-label як nav-link якщо веде на іншу станцію ══

function applyNavLinks(slug) {
  sheetBody.querySelectorAll('.nav-label').forEach(el => {
    const target = slugByName(el.dataset.name || '');
    if (target && target !== slug) {
      el.classList.add('nav-link');
      el.setAttribute('role', 'button');
      el.setAttribute('tabindex', '0');
    }
  });
}

// ══ ВІДКРИТТЯ СТАНЦІЇ ══

/**
 * Публічна точка входу. Якщо є незбережені зміни у feedback —
 * withUnsavedCheck показує confirm і відкриває станцію після рішення.
 *
 * @param {string} slug
 */
export function openStation(slug) {
  withUnsavedCheck(() => actualOpenStation(slug));
}

function actualOpenStation(slug) {
  if (!state.stationsData?.[slug]) return;
  state.currentStationSlug = slug;

  MetroApp.dismissFavOnlyHint?.();

  const s     = state.stationsData[slug];
  const color = MetroApp.LINE_COLOR[s.line] || 'var(--text-muted)';
  const fav   = isFav(slug);

  const hideInfoBlocks = Storage.get(STORAGE_KEYS.HIDE_INFO_BLOCKS) === 'true';
  const onboardingHtml = (!hideInfoBlocks && getExitFavs().length === 0)
    ? `<div class="onboarding-hint" id="onboardingHint">` +
      `<span class="hint-icon-wrap" style="color:${color}">${MetroApp.Icons.info}</span>` +
      `Натисніть двічі на вагон та двері,<br>щоб зберегти вихід` +
      `</div>`
    : '';

  stationTitleMain.textContent = s.name;

  // ── Рендер тіла шторки ──
  const hasDirections  = s.directions?.length > 0;
  const allExitsClosed = hasDirections && !s.directions.some(dir =>
    dir.exits?.some(exit => exit.positions?.some(pos => !pos.closed))
  );

  if (!hasDirections) {
    sheetBody.innerHTML =
      `<p class="fav-empty-text" style="text-align:center;margin:40px 0 0 0;width:100%;">Дані про виходи відсутні</p>`;
  } else if (allExitsClosed) {
    sheetBody.innerHTML =
      `<p class="fav-empty-text" style="text-align:center;margin:40px 0 0 0;width:100%;">Усі виходи закриті</p>`;
  } else {
    sheetBody.innerHTML = onboardingHtml + renderDirections(s, color);
  }

  sheetBody.scrollTop = 0;
  applyNavLinks(slug);

  // ── Розмір шторки ──
  if (s.slug === 'R.Khreshchatyk') {
    sheet.classList.add('sheet-fullscreen', 'sheet-scrollable');
    sheet.style.maxHeight = '';
  } else {
    sheet.style.maxHeight = '';
    sheet.classList.remove('sheet-fullscreen', 'sheet-scrollable');
  }

  // ── Handle та кнопка серця ──
  const handle = sheet.querySelector('.sheet-handle');
  if (handle) handle.style.background = color;

  const favBtnBar = sheet.querySelector('.fav-btn-bar');
  if (favBtnBar) {
    favBtnBar.dataset.slug  = slug;
    favBtnBar.dataset.color = color;
    favBtnBar.innerHTML     = heartSvg(fav, slug, color);
    favBtnBar.classList.toggle('fav-active', fav);
  }

  // ── Відкрити шторку ──
  document.querySelectorAll('.station-sheet').forEach(el => {
    if (el.id !== 'stationSheet') el.classList.remove('sheet-open');
  });
  if (!sheet.classList.contains('sheet-open')) {
    sheet.classList.add('sheet-open');
    sheetOverlay?.classList.add('overlay-visible');
  }

  // ── Post-render: стилі улюблених + dev mode + check-in ──
  applyInitialFavStyles(sheetBody, slug, color);
  attachDevModeUI(sheetBody, slug);
  sheet.querySelector('.row-checkin-btn')?.remove();
  MetroApp.attachCheckinButtons?.(sheet, slug, color);
}

// ══ ОНОВЛЕННЯ ПОТОЧНОЇ КАРТКИ ══

/**
 * Перемальовує вміст відкритої шторки без закриття/відкриття.
 * Викликається через bus.on('station:refresh') після змін у feedback або check-in.
 */
export function refreshCurrentStation() {
  if (!state.currentStationSlug) return;
  applyExitLabels(state.stationsData);

  const s = state.stationsData?.[state.currentStationSlug];
  if (!s || !sheet.classList.contains('sheet-open')) return;

  const slug       = state.currentStationSlug;
  const color      = MetroApp.LINE_COLOR[s.line] || 'var(--text-muted)';
  const prevScroll = sheetBody.scrollTop;

  stationTitleMain.textContent = s.name;
  sheetBody.innerHTML = renderDirections(s, color);

  applyNavLinks(slug);

  // Gesture listeners живуть (bindSheetGestures) — лише оновлюємо стилі
  applyInitialFavStyles(sheetBody, slug, color);
  attachDevModeUI(sheetBody, slug);
  sheet.querySelector('.row-checkin-btn')?.remove();
  MetroApp.attachCheckinButtons?.(sheet, slug, color);

  sheetBody.scrollTop = prevScroll;
}

// ── Перехідний фасад (TODO: видалити після повної міграції на bus) ──
MetroApp.refreshCurrentStation = refreshCurrentStation;
