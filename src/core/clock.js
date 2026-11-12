// ══ ЧАС ЗАСТОСУНКУ ══
// Звичайно — час телефону. У режимі розробника можна підставити інший час
// (емуляція: «до відкриття», «перед закриттям»…). Підставний годинник іде далі
// від заданої миті, тож хвилини змінюються як справжні.

import { STORAGE_KEYS, Storage } from './storage.js';
import { PLAY_BUILD }             from './build.js';

/** { target, setAt } — заданий час і мить, коли його задали (мс). */
export function getClockOverride() {
  if (PLAY_BUILD) return null; // у збірці для Play підставного часу не буває
  try {
    const v = JSON.parse(Storage.get(STORAGE_KEYS.DEV_EMU_CLOCK) || 'null');
    return Number.isFinite(v?.target) && Number.isFinite(v?.setAt) ? v : null;
  } catch {
    return null;
  }
}

// ── Київський час ────────────────────────────────────────────
// Метро живе за київським часом, а телефон може бути в іншому поясі (поїздка,
// налаштування). Повертаємо Date, чиї getHours()/getDay() показують час у Києві.

let _kyivFormat;
function _kyivFormatter() {
  if (_kyivFormat !== undefined) return _kyivFormat;
  _kyivFormat = null;
  // «Europe/Kyiv» знають новіші браузери, старіші — лише «Europe/Kiev»
  for (const timeZone of ['Europe/Kyiv', 'Europe/Kiev']) {
    try {
      _kyivFormat = new Intl.DateTimeFormat('en-US', {
        timeZone, hourCycle: 'h23',
        year: 'numeric', month: 'numeric', day: 'numeric',
        hour: 'numeric', minute: 'numeric', second: 'numeric',
      });
      break;
    } catch { /* пояс невідомий — пробуємо наступну назву */ }
  }
  return _kyivFormat;
}

/**
 * Той самий момент, переведений на київський «настінний» час: getHours(),
 * getMinutes(), getDay() дають київські значення. Без Intl — час телефону.
 * @param {Date} d
 */
export function kyivWallClock(d) {
  const fmt = _kyivFormatter();
  if (!fmt) return d;
  const v = Object.fromEntries(fmt.formatToParts(d).map(p => [p.type, Number(p.value)]));
  return new Date(v.year, v.month - 1, v.day, v.hour, v.minute, v.second);
}

/** Поточний час для годинника станції, інтервалів і годин роботи (за Києвом). */
export function appNow() {
  const o = getClockOverride();
  // Підставний час розробник задає вже як «настінний» — без перерахунку
  return o ? new Date(o.target + (Date.now() - o.setAt)) : kyivWallClock(new Date());
}
