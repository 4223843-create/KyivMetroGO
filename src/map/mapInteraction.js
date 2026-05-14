// Map interaction: click / keyboard / visited hatch overlay

import { state }                   from '../core/state.js';
import { getCheckins }              from '../features/checkin.js';
import { STORAGE_KEYS, Storage }   from '../core/storage.js';

const inner = document.getElementById('mapInner');
const SVG_NS = 'http://www.w3.org/2000/svg';
const HATCH_GEOMETRY_SELECTOR = 'path, polygon, rect';
const HATCH_OVERLAY_CLASS = 'ci-visited-hatch-overlay';
const HATCH_GEOMETRY_CLASS = 'ci-visited-hatch-geometry';
const HATCH_LINE_CLASS = 'ci-visited-hatch-line';
const HATCH_STEP_PX = 8;
const HATCH_SAMPLE_PX = 0.75;

export function handleMapInteraction(e) {
  if (!state.stationsData) return;
  if (e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ') return;

  const zone  = e.target.closest('[id]');
  if (!zone?.id) return;

  const rawId = zone.id.replace(/\d+$/, '').toLowerCase();
  const slug  = MetroApp.SLUG_BY_LOWER[rawId];
  if (slug) { e.preventDefault(); MetroApp.openStation?.(slug); }
}

inner.addEventListener('click',   handleMapInteraction);
inner.addEventListener('keydown', handleMapInteraction);

export function syncMapWithCheckins() {
  if (!inner || !state.stationsData) return;

  const checkins = getCheckins();
  const visitedExitsBySlug = {};

  // Збираємо відвідані унікальні виходи (вагон + двері) по кожній станції
  for (const entry of Object.values(checkins)) {
    if (!entry.slug) continue;
    if (!visitedExitsBySlug[entry.slug]) visitedExitsBySlug[entry.slug] = new Set();
    visitedExitsBySlug[entry.slug].add(`${entry.wagon}|${entry.doors}`);
  }

  const visitedNames = Object.keys(visitedExitsBySlug).map(slug => {
    return state.stationsData[slug]?.name?.replace(/[\s\n\r]/g, '').toLowerCase();
  }).filter(Boolean);

  removeVisitedHatchOverlays();

  // Очищаємо всі старі класи
  inner.querySelectorAll('.station-checked-in, .is-visited, .is-visited-partial, .is-visited-full').forEach(el => {
    el.classList.remove('station-checked-in', 'is-visited', 'is-visited-partial', 'is-visited-full');
  });

  // Визначаємо частково чи повністю відвідана станція
// Визначаємо частково чи повністю відвідана станція
  inner.querySelectorAll('[id]').forEach(el => {
    const rawId = el.id.replace(/\d+$/, '').toLowerCase();
    const slug  = MetroApp.SLUG_BY_LOWER?.[rawId];
    
    if (slug && visitedExitsBySlug[slug]) {
      const stData = state.stationsData[slug];
      
      // Захист: якщо виходів у базі немає, вважаємо, що достатньо 1 чекіна для статусу "Full"
      const totalOpenExits = stData?.positions?.length 
        ? stData.positions.filter(p => !p.closed).length 
        : 1; 
        
      const visitedCount = visitedExitsBySlug[slug].size;

      if (visitedCount >= totalOpenExits) {
        el.classList.add('is-visited-full');
      } else {
        el.classList.add('is-visited-partial');
      }
    }
  });
  inner.querySelectorAll('text').forEach(txt => {
    const cleanText = txt.textContent.replace(/[\s\n\r]/g, '').toLowerCase();
    const isMatch = visitedNames.some(name => cleanText.includes(name) || name.includes(cleanText));

    if (isMatch && cleanText.length > 2) {
      txt.classList.add('station-checked-in');
      txt.querySelectorAll('tspan').forEach(tspan => tspan.classList.add('station-checked-in'));
    }
  });

  applyVisitedHatchOverlays();
}

export function applyVisitedHatchOverlays(root = inner) {
  if (!root) return;

  removeVisitedHatchOverlays(root);

  const isHatchEnabled = Storage.get(STORAGE_KEYS.CHECKIN_HATCH) !== 'false';
  if (!isHatchEnabled) return; 

  const targets = [...root.querySelectorAll('.is-visited-partial, .is-visited-full')]
    .filter(el => el.closest('.is-visited-partial, .is-visited-full') === el);

  targets.forEach(target => {
    const shapes = getVisitedGeometry(target);
    if (!shapes.length) return;

    // Визначаємо напрямок: повний = 1 (/), частковий = -1 (\)
const isFull = target.classList.contains('is-visited-full');

    const overlay = document.createElementNS(SVG_NS, 'g');
    overlay.classList.add(HATCH_OVERLAY_CLASS, isFull ? 'ci-hatch-full' : 'ci-hatch-partial');
    overlay.setAttribute('aria-hidden', 'true');
    overlay.setAttribute('focusable', 'false');
    overlay.dataset.hatchFor = target.id || '';

    shapes.forEach(shape => appendShapeHatch(shape, overlay, isFull));
    if (!overlay.childElementCount) return;

    if (target instanceof SVGGElement) {
      target.appendChild(overlay);
    } else {
      target.parentNode?.insertBefore(overlay, target.nextSibling);
    }
  });
}

function removeVisitedHatchOverlays(root = inner) {
  root?.querySelectorAll(`.${HATCH_OVERLAY_CLASS}`).forEach(el => el.remove());
}

function getVisitedGeometry(target) {
  const geometry = target.matches(HATCH_GEOMETRY_SELECTOR)
    ? [target]
    : [...target.querySelectorAll(HATCH_GEOMETRY_SELECTOR)];

  return geometry.filter(shape => {
    if (shape.closest(`.${HATCH_OVERLAY_CLASS}`)) return false;
    try {
      const box = shape.getBBox();
      return box.width > 0 && box.height > 0;
    } catch (e) {
      return false;
    }
  });
}

function appendShapeHatch(shape, overlay, isFull) {
  const shapeOverlay = document.createElementNS(SVG_NS, 'g');
  const transform = shape.getAttribute('transform');
  if (transform) shapeOverlay.setAttribute('transform', transform);

// 1. Створюємо унікальну маску (clip-path) для ідеально рівних країв
  const clipId = 'ci-clip-' + Math.random().toString(36).substr(2, 9);
  const defs = document.createElementNS(SVG_NS, 'defs');
  const clipPath = document.createElementNS(SVG_NS, 'clipPath');
  clipPath.setAttribute('id', clipId);
  
  const clipGeometry = shape.cloneNode(false);
  clipGeometry.removeAttribute('id');
  clipGeometry.removeAttribute('class');
  
  // ДОДАТИ ЦЕЙ РЯДОК: Розширюємо маску на 1px, щоб прибрати "білі щілини" на краях
  clipGeometry.setAttribute('stroke-width', '1');
  clipGeometry.setAttribute('stroke', 'black');
  
  clipPath.appendChild(clipGeometry);
  defs.appendChild(clipPath);
  shapeOverlay.appendChild(defs);
  // 2. Створюємо групу, яка обрізається по цій масці
  const clippedGroup = document.createElementNS(SVG_NS, 'g');
  clippedGroup.setAttribute('clip-path', `url(#${clipId})`);
  shapeOverlay.appendChild(clippedGroup);

  overlay.appendChild(shapeOverlay);

  // 4. Малюємо лінії (тепер вони обрізаються браузером ідеально рівно)
const { lines, strokeWidth } = buildHatchLines(shape, isFull);
  if (!lines.length) {
    shapeOverlay.remove();
    return;
  }

  lines.forEach(d => {
    const line = document.createElementNS(SVG_NS, 'path');
    line.classList.add(HATCH_LINE_CLASS);
    line.setAttribute('d', d);
    line.setAttribute('stroke-width', String(strokeWidth));
    clippedGroup.appendChild(line);
  });
}

// Універсальний генератор ліній (тепер супершвидкий, без isPointInShape)
function buildHatchLines(sourceShape, isFull) {
  const box = sourceShape.getBBox();
  const scale = getSvgToCssPixelScale(sourceShape);
  const step = HATCH_STEP_PX / scale;
  const pad = step * 2;

  const minX = box.x - pad;
  const maxX = box.x + box.width + pad;
  const minY = box.y - pad;
  const maxY = box.y + box.height + pad;

  const cStep = step * Math.SQRT2;
  const lines = [];


const cMin_raw = isFull ? (minX + minY) : (minX - maxY);
  const cMax     = isFull ? (maxX + maxY) : (maxX - minY);
  const cMin = Math.floor(cMin_raw / cStep) * cStep;

  for (let c = cMin; c <= cMax; c += cStep) {
    let x1 = minX;
    let y1 = isFull ? (c - x1) : (x1 - c);

    let x2 = maxX;
    let y2 = isFull ? (c - x2) : (x2 - c);

    lines.push(`M ${round(x1)} ${round(y1)} L ${round(x2)} ${round(y2)}`);
  }

  return { lines, strokeWidth: round(step * 0.35) };
}


  


function getSvgToCssPixelScale(shape) {
  const ctm = shape.getScreenCTM?.();
  const scale = ctm ? Math.hypot(ctm.a, ctm.b) : 1;
  return Number.isFinite(scale) && scale > 0 ? scale : 1;
}

function round(value) {
  return Math.round(value * 100) / 100;
}

MetroApp.syncMapWithCheckins = syncMapWithCheckins;
MetroApp.applyVisitedHatchOverlays = applyVisitedHatchOverlays;