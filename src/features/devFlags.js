// ══ ПРАПОРЕЦЬ РЕЖИМУ РОЗРОБНИКА І ЖУРНАЛ ЗМІН ══
// Окремо від devmode.js, щоб звичайні модулі (налаштування, форма правок)
// могли перевірити режим, не тягнучи весь код розробника і без циклу імпортів.

import { STORAGE_KEYS, Storage } from '../core/storage.js';

// Збірка для Google Play (VITE_PLAY_BUILD=1 у CI-завданні aab): режиму розробника
// немає взагалі — ні 5 дотиків, ні форми входу. PWA і тестовий APK — як раніше.
export const DEV_MODE_AVAILABLE = import.meta.env?.VITE_PLAY_BUILD !== '1';

const _devFlag = () => DEV_MODE_AVAILABLE && Storage.get(STORAGE_KEYS.DEV_MODE) === 'true';

/** Активна емуляція стану (devEmulation.js): підставні дані чи час. */
export function isEmulating() {
  return !!(Storage.get(STORAGE_KEYS.DEV_EMU_PROFILE) || Storage.get(STORAGE_KEYS.DEV_EMU_SNAPSHOT)
    || Storage.get(STORAGE_KEYS.DEV_EMU_CLOCK));
}

/** Повертає true якщо режим розробника активний. Під час емуляції — ні:
 *  застосунок виглядає як у звичайної людини, без кнопок розробника. */
export function isDevMode() {
  return _devFlag() && !isEmulating();
}
// Для раннього обробника помилок в index.html (вікна «CRASH» лише розробнику)
window.__isDevMode = isDevMode;

/** Перемикає режим розробника. Повертає новий стан. */
export function toggleDevMode() {
  const next = !_devFlag();
  Storage.set(STORAGE_KEYS.DEV_MODE, String(next));
  return next;
}

// ── Лог змін ────────────────────────────────────────
/** @returns {object[]} масив записів про всі зміни позицій у dev-режимі */
export function getDevLog() {
  try { return JSON.parse(Storage.get(STORAGE_KEYS.DEV_LOG) || '[]'); }
  catch(e) { return []; }
}

/**
 * Додає запис до dev-лога.
 * @param {{ station:string, slug:string, dir:string, exit:string, posIdx:number, field:string, from:*, to:* }} entry
 */
export function appendDevLog(entry) {
  const log = getDevLog();
  log.push({ ts: Date.now(), ...entry });
  Storage.set(STORAGE_KEYS.DEV_LOG, JSON.stringify(log));
}
