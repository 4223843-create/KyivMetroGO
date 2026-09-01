// ══ UI-ПРИВ'ЯЗКИ ДОДАТКУ ══
// Відповідальність: підключення DOM-кнопок до функцій-обробників.
// Тільки addEventListener. Нуль мережевих запитів, нуль ініціалізації даних.
// Виконується як side-effect при імпорті в main.js.

import { Capacitor } from '@capacitor/core';
import { App }       from '@capacitor/app';

import { STORAGE_KEYS, Storage } from './core/storage.js';
import { openFavSheet }    from './features/favorites/index.js';
import { openCheckinSheet, updateCheckinDock } from './features/checkin/index.js';
import { openSearchSheet } from './features/search.js';
import { openSettingsSheet, isEditModeEnabled } from './features/settings.js';
import {
  openStation, closeAllSheets, openAboutSheet
} from './sheets/sheetsManager.js';
import { withUnsavedCheck } from './core/unsavedCheck.js';
import { bus } from './core/eventBus.js';

// ── Bottom bar ─────────────────────────────────────────────────
document.getElementById('favListBtn')?.addEventListener('click', openFavSheet);
document.getElementById('searchBtnTop')?.addEventListener('click', openSearchSheet);

// ── Dropdown меню ──────────────────────────────────────────────
const menuBtn  = document.getElementById('menuBtn');
const dropMenu = document.getElementById('dropMenu');

function closeDropMenu() {
  dropMenu.classList.remove('show');
  dropMenu.hidden = true;
}

if (menuBtn && dropMenu) {
  const feedbackMenuItem = document.getElementById('feedbackItem');
  menuBtn.addEventListener('click', e => {
    e.preventDefault();
    e.stopPropagation();
    if (feedbackMenuItem) feedbackMenuItem.hidden = !isEditModeEnabled();
    updateCheckinDock();
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

  document.getElementById('checkinBtn')?.addEventListener('click', e => {
    e.preventDefault(); e.stopPropagation();
    closeDropMenu();
    openCheckinSheet();
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

// ── Кнопка «Назад» ────────────────────────────────────────────
// Нативний Android: апаратна кнопка через @capacitor/app.
//   Пріоритет: закрити відкриту шторку → вийти з додатку.
//   canGoBack враховує pushSheetHistory() — тому перевіряємо шторки першими,
//   а не покладаємось на canGoBack як основний сигнал.
//
// Веб / PWA: браузерна кнопка «Назад» або свайп → popstate.
//   На нативному popstate НЕ реєструємо: Capacitor може тригерити обидві події
//   одночасно, що призводить до подвійного виклику closeAllSheets.

if (Capacitor.isNativePlatform()) {
  App.addListener('backButton', ({ canGoBack }) => {
    const hasOpenSheet = document.querySelectorAll('.station-sheet.sheet-open').length > 0;
    if (hasOpenSheet) {
      closeAllSheets(true);
    } else if (canGoBack) {
      window.history.back();
    } else {
      App.exitApp();
    }
  });
} else {
  window.addEventListener('popstate', () => {
    if (document.querySelectorAll('.station-sheet.sheet-open').length > 0) {
      closeAllSheets(true);
    }
  });
}

// ── «Вибране при запуску» — і при поверненні з фону ─────────────
// bootstrap() (main.js) виконує це лише один раз, при справжньому холодному
// старті. Але стандартний сценарій на iOS — згорнути застосунок (не закрити),
// а потім розгорнути; JS-контекст при цьому не перестворюється, тож bootstrap()
// повторно не запускається. Тому додатково слухаємо повернення з фону:
// нативно — подію 'resume' з @capacitor/app, у вебі/PWA — visibilitychange.
// Відкриваємо тільки якщо жодної шторки ще не відкрито, щоб не перебивати
// поточний перегляд станції/пошуку/налаштувань.
const sheetOverlay = document.getElementById('sheetOverlay');

function _maybeOpenFavOnResume() {
  if (Storage.get(STORAGE_KEYS.START_ON_FAV) !== 'true') return;
  if (sheetOverlay?.classList.contains('overlay-visible')) return;
  openFavSheet();
}

if (Capacitor.isNativePlatform()) {
  App.addListener('resume', _maybeOpenFavOnResume);
} else {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') _maybeOpenFavOnResume();
  });
}