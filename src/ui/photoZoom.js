// ══ ПЕРЕГЛЯД ФОТО З МАСШТАБУВАННЯМ ══
// Відповідальність: зум і переміщення зображення в повноекранному перегляді.
// Два пальці — масштаб, один палець при збільшенні — переміщення,
// подвійний тап — збільшити / повернути, колесо миші — масштаб.
// Одиночний тап без збільшення — закрити (onClose).
// Без збільшення горизонтальний свайп гортає фото (onSwipe), якщо їх кілька.

const MIN_SCALE    = 1;
const MAX_SCALE    = 5;
const DOUBLE_SCALE = 2.5;
const TAP_MOVE_PX  = 10;
const TAP_MS       = 300;
const DOUBLE_MS    = 280;
const SWIPE_PX     = 50;   // скільки протягнути, щоб перейти до сусіднього фото

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/**
 * Вмикає зум на img усередині overlay.
 * @param {HTMLElement} overlay — повноекранний контейнер (img по центру)
 * @param {HTMLImageElement} img
 * @param {() => void} onClose — одиночний тап при масштабі 1
 * @param {(dir: 1 | -1) => boolean} [onSwipe] — свайп при масштабі 1:
 *   1 — наступне фото, −1 — попереднє; повертає false, якщо далі фото немає
 * @returns {{ reset: () => void }}
 */
export function attachPhotoZoom(overlay, img, onClose, onSwipe) {
  let scale = 1, tx = 0, ty = 0;
  const pointers = new Map();
  let gesture = null;      // { kind: 'pinch' | 'pan', ... }
  let tapStart = null;     // { x, y, t } — для розпізнавання тапу
  let lastTap  = null;     // { x, y, t } — для подвійного тапу
  let closeTimer = null;

  const apply = (animate = false) => {
    img.style.transition = animate ? 'transform 0.2s ease' : 'none';
    img.style.transform  = `translate(${tx}px, ${ty}px) scale(${scale})`;
  };

  // Не даємо зображенню виїхати за межі: край не відходить від краю екрана
  const clampTranslate = () => {
    const w = img.offsetWidth, h = img.offsetHeight;
    const maxX = Math.max(0, (w * scale - overlay.clientWidth)  / 2);
    const maxY = Math.max(0, (h * scale - overlay.clientHeight) / 2);
    tx = clamp(tx, -maxX, maxX);
    ty = clamp(ty, -maxY, maxY);
  };

  const center = () => {
    const r = overlay.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  };

  // Масштаб навколо точки екрана (px, py): точка зображення під нею лишається на місці
  const zoomAt = (newScale, px, py) => {
    const c  = center();
    const qx = (px - c.x - tx) / scale;
    const qy = (py - c.y - ty) / scale;
    scale = clamp(newScale, MIN_SCALE, MAX_SCALE);
    tx = px - c.x - scale * qx;
    ty = py - c.y - scale * qy;
    if (scale === 1) { tx = 0; ty = 0; }
    clampTranslate();
  };

  const reset = () => {
    scale = 1; tx = 0; ty = 0;
    pointers.clear(); gesture = null; tapStart = null; lastTap = null;
    clearTimeout(closeTimer);
    apply();
  };

  const startGesture = () => {
    const pts = [...pointers.values()];
    if (pts.length >= 2) {
      const [a, b] = pts;
      const c = center();
      gesture = {
        kind: 'pinch',
        dist: Math.hypot(b.x - a.x, b.y - a.y) || 1,
        scale,
        // точка зображення під серединою пальців
        qx: ((a.x + b.x) / 2 - c.x - tx) / scale,
        qy: ((a.y + b.y) / 2 - c.y - ty) / scale,
      };
    } else if (pts.length === 1) {
      gesture = { kind: 'pan', x: pts[0].x, y: pts[0].y, tx, ty };
    } else {
      gesture = null;
    }
  };

  overlay.addEventListener('pointerdown', e => {
    overlay.setPointerCapture?.(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    tapStart = pointers.size === 1 ? { x: e.clientX, y: e.clientY, t: Date.now() } : null;
    startGesture();
  });

  overlay.addEventListener('pointermove', e => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (tapStart && Math.hypot(e.clientX - tapStart.x, e.clientY - tapStart.y) > TAP_MOVE_PX) tapStart = null;
    if (!gesture) return;

    if (gesture.kind === 'pinch') {
      const [a, b] = [...pointers.values()];
      const c  = center();
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      scale = clamp(gesture.scale * Math.hypot(b.x - a.x, b.y - a.y) / gesture.dist, MIN_SCALE, MAX_SCALE);
      tx = mx - c.x - scale * gesture.qx;
      ty = my - c.y - scale * gesture.qy;
      clampTranslate();
      apply();
    } else if (gesture.kind === 'pan' && scale > 1) {
      tx = gesture.tx + (e.clientX - gesture.x);
      ty = gesture.ty + (e.clientY - gesture.y);
      clampTranslate();
      apply();
    } else if (gesture.kind === 'pan' && onSwipe && pointers.size === 1) {
      // Без збільшення фото їде за пальцем по горизонталі — гортання
      gesture.swipe = true;
      tx = e.clientX - gesture.x;
      ty = 0;
      apply();
    }
  });

  // Завершити свайп: перейти до сусіднього фото або повернути на місце
  const finishSwipe = (dx, dy) => {
    const dir = dx < 0 ? 1 : -1;
    if (Math.abs(dx) > SWIPE_PX && Math.abs(dx) > Math.abs(dy) && onSwipe(dir)) {
      // нове фото заїжджає з того боку, куди тягнули
      tx = dir * overlay.clientWidth * 0.35; ty = 0;
      apply();
      requestAnimationFrame(() => { tx = 0; apply(true); });
    } else {
      tx = 0; ty = 0;
      apply(true);
    }
  };

  const endPointer = e => {
    if (!pointers.has(e.pointerId)) return;
    const swipe = gesture?.kind === 'pan' && gesture.swipe && scale === 1 && pointers.size === 1
      ? { dx: e.clientX - gesture.x, dy: e.clientY - gesture.y } : null;
    pointers.delete(e.pointerId);
    if (swipe) { finishSwipe(swipe.dx, swipe.dy); gesture = null; tapStart = null; return; }
    if (scale < 1.05 && pointers.size === 0) { scale = 1; tx = 0; ty = 0; apply(true); }
    startGesture(); // палець, що лишився, продовжує переміщення без стрибка

    if (e.type !== 'pointerup' || !tapStart || pointers.size) return;
    const tap = { x: e.clientX, y: e.clientY, t: Date.now() };
    const isTap = tap.t - tapStart.t < TAP_MS;
    tapStart = null;
    if (!isTap) return;

    // Подвійний тап: збільшити в точці тапу або повернути до 1
    if (lastTap && tap.t - lastTap.t < DOUBLE_MS && Math.hypot(tap.x - lastTap.x, tap.y - lastTap.y) < 40) {
      clearTimeout(closeTimer);
      lastTap = null;
      if (scale > 1) { scale = 1; tx = 0; ty = 0; } else zoomAt(DOUBLE_SCALE, tap.x, tap.y);
      apply(true);
      return;
    }
    lastTap = tap;
    // Одиночний тап закриває лише незбільшене фото (чекаємо, чи не буде другого тапу)
    if (scale === 1) {
      clearTimeout(closeTimer);
      closeTimer = setTimeout(() => { lastTap = null; onClose(); }, DOUBLE_MS);
    }
  };
  overlay.addEventListener('pointerup', endPointer);
  overlay.addEventListener('pointercancel', endPointer);

  overlay.addEventListener('wheel', e => {
    e.preventDefault();
    zoomAt(scale * Math.exp(-e.deltaY * 0.002), e.clientX, e.clientY);
    apply();
  }, { passive: false });

  return { reset };
}
