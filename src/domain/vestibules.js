// ══ ЗАКРИТІ ВЕСТИБЮЛІ ══
// Відповідальність: вестибюлі з "vestibule_closed": true у exits_catalog (stations.json)
// картка показує як «Цей вестибюль не працює». Якщо людина натисне «вже працює!»,
// вестибюль відкривається лише в неї (Storage) і розробник отримує повідомлення.

import { Storage, STORAGE_KEYS } from '../core/storage.js';

const FORMSPREE_URL = 'https://formspree.io/f/xrejbjww';

const _key = (slug, exitId) => `${slug}|${exitId}`;

function _readReopened() {
  try {
    const list = JSON.parse(Storage.get(STORAGE_KEYS.VESTIBULES_REOPENED) || '[]');
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

/** Чи показувати на картці заглушку замість виходу. */
export function isVestibuleClosed(slug, exit) {
  return !!exit?.vestibule_closed && !_readReopened().includes(_key(slug, exit.id));
}

/** Відкриває вестибюль лише на цьому пристрої. */
export function reopenVestibule(slug, exitId) {
  const list = _readReopened();
  const key  = _key(slug, exitId);
  if (list.includes(key)) return;
  list.push(key);
  Storage.set(STORAGE_KEYS.VESTIBULES_REOPENED, JSON.stringify(list));
}

/**
 * Повідомляє розробника, що вестибюль знову працює.
 * @returns {Promise<boolean>} true — повідомлення надіслано
 */
export async function reportVestibuleOpen(stationName, exitId, label) {
  const controller = new AbortController();
  const timeoutId  = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(FORMSPREE_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        station: stationName,
        changes: `Вестибюль ${exitId}${label ? ` (${label})` : ''}: користувач повідомляє, що вже працює`,
      }),
      signal: controller.signal,
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeoutId);
  }
}
