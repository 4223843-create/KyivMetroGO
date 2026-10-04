// ══ ТОЧКИ ВХОДУ В РЕЖИМ РОЗРОБНИКА ══
// devmode.js (нотатки, підтвердження, фото, синхронізація) і меню розробника
// звичайному користувачу не потрібні, тому завантажуються динамічним import()
// лише коли режим розробника увімкнено. Решта застосунку викликає ці функції;
// поки режим вимкнено, вони нічого не завантажують.

import { isDevMode, toggleDevMode } from './devFlags.js';

let _mod     = null;
let _promise = null;

/** Завантажує devmode.js (один раз). */
export function loadDevMode() {
  _promise ??= import('./devmode.js')
    .then(m => (_mod = m))
    .catch(err => { _promise = null; throw err; });
  return _promise;
}

/** Викликає fn(devmode) одразу, якщо модуль уже є, інакше після завантаження. */
function _withDev(fn) {
  if (_mod) { fn(_mod); return; }
  loadDevMode().then(fn).catch(err => console.warn('[devHooks] devmode.js не завантажився:', err));
}

/** Кнопки розробника в рядках картки станції. */
export function attachDevModeUI(container, slug) {
  if (isDevMode()) _withDev(m => m.attachDevModeUI(container, slug));
}

/** Кнопка нотатки до станції в шапці картки (ховається, коли режим вимкнено). */
export function setupDevStationNoteButton(sheet, slug, lineColor) {
  if (_mod || isDevMode()) {
    _withDev(m => m.setupDevStationNoteButton(sheet, slug, lineColor));
    return;
  }
  sheet.querySelector('#devStationNoteBtn')?.classList.add('is-hidden');
}

export function closeAllDevPanels() {
  _mod?.closeAllDevPanels();
}

/** Плаваюча кнопка меню розробника над картою. */
export function updateDevMenuButtonVisibility() {
  document.getElementById('devMenuBtn')?.classList.toggle('is-hidden', !isDevMode());
  if (isDevMode()) _withDev(m => m.updateDevMenuButtonVisibility());
}

/** Меню розробника (окремий файл збірки разом із devmode.js). */
export function openDevMenuSheet() {
  import('../sheets/devMenuSheet.js')
    .then(m => m.openDevMenuSheet())
    .catch(err => console.warn('[devHooks] меню розробника не завантажилось:', err));
}

/**
 * П'ять швидких дотиків по нижній частині About-шторки вмикають чи вимикають
 * режим розробника. Викликається один раз, коли шторка створюється.
 */
export function setupDevModeTapCounter(aboutSheet) {
  if (isDevMode()) _withDev(m => m.attachAboutSheet(aboutSheet));

  const trigger = aboutSheet.querySelector('.about-footer') ||
                  aboutSheet.querySelector('.about-subtitle') ||
                  aboutSheet.querySelector('.sheet-handle-bar');
  if (!trigger) return;

  let taps = 0;
  let tapTimer = null;

  trigger.addEventListener('click', () => {
    taps++;
    clearTimeout(tapTimer);
    tapTimer = setTimeout(() => {
      if (taps >= 5) {
        const active = toggleDevMode();
        document.getElementById('devMenuBtn')?.classList.toggle('is-hidden', !active);
        _withDev(m => {
          m.attachAboutSheet(aboutSheet);
          m.showDevModeToast(active);
          m.updateDevMenuButtonVisibility();
        });
      }
      taps = 0;
    }, 400);
  });
}
