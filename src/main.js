// ══ ЯДРО ══ — порядок імпортів важливий
import { STORAGE_KEYS, Storage } from './storage.js';
import './icons.js';
import './state.js';

// UI до всього іншого (animateSheetClose потрібен всім)
import './ui.js';

// Тема — до рендеру (уникаємо flash)
import './theme.js';

// Дані та карта
import { reloadStationsData, renderMapZones } from './stations.js';
import { initMap }                            from './map.js';

// Функціональні модулі
import { openFavSheet, updateFavDock }        from './favorites.js';
import { updateCheckinDock, openCheckinSheet } from './checkin.js';
import { openSearchSheet }                    from './search.js';
import { openStation, closeAllSheets,
         openAboutSheet, withUnsavedCheck }   from './sheets.js';
import { openSettingsSheet }                  from './settings.js';

// Офлайн-банер + SW toast
import './offline.js';

// ══ ІНІЦІАЛІЗАЦІЯ ══

// 1. Карта (синхронно, SVG вже вбудований через ?raw)
initMap();

// 2. Дані станцій (асинхронно)
reloadStationsData().catch(err => console.error('stations.json load failed', err));

// ══ DOCK-НАВІГАЦІЯ ══
const favListBtn   = document.getElementById('favListBtn');
const menuBtn      = document.getElementById('menuBtn');
const dropMenu     = document.getElementById('dropMenu');
const searchBtnTop = document.getElementById('searchBtnTop');
const checkinBtn   = document.getElementById('checkinBtn');

favListBtn?.addEventListener('click', openFavSheet);
searchBtnTop?.addEventListener('click', openSearchSheet);
checkinBtn?.addEventListener('click', openCheckinSheet);

// ══ МЕНЮ ══
if (menuBtn && dropMenu) {
  menuBtn.addEventListener('click', e => {
    e.preventDefault(); e.stopPropagation();
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
    e.preventDefault(); e.stopPropagation();
    dropMenu.classList.remove('show'); dropMenu.hidden = true;
    openSettingsSheet();
  });

  document.getElementById('feedbackItem')?.addEventListener('click', async e => {
    e.preventDefault(); e.stopPropagation();
    dropMenu.classList.remove('show'); dropMenu.hidden = true;
    document.getElementById('aboutSheet')?.classList.remove('sheet-open');

    // ── LAZY LOAD feedback.js ──
    if (!MetroApp.openFeedbackSheet) {
      await import('./feedback.js');
    }
    MetroApp.openFeedbackSheet?.(state.stationsData);
  });

  document.getElementById('aboutItem')?.addEventListener('click', e => {
    e.preventDefault(); e.stopPropagation();
    dropMenu.classList.remove('show'); dropMenu.hidden = true;
    withUnsavedCheck(() => {
      document.getElementById('feedbackSheet')?.classList.remove('sheet-open');
      openAboutSheet();
    });
  });
}

// ══ PWA SHORTCUTS (action=search | action=fav) ══
const action = new URLSearchParams(window.location.search).get('action');
if (action === 'search') {
  setTimeout(openSearchSheet, 50);
} else if (action === 'fav') {
  setTimeout(openFavSheet, 50);
} else if (Storage.get('metro_start_on_fav') === 'true') {
  setTimeout(openFavSheet, 50);
}
if (action) window.history.replaceState({}, document.title, window.location.pathname);

// ══ DOCK-ІКОНКИ (початковий стан) ══
updateCheckinDock();
updateFavDock();

// Публікуємо для міжмодульного доступу (наприклад, з settings.js)
MetroApp.openStation    = openStation;
MetroApp.closeAllSheets = closeAllSheets;
