// ══ TOAST «НОВА ВЕРСІЯ ДОСТУПНА» ══
// Раніше в offline.js разом із офлайн-банером.
// Тепер: окремий файл — незалежний від мережевого стану.

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

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('controllerchange', showUpdateToast);
}
