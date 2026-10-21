// ══ ЧАС ЗАСТОСУНКУ ══
// Звичайно — час телефону. У режимі розробника можна підставити інший час
// (емуляція: «до відкриття», «перед закриттям»…). Підставний годинник іде далі
// від заданої миті, тож хвилини змінюються як справжні.

import { STORAGE_KEYS, Storage } from './storage.js';

/** { target, setAt } — заданий час і мить, коли його задали (мс). */
export function getClockOverride() {
  try {
    const v = JSON.parse(Storage.get(STORAGE_KEYS.DEV_EMU_CLOCK) || 'null');
    return Number.isFinite(v?.target) && Number.isFinite(v?.setAt) ? v : null;
  } catch {
    return null;
  }
}

/** Поточний час для годинника станції, інтервалів і годин роботи. */
export function appNow() {
  const o = getClockOverride();
  return o ? new Date(o.target + (Date.now() - o.setAt)) : new Date();
}
