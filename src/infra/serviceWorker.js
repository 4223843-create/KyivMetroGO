// ══ РЕЄСТРАЦІЯ SERVICE WORKER ══
// Раніше функція registerServiceWorker() була в main.js.
// Тепер: ізольований інфра-модуль, не залежить від бізнес-логіки.

export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('./sw.js', { scope: './' })
      .catch(err => console.error('[PWA] service worker registration failed', err));
  });
}
