// ══ СТАТИЧНІ КОНСТАНТИ ДОДАТКУ ══
// Значення, що ніколи не змінюються під час роботи.
//
// P2-E fix: NAME_TO_SLUG та SLUG_BY_LOWER видалено звідси.
// Вони були порожніми об'єктами, які заповнювались через MetroApp —
// що порушувало ESM-інкапсуляцію і плутало споживачів (отримували порожній об'єкт).
// Тепер вони є приватними змінними всередині data/stations.js
// і доступні виключно через slugByName() та getSlugByLower().

export const LINE_COLOR = {
  red:   '#c8523a',
  blue:  '#5b9bd5',
  green: '#5aaa6a',
};

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
]);
