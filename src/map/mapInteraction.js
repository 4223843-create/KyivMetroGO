// ══ ВЗАЄМОДІЯ З КАРТОЮ ══
// Відповідальність: обробка кліків на SVG-зони станцій,
// накладання та зняття heatmap-штрихування для відвіданих виходів (check-in).

import { state }                  from '../core/state.js';
import { getCheckins }            from '../domain/checkin.js';
import { bus }                    from '../core/eventBus.js';
import { STORAGE_KEYS, Storage }  from '../core/storage.js';
import { getSlugByLower }         from '../data/stations.js';
import { isShowMapAccessibilityEnabled, isShowHoistsEnabled } from '../features/settings.js';

const inner = document.getElementById('mapInner');
const SVG_NS = 'http://www.w3.org/2000/svg';
const HATCH_GEOMETRY_SELECTOR = 'path, polygon, rect';
const HATCH_OVERLAY_CLASS  = 'ci-visited-hatch-overlay';
const HATCH_GEOMETRY_CLASS = 'ci-visited-hatch-geometry';
const HATCH_LINE_CLASS     = 'ci-visited-hatch-line';
const HATCH_STEP_PX  = 8;

/**
 * Обробляє клік або Enter/Space на SVG-зоні карти.
 * Знаходить slug за id елемента і емітує 'station:open'.
 * @param {MouseEvent|KeyboardEvent} e
 */
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

// Кеш зон станцій (будується один раз після renderMapZones)
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

/** Скидає кеш зон станцій (викликати після повторного renderMapZones). */
export function invalidateStationZoneCache() { _stationZoneEls = null; }

let _clipIdCounter = 0;

let _hatchRafId = null;

/**
 * Планує накладання heatmap-штрихування на відвідані зони карти.
 * Дедублюється через requestAnimationFrame — безпечно викликати кілька разів поспіль.
 * @param {Element} [root] — за замовчуванням mapInner
 */
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
  const ctm      = ref.getScreenCTM?.();
  const rawScale = ctm ? Math.hypot(ctm.a, ctm.b) : 1;
  const scale    = (Number.isFinite(rawScale) && rawScale > 0) ? rawScale : 1;

  // Квантуємо масштаб до «сходинок» по 1%, щоб усі фігури в одному
  // проході рендеру завжди бачили однакове значення scale (інакше різні
  // фігури можуть лишитись на різних історичних cStep через 2%-допуск
  // кешу нижче — окрема причина розсинхрону штрихування).
  const QUANT = 0.01;
  return Math.round(scale / QUANT) * QUANT;
}

const _geometryCache = new WeakMap();

function _getValidGeometry(target) {
  if (_geometryCache.has(target)) return _geometryCache.get(target);

  const geometry = target.matches(HATCH_GEOMETRY_SELECTOR)
    ? [target]
    : [...target.querySelectorAll(HATCH_GEOMETRY_SELECTOR)];

  // getBBox() тільки при першому зверненні до target — кешуємо через WeakMap
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

  if (cached && cached.isFull === isFull && cached.scale === globalScale) {
    // Cache hit: нуль getBBox(), нуль layout flush.
    // Точне порівняння безпечне, бо globalScale тепер квантований.
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

  // Монотонний лічильник замість Math.random()
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

/**
 * Оновлює CSS-класи зон карти (.is-visited-full / .is-visited-partial) відповідно
 * до поточного стану check-in. Викликається при 'map:sync-checkins'.
 */
export function syncMapWithCheckins() {
  if (!inner || !state.stationsData) return;

  const checkins = getCheckins();
  const visitedExitsBySlug = {};

  for (const entry of Object.values(checkins)) {
    if (!entry.slug) continue;
    if (!visitedExitsBySlug[entry.slug]) visitedExitsBySlug[entry.slug] = new Set();
    // Ключ ОБОВ'ЯЗКОВО включає напрямок (dir): два РІЗНІ фізичні виходи
    // (на різних платформах/напрямках) можуть мати однаковий номер
    // вагона/дверей — це нормально. Без dir у ключі такі виходи
    // колапсують в один запис Set, totalOpenExits (без дедуплікації)
    // лишається більшим за розмір Set, і станція ніколи не отримує
    // is-visited-full, навіть якщо реально відмічені всі виходи.
    visitedExitsBySlug[entry.slug].add(`${entry.dir}|${entry.wagon}|${entry.doors}`);

  }

  // Set для O(1) lookup замість O(V) array.some()
  const visitedNameSet = new Set(
    Object.keys(visitedExitsBySlug)
      .map(slug => state.stationsData[slug]?.name?.replace(/[\s\n\r]/g, '').toLowerCase())
      .filter(Boolean)
  );

  removeVisitedHatchOverlays();

  inner.querySelectorAll('.station-checked-in, .is-visited, .is-visited-partial, .is-visited-full')
    .forEach(el => el.classList.remove('station-checked-in', 'is-visited', 'is-visited-partial', 'is-visited-full'));

  // Кешований список лише зон станцій (не всього SVG)
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
    // O(1) Set.has() замість O(V) array.some() з substring-matching
    // Повна відповідність достатня: SVG text збігається з нормалізованою назвою
    if (visitedNameSet.has(cleanText)) {
      txt.classList.add('station-checked-in');
      txt.querySelectorAll('tspan').forEach(t => t.classList.add('station-checked-in'));
    }
  });

  applyVisitedHatchOverlays();
  updateMapAccessibilityIcons();
}

bus.on('map:sync-checkins', syncMapWithCheckins);
bus.on('data:stations-hydrated', () => {
  invalidateStationZoneCache();
  updateMapAccessibilityIcons();
});
// Іконки доступності для SVG-карти.
// ТЕСТ: синя гілка — новий значок візочка; зелена — як на картках станцій
// (кнопка ліфта + візочок, а для підйомників — візочок); червона — без змін.
const MAP_ICON_WHEELCHAIR = {
  viewBox: '0 0 24 24',
  scale: 1,
  attrs: { fill: 'currentColor' },
  inner: '<path d="M12,6.5a2,2,0,1,0-2-2A2,2,0,0,0,12,6.5Zm7.5,14h-1v-5a1,1,0,0,0-1-1h-5v-2h5a1,1,0,0,0,0-2h-5v-2a1,1,0,0,0-2,0v7a1,1,0,0,0,1,1h5v5a1,1,0,0,0,1,1h2a1,1,0,0,0,0-2Zm-6.8-1.6a4,4,0,0,1-7.2-2.4,4,4,0,0,1,2.4-3.66A1,1,0,1,0,7.1,11a6,6,0,1,0,7.2,9.1,1,1,0,0,0-1.6-1.2Z"/>',
};

const MAP_ICON_WHEELCHAIR_NEW = {
  viewBox: '0 0 100 100',
  scale: 1,
  attrs: { fill: 'none', stroke: 'currentColor', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' },
  inner: '<circle cx="66.3" cy="15.6" r="10.3" fill="currentColor" stroke="none"/><circle cx="43.9" cy="67.2" r="21.1" stroke-width="8.2"/><path stroke-width="8" d="m23.6 40.2 8.4-8.8q3-3.2 7.5-3.4l10.5-.4"/><path fill="currentColor" stroke="none" d="M40 24.05c4-.15 7.5-1.15 10.5-1.05q2 .1 4 1.3l9.8 5q2 1.1 2 3.5v3.7L62 47l3.5 5-5.5 6-2-.3a17 17 0 0 0-7-5.9L46 43l3.3-11.5L40 30Z"/><path stroke-width="10.5" d="m63 53.3 17.5.5-2.1 26.5"/>',
};

// Той самий значок, що й Icons.elevator на картках станцій
const MAP_ICON_ELEVATOR = {
  viewBox: '0 0 24 24',
  scale: 1.2,
  attrs: { fill: 'none', stroke: 'currentColor', 'stroke-width': '1.2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' },
  inner: '<g transform="translate(24, 1) scale(-0.85, 0.85)"><path d="M11.5 13V6.5h-1.172a3 3 0 0 0-2.906 2.255l-.963 3.764M17 23.5c-1 0-1.75-1.5-1.75-1.5c-.75-1.5-.75-2.5-.75-4v-1.5h-3.207M23 14c-.265 0-.66.275-.993.553a4.9 4.9 0 0 0-1.088 1.276c-.214.367-.419.813-.419 1.171c0-.358-.205-.804-.42-1.171a4.9 4.9 0 0 0-1.087-1.276C18.661 14.275 18.265 14 18 14m5-4c-.265 0-.66-.275-.993-.553a4.9 4.9 0 0 1-1.088-1.276C20.705 7.804 20.5 7.358 20.5 7c0 .358-.205.804-.42 1.171c-.285.49-.659.918-1.087 1.276c-.332.278-.728.553-.993.553M6 23.5a5.5 5.5 0 1 1 0-11a5.5 5.5 0 0 1 0 11Zm5.35-19s-1.6-1-1.6-2.25a1.747 1.747 0 1 1 3.496 0c0 1.25-1.596 2.25-1.596 2.25z"/></g>',
};

function _pickMapAccessibilityIcon(line, hasRealLift) {
  if (line === 'blue') return MAP_ICON_WHEELCHAIR_NEW;
  if (line === 'green') return hasRealLift ? MAP_ICON_ELEVATOR : MAP_ICON_WHEELCHAIR;
  return MAP_ICON_WHEELCHAIR;
}

/**
 * Малює або видаляє знаки доступності біля станцій з ліфтами на SVG-карті.
 */
export function updateMapAccessibilityIcons() {
  if (!inner || !state.stationsData) return;

  // Очищаємо попередні іконки
  inner.querySelectorAll('.map-accessibility-icon').forEach(el => el.remove());

  if (!isShowMapAccessibilityEnabled()) return;

  const svgEl = inner.querySelector('svg');
  if (!svgEl) return;

  const processedSlugs = new Set();

  _getStationZoneEls().forEach(el => {
    const rawId = el.id.replace(/\d+$/, '').toLowerCase();
    const slug  = getSlugByLower(rawId);
    if (!slug || processedSlugs.has(slug)) return;

    const stData = state.stationsData[slug];
    const hasRealLift = stData?.directions?.some(d =>
      d.exits?.some(e => e.positions?.some(p => p.isLift && !p.isHoist))
    );
    const hasLift = hasRealLift || stData?.directions?.some(d =>
      d.exits?.some(e => e.positions?.some(p => p.isHoist && isShowHoistsEnabled()))
    );

    if (!hasLift) return;
    processedSlugs.add(slug);

    const icon = _pickMapAccessibilityIcon(stData.line, hasRealLift);

    try {
      const bbox = el.getBBox();
      if (!bbox || bbox.width <= 0) return;

      const size = round(Math.min(bbox.width, bbox.height) * 0.3 * icon.scale);
      const gap  = round(Math.min(bbox.width, bbox.height) * 0.3 * 1.1);

      const x = round(bbox.x - size - gap);
      const y = round(bbox.y + (bbox.height - size) / 2);

      const iconGroup = document.createElementNS(SVG_NS, 'svg');
      iconGroup.setAttribute('x', String(x));
      iconGroup.setAttribute('y', String(y));
      iconGroup.setAttribute('width', String(size));
      iconGroup.setAttribute('height', String(size));
      // #mapInner svg { width/height: 100% } з styles.css інакше розтягує вкладений svg на всю карту
      iconGroup.style.width  = `${size}px`;
      iconGroup.style.height = `${size}px`;
      iconGroup.setAttribute('viewBox', icon.viewBox);
      iconGroup.setAttribute('class', 'map-accessibility-icon');
      Object.entries(icon.attrs).forEach(([k, v]) => iconGroup.setAttribute(k, v));
      iconGroup.setAttribute('aria-hidden', 'true');
      iconGroup.innerHTML = icon.inner;

      svgEl.appendChild(iconGroup);
    } catch (err) {
      // Ігноруємо помилки BBox
    }
  });
}

bus.on('map:update-accessibility', updateMapAccessibilityIcons);