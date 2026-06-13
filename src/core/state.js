// ══ МУТАБЕЛЬНИЙ СТАН ДОДАТКУ ══
// Тільки те, що змінюється під час роботи.
// Константи — в core/constants.js.

export const state = {
  stationsData:          null,   // { [slug]: StationObject }
  currentStationSlug:    null,   // slug відкритої зараз картки
  isMapReady:            false,  // SVG карта вставлена і відцентрована
  isZonesReady:          false,  // зони кліків на карті готові
  activeLineFilter:      new Set(), // активний фільтр у пошуку
  emptyFavColorIdx:      0,      // ротація кольору у пустому стані Вибраного
  hasUnsavedFeedback:    false,  // встановлюється features/feedback — читається core/unsavedCheck
};

// Slug із URL ?station=… — зчитується один раз при старті
export const startupSlug = new URLSearchParams(window.location.search).get('station');
if (startupSlug) window.history.replaceState({}, document.title, window.location.pathname);
