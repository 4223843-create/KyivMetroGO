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
import './about.js';

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
    await Storage.init();

    // Міграція: видаляємо застарілий флаг — підказка тепер встановлюється лише після показу
    Storage.remove(STORAGE_KEYS.CHECKIN_HINT_SEEN);

    const savedTheme = Storage.get(STORAGE_KEYS.THEME) ||
                       (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    import('./theme.js').then(m => m.applyTheme(savedTheme));

    initMap();
    MetroApp.configureEdgeToEdge();
    await reloadStationsData();

    updateCheckinDock();
    updateFavDock();

    const params = new URLSearchParams(window.location.search);
    const action = params.get('action');

    if (action === 'search') {
      openSearchSheet();
    } else if (action === 'fav') {
      openFavSheet();
    } else if (Storage.get(STORAGE_KEYS.START_ON_FAV) === 'true') {
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
window.addEventListener('popstate', () => {
  const openSheets = document.querySelectorAll('.station-sheet.sheet-open');
  if (openSheets.length > 0) {
    MetroApp.closeAllSheets(true);
  }
});

bootstrap();
registerServiceWorker();

const favListBtn   = document.getElementById('favListBtn');
const menuBtn      = document.getElementById('menuBtn');
const dropMenu     = document.getElementById('dropMenu');
const searchBtnTop = document.getElementById('searchBtnTop');
const checkinBtn   = document.getElementById('checkinBtn');

favListBtn?.addEventListener('click', openFavSheet);
searchBtnTop?.addEventListener('click', openSearchSheet);
checkinBtn?.addEventListener('click', openCheckinSheet);

// ── Хелпер: закрити dropdown ──
function closeDropMenu() {
  dropMenu.classList.remove('show');
  dropMenu.hidden = true;
}

if (menuBtn && dropMenu) {
  menuBtn.addEventListener('click', e => {
    e.preventDefault();
    e.stopPropagation();
    const willShow = !dropMenu.classList.contains('show');
    dropMenu.classList.toggle('show', willShow);
    dropMenu.hidden = !willShow;
  });

  document.addEventListener('click', e => {
    if (!dropMenu.contains(e.target) && !menuBtn.contains(e.target)) {
      closeDropMenu();
    }
  });

  document.getElementById('settingsItem')?.addEventListener('click', e => {
    e.preventDefault();
    e.stopPropagation();
    closeDropMenu();
    openSettingsSheet();
  });

  document.getElementById('feedbackItem')?.addEventListener('click', e => {
    e.preventDefault();
    e.stopPropagation();
    closeDropMenu();
    document.getElementById('aboutSheet')?.classList.remove('sheet-open');
    MetroApp.openFeedbackSheet?.(state.stationsData);
  });

  document.getElementById('aboutItem')?.addEventListener('click', e => {
    e.preventDefault();
    e.stopPropagation();
    closeDropMenu();
    withUnsavedCheck(() => {
      document.getElementById('feedbackSheet')?.classList.remove('sheet-open');
      openAboutSheet();
    });
  });
}

MetroApp.openStation    = openStation;
MetroApp.closeAllSheets = closeAllSheets;
