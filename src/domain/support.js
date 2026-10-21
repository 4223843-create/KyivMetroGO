// ══ ЗАЯВКИ НА РАННІЙ ДОСТУП І ДОНАТИ ══
// Запам'ятовуємо, щоб у «Про застосунок» показати людині коротке сповіщення:
// куди вона подала заявку і скільки задонатила. Monobank не повідомляє
// застосунку про оплату, тож суму донату вказує сама людина.

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
export const getDonations   = () => _read(STORAGE_KEYS.DONATIONS).filter(r => Number(r?.amount) > 0);

/** Та сама адреса ще раз — оновлюємо дату, а не додаємо рядок. */
export function addBetaSignup(email, t = Date.now()) {
  const list = getBetaSignups().filter(r => r.email !== email);
  list.push({ email, t });
  _write(STORAGE_KEYS.BETA_SIGNUPS, list);
}

export function addDonation(amount, t = Date.now()) {
  const list = getDonations();
  list.push({ amount: Math.round(Number(amount)), t });
  _write(STORAGE_KEYS.DONATIONS, list);
}

const pad = n => String(n).padStart(2, '0');
export const fmtDate = t => { const d = new Date(t); return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`; };

/** 1 гривню, 2 гривні, 5 гривень (знахідний відмінок: «на суму …»). */
export function hryvniaWord(n) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return 'гривню';
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return 'гривні';
  return 'гривень';
}

const fmtAmount = n => `${String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}&nbsp;${hryvniaWord(n)}`;

/** Рядки сповіщень для картки підтримки (HTML). */
export function supportNotices() {
  const lines = getBetaSignups().map(r =>
    `Ви подали <strong>${_esc(r.email)}</strong> на&nbsp;участь у&nbsp;тестуванні ${fmtDate(r.t)}`);
  const d = getDonations();
  if (d.length === 1) {
    lines.push(`Ви допомогли додатку на&nbsp;суму ${fmtAmount(d[0].amount)} ${fmtDate(d[0].t)}`);
  } else if (d.length > 1) {
    const sum = d.reduce((a, r) => a + r.amount, 0);
    lines.push(`Ви допомогли додатку на&nbsp;загальну суму ${fmtAmount(sum)}: ${d.map(r => fmtDate(r.t)).join(', ')}`);
  }
  return lines;
}

function _esc(s) {
  return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
