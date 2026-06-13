// ══ ГОЛОВНА ТОЧКА ВХОДУ (MAIN) ══

import { STORAGE_KEYS, Storage }          from './core/storage.js';
import { applyTheme }                     from './ui/theme.js';
import { configureEdgeToEdge }            from './ui/system.js';
import { initMap }                        from './map/mapInit.js';
import { reloadStationsData }             from './data/stations.js';
import { updateFavDock, openFavSheet }    from './features/favorites/index.js';
import { updateCheckinDock }              from './features/checkin/index.js';
import { openSearchSheet }                from './features/search.js';
import { registerServiceWorker }          from './infra/serviceWorker.js';

// Імпорти модулів з побічними ефектами (ініціалізація жестів та інфраструктури)
import './map/mapGestures.js';
import './map/mapInteraction.js';
import './infra/offline.js';
import './infra/swUpdate.js';
import './features/feedback/index.js';
import './features/checkin/index.js';
import './features/favorites/index.js';
import './data/localEdits.js';
import './sheets/sheetsManager.js';
import './app.js';

/** Гарантовано приховує заставку — викликається з обробників помилок. */
function releaseStartupLoader() {
  document.getElementById('mapViewport')?.classList.remove('is-loading');
  document.getElementById('startupLoader')?.classList.add('hidden');
}

// Глобальне перехоплення раптових помилок
window.addEventListener('error', e => { 
  console.error('[startup] uncaught error', e.error || e.message); 
  releaseStartupLoader(); 
});
window.addEventListener('unhandledrejection', e => { 
  console.error('[startup] unhandled rejection', e.reason); 
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
    // Показуємо зрозуміле повідомлення замість технічного alert().
    // Найімовірніша причина — неможливість завантажити stations.json.
    const msg = document.createElement('div');
    msg.style.cssText =
      'position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;' +
      'justify-content:center;gap:12px;padding:32px;background:var(--bg,#0e0e0f);' +
      'color:var(--text,#e8e6e3);font-family:system-ui,sans-serif;text-align:center;z-index:9999';
    msg.innerHTML =
      '<span style="font-size:2rem">⚠️</span>' +
      '<strong style="font-size:1.1rem">Не вдалося запустити додаток</strong>' +
      '<p style="font-size:.9rem;opacity:.7;max-width:320px">' +
      'Перевірте з\'єднання з інтернетом і спробуйте ще раз.<br>' +
      '<span style="font-size:.75rem;opacity:.5">' + (err.message || err) + '</span></p>' +
      '<button onclick="location.reload()" ' +
      'style="margin-top:8px;padding:12px 28px;border-radius:8px;border:none;' +
      'background:#c8523a;color:#fff;font-size:1rem;cursor:pointer">Спробувати ще раз</button>';
    document.body.appendChild(msg);
  }
}

bootstrap();
registerServiceWorker();