import svgText from '../KyivMetroScheme.svg?raw';
import { state }          from './state.js';
import { renderMapZones, checkAppReady } from './stations.js';

const vp    = document.getElementById('mapViewport');
const inner = document.getElementById('mapInner');

let baseMapWidth  = 1195.84;
let baseMapHeight = 840;
const centerX = 0.485, centerY = 0.5;

// ══ ТАЙМАУТ-ЗАПОБІЖНИК (знімає лоадер після 10 с якщо щось пішло не так) ══
setTimeout(() => {
  vp?.classList.remove('is-loading');
}, 10000);

// ══ ВИСОТА ВЬЮПОРТУ ══
export function adjustViewportHeight() {
  if (!vp) return;
  const top   = vp.getBoundingClientRect().top;
  const avail = Math.floor((window.visualViewport?.height ?? window.innerHeight) - top - 8);
  vp.style.height = Math.max(120, avail) + 'px';
}

// ══ ЗУМ І ЦЕНТРУВАННЯ ══
export function applyZoomAndCenter() {
  const svgEl = inner.querySelector('svg');
  if (svgEl) {
    svgEl.style.width   = '100%';
    svgEl.style.height  = '100%';
    svgEl.style.display = 'block';
  }

  const w  = Math.min(window.innerWidth, document.documentElement.clientWidth);
  const sf = w <= 500 ? 4.5 : 1.5;
  const minZoom = vp.clientWidth / baseMapWidth;
  const zoom    = Math.max(minZoom, Math.min(4.0, Math.round(vp.clientWidth * sf) / baseMapWidth));

  const newW = Math.round(baseMapWidth  * zoom);
  const newH = Math.round(baseMapHeight * zoom);

  inner.style.width  = newW + 'px';
  inner.style.height = newH + 'px';

  const padX = Math.max(0, (vp.clientWidth  - newW) / 2);
  const padY = Math.max(0, (vp.clientHeight - newH) / 2);
  inner.style.marginLeft = padX + 'px';
  inner.style.marginTop  = padY + 'px';

  requestAnimationFrame(() => {
    const targetX = padX + newW * centerX;
    const targetY = padY + newH * centerY;
    vp.scrollLeft = Math.max(0, targetX - vp.clientWidth  / 2);
    vp.scrollTop  = Math.max(0, targetY - vp.clientHeight / 2);

    state.isMapReady = true;
    checkAppReady();
  });
}

// ══ ІНІЦІАЛІЗАЦІЯ КАРТИ (синхронно через ?raw) ══
export function initMap() {
  inner.innerHTML = svgText;
  // Якщо дані вже завантажились — малюємо зони одразу
  renderMapZones();
  adjustViewportHeight();
  applyZoomAndCenter();
}

MetroApp.applyZoomAndCenter = applyZoomAndCenter;

// ══ RESIZE ══
let resizeTimer;
const onResize = () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => { adjustViewportHeight(); applyZoomAndCenter(); }, 120);
};
window.addEventListener('resize', onResize);
window.addEventListener('orientationchange', () => setTimeout(onResize, 120));

// ══ КЛІК / КЛАВІАТУРА ПО КАРТІ ══
export function handleMapInteraction(e) {
  if (!state.stationsData) return;
  if (e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ') return;

  const zone  = e.target.closest('[id]');
  if (!zone?.id) return;

  const rawId = zone.id.replace(/\d+$/, '').toLowerCase();
  const slug  = MetroApp.SLUG_BY_LOWER[rawId];
  if (slug) { e.preventDefault(); MetroApp.openStation?.(slug); }
}

inner.addEventListener('click',  handleMapInteraction);
inner.addEventListener('keydown', handleMapInteraction);

// ══ PAN (1 палець) + PINCH ZOOM (2 пальці) ══
let pendingPinch = null, pinchRAFScheduled = false;
let panStartX = null, panStartY = null;
let panStartScrollLeft = 0, panStartScrollTop = 0;
let isPanActive = false;

let pinchStartDist = 0, pinchStartWidth = 0, pinchStartHeight = 0;
let pinchStartScrollLeft = 0, pinchStartScrollTop = 0;
let pinchVpLeft = 0, pinchVpTop = 0;
let pinchMarginLeft = 0, pinchMarginTop = 0;

const sheetOverlay = document.getElementById('sheetOverlay');

document.addEventListener('touchstart', e => {
  if (sheetOverlay.classList.contains('overlay-visible')) return;
  if (e.touches.length === 2) {
    isPanActive = false;
    const t0 = e.touches[0], t1 = e.touches[1];
    pinchStartDist = Math.hypot(t0.clientX - t1.clientX, t0.clientY - t1.clientY);

    pinchStartWidth      = parseFloat(inner.style.width)      || inner.offsetWidth;
    pinchStartHeight     = parseFloat(inner.style.height)     || inner.offsetHeight;
    pinchStartScrollLeft = vp.scrollLeft;
    pinchStartScrollTop  = vp.scrollTop;

    const vpRect = vp.getBoundingClientRect();
    pinchVpLeft    = vpRect.left;
    pinchVpTop     = vpRect.top;
    pinchMarginLeft = parseFloat(inner.style.marginLeft) || 0;
    pinchMarginTop  = parseFloat(inner.style.marginTop)  || 0;

    pendingPinch = null;
  } else if (e.touches.length === 1) {
    isPanActive      = true;
    panStartX        = e.touches[0].clientX;
    panStartY        = e.touches[0].clientY;
    panStartScrollLeft = vp.scrollLeft;
    panStartScrollTop  = vp.scrollTop;
  }
}, { passive: true });

vp.addEventListener('touchmove', e => {
  if (!isPanActive || e.touches.length !== 1) return;
  vp.scrollLeft = panStartScrollLeft - (e.touches[0].clientX - panStartX);
  vp.scrollTop  = panStartScrollTop  - (e.touches[0].clientY - panStartY);
}, { passive: true });

document.addEventListener('touchmove', e => {
  if (e.touches.length !== 2 || sheetOverlay.classList.contains('overlay-visible')) return;
  e.preventDefault();
  if (!pinchStartDist) return;

  const t0x = e.touches[0].clientX, t0y = e.touches[0].clientY;
  const t1x = e.touches[1].clientX, t1y = e.touches[1].clientY;
  const dist  = Math.hypot(t0x - t1x, t0y - t1y);
  const ratio = dist / pinchStartDist;

  pendingPinch = { ratio, midX: (t0x + t1x) / 2, midY: (t0y + t1y) / 2 };

  if (!pinchRAFScheduled) {
    pinchRAFScheduled = true;
    requestAnimationFrame(() => {
      pinchRAFScheduled = false;
      if (!pendingPinch) return;
      const { ratio: r, midX, midY } = pendingPinch;
      pendingPinch = null;

      const minW = vp.clientWidth;
      const maxW = Math.round(baseMapWidth * 4.0);

      let newW = Math.round(pinchStartWidth * r);
      newW = Math.max(minW, Math.min(maxW, newW));
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

      vp.scrollLeft = Math.round((relX * newW + padX) - (midX - pinchVpLeft));
      vp.scrollTop  = Math.round((relY * newH + padY) - (midY - pinchVpTop));
    });
  }
}, { passive: false });

document.addEventListener('touchend', e => {
  if (e.touches.length < 2) {
    pinchStartDist    = 0;
    pendingPinch      = null;
    pinchRAFScheduled = false;
  }
  if (e.touches.length === 1 && !sheetOverlay.classList.contains('overlay-visible')) {
    isPanActive        = true;
    panStartX          = e.touches[0].clientX;
    panStartY          = e.touches[0].clientY;
    panStartScrollLeft = vp.scrollLeft;
    panStartScrollTop  = vp.scrollTop;
  }
  if (e.touches.length === 0) isPanActive = false;
}, { passive: true });
