// ══ ОФЛАЙН-БАНЕР ══

const banner = document.createElement('div');
banner.id        = 'offlineBanner';
banner.className = 'offline-banner';
banner.setAttribute('role', 'status');
banner.setAttribute('aria-live', 'polite');
banner.textContent = 'Офлайн — відображаються кешовані дані';
banner.hidden = navigator.onLine;
document.body.appendChild(banner);

window.addEventListener('offline', () => { banner.hidden = false; });
window.addEventListener('online',  () => { banner.hidden = true;  });
