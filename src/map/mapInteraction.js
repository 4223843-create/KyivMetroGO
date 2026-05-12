// ══ ВЗАЄМОДІЯ З КАРТОЮ: КЛІК / КЛАВІАТУРА / HEATMAP ══

import { state }      from '../core/state.js';
import { getCheckins } from '../features/checkin.js';

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

// залежно від того, чи є у користувача хоча б один чекін на цій станції.
export function syncMapWithCheckins() {
  if (!inner || !state.stationsData) return;

  const checkins     = getCheckins();
  const visitedSlugs = new Set();
  for (const entry of Object.values(checkins)) {
    if (entry.slug) visitedSlugs.add(entry.slug);
  }

  inner.querySelectorAll('[id]').forEach(el => {
    const rawId = el.id.replace(/\d+$/, '').toLowerCase();
    const slug  = MetroApp.SLUG_BY_LOWER?.[rawId];
    if (!slug) return;
    el.classList.toggle('is-visited', visitedSlugs.has(slug));
  });
}

MetroApp.syncMapWithCheckins = syncMapWithCheckins;
