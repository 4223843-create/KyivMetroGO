// ══ УТИЛІТИ ФІДБЕКУ ══
// Чисті функції без побічних ефектів. Легко тестувати окремо.

/**
 * Повертає список сусідніх дверей відносно поточної позиції.
 * Сусіди — це двері d±1 у тому самому вагоні,
 * або перша/остання двері наступного/попереднього вагона на стику.
 *
 * @param {number} w — номер вагона (1–5)
 * @param {number} d — номер дверей (1–4)
 * @returns {{ w:number, d:number }[]}
 */
export function getAdjacentDoors(w, d) {
  const adj = [];
  if (d > 1) adj.push({ w, d: d - 1 });
  if (d < 4) adj.push({ w, d: d + 1 });
  if (d === 4 && w < 5) adj.push({ w: w + 1, d: 1 });
  if (d === 1 && w > 1) adj.push({ w: w - 1, d: 4 });
  return adj;
}

/**
 * Повертає протилежну позицію у поїзді (дзеркально по осі вагонів і дверей).
 * Використовується для автозаповнення «нового виходу» у формі фідбеку.
 *
 * @param {number|string} w
 * @param {number|string} d
 * @returns {{ w:number, d:number }}
 */
export function getOppositeDoors(w, d) {
  return { w: 6 - parseInt(w), d: 5 - parseInt(d) };
}

/**
 * Розбирає сирі рядкові значення вагона/дверей у структуровану форму.
 * Підтримує три формати:
 *   - "1" / "2"   → одиночна позиція
 *   - "1,2" / "2,1" → дві окремі позиції (різні вагони або двері)
 *   - "1-3"        → діапазон дверей (1..3, до 3 позицій)
 *
 * @param {string} rawW — сирий рядок вагона
 * @param {string} rawD — сирий рядок дверей
 * @returns {{ wMain:number, dMain:number, wEx:number|string, dEx:number|string,
 *             wEx2:number|string, dEx2:number|string, hasExtra:boolean, hasThird:boolean }}
 */
export function parseDoorValues(rawW, rawD) {
  const rD = String(rawD), rW = String(rawW);
  let wMain = parseInt(rW) || 1, dMain = parseInt(rD) || 1;
  let wEx = '-', dEx = '-', wEx2 = '-', dEx2 = '-';
  let hasExtra = false, hasThird = false;

  if (rD.includes(',')) {
    hasExtra = true;
    const wParts = rW.split(','), dParts = rD.split(',');
    wMain = parseInt(wParts[0]); dMain = parseInt(dParts[0]);
    wEx   = parseInt(wParts[1]); dEx   = parseInt(dParts[1]);
  } else if (rD.includes('-')) {
    const [d1, d2] = rD.split('-').map(Number);
    wMain = parseInt(rW); dMain = d1; wEx = wMain; dEx = d2; hasExtra = true;
    if (d2 - d1 >= 2) { hasThird = true; wEx2 = wMain; dEx2 = d2; dEx = d1 + 1; }
  }
  return { wMain, dMain, wEx, dEx, wEx2, dEx2, hasExtra, hasThird };
}

/**
 * Обчислює фінальні рядкові значення вагона та дверей зі стану fbState.
 * Повертає null якщо вихід закритий (isClosed).
 * Нормалізує: одиночна позиція → "1"/"2", діапазон → "1-3", пара → "1, 2"/"3, 4".
 *
 * @param {{ wMain:number, dMain:number, wEx:*, dEx:*, wEx2:*, dEx2:*, isClosed:boolean }} stateObj
 * @returns {{ finalW:string, finalD:string }|null}
 */
export function extractFinalValues(stateObj) {
  if (!stateObj || stateObj.isClosed) return null;
  let finalW = String(stateObj.wMain), finalD = String(stateObj.dMain);
  const hasEx  = stateObj.wEx !== '-' && stateObj.dEx !== '-';
  const hasEx2 = stateObj.wEx2 !== '-' && stateObj.dEx2 !== '-';

  if (hasEx && hasEx2) {
    const doors = [parseInt(finalD), parseInt(stateObj.dEx), parseInt(stateObj.dEx2)].sort((a,b) => a-b);
    finalD = `${doors[0]}-${doors[2]}`;
  } else if (hasEx) {
    const exW = String(stateObj.wEx), exD = String(stateObj.dEx);
    if (finalW === exW) {
      const d1 = Math.min(parseInt(finalD), parseInt(exD));
      const d2 = Math.max(parseInt(finalD), parseInt(exD));
      finalD = `${d1}-${d2}`;
    } else {
      const [w1, w2] = [parseInt(finalW), parseInt(exW)];
      const [door1, door2] = [parseInt(finalD), parseInt(exD)];
      finalW = w1 < w2 ? `${w1}, ${w2}` : `${w2}, ${w1}`;
      finalD = w1 < w2 ? `${door1}, ${door2}` : `${door2}, ${door1}`;
    }
  }
  return { finalW, finalD };
}

/**
 * Формує текстовий рядок зміни для відображення у dev-логу та Formspree.
 *
 * @param {{ dir:string, exit:string, wagon:string, doors:string }} p — оригінальна позиція
 * @param {string}  nw     — нове значення вагона
 * @param {string}  nd     — нове значення дверей
 * @param {boolean} closed — true якщо вихід позначено як закритий
 * @returns {string}
 */
export function buildChangeText(p, nw, nd, closed) {
  const loc = [p.dir, p.exit].filter(Boolean).join(' · ');
  if (closed) return `${loc}: ВИХІД ЗАКРИТО`;
  const parts = [];
  if (nw !== p.wagon) parts.push(`вагон ${p.wagon}→${nw}`);
  if (nd !== p.doors) parts.push(`двері ${p.doors}→${nd}`);
  return `${loc}: ${parts.join(', ')}`;
}
