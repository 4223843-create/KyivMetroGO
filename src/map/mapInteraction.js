import { state }                  from '../core/state.js';
import { getCheckins }            from '../domain/checkin.js';
import { bus }                    from '../core/eventBus.js';
import { STORAGE_KEYS, Storage }  from '../core/storage.js';
import { getSlugByLower }         from '../data/stations.js';

const inner = document.getElementById('mapInner');
const SVG_NS = 'http://www.w3.org/2000/svg';
const HATCH_GEOMETRY_SELECTOR = 'path, polygon, rect';
const HATCH_OVERLAY_CLASS  = 'ci-visited-hatch-overlay';
const HATCH_GEOMETRY_CLASS = 'ci-visited-hatch-geometry';
const HATCH_LINE_CLASS     = 'ci-visited-hatch-line';
const HATCH_STEP_PX  = 8;

export function handleMapInteraction(e) {
  if (!state.stationsData) return;
  if (e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ') return;

  const zone = e.target.closest('[id]');
  if (!zone?.id) return;

  const rawId = zone.id.replace(/\d+$/, '').toLowerCase();
  const slug  = getSlugByLower(rawId);
  if (slug) { e.preventDefault(); bus.emit('station:open', { slug }); }
}

inner?.addEventListener('click',   handleMapInteraction);
inner?.addEventListener('keydown', handleMapInteraction);

function removeVisitedHatchOverlays(root = inner) {
  root?.querySelectorAll(`.${HATCH_OVERLAY_CLASS}`).forEach(el => el.remove());
}

function round(value) {
  return Math.round(value * 100) / 100;
}

const _hatchLineCache = new WeakMap();

// [OPT-P4] Кеш зон станцій (будується один раз після renderMapZones)
let _stationZoneEls = null;
function _getStationZoneEls() {
  // Повертаємо кеш, ТІЛЬКИ якщо він не порожній
  if (_stationZoneEls && _stationZoneEls.length > 0) return _stationZoneEls;
  
  const els = [...inner.querySelectorAll('[id]')].filter(el => {
    const rawId = el.id.replace(/\d+$/, '').toLowerCase();
    return !!getSlugByLower(rawId);
  });
  
  // Кешуємо тільки тоді, коли станції реально знайшлися на карті
  if (els.length > 0) {
    _stationZoneEls = els;
  }
  
  return els;
}

export function invalidateStationZoneCache() { _stationZoneEls = null; }

let _clipIdCounter = 0;

let _hatchRafId = null;

export function applyVisitedHatchOverlays(root = inner) {
  if (!root) return;
  if (_hatchRafId !== null) return;
  _hatchRafId = requestAnimationFrame(() => {
    _hatchRafId = null;
    _doApplyHatch(root);
  });
}

function _doApplyHatch(root) {
  removeVisitedHatchOverlays(root);

  const isHatchEnabled = Storage.get(STORAGE_KEYS.CHECKIN_HATCH) !== 'false';
  if (!isHatchEnabled) return;

  const targets = [...root.querySelectorAll('.is-visited-partial, .is-visited-full')]
    .filter(el => el.closest('.is-visited-partial, .is-visited-full') === el);

  if (!targets.length) return;

  const globalScale = _getGlobalSvgScale();

  targets.forEach(target => {
    const shapes = _getValidGeometry(target);
    if (!shapes.length) return;

    const isFull = target.classList.contains('is-visited-full');

    const overlay = document.createElementNS(SVG_NS, 'g');
    overlay.classList.add(HATCH_OVERLAY_CLASS, isFull ? 'ci-hatch-full' : 'ci-hatch-partial');
    overlay.setAttribute('aria-hidden', 'true');
    overlay.setAttribute('focusable', 'false');
    overlay.dataset.hatchFor = target.id || '';

    shapes.forEach(shape => _appendShapeHatch(shape, overlay, isFull, globalScale));
    if (!overlay.childElementCount) return;

    if (target instanceof SVGGElement) {
      target.appendChild(overlay);
    } else {
      target.parentNode?.insertBefore(overlay, target.nextSibling);
    }
  });
}

function _getGlobalSvgScale() {
  const ref = inner.querySelector('path, polygon, rect');
  if (!ref) return 1;
  const ctm   = ref.getScreenCTM?.();
  const scale = ctm ? Math.hypot(ctm.a, ctm.b) : 1;
  return (Number.isFinite(scale) && scale > 0) ? scale : 1;
}

const _geometryCache = new WeakMap();

function _getValidGeometry(target) {
  if (_geometryCache.has(target)) return _geometryCache.get(target);

  const geometry = target.matches(HATCH_GEOMETRY_SELECTOR)
    ? [target]
    : [...target.querySelectorAll(HATCH_GEOMETRY_SELECTOR)];

  // [OPT-P1] getBBox() тільки при першому зверненні до target
  const valid = geometry.filter(shape => {
    if (shape.closest(`.${HATCH_OVERLAY_CLASS}`)) return false;
    try { const b = shape.getBBox(); return b.width > 0 && b.height > 0; }
    catch { return false; }
  });

  // Запобіжник: не кешуємо порожній результат (якщо SVG ще не відмалювався)
  if (valid.length > 0) {
    _geometryCache.set(target, valid);
  }
  
  return valid;
}

function _appendShapeHatch(shape, overlay, isFull, globalScale) {
  const cached = _hatchLineCache.get(shape);
  let lines, strokeWidth;

  if (cached && cached.isFull === isFull && Math.abs(cached.scale - globalScale) / globalScale < 0.02) {
    // Cache hit: нуль getBBox(), нуль layout flush
    ({ lines, strokeWidth } = cached);
  } else {
    // Cache miss: рахуємо один раз (один getBBox всередині buildHatchLines)
    ({ lines, strokeWidth } = buildHatchLines(shape, isFull, globalScale));
    _hatchLineCache.set(shape, { isFull, scale: globalScale, lines, strokeWidth });
  }

  if (!lines.length) return;

  const shapeOverlay = document.createElementNS(SVG_NS, 'g');
  const transform    = shape.getAttribute('transform');
  if (transform) shapeOverlay.setAttribute('transform', transform);

  // [OPT-P5] Монотонний лічильник замість Math.random()
  const clipId   = `ci-clip-${_clipIdCounter++}`;
  const defs     = document.createElementNS(SVG_NS, 'defs');
  const clipPath = document.createElementNS(SVG_NS, 'clipPath');
  clipPath.setAttribute('id', clipId);
  const clipGeometry = shape.cloneNode(false);
  clipGeometry.removeAttribute('id');
  clipGeometry.removeAttribute('class');
  clipGeometry.setAttribute('stroke-width', '1');
  clipGeometry.setAttribute('stroke', 'black');
  clipPath.appendChild(clipGeometry);
  defs.appendChild(clipPath);
  shapeOverlay.appendChild(defs);

  const clippedGroup = document.createElementNS(SVG_NS, 'g');
  clippedGroup.setAttribute('clip-path', `url(#${clipId})`);
  shapeOverlay.appendChild(clippedGroup);
  overlay.appendChild(shapeOverlay);

  lines.forEach(d => {
    const line = document.createElementNS(SVG_NS, 'path');
    line.classList.add(HATCH_LINE_CLASS);
    line.setAttribute('d', d);
    line.setAttribute('stroke-width', String(strokeWidth));
    clippedGroup.appendChild(line);
  });
}

// Оновлена сигнатура: приймає globalScale, щоб не викликати getScreenCTM()
function buildHatchLines(sourceShape, isFull, scale) {
  const box  = sourceShape.getBBox(); // єдиний getBBox() на shape
  // scale передається ззовні — не потрібен getScreenCTM() тут
  const step = HATCH_STEP_PX / scale;
  const pad  = step * 2;

  const minX = box.x - pad, maxX = box.x + box.width  + pad;
  const minY = box.y - pad, maxY = box.y + box.height + pad;

  const cStep    = step * Math.SQRT2;
  const cMin_raw = isFull ? (minX + minY) : (minX - maxY);
  const cMax     = isFull ? (maxX + maxY) : (maxX - minY);
  const cMin     = Math.floor(cMin_raw / cStep) * cStep;

  const lines = [];
  for (let c = cMin; c <= cMax; c += cStep) {
    const x1 = minX, x2 = maxX;
    const y1 = isFull ? (c - x1) : (x1 - c);
    const y2 = isFull ? (c - x2) : (x2 - c);
    lines.push(`M ${round(x1)} ${round(y1)} L ${round(x2)} ${round(y2)}`);
  }
  return { lines, strokeWidth: round(step * 0.35) };
}

export function syncMapWithCheckins() {
  if (!inner || !state.stationsData) return;

  const checkins = getCheckins();
  const visitedExitsBySlug = {};

  for (const entry of Object.values(checkins)) {
    if (!entry.slug) continue;
    if (!visitedExitsBySlug[entry.slug]) visitedExitsBySlug[entry.slug] = new Set();
    visitedExitsBySlug[entry.slug].add(`${entry.wagon}|${entry.doors}`);
  }

  // [OPT] Set для O(1) lookup замість O(V) array.some()
  const visitedNameSet = new Set(
    Object.keys(visitedExitsBySlug)
      .map(slug => state.stationsData[slug]?.name?.replace(/[\s\n\r]/g, '').toLowerCase())
      .filter(Boolean)
  );

  removeVisitedHatchOverlays();

  inner.querySelectorAll('.station-checked-in, .is-visited, .is-visited-partial, .is-visited-full')
    .forEach(el => el.classList.remove('station-checked-in', 'is-visited', 'is-visited-partial', 'is-visited-full'));

  // [OPT-P4] Кешований список лише зон станцій (не всього SVG)
  _getStationZoneEls().forEach(el => {
    const rawId = el.id.replace(/\d+$/, '').toLowerCase();
    const slug  = getSlugByLower(rawId);
    if (!slug || !visitedExitsBySlug[slug]) return;

    const stData         = state.stationsData[slug];
    const totalOpenExits = stData?.positions?.length
      ? stData.positions.filter(p => !p.closed).length
      : 1;

    el.classList.add(visitedExitsBySlug[slug].size >= totalOpenExits
      ? 'is-visited-full'
      : 'is-visited-partial');
  });

  inner.querySelectorAll('text').forEach(txt => {
    const cleanText = txt.textContent.replace(/[\s\n\r]/g, '').toLowerCase();
    if (cleanText.length <= 2) return;
    // [OPT] O(1) Set.has() замість O(V) array.some() з substring-matching
    // Повна відповідність достатня: SVG text збігається з нормалізованою назвою
    if (visitedNameSet.has(cleanText)) {
      txt.classList.add('station-checked-in');
      txt.querySelectorAll('tspan').forEach(t => t.classList.add('station-checked-in'));
    }
  });

  applyVisitedHatchOverlays();
}

bus.on('map:sync-checkins',       syncMapWithCheckins);
bus.on('data:stations-hydrated',  invalidateStationZoneCache);