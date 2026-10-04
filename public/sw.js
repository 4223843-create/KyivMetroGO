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
    event.respondWith(stationsLocalFirst(event));
    return;
  }

  // Відкриття сторінки (зокрема ./?station=…, ./?action=…) — офлайн віддаємо index.html
  if (event.request.mode === 'navigate') {
    event.respondWith(navigationResponse(event.request));
    return;
  }

  event.respondWith(staleWhileRevalidate(event.request));
});

// stations.json — спершу локальна копія: якщо вона є, віддаємо одразу, а мережу
// перевіряємо у фоні. Нова версія застосується після тосту «Перезавантажити»
// або при наступному запуску — інтернет ніколи не гальмує відкриття.
async function stationsLocalFirst(event) {
  const request = event.request;
  const cache   = await caches.open(CACHE_NAME);
  const cached  = await cache.match(request, { ignoreSearch: true });
  // Окрема копія для порівняння версій: тіло `cached` споживе сторінка.
  const cachedForCompare = cached?.clone();

  const networkPromise = fetch(request, { cache: 'no-store' }).then(async response => {
    if (!response.ok) return response;
    if (cachedForCompare) {
      try {
        const [newData, oldData] = await Promise.all([
          response.clone().json(),
          cachedForCompare.json(),
        ]);
        if (newData.version && newData.version !== oldData.version) {
          // Версія змінилась — повідомляємо всі вкладки, зокрема ту, що саме
          // завантажується (її ще може не бути в matchAll — тому й через clientId).
          const message = { type: 'STATIONS_UPDATED', version: newData.version };
          const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
            .catch(() => []);
          const own = event.clientId ? await self.clients.get(event.clientId).catch(() => null) : null;
          new Set([...clients, own].filter(Boolean)).forEach(client => client.postMessage(message));
        }
      } catch {
        // Ignore invalid JSON and refresh the cached copy below.
      }
    }
    await cache.put(new URL('./stations.json', self.location).href, response.clone());
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
