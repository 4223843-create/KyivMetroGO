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

export function syncMapWithCheckins() {
  if (!inner || !state.stationsData) return;

  const checkins     = getCheckins();
  const visitedSlugs = new Set();
  
  for (const entry of Object.values(checkins)) {
    if (entry.slug) visitedSlugs.add(entry.slug);
  }

  // Очищаємо текст від пробілів та переносів для ідеального порівняння
  const visitedNames = Array.from(visitedSlugs).map(slug => {
    return state.stationsData[slug]?.name?.replace(/[\s\n\r]/g, '').toLowerCase();
  }).filter(Boolean);

  // 1. Очищаємо всі старі підсвітки
  inner.querySelectorAll('.station-checked-in, .is-visited').forEach(el => {
    el.classList.remove('station-checked-in', 'is-visited');
  });

  // 2. Стара логіка (якщо треба підсвічувати самі блоки)
  inner.querySelectorAll('[id]').forEach(el => {
    const rawId = el.id.replace(/\d+$/, '').toLowerCase();
    const slug  = MetroApp.SLUG_BY_LOWER?.[rawId];
    if (slug && visitedSlugs.has(slug)) {
      el.classList.add('is-visited');
    }
  });

  // 3. БРОНЕБІЙНИЙ ПОШУК ТЕКСТУ
  inner.querySelectorAll('text').forEach(txt => {
    const cleanText = txt.textContent.replace(/[\s\n\r]/g, '').toLowerCase();
    
    // Перевіряємо, чи входить знайдений текст у список відвіданих
    const isMatch = visitedNames.some(name => cleanText.includes(name) || name.includes(cleanText));

    if (isMatch && cleanText.length > 2) {
      txt.classList.add('station-checked-in');
      // Додаємо клас також до всіх шматочків тексту (tspan) всередині
      txt.querySelectorAll('tspan').forEach(tspan => tspan.classList.add('station-checked-in'));
    }
  });
}

MetroApp.syncMapWithCheckins = syncMapWithCheckins;