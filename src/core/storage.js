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
  CHECKIN_HINT_SEEN:   'metro_checkin_hint_seen',
  HIDE_INFO_BLOCKS:    'metro_hide_info_blocks',
  FAV_ONLY_STREAK:     'metro_fav_only_streak',
  // Режим розробника
  DEV_MODE:     'metro_dev_mode',
  DEV_LOG:      'metro_dev_log',
  DEV_VERIFIED: 'metro_dev_verified',
  DEV_NOTES:    'metro_dev_notes',
  LOGO_STATE:     'metro_logo_state',
  LOGO_EGG_CYCLE: 'metro_logo_egg_cycle',
};

const memoryCache = new Map();

// ══ STORAGE ADAPTER ══
export const Storage = {
  async init() {
    const keys = Object.values(STORAGE_KEYS);    
    for (const key of keys) {
      const value = localStorage.getItem(key);
      if (value !== null) {
        memoryCache.set(key, value);
      }
    }
  },

  get(key) {
    return memoryCache.get(key) ?? null;
  },

  set(key, value) {
    const valStr = String(value);
    memoryCache.set(key, valStr);
    
    Promise.resolve().then(() => {
      localStorage.setItem(key, valStr);
    });
  },

  remove(key) {
    memoryCache.delete(key);
    
    Promise.resolve().then(() => {
      localStorage.removeItem(key);
    });
  },
};

// ══ СИНХРОНІЗАЦІЯ КЕШУ МІЖ ВКЛАДКАМИ ══
window.addEventListener('storage', (e) => {
  if (Object.values(STORAGE_KEYS).includes(e.key)) {
    if (e.newValue === null) {
      memoryCache.delete(e.key);
    } else {
      memoryCache.set(e.key, e.newValue);
    }
  }
});
