// ══ ПРАПОРЕЦЬ РЕЖИМУ РОЗРОБНИКА І ЖУРНАЛ ЗМІН ══
// Окремо від devmode.js, щоб звичайні модулі (налаштування, форма правок)
// могли перевірити режим, не тягнучи весь код розробника і без циклу імпортів.

import { STORAGE_KEYS, Storage } from '../core/storage.js';

/** Повертає true якщо режим розробника активний. */
export function isDevMode() {
  return Storage.get(STORAGE_KEYS.DEV_MODE) === 'true';
}
// Для раннього обробника помилок в index.html (вікна «CRASH» лише розробнику)
window.__isDevMode = isDevMode;

/** Перемикає режим розробника. Повертає новий стан. */
export function toggleDevMode() {
  const next = !isDevMode();
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
