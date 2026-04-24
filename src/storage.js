// ══ STORAGE KEYS ══
export const STORAGE_KEYS = {
  THEME:          'metro_theme',
  FAVS:           'metro_favs',
  EXIT_FAVS:      'metro_exit_favs',
  EXIT_LABELS:    'metro_exit_labels',
  LOCAL_EDITS:    'metro_local_edits',
  FAV_ROWS_ORDER: 'metro_fav_rows_order',
  CHECKINS:       'metro_checkins',
  CHECKIN_MODE:   'metro_checkin_mode',
  START_ON_FAV:   'metro_start_on_fav',
  LOCAL_ONLY_FEEDBACK: 'metro_local_only_feedback',
};

// ══ STORAGE ADAPTER ══
// Зараз — синхронний localStorage.
// При переході на Capacitor: замінити тіло функцій на Preferences API.
// Решта коду змін не потребуватиме.

export const Storage = {
  get(key) {
    return localStorage.getItem(key);
  },
  set(key, value) {
    localStorage.setItem(key, value);
  },
  remove(key) {
    localStorage.removeItem(key);
  },
};
