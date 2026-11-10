// ══ ЕКРАН ПОМИЛКИ ЗАПУСКУ ══
// Показується, коли bootstrap() у main.js упав. Застосунок працює офлайн, тож
// «перевірте інтернет» тут майже завжди хибна порада: причина зазвичай у коді
// чи пошкоджених даних на пристрої. Людина може одним дотиком надіслати звіт
// (текст помилки + версія збірки й даних) у форму «Повідомити про помилку».

import { Capacitor }        from '@capacitor/core';
import { FORM_BUG_REPORTS } from '../core/forms.js';

/* global __BUILD_DATE__ */
const BUILD = typeof __BUILD_DATE__ !== 'undefined' ? __BUILD_DATE__ : 'dev';

/** Текст звіту: помилка, збірка, дані, платформа. Без жодних даних людини. */
export function startupErrorReport(err, dataVersion) {
  const text = String(err?.stack || err?.message || err || 'невідома помилка').slice(0, 4000);
  const built = Number(BUILD) ? new Date(Number(BUILD)).toISOString() : BUILD;
  return [
    'Збій запуску',
    `Збірка: ${built}`,
    `Дані: ${dataVersion || 'не завантажено'}`,
    `Платформа: ${Capacitor.getPlatform()}`,
    '',
    text,
  ].join('\n');
}

/**
 * @param {unknown} err
 * @param {number}  [dataVersion]
 */
export function showStartupError(err, dataVersion) {
  const report = startupErrorReport(err, dataVersion);
  const box = document.createElement('div');
  box.setAttribute('role', 'alertdialog');
  box.setAttribute('aria-labelledby', 'startupErrorTitle');
  box.style.cssText =
    'position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;' +
    'justify-content:center;gap:12px;padding:32px;background:var(--bg,#0e0e0f);' +
    'color:var(--text,#e8e6e3);font-family:system-ui,sans-serif;text-align:center;z-index:9999';
  const btn = 'flex:1 1 0;min-width:0;padding:12px 16px;border-radius:8px;border:none;font-size:1rem;cursor:pointer';
  box.innerHTML =
    '<span style="font-size:2rem" aria-hidden="true">⚠️</span>' +
    '<strong id="startupErrorTitle" style="font-size:1.1rem">Не вдалося запустити застосунок</strong>' +
    '<p style="font-size:.9rem;opacity:.7;max-width:320px;margin:0">' +
    'Спробуйте ще раз. Якщо не допоможе, надішліть звіт, і ми розберемося</p>' +
    '<div style="display:flex;gap:10px;width:100%;max-width:340px;margin-top:8px">' +
    `<button type="button" data-act="retry" style="${btn};background:#c8523a;color:#fff">Спробувати ще раз</button>` +
    `<button type="button" data-act="report" style="${btn};background:#3a3a3c;color:#fff">Надіслати звіт</button>` +
    '</div>' +
    '<p data-role="status" style="font-size:.85rem;min-height:1.2em;margin:0" aria-live="polite"></p>';

  const status    = box.querySelector('[data-role="status"]');
  const reportBtn = box.querySelector('[data-act="report"]');
  box.querySelector('[data-act="retry"]').addEventListener('click', () => location.reload());
  reportBtn.addEventListener('click', async () => {
    reportBtn.disabled = true;
    status.textContent = 'Надсилання…';
    try {
      const res = await fetch(FORM_BUG_REPORTS, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body:    JSON.stringify({ _subject: 'KyivMetroGO: збій запуску', message: report }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      status.textContent = '✓ Звіт надіслано, дякуємо';
    } catch {
      reportBtn.disabled = false;
      status.textContent = navigator.onLine
        ? 'Не вдалося надіслати. Спробуйте пізніше'
        : 'Для звіту потрібен інтернет';
    }
  });
  document.body.appendChild(box);
}
