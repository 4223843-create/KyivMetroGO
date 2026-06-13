// ══ УПРАВЛІННЯ ТЕМОЮ ОФОРМЛЕННЯ ══
// Підтримує три варіанти: 'light', 'dark', 'system'.
// Перемикання без перехідної анімації (transition: none на час зміни атрибута).

import { STORAGE_KEYS, Storage } from '../core/storage.js';

const root = document.documentElement;

/**
 * Застосовує тему оформлення та опціонально зберігає вибір у Storage.
 * Перемикання відбувається миттєво (без CSS-переходу) через тимчасовий <style>.
 *
 * @param {'light'|'dark'|'system'|string} preference — значення теми
 * @param {boolean} [save=true] — чи зберігати у Storage
 */
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
  root.style.colorScheme = actualTheme;
  if (save) {
    Storage.set(STORAGE_KEYS.THEME, pref);
  }

  document.querySelectorAll('#settingsThemeSeg .settings-seg-btn').forEach(btn => {
    btn.classList.toggle('is-active', btn.dataset.themeVal === pref);
  });

  requestAnimationFrame(() => requestAnimationFrame(() => css.remove()));
}

window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  const pref = Storage.get(STORAGE_KEYS.THEME) || 'system';
  if (pref === 'system') applyTheme('system', false);
});