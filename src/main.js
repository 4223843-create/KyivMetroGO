// ══ ГОЛОВНА ТОЧКА ВХОДУ (MAIN) ══

import { STORAGE_KEYS, Storage }          from './core/storage.js';
import { getPref } from './core/prefs.js';
import { applyTheme }                     from './ui/theme.js';
import { applyReduceMotion }              from './ui/motion.js';
import { configureEdgeToEdge }            from './ui/system.js';
import { initMap }                        from './map/mapInit.js';
import { reloadStationsData, loadedStationsVersion } from './data/stations.js';
import { showStartupError }               from './ui/startupError.js';
import { updateFavDock, openFavSheet }    from './features/favorites/index.js';
import { updateCheckinDock }              from './features/checkin/index.js';
import { openSearchSheet }                from './features/search.js';
import { registerServiceWorker }          from './infra/serviceWorker.js';
import { updateDevMenuButtonVisibility, runEmulationStartup } from './features/devHooks.js';
import { maybeStartTour }                 from './features/tour.js';
import { initVestibuleReports }           from './domain/vestibules.js';
import { takeCardToRestore }              from './infra/restoreCard.js';
import { openStation }                    from './sheets/stationSheet.js';
import { state, startupSlug }             from './core/state.js';
import { bus }                            from './core/eventBus.js';

// Імпорти модулів з побічними ефектами (ініціалізація жестів та інфраструктури)
import './map/mapGestures.js';
import './map/mapInteraction.js';
import './infra/offline.js';
import './infra/swUpdate.js';
import './infra/resumeUpdates.js';
import './features/feedback/index.js';
import './features/checkin/index.js';
import './features/favorites/index.js';
import './data/localEdits.js';
import './sheets/sheetsManager.js';
import './ui/confirm.js';
import './app.js';

/** Гарантовано приховує заставку — викликається з обробників помилок. */
function releaseStartupLoader() {
  document.getElementById('mapViewport')?.classList.remove('is-loading');
  document.getElementById('startupLoader')?.classList.add('hidden');
}

// Глобальне перехоплення раптових помилок
window.addEventListener('unhandledrejection', e => { 
  // Ігноруємо помилки підключення розробницького сервера Vite HMR до WebSockets
  if (e.reason?.message?.includes('WebSocket') || String(e.reason).includes('string was specified')) return;

  console.error('[startup] unhandled rejection', e.reason); 
  releaseStartupLoader(); 
});
window.addEventListener('error', e => { 
  console.error('[startup] unhandled error', e.error); 
  releaseStartupLoader(); 
});

// ── ЯДРО ЗАПУСКУ ДОДАТКУ ─────────────────────────────────────
/**
 * Послідовно ініціалізує Storage, тему, карту, дані та UI.
 * Критична секція: будь-яка необроблена помилка тут → alert + видимий лоадер.
 */
async function bootstrap() {
  try {
    await Storage.init();
    initVestibuleReports(); // дослати листи про відкриті вестибюлі з минулого запуску

    // 🛠️ ВСТАНОВЛЕНО СИСТЕМНУ ТЕМУ ЗА ЗАМОВЧУВАННЯМ
    // Передаємо false другим параметром, щоб не фіксувати світлу/темну тему в базі при першому старті
    const savedTheme = Storage.get(STORAGE_KEYS.THEME) || 'system';
    applyTheme(savedTheme, false);
    applyReduceMotion();

    initMap();
    await configureEdgeToEdge();
    
    await reloadStationsData();
    await runEmulationStartup();

    updateCheckinDock();
    updateFavDock();
    updateDevMenuButtonVisibility(); // тільки тепер Storage реально завантажено — раніше в app.js це завжди бачило "вимкнено"

    const params = new URLSearchParams(window.location.search);
    const action = params.get('action');

    // Телефон вивантажив застосунок у фоні — повертаємо картку, яка була відкрита
    const saved   = takeCardToRestore(); // забираємо завжди, щоб не спрацював пізніше
    const restore = action || startupSlug ? null : saved;
    const restoreSlug = restore && state.stationsData?.[restore.slug] ? restore.slug : null;

    if      (action === 'search') openSearchSheet();
    else if (action === 'fav')    openFavSheet();
    else if (restoreSlug) {
      openStation(restoreSlug);
      bus.emit('map:center-station', { slug: restoreSlug });
      requestAnimationFrame(() => {
        const body = document.getElementById('sheetBody');
        if (body) body.scrollTop = restore.scroll;
      });
    }
    else if (getPref('startOnFav')) openFavSheet();

    if (action) window.history.replaceState({}, document.title, window.location.pathname);
    else if (!restoreSlug) maybeStartTour();

  } catch (err) {
    console.error('[startup] bootstrap failed', err);
    releaseStartupLoader();
    showStartupError(err, loadedStationsVersion());
  }
}

bootstrap();
registerServiceWorker();