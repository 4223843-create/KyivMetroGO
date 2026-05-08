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

// Внутрішній кеш для синхронного доступу
const memoryCache = new Map();

// ══ STORAGE ADAPTER ══
// Адаптовано для плавного переходу на Capacitor Preferences API
export const Storage = {
  // 1. Асинхронна ініціалізація (викликатимемо один раз при старті)
  async init() {
    // ТУТ У МАЙБУТНЬОМУ БУДЕ: const keys = (await Preferences.keys()).keys;
    const keys = Object.values(STORAGE_KEYS);    
    for (const key of keys) {
      // ТУТ У МАЙБУТНЬОМУ БУДЕ: const { value } = await Preferences.get({ key });
      const value = localStorage.getItem(key);
      if (value !== null) {
        memoryCache.set(key, value);
      }
    }
  },

  // 2. Синхронне читання (код працює як раніше!)
  get(key) {
    return memoryCache.get(key) ?? null;
  },

  // 3. Збереження (оновлює кеш миттєво, а в базу пише асинхронно)
  set(key, value) {
    const valStr = String(value);
    memoryCache.set(key, valStr);
    
    // ТУТ У МАЙБУТНЬОМУ БУДЕ: Preferences.set({ key, value: valStr });
    // Загортаємо в Promise.resolve для імітації фонової роботи
    Promise.resolve().then(() => {
      localStorage.setItem(key, valStr);
    });
  },

  // 4. Видалення
  remove(key) {
    memoryCache.delete(key);
    
    // ТУТ У МАЙБУТНЬОМУ БУДЕ: Preferences.remove({ key });
    Promise.resolve().then(() => {
      localStorage.removeItem(key);
    });
  },
};