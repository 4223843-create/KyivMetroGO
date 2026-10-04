// ══ ПЕРЕВІРКА ОНОВЛЕНЬ ПРИ ПОВЕРНЕННІ З ФОНУ ══
// Встановлений застосунок (PWA чи APK) телефон тримає в пам'яті днями, і
// «холодного» запуску, на якому браузер перевіряє нову збірку, а застосунок —
// нові дані, може не бути. Тому при поверненні з фону перевіряємо обидва,
// не частіше ніж раз на RESUME_CHECK_INTERVAL_MS. Знайдене оновлення показує
// звичний тост (swUpdate.js), нічого не перезавантажується саме.

import { Capacitor }           from '@capacitor/core';
import { App }                 from '@capacitor/app';
import { checkStationsUpdate } from '../data/stations.js';

const RESUME_CHECK_INTERVAL_MS = 30 * 60 * 1000;

let _lastCheck = Date.now();

function _checkOnResume() {
  if (Date.now() - _lastCheck < RESUME_CHECK_INTERVAL_MS) return;
  _lastCheck = Date.now();

  checkStationsUpdate();
  if (!Capacitor.isNativePlatform() && 'serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistration()
      .then(reg => reg?.update())
      .catch(() => {});
  }
}

if (Capacitor.isNativePlatform()) {
  App.addListener('resume', _checkOnResume);
} else {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') _checkOnResume();
  });
}
