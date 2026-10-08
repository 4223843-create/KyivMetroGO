// ══ СХОВИЩЕ ДАНИХ ДОДАТКУ (НАТИВНЕ) ══
// Відповідальність: збереження даних користувача через Capacitor Preferences.
// Дані зберігаються надійно у системних сховищах iOS (UserDefaults) та Android (SharedPreferences).
// Читання синхронне з in-memory кешу, запис — асинхронний у фоні.
// Помилка фонового запису повідомляється подією 'storage:write-failed';
// перед перезавантаженням сторінки чекайте Storage.flush().
// Зміни ключів з іншої вкладки (лише веб) — подія 'storage:changed' { key }.

import { Preferences } from '@capacitor/preferences';
import { Capacitor }   from '@capacitor/core';
import { bus }         from './eventBus.js';

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
  HINTS_DONE:          'metro_hints_done',
  HIDE_INFO_BLOCKS:    'metro_hide_info_blocks',
  FAV_ONLY_STREAK:     'metro_fav_only_streak',
  EDIT_MODE:           'metro_edit_mode',
  HIDE_NO_LIFT:        'metro_hide_no_lift',
  SHOW_MAP_ACCESSIBILITY:  'metro_show_map_accessibility', // старий тумблер, лише для переходу на MAP_ACCESSIBILITY
  MAP_ACCESSIBILITY:       'metro_map_accessibility',
  SHOW_HOISTS:             'metro_show_hoists',
  SHOW_INTERVALS:          'metro_show_intervals',
  MORNING_INTERVAL:        'metro_morning_interval',
  SHOW_STATION_HOURS:      'metro_show_station_hours',
  REDUCE_MOTION:           'metro_reduce_motion',
  DEV_MODE:     'metro_dev_mode',
  DEV_LOG:      'metro_dev_log',
  DEV_VERIFIED: 'metro_dev_verified',
  DEV_NOTES:    'metro_dev_notes',
  DEV_BACKLOG:  'metro_dev_backlog',
  DEV_SYNC_LOCAL_TS: 'metro_dev_sync_local_ts',
  DEV_MENU_SECTIONS: 'metro_dev_menu_sections',
  DEV_CONFIRMATIONS: 'metro_dev_confirmations',
  DEV_STATION_NOTES: 'metro_dev_station_notes',
  DEV_EXITS_VERIFIED:    'metro_dev_exits_verified',
  DEV_DELETED_PHOTOS:    'metro_dev_deleted_photos',
  DEV_BACKLOG_SYNC_BASE: 'metro_dev_backlog_sync_base',
  LOGO_STATE:     'metro_logo_state',
  LOGO_EGG_CYCLE: 'metro_logo_egg_cycle',
  CHECKIN_HATCH:  'metro_checkin_hatch',
};

const memoryCache = new Map();

// Незавершені фонові записи — для Storage.flush()
const _pending = new Set();

function _track(key, write) {
  const op = write()
    .catch(err => {
      console.error('[Storage] запис не вдався:', key, err);
      bus.emit('storage:write-failed', { key });
    })
    .finally(() => _pending.delete(op));
  _pending.add(op);
}

// Ранній скрипт теми в index.html виконується до Storage.init() і може читати
// лише localStorage. На Android/iOS Preferences живе в нативному сховищі,
// тому дублюємо туди тему, щоб не було спалаху системної теми при запуску.
const THEME_BOOT_KEY = 'metro_theme_boot';
function _mirrorTheme(key) {
  if (key !== STORAGE_KEYS.THEME) return;
  try {
    const value = memoryCache.get(key);
    if (value == null) localStorage.removeItem(THEME_BOOT_KEY);
    else localStorage.setItem(THEME_BOOT_KEY, value);
  } catch { /* localStorage недоступний — лишається спалах, не помилка */ }
}

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
    _mirrorTheme(STORAGE_KEYS.THEME);
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
    _mirrorTheme(key);

    // Фоновий нативний запис, який не блокує головний потік UI
    _track(key, () => Preferences.set({ key, value: valStr }));
  },

  /**
   * Видаляє ключ з кешу та нативного сховища.
   * @param {string} key
   */
  remove(key) {
    memoryCache.delete(key);
    _mirrorTheme(key);

    _track(key, () => Preferences.remove({ key }));
  },

  /**
   * Чекає завершення всіх фонових записів (наприклад, перед location.reload()).
   * @returns {Promise<void>}
   */
  async flush() {
    while (_pending.size) await Promise.allSettled([..._pending]);
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
    _mirrorTheme(STORAGE_KEYS.THEME);
  },
};

// ══ СИНХРОНІЗАЦІЯ КЕШУ МІЖ ВКЛАДКАМИ (ДЛЯ ВЕБ-ВЕРСІЇ) ══
// На нативному Android Storage event між вкладками ніколи не тригериться
// (WebView — єдиний процес, вкладок немає). Реєструємо тільки на вебі.
// Модулі з власним кешем (вибране, чекіни, правки) слухають 'storage:changed'.

if (!Capacitor.isNativePlatform()) {
  const _VALID_KEYS = new Set(Object.values(STORAGE_KEYS));

  // Preferences на вебі зберігає ключі в localStorage з префіксом «CapacitorStorage.»
  const _PREFS_PREFIX = 'CapacitorStorage.';

  window.addEventListener('storage', (e) => {
    if (!e.key?.startsWith(_PREFS_PREFIX)) return;
    const key = e.key.slice(_PREFS_PREFIX.length);
    if (_VALID_KEYS.has(key)) {
      if (e.newValue === null) {
        memoryCache.delete(key);
      } else {
        memoryCache.set(key, e.newValue);
      }
      bus.emit('storage:changed', { key });
    }
  });
}