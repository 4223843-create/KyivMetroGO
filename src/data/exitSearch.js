// ══ ПОШУК ЗА ВИХОДАМИ: підписи й вулиці ══
// Чисті функції без DOM і state: індекс будується в hydrateStations
// (data/stations.js), збіг шукає features/search.js.
//
// Запис індексу — один рядок, який людина бачить на картці станції:
// підпис виходу («ТЦ Dream berry») або рядок опису номерного виходу
// («просп. Миколи Бажана, 8»). Кожен рядок пам'ятає номери виходів,
// щоб у результатах показати «вихід 3 · просп. Бажана, 36».

// Слова-типи вулиць: у запиті необов'язкові («вул саксаганського»,
// «бажана проспект»), але якщо запит лише з них — шукаємо як є.
const STREET_TYPE_WORDS = new Set([
  'вул', 'вулиця', 'вулиці', 'просп', 'проспект', 'пр', 'пл', 'площа',
  'бульв', 'бульвар', 'пров', 'провулок', 'узвіз', 'шосе', 'наб',
  'набережна', 'проїзд', 'ст', 'м',
]);

/** Нормалізує рядок для пошуку: нижній регістр, без розмітки й апострофів. */
export function normalizeSearchText(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/<br\s*\/?>/g, ' ')
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/[''`ʼ’]/g, '')
    .replace(/[„“”"«».,!?;:()[\]№—–]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Розбиває нормалізований рядок на слова (від 1 символу: «9», «а»). */
export function searchTokens(text) {
  return normalizeSearchText(text).split(' ').filter(Boolean);
}

/** Слова запиту без типів вулиць (якщо після цього щось лишається). */
export function queryWordsForExits(query) {
  const words = searchTokens(query);
  const meaningful = words.filter(w => !STREET_TYPE_WORDS.has(w));
  return meaningful.length ? meaningful : words;
}

// Рядок з самих емодзі / службових позначок («[4-12 виходи]») не шукаємо
const _hasLetters = line => /[\p{L}\d]/u.test(line.replace(/\[[^\]]*\]/g, ''));

function _cleanLine(line) {
  return line
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/\[[^\]]*\]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Будує індекс виходів станції після розгортання exits_catalog.
 * @param {object} station — станція з directions[].exits[] (label, exit_numbers)
 * @returns {Array<{ text: string, nums: string[], tokens: string[] }>}
 */
export function buildExitSearchIndex(station) {
  const byText = new Map();
  const add = (rawLine, num) => {
    const text = _cleanLine(rawLine);
    if (!text || !_hasLetters(text)) return;
    let entry = byText.get(text);
    if (!entry) {
      entry = { text, nums: [], tokens: searchTokens(text) };
      if (!entry.tokens.length) return;
      byText.set(text, entry);
    }
    if (num && !entry.nums.includes(num)) entry.nums.push(num);
  };

  (station.directions || []).forEach(dir => {
    (dir.exits || []).forEach(ex => {
      if (ex.label) add(ex.label, null);
      (ex.exit_numbers || []).forEach(n => {
        String(n.text ?? '').split(/<br\s*\/?>/i).forEach(line => add(line, n.num));
      });
    });
  });

  return [...byText.values()];
}

/**
 * Перший запис індексу, у якому кожне слово запиту — початок якогось слова.
 * @returns {{ text: string, nums: string[] } | null}
 */
export function matchExitSearch(index, queryWords) {
  if (!index?.length || !queryWords.length) return null;
  return index.find(entry =>
    queryWords.every(q => entry.tokens.some(tok => tok.startsWith(q)))
  ) ?? null;
}

/** Підказка в результатах: «вихід 3 · просп. Бажана, 36» або сам підпис. */
export function exitHintText(entry) {
  if (!entry) return '';
  const nums = [...entry.nums].sort((a, b) => (parseInt(a, 10) || 0) - (parseInt(b, 10) || 0));
  if (!nums.length) return entry.text;
  return `${nums.length > 1 ? 'виходи' : 'вихід'} ${nums.join(', ')} · ${entry.text}`;
}
