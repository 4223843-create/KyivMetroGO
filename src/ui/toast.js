// ══ КОРОТКЕ ПОВІДОМЛЕННЯ ВНИЗУ ЕКРАНА ══

/** Показує повідомлення на 2,5 с (стиль .dev-mode-toast у styles.css). */
export function showToast(text) {
  document.querySelectorAll('.app-toast').forEach(t => t.remove());
  const toast = document.createElement('div');
  toast.className = 'dev-mode-toast app-toast';
  toast.textContent = text;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('dev-mode-toast-open'));
  setTimeout(() => {
    toast.classList.remove('dev-mode-toast-open');
    setTimeout(() => toast.remove(), 400);
  }, 2500);
}
