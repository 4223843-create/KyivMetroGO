// ══ КІНЕМАТИЧНИЙ СВАЙП ШТОРКИ ══
// Підключається до будь-якої шторки через initKinematicSwipe(sheet, body, onClose).

/**
 * Прив'язує жест «свайп вниз → закрити» до шторки.
 *
 * @param {HTMLElement} sheet         - кореневий елемент шторки
 * @param {HTMLElement} body          - прокручуваний контент всередині
 * @param {Function}    closeCallback - викликається при достатньому свайпі вниз
 */
export function initKinematicSwipe(sheet, body, closeCallback) {
  let startY = 0, currentY = 0, isDragging = false;

  sheet.addEventListener('touchstart', e => {
    const isHandle  = !!e.target.closest('.sheet-handle-bar');
    const isAtTop   = body ? body.scrollTop <= 0 : true;

    if (isHandle || (isAtTop && sheet.classList.contains('sheet-scrollable'))) {
      startY     = e.touches[0].clientY;
      isDragging = true;
      sheet.style.transition = 'none';
    }
  }, { passive: true });

  sheet.addEventListener('touchmove', e => {
    if (!isDragging) return;
    const y = e.touches[0].clientY;
    currentY = y - startY;
    if (currentY > 0) sheet.style.transform = `translateY(${currentY}px)`;
  }, { passive: true });

  sheet.addEventListener('touchend', () => {
    if (!isDragging) return;
    isDragging = false;
    sheet.style.transition = '';
    sheet.style.transform  = '';
    if (currentY > 70) closeCallback();
    currentY = 0;
  }, { passive: true });
}
