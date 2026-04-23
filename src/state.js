// ══ КОНСТАНТИ МЕТРОАПП ══
MetroApp.LINE_COLOR = { red: '#c8523a', blue: '#5b9bd5', green: '#5aaa6a' };

MetroApp.FAV_DISPLAY_NAMES = {
  'B.Ploshcha_Ukrainskikh_heroiv': 'Пл. Українських героїв',
};

MetroApp.DIR_SHORT_NAMES = {
  'контрактова площа':      'Контрактова',
  'поштова площа':          'Поштова',
  'майдан незалежності':    'Майдан',
  'політехнічний інститут': 'Політехнічний',
  'золоті ворота':          'Золоті',
};

MetroApp.ALWAYS_CAP = new Set([
  'україна','україни','українських','дніпра','незалежності','небесної',
  'сотні','спорту','центр','площа','площі','героїв','лівий','правий',
]);

// Словники slug-lookup — заповнюються у hydrateStations
MetroApp.NAME_TO_SLUG  = {};
MetroApp.SLUG_BY_LOWER = {};

// Посилання на поточні дані станцій (використовується feedback.js)
MetroApp.currentStationsData = null;

// ══ МУТАБЕЛЬНИЙ СТАН ДОДАТКУ ══
export const state = {
  stationsData:       null,
  currentStationSlug: null,
  isMapReady:         false,
  isZonesReady:       false,
  activeLineFilter:   new Set(),
  emptyFavColorIdx:   0,
};

// Slug з URL ?station=… (зчитується одноразово при старті)
export const startupSlug = new URLSearchParams(window.location.search).get('station');
if (startupSlug) window.history.replaceState({}, document.title, window.location.pathname);
