// ══ STATIONS DATA ══
// Відповідальність: завантаження, парсинг та гідратація даних станцій.
//
// P2-E fix: NAME_TO_SLUG та SLUG_BY_LOWER більше не живуть у MetroApp і не
// імпортуються з constants.js. Вони є приватними змінними цього модуля
// і доступні ззовні виключно через slugByName() та getSlugByLower().
// Це єдине джерело правди для пошуку slug за назвою станції.

import { state, startupSlug } from '../core/state.js';
import { traversePositions }  from './positions.js';

// ══ ПРИВАТНІ СЛОВНИКИ (closure) ══
// Заповнюються у hydrateStations(), читаються через slugByName() / getSlugByLower().
// Жоден зовнішній модуль не має прямого доступу до цих об'єктів.

/** @type {Record<string, string>}  назва_lowercase → slug */
const _nameToSlug  = {};

/** @type {Record<string, string>}  slug_lowercase → slug (оригінальний кейс) */
const _slugByLower = {};

// ══ АЛІАСИ ДЛЯ ПОШУКУ ══
// Застарілі або розмовні назви → нормалізований варіант.

const STATION_ALIASES = {
  'театральну':                 'театральна',
  'площу українських героїв':  'площа українських героїв',
};

// ══ ДОПОМІЖНІ ФУНКЦІЇ ══

function getAppBaseHref() {
  const { origin, pathname } = window.location;
  const normalizedPath = pathname.endsWith('/')
    ? pathname
    : pathname.split('/').pop()?.includes('.')
      ? pathname.slice(0, pathname.lastIndexOf('/') + 1)
      : `${pathname}/`;
  return new URL(normalizedPath, origin);
}

function getStationsUrl() {
  return new URL('stations.json', getAppBaseHref());
}

// ══ ПУБЛІЧНІ ХЕЛПЕРИ ══

/**
 * Повертає slug станції за довільним рядком назви.
 * Нормалізує регістр, прибирає службові слова («пересадка на», «перехід до» тощо),
 * застосовує аліаси та stem-пошук для коротких збігів.
 *
 * @param {string} raw — сирий рядок (може містити «пересадка на Золоті Ворота»)
 * @returns {string|null} slug або null якщо не знайдено
 */
export function slugByName(raw) {
  if (!raw) return null;

  let normalized = raw
    .toLowerCase()
    .replace(/[\u00a0\u202f\u2009]/g, ' ')          // NBSP та вузькі пробіли → звичайний пробіл
    .replace(/(?:короткий |довгий )?пере(?:садка|хід) на\s*/g, '')
    .replace(/попередня\s*/g, '')
    .replace(/["'„"«».,]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  // 1. Прямий збіг
  if (_nameToSlug[normalized]) return _nameToSlug[normalized];

  // 2. Аліаси
  for (const [alias, realName] of Object.entries(STATION_ALIASES)) {
    if (normalized.includes(alias)) {
      normalized = normalized.replace(alias, realName);
      break;
    }
  }
  if (_nameToSlug[normalized]) return _nameToSlug[normalized];

  // 3. Stem-пошук (скорочення кінця слова для відмінків)
  for (const [name, slug] of Object.entries(_nameToSlug)) {
    const stem = name.length > 6 ? name.slice(0, -2) : name;
    if (normalized.includes(stem)) return slug;
  }

  return null;
}

/**
 * Повертає оригінальний (правильного кейсу) slug за lowercase-версією.
 * Використовується у mapInteraction.js для зіставлення id SVG-зон з slug.
 *
 * @param {string} lowerSlug — slug.toLowerCase()
 * @returns {string|null}
 */
export function getSlugByLower(lowerSlug) {
  return _slugByLower[lowerSlug] ?? null;
}

// ══ ГІДРАТАЦІЯ ══

/**
 * Заповнює state.stationsData та приватні словники зі свіжих даних.
 * Викликається з reloadStationsData після кожного fetch.
 *
 * @param {{ stations: Array }} data — розібраний stations.json
 * @returns {Record<string, object>} state.stationsData
 */
export function hydrateStations(data) {
  // Очищаємо поточний стан
  if (!state.stationsData) state.stationsData = {};
  Object.keys(state.stationsData).forEach(key => delete state.stationsData[key]);

  // Очищаємо приватні словники
  Object.keys(_nameToSlug).forEach(k  => delete _nameToSlug[k]);
  Object.keys(_slugByLower).forEach(k => delete _slugByLower[k]);

  data.stations.forEach(station => {
    // ── Плаский масив позицій (для feedback та пошуку) ──
    station.positions = [];
    traversePositions(station, ({ dir, exit, position }) => {
      station.positions.push({
        dir:   dir.from,
        exit:  exit.label || '',
        wagon: position.wagon,
        doors: position.doors,
      });
    });

    // ── Заповнюємо приватні словники ──
    const cleanName = station.name.toLowerCase().replace(/["'„"«».,]/g, '');
    _nameToSlug[cleanName]                   = station.slug;
    _slugByLower[station.slug.toLowerCase()] = station.slug;

    // ── Пошуковий індекс ──
    const stationWords   = cleanName.split(/[\s\u00a0\u202f\-]+/);
    const slugParts      = station.slug.split('.');
    const cleanEnName    = (slugParts.length > 1 ? slugParts[1] : station.slug)
                             .replace(/_/g, ' ').toLowerCase();
    const stationEnWords = cleanEnName.split(/\s+/);
    const acronym        = stationWords.map(word => word.charAt(0)).join('');
    const aliases        = (station.searchAliases ?? []).map(a => a.toLowerCase());

    station._searchIndex = [
      ...stationWords,
      ...stationEnWords,
      acronym,
      ...aliases.flatMap(alias => alias.split(/[\s\u00a0\u202f\-]+/)),
    ];

    // ── Індекс підписів виходів (для пошуку за назвою вулиці) ──
    const exitTokens = new Set();
    (station.directions || []).forEach(dir => {
      (dir.exits || []).forEach(ex => {
        if (!ex.label) return;
        ex.label
          .toLowerCase()
          .replace(/[„"«»"'.,!?]/g, '')
          .split(/[\s\u00a0\u202f\u2009]+/)
          .filter(w => w.length > 1)
          .forEach(w => exitTokens.add(w));
      });
    });
    station._exitIndex = [...exitTokens];

    state.stationsData[station.slug] = station;
  });

  if (MetroApp.applyLocalEdits)  MetroApp.applyLocalEdits(state.stationsData);
  if (MetroApp.applyExitLabels)  MetroApp.applyExitLabels(state.stationsData);
  MetroApp.currentStationsData = state.stationsData;
  return state.stationsData;
}

// ══ ЗОНИ КАРТИ ══

/**
 * Прив'язує SVG-зони на карті до slug-ів станцій.
 * Використовує приватний _slugByLower замість MetroApp.SLUG_BY_LOWER.
 */
export function renderMapZones() {
  if (state.isZonesReady) return;

  const inner = document.getElementById('mapInner');
  const svgEl = inner?.querySelector('svg');
  if (!svgEl || !state.stationsData) return;

  svgEl.querySelectorAll('[id]').forEach(el => {
    const rawId = el.id.replace(/\d+$/, '').toLowerCase();
    const slug  = _slugByLower[rawId];

    if (!slug) return;

    el.style.fill                    = 'transparent';
    el.style.stroke                  = 'transparent';
    el.style.pointerEvents           = 'all';
    el.style.cursor                  = 'pointer';
    el.style.webkitTapHighlightColor = 'transparent';
    el.setAttribute('role', 'button');
    el.setAttribute('tabindex', '0');
    el.setAttribute('aria-label', `Станція ${state.stationsData[slug].name}`);
  });

  state.isZonesReady = true;
  checkAppReady();
}

export function checkAppReady() {
  if (!state.isMapReady || !state.isZonesReady) return;

  requestAnimationFrame(() => {
    document.getElementById('mapViewport')?.classList.remove('is-loading');
    MetroApp.syncMapWithCheckins?.();
  });
}

// ══ ЗАВАНТАЖЕННЯ ══

export async function reloadStationsData(forceFresh = false) {
  const stationsUrl = getStationsUrl();
  const response    = await fetch(
    stationsUrl,
    forceFresh ? { cache: 'no-store' } : undefined,
  );

  if (!response.ok) {
    throw new Error(
      `stations.json request failed: ${response.status} ${response.statusText} (${stationsUrl.href})`,
    );
  }

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('json')) {
    throw new Error(
      `stations.json returned non-JSON content: ${contentType || 'unknown'} (${stationsUrl.href})`,
    );
  }

  const data     = await response.json();
  const hydrated = hydrateStations(data);

  if (!forceFresh) {
    renderMapZones();
    handleStartupStation(hydrated);
  }

  const favSheet = document.getElementById('favSheet');
  const favBody  = document.getElementById('favBody');
  if (favSheet?.classList.contains('sheet-open') && favBody?.querySelector('.fav-empty-text')) {
    MetroApp.renderFavOnLoad?.();
  }

  return hydrated;
}

function handleStartupStation(data) {
  if (startupSlug && data[startupSlug]) {
    requestAnimationFrame(() => MetroApp.openStation?.(startupSlug));
  }
}

// ── Перехідний фасад (TODO: видалити після міграції всіх споживачів) ──
MetroApp.reloadStationsData = reloadStationsData;
MetroApp.slugByName         = slugByName;
