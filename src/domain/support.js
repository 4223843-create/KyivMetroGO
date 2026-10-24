// ══ ЗАЯВКИ НА РАННІЙ ДОСТУП ══
// Запам'ятовуємо, щоб у «Про застосунок» показати людині коротке сповіщення:
// куди і коли вона подала заявку.

import { STORAGE_KEYS, Storage } from '../core/storage.js';

function _read(key) {
  try {
    const list = JSON.parse(Storage.get(key) || '[]');
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

const _write = (key, list) => Storage.set(key, JSON.stringify(list));

export const getBetaSignups = () => _read(STORAGE_KEYS.BETA_SIGNUPS).filter(r => r?.email);

/** Та сама адреса ще раз — оновлюємо дату, а не додаємо рядок. */
export function addBetaSignup(email, t = Date.now()) {
  const list = getBetaSignups().filter(r => r.email !== email);
  list.push({ email, t });
  _write(STORAGE_KEYS.BETA_SIGNUPS, list);
}

const pad = n => String(n).padStart(2, '0');
export const fmtDate = t => { const d = new Date(t); return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`; };

/** Рядки сповіщень для картки підтримки (HTML). */
export function supportNotices() {
  return getBetaSignups().map(r =>
    `Ви подали <strong>${_esc(r.email)}</strong> на&nbsp;участь у&nbsp;тестуванні ${fmtDate(r.t)}`);
}

function _esc(s) {
  return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
