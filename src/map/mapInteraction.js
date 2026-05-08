// ══ ВЗАЄМОДІЯ З КАРТОЮ: КЛІК / КЛАВІАТУРА ══
// Раніше в map.js. Тепер: ізольований обробник.
// Єдина залежність від бізнес-логіки — SLUG_BY_LOWER і openStation через MetroApp.

import { state } from '../core/state.js';

const inner = document.getElementById('mapInner');

export function handleMapInteraction(e) {
  if (!state.stationsData) return;
  if (e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ') return;

  const zone  = e.target.closest('[id]');
  if (!zone?.id) return;

  const rawId = zone.id.replace(/\d+$/, '').toLowerCase();
  const slug  = MetroApp.SLUG_BY_LOWER[rawId];
  if (slug) { e.preventDefault(); MetroApp.openStation?.(slug); }
}

inner.addEventListener('click',   handleMapInteraction);
inner.addEventListener('keydown', handleMapInteraction);
