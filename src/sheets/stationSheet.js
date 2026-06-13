import { state }                   from '../core/state.js';
import { STORAGE_KEYS, Storage }   from '../core/storage.js';
import { heartSvg }                from '../ui/components.js';
import { Icons }                   from '../ui/icons.js';
import { LINE_COLOR }              from '../core/constants.js';
import { animateSheetClose }       from '../ui/animations.js';
import { slugByName }              from '../data/stations.js';
import { applyExitLabels }         from '../data/localEdits.js';
import { isFav, getExitFavs }      from '../features/favorites/index.js';
import { attachDevModeUI }         from '../features/devmode.js';
import { bus }                     from '../core/eventBus.js';
import { withUnsavedCheck }        from '../core/unsavedCheck.js';
import { renderDirections }        from './renderStation.js';
import { bindSheetGestures, applyInitialFavStyles } from './stationEvents.js';

// ══ STATION SHEET ══
// Відповідальність: рендеринг та відкриття картки станції.
// Кешує HTML рядків renderDirections та маппінги nav-label → slug
// для уникнення повторних обчислень при повторних відкриттях.

// ══ DOM-вузли ══
const sheet            = document.getElementById('stationSheet');
const sheetBody        = document.getElementById('sheetBody');
const sheetOverlay     = document.getElementById('sheetOverlay');
const stationTitleMain = document.getElementById('stationTitleMain');

// ══ ІНІЦІАЛІЗАЦІЯ ЖЕСТІВ ══
bindSheetGestures(
  sheetBody,
  () => ({
    slug:      state.currentStationSlug,
    lineColor: LINE_COLOR[state.stationsData?.[state.currentStationSlug]?.line]
               ?? 'var(--text-muted)',
  }),
);

// ══ КЕШІ (module scope) ══════════════════════════════════════

// Кеш HTML рядка renderDirections.
// Ключ: slug. Інвалідується при station:refresh (дані змінились).
const _directionsHtmlCache = new Map(); // slug → html

// Кеш slug-маппінгу для nav-label елементів.
// Ключ: slug. Значення: Map<labelName, targetSlug|null>.
// Стабільний між відкриттями (назви напрямків незмінні).
const _navLinkCache = new Map();

// ── BUS-ПІДПИСКИ ──────────────────────────────────────────────

// При оновленні даних — інвалідуємо кеш HTML поточної станції
bus.on('station:refresh', () => {
  _directionsHtmlCache.delete(state.currentStationSlug);
  refreshCurrentStation();
});

bus.on('station:open', ({ slug }) => openStation(slug));

bus.on('sheet:open-feedback-for', ({ slug: editSlug }) => {
  animateSheetClose(sheet, () => {
    sheet.classList.remove('sheet-open');
    bus.emit('sheet:open-feedback');
    setTimeout(() => {
      document.querySelector(`.fb-station-item[data-slug="${editSlug}"]`)?.click();
    }, 50);
  });
});

// ── ОПТИМІЗОВАНИЙ applyNavLinks ───────────────────────────────

function applyNavLinks(slug) {
  const labels = sheetBody.querySelectorAll('.nav-label');
  let nameToTarget = _navLinkCache.get(slug);

  if (!nameToTarget) {
    // Перший візит: обчислюємо slugByName() і кешуємо результат
    nameToTarget = new Map();
    labels.forEach(el => {
      const name = el.dataset.name || '';
      if (!nameToTarget.has(name)) {
        // slugByName() викликається по одному разу на унікальну назву
        nameToTarget.set(name, slugByName(name) || null);
      }
      const target = nameToTarget.get(name);
      if (target && target !== slug) {
        el.classList.add('nav-link');
        el.setAttribute('role', 'button');
        el.setAttribute('tabindex', '0');
      }
    });
    _navLinkCache.set(slug, nameToTarget);
  } else {
    // Повторний візит: нуль slugByName() — тільки DOM writes
    labels.forEach(el => {
      const target = nameToTarget.get(el.dataset.name || '');
      if (target && target !== slug) {
        el.classList.add('nav-link');
        el.setAttribute('role', 'button');
        el.setAttribute('tabindex', '0');
      }
    });
  }
}

// ── ВІДКРИТТЯ СТАНЦІЇ ─────────────────────────────────────────

export function openStation(slug) {
  withUnsavedCheck(() => actualOpenStation(slug));
}

function actualOpenStation(slug) {
  if (!state.stationsData?.[slug]) return;

  const s     = state.stationsData[slug];
  const color = LINE_COLOR[s.line] || 'var(--text-muted)';

  // Guard: та сама станція вже відкрита — пропускаємо повний re-render
  if (state.currentStationSlug === slug && sheet.classList.contains('sheet-open')) {
    // Лише оновлюємо fav-кнопку (стан міг змінитись ззовні)
    _updateFavBtn(slug, color);
    return;
  }

  state.currentStationSlug = slug;
  bus.emit('fav:dismiss-hint');

  const fav            = isFav(slug);
  const hideInfoBlocks = Storage.get(STORAGE_KEYS.HIDE_INFO_BLOCKS) === 'true';
  const onboardingHtml = (!hideInfoBlocks && getExitFavs().length === 0)
    ? `<div class="onboarding-hint" id="onboardingHint">` +
      `<span class="hint-icon-wrap" style="color:${color}">${Icons.info}</span>` +
      `Натисніть двічі на вагон та двері,<br>щоб зберегти вихід` +
      `</div>`
    : '';

  stationTitleMain.textContent = s.name;

  const hasDirections  = s.directions?.length > 0;
  const allExitsClosed = hasDirections && !s.directions.some(dir =>
    dir.exits?.some(exit => exit.positions?.some(pos => !pos.closed))
  );

  if (!hasDirections) {
    sheetBody.innerHTML = '<p class="fav-empty-text" style="text-align:center;margin:40px 0 0 0;width:100%;">Дані про виходи відсутні</p>';
  } else if (allExitsClosed) {
    sheetBody.innerHTML = '<p class="fav-empty-text" style="text-align:center;margin:40px 0 0 0;width:100%;">Усі виходи закриті</p>';
  } else {
    let directionsHtml = _directionsHtmlCache.get(slug);
    if (!directionsHtml) {
      directionsHtml = renderDirections(s, color);
      _directionsHtmlCache.set(slug, directionsHtml);
    }
    sheetBody.innerHTML = onboardingHtml + directionsHtml;
  }

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
  if (handle) handle.style.background = color;

  _updateFavBtn(slug, color);

  // Закриваємо всі допоміжні шторки (feedback, settings, checkin тощо).
  // querySelectorAll — єдиний коректний спосіб: ці шторки створюються lazily
  // після ініціалізації модуля і не потрапляють у статичний кеш.
  document.querySelectorAll('.station-sheet').forEach(el => {
    if (el.id !== 'stationSheet') el.classList.remove('sheet-open');
  });
  if (!sheet.classList.contains('sheet-open')) {
    sheet.classList.add('sheet-open');
    sheetOverlay?.classList.add('overlay-visible');
  }

  applyInitialFavStyles(sheetBody, slug, color);
  attachDevModeUI(sheetBody, slug);
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
  applyExitLabels(state.stationsData);

  const s = state.stationsData?.[state.currentStationSlug];
  if (!s || !sheet.classList.contains('sheet-open')) return;

  const slug       = state.currentStationSlug;
  const color      = LINE_COLOR[s.line] || 'var(--text-muted)';
  const prevScroll = sheetBody.scrollTop;

  // Кеш вже інвалідовано в bus.on('station:refresh') вище
  stationTitleMain.textContent = s.name;
  sheetBody.innerHTML = renderDirections(s, color);
  // Зберігаємо свіжий HTML в кеш для наступного відкриття
  _directionsHtmlCache.set(slug, sheetBody.innerHTML);

  applyNavLinks(slug);
  applyInitialFavStyles(sheetBody, slug, color);
  attachDevModeUI(sheetBody, slug);
  // Всі кнопки, а не тільки перша
  sheet.querySelectorAll('.row-checkin-btn').forEach(btn => btn.remove());
  bus.emit('checkin:attach-buttons', { sheetEl: sheet, slug, color });

  sheetBody.scrollTop = prevScroll;
}