// ══ ПЕРЕВЕДЕННЯ СТАРИХ ЗАПИСІВ НА ID ПОЗИЦІЙ ══
// До появи id у stations.json вибране й чекіни зберігали вихід як
// «напрямок (текст) + вагон + двері». Тут такий запис один раз зіставляється
// з позицією в поточних даних; далі записи живуть лише за id.

import { traversePositions, positionId, displayDirOf } from './positions.js';

// Порівнюємо напрямки без регістру, пробілів, &nbsp; і розділових знаків
const dirToken = s => String(s ?? '')
  .toLowerCase()
  .replace(/&nbsp;| | | /g, ' ')
  .replace(/[^a-z0-9а-яіїєґ]/g, '');

const same = (a, b) => String(a ?? '').trim() === String(b ?? '').trim();

// «1-3» → [1,2,3], «1, 2» → [1,2]
function tokens(value) {
  const str = String(value ?? '');
  if (str.includes('-')) {
    const [start, end] = str.split('-').map(Number);
    const out = [];
    for (let i = start; i <= end; i++) out.push(i);
    return out;
  }
  return str.split(',').map(x => parseInt(x.trim(), 10)).filter(Boolean);
}
const overlaps = (a, b) => tokens(a).some(n => tokens(b).includes(n));

/**
 * id позиції станції, що відповідає старому запису, або null.
 * @param {object} station
 * @param {{ dir?: string, wagon: string, doors: string }} record
 */
export function matchLegacyPosition(station, { dir, wagon, doors }) {
  if (!station) return null;
  const all = [];
  traversePositions(station, ctx => all.push(ctx));
  const wanted = dirToken(dir);
  const inDir = all.filter(({ dir: d }) =>
    dirToken(displayDirOf(d)) === wanted || dirToken(d.from) === wanted);

  const exact = list => list.find(({ position: p }) => same(p.wagon, wagon) && same(p.doors, doors));
  const loose = list => list.find(({ position: p }) => overlaps(p.wagon, wagon) && overlaps(p.doors, doors));

  // Спершу в тому самому напрямку; потім точний збіг, якщо він на станції один;
  // наостанок — перетин номерів (запис з діапазоном «1-3» тощо).
  const exactAll = all.filter(({ position: p }) => same(p.wagon, wagon) && same(p.doors, doors));
  const hit = exact(inDir)
    ?? (exactAll.length === 1 ? exactAll[0] : null)
    ?? loose(inDir)
    ?? exactAll[0]
    ?? loose(all);
  return hit ? positionId(hit.position) : null;
}
