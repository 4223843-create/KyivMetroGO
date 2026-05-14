import { STORAGE_KEYS, Storage } from '@core/storage.js';

const root = document.documentElement;

export function applyTheme(preference, save = true) {
  let pref = preference;

  if (!pref) {
    pref = Storage.get(STORAGE_KEYS.THEME) || 'system';
    save = false;
  }

  const actualTheme = pref === 'system'
    ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : pref;

  const css = document.createElement('style');
  css.textContent = '*, *::before, *::after { transition: none !important; }';
  document.head.appendChild(css);

  root.setAttribute('data-theme', actualTheme);

  if (save) {
    Storage.set(STORAGE_KEYS.THEME, pref);
  }

  // Оновлюємо сегментований контрол
  document.querySelectorAll('#settingsThemeSeg .settings-seg-btn').forEach(btn => {
    btn.classList.toggle('is-active', btn.dataset.themeVal === pref);
  });

  requestAnimationFrame(() => requestAnimationFrame(() => css.remove()));
}

window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  const pref = Storage.get(STORAGE_KEYS.THEME) || 'system';
  if (pref === 'system') applyTheme('system', false);
});