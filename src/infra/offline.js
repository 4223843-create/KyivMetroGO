// ══ ОФЛАЙН-БАНЕР ══
// Тап по плашці розгортає пояснення, навіщо застосунку інтернет.

const banner = document.createElement('button');
banner.type      = 'button';
banner.id        = 'offlineBanner';
banner.className = 'offline-banner';
banner.setAttribute('aria-live', 'polite');
banner.setAttribute('aria-expanded', 'false');
banner.innerHTML = '<strong>Офлайн</strong><span>Вийшли на Львівській брамі?</span>' +
  '<span class="offline-banner-more">Без інтернету працює все: карта, картки станцій, вибране, ' +
  'check-in та інтервали руху. Мережа потрібна лише, щоб отримати нові дані про станції ' +
  'й оновлення застосунку та надіслати ваші правки чи повідомлення</span>';
banner.hidden = navigator.onLine;
document.body.appendChild(banner);

banner.addEventListener('click', () => {
  const open = banner.classList.toggle('is-open');
  banner.setAttribute('aria-expanded', String(open));
});

window.addEventListener('offline', () => { banner.hidden = false; });
window.addEventListener('online',  () => {
  banner.hidden = true;
  banner.classList.remove('is-open');
  banner.setAttribute('aria-expanded', 'false');
});
