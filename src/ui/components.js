// ══ UI-КОМПОНЕНТИ ══
// Чисті функції: string in → HTML string out. Нуль побічних ефектів.
// Раніше були в ui.js разом з анімаціями, confirm, swipe, system APIs.

import { Icons } from './icons.js';

/**
 * Пілюля «вагон / двері» у картці станції.
 */
export function pill(label, value, color) {
  return `<div class="pos-pill">
    <div class="pos-pill-label">${label}</div>
    <div class="pos-pill-num" style="color:${color}">${value}</div>
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
  return `<svg ${base} fill="${lineColor}"><path d="${Icons.heartPath}"/></svg>`;
}
