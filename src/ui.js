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

// ══ СПІЛЬНА ЛОГІКА АНІМАЦІЇ «ДВЕРІ ЛІФТА» ══
// Використовується як animateSheetClose, так і showCustomConfirm.
// el       — DOM-елемент, що розрізається (sheet або confirm-card)
// rect     — його BoundingClientRect
// callback — викликається через 200 мс (до завершення анімації, для плавного затемнення)
// parent   — куди додати клони (document.body або overlay)
function _runDoorAnimation(el, rect, callback, parent = document.body) {
  const baseStyle = [
    'position:fixed',
    'top:'    + rect.top    + 'px',
    'left:'   + rect.left   + 'px',
    'width:'  + rect.width  + 'px',
    'height:' + rect.height + 'px',
    'margin:0', 'transform:none', 'pointer-events:none', 'z-index:9999',
    'transition:transform 0.6s cubic-bezier(0.32,0.72,0,1),opacity 0.45s ease',
  ].join(';');

  const leftDoor  = el.cloneNode(true);
  const rightDoor = el.cloneNode(true);

  leftDoor.classList.remove('sheet-open');
  rightDoor.classList.remove('sheet-open');
  leftDoor.removeAttribute('id');
  rightDoor.removeAttribute('id');

  leftDoor.style.cssText  = baseStyle + ';clip-path:inset(0 50% 0 0);visibility:visible';
  rightDoor.style.cssText = baseStyle + ';clip-path:inset(0 0 0 50%);visibility:visible';
  parent.appendChild(leftDoor);
  parent.appendChild(rightDoor);

  void leftDoor.offsetWidth; // reflow

  leftDoor.style.transform  = 'translateX(-50%)';
  rightDoor.style.transform = 'translateX(50%)';
  leftDoor.style.opacity    = '0';
  rightDoor.style.opacity   = '0';

  // Викликаємо callback раніше, щоб затемнення карти спадало під час руху «дверей»
  if (callback) setTimeout(callback, 200);

  setTimeout(() => {
    leftDoor.remove();
    rightDoor.remove();
  }, 620);
}

// ══ АНІМАЦІЯ ЗАКРИТТЯ ШТОРКИ («ДВЕРІ ЛІФТА») ══
// Спеціально клонує DOM для ефекту clip-path — НЕ замінювати на CSS translateY.
MetroApp.animateSheetClose = function(sheetEl, callback) {
  if (!sheetEl || !sheetEl.classList.contains('sheet-open')) { callback?.(); return; }
  const rect = sheetEl.getBoundingClientRect();
  if (rect.height < 10) { callback?.(); return; }

  sheetEl.style.transition  = 'none';
  sheetEl.style.visibility  = 'hidden';

  _runDoorAnimation(sheetEl, rect, callback, document.body);

  setTimeout(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
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

    const rect = card.getBoundingClientRect();
    card.style.display = 'none';

    overlay.style.transition      = 'background-color 0.35s, backdrop-filter 0.35s';
    overlay.style.backgroundColor = 'transparent';
    overlay.style.backdropFilter  = 'blur(0px)';

    _runDoorAnimation(card, rect, callback, overlay);

    setTimeout(() => { overlay.remove(); }, 620);
  }

  overlay.querySelector('#confirmYes').addEventListener('click', () => animateClose(onYes));
  overlay.querySelector('#confirmNo').addEventListener('click',  () => animateClose(onNo));
  const cancelBtn = overlay.querySelector('#confirmCancel');
  if (cancelBtn) cancelBtn.addEventListener('click', () => animateClose(onCancel));
  overlay.addEventListener('click', e => { if (e.target === overlay) animateClose(onCancel); });
};
// ══ ТАКТИЛЬНИЙ ВІДГУК (HAPTICS) ══
MetroApp.hapticImpact = async function(style = 'light') {
  // 1. Спроба використати Capacitor Haptics (для AAB)
  if (window.Capacitor?.Plugins?.Haptics) {
    try {
      await window.Capacitor.Plugins.Haptics.impact({ style: style.toUpperCase() });
      return;
    } catch (e) { /* Плагін недоступний, йдемо далі */ }
  } 
  // 2. Фолбек для звичайного браузера / PWA
  if (navigator.vibrate) {
    // 10ms - легкий клік (light), 20ms - відчутний (heavy)
    navigator.vibrate(style === 'heavy' ? 20 : 10);
  }
};

// ══ НАЛАШТУВАННЯ СИСТЕМНИХ ПАНЕЛЕЙ (CAPACITOR) ══
MetroApp.configureEdgeToEdge = async function() {
  if (window.Capacitor?.Plugins?.StatusBar) {
    const { StatusBar, Style } = window.Capacitor.Plugins;
    try {
      // Робимо статус-бар прозорим (карта заїжджатиме під нього)
      await StatusBar.setOverlaysWebView({ overlay: true });
      
      // Автоматично визначаємо колір тексту статус-бару (білий або чорний)
      const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      await StatusBar.setStyle({ style: isDark ? Style.Dark : Style.Light });
    } catch (e) {
      console.warn('[KyivMetroGO] StatusBar plugin error:', e);
    }
  }
};

// ══ КЕРУВАННЯ ІСТОРІЄЮ (ДЛЯ СИСТЕМНОЇ КНОПКИ "НАЗАД") ══
MetroApp.pushSheetHistory = function() {
  // Додаємо запис в історію тільки якщо його там ще немає
  if (!history.state?.isSheetOpen) {
    history.pushState({ isSheetOpen: true }, '');
  }
};

// ══ КІНЕМАТИЧНИЙ СВАЙП ШТОРКИ (1:1 за пальцем) ══
MetroApp.initKinematicSwipe = function(sheet, body, closeCallback) {
  let startY = 0, currentY = 0, isDragging = false;

  sheet.addEventListener('touchstart', e => {
    const isHandle = !!e.target.closest('.sheet-handle-bar');
    const isAtTop = body ? body.scrollTop <= 0 : true;
    
    // Дозволяємо тягнути за шапку, АБО за тіло, якщо воно проскролене на самий верх
    if (isHandle || (isAtTop && sheet.classList.contains('sheet-scrollable'))) {
      startY = e.touches[0].clientY;
      isDragging = true;
      sheet.style.transition = 'none'; // Вимикаємо CSS-анімацію для миттєвого руху
    }
  }, { passive: true });

  sheet.addEventListener('touchmove', e => {
    if (!isDragging) return;
    const y = e.touches[0].clientY;
    currentY = y - startY;

    // Дозволяємо тягнути тільки вниз
    if (currentY > 0) {
      sheet.style.transform = `translateY(${currentY}px)`;
    }
  }, { passive: true });

  sheet.addEventListener('touchend', () => {
    if (!isDragging) return;
    isDragging = false;
    sheet.style.transition = ''; // Повертаємо CSS-анімацію
    sheet.style.transform = '';  // Очищаємо inline-стиль

    if (currentY > 70) {
      // Якщо потягнули достатньо сильно — закриваємо
      closeCallback();
    }
    currentY = 0;
  }, { passive: true });
};