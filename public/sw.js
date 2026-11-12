/* eslint-disable no-undef */
import { isValidStationsData, stationsVersion } from '../src/data/validateStations.js';

const BUILD_DATE = typeof __BUILD_DATE__ !== 'undefined' ? __BUILD_DATE__ : 'dev';
const CACHE_NAME = `kyivmetro-${BUILD_DATE}`;

// Великі файли, без яких застосунок запускається: пошук адрес офлайн.
// Їх не кладемо в атомарний cache.addAll() — на слабкій мережі один обрив на
// 1,6 МБ addresses.json зривав би встановлення, і офлайн не працював би взагалі.
// Докешовуються окремо після активації; до того пошук адрес бере їх із мережі.
const DEFERRED_ASSETS = ['./addresses.json'].map(url => new URL(url, self.location).href);

// Унікальні за повною адресою: cache.addAll() відхиляє весь список, якщо
// в ньому є дублікати (а index.html вже є в __WB_MANIFEST) — тоді SW не встановлюється.
const PRECACHE_ASSETS = [...new Set(
  (self.__WB_MANIFEST || [])
    .map(entry => (typeof entry === 'string' ? entry : entry.url))
    .concat([
      './index.html',
      './manifest.json',
      './stations.json',
      './ProbaNav2-Medium.woff2',
    ])
    .map(url => new URL(url, self.location).href),
)].filter(url => !DEFERRED_ASSETS.includes(url));

// Скільки попередніх збірок тримати. Сторінка, відкрита до оновлення, ще може
// попросити лінивий шматок старої збірки (assets/web.<hash>.js) — він знайдеться
// в кеші попередньої версії. Старші за неї видаляються.
const KEEP_PREVIOUS_CACHES = 1;

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(PRECACHE_ASSETS)),
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    pruneOldCaches()
      .then(() => self.clients.claim())
      .then(() => cacheDeferredAssets()),
  );
});

/** Лишає поточний кеш і KEEP_PREVIOUS_CACHES найновіших попередніх збірок. */
async function pruneOldCaches() {
  const builds = (await caches.keys())
    .filter(key => key !== CACHE_NAME && /^kyivmetro-/.test(key))
    .sort((a, b) => (Number(b.split('-')[1]) || 0) - (Number(a.split('-')[1]) || 0));
  await Promise.all(builds.slice(KEEP_PREVIOUS_CACHES).map(key => caches.delete(key)));
}

/** Докешовує великі файли по одному; помилка не заважає роботі (спробуємо при використанні). */
async function cacheDeferredAssets() {
  const cache = await caches.open(CACHE_NAME);
  for (const url of DEFERRED_ASSETS) {
    try {
      if (await cache.match(url, { ignoreVary: true })) continue;
      // no-cache: якщо файл не змінився, сервер відповість коротким 304 з HTTP-кешу
      const previous = await caches.match(url, { ignoreVary: true });
      const fresh = await fetch(url, { cache: 'no-cache' });
      if (!fresh.ok) { if (previous) await cache.put(url, previous); continue; }
      await cache.put(url, fresh);
    } catch {
      // Немає мережі — файл закешується, коли його вперше запитає пошук.
    }
  }
}

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;

  if (url.pathname.endsWith('stations.json')) {
    event.respondWith(stationsLocalFirst(event));
    return;
  }

  // Відкриття сторінки (зокрема ./?station=…, ./?action=…) — офлайн віддаємо index.html
  if (event.request.mode === 'navigate') {
    event.respondWith(navigationResponse(event.request));
    return;
  }

  // Файли збірки з хешем у назві незмінні: з кешу без перевірки мережі.
  if (HASHED_ASSET_RE.test(url.pathname)) {
    event.respondWith(cacheFirst(event.request));
    return;
  }

  event.respondWith(staleWhileRevalidate(event.request));
});

// assets/index.Bx3k9_aZ.js, assets/styles.C1d2e3f4.css — Vite додає хеш до кожного файлу збірки.
const HASHED_ASSET_RE = /\/assets\/[^/]+\.[A-Za-z0-9_-]{8,}\.[a-z0-9]+$/;

async function cacheFirst(request) {
  // Шукаємо в усіх кешах: сторінка старої збірки може просити свій файл,
  // що лишився в кеші попередньої версії.
  const cached = await caches.match(request, { ignoreVary: true });
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) (await caches.open(CACHE_NAME)).put(request, response.clone());
    return response;
  } catch {
    return new Response('Офлайн', { status: 503 });
  }
}

// stations.json — спершу локальна копія: якщо вона є, віддаємо одразу, а мережу
// перевіряємо у фоні. Нову версію сторінка підхоплює сама (infra/swUpdate.js),
// тож інтернет ніколи не гальмує відкриття.
async function stationsLocalFirst(event) {
  const request = event.request;
  const cache   = await caches.open(CACHE_NAME);
  const cached  = await cache.match(request, { ignoreSearch: true, ignoreVary: true });
  // Окрема копія для порівняння версій: тіло `cached` споживе сторінка.
  const cachedForCompare = cached?.clone();

  const networkPromise = fetch(request, { cache: 'no-store' }).then(async response => {
    if (!response.ok) return response;
    let newData;
    try {
      newData = await response.clone().json();
    } catch {
      newData = null;
    }
    // Зіпсований чи несумісний файл не кешуємо: лишається попередня робоча копія.
    if (!isValidStationsData(newData)) return cached ? cachedForCompare.clone() : response;

    // Порівнюємо з наявною копією: старішу (застарілий CDN) не записуємо поверх новішої
    let newer = false;
    let older = false;
    if (cachedForCompare) {
      try {
        const oldData = await cachedForCompare.clone().json();
        newer = stationsVersion(newData) > stationsVersion(oldData);
        older = stationsVersion(newData) < stationsVersion(oldData);
      } catch {
        // Стара копія не читається — просто замінюємо її нижче.
      }
    }
    if (older) return cachedForCompare.clone();
    await cache.put(new URL('./stations.json', self.location).href, response.clone());
    if (newer) {
      // Версія змінилась — повідомляємо всі вкладки (вже після запису в кеш, щоб
      // сторінка, яка одразу перечитає дані, отримала нову копію), зокрема ту, що
      // саме завантажується (її ще може не бути в matchAll — тому й через clientId).
      const message = { type: 'STATIONS_UPDATED', version: newData.version };
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
        .catch(() => []);
      const own = event.clientId ? await self.clients.get(event.clientId).catch(() => null) : null;
      new Set([...clients, own].filter(Boolean)).forEach(client => client.postMessage(message));
    }
    return response;
  });

  // forceFresh у застосунку (cache: 'no-store') — спершу мережа
  if (cached && request.cache !== 'no-store') {
    event.waitUntil(networkPromise.catch(() => {}));
    return cached;
  }
  try {
    return await networkPromise;
  } catch {
    return cached || new Response('Офлайн', { status: 503 });
  }
}

// Відкриття сторінки — спершу збережений index.html, без жодного запиту в мережу.
// Інакше в метро зі слабким сигналом запуск чекав би мережу (на iPhone — до хвилини
// білого екрана), хоча все потрібне вже є на телефоні. Нову збірку браузер
// знаходить сам (перевіряє sw.js), новий SW кешує її — і з'являється тост «Оновити».
async function navigationResponse(request) {
  const cache  = await caches.open(CACHE_NAME);
  const cached = (await cache.match(request, { ignoreSearch: true, ignoreVary: true }))
    || (await cache.match(new URL('./index.html', self.location).href, { ignoreVary: true }));
  if (cached) return cached;
  try {
    return await fetch(request);
  } catch {
    return new Response('Офлайн', { status: 503 });
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  // ignoreVary: сервер може віддати «Vary: Origin», а модульні скрипти
  // запитуються з Origin — без цього збережений файл офлайн не знаходився б.
  const cachedResponse = await cache.match(request, { ignoreVary: true });

  const networkPromise = fetch(request).then(response => {
    if (response.ok) cache.put(request, response.clone());
    return response;
  }).catch(() => null);

  if (cachedResponse) return cachedResponse;
  return await networkPromise || new Response('Офлайн', { status: 503 });
}
