import { STORAGE_KEYS, Storage } from './storage.js';

const root = document.documentElement;

export function applyTheme(theme) {
  const css = document.createElement('style');
  css.textContent = '*, *::before, *::after { transition: none !important; }';
  document.head.appendChild(css);

  root.setAttribute('data-theme', theme);
  Storage.set(STORAGE_KEYS.THEME, theme);

  const t = document.getElementById('settingsThemeToggle');
  if (t) t.checked = theme === 'dark';

  requestAnimationFrame(() => requestAnimationFrame(() => css.remove()));
}

// Застосовуємо збережену тему відразу (ДО першого малювання)
applyTheme(
  Storage.get(STORAGE_KEYS.THEME) ||
  (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
);
