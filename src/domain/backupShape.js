// ══ ФОРМА ДАНИХ РЕЗЕРВНОЇ КОПІЇ ══
// Чиста логіка без сховища й UI: перевірка, що в копії немає чужого тексту там,
// де застосунок чекає лише цифри.

/** Вагон і двері в правках — лише цифри, коми, пробіли й тире («2», «1–3», «4, 5»). */
const WAGON_DOORS_RE = /^[\d\s,\-–]*$/;

/**
 * Правки з резервної копії: { slug: { key: { wagon, doors, … } } }.
 * Значення вагона й дверей ідуть у розмітку картки, тож чужий текст у них не пускаємо.
 * @param {unknown} raw — рядок JSON зі сховища або вже розібраний обʼєкт
 */
export function localEditsLookValid(raw) {
  if (raw === undefined || raw === null) return true;
  let edits = raw;
  if (typeof raw === 'string') {
    try { edits = JSON.parse(raw); } catch { return false; }
  }
  if (!edits || typeof edits !== 'object' || Array.isArray(edits)) return false;
  for (const byKey of Object.values(edits)) {
    if (!byKey || typeof byKey !== 'object') return false;
    for (const edit of Object.values(byKey)) {
      if (!edit || typeof edit !== 'object') return false;
      for (const field of ['wagon', 'doors']) {
        if (edit[field] !== undefined && !WAGON_DOORS_RE.test(String(edit[field]))) return false;
      }
    }
  }
  return true;
}
