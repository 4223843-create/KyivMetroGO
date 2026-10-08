// ══ НАЛАШТУВАННЯ КОРИСТУВАЧА ══
// Один перелік налаштувань із типами й значеннями за замовчуванням. Решта
// коду читає getPref('showHoists') і отримує boolean чи одне з дозволених
// значень, а не порівнює рядки 'true'/'false' зі сховища. Формат у сховищі
// той самий, що й раніше, тож переходу даних не потрібно.

import { STORAGE_KEYS, Storage } from './storage.js';

const PREFS = {
  editMode:             { key: STORAGE_KEYS.EDIT_MODE,              def: false },
  startOnFav:           { key: STORAGE_KEYS.START_ON_FAV,           def: false },
  hideInfoBlocks:       { key: STORAGE_KEYS.HIDE_INFO_BLOCKS,       def: false },
  localOnlyFeedback:    { key: STORAGE_KEYS.LOCAL_ONLY_FEEDBACK,    def: false },
  hideNoLift:           { key: STORAGE_KEYS.HIDE_NO_LIFT,           def: false },
  // Знак колісного крісла на карті: ліфти / ліфти та спецпідйомники / нічого.
  // Поки не обрано: якщо раніше вимкнули «доступність на карті» — нічого, інакше ліфти.
  mapAccessibility:     { key: STORAGE_KEYS.MAP_ACCESSIBILITY,      def: 'lifts',   values: ['lifts', 'hoists', 'none'],
                          legacy: () => (Storage.get(STORAGE_KEYS.SHOW_MAP_ACCESSIBILITY) === 'false' ? 'none' : null) },
  showHoists:           { key: STORAGE_KEYS.SHOW_HOISTS,            def: true },
  showIntervals:        { key: STORAGE_KEYS.SHOW_INTERVALS,         def: true },
  // Уночі показувати інтервал руху після відкриття
  morningInterval:      { key: STORAGE_KEYS.MORNING_INTERVAL,       def: true },
  checkinMode:          { key: STORAGE_KEYS.CHECKIN_MODE,           def: true },
  // false — відмітка залежить від попередньої станції (у налаштуваннях «Check-in за попередньою станцією» увімкнено)
  checkinByExit:        { key: STORAGE_KEYS.CHECKIN_BY_EXIT,        def: false },
  // Коли показувати години роботи станції: ніколи / за 2 год до закриття / завжди
  stationHours:         { key: STORAGE_KEYS.SHOW_STATION_HOURS,     def: 'soon',    values: ['never', 'soon', 'always'] },
  // Що рахувати в журналі check-in: станції чи виходи
  checkinByStation:     { key: STORAGE_KEYS.CHECKIN_BY_STATION,     def: 'station', values: ['station', 'exits'] },
  // Вимкнути анімацію. Поки не обрано — як у системі («Вимкнути анімацію» / «Зменшення руху»).
  reduceMotion:         { key: STORAGE_KEYS.REDUCE_MOTION,          def: false,
                          auto: () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches },
};

function _def(name) {
  const def = PREFS[name];
  if (!def) throw new Error(`[prefs] невідоме налаштування ${name}`);
  return def;
}

/** Значення налаштування: boolean або одне з def.values. */
export function getPref(name) {
  const { key, def, values, legacy, auto } = _def(name);
  const raw = Storage.get(key);
  if (values) return values.includes(raw) ? raw : (raw == null && legacy?.()) || def;
  if (raw === 'true')  return true;
  if (raw === 'false') return false;
  return auto ? auto() : def;
}

/** Зберігає налаштування; недозволене значення ігнорується. */
export function setPref(name, value) {
  const { key, values } = _def(name);
  if (values) {
    if (values.includes(value)) Storage.set(key, value);
    return;
  }
  Storage.set(key, String(!!value));
}
