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
