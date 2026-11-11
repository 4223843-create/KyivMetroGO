// ══ TOAST «НОВА ВЕРСІЯ ДОСТУПНА» ══

import { bus } from '../core/eventBus.js';

/**
 * Тост «щось оновилось» з кнопкою перезавантаження і ✕.
 * Один і той самий для нової збірки і для нових даних станцій.
 */
function _showReloadToast(id, text, buttonText) {
  if (document.getElementById(id)) return;

  const toast = document.createElement('div');
  toast.id        = id;
  toast.className = 'sw-update-toast';
  toast.innerHTML = `
    <span class="sw-update-text"></span>
    <button class="sw-update-btn"></button>
    <button class="sw-update-dismiss" aria-label="Закрити">✕</button>`;
  toast.querySelector('.sw-update-text').textContent = text;
  toast.querySelector('.sw-update-btn').textContent  = buttonText;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('sw-toast-visible'));

  toast.querySelector('.sw-update-btn').addEventListener('click', () => location.reload());
  toast.querySelector('.sw-update-dismiss').addEventListener('click', () => {
    toast.classList.remove('sw-toast-visible');
    setTimeout(() => toast.remove(), 300);
  });
}

export function showUpdateToast() {
  _showReloadToast('swUpdateToast', 'Доступна нова версія', 'Оновити');
}

// ── Тост для оновлення даних станцій ──────────────────────────
// Показується коли SW (або на Android — data/stations.js) знаходить нову версію stations.json.
function showDataUpdateToast(version) {
  const m        = /^(\d{4})(\d{2})(\d{2})$/.exec(version ?? '');
  const verLabel = m ? ` від ${m[3]}.${m[2]}.${m[1]}` : '';
  _showReloadToast('swDataUpdateToast', `Оновлено дані станцій${verLabel}`, 'Перезавантажити');
}

let _started = false;

/**
 * Тости про нову збірку й нові дані станцій. Викликає main.js один раз,
 * якомога раніше: повідомлення від SW може прийти ще під час запуску.
 */
export function initUpdateToasts() {
  if (_started) return;
  _started = true;

  if ('serviceWorker' in navigator) {
    // Перше встановлення SW (clients.claim) теж дає controllerchange — тоді це не оновлення.
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', async () => {
      if (!hadController) return;
      // Сторінка могла вже завантажитися з новою збіркою (перше відкриття, перезавантаження повз кеш),
      // а новий SW активувався слідом. Якщо наш головний скрипт є в кеші нового SW,
      // то ми й так на новій версії. Кеш нового SW — kyivmetro-<час збірки> з
      // найбільшим часом (старий у цей момент ще може існувати).
      const mainScript = /** @type {HTMLScriptElement|null} */ (document.querySelector('script[type="module"][src]'))?.src;
      try {
        const newest = (await caches.keys())
          .filter(k => /^kyivmetro-\d+$/.test(k))
          .sort((a, b) => Number(a.split('-')[1]) - Number(b.split('-')[1]))
          .pop();
        if (mainScript && newest && await (await caches.open(newest)).match(mainScript)) return;
      } catch { /* немає доступу до кешу — показуємо тост */ }
      showUpdateToast();
    });

    // Слухаємо повідомлення від SW — зокрема STATIONS_UPDATED.
    navigator.serviceWorker.addEventListener('message', event => {
      try {
        if (event.data?.type === 'STATIONS_UPDATED') {
          showDataUpdateToast(event.data.version);
        }
      } catch {
        // Ігноруємо нерозпізнані повідомлення.
      }
    });
  }

  // Нативна платформа: SW не реєструється, тому stations.js емітує подію через bus.
  // Дзеркало SW-логіки: той самий тост, той самий UX — незалежно від платформи.
  bus.on('stations:updated', ({ version }) => showDataUpdateToast(version));
}
