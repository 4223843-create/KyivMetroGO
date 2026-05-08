// ══ АНІМАЦІЇ ══
// Анімація «двері ліфта» і розсування підказок.
// Раніше в ui.js разом із confirm, swipe, system.
// Тепер: один файл — одна відповідальність.

import { TIMING } from '../core/timing.js';

/**
 * Базова анімація «двері ліфта» — клонує елемент і розсуває клони.
 * Використовується як animateSheetClose, так і showCustomConfirm.
 *
 * @param {HTMLElement} el       - елемент, що «розрізається»
 * @param {DOMRect}     rect     - його getBoundingClientRect()
 * @param {Function}    callback - викликається через DOOR_CALLBACK мс
 * @param {HTMLElement} parent   - куди додати клони (body або overlay)
 */
export function runDoorAnimation(el, rect, callback, parent = document.body) {
  const baseStyle = [
    'position:fixed',
    `top:${rect.top}px`, `left:${rect.left}px`,
    `width:${rect.width}px`, `height:${rect.height}px`,
    'margin:0', 'transform:none', 'pointer-events:none', 'z-index:9999',
    'transition:transform 0.6s cubic-bezier(0.32,0.72,0,1),opacity 0.45s ease',
  ].join(';');

  const L = el.cloneNode(true);
  const R = el.cloneNode(true);
  L.classList.remove('sheet-open'); L.removeAttribute('id');
  R.classList.remove('sheet-open'); R.removeAttribute('id');
  L.style.cssText = baseStyle + ';clip-path:inset(0 50% 0 0);visibility:visible';
  R.style.cssText = baseStyle + ';clip-path:inset(0 0 0 50%);visibility:visible';
  parent.appendChild(L);
  parent.appendChild(R);

  void L.offsetWidth; // force reflow
  L.style.transform = 'translateX(-50%)'; L.style.opacity = '0';
  R.style.transform = 'translateX(50%)';  R.style.opacity = '0';

  if (callback) setTimeout(callback, TIMING.DOOR_CALLBACK);
  setTimeout(() => { L.remove(); R.remove(); }, TIMING.DOOR_CLEANUP);
}

/**
 * Закриття шторки через анімацію «двері ліфта».
 */
export function animateSheetClose(sheetEl, callback) {
  if (!sheetEl || !sheetEl.classList.contains('sheet-open')) { callback?.(); return; }
  const rect = sheetEl.getBoundingClientRect();
  if (rect.height < 10) { callback?.(); return; }

  sheetEl.style.transition = 'none';
  sheetEl.style.visibility = 'hidden';

  runDoorAnimation(sheetEl, rect, callback, document.body);

  setTimeout(() => {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      sheetEl.style.transition = '';
      sheetEl.style.visibility = '';
    }));
  }, TIMING.DOOR_CLEANUP);
}

/**
 * Розсування підказки (hints у картці станції).
 * Схожа механіка, але інші тайминги і parent = document.body.
 */
export function dismissHintWithDoors(el, onDone) {
  if (!el || !document.body.contains(el)) { onDone?.(); return; }
  const rect = el.getBoundingClientRect();
  if (rect.height < 4) { el.remove(); onDone?.(); return; }

  const baseStyle = [
    'position:fixed',
    `top:${rect.top}px`, `left:${rect.left}px`,
    `width:${rect.width}px`, `height:${rect.height}px`,
    'margin:0', 'transform:none', 'pointer-events:none', 'z-index:9999',
    'transition:transform 0.55s cubic-bezier(0.32,0.72,0,1),opacity 0.4s ease',
  ].join(';');

  const L = el.cloneNode(true); L.removeAttribute('id');
  const R = el.cloneNode(true); R.removeAttribute('id');
  L.style.cssText = baseStyle + ';clip-path:inset(0 50% 0 0)';
  R.style.cssText = baseStyle + ';clip-path:inset(0 0 0 50%)';
  document.body.appendChild(L);
  document.body.appendChild(R);

  el.style.visibility = 'hidden';
  void L.offsetWidth;
  L.style.transform = 'translateX(-52%)'; L.style.opacity = '0';
  R.style.transform = 'translateX(52%)';  R.style.opacity = '0';

  setTimeout(() => { el.remove(); onDone?.(); }, TIMING.HINT_CALLBACK);
  setTimeout(() => { L.remove(); R.remove(); }, TIMING.HINT_CLEANUP);
}
