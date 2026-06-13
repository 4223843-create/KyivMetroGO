import { Capacitor }                      from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';

import { state, startupSlug } from '../core/state.js';
import { bus }                from '../core/eventBus.js';
import { traversePositions }  from './positions.js';

// ══ НАТИВНЕ ОНОВЛЕННЯ ДАНИХ СТАНЦІЙ ══════════════════════════
// SW обробляє stations.json для веб/PWA (networkFirst + version-check + postMessage).
// На нативній платформі SW інертний — реалізуємо ту саму логіку вручну:
//   1. fetch(REMOTE_STATIONS_URL) з таймаутом
//   2. Filesystem.Cache як проміжний кеш
//   3. http://localhost/stations.json (bundled в APK) як фінальний fallback
//
// Замініть REMOTE_STATIONS_URL на реальний домен перед релізом.

const REMOTE_STATIONS_URL = 'https://raw.githubusercontent.com/4223843-create/KyivMetroGO/refs/heads/main/public/stations.json';
const NATIVE_CACHE_PATH   = 'stations_cache.json';
const FETCH_TIMEOUT_MS    = 8000;

// ══ ПРИВАТНІ СЛОВНИКИ (closure) ══════════════════════════════
// Заповнюються у hydrateStations(), читаються через slugByName() / getSlugByLower().
// Жоден зовнішній модуль не має прямого доступу до цих об'єктів.

/** @type {Record<string, string>}  назва_lowercase → slug */
const _nameToSlug  = {};

/** @type {Record<string, string>}  slug_lowercase → slug (оригінальний кейс) */
const _slugByLower = {};

// ══ АЛІАСИ ДЛЯ ПОШУКУ ═══════════════════════════════════════
// Застарілі або розмовні назви → нормалізований варіант.

const STATION_ALIASES = {
  'театральну':                'театральна',
  'площу українських героїв': 'площа українських героїв',
};

// ══ ДОПОМІЖНІ ФУНКЦІЇ ════════════════════════════════════════

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

// ══ ПУБЛІЧНІ ХЕЛПЕРИ ══════════════════════════════════════════

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
    .replace(/[\u00a0\u202f\u2009]/g, ' ')           // NBSP та вузькі пробіли → звичайний пробіл
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

// ══ ГІДРАТАЦІЯ ════════════════════════════════════════════════

/**
 * Заповнює state.stationsData та приватні словники зі свіжих даних.
 * Викликається з reloadStationsData після кожного fetch.
 *
 * Після наповнення stationsData синхронно емітує 'data:stations-hydrated'.
 * data/localEdits.js підписаний на цю подію і застосовує localEdits + exitLabels
 * до тих самих об'єктів (EventBus — синхронний, handlers запускаються до повернення emit).
 *
 * @param {{ stations: Array }} data — розібраний stations.json
 * @returns {Record<string, object>} state.stationsData
 */
export function hydrateStations(data) {
  if (!state.stationsData) state.stationsData = {};
  Object.keys(state.stationsData).forEach(key => delete state.stationsData[key]);

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

  // data/localEdits.js підписаний через bus.on('data:stations-hydrated') і виконує
  // applyLocalEdits + applyExitLabels синхронно перед поверненням цієї функції.
  bus.emit('data:stations-hydrated', { stationsData: state.stationsData });

  return state.stationsData;
}

// ══ ЗОНИ КАРТИ ════════════════════════════════════════════════

/**
 * Прив'язує SVG-зони на карті до slug-ів станцій.
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
    bus.emit('map:sync-checkins');
  });
}

// ══ НАТИВНЕ ЗАВАНТАЖЕННЯ (три рівні надійності) ═══════════════

/**
 * Зчитує закешовану версію stations.json з Filesystem.Cache.
 * Повертає { data, version } або null якщо кеш відсутній / пошкоджений.
 *
 * @returns {Promise<{ data: object, version: number|string|null }|null>}
 */
async function _readFilesystemCache() {
  try {
    const cached = await Filesystem.readFile({
      path:      NATIVE_CACHE_PATH,
      directory: Directory.Cache,
      encoding:  Encoding.UTF8,
    });
    const data = JSON.parse(cached.data);
    return { data, version: data.version ?? null };
  } catch {
    return null; // кеш відсутній або JSON пошкоджений
  }
}

/**
 * Зберігає свіжі дані stations.json у Filesystem.Cache.
 * Помилка запису не є критичною — додаток продовжить роботу з мережевими даними.
 *
 * @param {object} data — розібраний об'єкт stations.json
 */
async function _writeFilesystemCache(data) {
  try {
    await Filesystem.writeFile({
      path:      NATIVE_CACHE_PATH,
      data:      JSON.stringify(data),
      directory: Directory.Cache,
      encoding:  Encoding.UTF8,
    });
  } catch {
    // Не критично: наступний запуск спробує знову.
  }
}

/**
 * Завантажує stations.json для нативної платформи.
 * Три рівні надійності:
 *   1. Мережа (REMOTE_STATIONS_URL) з таймаутом → Filesystem.Cache (запис)
 *   2. Filesystem.Cache (читання) — якщо мережа недоступна
 *   3. Bundled APK (http://localhost/stations.json) — якщо кеш теж порожній
 *
 * При виявленні нової версії емітує 'stations:updated' — swUpdate.js покаже тост.
 *
 * @param {boolean} forceFresh — ігнорувати кеш, завжди йти в мережу
 * @returns {Promise<object>} розібраний stations.json
 */
async function _fetchStationsNative(forceFresh = false) {
  // ── Рівень 1: мережа ─────────────────────────────────────────
  try {
    const controller = new AbortController();
    const timeoutId  = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const response = await fetch(REMOTE_STATIONS_URL, {
      signal: controller.signal,
      cache:  forceFresh ? 'no-store' : 'default',
    });
    clearTimeout(timeoutId);

    if (response.ok) {
      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('json')) {
        throw new Error(`Unexpected content-type: ${contentType}`);
      }

      const freshData = await response.json();

      // Порівнюємо версію з кешем — щоб повідомити користувача про оновлення.
      if (!forceFresh) {
        const cached = await _readFilesystemCache();
        if (
          freshData.version != null &&
          cached?.version   != null &&
          freshData.version !== cached.version
        ) {
          // Дзеркало SW-логіки: там postMessage({ type: 'STATIONS_UPDATED' }),
          // тут — bus.emit, який swUpdate.js перехоплює через підписку.
          bus.emit('stations:updated', { version: freshData.version });
        }
      }

      // Зберігаємо в кеш асинхронно — не блокуємо гідратацію.
      _writeFilesystemCache(freshData);

      return freshData;
    }
  } catch (networkError) {
    // AbortError (таймаут) або відсутність мережі — переходимо до рівня 2.
    if (networkError.name !== 'AbortError') {
      console.warn('[stations] network fetch failed:', networkError.message);
    }
  }

  // ── Рівень 2: Filesystem.Cache ────────────────────────────────
  if (!forceFresh) {
    const cached = await _readFilesystemCache();
    if (cached) {
      console.info('[stations] loaded from Filesystem cache');
      return cached.data;
    }
  }

  // ── Рівень 3: bundled APK (http://localhost/stations.json) ────
  console.info('[stations] falling back to bundled APK copy');
  const bundledUrl      = getStationsUrl();
  const bundledResponse = await fetch(bundledUrl);

  if (!bundledResponse.ok) {
    throw new Error(
      `stations.json bundled fetch failed: ${bundledResponse.status} (${bundledUrl.href})`,
    );
  }
  return bundledResponse.json();
}

// ══ ЗАВАНТАЖЕННЯ (публічне) ════════════════════════════════════

/**
 * Завантажує та гідратує stations.json.
 * На нативній платформі — _fetchStationsNative() (мережа→кеш→bundled).
 * На веб/PWA — прямий fetch; SW самостійно обробляє networkFirst та кешування.
 *
 * @param {boolean} [forceFresh=false] — примусово оновити дані (ігнорувати кеш/SW)
 * @returns {Promise<Record<string, object>>} state.stationsData після гідратації
 */
export async function reloadStationsData(forceFresh = false) {
  let data;

  if (Capacitor.isNativePlatform()) {
    data = await _fetchStationsNative(forceFresh);
  } else {
    // Веб/PWA: SW перехоплює цей fetch і виконує networkFirst для stations.json.
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

    try {
      data = await response.json();
    } catch (parseError) {
      throw new Error(
        `stations.json contains invalid JSON (${stationsUrl.href}): ${parseError.message}`,
      );
    }
  }

  if (!data || !Array.isArray(data.stations) || data.stations.length === 0) {
    throw new Error(
      'stations.json has unexpected structure: missing or empty "stations" array',
    );
  }

  const hydrated = hydrateStations(data);

  if (!forceFresh) {
    renderMapZones();
    handleStartupStation(hydrated);
  }

  bus.emit('fav:render-on-load');

  return hydrated;
}

function handleStartupStation(data) {
  if (startupSlug && data[startupSlug]) {
    requestAnimationFrame(() => bus.emit('station:open', { slug: startupSlug }));
  }
}
