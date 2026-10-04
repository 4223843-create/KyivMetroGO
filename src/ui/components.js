// ══ UI-КОМПОНЕНТИ ══
// Чисті функції: string in → HTML string out. Нуль побічних ефектів.

import { Icons } from './icons.js';
import { LINE_COLOR } from '../core/constants.js';

// Колір лінії для елементів інтерфейсу (цифри на пілюлях, серце, шпильки,
// іконки картки станції): у світлій темі — темніший відтінок, бо колір лінії
// на сірому фоні має замалий контраст (styles.css: --line-*-text). У сховище
// (відмітки check-in) іде звичайний колір лінії, а не цей.
const PILL_TEXT_COLOR = Object.fromEntries(
  Object.entries(LINE_COLOR).map(([line, hex]) => [hex, `var(--line-${line}-text)`]),
);

/** Колір лінії для тексту й іконок з урахуванням теми. */
export const lineTextColor = color => PILL_TEXT_COLOR[color] || color;

/**
 * Пілюля «вагон / двері» у картці станції.
 */
export function pill(label, value, color) {
  return `<div class="pos-pill">
    <div class="pos-pill-label">${label}</div>
    <div class="pos-pill-num" style="color:${lineTextColor(color)}">${value}</div>
  </div>`;
}

/**
 * SVG-серце для кнопки Вибраного.
 */
export function heartSvg(isFav, _slug, lineColor) {
  const base = 'width="18" height="18" viewBox="-1 -1 19 19" xmlns="http://www.w3.org/2000/svg"';
  if (!isFav) {
    return `<svg ${base} fill="none" stroke="currentColor" stroke-width="1.3"><path d="${Icons.heartPath}"/></svg>`;
  }
  return `<svg ${base} fill="${lineTextColor(lineColor)}"><path d="${Icons.heartPath}"/></svg>`;
}
