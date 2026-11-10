// ══ РЕЖИМ РОЗРОБНИКА: data.js ══
// Дані розробника в Storage: перевірені позиції, нотатки по виходах,
// підтвердження/виправлення, беклог, нотатки станцій, статуси «Виходи зі станцій».
// Частина src/features/devmode.js (публічне API — там).

import { STORAGE_KEYS, Storage } from '../../core/storage.js';
import { emptyConfirmationData as _emptyConfirmationData } from '../../domain/devMerge.js';
import { _ensureDevKeysMigrated, _requestSync, _touchSyncTimestamp } from './sync.js';

// ── Верифіковані позиції ─────────────────────────────
/**
 * @param {string} slug
 * @param {number} posIdx
 * @returns {boolean} true якщо позицію остаточно підтверджено (100%) в dev-режимі
 */
export function isVerified(slug, posIdx) {
  return !!getConfirmationData(slug, posIdx).finalConfirmed;
}

// ── Нотатки ──────────────────────────────────────────
/**
 * Повертає нотатку розробника для позиції або порожній рядок.
 * @param {string} slug
 * @param {number} posIdx
 * @returns {string}
 */
export function getDevNote(slug, posIdx) {
  _ensureDevKeysMigrated();
  try {
    const notes = JSON.parse(Storage.get(STORAGE_KEYS.DEV_NOTES) || '{}');
    const raw = notes[slug]?.[posIdx];
    if (!raw) return '';
    if (typeof raw === 'string') return raw;  // legacy
    if (raw.d) return '';                     // tombstone
    return raw.v ?? '';
  } catch(e) { return ''; }
}

/**
 * Зберігає або видаляє нотатку розробника для позиції.
 * Порожній text — видаляє запис.
 * @param {string} slug
 * @param {number} posIdx
 * @param {string} text
 */
export function setDevNote(slug, posIdx, text) {
  _ensureDevKeysMigrated();
  try {
    const notes = JSON.parse(Storage.get(STORAGE_KEYS.DEV_NOTES) || '{}');
    if (!notes[slug]) notes[slug] = {};
    const now = Date.now();
    // Tombstone: замість delete записуємо { d: true, t: now } — щоб
    // наступний merge не відновив нотатку зі старого хмарного запису.
    notes[slug][posIdx] = text
      ? { v: text, t: now }
      : { d: true,  t: now };
    Storage.set(STORAGE_KEYS.DEV_NOTES, JSON.stringify(notes));
    _requestSync(true);
  } catch(e) {}
}

/** @returns {Record<string, Record<string,string>>} усі нотатки: {slug: {posIdx: текст}} */
export function getAllDevNotes() {
  _ensureDevKeysMigrated();
  try { return JSON.parse(Storage.get(STORAGE_KEYS.DEV_NOTES) || '{}'); }
  catch(e) { return {}; }
}

/** @returns {Record<string, Record<string,boolean>>} усі позначки перевірки: {slug: {posIdx: true}} */
export function getAllDevVerified() {
  try { return JSON.parse(Storage.get(STORAGE_KEYS.DEV_VERIFIED) || '{}'); }
  catch(e) { return {}; }
}

// ── Лічильник підтверджень + пропозиції виправлень ────
// Єдине джерело істини для стану "перевірено": isVerified() тепер читає
// звідси (finalConfirmed), окремого сховища DEV_VERIFIED більше не пишемо.
// confirmCount/disputeCount — прості лічильники "+1"/"-1"; corrections —
// які саме вагон/двері пропонували замість поточних і скільки разів кожен
// варіант (щоб бачити консенсус). lastAction зберігає знімок стану ПЕРЕД
// останньою дією — для одноразового "Скасувати останню дію".
export function _readConfirmationsRaw() {
  try { return JSON.parse(Storage.get(STORAGE_KEYS.DEV_CONFIRMATIONS) || '{}'); }
  catch(e) { return {}; }
}

function _readConfirmations() {
  _ensureDevKeysMigrated();
  return _readConfirmationsRaw();
}

export function _writeConfirmations(data) {
  Storage.set(STORAGE_KEYS.DEV_CONFIRMATIONS, JSON.stringify(data));
  _touchSyncTimestamp();
}

/** @returns {{finalConfirmed:boolean, confirmCount:number, disputeCount:number, corrections:Record<string,number>, lastAction:object|null}} */
export function getConfirmationData(slug, posIdx) {
  const all = _readConfirmations();
  return all[slug]?.[posIdx] || _emptyConfirmationData();
}

/** @returns {object} усі дані підтверджень (для sync-пейлоада) */
export function getAllDevConfirmations() {
  return _readConfirmations();
}

// Внутрішній хелпер: застосовує мутацію, зберігаючи знімок "до" для undo.
function _mutateConfirmation(slug, posIdx, actionType, mutator) {
  const all = _readConfirmations();
  if (!all[slug]) all[slug] = {};
  const current = all[slug][posIdx] || _emptyConfirmationData();
  const { lastAction: _prev, ...snapshot } = current; // знімок без вкладеного lastAction — щоб не росло вглиб
  const next = mutator({ ...current });
  next.lastAction = { type: actionType, prevSnapshot: snapshot };
  next.updatedAt = Date.now();
  all[slug][posIdx] = next;
  _writeConfirmations(all);
  return next;
}

/** "+1" — підтвердити, що дані на місці правильні. Повертає нові дані позиції. */
export function incrementConfirmCount(slug, posIdx) {
  return _mutateConfirmation(slug, posIdx, 'confirm', d => ({ ...d, confirmCount: d.confirmCount + 1 }));
}

/**
 * "-1" — позначити розбіжність і додати голос за конкретне виправлення
 * (вагон/двері). Повертає нові дані позиції.
 */
export function addDisputeVote(slug, posIdx, wagon, doors) {
  return _mutateConfirmation(slug, posIdx, 'dispute', d => {
    const corrections = { ...d.corrections };
    const key = `${wagon}/${doors}`;
    corrections[key] = (corrections[key] || 0) + 1;
    // 100% і "є спростування" не можуть існувати одночасно — спростування
    // одразу знімає остаточне підтвердження.
    return { ...d, finalConfirmed: false, disputeCount: d.disputeCount + 1, corrections };
  });
}

/** "100%" — остаточне підтвердження. Повертає нові дані позиції. */
export function setFinalConfirmed(slug, posIdx) {
  return _mutateConfirmation(slug, posIdx, 'final', d => ({ ...d, finalConfirmed: true }));
}

// _forcePushPositionToCloud видалено — замінено на _requestSync(true).
// Tombstone-запис у confirmations (resetAt) гарантує, що merge не відновить
// старі дані з хмари навіть якщо синк відбудеться із затримкою.

// _forcePushNotesToCloud видалено — замінено на _requestSync(true).
// Tombstone { d:true, t } у notes гарантує передачу видалення через merge.

// _forcePushStationNoteToCloud видалено — замінено на _requestSync(true).
// Tombstone { d:true, t } у stationNotes передає видалення через merge.

/**
 * Скасовує ОСТАННЮ дію (один рівень назад) — повертає стан, який був
 * безпосередньо перед нею. Повторний виклик без нової дії між ними нічого
 * більше не скасує (lastAction одноразовий).
 * @returns {object} відновлені дані позиції
 */
export function undoLastConfirmAction(slug, posIdx) {
  const all = _readConfirmations();
  const current = all[slug]?.[posIdx];
  if (!current?.lastAction) return current || _emptyConfirmationData();

  const restored = {
    ..._emptyConfirmationData(),
    ...current.lastAction.prevSnapshot,
    lastAction: null,
    updatedAt: Date.now(),
  };
  if (!all[slug]) all[slug] = {};
  all[slug][posIdx] = restored;
  Storage.set(STORAGE_KEYS.DEV_CONFIRMATIONS, JSON.stringify(all));
  _requestSync(true);
  return restored;
}

/** Повністю скидає лічильник/статус цієї позиції до порожнього стану.
 *  Замість видалення ключа записує tombstone { resetAt, updatedAt } —
 *  це гарантує, що наступний merge не відновить старі дані з хмари.
 */
export function resetConfirmationData(slug, posIdx) {
  const all = _readConfirmations();
  if (!all[slug]) all[slug] = {};
  const now = Date.now();
  all[slug][posIdx] = { ..._emptyConfirmationData(), resetAt: now, updatedAt: now };
  Storage.set(STORAGE_KEYS.DEV_CONFIRMATIONS, JSON.stringify(all));
  _requestSync(true); // єдина черга — не force-push
  return _emptyConfirmationData();
}

/** @returns {string} поточний текст беклогу розробника */
export function getDevBacklog() {
  return Storage.get(STORAGE_KEYS.DEV_BACKLOG) || '';
}

const BACKLOG_SAVE_DEBOUNCE_MS = 800;
let _backlogSaveTimer = null;

/**
 * Зберігає текст беклогу з невеликим дебаунсом (щоб не смикати
 * _touchSyncTimestamp на кожен символ під час набору).
 * @param {string} text
 */
export function setDevBacklog(text) {
  clearTimeout(_backlogSaveTimer);
  _backlogSaveTimer = setTimeout(() => {
    Storage.set(STORAGE_KEYS.DEV_BACKLOG, text);
    Storage.set(STORAGE_KEYS.DEV_BACKLOG_T, String(Date.now()));
    _touchSyncTimestamp();
  }, BACKLOG_SAVE_DEBOUNCE_MS);
}

// ── Загальна нотатка станції (не по конкретному виходу, а по станції в цілому) ──
function _readStationNotes() {
  try { return JSON.parse(Storage.get(STORAGE_KEYS.DEV_STATION_NOTES) || '{}'); }
  catch(e) { return {}; }
}

/** @returns {string} загальна нотатка станції (порожній рядок, якщо нема або tombstone) */
export function getStationNote(slug) {
  const raw = _readStationNotes()[slug];
  if (!raw) return '';
  if (typeof raw === 'string') return raw;  // legacy
  if (raw.d) return '';                     // tombstone
  return raw.v ?? '';
}

/** @returns {Record<string,string>} усі загальні нотатки станцій — для sync-пейлоада */
export function getAllStationNotes() {
  return _readStationNotes();
}

const STATION_NOTE_SAVE_DEBOUNCE_MS = 800;
let _stationNoteSaveTimer = null;

/** Зберігає загальну нотатку станції з дебаунсом. */
export function setStationNote(slug, text, debounce = true) {
  clearTimeout(_stationNoteSaveTimer);
  const doSave = () => {
    const all = _readStationNotes();
    const now = Date.now();
    // Tombstone замість delete — щоб видалення дійшло до іншого пристрою
    all[slug] = text ? { v: text, t: now } : { d: true, t: now };
    Storage.set(STORAGE_KEYS.DEV_STATION_NOTES, JSON.stringify(all));
    _requestSync(true);
  };

  if (debounce) {
    _stationNoteSaveTimer = setTimeout(doSave, STATION_NOTE_SAVE_DEBOUNCE_MS);
  } else {
    doSave();
  }
}

// ── Перевірені виходи зі станцій (ручна верифікація exits_catalog) ──────────

function _readExitsVerified() {
  try { return JSON.parse(Storage.get(STORAGE_KEYS.DEV_EXITS_VERIFIED) || '{}'); }
  catch(e) { return {}; }
}

function _writeExitsVerified(data) {
  Storage.set(STORAGE_KEYS.DEV_EXITS_VERIFIED, JSON.stringify(data));
}

/**
 * Повертає true якщо виходи станції були вручну позначені як перевірені.
 * @param {string} slug
 * @returns {boolean}
 */
/**
 * Повертає статус перевірки каталогу виходів: 'unverified' | 'partial' | 'full'
 * Підтримує як старий формат ('partial'/'full'/true), так і новий {count, total}.
 * @param {string} slug
 * @returns {'unverified'|'partial'|'full'}
 */
export function getExitsCatalogStatus(slug) {
  const val = _readExitsVerified()[slug];
  if (!val) return 'unverified';
  if (val === true || val === 'full') return 'full';
  if (val === 'partial') return 'partial';
  // Новий формат: { count, total }
  if (typeof val === 'object' && val !== null) {
    if (val.count >= val.total) return 'full';
    if (val.count > 0) return 'partial';
  }
  return 'unverified';
}

/**
 * Повертає лічильник підтверджених/загальних виходів для станції.
 * Якщо станція у стані 'full' без лічильника — повертає { count: total, total }.
 * @param {string} slug
 * @param {number} total  — загальна кількість пронумерованих виходів
 * @returns {{ count: number, total: number }}
 */
export function getExitsCatalogCount(slug, total) {
  const val = _readExitsVerified()[slug];
  if (!val) return { count: 0, total };
  if (val === true || val === 'full') return { count: total, total };
  if (val === 'partial') return { count: 0, total };
  if (typeof val === 'object' && val !== null) {
    return { count: val.count ?? 0, total: val.total ?? total };
  }
  return { count: 0, total };
}

/**
 * Циклічно переходить між станами: unverified → partial(1) → partial(2) → … → full → unverified.
 * Якщо лічильник досягає total — встановлює 'full'.
 * @param {string} slug
 * @param {number} total  — загальна кількість пронумерованих виходів
 * @returns {'unverified'|'partial'|'full'}  — новий статус
 */
export function cycleExitsCatalogStatus(slug, total) {
  const data = _readExitsVerified();
  const val  = data[slug];

  // full → скидаємо
  if (val === true || val === 'full') {
    delete data[slug];
    _writeExitsVerified(data);
    return 'unverified';
  }

  // { count, total } → інкремент
  if (typeof val === 'object' && val !== null) {
    const next = (val.count ?? 0) + 1;
    if (next >= total) {
      data[slug] = 'full';
      _writeExitsVerified(data);
      return 'full';
    }
    data[slug] = { count: next, total };
    _writeExitsVerified(data);
    return 'partial';
  }

  // unverified / 'partial' (старий формат) → перший клік: кольорова галочка без лічильника
  if (!val || val === 'partial') {
    if (total <= 1) {
      data[slug] = 'full';
      _writeExitsVerified(data);
      return 'full';
    }
    data[slug] = { count: 1, total };
    _writeExitsVerified(data);
    return 'partial';
  }

  return 'unverified';
}

export function isExitsCatalogVerified(slug) {
  return getExitsCatalogStatus(slug) === 'full';
}

/**
 * Позначає виходи станції як частково перевірені (legacy, зберігається для сумісності).
 * @param {string} slug
 */
export function setExitsCatalogPartial(slug) {
  const data = _readExitsVerified();
  data[slug] = 'partial';
  _writeExitsVerified(data);
}

/**
 * Позначає виходи станції як повністю перевірені.
 * @param {string} slug
 */
export function setExitsCatalogVerified(slug) {
  const data = _readExitsVerified();
  data[slug] = 'full';
  _writeExitsVerified(data);
}

/**
 * Скидає ручне позначення «виходи перевірені» для станції.
 * @param {string} slug
 */
export function resetExitsCatalogVerified(slug) {
  const data = _readExitsVerified();
  delete data[slug];
  _writeExitsVerified(data);
}

/**
 * Повертає об'єкт усіх ручних верифікацій виходів (для sync-пейлоада).
 * @returns {Object}
 */
export function getAllExitsVerified() {
  return _readExitsVerified();
}
