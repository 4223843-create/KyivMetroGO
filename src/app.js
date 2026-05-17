// ══ UI-ПРИВ'ЯЗКИ ДОДАТКУ ══
// Тільки addEventListener. Нуль мережевих запитів, нуль ініціалізації даних.

import { openFavSheet }    from './features/favorites/index.js';
import { openCheckinSheet } from './features/checkin/index.js';
import { openSearchSheet } from './features/search.js';
import { openSettingsSheet } from './features/settings.js';
import {
  openStation, closeAllSheets, openAboutSheet, withUnsavedCheck,
} from './sheets/sheetsManager.js';
import { bus } from './core/eventBus.js';

// ── Bottom bar ─────────────────────────────────────────────────
document.getElementById('favListBtn')?.addEventListener('click', openFavSheet);
document.getElementById('searchBtnTop')?.addEventListener('click', openSearchSheet);
document.getElementById('checkinBtn')?.addEventListener('click', openCheckinSheet);

// ── Dropdown меню ──────────────────────────────────────────────
const menuBtn  = document.getElementById('menuBtn');
const dropMenu = document.getElementById('dropMenu');

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
    if (!dropMenu.contains(e.target) && !menuBtn.contains(e.target)) closeDropMenu();
  });

  document.getElementById('settingsItem')?.addEventListener('click', e => {
    e.preventDefault(); e.stopPropagation();
    closeDropMenu();
    openSettingsSheet();
  });

  document.getElementById('feedbackItem')?.addEventListener('click', e => {
    e.preventDefault(); e.stopPropagation();
    closeDropMenu();
    document.getElementById('aboutSheet')?.classList.remove('sheet-open');
    bus.emit('sheet:open-feedback');
  });

  document.getElementById('aboutItem')?.addEventListener('click', e => {
    e.preventDefault(); e.stopPropagation();
    closeDropMenu();
    withUnsavedCheck(() => {
      document.getElementById('feedbackSheet')?.classList.remove('sheet-open');
      openAboutSheet();
    });
  });
}

// ── Android back button ────────────────────────────────────────
window.addEventListener('popstate', () => {
  if (document.querySelectorAll('.station-sheet.sheet-open').length > 0) {
    closeAllSheets(true);
  }
});