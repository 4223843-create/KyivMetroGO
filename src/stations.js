import { state, startupSlug } from './state.js';

// ══ ВЛАСТИВОСТІ РЯДКА ══
MetroApp.properCase = function(name) {
  let wordIndex = 0;
  return name.replace(/[а-яіїєґА-ЯІЇЄҐ]+/g, match => {
    const wl = match.toLowerCase();
    const shouldCap = wordIndex === 0 || MetroApp.ALWAYS_CAP.has(wl);
    wordIndex++;
    return shouldCap ? wl.charAt(0).toUpperCase() + wl.slice(1) : wl;
  });
};

const STATION_ALIASES = {
  'театральну':                'театральна',
  'площу українських героїв': 'площа українських героїв',
};

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
  Object.keys(state.stationsData).forEach(k => delete state.stationsData[k]);

  MetroApp.NAME_TO_SLUG  = {};
  MetroApp.SLUG_BY_LOWER = {};

  data.stations.forEach(s => {
    s.positions = [];
    s.directions?.forEach(dir => {
      dir.exits?.forEach(exit => {
        exit.positions?.forEach(pos => {
          s.positions.push({ dir: dir.from, exit: exit.label || '', wagon: pos.wagon, doors: pos.doors });
        });
      });
    });

    const cleanName     = s.name.toLowerCase().replace(/["'„"«».,]/g, '');
    MetroApp.NAME_TO_SLUG[cleanName]          = s.slug;
    MetroApp.SLUG_BY_LOWER[s.slug.toLowerCase()] = s.slug;

    const stationWords  = cleanName.split(/[\s\u00a0\u202f\-]+/);
    const cleanEnName   = s.slug.split('.')[1].replace(/_/g, ' ').toLowerCase();
    const stationEnWords = cleanEnName.split(/\s+/);
    const acronym       = stationWords.map(w => w.charAt(0)).join('');

    const aliases = [];
    if (s.slug === 'R.Politekhnychnyi_instytut') aliases.push('кпі');
    if (s.slug === 'B.Ploshcha_Ukrainskikh_heroiv') { aliases.push('плуг'); aliases.push('площа льва толстого'); }
    if (s.slug === 'G.Zvirynetska') aliases.push('дружби народів');

    s._searchIndex = [
      ...stationWords,
      ...stationEnWords,
      acronym,
      ...aliases.flatMap(a => a.toLowerCase().split(/[\s\u00a0\u202f\-]+/)),
    ];

    state.stationsData[s.slug] = s;
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
    if (slug) {
      el.style.fill   = 'transparent';
      el.style.stroke = 'transparent';
      el.style.pointerEvents = 'all';
      el.style.cursor = 'pointer';
      el.style.webkitTapHighlightColor = 'transparent';
      el.setAttribute('role',       'button');
      el.setAttribute('tabindex',   '0');
      el.setAttribute('aria-label', `Станція ${state.stationsData[slug].name}`);
    }
  });

  state.isZonesReady = true;
  checkAppReady();
}

function checkAppReady() {
  if (state.isMapReady && state.isZonesReady) {
    requestAnimationFrame(() => {
      document.getElementById('mapViewport')?.classList.remove('is-loading');
    });
  }
}

export async function reloadStationsData(forceFresh = false) {
  const response = await fetch('stations.json', forceFresh ? { cache: 'no-store' } : undefined);
  const data     = await response.json();
  const hydrated = hydrateStations(data);

  if (!forceFresh) {
    renderMapZones();
    handleStartupStation(hydrated);
  }

  // Якщо Обране відкрилось до завантаження даних — перемалюємо
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

// Публікуємо для міжмодульного доступу
MetroApp.reloadStationsData = reloadStationsData;
MetroApp.slugByName         = slugByName;
