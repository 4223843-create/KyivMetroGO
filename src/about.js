// ══ ЛОГІКА ФОРМИ «ПРО ДОДАТОК» ══
// Витягнуто з main2.js. Підключати в main.js одним рядком:
//   import './about.js';

const FORMSPREE_URL_BETA = 'https://formspree.io/f/xrejbjww';

// Знімаємо has-error при введенні
document.addEventListener('input', (e) => {
  if (e.target.classList.contains('about-beta-input')) {
    e.target.closest('.about-input-group')?.classList.remove('has-error');
  }
});

document.addEventListener('submit', async (e) => {
  const form = e.target;
  if (form.id !== 'aboutBetaForm') return;

  e.preventDefault();

  const input     = form.querySelector('.about-beta-input');
  const group     = form.querySelector('.about-input-group');
  const resultMsg = form.parentElement?.querySelector('.about-beta-result');

  if (!input) return;

  let val = input.value.trim().toLowerCase();
  if (val.includes('@')) val = val.split('@')[0];

  const isValid = /^[a-z0-9._\-]{6,30}$/.test(val);

  if (!isValid) {
    group?.classList.add('has-error');
    showResult(resultMsg, 'Схоже, адреса містить помилку', 'error', 4000);
    return;
  }

  group?.classList.remove('has-error');
  showResult(resultMsg, 'Відправляємо…', '', 0);

  try {
    const res = await fetch(FORMSPREE_URL_BETA, {
      method: 'POST',
      headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: `${val}@gmail.com`, subject: 'Заявка на Android Beta' }),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    input.value = '';
    input.blur();
    showResult(resultMsg, 'Дякую. Напишемо!', 'success', 3000);
  } catch (err) {
    console.error('[about] beta form error:', err);
    group?.classList.add('has-error');
    showResult(resultMsg, 'Помилка з\'єднання. Спробуйте пізніше.', 'error', 3000);
  }
});

function showResult(el, text, modifier, autohideMs) {
  if (!el) return;
  el.textContent = text;
  el.className = [
    'about-beta-result',
    modifier ? `about-beta-result-${modifier}` : '',
    'about-beta-result-open',
  ].filter(Boolean).join(' ');

  if (autohideMs > 0) {
    setTimeout(() => el.classList.remove('about-beta-result-open'), autohideMs);
  }
}
