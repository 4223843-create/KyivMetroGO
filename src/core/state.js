// ══ МУТАБЕЛЬНИЙ СТАН ДОДАТКУ ══
// Тільки те, що змінюється під час роботи.
// Константи — в core/constants.js.

export const state = {
  stationsData:          null,   // { [slug]: StationObject }
  stationsFallbackUsed:  false,  // основні дані виявились непридатні, взято запасну копію
  lineIntervals:         {},     // інтервали руху по лініях з stations.json (line_intervals)
  currentStationSlug:    null,   // slug відкритої зараз картки
  isMapReady:            false,  // SVG карта вставлена і відцентрована
  isZonesReady:          false,  // зони кліків на карті готові
  activeLineFilter:      new Set(), // активний фільтр у пошуку
  emptyFavColorIdx:      0,      // ротація кольору у пустому стані Вибраного
  hasUnsavedFeedback:    false,  // встановлюється features/feedback — читається core/unsavedCheck
};

// Slug із URL ?station=… — зчитується один раз при старті
/**
 * Чи є в даних станція з таким slug — лише власні ключі: slug із URL чи сховища
 * на кшталт «constructor» не має знаходити успадковані властивості об'єкта.
 * @param {unknown} slug
 */
export function hasStation(slug) {
  return typeof slug === 'string' && !!state.stationsData
    && Object.prototype.hasOwnProperty.call(state.stationsData, slug);
}

export const startupSlug = new URLSearchParams(window.location.search).get('station');
if (startupSlug) window.history.replaceState({}, document.title, window.location.pathname);
