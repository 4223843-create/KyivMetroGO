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

// Хелпер для гарантованого приховування заставки
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
async function bootstrap() {
  try {
    // 1. Ініціалізуємо синхронний кеш сховища
    await Storage.init();

    // 2. Налаштовуємо тему оформлення
    const savedTheme = Storage.get(STORAGE_KEYS.THEME)
      || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    applyTheme(savedTheme);

    // 3. Ініціалізуємо карту та повноекранний режим для Capacitor
    initMap();
    await configureEdgeToEdge();
    
    // 4. Завантажуємо дані станцій (це запустить гідратацію та localEdits)
    await reloadStationsData();

    // 5. Оновлюємо стан нижніх док-кнопок
    updateCheckinDock();
    updateFavDock();

    // 6. Обробка прямих диплінків (наприклад, ?action=search)
    const params = new URLSearchParams(window.location.search);
    const action = params.get('action');

    if      (action === 'search') openSearchSheet();
    else if (action === 'fav')    openFavSheet();
    else if (Storage.get(STORAGE_KEYS.START_ON_FAV) === 'true') openFavSheet();

    if (action) window.history.replaceState({}, document.title, window.location.pathname);

  } catch (err) {
    alert('BOOTSTRAP CRASH: ' + err.message);
    console.error('[startup] bootstrap failed', err);
    releaseStartupLoader();
  }
}

// Запуск!
bootstrap();
registerServiceWorker();