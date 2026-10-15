// ══ FEATURE: ПОШУК ЗА АДРЕСОЮ → НАЙБЛИЖЧІ СТАНЦІЇ ПІШКИ ══
// Дані — public/addresses.json (scripts/build-addresses.py, OSM): для кожного
// будинку 3 найближчі станції за пішохідним маршрутом і номер виходу.
// Файл вантажиться лише при першому пошуку; у PWA він у precache, в APK — у збірці.
//
// Публічне API:
//   addressResultsHtml(query, lineFilter, onLoaded) → string ('' — нічого)

import { state } from '../core/state.js';
import { LINE_COLOR } from '../core/constants.js';
import { lineTextColor } from '../ui/components.js';
import { escapeHtml } from '../ui/html.js';
import { searchTokens, queryWordsForExits } from '../data/exitSearch.js';

const MAX_STREETS   = 5;
const MAX_HOUSES    = 3;
const WALK_M_PER_MIN = 75;   // ~4,5 км/год

let _data    = null;   // { exits, streets: [{ name, tokens, raw, houses? }] }
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
      if (!json?.streets) return;
      _data = {
        exits: json.exits,
        streets: json.streets.map(([name, raw]) => ({ name, raw, tokens: searchTokens(name) })),
      };
      onLoaded?.();
    })
    .catch(() => { _loading = null; });   // наступний пошук спробує ще раз
}

const _normHouse = h => h.toLowerCase().replace(/[\s-]/g, '');

function _houses(street) {
  if (!street.houses) {
    street.houses = street.raw.split('|').map(entry => {
      const p = entry.split(' ');
      const near = [];
      for (let i = 1; i + 1 < p.length; i += 2) near.push({ exit: +p[i], m: +p[i + 1] * 10 });
      return { house: p[0], key: _normHouse(p[0]), near };
    });
  }
  return street.houses;
}

function _distText(m) {
  const dist = m < 1000 ? `${m} м` : `${(m / 1000).toFixed(1).replace('.', ',')} км`;
  return `${dist} · ${Math.max(1, Math.round(m / WALK_M_PER_MIN))} хв`;
}

function _stationRow({ exit, m }, lineFilter) {
  const [slug, num] = _data.exits[exit] ?? [];
  const s = state.stationsData?.[slug];
  if (!s || (lineFilter.size && !lineFilter.has(s.line))) return '';
  const color = lineTextColor(LINE_COLOR[s.line]);
  return `<div class="search-item search-addr-station" data-slug="${s.slug}">
    <div class="search-item-line" style="background-color:${color}"></div>
    <div class="search-item-text"><span>${s.name}</span><span class="search-item-hint">вихід ${escapeHtml(num)} · ${_distText(m)}</span></div>
  </div>`;
}

function _addressBlock(street, house, lineFilter) {
  const rows = house.near.map(n => _stationRow(n, lineFilter)).join('');
  if (!rows) return '';
  return `<div class="search-addr">
    <div class="search-addr-title">${escapeHtml(street.name)}, ${escapeHtml(house.house)}</div>
    ${rows}
  </div>`;
}

function _streetRow(street, hint) {
  return `<div class="search-addr-street" data-fill="${escapeHtml(street.name)} ">
    <span>${escapeHtml(street.name)}</span><span class="search-item-hint">${hint}</span>
  </div>`;
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
    houseQuery = _normHouse(words[lastNum]);
    words.splice(lastNum, 1);
  }
  const streetWords = queryWordsForExits(words.join(' '));
  if (!streetWords.length) return '';

  const streets = _data.streets.filter(st =>
    streetWords.every(q => st.tokens.some(t => t.startsWith(q))));
  if (!streets.length) return '';

  let html = '';
  if (houseQuery) {
    let shown = 0;
    for (const st of streets) {
      const houses = _houses(st);
      const exact  = houses.filter(h => h.key === houseQuery);
      const found  = exact.length ? exact : houses.filter(h => h.key.startsWith(houseQuery));
      for (const h of found.slice(0, MAX_HOUSES - shown)) {
        const block = _addressBlock(st, h, lineFilter);
        if (block) { html += block; shown++; }
      }
      if (shown >= MAX_HOUSES) break;
    }
    if (!html) {
      html = streets.slice(0, MAX_STREETS)
        .map(st => _streetRow(st, 'немає такого будинку в даних')).join('');
    }
  } else {
    html = streets.slice(0, MAX_STREETS)
      .map(st => _streetRow(st, 'введіть номер будинку')).join('');
  }

  return `<div class="search-section-title">Адреси</div>${html}`;
}
