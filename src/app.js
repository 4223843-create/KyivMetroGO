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
  closeAllSheets, openAboutSheet
} from './sheets/sheetsManager.js';
import { withUnsavedCheck } from './core/unsavedCheck.js';
import { bus } from './core/eventBus.js';
import { state } from './core/state.js';
import { pushSheetHistory } from './ui/system.js';
import { hasOpenSheet }     from './ui/sheetNav.js';
import { showToast }        from './ui/toast.js';
import { openDevMenuSheet } from './sheets/devMenuSheet.js';

// ── Bottom bar ─────────────────────────────────────────────────
document.getElementById('favListBtn')?.addEventListener('click', openFavSheet);
document.getElementById('searchBtnTop')?.addEventListener('click', openSearchSheet);

// ── Меню розробника (плаваюча кнопка зверху карти) ──────────────
// Видимість кнопки виставляється з main.js ПІСЛЯ Storage.init() —
// тут, при імпорті цього файлу, Storage ще не завантажений, тож
// isDevMode() тут завжди хибно повернув би false.
document.getElementById('devMenuBtn')?.addEventListener('click', openDevMenuSheet);

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

// ── Помилка запису на пристрій ─────────────────────────────────
// Storage пише у фоні; якщо запис не вдався, користувач має про це знати.
let _writeFailShown = false;
bus.on('storage:write-failed', () => {
  if (_writeFailShown) return;     // одне повідомлення на сесію, а не на кожен ключ
  _writeFailShown = true;
  showToast('Не вдалося зберегти зміни на пристрої');
});

// ── Кнопка «Назад» ────────────────────────────────────────────
// Нативний Android: апаратна кнопка через @capacitor/app.
//   Пріоритет: закрити відкриту шторку → вийти з додатку.
//   canGoBack враховує pushSheetHistory() — тому перевіряємо шторки першими,
//   а не покладаємось на canGoBack як основний сигнал.
//
// Веб / PWA: браузерна кнопка «Назад» або свайп → popstate.
//   На нативному popstate НЕ реєструємо: Capacitor може тригерити обидві події
//   одночасно, що призводить до подвійного виклику closeAllSheets.

// Незбережені правки у формі — «Назад» питає, як і ✕, а не викидає їх мовчки.
function closeSheetsOnBack() {
  const feedbackOpen = document.getElementById('feedbackSheet')?.classList.contains('sheet-open');
  if (feedbackOpen && state.hasUnsavedFeedback) {
    // На вебі popstate вже з'їв запис історії — повертаємо його на випадок «Скасувати»
    if (!Capacitor.isNativePlatform()) pushSheetHistory();
    bus.emit('feedback:close');
    return;
  }
  closeAllSheets(true);
}

if (Capacitor.isNativePlatform()) {
  App.addListener('backButton', ({ canGoBack }) => {
    if (hasOpenSheet()) {
      closeSheetsOnBack();
    } else if (canGoBack) {
      window.history.back();
    } else {
      App.exitApp();
    }
  });
} else {
  window.addEventListener('popstate', () => {
    if (hasOpenSheet()) {
      closeSheetsOnBack();
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