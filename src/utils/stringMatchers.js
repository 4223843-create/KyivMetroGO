// ══ STRING MATCHERS ══
// Чисті функції для нечіткого пошуку. Нуль залежностей від DOM або стану додатку.
// Покриваються unit-тестами незалежно від будь-якого UI.

/**
 * Відстань Левенштейна між рядками a та b.
 * Одновимірний DP-масив для економії пам'яті.
 * Рання відмова: якщо різниця довжин > 3 — повертаємо 99 без обчислень.
 *
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
function levenshtein(a, b) {
  const la = a.length, lb = b.length;
  if (Math.abs(la - lb) > 3) return 99;
  let prev = Array.from({ length: lb + 1 }, (_, j) => j);
  for (let i = 1; i <= la; i++) {
    const curr = [i];
    for (let j = 1; j <= lb; j++) {
      curr[j] = a[i - 1] === b[j - 1]
        ? prev[j - 1]
        : 1 + Math.min(prev[j], curr[j - 1], prev[j - 1]);
    }
    prev = curr;
  }
  return prev[lb];
}

/**
 * Нечіткий збіг одного токена запиту з одним токеном індексу.
 * Спочатку — дешевий prefix-check; Левенштейн лише якщо prefix не спрацював.
 * Поріг: 1 правка для ≤5 символів, 2 — для довших.
 *
 * @param {string} query  — нормалізоване слово запиту
 * @param {string} token  — нормалізоване слово з пошукового індексу
 * @returns {boolean}
 */
export function fuzzyMatchToken(query, token) {
  if (token.startsWith(query)) return true;
  if (query.length < 4) return false;          // Короткі запити — тільки prefix
  const prefix    = token.slice(0, query.length + 1);
  const threshold = query.length <= 5 ? 1 : 2;
  return levenshtein(query, prefix) <= threshold;
}