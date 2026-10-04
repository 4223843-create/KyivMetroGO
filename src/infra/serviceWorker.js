// ══ РЕЄСТРАЦІЯ SERVICE WORKER ══
// Лише веб/PWA. У застосунку (Android/iOS) файли й так лежать на пристрої,
// а stations.json оновлює data/stations.js. Android WebView у Capacitor
// підтримує service worker, тож без цієї перевірки там працювали б дві
// системи кешу одночасно: SW віддавав би свою копію замість вшитої в APK.

import { Capacitor } from '@capacitor/core';

export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;

  if (Capacitor.isNativePlatform()) {
    _removeNativeServiceWorker();
    return;
  }

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('./sw.js', { scope: './' })
      .catch(err => console.error('[PWA] service worker registration failed', err));
  });
}

/** Прибирає SW і його кеш, якщо їх встановила попередня збірка застосунку. */
async function _removeNativeServiceWorker() {
  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map(r => r.unregister()));
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith('kyivmetro-')).map(k => caches.delete(k)));
  } catch {
    // Нічого прибирати або API недоступне — не критично.
  }
}
