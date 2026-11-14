// ══ ВИМКНУТИ АНІМАЦІЮ ══
// Клас reduce-motion на <html> прибирає переходи (styles.css, «ВИМКНУТИ АНІМАЦІЮ»).
// Поки людина не змінювала налаштування, воно стежить за системним.

import { getPref, setPref } from '../core/prefs.js';

const root = document.documentElement;
const media = window.matchMedia?.('(prefers-reduced-motion: reduce)');

export function applyReduceMotion() {
  root.classList.toggle('reduce-motion', getPref('reduceMotion'));
}

export function setReduceMotion(on) {
  setPref('reduceMotion', on);
  applyReduceMotion();
}

// Системне налаштування змінили під час роботи — getPref уже поверне нове значення
media?.addEventListener?.('change', applyReduceMotion);

// ══ ЗБІЛЬШЕННЯ СТОРІНКИ ДВОМА ПАЛЬЦЯМИ ══
// Типово заборонене (жести карти свої, сторінка не «їде» від випадкового щипка).
// Налаштування «Доступність → Збільшення двома пальцями» дозволяє його: для людей
// зі слабким зором, щоб збільшити текст картки. Над картою щипок і далі масштабує
// лише карту (touch-action: none у .map-viewport).
// Окрім meta viewport, щипок блокує touch-action: pan-x pan-y на html/body —
// тож коли збільшення увімкнене, клас html.page-zoom дозволяє його (styles/01-map.css).
// В APK WebView масштабує лише з android.zoomEnabled у capacitor.config.json.

const VIEWPORT_LOCKED = 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover';
const VIEWPORT_ZOOM   = 'width=device-width, initial-scale=1, viewport-fit=cover';

function _viewportMeta() {
  return document.querySelector('meta[name="viewport"]');
}

export function applyPageZoom() {
  const on = getPref('pageZoom');
  root.classList.toggle('page-zoom', on);
  _viewportMeta()?.setAttribute('content', on ? VIEWPORT_ZOOM : VIEWPORT_LOCKED);
}

/**
 * Повертає сторінку до звичайного масштабу, коли закрилися всі шторки:
 * над картою щипок масштабує карту, тож сама сторінка вже не зменшилася б.
 * Тимчасове maximum-scale=1 змушує браузер скинути масштаб.
 */
export function resetPageZoom() {
  if (!getPref('pageZoom')) return;
  const vv = window.visualViewport;
  if (vv && vv.scale <= 1.01) return;
  const meta = _viewportMeta();
  if (!meta) return;
  meta.setAttribute('content', VIEWPORT_LOCKED);
  setTimeout(applyPageZoom, 300);
}

export function setPageZoom(on) {
  setPref('pageZoom', on);
  applyPageZoom();
}
