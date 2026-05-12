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
  const verLabel  = version ? ` (${version})` : '';
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
  navigator.serviceWorker.addEventListener('controllerchange', showUpdateToast);

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
