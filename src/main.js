window.MetroApp = window.MetroApp || {};


import { STORAGE_KEYS, Storage }          from './core/storage.js';
import { applyTheme }                     from './ui/theme.js';
import { initMap }                        from './map/mapInit.js';
import './map/mapGestures.js';
import './map/mapInteraction.js';
import { reloadStationsData }             from './data/stations.js';
import { updateFavDock, openFavSheet } from './features/favorites/index.js';
import { updateCheckinDock }           from './features/checkin/index.js';
import { openSearchSheet }                from './features/search.js';
import { registerServiceWorker }          from './infra/serviceWorker.js';
import './infra/offline.js';
import './infra/swUpdate.js';
import './features/feedback/index.js';
// P1-C fix: sheetsManager реєструє bus.on('sheet:close') і bus.on('data:reload-stations').
// Імпорт тут гарантує, що handlers зареєстровані до будь-якого emit із feedback/.
import './features/checkin/index.js';
import './features/favorites/index.js';
import './data/localEdits.js';
import './sheets/sheetsManager.js';
import './app.js';
import { configureEdgeToEdge } from './ui/system.js';

function releaseStartupLoader() {
  document.getElementById('mapViewport')?.classList.remove('is-loading');
}
window.addEventListener('error',
  e => { console.error('[startup] uncaught error', e.error || e.message); releaseStartupLoader(); });
window.addEventListener('unhandledrejection',
  e => { console.error('[startup] unhandled rejection', e.reason); releaseStartupLoader(); });

async function bootstrap() {
  try {
    await Storage.init();

    // P2-D fix: прибрано Storage.remove(STORAGE_KEYS.CHECKIN_HINT_SEEN) —
    // це скидало підказку при кожному старті, що суперечить логіці «показати один раз».

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