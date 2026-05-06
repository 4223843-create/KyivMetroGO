import { state, startupSlug } from './state.js';
import { traversePositions }  from './positions.js';

const STATION_ALIASES = {
  'театральну': 'театральна',
  'площу українських героїв': 'площа українських героїв',
};

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

export function slugByName(raw) {
  let normalized = raw.toLowerCase()
    .replace(/[\u00a0\u202f\u2009]/g, ' ')
    .replace(/(?:короткий |довгий )?пере(?:садка|хід) на\s*/g, '')
    .replace(/попередня\s*/g, '')
    .replace(/["'„"«».,]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (MetroApp.NAME_TO_SLUG[normalized]) return MetroApp.NAME_TO_SLUG[normalized];

  for (const [alias, realName] of Object.entries(STATION_ALIASES)) {
    if (normalized.includes(alias)) {
      normalized = normalized.replace(alias, realName);
      break;
    }
  }

  if (MetroApp.NAME_TO_SLUG[normalized]) return MetroApp.NAME_TO_SLUG[normalized];

  for (const name of Object.keys(MetroApp.NAME_TO_SLUG)) {
    const stem = name.length > 6 ? name.slice(0, -2) : name;
    if (normalized.includes(stem)) return MetroApp.NAME_TO_SLUG[name];
  }

  return null;
}

export function hydrateStations(data) {
  if (!state.stationsData) state.stationsData = {};
  Object.keys(state.stationsData).forEach(key => delete state.stationsData[key]);

  MetroApp.NAME_TO_SLUG  = {};
  MetroApp.SLUG_BY_LOWER = {};

  data.stations.forEach(station => {

    // ── Плаский масив positions для зворотньої сумісності ──
    station.positions = [];
    traversePositions(station, ({ dir, exit, position }) => {
      station.positions.push({
        dir:   dir.from,
        exit:  exit.label || '',
        wagon: position.wagon,
        doors: position.doors,
      });
    });

    const cleanName = station.name.toLowerCase().replace(/["'„"«».,]/g, '');
    MetroApp.NAME_TO_SLUG[cleanName]                   = station.slug;
    MetroApp.SLUG_BY_LOWER[station.slug.toLowerCase()] = station.slug;

    const stationWords   = cleanName.split(/[\s\u00a0\u202f\-]+/);
    const slugParts      = station.slug.split('.');
    const cleanEnName    = (slugParts.length > 1 ? slugParts[1] : station.slug).replace(/_/g, ' ').toLowerCase();
    const stationEnWords = cleanEnName.split(/\s+/);
    const acronym        = stationWords.map(word => word.charAt(0)).join('');

    // Аліаси — з JSON-поля searchAliases, не hardcoded в JS.
    // Щоб додати аліас — редагуй stations.json, а не цей файл.
    // Приклад у stations.json:
    //   { "slug": "R.Politekhnychnyi_instytut", "searchAliases": ["кпі"], ... }
    //   { "slug": "B.Ploshcha_Ukrainskikh_heroiv", "searchAliases": ["плуг", "площа льва толстого"], ... }
    //   { "slug": "G.Zvirynetska", "searchAliases": ["дружби народів"], ... }
    const aliases = (station.searchAliases ?? []).map(a => a.toLowerCase());

    station._searchIndex = [
      ...stationWords,
      ...stationEnWords,
      acronym,
      ...aliases.flatMap(alias => alias.toLowerCase().split(/[\s\u00a0\u202f\-]+/)),
    ];

    state.stationsData[station.slug] = station;
  });

  if (MetroApp.applyLocalEdits) MetroApp.applyLocalEdits(state.stationsData);
  if (MetroApp.applyExitLabels) MetroApp.applyExitLabels(state.stationsData);
  MetroApp.currentStationsData = state.stationsData;
  return state.stationsData;
}

export function renderMapZones() {
  if (state.isZonesReady) return;

  const inner = document.getElementById('mapInner');
  const svgEl = inner?.querySelector('svg');
  if (!svgEl || !state.stationsData) return;

  svgEl.querySelectorAll('[id]').forEach(el => {
    const rawId = el.id.replace(/\d+$/, '').toLowerCase();
    const slug  = MetroApp.SLUG_BY_LOWER[rawId];

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
  });
}

export async function reloadStationsData(forceFresh = false) {
  const stationsUrl = getStationsUrl();
  const response = await fetch(
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

MetroApp.reloadStationsData = reloadStationsData;
MetroApp.slugByName         = slugByName;
