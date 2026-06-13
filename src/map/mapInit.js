import svgText from '../../KyivMetroScheme.svg?raw';
import { state }                        from '../core/state.js';
import { renderMapZones, checkAppReady } from '../data/stations.js';
import { applyVisitedHatchOverlays } from './mapInteraction.js';

// ══ ІНІЦІАЛІЗАЦІЯ КАРТИ ══
// Відповідальність: вставка SVG, розрахунок масштабу та центрування,
// адаптація висоти viewport під реальний розмір екрана (враховує адресний рядок браузера).


const vp    = document.getElementById('mapViewport');
const inner = document.getElementById('mapInner');

export const BASE_MAP_WIDTH  = 1195.84;
export const BASE_MAP_HEIGHT = 840;
const CENTER_X = 0.485;
const CENTER_Y = 0.5;

setTimeout(() => {
  vp?.classList.remove('is-loading');
  document.getElementById('startupLoader')?.classList.add('hidden');
}, 10_000);

/**
 * Встановлює висоту mapViewport рівно до нижнього краю екрана.
 * Враховує візуальний viewport (window.visualViewport) для коректної роботи
 * в мобільних браузерах з динамічною адресною панеллю.
 */
export function adjustViewportHeight() {
  if (!vp) return;
  const top   = vp.getBoundingClientRect().top;
  const avail = Math.floor((window.visualViewport?.height ?? window.innerHeight) - top - 8);
  vp.style.height = Math.max(120, avail) + 'px';
}

/**
 * Вираховує початковий масштаб карти та вирівнює видимість по центру схеми.
 * На вузьких екранах (≤500px) застосовує коефіцієнт 4.5 замість 1.5
 * щоб схема одразу виглядала читабельно без ручного масштабування.
 */
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
    applyVisitedHatchOverlays();
    
    vp?.classList.remove('is-loading');
    document.getElementById('startupLoader')?.classList.add('hidden');
  });
}

/**
 * Вставляє SVG-схему метро в DOM та запускає початковий рендер.
 * Викликається один раз з main.js під час bootstrap.
 */
/**
 * Вставляє SVG-схему метро в DOM та запускає початковий рендер.
 * Викликається один раз з main.js під час bootstrap.
 */
export function initMap() {
  inner.innerHTML = svgText;

  const svgEl = inner.querySelector('svg');
  if (svgEl) {
    const styleTag = document.getElementById('mapHacksStyle') || document.createElementNS('http://www.w3.org/2000/svg', 'style');
    styleTag.id = 'mapHacksStyle';
    
    styleTag.textContent = `
      /* УЛЬТИМАТИВНИЙ ХАК ПРОТИ ПРИМУСОВОЇ ІНВЕРСІЇ CHROMIUM */
      #mapInner path[aria-label] {
        fill: #000000 !important;
        
        /* Якщо Хром насильно вибілить літери для "контрасту", 
           цей фільтр схопить уже готовий білий рендер і розчавить його яскравість до 0.
           Результат: залізобетонний чорний колір у будь-якій темі! */
        filter: brightness(0) !important;
      }
    `;
    svgEl.appendChild(styleTag);
  }

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
