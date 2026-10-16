// ══ FEATURE: ПОШУК ЗА АДРЕСОЮ → НАЙБЛИЖЧІ СТАНЦІЇ ПІШКИ ══
// Дані — public/addresses.json (scripts/build-addresses.py): адреси з ГІС Києва,
// відстані — пішохідним маршрутом по мережі OSM. Для кожного будинку 3 найближчі
// станції з номером виходу; для кожної вулиці — станції вздовж неї.
// Файл вантажиться лише при першому пошуку; у PWA він у precache, в APK — у збірці.
//
// Публічне API:
//   addressResultsHtml(query, lineFilter, onLoaded) → string ('' — нічого)

import { state } from '../core/state.js';
import { LINE_COLOR } from '../core/constants.js';
import { lineTextColor } from '../ui/components.js';
import { escapeHtml } from '../ui/html.js';
import { searchTokens, queryWordsForExits } from '../data/exitSearch.js';

const MAX_BLOCKS     = 3;    // скільки адрес / вулиць показувати розгорнуто
const MAX_STREETS    = 6;    // скільки вулиць показувати списком
const WALK_M_PER_MIN = 75;   // ~4,5 км/год

let _data    = null;   // { exits, streets: [...], dupNames: Set }
let _loading = null;

function _url() {
  const { origin, pathname } = window.location;
  const dir = pathname.endsWith('/') ? pathname : pathname.slice(0, pathname.lastIndexOf('/') + 1);
  return new URL('addresses.json', origin + dir);
}

function _load(onLoaded) {
  if (_loading) return;
  _loading = fetch(_url())
    .then(r => (r.ok ? r.json() : null))
    .then(json => {
      if (json?.schema !== 2 || !json.streets) return;
      const seen = new Set();
      const dupNames = new Set();
      // alias — інша назва з реєстру («Проєктна 13141» для «вулиця Дмитрівська»)
      const streets = json.streets.map(([name, district, rawHouses, rawParts, alias = '']) => {
        if (seen.has(name)) dupNames.add(name);
        seen.add(name);
        return { name, district, rawHouses, rawParts, tokens: searchTokens(`${name} ${alias}`) };
      });
      _data = { exits: json.exits, streets, dupNames };
      onLoaded?.();
    })
    .catch(() => { _loading = null; });   // наступний пошук спробує ще раз
}

// «5-А» → «5а», «20-22» лишається (дефіс між цифрами — діапазон)
const _normHouse = h => h.toLowerCase().replace(/\s/g, '').replace(/-(?=\D)/g, '');
const _lead      = h => parseInt(h, 10) || 0;

function _houses(street) {
  if (!street.houses) {
    street.houses = street.rawHouses ? street.rawHouses.split('|').map(entry => {
      const p = entry.split(' ');
      const near = [];
      for (let i = 1; i + 1 < p.length; i += 2) near.push({ exit: +p[i], m: +p[i + 1] * 10 });
      return { house: p[0], key: _normHouse(p[0]), lead: _lead(p[0]), near };
    }) : [];
  }
  return street.houses;
}

function _parts(street) {
  if (!street.parts) {
    street.parts = street.rawParts ? street.rawParts.split('|').map(entry => {
      const [exit, d, first, last] = entry.split(' ');
      return { exit: +exit, m: +d * 10, first, last };
    }) : [];
  }
  return street.parts;
}

function _distText(m) {
  const dist = m < 1000 ? `${m} м` : `${(m / 1000).toFixed(1).replace('.', ',')} км`;
  return `${dist} · ${Math.max(1, Math.round(m / WALK_M_PER_MIN))} хв`;
}

function _streetTitle(street) {
  const name = escapeHtml(street.name);
  return _data.dupNames.has(street.name) && street.district
    ? `${name} <span class="search-addr-district">${escapeHtml(street.district)}</span>`
    : name;
}

function _stationRow(exit, hint, lineFilter) {
  const [slug, num] = _data.exits[exit] ?? [];
  const s = state.stationsData?.[slug];
  if (!s || (lineFilter.size && !lineFilter.has(s.line))) return '';
  const color = lineTextColor(LINE_COLOR[s.line]);
  return `<div class="search-item search-addr-station" data-slug="${s.slug}">
    <div class="search-item-line" style="background-color:${color}"></div>
    <div class="search-item-text"><span>${s.name}</span><span class="search-item-hint">вихід ${escapeHtml(num)} · ${hint}</span></div>
  </div>`;
}

function _block(title, note, rows) {
  if (!rows) return '';
  const noteHtml = note ? `<div class="search-addr-note">${note}</div>` : '';
  return `<div class="search-addr">
    <div class="search-addr-title">${title}</div>${noteHtml}
    ${rows}
  </div>`;
}

/** Будинок: 3 найближчі станції. */
function _houseBlock(street, house, lineFilter, note = '', titleHouse = house.house) {
  const rows = house.near.map(n => _stationRow(n.exit, _distText(n.m), lineFilter)).join('');
  return _block(`${_streetTitle(street)}, ${escapeHtml(titleHouse)}`, note, rows);
}

/** Вулиця без номера: станції вздовж неї з діапазонами будинків. */
function _streetBlock(street, lineFilter, title = _streetTitle(street), note = '') {
  const rows = _parts(street).map(p => {
    const range = !p.first ? ''
      : p.first === p.last ? `буд. ${escapeHtml(p.first)} · ` : `буд. ${escapeHtml(p.first)}–${escapeHtml(p.last)} · `;
    return _stationRow(p.exit, `${range}від ${_distText(p.m)}`, lineFilter);
  }).join('');
  return _block(title, note, rows);
}

function _streetRow(street, hint) {
  return `<div class="search-addr-street" data-fill="${escapeHtml(street.name)} ">
    <span>${_streetTitle(street)}</span><span class="search-item-hint">${hint}</span>
  </div>`;
}

/**
 * Найближчий будинок з того самого боку вулиці (парні до парних, непарні до
 * непарних); якщо такого боку в базі немає — будь-який найближчий за номером.
 */
function _nearestHouse(houses, lead) {
  let best = null;
  let bestScore = Infinity;
  for (const h of houses) {
    if (!h.lead) continue;
    const score = Math.abs(h.lead - lead) + (h.lead % 2 === lead % 2 ? 0 : 1e6);
    if (score < bestScore) { best = h; bestScore = score; }
  }
  return best;
}

function _houseResults(street, houseQuery, lineFilter) {
  const houses = _houses(street);
  if (!houses.length) {
    return [_streetBlock(street, lineFilter, `${_streetTitle(street)}, ${escapeHtml(houseQuery)}`,
      'будинків цієї вулиці немає в базі — станції біля вулиці')];
  }
  const key   = _normHouse(houseQuery);
  const exact = houses.filter(h => h.key === key);
  if (exact.length) return exact.map(h => _houseBlock(street, h, lineFilter));

  // «5» → 5-А, 5-Б…; «24/» → 24/1…
  const variants = houses.filter(h => h.key.startsWith(key) && h.lead === _lead(key));
  if (variants.length) return variants.map(h => _houseBlock(street, h, lineFilter));

  const lead = _lead(key);
  const near = lead ? _nearestHouse(houses, lead) : null;
  if (!near) return [];
  return [_houseBlock(street, near, lineFilter,
    `будинку ${escapeHtml(houseQuery)} немає в базі — як для сусіднього буд. ${escapeHtml(near.house)}`,
    houseQuery)];
}

/**
 * HTML блоку «Адреси» для запиту, або '' якщо збігів немає / дані ще вантажаться.
 * @param {string}      query
 * @param {Set<string>} lineFilter
 * @param {() => void}  onLoaded — викликається, коли дані завантажились (перемалювати)
 */
export function addressResultsHtml(query, lineFilter, onLoaded) {
  const words = searchTokens(query);
  if (!words.length || query.trim().length < 3) return '';
  if (!_data) { _load(onLoaded); return ''; }

  // Номер будинку — останнє слово, що починається з цифри (якщо є ще й вулиця)
  let houseQuery = null;
  let lastNum = -1;
  words.forEach((w, i) => { if (/^\d/.test(w)) lastNum = i; });
  if (lastNum > 0) {
    houseQuery = words[lastNum];
    words.splice(lastNum, 1);
  }
  const streetWords = queryWordsForExits(words.join(' '));
  if (!streetWords.length) return '';

  const streets = _data.streets.filter(st =>
    streetWords.every(q => st.tokens.some(t => t.startsWith(q))));
  if (!streets.length) return '';

  let blocks = [];
  if (houseQuery) {
    for (const st of streets) {
      blocks.push(..._houseResults(st, houseQuery, lineFilter).filter(Boolean));
      if (blocks.length >= MAX_BLOCKS) break;
    }
    blocks = blocks.slice(0, MAX_BLOCKS);
  } else if (streets.length <= MAX_BLOCKS) {
    blocks = streets.map(st => _streetBlock(st, lineFilter)).filter(Boolean);
  }

  const html = blocks.length
    ? blocks.join('')
    : streets.slice(0, MAX_STREETS).map(st => _streetRow(st, 'введіть номер будинку')).join('');

  return `<div class="search-section-title">Адреси</div>${html}`;
}
