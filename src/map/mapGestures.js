// ══ ЖЕСТИ КАРТИ: PAN + PINCH ZOOM (OPTIMIZED VIA rAF) ══

import { BASE_MAP_WIDTH, BASE_MAP_HEIGHT } from './mapInit.js';
import { applyVisitedHatchOverlays } from './mapInteraction.js';

const vp           = document.getElementById('mapViewport');
const inner        = document.getElementById('mapInner');
const sheetOverlay = document.getElementById('sheetOverlay');

// ── Pan (1 палець) ────────────────────────────────────────────
let panStartX = 0, panStartY = 0;
let panStartScrollLeft = 0, panStartScrollTop = 0;
let isPanActive = false;
let pendingPan = null, panRAFScheduled = false;

// ── Pinch zoom (2 пальці) ────────────────────────────────────
let pendingPinch = null, pinchRAFScheduled = false;
let pinchStartDist = 0, pinchStartWidth = 0, pinchStartHeight = 0;
let pinchStartScrollLeft = 0, pinchStartScrollTop = 0;
let pinchVpLeft = 0, pinchVpTop = 0;
let pinchMarginLeft = 0, pinchMarginTop = 0;

document.addEventListener('touchstart', e => {
  if (sheetOverlay.classList.contains('overlay-visible')) return;

  if (e.touches.length === 2) {
    isPanActive = false;
    const t0 = e.touches[0], t1 = e.touches[1];
    pinchStartDist = Math.hypot(t0.clientX - t1.clientX, t0.clientY - t1.clientY);

    pinchStartWidth      = parseFloat(inner.style.width)  || inner.offsetWidth;
    pinchStartHeight     = parseFloat(inner.style.height) || inner.offsetHeight;
    pinchStartScrollLeft = vp.scrollLeft;
    pinchStartScrollTop  = vp.scrollTop;

    const vpRect = vp.getBoundingClientRect();
    pinchVpLeft    = vpRect.left;
    pinchVpTop     = vpRect.top;
    pinchMarginLeft = parseFloat(inner.style.marginLeft) || 0;
    pinchMarginTop  = parseFloat(inner.style.marginTop)  || 0;
    pendingPinch = null;

  } else if (e.touches.length === 1) {
    isPanActive        = true;
    panStartX          = e.touches[0].clientX;
    panStartY          = e.touches[0].clientY;
    panStartScrollLeft = vp.scrollLeft;
    panStartScrollTop  = vp.scrollTop;
    pendingPan         = null;
  }
}, { passive: true });

vp.addEventListener('touchmove', e => {
  if (!isPanActive || e.touches.length !== 1) return;

  // Зберігаємо останні координати без негайної мутації макету
  pendingPan = {
    clientX: e.touches[0].clientX,
    clientY: e.touches[0].clientY
  };

  if (!panRAFScheduled) {
    panRAFScheduled = true;
    requestAnimationFrame(() => {
      panRAFScheduled = false;
      if (!pendingPan) return;
      
      vp.scrollLeft = panStartScrollLeft - (pendingPan.clientX - panStartX);
      vp.scrollTop  = panStartScrollTop  - (pendingPan.clientY - panStartY);
      pendingPan = null;
    });
  }
}, { passive: true });

document.addEventListener('touchmove', e => {
  if (e.touches.length !== 2 || sheetOverlay.classList.contains('overlay-visible')) return;
  e.preventDefault();
  if (!pinchStartDist) return;

  const t0x = e.touches[0].clientX, t0y = e.touches[0].clientY;
  const t1x = e.touches[1].clientX, t1y = e.touches[1].clientY;
  const dist = Math.hypot(t0x - t1x, t0y - t1y);

  pendingPinch = { ratio: dist / pinchStartDist, midX: (t0x + t1x) / 2, midY: (t0y + t1y) / 2 };

  if (!pinchRAFScheduled) {
    pinchRAFScheduled = true;
    requestAnimationFrame(() => {
      pinchRAFScheduled = false;
      if (!pendingPinch) return;
      const { ratio: r, midX, midY } = pendingPinch;
      pendingPinch = null;

      const minW = vp.clientWidth;
      const maxW = Math.round(BASE_MAP_WIDTH * 4.0);
      let newW   = Math.max(minW, Math.min(maxW, Math.round(pinchStartWidth * r)));
      const actualRatio = newW / pinchStartWidth;
      const newH = Math.round(pinchStartHeight * actualRatio);

      const padX = Math.max(0, (vp.clientWidth  - newW) / 2);
      const padY = Math.max(0, (vp.clientHeight - newH) / 2);

      inner.style.width      = newW + 'px';
      inner.style.height     = newH + 'px';
      inner.style.marginLeft = padX + 'px';
      inner.style.marginTop  = padY + 'px';

      const relX = (midX - pinchVpLeft + pinchStartScrollLeft - pinchMarginLeft) / pinchStartWidth;
      const relY = (midY - pinchVpTop  + pinchStartScrollTop  - pinchMarginTop)  / pinchStartHeight;

      vp.scrollLeft = Math.round(relX * newW + padX - (midX - pinchVpLeft));
      vp.scrollTop  = Math.round(relY * newH + padY - (midY - pinchVpTop));
    });
  }
}, { passive: false });

let _hatchTimer = null;

document.addEventListener('touchend', e => {
  if (e.touches.length < 2) {
    pinchStartDist    = 0;
    pendingPinch      = null;
    pinchRAFScheduled = false;
    
    clearTimeout(_hatchTimer);
    _hatchTimer = setTimeout(() => {
      applyVisitedHatchOverlays();
    }, 300);
  }
  if (e.touches.length === 1 && !sheetOverlay.classList.contains('overlay-visible')) {
    isPanActive        = true;
    panStartX          = e.touches[0].clientX;
    panStartY          = e.touches[0].clientY;
    panStartScrollLeft = vp.scrollLeft;
    panStartScrollTop  = vp.scrollTop;
  }
  if (e.touches.length === 0) {
    isPanActive = false;
    panRAFScheduled = false;
    pendingPan = null;
  }
}, { passive: true });