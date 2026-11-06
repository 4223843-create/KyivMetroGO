// ══ СТАТИЧНІ КОНСТАНТИ ДОДАТКУ ══
// Значення, що ніколи не змінюються під час роботи.
// Змінювані дані — у core/state.js.

export const LINE_COLOR = {
  red:   '#c8523a',
  blue:  '#5b9bd5',
  green: '#5aaa6a',
};

// Тимчасово недоступна станція (stations.json: temporarily_closed) — сіра замість кольору гілки
export const CLOSED_STATION_COLOR = '#8e8e93';

export const FAV_DISPLAY_NAMES = {
  'B.Ploshcha_Ukrainskikh_heroiv': 'Пл. Українських Героїв',
};

export const DIR_SHORT_NAMES = {
  'контрактова площа':      'Контрактова',
  'поштова площа':          'Поштова',
  'майдан незалежності':    'Майдан',
  'політехнічний інститут': 'Політехнічний',
  'золоті ворота':          'Золоті',
};

export const STATIONS_WITH_POTENTIAL_EXITS = new Set([
  'R.Zhytomyrska',
  'G.Osokorky',
  'G.Chervonyi_khutir',
  'G.Boryspilska',
  'R.Hidropark',
]);
