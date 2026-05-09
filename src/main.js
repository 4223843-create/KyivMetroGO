// ══ ТОЧКА ВХОДУ — BOOTSTRAP ══
// Відповідальність: ініціалізація даних і навігація при старті.
// UI-прив'язки — в app.js. Реєстрація SW — в infra/serviceWorker.js.

window.MetroApp = window.MetroApp || {};

// ── Константи ──────────────────────────────────────────────────
import {
  LINE_COLOR, FAV_DISPLAY_NAMES, DIR_SHORT_NAMES,
  STATIONS_WITH_POTENTIAL_EXITS, NAME_TO_SLUG, SLUG_BY_LOWER,
} from './core/constants.js';

MetroApp.LINE_COLOR                    = LINE_COLOR;
MetroApp.FAV_DISPLAY_NAMES             = FAV_DISPLAY_NAMES;
MetroApp.DIR_SHORT_NAMES               = DIR_SHORT_NAMES;
MetroApp.STATIONS_WITH_POTENTIAL_EXITS = STATIONS_WITH_POTENTIAL_EXITS;
MetroApp.NAME_TO_SLUG                  = NAME_TO_SLUG;
MetroApp.SLUG_BY_LOWER                 = SLUG_BY_LOWER;

// ── UI-функції на MetroApp ────────────────────────────────────
import { animateSheetClose, dismissHintWithDoors } from './ui/animations.js';
import { showCustomConfirm }                       from './ui/confirm.js';
import { initKinematicSwipe }                      from './ui/swipe.js';
import {
  hapticImpact, configureEdgeToEdge, pushSheetHistory,
} from './ui/system.js';

MetroApp.animateSheetClose    = animateSheetClose;
MetroApp.dismissHintWithDoors = dismissHintWithDoors;
MetroApp.showCustomConfirm    = showCustomConfirm;
MetroApp.initKinematicSwipe   = initKinematicSwipe;
MetroApp.hapticImpact         = hapticImpact;
MetroApp.configureEdgeToEdge  = configureEdgeToEdge;
MetroApp.pushSheetHistory     = pushSheetHistory;

// ── Іконки ────────────────────────────────────────────────────
import { Icons } from './ui/icons.js';
MetroApp.Icons = Icons;

// ── Bootstrap-імпорти ────────────────────────────────────────
import { STORAGE_KEYS, Storage }          from './core/storage.js';
import { applyTheme }                     from './ui/theme.js';
import { initMap }                        from './map/mapInit.js';
import './map/mapGestures.js';
import './map/mapInteraction.js';
import { reloadStationsData }             from './data/stations.js';
import { updateFavDock, openFavSheet }    from './features/favorites.js';
import { updateCheckinDock }              from './features/checkin.js';
import { openSearchSheet }                from './features/search.js';
import { registerServiceWorker }          from './infra/serviceWorker.js';
import './infra/offline.js';
import './infra/swUpdate.js';
// УВАГА: './infra/about.js' ВИДАЛЕНО —
// beta-форма обробляється всередині aboutSheet.js (bindBottomLoader).
// Підключення обох спричиняло подвійну відправку форми.
import './features/feedback.js';
import './app.js';

// ── Глобальний error handler ──────────────────────────────────
function releaseStartupLoader() {
  document.getElementById('mapViewport')?.classList.remove('is-loading');
}
window.addEventListener('error',
  e => { console.error('[startup] uncaught error', e.error || e.message); releaseStartupLoader(); });
window.addEventListener('unhandledrejection',
  e => { console.error('[startup] unhandled rejection', e.reason); releaseStartupLoader(); });

// ── Bootstrap ─────────────────────────────────────────────────
async function bootstrap() {
  try {
    await Storage.init();
    Storage.remove(STORAGE_KEYS.CHECKIN_HINT_SEEN);

    const savedTheme = Storage.get(STORAGE_KEYS.THEME)
      || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    applyTheme(savedTheme);

    initMap();
    await configureEdgeToEdge();
    await reloadStationsData();

    updateCheckinDock();
    updateFavDock();

    const params = new URLSearchParams(window.location.search);
    const action = params.get('action');

    if      (action === 'search') openSearchSheet();
    else if (action === 'fav')    openFavSheet();
    else if (Storage.get(STORAGE_KEYS.START_ON_FAV) === 'true') openFavSheet();

    if (action) window.history.replaceState({}, document.title, window.location.pathname);

  } catch (err) {
    console.error('[startup] bootstrap failed', err);
    releaseStartupLoader();
  }
}

bootstrap();
registerServiceWorker();
