// ══ TOAST «НОВА ВЕРСІЯ ДОСТУПНА» ══

function showUpdateToast() {
  if (document.getElementById('swUpdateToast')) return;

  const toast = document.createElement('div');
  toast.id        = 'swUpdateToast';
  toast.className = 'sw-update-toast';
  toast.innerHTML = `
    <span class="sw-update-text">Доступна нова версія</span>
    <button class="sw-update-btn"     id="swUpdateBtn">Оновити</button>
    <button class="sw-update-dismiss" id="swUpdateDismiss" aria-label="Закрити">✕</button>`;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('sw-toast-visible'));

  document.getElementById('swUpdateBtn').addEventListener('click', () => location.reload());
  document.getElementById('swUpdateDismiss').addEventListener('click', () => {
    toast.classList.remove('sw-toast-visible');
    setTimeout(() => toast.remove(), 300);
  });
}

// ── Тост для оновлення даних станцій ──────────────────────────
// Показується коли SW виявляє нову версію stations.json у мережі.
function showDataUpdateToast(version) {
  const existingId = 'swDataUpdateToast';
  if (document.getElementById(existingId)) return;

  const toast = document.createElement('div');
  toast.id        = existingId;
  toast.className = 'sw-update-toast';
  const m         = /^(\d{4})(\d{2})(\d{2})$/.exec(version ?? '');
  const verLabel  = m ? ` від ${m[3]}.${m[2]}.${m[1]}` : '';
  toast.innerHTML = `
    <span class="sw-update-text">Оновлено дані станцій${verLabel}</span>
    <button class="sw-update-btn"     id="swDataUpdateBtn">Перезавантажити</button>
    <button class="sw-update-dismiss" id="swDataUpdateDismiss" aria-label="Закрити">✕</button>`;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('sw-toast-visible'));

  document.getElementById('swDataUpdateBtn').addEventListener('click', () => location.reload());
  document.getElementById('swDataUpdateDismiss').addEventListener('click', () => {
    toast.classList.remove('sw-toast-visible');
    setTimeout(() => toast.remove(), 300);
  });
}

if ('serviceWorker' in navigator) {
  // Перше встановлення SW (clients.claim) теж дає controllerchange — тоді це не оновлення.
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', async () => {
    if (!hadController) return;
    // Сторінка могла вже завантажитися з новою збіркою (навігація йде з мережі),
    // а новий SW активувався слідом. Якщо наш головний скрипт є в кеші нового SW,
    // то ми й так на новій версії. Кеш нового SW — kyivmetro-<час збірки> з
    // найбільшим часом (старий у цей момент ще може існувати).
    const mainScript = document.querySelector('script[type="module"][src]')?.src;
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

// ── Нативна платформа: SW не реєструється, тому stations.js емітує подію через bus ──
// Дзеркало SW-логіки: той самий тост, той самий UX — незалежно від платформи.
import { bus } from '../core/eventBus.js';
bus.on('stations:updated', ({ version }) => showDataUpdateToast(version));
