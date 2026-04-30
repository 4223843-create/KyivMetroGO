// ══ ОФЛАЙН-БАНЕР ══
const offlineBanner = document.createElement('div');
offlineBanner.id = 'offlineBanner';
offlineBanner.className = 'offline-banner';
offlineBanner.setAttribute('role', 'status');
offlineBanner.setAttribute('aria-live', 'polite');
offlineBanner.textContent = 'Офлайн — відображаються кешовані дані';
offlineBanner.hidden = navigator.onLine;
document.body.appendChild(offlineBanner);

window.addEventListener('offline', () => { offlineBanner.hidden = false; });
window.addEventListener('online',  () => { offlineBanner.hidden = true;  });

// ══ TOAST «ОНОВЛЕННЯ ДОСТУПНЕ» ══
function showUpdateToast() {
  if (document.getElementById('swUpdateToast')) return; // вже показано

  const toast = document.createElement('div');
  toast.id = 'swUpdateToast';
  toast.className = 'sw-update-toast';
  toast.innerHTML = `
    <span class="sw-update-text">Доступна нова версія</span>
    <button class="sw-update-btn" id="swUpdateBtn">Оновити</button>
    <button class="sw-update-dismiss" id="swUpdateDismiss" aria-label="Закрити">✕</button>`;
  document.body.appendChild(toast);

  requestAnimationFrame(() => toast.classList.add('sw-toast-visible'));

  document.getElementById('swUpdateBtn').addEventListener('click', () => {
    location.reload();
  });
  document.getElementById('swUpdateDismiss').addEventListener('click', () => {
    toast.classList.remove('sw-toast-visible');
    setTimeout(() => toast.remove(), 300);
  });
}

// ══ СЛУХАЧ ОНОВЛЕННЯ SW ══
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    showUpdateToast();
  });
}
