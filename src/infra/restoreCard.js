// ══ ПОВЕРНЕННЯ ВІДКРИТОЇ КАРТКИ ПІСЛЯ ПЕРЕЗАПУСКУ ══
// Коли застосунок у фоні, телефон може вивантажити його з пам'яті (Android —
// процес WebView, iPhone — сторінку PWA). Повернення тоді — це холодний старт:
// карта або «Вибране», а відкрита картка станції зникає. Для людини це
// виглядає як самовільне перезавантаження.
//
// Тому в момент переходу у фон запам'ятовуємо відкриту картку (станцію і
// прокрутку), а на старті, якщо з того моменту минуло небагато часу,
// відкриваємо її знову. Запис одноразовий: прочитали — видалили.
// localStorage, а не Storage: потрібен синхронний запис у мить згортання.

import { state } from '../core/state.js';

const KEY        = 'metro_restore_card';
const MAX_AGE_MS = 30 * 60 * 1000;

function _snapshot() {
  try {
    const sheet = document.getElementById('stationSheet');
    const slug  = sheet?.classList.contains('sheet-open') ? state.currentStationSlug : null;
    if (!slug) { localStorage.removeItem(KEY); return; }
    const scroll = document.getElementById('sheetBody')?.scrollTop || 0;
    localStorage.setItem(KEY, JSON.stringify({ slug, scroll, t: Date.now() }));
  } catch { /* сховище недоступне — просто не відновимо */ }
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') _snapshot();
});
window.addEventListener('pagehide', _snapshot);

/**
 * Забирає збережену картку (одноразово).
 * @returns {{ slug: string, scroll: number } | null} — якщо з моменту згортання минуло ≤ 30 хв
 */
export function takeCardToRestore() {
  try {
    const raw = localStorage.getItem(KEY);
    localStorage.removeItem(KEY);
    if (!raw) return null;
    const { slug, scroll, t } = JSON.parse(raw);
    const age = Date.now() - t;
    if (typeof slug !== 'string' || !(age >= 0 && age <= MAX_AGE_MS)) return null;
    return { slug, scroll: Number(scroll) || 0 };
  } catch {
    return null;
  }
}
