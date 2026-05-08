// ══ СТАТИЧНІ КОНСТАНТИ ДОДАТКУ ══
// Значення, що ніколи не змінюються під час роботи.
// Раніше були в state.js разом із мутабельним станом.
// Тепер: нульові побічні ефекти, імпортуються без ризику.

export const LINE_COLOR = {
  red:   '#c8523a',
  blue:  '#5b9bd5',
  green: '#5aaa6a',
};

// Скорочені назви для відображення у Вибраному
export const FAV_DISPLAY_NAMES = {
  'B.Ploshcha_Ukrainskikh_heroiv': 'Пл. Українських Героїв',
};

// Скорочення для назв напрямків (щоб не обрізати занадто довгі)
export const DIR_SHORT_NAMES = {
  'контрактова площа':      'Контрактова',
  'поштова площа':          'Поштова',
  'майдан незалежності':    'Майдан',
  'політехнічний інститут': 'Політехнічний',
  'золоті ворота':          'Золоті',
};

// Станції, де конструктивно закладені виходи, що можуть відкритись у майбутньому
export const STATIONS_WITH_POTENTIAL_EXITS = new Set([
  'R.Zhytomyrska',
  'G.Osokorky',
  'G.Chervonyi_khutir',
]);

// Словники slug-lookup — заповнюються у hydrateStations, тут лише ініціалізація
export const NAME_TO_SLUG  = {};
export const SLUG_BY_LOWER = {};
