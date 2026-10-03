/* eslint-disable no-undef */
const BUILD_DATE = typeof __BUILD_DATE__ !== 'undefined' ? __BUILD_DATE__ : 'dev';
const CACHE_NAME = `kyivmetro-${BUILD_DATE}`;

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
)];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(PRECACHE_ASSETS)),
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)),
    )).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;

  if (url.pathname.endsWith('stations.json')) {
    event.respondWith(networkFirst(event.request));
    return;
  }

  // Відкриття сторінки (зокрема ./?station=…, ./?action=…) — офлайн віддаємо index.html
  if (event.request.mode === 'navigate') {
    event.respondWith(navigationResponse(event.request));
    return;
  }

  event.respondWith(staleWhileRevalidate(event.request));
});

const NETWORK_TIMEOUT_MS = 4000;

// stations.json: мережа першою, але якщо є збережена копія і мережа повільна —
// через 4 с віддаємо копію (оновлення докешується у фоні).
async function networkFirst(request) {
  const cache  = await caches.open(CACHE_NAME);
  const cached = await cache.match(request, { ignoreSearch: true });

  const networkPromise = fetch(request).then(async response => {
    if (!response.ok) return response;
    if (cached) {
      try {
        const [newData, oldData] = await Promise.all([
          response.clone().json(),
          cached.clone().json(),
        ]);
        if (!newData.version || newData.version !== oldData.version) {
          // Версія змінилась — повідомляємо всі вкладки.
          self.clients.matchAll({ type: 'window', includeUncontrolled: false })
            .then(clients => clients.forEach(client =>
              client.postMessage({ type: 'STATIONS_UPDATED', version: newData.version ?? null })
            ))
            .catch(() => {});  // не критично
        }
      } catch {
        // Ignore invalid JSON and refresh the cached copy below.
      }
    }
    await cache.put(request, response.clone());
    return response;
  });

  if (!cached) {
    try {
      return await networkPromise;
    } catch {
      return new Response('Офлайн', { status: 503 });
    }
  }

  const timeout = new Promise(resolve => setTimeout(() => resolve(null), NETWORK_TIMEOUT_MS));
  const fresh = await Promise.race([networkPromise.catch(() => null), timeout]);
  return fresh?.ok ? fresh : cached;
}

async function navigationResponse(request) {
  try {
    const response = await fetch(request);
    if (response.ok) return response;
  } catch {
    // Немає мережі — нижче віддаємо збережений index.html
  }
  const cache = await caches.open(CACHE_NAME);
  return (await cache.match(request, { ignoreSearch: true }))
    || (await cache.match(new URL('./index.html', self.location).href))
    || new Response('Офлайн', { status: 503 });
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cachedResponse = await cache.match(request);

  const networkPromise = fetch(request).then(response => {
    if (response.ok) cache.put(request, response.clone());
    return response;
  }).catch(() => null);

  if (cachedResponse) return cachedResponse;
  return await networkPromise || new Response('Офлайн', { status: 503 });
}
