// ══ FEATURE: РЕЖИМ РОЗРОБНИКА (DEV MODE) ══
// Відповідальність: перегляд і верифікація даних позицій безпосередньо у UI станції.
// Активується прихованим жестом (5 тапів на футері About-шторки).
//
// Публічне API:
//   isDevMode()                          → boolean
//   toggleDevMode()                      → boolean
//   getDevLog()                          → LogEntry[]
//   appendDevLog(entry)                  → void
//   isVerified(slug, posIdx)             → boolean (= остаточно підтверджено, 100%)
//   getConfirmationData(slug, posIdx)    → {finalConfirmed, confirmCount, disputeCount, corrections, lastAction}
//   incrementConfirmCount(slug, posIdx)  → object (нові дані)
//   addDisputeVote(slug, posIdx, w, d)   → object (нові дані)
//   setFinalConfirmed(slug, posIdx)      → object (нові дані)
//   undoLastConfirmAction(slug, posIdx)  → object (відновлені дані)
//   resetConfirmationData(slug, posIdx)  → object (порожні дані)
//   getDevNote(slug, posIdx)             → string
//   setDevNote(slug, posIdx, text)       → void
//   attachDevModeUI(container, slug)     → void
//   showDevModeToast(active)             → void
//   updateDevModeIndicator(sheet, active)→ void
//   setupDevModeTapCounter(aboutSheet)   → void


const DEV_CHECK_SVG = `<svg viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path fill="currentColor" d="M14.83 4.89l1.34.94-5.81 8.38H9.02L5.78 9.67l1.34-1.25 2.57 2.4z"/></svg>`;

const DEV_NOTE_SVG = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="none"><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 8h14M5 12h14M5 16h6"/></svg>`;

const DEV_PHOTO_SVG = `<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><rect x="3" y="6" fill="none" stroke="currentColor" stroke-width="2" stroke-miterlimit="10" width="26" height="20"/><polyline fill="none" stroke="currentColor" stroke-width="2" stroke-miterlimit="10" points="3,22.3 11,14.3 22.5,25.9 "/><polyline fill="none" stroke="currentColor" stroke-width="2" stroke-miterlimit="10" points="17.4,20.9 22,16.3 28.9,23.2 "/></svg>`;
// Лічильник підтверджень — кругла стрілка (те саме "оновити/повторно перевірити")
const DEV_CONFIRM_SVG = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>`;

import { STORAGE_KEYS, Storage } from '../core/storage.js';
import { state }                  from '../core/state.js';
import { PhotoStorage }           from '../data/photoStorage.js';
import { bus }        from '../core/eventBus.js';
import { LINE_COLOR } from '../core/constants.js';
import { renderFeedbackPositions } from './feedback/fbRenderer.js';
import { onDevAuthChange, getCurrentDevUser, loginDev, logoutDev, uploadDevState, downloadDevState, uploadDevPhoto, listDevPhotoIds, downloadDevPhoto } from '../services/firebaseSync.js';



// ── Активація / деактивація ──────────────────────────
/** Повертає true якщо режим розробника активний. */
export function isDevMode() {
  return Storage.get(STORAGE_KEYS.DEV_MODE) === 'true';
}

/** Перемикає режим розробника. Повертає новий стан. */
export function toggleDevMode() {
  const next = !isDevMode();
  Storage.set(STORAGE_KEYS.DEV_MODE, String(next));
  return next;
}

// ── Локальний таймстамп останньої зміни (планування автосинку) ──
// DEV_SYNC_LOCAL_TS більше не бере участі у порівнянні "хто новіший" —
// синхронізація тепер об'єднує дані, а не обирає переможця цілим блоком
// (див. _performFullSync нижче). Таймстамп лишається лише як тригер
// для _scheduleAutoSync().
function _touchSyncTimestamp() {
  Storage.set(STORAGE_KEYS.DEV_SYNC_LOCAL_TS, String(Date.now()));
  _scheduleAutoSync();
}

// ── Реактивний стан авторизації Firebase ──────────────
// auth.currentUser відновлюється з IndexedDB асинхронно — одразу після
// getAuth() він майже завжди null, навіть для вже залогіненого розробника.
// Тому весь UI орієнтується на цю підписку (onDevAuthChange), а не на
// currentUser напряму.
let _devUser              = null;
let _devAuthResolved      = false;
let _lastDevAuthContainer = null; // контейнер форми входу в меню розробника — щоб перемалювати при зміні auth
let _lastAboutSheet       = null; // остання відкрита About-шторка — щоб оновити іконку швидкого синку

onDevAuthChange(user => {
  _devUser         = user;
  _devAuthResolved = true;
  if (_lastDevAuthContainer?.isConnected) {
    renderDevAuthSection(_lastDevAuthContainer);
  }
  if (_lastAboutSheet?.isConnected) {
    updateDevModeIndicator(_lastAboutSheet, isDevMode());
  }
});

// ── Синхронізація: спільний "зайнятий"-прапорець ──────
// Без цього автосинк (за таймером) і ручна кнопка могли одночасно вдарити
// в Firestore — не критично для цілісності даних (обидва пишуть у той самий
// документ), але непередбачувано щодо того, чий запит "виграє". Прапорець
// гарантує, що в моменті синхронізується щось одне.
let _syncInFlight = false;

/**
 * Повна синхронізація: якщо в хмарі дані новіші за локальні (за updatedAt) —
 * застосовує їх локально, інакше — вивантажує локальний стан. Правило
 * "останній запис виграє цілком", не по-польове злиття.
 * @returns {Promise<'downloaded'|'uploaded'|'busy'>}
 */
// ── Об'єднання даних синхронізації (адитивне, без видалень) ──
// Принцип: синхронізація нічого не знищує, лише збагачує. Ніякого
// "хто новіший — той і виграє цілком": для кожного запису з обох боків
// беремо те, що є, і ніколи не викидаємо наявне. Якщо один і той самий
// запис (нотатка на ту саму позицію) відрізняється на двох пристроях —
// перевага локальному (він щойно на екрані користувача), а хмарне значення
// не губиться назавжди — воно просто не потрапляє в цей конкретний ключ,
// але залишається в документі хмари, доки хтось явно не перезапише.
function _mergeKeyedMap(local, cloud) {
  const merged = {};
  const outerKeys = new Set([...Object.keys(local || {}), ...Object.keys(cloud || {})]);
  for (const key of outerKeys) {
    merged[key] = { ...(cloud?.[key] || {}), ...(local?.[key] || {}) };
  }
  return merged;
}

function _mergeConfirmations(local, cloud) {
  const merged = {};
  const slugs = new Set([...Object.keys(local || {}), ...Object.keys(cloud || {})]);
  for (const slug of slugs) {
    merged[slug] = {};
    const posIdxs = new Set([...Object.keys(local?.[slug] || {}), ...Object.keys(cloud?.[slug] || {})]);
    for (const posIdx of posIdxs) {
      const l = local?.[slug]?.[posIdx]  || _emptyConfirmationData();
      const c = cloud?.[slug]?.[posIdx]  || _emptyConfirmationData();
      // Лічильники монотонно зростають — беремо максимум, а не суму
      // (сума задвоїла б цифру при кожній повторній синхронізації).
      // finalConfirmed — якщо хоч десь підтверджено остаточно, лишається так назавжди (OR).
      merged[slug][posIdx] = {
        finalConfirmed: !!(l.finalConfirmed || c.finalConfirmed),
        confirmCount:   Math.max(l.confirmCount   || 0, c.confirmCount   || 0),
        disputeCount:   Math.max(l.disputeCount   || 0, c.disputeCount   || 0),
        corrections:    (() => {
          const corrections = {};
          const keys = new Set([...Object.keys(l.corrections || {}), ...Object.keys(c.corrections || {})]);
          for (const k of keys) corrections[k] = Math.max(l.corrections?.[k] || 0, c.corrections?.[k] || 0);
          return corrections;
        })(),
        lastAction: l.lastAction || null, // undo стосується лише локальних дій цього пристрою
      };
    }
  }
  return merged;
}

/** Похідний {slug:{posIdx:true}} з finalConfirmed — для сумісного формату дроту у Firestore. */
function _deriveVerifiedFromConfirmations(confirmations) {
  const verified = {};
  for (const slug of Object.keys(confirmations || {})) {
    for (const posIdx of Object.keys(confirmations[slug] || {})) {
      if (confirmations[slug][posIdx]?.finalConfirmed) {
        if (!verified[slug]) verified[slug] = {};
        verified[slug][posIdx] = true;
      }
    }
  }
  return verified;
}

/** Додає finalConfirmed=true у confirmations за хмарним verified-полем (лише додає, ніколи не знімає). */
function _applyCloudVerifiedIntoConfirmations(confirmations, cloudVerified) {
  if (!cloudVerified) return confirmations;
  const result = { ...confirmations };
  for (const slug of Object.keys(cloudVerified)) {
    if (!result[slug]) result[slug] = {};
    for (const posIdx of Object.keys(cloudVerified[slug])) {
      const current = result[slug][posIdx] || _emptyConfirmationData();
      result[slug][posIdx] = { ...current, finalConfirmed: true };
    }
  }
  return result;
}

function _mergeBacklog(local, cloud) {
  const l = (local || '').trim();
  const c = (cloud || '').trim();
  if (!l) return c;
  if (!c) return l;
  if (l === c) return l;
  // Обидва боки мають різний текст — не обираємо один замість іншого,
  // а зберігаємо обидва, щоб нічого не загубилось.
  return c && !l.includes(c) ? `${l}\n\n— з іншого пристрою —\n${c}` : l;
}

/** Той самий принцип, що й _mergeBacklog, але для {slug: текст} — по кожній станції окремо. */
function _mergeStationNotes(local, cloud) {
  const merged = {};
  const slugs = new Set([...Object.keys(local || {}), ...Object.keys(cloud || {})]);
  for (const slug of slugs) {
    const text = _mergeBacklog(local?.[slug], cloud?.[slug]);
    if (text) merged[slug] = text;
  }
  return merged;
}

async function _performFullSync() {
  if (_syncInFlight) return 'busy';
  _syncInFlight = true;
  try {
    const cloudData = await downloadDevState();

    const localNotes         = JSON.parse(Storage.get(STORAGE_KEYS.DEV_NOTES)    || '{}');
    const localBacklog       = Storage.get(STORAGE_KEYS.DEV_BACKLOG) || '';
    const localConfirmations = getAllDevConfirmations();
    const localStationNotes  = getAllStationNotes();

    let mergedNotes         = localNotes;
    let mergedBacklog       = localBacklog;
    let mergedConfirmations = localConfirmations;
    let mergedStationNotes  = localStationNotes;
    let changed = false;

    if (cloudData) {
      mergedNotes         = _mergeKeyedMap(localNotes, cloudData.notes);
      mergedBacklog        = _mergeBacklog(localBacklog, cloudData.backlog);
      mergedConfirmations  = _mergeConfirmations(localConfirmations, cloudData.confirmations);
      mergedStationNotes   = _mergeStationNotes(localStationNotes, cloudData.stationNotes);
      // "verified" — застарілий формат дроту (до появи finalConfirmed) —
      // домішуємо додатково, щоб старі синхронізовані дані не загубились.
      mergedConfirmations  = _applyCloudVerifiedIntoConfirmations(mergedConfirmations, cloudData.verified);

      changed = JSON.stringify(mergedNotes)    !== JSON.stringify(localNotes)
             || mergedBacklog                   !== localBacklog
             || JSON.stringify(mergedConfirmations) !== JSON.stringify(localConfirmations)
             || JSON.stringify(mergedStationNotes)  !== JSON.stringify(localStationNotes);

      if (changed) {
        Storage.set(STORAGE_KEYS.DEV_NOTES,         JSON.stringify(mergedNotes));
        Storage.set(STORAGE_KEYS.DEV_BACKLOG,       mergedBacklog);
        Storage.set(STORAGE_KEYS.DEV_CONFIRMATIONS, JSON.stringify(mergedConfirmations));
        Storage.set(STORAGE_KEYS.DEV_STATION_NOTES, JSON.stringify(mergedStationNotes));
        bus.emit('station:refresh');
        bus.emit('devmenu:refresh');
      }
    }

    const verifiedForWire = _deriveVerifiedFromConfirmations(mergedConfirmations);
    await uploadDevState(mergedNotes, verifiedForWire, mergedBacklog, mergedConfirmations, mergedStationNotes);
    await _syncPhotos();

    return changed ? 'downloaded' : 'uploaded';
  } finally {
    _syncInFlight = false;
  }
}

/**
 * Синхронізація фото — так само адитивна: вивантажуємо локальні, яких ще
 * нема в хмарі, довантажуємо хмарні, яких ще нема локально. Ніколи нічого
 * не видаляємо в жодному з напрямків.
 */
async function _syncPhotos() {
  const localPhotos = await PhotoStorage.getAllPhotos();
  const localIds    = new Set(Object.keys(localPhotos));
  const cloudIds    = new Set(await listDevPhotoIds());

  const toUpload = [...localIds].filter(id => !cloudIds.has(id));
  await Promise.all(toUpload.map(id => uploadDevPhoto(id, localPhotos[id])));

  const toDownloadIds = [...cloudIds].filter(id => !localIds.has(id));
  const downloaded = await Promise.all(toDownloadIds.map(id => downloadDevPhoto(id).then(dataUrl => [id, dataUrl])));
  if (downloaded.length) {
    const photosMap = Object.fromEntries(downloaded);
    await PhotoStorage.bulkSavePhotos(photosMap);
  }
}

// ── Автосинхронізація після кожної правки ─────────────
// Спрацьовує лише якщо розробник вже залогінений у Firebase — інакше
// довелось би самим показувати форму входу при кожній правці, а це вже
// нав'язливо. Дебаунс 1.5с — щоб кілька швидких правок поспіль злились
// в один мережевий запит.
const AUTO_SYNC_DEBOUNCE_MS = 1500;
let _autoSyncTimer = null;

function _scheduleAutoSync() {
  if (!_devUser) return;

  clearTimeout(_autoSyncTimer);
  _autoSyncTimer = setTimeout(async () => {
    try {
      const result = await _performFullSync();
      if (result !== 'busy') console.log('[KyivMetroGO] Автосинхронізація Firebase успішна:', result);
    } catch (err) {
      console.warn('[KyivMetroGO] Автосинхронізація Firebase не вдалась:', err);
    }
  }, AUTO_SYNC_DEBOUNCE_MS);
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
  try {
    const notes = JSON.parse(Storage.get(STORAGE_KEYS.DEV_NOTES) || '{}');
    return notes[slug]?.[posIdx] || '';
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
  try {
    const notes = JSON.parse(Storage.get(STORAGE_KEYS.DEV_NOTES) || '{}');
    if (!notes[slug]) notes[slug] = {};
    if (text) notes[slug][posIdx] = text;
    else {
      delete notes[slug][posIdx];
      if (!Object.keys(notes[slug]).length) delete notes[slug];
    }
    Storage.set(STORAGE_KEYS.DEV_NOTES, JSON.stringify(notes));
    _touchSyncTimestamp();
  } catch(e) {}
}

/** @returns {Record<string, Record<string,string>>} усі нотатки: {slug: {posIdx: текст}} */
export function getAllDevNotes() {
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
function _readConfirmations() {
  try { return JSON.parse(Storage.get(STORAGE_KEYS.DEV_CONFIRMATIONS) || '{}'); }
  catch(e) { return {}; }
}

function _writeConfirmations(data) {
  Storage.set(STORAGE_KEYS.DEV_CONFIRMATIONS, JSON.stringify(data));
  _touchSyncTimestamp();
}

function _emptyConfirmationData() {
  return { finalConfirmed: false, confirmCount: 0, disputeCount: 0, corrections: {}, lastAction: null };
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
  const { lastAction, ...snapshot } = current; // знімок без вкладеного lastAction — щоб не росло вглиб
  const next = mutator({ ...current });
  next.lastAction = { type: actionType, prevSnapshot: snapshot };
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

/**
 * Примусово синхронізує ОДНУ конкретну позицію з хмарою одразу, в обхід
 * звичайного адитивного merge. Потрібно для скидання/скасування — це свідомі
 * дії користувача, тож вони мають право перезаписати хмару саме для цього
 * запису; інакше наступний автосинк (merge "бере максимум") просто підтягне
 * старе значення назад із хмари, і скидання виглядатиме так, ніби нічого
 * не відбулось.
 */
async function _forcePushPositionToCloud(slug, posIdx) {
  if (!_devUser) return; // немає сесії — нема куди штовхати; локальний стан і так вже вірний
  try {
    const cloudData = await downloadDevState();
    const cloudConfirmations = cloudData?.confirmations ? { ...cloudData.confirmations } : {};
    const localEntry = _readConfirmations()[slug]?.[posIdx];

    if (!cloudConfirmations[slug]) cloudConfirmations[slug] = {};
    if (localEntry) {
      cloudConfirmations[slug][posIdx] = localEntry;
    } else {
      delete cloudConfirmations[slug][posIdx];
      if (!Object.keys(cloudConfirmations[slug]).length) delete cloudConfirmations[slug];
    }

    const notes        = cloudData?.notes   || JSON.parse(Storage.get(STORAGE_KEYS.DEV_NOTES) || '{}');
    const backlog      = cloudData?.backlog ?? (Storage.get(STORAGE_KEYS.DEV_BACKLOG) || '');
    const stationNotes = cloudData?.stationNotes || getAllStationNotes();
    const verified     = _deriveVerifiedFromConfirmations(cloudConfirmations);
    await uploadDevState(notes, verified, backlog, cloudConfirmations, stationNotes);
  } catch (err) {
    console.warn('[KyivMetroGO] Не вдалося одразу синхронізувати скидання/скасування з хмарою — підхопиться при наступній синхронізації:', err);
  }
}

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

  const restored = { ..._emptyConfirmationData(), ...current.lastAction.prevSnapshot, lastAction: null };
  if (!all[slug]) all[slug] = {};
  all[slug][posIdx] = restored;
  // Пишемо напряму (без _writeConfirmations/_touchSyncTimestamp) — примусовий
  // пуш нижче сам подбає про хмару, дублювати звичайний автосинк тут не треба.
  Storage.set(STORAGE_KEYS.DEV_CONFIRMATIONS, JSON.stringify(all));
  _forcePushPositionToCloud(slug, posIdx);
  return restored;
}

/** Повністю скидає лічильник/статус цієї позиції до порожнього стану. */
export function resetConfirmationData(slug, posIdx) {
  const all = _readConfirmations();
  if (all[slug]) {
    delete all[slug][posIdx];
    if (!Object.keys(all[slug]).length) delete all[slug];
  }
  Storage.set(STORAGE_KEYS.DEV_CONFIRMATIONS, JSON.stringify(all));
  _forcePushPositionToCloud(slug, posIdx);
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
    _touchSyncTimestamp();
  }, BACKLOG_SAVE_DEBOUNCE_MS);
}

// ── Загальна нотатка станції (не по конкретному виходу, а по станції в цілому) ──
function _readStationNotes() {
  try { return JSON.parse(Storage.get(STORAGE_KEYS.DEV_STATION_NOTES) || '{}'); }
  catch(e) { return {}; }
}

/** @returns {string} загальна нотатка станції (порожній рядок, якщо нема) */
export function getStationNote(slug) {
  return _readStationNotes()[slug] || '';
}

/** @returns {Record<string,string>} усі загальні нотатки станцій — для sync-пейлоада */
export function getAllStationNotes() {
  return _readStationNotes();
}

const STATION_NOTE_SAVE_DEBOUNCE_MS = 800;
let _stationNoteSaveTimer = null;

/** Зберігає загальну нотатку станції з дебаунсом. */
export function setStationNote(slug, text) {
  clearTimeout(_stationNoteSaveTimer);
  _stationNoteSaveTimer = setTimeout(() => {
    const all = _readStationNotes();
    if (text) all[slug] = text;
    else delete all[slug];
    Storage.set(STORAGE_KEYS.DEV_STATION_NOTES, JSON.stringify(all));
    _touchSyncTimestamp();
  }, STATION_NOTE_SAVE_DEBOUNCE_MS);
}

/**
 * Показує/ховає кнопку загальної нотатки станції (праворуч від серця) і
 * прив'язує відкриття панелі. Викликається при кожному відкритті/оновленні
 * картки станції — так само, як attachDevModeUI.
 * @param {HTMLElement} sheet  — #stationSheet (не sheetBody — кнопка й панель поза ним)
 * @param {string} slug
 * @param {string} lineColor
 */
// Останній slug, для якого малювалась кнопка/панель нотатки станції —
// щоб при переході на ІНШУ станцію панель гарантовано закривалась і
// очищалась (інакше нотатка з попередньої станції "протікала" на нову,
// поки її не закриють руками).
let _lastStationNoteSlug = null;

export function setupDevStationNoteButton(sheet, slug, lineColor) {
  const btn   = sheet.querySelector('#devStationNoteBtn');
  const panel = sheet.querySelector('#devStationNotePanel');
  if (!btn || !panel) return;

  const active = isDevMode();
  btn.classList.toggle('is-hidden', !active);
  if (!active) {
    panel.classList.remove('panel-open');
    panel.innerHTML = '';
    _lastStationNoteSlug = null;
    return;
  }

  if (slug !== _lastStationNoteSlug) {
    // Це інша станція, ніж та, для якої панель могла бути відкрита —
    // закриваємо й чистимо вміст, щоб чужа нотатка не малювалась тут.
    panel.classList.remove('panel-open');
    panel.innerHTML = '';
    _lastStationNoteSlug = slug;
  }

  // Орієнтир видимості — той самий сірий, що й у хрестика закриття шторки
  const defaultColor = 'var(--text-muted)';
  btn.innerHTML = DEV_NOTE_SVG;

  const hasNote = !!getStationNote(slug);
  btn.style.color = hasNote ? lineColor : defaultColor;

  btn.onclick = e => {
    e.stopPropagation();
    _toggleStationNotePanel(panel, slug, lineColor, btn, defaultColor);
  };
}

function _toggleStationNotePanel(panel, slug, lineColor, btn, defaultColor) {
  if (panel.classList.contains('panel-open')) {
    panel.classList.remove('panel-open');
    return;
  }

  const currentText = getStationNote(slug);
  panel.innerHTML = `
    <textarea class="dev-note-textarea dev-station-note-textarea" placeholder="Загальна нотатка по станції…">${currentText}</textarea>
    <div class="dev-note-actions">
      <button type="button" class="dev-station-note-close confirm-main-btn confirm-btn-neutral">Готово</button>
    </div>`;

  const textarea = panel.querySelector('textarea');
  textarea.addEventListener('input', () => {
    setStationNote(slug, textarea.value);
    btn.style.color = textarea.value ? lineColor : defaultColor;
  });

  panel.querySelector('.dev-station-note-close').addEventListener('click', e => {
    e.stopPropagation();
    panel.classList.remove('panel-open');
  });

  panel.classList.add('panel-open');
  requestAnimationFrame(() => textarea.focus());
}

// ── UI: кнопки в картці станції ──────────────────────
/**
 * Вставляє кнопки dev-режиму (верифікація, нотатка, фото) у картку станції.
 * Нічого не робить якщо isDevMode() === false.
 * @param {HTMLElement} container — зазвичай sheetBody
 * @param {string}      slug
 */
export function attachDevModeUI(container, slug) {
  if (!isDevMode()) return;
  const lineColor = LINE_COLOR[state.stationsData?.[slug]?.line] || 'var(--text-muted)';

  const defaultColor   = 'var(--border)';
  const defaultOpacity = '1';

  container.querySelectorAll('.position-row').forEach((row, posIdx) => {
    if (row.querySelector('.dev-confirm-btn')) return;

    row.dataset.devPosIdx = posIdx;
    row.dataset.devSlug   = slug;

    // ── Кнопка «Підтвердження» (єдина — замінює колишню окрему галочку) ──
    // Стани іконки:
    //  - ще ніхто не чіпав          → сіра (як і решта неактивних кнопок)
    //  - лише "+1" (без спростувань) → кольорова (колір лінії), бейдж з цифрою
    //  - є хоч одне спростування     → бейдж стає темним/чорним (сигнал "є розбіжність")
    //  - "100%" (остаточно)          → повністю змінюється на іконку галочки (як стара)
    const confirmBtn = document.createElement('button');
    confirmBtn.className = 'dev-confirm-btn';
    confirmBtn.type = 'button';

    const renderConfirmBtn = () => {
      const data = getConfirmationData(slug, posIdx);

      if (data.finalConfirmed) {
        confirmBtn.classList.remove('is-text-badge');
        confirmBtn.classList.add('is-final');
        confirmBtn.innerHTML = DEV_CHECK_SVG;
        confirmBtn.style.color   = lineColor;
        confirmBtn.style.opacity = '1';
        return;
      }

      const hasConfirm = data.confirmCount > 0;
      const hasDispute = data.disputeCount > 0;

      if (!hasConfirm && !hasDispute) {
        confirmBtn.classList.remove('is-final', 'is-text-badge');
        confirmBtn.innerHTML = DEV_CONFIRM_SVG;
        confirmBtn.style.color   = defaultColor;
        confirmBtn.style.opacity = defaultOpacity;
        return;
      }

      // Плоский текстовий індикатор замість круглого бейджа: +N — тільки
      // підтвердження, −N — тільки спростування, ±N — є і те, і те (N тут
      // це баланс confirmCount−disputeCount зі знаком). Якщо кількість
      // дорівнює 1 у "чистому" +/− випадку — цифру не пишемо, лишається
      // сам знак; для ± цифра пишеться завжди (включно з 1).
      let text;
      let badgeColor;
      if (hasConfirm && !hasDispute) {
        text = data.confirmCount === 1 ? '+' : `+${data.confirmCount}`;
        badgeColor = lineColor;
      } else if (hasDispute && !hasConfirm) {
        text = data.disputeCount === 1 ? '−' : `−${data.disputeCount}`;
        badgeColor = 'var(--bg-pill)'; // той самий темний тон, що й фон пігулки
      } else {
        // Є і підтвердження, і спростування — просто "±", без цифри
        text = '±';
        badgeColor = 'var(--bg-pill)';
      }

      confirmBtn.classList.remove('is-final');
      confirmBtn.classList.add('is-text-badge');
      confirmBtn.innerHTML = `<span class="dev-confirm-text">${text}</span>`;
      confirmBtn.style.color   = badgeColor;
      confirmBtn.style.opacity = '1';
    };
    renderConfirmBtn();

    // ── Кнопка «Нотатка» ──
    const noteBtn = document.createElement('button');
    noteBtn.className = 'dev-note-btn';
    noteBtn.type = 'button';
    noteBtn.innerHTML = DEV_NOTE_SVG;

    if (getDevNote(slug, posIdx)) {
      noteBtn.style.color   = lineColor;
      noteBtn.style.opacity = '1';
    } else {
      noteBtn.style.color   = defaultColor;
      noteBtn.style.opacity = defaultOpacity;
    }

    // ── Кнопка «Фото» ──
    const photoBtn = document.createElement('button');
    photoBtn.className = 'dev-photo-btn';
    photoBtn.type = 'button';
    photoBtn.innerHTML = DEV_PHOTO_SVG;
    photoBtn.style.color   = defaultColor;
    photoBtn.style.opacity = defaultOpacity;

    row.prepend(photoBtn, noteBtn, confirmBtn);

    listPhotosForPosition(slug, posIdx).then(photos => {
      if (photos.length) {
        photoBtn.style.color   = lineColor;
        photoBtn.style.opacity = '1';
      }
    }).catch(() => {});

    confirmBtn.addEventListener('click', e => {
      e.stopPropagation();
      toggleDevConfirmPanel(row, slug, posIdx, lineColor, renderConfirmBtn);
    });

    noteBtn.addEventListener('click', e => {
      e.stopPropagation();
      toggleDevNotePanel(row, slug, posIdx, lineColor, noteBtn, defaultColor, defaultOpacity);
    });

    photoBtn.addEventListener('click', e => {
      e.stopPropagation();
      toggleDevPhotoPanel(row, slug, posIdx, lineColor, photoBtn, defaultColor, defaultOpacity);
    });
  });
}

// ── UI: панель підтвердження / виправлення ────────────
// Інтерфейс степера вагон/двері скопійований з "Запропонувати зміни"
// (fb-input-wrap/fb-stepper/fb-step/fb-step-val у fbRenderer.js) — той самий
// вигляд, лише спрощена логіка кроку (без сусідніх дверей і другого виходу,
// тут потрібен просто прямий вибір вагон+двері). Степер стартує з ПОТОЧНИХ
// фактичних значень позиції (беремо з .fav-tap-target у самому рядку), а не
// з довільної 1/1.
function toggleDevConfirmPanel(row, slug, posIdx, lineColor, onUpdate) {
  const next = row.nextElementSibling;

  if (next?.classList.contains('dev-note-panel') && next.dataset.type === 'confirm') {
    next.classList.remove('panel-open');
    setTimeout(() => next.remove(), 280);
    return;
  }

  document.querySelectorAll('.dev-note-panel').forEach(p => {
    p.classList.remove('panel-open');
    setTimeout(() => p.remove(), 280);
  });

  // Поточні фактичні вагон/двері цієї позиції — дефолт для степера виправлення.
  const currentTarget = row.querySelector('.fav-tap-target');
  const currentWagon = parseInt(currentTarget?.dataset.wagon) || 1;
  const currentDoors = parseInt(currentTarget?.dataset.doors) || 1;

  const wId = `devConfirmW${slug}_${posIdx}`;
  const dId = `devConfirmD${slug}_${posIdx}`;

  const renderCorrectionsList = (data) => {
    const entries = Object.entries(data.corrections);
    if (!entries.length) return '';
    return `<div class="dev-confirm-corrections">
      ${entries.map(([key, count]) => {
        const [w, d] = key.split('/');
        return `<div class="dev-confirm-correction-row">Вагон ${w} / двері ${d} — ${count} ${count === 1 ? 'раз' : 'рази'}</div>`;
      }).join('')}
    </div>`;
  };

  const panel = document.createElement('div');
  panel.className = 'dev-note-panel dev-confirm-panel';
  panel.dataset.type = 'confirm';

  const paint = () => {
    const data = getConfirmationData(slug, posIdx);
    const netCount = data.confirmCount - data.disputeCount;

    panel.innerHTML = `
      <div class="dev-confirm-count-line">
        ${data.finalConfirmed
          ? '<b>Остаточно підтверджено (100%)</b>'
          : `Підтверджень: <b>${data.confirmCount}</b>, спростувань: <b>${data.disputeCount}</b> (разом: ${netCount})`}
      </div>
      ${renderCorrectionsList(data)}
      <div class="dev-note-actions dev-confirm-main-actions">
        <button type="button" class="dev-confirm-final confirm-btn-save">100%</button>
        <button type="button" class="dev-confirm-plus confirm-btn-save">+1</button>
        <button type="button" class="dev-confirm-minus confirm-btn-discard">−1</button>
      </div>
      <div class="dev-confirm-fix-wrap is-hidden">
        <div class="fb-input-wrap">
          <span class="fb-input-label">вагон</span>
          <div class="fb-stepper">
            <button type="button" class="fb-step fb-step-down" data-id="${wId}" data-min="1" data-max="5" aria-label="Зменшити вагон">−</button>
            <span class="fb-step-val" id="${wId}">${currentWagon}</span>
            <button type="button" class="fb-step fb-step-up" data-id="${wId}" data-min="1" data-max="5" aria-label="Збільшити вагон">+</button>
          </div>
        </div>
        <div class="fb-input-wrap">
          <span class="fb-input-label">двері</span>
          <div class="fb-stepper">
            <button type="button" class="fb-step fb-step-down" data-id="${dId}" data-min="1" data-max="4" aria-label="Зменшити двері">−</button>
            <span class="fb-step-val" id="${dId}">${currentDoors}</span>
            <button type="button" class="fb-step fb-step-up" data-id="${dId}" data-min="1" data-max="4" aria-label="Збільшити двері">+</button>
          </div>
        </div>
        <button type="button" class="dev-confirm-save-fix confirm-btn-save">Зберегти виправлення</button>
      </div>
      <div class="dev-confirm-secondary-actions">
        <button type="button" class="dev-confirm-undo" ${data.lastAction ? '' : 'disabled'}>Скасувати останню дію</button>
        <button type="button" class="dev-confirm-reset">Скинути лічильник</button>
      </div>`;

    panel.querySelectorAll('.fb-step').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const id  = btn.dataset.id;
        const min = parseInt(btn.dataset.min);
        const max = parseInt(btn.dataset.max);
        const el  = document.getElementById(id);
        let val   = parseInt(el.textContent) + (btn.classList.contains('fb-step-up') ? 1 : -1);
        el.textContent = Math.max(min, Math.min(max, val));
      });
    });

    const closePanel = () => {
      panel.classList.remove('panel-open');
      setTimeout(() => panel.remove(), 280);
    };

    panel.querySelector('.dev-confirm-final').addEventListener('click', e => {
      e.stopPropagation();
      setFinalConfirmed(slug, posIdx);
      onUpdate();
      closePanel();
    });

    panel.querySelector('.dev-confirm-plus').addEventListener('click', e => {
      e.stopPropagation();
      incrementConfirmCount(slug, posIdx);
      onUpdate();
      closePanel();
    });

    panel.querySelector('.dev-confirm-minus').addEventListener('click', e => {
      e.stopPropagation();
      panel.querySelector('.dev-confirm-fix-wrap').classList.toggle('is-hidden');
    });

    panel.querySelector('.dev-confirm-save-fix').addEventListener('click', e => {
      e.stopPropagation();
      const wagon = document.getElementById(wId).textContent;
      const doors = document.getElementById(dId).textContent;
      addDisputeVote(slug, posIdx, wagon, doors);
      onUpdate();
      closePanel();
    });

    panel.querySelector('.dev-confirm-undo').addEventListener('click', e => {
      e.stopPropagation();
      undoLastConfirmAction(slug, posIdx);
      onUpdate();
      paint();
    });

    panel.querySelector('.dev-confirm-reset').addEventListener('click', e => {
      e.stopPropagation();
      resetConfirmationData(slug, posIdx);
      onUpdate();
      paint();
    });
  };

  paint();
  row.after(panel);
  requestAnimationFrame(() => panel.classList.add('panel-open'));
}

// ── UI: панель нотатки ───────────────────────────────
function toggleDevNotePanel(row, slug, posIdx, lineColor, noteBtn, defaultColor, defaultOpacity) {
  const next = row.nextElementSibling;

  if (next?.classList.contains('dev-note-panel') && next.dataset.type === 'note') {
    next.classList.remove('panel-open');
    setTimeout(() => next.remove(), 280);
    return;
  }

  document.querySelectorAll('.dev-note-panel').forEach(p => {
    p.classList.remove('panel-open');
    setTimeout(() => p.remove(), 280);
  });

  const existingNote = getDevNote(slug, posIdx);
  const panel = document.createElement('div');
  panel.className = 'dev-note-panel';
  panel.dataset.type = 'note';
  
  // Додаємо третю кнопку "Видалити" з червоним підсвічуванням (confirm-btn-discard)
  // Вона рендериться тільки якщо нотатка фізично вже існує в базі
  panel.innerHTML = `
    <textarea class="dev-note-textarea">${existingNote}</textarea> 
    <div class="dev-note-actions"> 
      <button type="button" class="dev-note-save confirm-btn-save">Зберегти</button> 
      <button type="button" class="dev-note-cancel confirm-btn-neutral">Скасувати</button> 
      ${existingNote ? `<button type="button" class="dev-note-delete confirm-btn-discard">Видалити</button>` : ''}
    </div>`;
    
  row.after(panel);
  requestAnimationFrame(() => panel.classList.add('panel-open'));

  const textarea = panel.querySelector('.dev-note-textarea');
  setTimeout(() => textarea.focus(), 60);

  // 1. ЗБЕРЕГТИ: Оновлює або створює вміст
  panel.querySelector('.dev-note-save').addEventListener('click', e => {
    e.stopPropagation();
    const text = textarea.value.trim();
    setDevNote(slug, posIdx, text);
    noteBtn.style.color   = text ? lineColor : defaultColor;
    noteBtn.style.opacity = text ? '1' : defaultOpacity;
    panel.classList.remove('panel-open');
    setTimeout(() => panel.remove(), 280);
  });

  // 2. СКАСУВАТИ: Просто закриває панель. Старі дані в Storage взагалі не чіпаємо!
  panel.querySelector('.dev-note-cancel').addEventListener('click', e => {
    e.stopPropagation();
    panel.classList.remove('panel-open');
    setTimeout(() => panel.remove(), 280);
  });

  // 3. ВИДАЛИТИ: Повністю очищує нотатку та гасить колір іконки олівця
  const deleteBtn = panel.querySelector('.dev-note-delete');
  if (deleteBtn) {
    deleteBtn.addEventListener('click', e => {
      e.stopPropagation();
      setDevNote(slug, posIdx, '');
      noteBtn.style.color   = defaultColor;
      noteBtn.style.opacity = defaultOpacity;
      panel.classList.remove('panel-open');
      setTimeout(() => panel.remove(), 280);
    });
  }
}

// ── UI: панель фото ───────────────────────────────────
// ── Фото: підтримка кількох знімків на одну позицію ───
// Ключ у PhotoStorage тепер `${slug}_${posIdx}_${унікальний суфікс}` замість
// одного `${slug}_${posIdx}` — тобто кожне фото має свій власний запис,
// і на одну позицію їх може бути скільки завгодно.
function _photoPrefix(slug, posIdx) {
  return `${slug}_${posIdx}_`;
}

function _newPhotoId(slug, posIdx) {
  return `${_photoPrefix(slug, posIdx)}${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

/** @returns {Promise<Array<{id:string, dataUrl:string}>>} усі фото для конкретної позиції */
async function listPhotosForPosition(slug, posIdx) {
  const prefix = _photoPrefix(slug, posIdx);
  const all = await PhotoStorage.getAllPhotos();
  return Object.keys(all)
    .filter(id => id.startsWith(prefix))
    .sort()
    .map(id => ({ id, dataUrl: all[id] }));
}

async function toggleDevPhotoPanel(row, slug, posIdx, lineColor, photoBtn, defaultColor, defaultOpacity) {
  const next = row.nextElementSibling;

  if (next?.classList.contains('dev-note-panel') && next.dataset.type === 'photo') {
    next.classList.remove('panel-open');
    setTimeout(() => next.remove(), 280);
    return;
  }

  document.querySelectorAll('.dev-note-panel').forEach(p => {
    p.classList.remove('panel-open');
    setTimeout(() => p.remove(), 280);
  });

  const panel = document.createElement('div');
  panel.className = 'dev-note-panel';
  panel.dataset.type = 'photo';
  row.after(panel);
  requestAnimationFrame(() => panel.classList.add('panel-open'));

  const updateBtnState = (count) => {
    photoBtn.style.color   = count > 0 ? lineColor : defaultColor;
    photoBtn.style.opacity = count > 0 ? '1' : defaultOpacity;
  };

  const paint = async () => {
    const photos = await listPhotosForPosition(slug, posIdx);
    updateBtnState(photos.length);

    panel.innerHTML = `
      <div class="dev-photo-grid">
        ${photos.map(p => `
          <div class="dev-photo-thumb-wrap" data-id="${p.id}">
            <img src="${p.dataUrl}" class="dev-photo-thumb"/>
            <button type="button" class="dev-photo-thumb-remove" data-id="${p.id}" aria-label="Видалити фото">✕</button>
          </div>`).join('')}
        <label class="dev-photo-add-tile">
          +
          <input type="file" accept="image/*" multiple class="dev-photo-input" style="display:none;">
        </label>
      </div>
      <div class="dev-note-actions">
        <button type="button" class="dev-photo-back confirm-main-btn confirm-btn-neutral">Назад</button>
      </div>`;

    panel.querySelectorAll('.dev-photo-thumb').forEach(img => {
      img.addEventListener('click', () => showDevPhotoFullscreen(img.src));
    });

    panel.querySelectorAll('.dev-photo-thumb-remove').forEach(btn => {
      btn.addEventListener('click', async e => {
        e.stopPropagation();
        try {
          await PhotoStorage.removePhoto(btn.dataset.id);
          _touchSyncTimestamp();
          await paint();
        } catch (err) {
          console.warn('[KyivMetroGO] Не вдалося видалити фото:', err);
          _showToast('Не вдалося видалити фото');
        }
      });
    });

    panel.querySelector('.dev-photo-back').addEventListener('click', e => {
      e.stopPropagation();
      panel.classList.remove('panel-open');
      setTimeout(() => panel.remove(), 280);
    });

    const fileInput = panel.querySelector('.dev-photo-input');
    fileInput.addEventListener('click', e => e.stopPropagation());
    fileInput.addEventListener('change', async e => {
      const files = Array.from(e.target.files || []);
      if (!files.length) return;
      try {
        await Promise.all(files.map(file => new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = async (ev) => {
            try {
              await PhotoStorage.savePhoto(_newPhotoId(slug, posIdx), ev.target.result);
              resolve();
            } catch (err) { reject(err); }
          };
          reader.onerror = reject;
          reader.readAsDataURL(file);
        })));
        _touchSyncTimestamp();
        await paint();
      } catch (err) {
        console.warn('[KyивMetroGO] Не вдалося зберегти фото:', err);
        _showToast('Не вдалося зберегти одне або кілька фото');
      }
    });
  };

  await paint();
}

// ── Повноекранний перегляд фото ───────────────────────
function showDevPhotoFullscreen(src) {
  let overlay = document.getElementById('devPhotoOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'devPhotoOverlay';
    overlay.className = 'dev-photo-overlay';
    overlay.innerHTML = `<img src="" />`;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', () => overlay.classList.remove('open'));
  }
  overlay.querySelector('img').src = src;
  requestAnimationFrame(() => overlay.classList.add('open'));
}

// ── UI: тост активації ────────────────────────────────
function _showToast(text) {
  document.querySelectorAll('.dev-mode-toast').forEach(t => t.remove());
  const toast = document.createElement('div');
  toast.className = 'dev-mode-toast';
  toast.textContent = text;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('dev-mode-toast-open'));
  setTimeout(() => {
    toast.classList.remove('dev-mode-toast-open');
    setTimeout(() => toast.remove(), 400);
  }, 2500);
}

/**
 * Показує тимчасовий тост про стан dev-режиму.
 * @param {boolean} active
 */
export function showDevModeToast(active) {
  _showToast(active ? 'Режим розробника увімкнено' : 'Режим розробника вимкнено');
}

const DEV_MINI_SVG = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 15 15"><path fill="currentColor" fill-rule="evenodd" d="M9.964 2.686a.5.5 0 1 0-.928-.372l-4 10a.5.5 0 1 0 .928.372zm-6.11 2.46a.5.5 0 0 1 0 .708L2.207 7.5l1.647 1.646a.5.5 0 1 1-.708.708l-2-2a.5.5 0 0 1 0-.708l2-2a.5.5 0 0 1 .708 0m7.292 0a.5.5 0 0 1 .708 0l2 2a.5.5 0 0 1 0 .708l-2 2a.5.5 0 0 1-.708-.708L12.793 7.5l-1.647-1.646a.5.5 0 0 1 0-.708" clip-rule="evenodd"/></svg>`;

// Компактні іконки для швидкої кнопки синхронізації в About-шторці
// (сама форма входу — тільки в повноекранному меню розробника, тут нема місця).
const DEV_SYNC_SVG  = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="15" height="15"><path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 3v6h-6"/></svg>`;
const DEV_LOGIN_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="15" height="15"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><path d="M10 17l5-5-5-5"/><path d="M15 12H3"/></svg>`;

/**
 * Оновлює SVG-іконку dev-режиму в About-шторці (лише індикатор активності —
 * сама форма авторизації сюди більше не вбудовується: тут лише 36×36px,
 * фізично нема місця для полів вводу. Авторизація й синхронізація тепер
 * живуть у повноекранному меню розробника (renderDevAuthSection).
 * @param {HTMLElement} aboutSheet
 * @param {boolean}     active
 */
export function updateDevModeIndicator(aboutSheet, active) {
  const container = aboutSheet.querySelector('#aboutDevBtnContainer');
  const syncBtn   = aboutSheet.querySelector('#aboutDevSyncBtn');
  if (!container) return;
  container.innerHTML = active ? DEV_MINI_SVG : '';
  if (active) setupDevDataClear(container);

  if (syncBtn) {
    syncBtn.classList.toggle('is-hidden', !active);
    if (active) {
      syncBtn.innerHTML = _devUser ? DEV_SYNC_SVG : DEV_LOGIN_SVG;
      syncBtn.title = _devUser ? 'Синхронізувати з Firebase' : 'Увійти для синхронізації';
      syncBtn.onclick = async e => {
        e.stopPropagation();
        if (!_devUser) {
          bus.emit('devmenu:open');
          return;
        }
        if (_syncInFlight) { _showToast('Синхронізація вже триває…'); return; }
        syncBtn.classList.add('dev-sync-busy');
        try {
          const result = await _performFullSync();
          _showToast(result === 'downloaded' ? 'Отримано новіші дані з хмари' : 'Синхронізовано з Firebase');
        } catch (err) {
          _showToast('Помилка синхронізації: ' + (err.message || err));
        } finally {
          syncBtn.classList.remove('dev-sync-busy');
        }
      };
    }
  }
}

/**
 * Малює блок Firebase-авторизації/синхронізації у переданий контейнер.
 * Розрахований на повноекранне меню розробника (openDevMenuSheet), де є
 * достатньо місця для повноцінної форми — на відміну від тісної 36×36px
 * кнопки в About-шторці, звідки цей блок і забрали.
 * Три стани: сесія ще не відома → нейтральний плейсхолдер; відома, юзера
 * нема → форма email/пароль; юзер є → кнопка синхронізації + вихід.
 * Викликає сама себе повторно при зміні стану авторизації (onDevAuthChange),
 * якщо контейнер усе ще в DOM.
 * @param {HTMLElement} container
 */
export function renderDevAuthSection(container) {
  if (!container) return;
  _lastDevAuthContainer = container;
  container.innerHTML = '';

  if (!_devAuthResolved) {
    container.innerHTML = `<div class="dev-auth-status">Перевірка сесії…</div>`;
    return;
  }

  if (!_devUser) {
    container.innerHTML = `
      <form class="dev-login-form" autocomplete="on">
        <input type="email" class="dev-login-input" name="email" placeholder="Email розробника" autocomplete="username" required>
        <input type="password" class="dev-login-input" name="password" placeholder="Пароль" autocomplete="current-password" required>
        <button type="submit" class="confirm-main-btn confirm-btn-save">Увійти</button>
      </form>
      <div class="dev-auth-status"></div>`;

    const form      = container.querySelector('.dev-login-form');
    const statusEl  = container.querySelector('.dev-auth-status');
    const submitBtn = form.querySelector('button[type="submit"]');

    form.addEventListener('submit', async e => {
      e.preventDefault();
      const email = form.elements.email.value.trim();
      const pass  = form.elements.password.value;
      if (!email || !pass) return;

      submitBtn.disabled   = true;
      statusEl.textContent = 'Авторизація…';
      try {
        await loginDev(email, pass);
        // Форму перемалює onDevAuthChange автоматично.
      } catch (err) {
        statusEl.textContent = 'Помилка: ' + (err.message || err);
        submitBtn.disabled = false;
      }
    });
    return;
  }

  // Юзер відомий і залогінений
  container.innerHTML = `
    <button type="button" class="confirm-main-btn confirm-btn-save dev-sync-btn">🔄 Синхронізувати з Firebase</button>
    <button type="button" class="dev-logout-link">Вийти (${_devUser.email})</button>
    <div class="dev-auth-status"></div>`;

  const syncBtn   = container.querySelector('.dev-sync-btn');
  const logoutBtn = container.querySelector('.dev-logout-link');
  const statusEl  = container.querySelector('.dev-auth-status');

  syncBtn.addEventListener('click', async () => {
    if (_syncInFlight) {
      statusEl.textContent = 'Синхронізація вже триває…';
      return;
    }
    syncBtn.textContent   = '🔄 Синхронізація…';
    syncBtn.disabled      = true;
    statusEl.textContent  = '';

    try {
      const result = await _performFullSync();
      syncBtn.textContent  = '✓ Синхронізовано';
      statusEl.textContent = result === 'downloaded'
        ? 'Отримано новіші дані з хмари'
        : 'Дані успішно оновлено в хмарі';
      setTimeout(() => {
        syncBtn.disabled    = false;
        syncBtn.textContent = '🔄 Синхронізувати з Firebase';
      }, 3000);
    } catch (err) {
      statusEl.textContent = 'Помилка: ' + (err.message || err);
      syncBtn.disabled      = false;
      syncBtn.textContent   = '🔄 Синхронізувати з Firebase';
    }
  });

  logoutBtn.addEventListener('click', async () => {
    try {
      await logoutDev();
      // Форму перемалює onDevAuthChange автоматично.
    } catch (err) {
      statusEl.textContent = 'Помилка виходу: ' + (err.message || err);
    }
  });
}

// ── Активація Dev Mode прихованим жестом (5 тапів) ──
export function setupDevModeTapCounter(aboutSheet) {
  _lastAboutSheet = aboutSheet;
  // Відображаємо актуальний стан при відкритті шторки
  updateDevModeIndicator(aboutSheet, isDevMode());

  const trigger = aboutSheet.querySelector('.about-footer') || 
                  aboutSheet.querySelector('.about-subtitle') || 
                  aboutSheet.querySelector('.sheet-handle-bar');
  if (!trigger) return;

  let taps = 0;
  let tapTimer = null;

  trigger.addEventListener('click', (e) => {
    taps++;
    clearTimeout(tapTimer);

    tapTimer = setTimeout(() => {
      if (taps >= 5) {
        const active = toggleDevMode();
        showDevModeToast(active);
        updateDevModeIndicator(aboutSheet, active);
        updateDevMenuButtonVisibility();
      }
      taps = 0;
    }, 400);
  });
}

/** Показує/ховає плаваючу кнопку меню розробника зверху карти. */
export function updateDevMenuButtonVisibility() {
  document.getElementById('devMenuBtn')?.classList.toggle('is-hidden', !isDevMode());
}

// ── Очищення даних розробника ─────────────────────────
function setupDevDataClear(container) {
  let clearTaps = 0;
  let tapTimer = null;

  container.onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();

    clearTaps++;
    clearTimeout(tapTimer);

    if (clearTaps === 1) showDevModeToast(true);

    tapTimer = setTimeout(() => {
      if (clearTaps >= 5) {
        document.querySelectorAll('.dev-mode-toast').forEach(t => t.remove());
        bus.emit('ui:confirm', {
          message:  'Очистити всі дані режиму розробника?',
          onYes:    async () => {
            Storage.remove(STORAGE_KEYS.DEV_LOG);
            Storage.remove(STORAGE_KEYS.DEV_VERIFIED);
            Storage.remove(STORAGE_KEYS.DEV_NOTES);
            await PhotoStorage.clearAllPhotos().catch(err =>
              console.warn('[KyivMetroGO] Помилка очищення PhotoStorage:', err)
            );
            setTimeout(() => location.reload(), 180);
          },
          onNo:      null,
          onCancel:  null,
          labelYes:  'Очистити',
          labelNo:   'Скасувати',
          styleYes:  'confirm-btn-discard',
          styleNo:   'confirm-btn-neutral',
        });
      }
      clearTaps = 0;
    }, 400); 
  };
}