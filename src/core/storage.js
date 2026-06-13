// ══ СХОВИЩЕ ДАНИХ ДОДАТКУ (НАТИВНЕ) ══
// Відповідальність: збереження даних користувача через Capacitor Preferences.
// Дані зберігаються надійно у системних сховищах iOS (UserDefaults) та Android (SharedPreferences).
// Читання синхронне з in-memory кешу, запис — асинхронний у фоні.

import { Preferences } from '@capacitor/preferences';

export const STORAGE_KEYS = {
  THEME:          'metro_theme',
  FAVS:           'metro_favs',
  EXIT_FAVS:      'metro_exit_favs',
  EXIT_LABELS:    'metro_exit_labels',
  LOCAL_EDITS:    'metro_local_edits',
  FAV_ROWS_ORDER: 'metro_fav_rows_order',
  CHECKINS:       'metro_checkins',
  CHECKIN_MODE:       'metro_checkin_mode',
  CHECKIN_BY_STATION: 'metro_checkin_by_station',
  CHECKIN_BY_EXIT:    'metro_checkin_by_exit',
  START_ON_FAV:   'metro_start_on_fav',
  LOCAL_ONLY_FEEDBACK: 'metro_local_only_feedback',
  CHECKIN_HINT_SEEN:   'metro_checkin_hint_seen',
  HIDE_INFO_BLOCKS:    'metro_hide_info_blocks',
  FAV_ONLY_STREAK:     'metro_fav_only_streak',
  DEV_MODE:     'metro_dev_mode',
  DEV_LOG:      'metro_dev_log',
  DEV_VERIFIED: 'metro_dev_verified',
  DEV_NOTES:    'metro_dev_notes',
  LOGO_STATE:     'metro_logo_state',
  LOGO_EGG_CYCLE: 'metro_logo_egg_cycle',
  CHECKIN_HATCH:  'metro_checkin_hatch',
};

const memoryCache = new Map();

export const Storage = {
  /**
   * Наповнює in-memory кеш усіма відомими ключами з нативного сховища.
   * Використовує Promise.all для паралельного та швидкого завантаження.
   * @returns {Promise<void>}
   */
  async init() {
    const keys = Object.values(STORAGE_KEYS);
    
    // Паралельно запитуємо всі ключі з нативного сховища
    const promises = keys.map(key => Preferences.get({ key }));
    const results = await Promise.all(promises);

    results.forEach((res, index) => {
      if (res.value !== null) {
        memoryCache.set(keys[index], res.value);
      }
    });
  },

  /**
   * Синхронне читання з кешу оперативної пам'яті.
   * @param {string} key
   * @returns {string|null}
   */
  get(key) {
    return memoryCache.get(key) ?? null;
  },

  /**
   * Записує значення в оперативну пам'ять миттєво,
   * а в нативне сховище — асинхронно у фоні.
   * @param {string} key
   * @param {string} value
   */
  set(key, value) {
    const valStr = String(value);
    memoryCache.set(key, valStr);
    
    // Фоновий нативний запис, який не блокує головний потік UI
    Promise.resolve().then(async () => {
      await Preferences.set({ key, value: valStr });
    });
  },

  /**
   * Видаляє ключ з кешу та нативного сховища.
   * @param {string} key
   */
  remove(key) {
    memoryCache.delete(key);
    
    Promise.resolve().then(async () => {
      await Preferences.remove({ key });
    });
  },

  /**
   * Відновлює дані з бекап-об'єкта.
   * На відміну від set(), виконує гарантований await — безпечно перед reload().
   * Очищає всі відомі ключі, потім паралельно записує нові значення.
   *
   * @param {Record<string, string>} data — розібраний і валідований бекап
   * @returns {Promise<void>}
   */
  async restoreFromBackup(data) {
    const APP_PREFIX = 'metro_';

    // 1. Очистити кеш і Preferences для всіх відомих ключів
    const clearOps = Object.values(STORAGE_KEYS).map(key => {
      memoryCache.delete(key);
      return Preferences.remove({ key });
    });
    await Promise.all(clearOps);

    // 2. Записати нові значення — тільки metro_* рядки, без службових роздільників
    const setOps = [];
    for (const [key, value] of Object.entries(data)) {
      if (!key.startsWith(APP_PREFIX)) continue;
      if (key.startsWith('═'))         continue;  // роздільники dev-логу
      if (typeof value !== 'string')   continue;  // _dev_change_log — масив
      memoryCache.set(key, value);
      setOps.push(Preferences.set({ key, value }));
    }
    await Promise.all(setOps);
  },
};

// ══ СИНХРОНІЗАЦІЯ КЕШУ МІЖ ВКЛАДКАМИ (ДЛЯ ВЕБ-ВЕРСІЇ) ══
// На нативному Android Storage event між вкладками ніколи не тригериться
// (WebView — єдиний процес, вкладок немає). Реєструємо тільки на вебі.
import { Capacitor } from '@capacitor/core';

if (!Capacitor.isNativePlatform()) {
  const _VALID_KEYS = new Set(Object.values(STORAGE_KEYS));

  window.addEventListener('storage', (e) => {
    if (_VALID_KEYS.has(e.key)) {
      if (e.newValue === null) {
        memoryCache.delete(e.key);
      } else {
        memoryCache.set(e.key, e.newValue);
      }
    }
  });
}