// ══ ІНІЦІАЛІЗАЦІЯ КАРТИ ══
// Відповідальність: вставити SVG, налаштувати зум, відцентрувати, resize.
// Раніше в map.js разом із жестами pan/pinch та обробкою кліків.

import svgText from '../../KyivMetroScheme.svg?raw';
import { state }                      from '../core/state.js';
import { renderMapZones, checkAppReady } from '../data/stations.js';

const vp    = document.getElementById('mapViewport');
const inner = document.getElementById('mapInner');

export const BASE_MAP_WIDTH  = 1195.84;
export const BASE_MAP_HEIGHT = 840;
const CENTER_X = 0.485;
const CENTER_Y = 0.5;

// Запобіжник: знімає лоадер через 10 с якщо щось пішло не так
setTimeout(() => vp?.classList.remove('is-loading'), 10_000);

export function adjustViewportHeight() {
  if (!vp) return;
  const top   = vp.getBoundingClientRect().top;
  const avail = Math.floor((window.visualViewport?.height ?? window.innerHeight) - top - 8);
  vp.style.height = Math.max(120, avail) + 'px';
}

export function applyZoomAndCenter() {
  const svgEl = inner.querySelector('svg');
  if (svgEl) {
    svgEl.style.width   = '100%';
    svgEl.style.height  = '100%';
    svgEl.style.display = 'block';
  }

  const w      = Math.min(window.innerWidth, document.documentElement.clientWidth);
  const sf     = w <= 500 ? 4.5 : 1.5;
  const minZoom = vp.clientWidth / BASE_MAP_WIDTH;
  const zoom   = Math.max(minZoom, Math.min(4.0, Math.round(vp.clientWidth * sf) / BASE_MAP_WIDTH));

  const newW = Math.round(BASE_MAP_WIDTH  * zoom);
  const newH = Math.round(BASE_MAP_HEIGHT * zoom);

  inner.style.width  = newW + 'px';
  inner.style.height = newH + 'px';

  const padX = Math.max(0, (vp.clientWidth  - newW) / 2);
  const padY = Math.max(0, (vp.clientHeight - newH) / 2);
  inner.style.marginLeft = padX + 'px';
  inner.style.marginTop  = padY + 'px';

  requestAnimationFrame(() => {
    vp.scrollLeft = Math.max(0, padX + newW * CENTER_X - vp.clientWidth  / 2);
    vp.scrollTop  = Math.max(0, padY + newH * CENTER_Y - vp.clientHeight / 2);
    state.isMapReady = true;
    checkAppReady();
  });
}

export function initMap() {
  inner.innerHTML = svgText;
  renderMapZones();
  adjustViewportHeight();
  applyZoomAndCenter();
}

// ── Resize ────────────────────────────────────────────────────
let resizeTimer;
const onResize = () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => { adjustViewportHeight(); applyZoomAndCenter(); }, 120);
};
window.addEventListener('resize', onResize);
window.addEventListener('orientationchange', () => setTimeout(onResize, 120));
