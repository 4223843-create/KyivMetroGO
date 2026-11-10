// ══ НАВІГАЦІЯ МІЖ ШТОРКАМИ ══
// Єдине місце, яке відкриває й закриває шторки (.station-sheet). Одночасно
// відкрита лише одна шторка: відкриття нової ховає попередню. Тут же запис в
// історії браузера, щоб «Назад» закривав шторку, і затемнення під шторкою.
// Кнопку «Назад» (Android і браузер) обробляє app.js через hasOpenSheet().
//
// Доступність: відкрита шторка — діалог (role="dialog", aria-modal, назва з
// заголовка), фокус переходить на заголовок і повертається туди, звідки її
// відкрили. Карта й нижня панель під затемненням ховаються від TalkBack/VoiceOver
// (aria-hidden), щоб читач екрана не «провалювався» під шторку. inert не ставимо:
// тап по затемненню шукає станцію під ним через elementFromPoint.

import { animateSheetClose } from './animations.js';
import { pushSheetHistory }  from './system.js';

const _overlay = () => document.getElementById('sheetOverlay');

/** Те, що лежить під затемненням: карта й нижня панель. */
const BACKGROUND_SELECTORS = ['main', '.bottom-nav-dock'];

/** Куди повернути фокус після закриття (елемент, з якого відкрили першу шторку). */
let _returnFocusTo = null;

function _setBackgroundHidden(hidden) {
  for (const sel of BACKGROUND_SELECTORS) {
    document.querySelectorAll(sel).forEach(el => {
      if (hidden) el.setAttribute('aria-hidden', 'true');
      else el.removeAttribute('aria-hidden');
    });
  }
}

let _titleSeq = 0;

/** role="dialog" + aria-labelledby на заголовок шторки; повертає заголовок. */
function _markDialog(sheetEl) {
  sheetEl.setAttribute('role', 'dialog');
  sheetEl.setAttribute('aria-modal', 'true');
  const title = sheetEl.querySelector('.sheet-station-title, .sheet-sheet-title');
  if (title) {
    if (!title.id) title.id = `sheetTitle${++_titleSeq}`;
    sheetEl.setAttribute('aria-labelledby', title.id);
    if (!title.hasAttribute('tabindex')) title.setAttribute('tabindex', '-1');
  }
  return title;
}

function _focusSheet(sheetEl, title) {
  // Після кадру: вміст шторки часто дорендерюється вже після showSheet
  requestAnimationFrame(() => {
    if (!sheetEl.classList.contains('sheet-open')) return;
    if (sheetEl.contains(document.activeElement)) return;
    (title || sheetEl).focus?.({ preventScroll: true });
  });
}

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
  if (!hasOpenSheet()) {
    const active = document.activeElement;
    _returnFocusTo = active && active !== document.body ? active : null;
  }
  sheetEl.classList.add('sheet-open', ...extraClasses);
  _overlay()?.classList.add('overlay-visible');
  const title = _markDialog(sheetEl);
  if (!title && !sheetEl.hasAttribute('tabindex')) sheetEl.setAttribute('tabindex', '-1');
  _setBackgroundHidden(true);
  _focusSheet(sheetEl, title);
}

/** Шторки нема — карта знову доступна читачу екрана, фокус повертається. */
export function releaseSheetFocus() {
  if (hasOpenSheet()) return;
  _setBackgroundHidden(false);
  const target = _returnFocusTo;
  _returnFocusTo = null;
  if (target?.isConnected && !target.closest('[hidden]')) target.focus?.({ preventScroll: true });
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
    releaseSheetFocus();
    onClosed?.();
  });
}
