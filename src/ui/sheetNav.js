// ══ НАВІГАЦІЯ МІЖ ШТОРКАМИ ══
// Єдине місце, яке відкриває й закриває шторки (.station-sheet). Одночасно
// відкрита лише одна шторка: відкриття нової ховає попередню. Тут же запис в
// історії браузера, щоб «Назад» закривав шторку, і затемнення під шторкою.
// Кнопку «Назад» (Android і браузер) обробляє app.js через hasOpenSheet().

import { animateSheetClose } from './animations.js';
import { pushSheetHistory }  from './system.js';

const _overlay = () => document.getElementById('sheetOverlay');

/** Відкрита шторка або null. */
export function getOpenSheet() {
  return document.querySelector('.station-sheet.sheet-open');
}

export const hasOpenSheet = () => !!getOpenSheet();

/**
 * Показує шторку, ховаючи інші.
 * @param {HTMLElement} sheetEl
 * @param {...string} extraClasses — напр. 'sheet-fullscreen', 'sheet-scrollable'
 */
export function showSheet(sheetEl, ...extraClasses) {
  if (!sheetEl) return;
  pushSheetHistory();
  document.querySelectorAll('.station-sheet.sheet-open').forEach(el => {
    if (el !== sheetEl) el.classList.remove('sheet-open');
  });
  sheetEl.classList.add('sheet-open', ...extraClasses);
  _overlay()?.classList.add('overlay-visible');
}

/**
 * Закриває шторку з анімацією; затемнення зникає, якщо інших шторок немає.
 * @param {HTMLElement} sheetEl
 * @param {{ removeClasses?: string[], onClosed?: () => void }} [opts]
 */
export function hideSheet(sheetEl, { removeClasses = [], onClosed } = {}) {
  if (!sheetEl) return;
  animateSheetClose(sheetEl, () => {
    sheetEl.classList.remove('sheet-open', ...removeClasses);
    if (!hasOpenSheet()) _overlay()?.classList.remove('overlay-visible');
    onClosed?.();
  });
}
