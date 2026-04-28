window.MetroApp = window.MetroApp || {};

import { STORAGE_KEYS, Storage } from './storage.js';
import './icons.js';
import { state } from './state.js';
import './ui.js';
import './theme.js';
import { reloadStationsData } from './stations.js';
import { initMap } from './map.js';
import { openFavSheet, updateFavDock } from './favorites.js';
import { updateCheckinDock, openCheckinSheet } from './checkin.js';
import { openSearchSheet } from './search.js';
import {
  openStation,
  closeAllSheets,
  openAboutSheet,
  withUnsavedCheck,
} from './sheets.js';
import { openSettingsSheet } from './settings.js';
import './feedback.js';
import './offline.js';

function releaseStartupLoader() {
  document.getElementById('mapViewport')?.classList.remove('is-loading');
}

window.addEventListener('error', event => {
  console.error('[startup] uncaught error', event.error || event.message);
  releaseStartupLoader();
});

window.addEventListener('unhandledrejection', event => {
  console.error('[startup] unhandled rejection', event.reason);
  releaseStartupLoader();
});

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(error => {
      console.error('[PWA] service worker registration failed', error);
    });
  });
}

async function bootstrap() {
  try {
    // 1. Ініціалізуємо сховище (тепер дані є в memoryCache)
    await Storage.init();

    // 2. ТЕПЕР застосовуємо тему, коли дані точно завантажені
    const savedTheme = Storage.get(STORAGE_KEYS.THEME) || 
                       (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    import('./theme.js').then(m => m.applyTheme(savedTheme));


    initMap();
    MetroApp.configureEdgeToEdge(); // <--- ДОДАНО
    await reloadStationsData();

    // 4. Оновлюємо стан док-панелі після завантаження даних
    updateCheckinDock();
    updateFavDock();

    // 5. Обробляємо стартові дії
    const params = new URLSearchParams(window.location.search);
    const action = params.get('action');

    if (action === 'search') {
      openSearchSheet();
    } else if (action === 'fav') {
      openFavSheet();
    } else if (Storage.get(STORAGE_KEYS.START_ON_FAV) === 'true') {
      // Тепер це працює надійно, бо Storage вже ініціалізовано
      openFavSheet();
    }

    if (action) {
      window.history.replaceState({}, document.title, window.location.pathname);
    }

  } catch (err) {
    console.error('[startup] bootstrap failed', err);
    releaseStartupLoader();
  }
}

// ══ ОБРОБКА СИСТЕМНОЇ КНОПКИ "НАЗАД" (ANDROID SWIPE BACK) ══
window.addEventListener('popstate', (e) => {
  const openSheets = document.querySelectorAll('.station-sheet.sheet-open');
  if (openSheets.length > 0) {
    // Якщо шторка відкрита — закриваємо її (передаємо true, щоб ігнорувати перевірки незбережених даних)
    MetroApp.closeAllSheets(true); 
  }
});

// Запускаємо процес
bootstrap();
registerServiceWorker();

// ══ ОБРОБКА СИСТЕМНОЇ КНОПКИ "НАЗАД" (ANDROID SWIPE BACK) ══
window.addEventListener('popstate', (e) => {
  const openSheets = document.querySelectorAll('.station-sheet.sheet-open');
  if (openSheets.length > 0) {
    // Закриваємо шторку, ігноруючи перевірку незбережених змін (бо користувач явно виходить)
    MetroApp.closeAllSheets(true); 
  }
});

const favListBtn = document.getElementById('favListBtn');
const menuBtn = document.getElementById('menuBtn');
const dropMenu = document.getElementById('dropMenu');
const searchBtnTop = document.getElementById('searchBtnTop');
const checkinBtn = document.getElementById('checkinBtn');

favListBtn?.addEventListener('click', openFavSheet);
searchBtnTop?.addEventListener('click', openSearchSheet);
checkinBtn?.addEventListener('click', openCheckinSheet);

if (menuBtn && dropMenu) {
  menuBtn.addEventListener('click', e => {
    e.preventDefault();
    e.stopPropagation();
    dropMenu.classList.toggle('show');
    dropMenu.hidden = !dropMenu.classList.contains('show');
  });

  document.addEventListener('click', e => {
    if (!dropMenu.contains(e.target) && !menuBtn.contains(e.target)) {
      dropMenu.classList.remove('show');
      dropMenu.hidden = true;
    }
  });

  document.getElementById('settingsItem')?.addEventListener('click', e => {
    e.preventDefault();
    e.stopPropagation();
    dropMenu.classList.remove('show');
    dropMenu.hidden = true;
    openSettingsSheet();
  });

  document.getElementById('feedbackItem')?.addEventListener('click', e => {
    e.preventDefault();
    e.stopPropagation();
    dropMenu.classList.remove('show');
    dropMenu.hidden = true;
    document.getElementById('aboutSheet')?.classList.remove('sheet-open');
    MetroApp.openFeedbackSheet?.(state.stationsData);
  });

  document.getElementById('aboutItem')?.addEventListener('click', e => {
    e.preventDefault();
    e.stopPropagation();
    dropMenu.classList.remove('show');
    dropMenu.hidden = true;
    withUnsavedCheck(() => {
      document.getElementById('feedbackSheet')?.classList.remove('sheet-open');
      openAboutSheet();
    });
  });
}

const action = new URLSearchParams(window.location.search).get('action');
if (action === 'search') {
  setTimeout(openSearchSheet, 50);
} else if (action === 'fav') {
  setTimeout(openFavSheet, 50);
} else if (Storage.get(STORAGE_KEYS.START_ON_FAV) === 'true') {
  setTimeout(openFavSheet, 50);
}

if (action) {
  window.history.replaceState({}, document.title, window.location.pathname);
}

updateCheckinDock();
updateFavDock();

MetroApp.openStation = openStation;
MetroApp.closeAllSheets = closeAllSheets;
