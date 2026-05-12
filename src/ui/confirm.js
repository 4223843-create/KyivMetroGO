// ══ КАСТОМНИЙ CONFIRM-ДІАЛОГ ══

import { runDoorAnimation } from './animations.js';
import { TIMING }           from '../core/timing.js';

/**
 * Показує модальний діалог підтвердження з анімацією «двері ліфта».
 *
 * @param {string}   message   - HTML-текст запитання
 * @param {Function} onYes     - callback для «Зберегти»
 * @param {Function} onNo      - callback для «Не зберігати»
 * @param {Function} onCancel  - callback для «Скасувати» (null = кнопка прихована)
 * @param {string}   yesText   - текст кнопки «так»
 * @param {string}   noText    - текст кнопки «ні»
 * @param {string}   yesClass  - CSS-клас кнопки «так»
 * @param {string}   noClass   - CSS-клас кнопки «ні»
 */
export function showCustomConfirm(
  message, onYes, onNo, onCancel,
  yesText  = 'Зберегти',
  noText   = 'Не зберігати',
  yesClass = 'confirm-btn-save',
  noClass  = 'confirm-btn-discard',
) {
  const overlay = document.createElement('div');
  overlay.className = 'global-confirm-overlay';
  overlay.innerHTML = `
    <div class="global-confirm-card">
      <div class="global-confirm-text">${message}</div>
      <div class="global-confirm-btns-main">
        <button class="confirm-main-btn ${yesClass}" id="confirmYes">${yesText}</button>
        <button class="confirm-main-btn ${noClass}"  id="confirmNo">${noText}</button>
      </div>
      ${onCancel ? `<button class="confirm-text-btn" id="confirmCancel">Скасувати</button>` : ''}
    </div>`;
  document.body.appendChild(overlay);

  function animateClose(callback) {
    const card = overlay.querySelector('.global-confirm-card');
    if (!card) { overlay.remove(); callback?.(); return; }

    const rect = card.getBoundingClientRect();
    card.style.display = 'none';
    overlay.style.transition      = 'background-color 0.35s, backdrop-filter 0.35s';
    overlay.style.backgroundColor = 'transparent';
    overlay.style.backdropFilter  = 'blur(0px)';

    runDoorAnimation(card, rect, callback, overlay);
    setTimeout(() => overlay.remove(), TIMING.DOOR_CLEANUP);
  }

  overlay.querySelector('#confirmYes').addEventListener('click', () => animateClose(onYes));
  overlay.querySelector('#confirmNo').addEventListener('click',  () => animateClose(onNo));
  overlay.querySelector('#confirmCancel')?.addEventListener('click', () => animateClose(onCancel));
  overlay.addEventListener('click', e => { if (e.target === overlay) animateClose(onCancel); });
}
