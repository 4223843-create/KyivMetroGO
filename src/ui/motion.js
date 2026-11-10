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

const VIEWPORT_LOCKED = 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover';
const VIEWPORT_ZOOM   = 'width=device-width, initial-scale=1, viewport-fit=cover';

export function applyPageZoom() {
  document.querySelector('meta[name="viewport"]')
    ?.setAttribute('content', getPref('pageZoom') ? VIEWPORT_ZOOM : VIEWPORT_LOCKED);
}

export function setPageZoom(on) {
  setPref('pageZoom', on);
  applyPageZoom();
}
