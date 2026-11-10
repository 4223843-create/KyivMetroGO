// ══ ЗАКРИТІ ВЕСТИБЮЛІ ══
// Відповідальність: вестибюлі з "vestibule_closed": true у exits_catalog (stations.json)
// картка показує як «Цей вестибюль не працює». Якщо людина натисне «повідомити про
// відновлення роботи», вестибюль відкривається лише в неї (Storage), а розробнику
// через хвилину йде лист. Поки лист не пішов, «скасувати» прибирає і його.
// Невідправлені листи лежать у Storage: переживають перезапуск і відправляються,
// щойно з'явиться мережа.
// Так само працює тимчасово недоступна станція ("temporarily_closed": true на рівні
// станції): сіра на карті й у картці, «Станція запрацювала? Повідомте розробника».

import { Storage, STORAGE_KEYS } from '../core/storage.js';
import { LINE_COLOR, CLOSED_STATION_COLOR } from '../core/constants.js';

import { FORM_STATION_EDITS as FORMSPREE_URL } from '../core/forms.js';
export const REPORT_DELAY_MS = 60 * 1000;

const _key = (slug, exitId) => `${slug}|${exitId}`;

function _readList(storageKey) {
  try {
    const list = JSON.parse(Storage.get(storageKey) || '[]');
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

const _readReopened = () => _readList(STORAGE_KEYS.VESTIBULES_REOPENED);
const _readReports  = () => _readList(STORAGE_KEYS.VESTIBULE_REPORTS);
const _saveReopened = list => Storage.set(STORAGE_KEYS.VESTIBULES_REOPENED, JSON.stringify(list));
const _saveReports  = list => Storage.set(STORAGE_KEYS.VESTIBULE_REPORTS, JSON.stringify(list));

/** Чи показувати на картці заглушку замість виходу. */
export function isVestibuleClosed(slug, exit) {
  return !!exit?.vestibule_closed && !_readReopened().includes(_key(slug, exit.id));
}

/** Закритий за даними вестибюль, який людина відкрила в себе (тоді є «скасувати»). */
export function isVestibuleReopened(slug, exit) {
  return !!exit?.vestibule_closed && _readReopened().includes(_key(slug, exit.id));
}

// Ключ станції цілком (у тому ж списку, що й вестибюлі): «slug|*»
const STATION_KEY = '*';

/** Станція тимчасово не працює (за даними) і людина не відкрила її в себе. */
export function isStationClosed(s) {
  return !!s?.temporarily_closed && !_readReopened().includes(_key(s.slug, STATION_KEY));
}

/** Колір станції: гілки, а для тимчасово недоступної — сірий. */
export function stationColor(s) {
  if (isStationClosed(s)) return CLOSED_STATION_COLOR;
  return LINE_COLOR[s?.line] || 'var(--text-muted)';
}

/** Недоступна за даними станція, яку людина відкрила в себе (тоді є «скасувати»). */
export function isStationReopened(s) {
  return !!s?.temporarily_closed && _readReopened().includes(_key(s.slug, STATION_KEY));
}

/** Відкриває станцію лише на цьому пристрої і ставить лист розробнику в чергу. */
export function reopenStation(s) {
  reopenVestibule(s.slug, STATION_KEY, { station: s.name });
}

/** Скасовує відкриття станції. @returns {boolean} true — лист ще не пішов */
export function cancelStationReopen(s) {
  return cancelVestibuleReopen(s.slug, STATION_KEY);
}

/**
 * Відкриває вестибюль лише на цьому пристрої і ставить лист розробнику в чергу
 * (піде через REPORT_DELAY_MS, якщо людина не скасує).
 */
export function reopenVestibule(slug, exitId, { station = '', label = '' } = {}) {
  const key = _key(slug, exitId);
  const reopened = _readReopened();
  if (!reopened.includes(key)) _saveReopened([...reopened, key]);

  const reports = _readReports().filter(r => r.key !== key);
  reports.push({ key, station, exitId, label, at: Date.now() });
  _saveReports(reports);
  _scheduleFlush();
}

/**
 * Скасовує відкриття: вестибюль знову закритий, невідправлений лист прибрано.
 * @returns {boolean} true — лист ще не пішов і його скасовано
 */
export function cancelVestibuleReopen(slug, exitId) {
  const key = _key(slug, exitId);
  _saveReopened(_readReopened().filter(k => k !== key));
  const reports = _readReports();
  const left = reports.filter(r => r.key !== key);
  if (left.length !== reports.length) _saveReports(left);
  _scheduleFlush();
  return left.length !== reports.length;
}

async function _send(report) {
  const controller = new AbortController();
  const timeoutId  = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(FORMSPREE_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body:    JSON.stringify({
        station: report.station,
        changes: report.exitId === STATION_KEY
          ? 'Станція: користувач повідомляє, що вже працює'
          : `Вестибюль ${report.exitId}${report.label ? ` (${report.label})` : ''}: користувач повідомляє, що вже працює`,
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

let _timer   = null;
let _sending = false;

/** Надсилає листи, чия хвилина минула; невдалі лишаються в черзі. */
export async function flushVestibuleReports() {
  if (_sending) return;
  _sending = true;
  try {
    const due = _readReports().filter(r => Date.now() - r.at >= REPORT_DELAY_MS);
    for (const report of due) {
      if (!(await _send(report))) continue;
      // Перечитуємо: поки йшов запит, людина могла скасувати чи відкрити ще раз
      _saveReports(_readReports().filter(r => !(r.key === report.key && r.at === report.at)));
    }
  } finally {
    _sending = false;
    _scheduleFlush();
  }
}

function _scheduleFlush() {
  clearTimeout(_timer);
  _timer = null;
  const reports = _readReports();
  if (!reports.length) return;
  const nextAt = Math.min(...reports.map(r => r.at + REPORT_DELAY_MS));
  // Час минув, але лист не пішов (немає мережі) — пробуємо знову за хвилину
  const wait = nextAt > Date.now() ? nextAt - Date.now() : REPORT_DELAY_MS;
  _timer = setTimeout(flushVestibuleReports, wait);
}

/** Після Storage.init(): дослати те, що лишилося з минулого запуску. */
export function initVestibuleReports() {
  flushVestibuleReports();
  window.addEventListener('online', () => flushVestibuleReports());
}

// ── Приховані вестибюлі ──────────────────────────────────────────────────────
// "hidden": true у exits_catalog — вестибюль є в даних (виходи, координати), але
// directions на нього не посилаються, тож картка, пошук і Вибране його не бачать.
// Єдиний шлях в інтерфейс — меню правок: «+ Додати вестибюль» додає його в напрям
// як новий вихід із номерами виходів цього вестибюля.

/**
 * Приховані вестибюлі станції.
 * @param {object} s — станція (з exits_catalog)
 * @returns {Array<[string, object]>} пари [id групи, запис каталогу]
 */
export function hiddenVestibules(s) {
  return Object.entries(s?.exits_catalog || {}).filter(([, v]) => v?.hidden);
}

/** «виходи 6, 7» / «вихід 3» для запису каталогу. */
export function vestibuleExitsText(item) {
  const nums = (item?.exit_numbers || []).map(e => e.num).filter(Boolean);
  if (!nums.length) return '';
  return `${nums.length > 1 ? 'виходи' : 'вихід'} ${nums.join(', ')}`;
}
