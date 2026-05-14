// ══ УТИЛІТИ ФІДБЕКУ ══
// Чисті функції без побічних ефектів. Легко тестувати окремо.

export function getAdjacentDoors(w, d) {
  const adj = [];
  if (d > 1) adj.push({ w, d: d - 1 });
  if (d < 4) adj.push({ w, d: d + 1 });
  if (d === 4 && w < 5) adj.push({ w: w + 1, d: 1 });
  if (d === 1 && w > 1) adj.push({ w: w - 1, d: 4 });
  return adj;
}

export function getOppositeDoors(w, d) {
  return { w: 6 - parseInt(w), d: 5 - parseInt(d) };
}

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

export function buildChangeText(p, nw, nd, closed) {
  const loc = [p.dir, p.exit].filter(Boolean).join(' · ');
  if (closed) return `${loc}: ВИХІД ЗАКРИТО`;
  const parts = [];
  if (nw !== p.wagon) parts.push(`вагон ${p.wagon}→${nw}`);
  if (nd !== p.doors) parts.push(`двері ${p.doors}→${nd}`);
  return `${loc}: ${parts.join(', ')}`;
}