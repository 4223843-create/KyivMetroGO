// ══ UI УТИЛІТИ ══

export function pill(label, value, color) {
  return `<div class="pos-pill"><div class="pos-pill-label">${label}</div><div class="pos-pill-num" style="color:${color}">${value}</div></div>`;
}

export function heartSvg(isFav, _slug, lineColor) {
  const base = 'width="18" height="18" viewBox="-1 -1 19 19" xmlns="http://www.w3.org/2000/svg"';
  if (!isFav) {
    return `<svg ${base} fill="none" stroke="currentColor" stroke-width="1.3"><path d="${MetroApp.Icons.heartPath}"/></svg>`;
  }
  return `<svg ${base} fill="${lineColor}"><path d="${MetroApp.Icons.heartPath}"/></svg>`;
}

// ══ АНІМАЦІЯ ЗАКРИТТЯ ШТОРКИ («ДВЕРІ ЛІФТА») ══
// Спеціально клонує DOM для ефекту clip-path — НЕ замінювати на CSS translateY.
MetroApp.animateSheetClose = function(sheetEl, callback) {
  if (!sheetEl || !sheetEl.classList.contains('sheet-open')) { callback?.(); return; }
  const rect = sheetEl.getBoundingClientRect();
  if (rect.height < 10) { callback?.(); return; }

  sheetEl.style.transition  = 'none';
  sheetEl.style.visibility  = 'hidden';

const baseStyle = [
    'position:fixed',
    'top:'    + rect.top    + 'px',
    'left:'   + rect.left   + 'px',
    'width:'  + rect.width  + 'px',
    'height:' + rect.height + 'px',
    'margin:0', 'transform:none', 'pointer-events:none', 'z-index:9999',
    'transition:transform 0.6s cubic-bezier(0.32,0.72,0,1),opacity 0.45s ease',
  ].join(';');

  const leftDoor  = sheetEl.cloneNode(true);
  const rightDoor = sheetEl.cloneNode(true);
  leftDoor.style.cssText  = baseStyle + ';clip-path:inset(0 50% 0 0);visibility:visible';
  rightDoor.style.cssText = baseStyle + ';clip-path:inset(0 0 0 50%);visibility:visible';

  document.body.appendChild(leftDoor);
  document.body.appendChild(rightDoor);

  void leftDoor.offsetWidth; // reflow

  leftDoor.style.transform  = 'translateX(-50%)';
  rightDoor.style.transform = 'translateX(50%)';
  leftDoor.style.opacity    = '0';
  rightDoor.style.opacity   = '0';

  setTimeout(function() {
    leftDoor.remove();
    rightDoor.remove();
    callback && callback();
    requestAnimationFrame(function() {
      requestAnimationFrame(function() {
        sheetEl.style.transition = '';
        sheetEl.style.visibility = '';
      });
    });
  }, 620);
};

// ══ КАСТОМНИЙ CONFIRM-ДІАЛОГ ══
MetroApp.showCustomConfirm = function(
  message, onYes, onNo, onCancel,
  yesText  = 'Зберегти',
  noText   = 'Не зберігати',
  yesClass = 'confirm-btn-save',
  noClass  = 'confirm-btn-discard'
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

    const rect     = card.getBoundingClientRect();
    const leftDoor = card.cloneNode(true);
    const rightDoor = card.cloneNode(true);

    [leftDoor, rightDoor].forEach(door => {
      door.style.position   = 'fixed';
      door.style.top        = rect.top    + 'px';
      door.style.left       = rect.left   + 'px';
      door.style.width      = rect.width  + 'px';
      door.style.height     = rect.height + 'px';
      door.style.margin     = '0';
      door.style.animation  = 'none';
      door.style.transition = 'transform 0.6s cubic-bezier(0.32, 0.72, 0, 1), opacity 0.45s ease';
      door.style.pointerEvents = 'none';
    });
    leftDoor.style.clipPath  = 'inset(0 50% 0 0)';
    rightDoor.style.clipPath = 'inset(0 0 0 50%)';

    overlay.appendChild(leftDoor);
    overlay.appendChild(rightDoor);
    card.style.display = 'none';

    void leftDoor.offsetWidth;

    overlay.style.transition      = 'background-color 0.35s, backdrop-filter 0.35s';
    overlay.style.backgroundColor = 'transparent';
    overlay.style.backdropFilter  = 'blur(0px)';

    leftDoor.style.transform  = 'translateX(-50%)';
    rightDoor.style.transform = 'translateX(50%)';
    leftDoor.style.opacity    = '0';
    rightDoor.style.opacity   = '0';

setTimeout(() => { overlay.remove(); callback?.(); }, 620);
  }

  overlay.querySelector('#confirmYes').addEventListener('click', () => animateClose(onYes));
  overlay.querySelector('#confirmNo').addEventListener('click',  () => animateClose(onNo));
  const cancelBtn = overlay.querySelector('#confirmCancel');
  if (cancelBtn) cancelBtn.addEventListener('click', () => animateClose(onCancel));
  overlay.addEventListener('click', e => { if (e.target === overlay) animateClose(onCancel); });
};
