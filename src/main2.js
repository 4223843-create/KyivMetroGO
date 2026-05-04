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
    await Storage.init();

    const savedTheme = Storage.get(STORAGE_KEYS.THEME) || 
                       (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    import('./theme.js').then(m => m.applyTheme(savedTheme));


    initMap();
    MetroApp.configureEdgeToEdge(); // <--- ДОДАНО
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
window.addEventListener('popstate', (e) => {
  const openSheets = document.querySelectorAll('.station-sheet.sheet-open');
  if (openSheets.length > 0) {
    MetroApp.closeAllSheets(true); 
  }
});

bootstrap();
registerServiceWorker();

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

MetroApp.openStation = openStation;
MetroApp.closeAllSheets = closeAllSheets;

// ══ ЛОГІКА ФОРМИ "ПРО ДОДАТОК" ══

const FORMSPREE_URL_BETA = 'https://formspree.io/f/xrejbjww';

document.addEventListener('input', (e) => {
  if (e.target.classList.contains('about-beta-input')) {
    const group = e.target.closest('.about-input-group');
    if (group) group.classList.remove('has-error');
  }
});

document.addEventListener('submit', async (e) => {
  const form = e.target;
  
  if (form.id === 'aboutBetaForm') {
    e.preventDefault(); 
    
    const input = form.querySelector('.about-beta-input');
    const group = form.querySelector('.about-input-group');
    const resultMsg = form.parentElement.querySelector('.about-beta-result');
    
    if (!input) return;

    let val = input.value.trim().toLowerCase();
    
    if (val.includes('@')) {
      val = val.split('@')[0];
    }
    
    // ВАША РЕГУЛЯРКА (я повернув її, вона правильна)
    const isValid = /^[a-z0-9._\-]{6,30}$/.test(val);
    
    if (!isValid) {
      if (group) group.classList.add('has-error');
      if (resultMsg) {
        resultMsg.textContent = 'Схоже, адреса містить помилку';
        resultMsg.className = 'about-beta-result about-beta-result-error about-beta-result-open';
        setTimeout(() => {
          resultMsg.classList.remove('about-beta-result-open');
        }, 4000);
      }
      return; 
    }
    
    // --- УСПІХ ВАЛІДАЦІЇ, ПОЧИНАЄМО ВІДПРАВКУ ---
    if (group) group.classList.remove('has-error');
    const email = val + '@gmail.com';
    
    if (resultMsg) {
        resultMsg.textContent = 'Відправляємо...';
        resultMsg.className = 'about-beta-result about-beta-result-open'; // Без кольору поки що
    }

    try {
        const response = await fetch(FORMSPREE_URL_BETA, {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email: email, subject: 'Заявка на Android Beta' })
        });

        if (response.ok) {
            console.log('Успішно відправлено на Formspree:', email);
            if (resultMsg) {
                resultMsg.textContent = 'Дякую. Напишемо!';
                resultMsg.className = 'about-beta-result about-beta-result-success about-beta-result-open';
                input.value = ''; 
                input.blur();     
                setTimeout(() => { 
                    resultMsg.classList.remove('about-beta-result-open'); 
                }, 3000);
            }
        } else {
             console.error('Помилка сервера Formspree:', response.status);
             throw new Error('Server error');
        }

    } catch (error) {
         console.error('Помилка мережі при відправці:', error);
         if (group) group.classList.add('has-error');
         if (resultMsg) {
            resultMsg.textContent = 'Помилка з\'єднання. Спробуйте пізніше.';
            resultMsg.className = 'about-beta-result about-beta-result-error about-beta-result-open';
            setTimeout(() => {
                resultMsg.classList.remove('about-beta-result-open');
            }, 3000);
        }
    }
  }
});