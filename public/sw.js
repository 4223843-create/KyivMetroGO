const BUILD_DATE = '20250422';
const CACHE_NAME = `kyivmetro-${BUILD_DATE}`;

const PRECACHE_ASSETS = (self.__WB_MANIFEST || [])
  .map(entry => (typeof entry === 'string' ? entry : entry.url))
  .concat([
    './index.html',
    './manifest.json',
    './ProbaNav2-Medium.woff2',
  ]);

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

  event.respondWith(staleWhileRevalidate(event.request));
});

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(request);

      if (cached) {
        try {
          const [newData, oldData] = await Promise.all([
            response.clone().json(),
            cached.json(),
          ]);

          if (newData.version && newData.version === oldData.version) {
            return response;
          }
        } catch {
          // Ignore invalid JSON and refresh the cached copy below.
        }
      }

      cache.put(request, response.clone());
    }

    return response;
  } catch {
    return (await caches.match(request)) || new Response('Офлайн', { status: 503 });
  }
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
