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
//   isExitsCatalogVerified(slug)         → boolean
//   setExitsCatalogVerified(slug)        → void
//   resetExitsCatalogVerified(slug)      → void
//   getAllExitsVerified()                → object
//   attachDevModeUI(container, slug)     → void
//   showDevModeToast(active)             → void
//   updateDevModeIndicator(sheet, active)→ void
//   setupDevModeTapCounter(aboutSheet)   → void


const DEV_CHECK_SVG = `<svg viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path fill="currentColor" d="M14.83 4.89l1.34.94-5.81 8.38H9.02L5.78 9.67l1.34-1.25 2.57 2.4z"/></svg>`;

const DEV_NOTE_SVG = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="none"><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 8h14M5 12h14M5 16h6"/></svg>`;

const DEV_PHOTO_SVG = `<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><rect x="3" y="6" fill="none" stroke="currentColor" stroke-width="2" stroke-miterlimit="10" width="26" height="20"/><polyline fill="none" stroke="currentColor" stroke-width="2" stroke-miterlimit="10" points="3,22.3 11,14.3 22.5,25.9 "/><polyline fill="none" stroke="currentColor" stroke-width="2" stroke-miterlimit="10" points="17.4,20.9 22,16.3 28.9,23.2 "/></svg>`;
// Лічильник підтверджень — кругла стрілка (те саме "оновити/повторно перевірити")
const DEV_MORE_SVG = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="currentColor"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>`;

const DEV_CONFIRM_SVG = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>`;

import { STORAGE_KEYS, Storage } from '../core/storage.js';
import { state }                  from '../core/state.js';
import { PhotoStorage }           from '../data/photoStorage.js';
import { bus }        from '../core/eventBus.js';
import { LINE_COLOR } from '../core/constants.js';
import { getPositionDescriptorsForStation, devRowKey } from '../sheets/renderStation.js';
import { legacyKeyMap }     from '../data/positions.js';
import { onDevAuthChange, loginDev, logoutDev, uploadDevState, downloadDevState, uploadDevPhoto, deleteDevPhoto, listDevPhotoIds, downloadDevPhoto } from '../services/devCloud.js';
import { escapeHtml } from '../ui/html.js';
import { showToast }  from '../ui/toast.js';
import { isDevMode } from './devFlags.js';
import {
  emptyConfirmationData as _emptyConfirmationData,
  mergeKeyedMap as _mergeKeyedMap,
  purgeTombstones as _purgeTombstones,
  mergeConfirmations as _mergeConfirmations,
  deriveVerifiedFromConfirmations as _deriveVerifiedFromConfirmations,
  applyCloudVerifiedIntoConfirmations as _applyCloudVerifiedIntoConfirmations,
  mergeBacklog as _mergeBacklog,
  mergeStationNotes as _mergeStationNotes,
} from '../domain/devMerge.js';

export { isDevMode, toggleDevMode, getDevLog, appendDevLog } from './devFlags.js';



// ── Активація / деактивація ──────────────────────────

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

let _devAuthWatching      = false;

// Firebase завантажується лише в режимі розробника (services/devCloud.js):
// підписку вмикаємо, коли режим увімкнено — при запуску або перемиканні.
function _ensureDevAuthWatch() {
  if (_devAuthWatching) return;
  _devAuthWatching = true;
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
}

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
const DEV_BACKLOG_SYNC_BASE_KEY = 'dev_backlog_last_synced';

async function _performFullSync() {
  if (_syncInFlight) return 'busy';
  _syncInFlight = true;

  try {
    const cloudData = await downloadDevState();

    // Щотижневе очищення старих tombstone-записів (старші за 7 діб).
    // Відбувається локально перед merge — щоб не тягнути мертвий вантаж у хмару.
    _ensureDevKeysMigrated();
    let localNotes         = JSON.parse(Storage.get(STORAGE_KEYS.DEV_NOTES) || '{}');
    localNotes             = _purgeTombstones(localNotes);

    const localBacklog       = Storage.get(STORAGE_KEYS.DEV_BACKLOG) || '';
    const localConfirmations = getAllDevConfirmations();
    let localStationNotes    = getAllStationNotes();

    // Остання версія backlog, яка була успішно синхронізована
    // цим пристроєм.
    const lastSyncedBacklog =
      Storage.get(DEV_BACKLOG_SYNC_BASE_KEY) || '';

    let mergedNotes         = localNotes;
    let mergedBacklog       = localBacklog;
    let mergedConfirmations = localConfirmations;
    let mergedStationNotes  = localStationNotes;
    let changed = false;

    if (cloudData) {
      mergedNotes = _mergeKeyedMap(
        localNotes,
        cloudData.notes
      );

      mergedBacklog = _mergeBacklog(
        localBacklog,
        cloudData.backlog || '',
        lastSyncedBacklog
      );

      mergedConfirmations = _mergeConfirmations(
        localConfirmations,
        cloudData.confirmations
      );

      mergedStationNotes = _mergeStationNotes(
        localStationNotes,
        cloudData.stationNotes
      );

      // "verified" — застарілий формат дроту.
      mergedConfirmations = _applyCloudVerifiedIntoConfirmations(
        mergedConfirmations,
        cloudData.verified
      );

      // Хмара (інший пристрій зі старою версією) могла принести старі числові ключі
      _migrateRowKeys(mergedNotes);
      _migrateRowKeys(mergedConfirmations);

      changed =
        JSON.stringify(mergedNotes) !== JSON.stringify(localNotes)
        || mergedBacklog !== localBacklog
        || JSON.stringify(mergedConfirmations) !== JSON.stringify(localConfirmations)
        || JSON.stringify(mergedStationNotes) !== JSON.stringify(localStationNotes);

      if (changed) {
        Storage.set(
          STORAGE_KEYS.DEV_NOTES,
          JSON.stringify(mergedNotes)
        );

        Storage.set(
          STORAGE_KEYS.DEV_BACKLOG,
          mergedBacklog
        );

        Storage.set(
          STORAGE_KEYS.DEV_CONFIRMATIONS,
          JSON.stringify(mergedConfirmations)
        );

        Storage.set(
          STORAGE_KEYS.DEV_STATION_NOTES,
          JSON.stringify(mergedStationNotes)
        );

        bus.emit('station:refresh');
        bus.emit('devmenu:refresh');
      }
    }

    const verifiedForWire =
      _deriveVerifiedFromConfirmations(mergedConfirmations);

    // Спочатку успішно записуємо об'єднаний стан у cloud.
    await uploadDevState(
      mergedNotes,
      verifiedForWire,
      mergedBacklog,
      mergedConfirmations,
      mergedStationNotes
    );

    // Тільки ПІСЛЯ успішного upload ця версія стає
    // новою базою для наступного 3-way merge.
    Storage.set(
      DEV_BACKLOG_SYNC_BASE_KEY,
      mergedBacklog
    );

    await _syncPhotos();

    return changed ? 'downloaded' : 'uploaded';

  } finally {
    _syncInFlight = false;
  }
}

/**
 * Синхронізація фото з підтримкою tombstone.
 * Tombstone-список зберігається у Storage під DEV_DELETED_PHOTOS_KEY —
 * { photoId: deletedAtTimestamp }. Фото, яке є в tombstone:
 *  – не завантажується з хмари (видалення перемагає);
 *  – якщо є в хмарі — видаляється звідти.
 * Після успішного видалення з хмари запис у tombstone прибирається,
 * щоб список не ріс безкінечно.
 *
 * Читаємо з IndexedDB спочатку тільки ключі (без даних) — завантажуємо
 * dataUrl лише для тих фото, які реально треба вивантажити в хмару.
 */
const DEV_DELETED_PHOTOS_KEY = 'metro_dev_deleted_photos';

function _getPhotoTombstones() {
  try { return JSON.parse(Storage.get(DEV_DELETED_PHOTOS_KEY) || '{}'); }
  catch { return {}; }
}

function _savePhotoTombstones(map) {
  Storage.set(DEV_DELETED_PHOTOS_KEY, JSON.stringify(map));
}

/** Позначає фото як навмисно видалене і запускає синк. */
export async function removeDevPhoto(photoId) {
  await PhotoStorage.removePhoto(photoId);
  const tombstones = _getPhotoTombstones();
  tombstones[photoId] = Date.now();
  _savePhotoTombstones(tombstones);
  _requestSync(true);
}

async function _syncPhotos() {
  const tombstones = _getPhotoTombstones();
  // Тільки ключі — не вантажимо дані до часу
  const localIds = new Set(await PhotoStorage.getAllPhotoIds());
  const cloudIds = new Set(await listDevPhotoIds());

  // 1. Видалити з хмари фото, які є в tombstone
  const toDeleteFromCloud = [...cloudIds].filter(id => !!tombstones[id]);
  if (toDeleteFromCloud.length) {
    await Promise.allSettled(toDeleteFromCloud.map(id => deleteDevPhoto(id)));
    // Прибираємо успішно видалені з tombstone
    const updatedTombstones = { ...tombstones };
    toDeleteFromCloud.forEach(id => delete updatedTombstones[id]);
    _savePhotoTombstones(updatedTombstones);
  }

  // 2. Вивантажити локальні, яких нема в хмарі і які не видалені
  const toUpload = [...localIds].filter(id => !cloudIds.has(id) && !tombstones[id]);
  for (const id of toUpload) {
    const dataUrl = await PhotoStorage.loadPhoto(id);
    if (dataUrl) await uploadDevPhoto(id, dataUrl);
  }

  // 3. Завантажити хмарні, яких нема локально і які не видалені
  const toDownloadIds = [...cloudIds].filter(id => !localIds.has(id) && !tombstones[id]);
  if (toDownloadIds.length) {
    const downloaded = await Promise.allSettled(
      toDownloadIds.map(id => downloadDevPhoto(id).then(dataUrl => [id, dataUrl]))
    );
    const photosMap = Object.fromEntries(
      downloaded.filter(r => r.status === 'fulfilled').map(r => r.value)
    );
    if (Object.keys(photosMap).length) await PhotoStorage.bulkSavePhotos(photosMap);
  }
}

// ── Єдина черга синхронізації ──────────────────────────
// Усі зміни (нотатки, стан, фото) проходять через один шлях — _requestSync.
// immediate:true дає коротший debounce (100мс), щоб явне видалення або
// скидання потрапило в хмару якнайшвидше, але все одно через _syncInFlight.
// Це усуває race condition між трьома старими force-push функціями та
// звичайним автосинком — тепер вони всі є одним й тим самим таймером.
const AUTO_SYNC_DEBOUNCE_MS   = 1500;
const URGENT_SYNC_DEBOUNCE_MS = 100;
let _autoSyncTimer = null;

function _requestSync(immediate = false) {
  if (!_devUser) return;
  clearTimeout(_autoSyncTimer);
  const delay = immediate ? URGENT_SYNC_DEBOUNCE_MS : AUTO_SYNC_DEBOUNCE_MS;
  _autoSyncTimer = setTimeout(async () => {
    try {
      const result = await _performFullSync();
      if (result !== 'busy') console.log('[KyivMetroGO] Синхронізація Firebase:', result);
    } catch (err) {
      console.warn('[KyivMetroGO] Синхронізація Firebase не вдалась:', err);
    }
  }, delay);
}

// Залишаємо _scheduleAutoSync як alias для зворотної сумісності з викликами
// всередині _touchSyncTimestamp (беклог, DEV_SYNC_LOCAL_TS тощо).
function _scheduleAutoSync() { _requestSync(false); }


// ── Перехід зі старих ключів на стабільні ─────────────
// Раніше нотатки й підтвердження зберігалися за порядковим номером рядка
// в картці станції — він зсувався, коли в даних з'являвся чи зникав вихід.
// Тепер ключ — devRowKey рядка (renderStation.js). Старі числові ключі
// переводимо за поточним порядком рядків; якщо рядка з таким номером уже
// немає — запис лишається як є, щоб нічого не загубити.
let _devKeysMigrated = false;
bus.on('data:stations-hydrated', () => { _devKeysMigrated = false; });

const _isLegacyRowKey = key => /^\d+$/.test(key);
const _entryTime = entry =>
  (entry && typeof entry === 'object') ? (entry.t ?? entry.updatedAt ?? 0) : 0;

// Ключ рядка до появи id позицій у даних — хеш від «напрямок|id виходу|номер».
// Map<старий ключ рядка, новий> для станції.
function _oldHashRowKeys(station) {
  const map = new Map();
  for (const [oldKey, id] of legacyKeyMap(station)) {
    const from = devRowKey(oldKey);
    const to   = devRowKey(id);
    if (from !== to) map.set(from, to);
  }
  return map;
}

/** Старий ключ рядка (до появи id позицій) для нового або ''. */
function _oldRowKeyFor(slug, rowKey) {
  const station = state.stationsData?.[slug];
  if (!station) return '';
  for (const [from, to] of _oldHashRowKeys(station)) if (to === rowKey) return from;
  return '';
}

function _migrateRowKeys(map) {
  let changed = false;
  for (const slug of Object.keys(map || {})) {
    const entries = map[slug];
    const station = state.stationsData?.[slug];
    if (!entries || !station) continue;
    const oldHashKeys = _oldHashRowKeys(station);
    const isOld = key => _isLegacyRowKey(key) || oldHashKeys.has(key);
    if (!Object.keys(entries).some(isOld)) continue;
    const descriptors = getPositionDescriptorsForStation(station, LINE_COLOR[station.line]);
    for (const oldKey of Object.keys(entries).filter(isOld)) {
      const newKey = oldHashKeys.get(oldKey) ?? descriptors[Number(oldKey)]?.key;
      if (!newKey || _isLegacyRowKey(newKey)) continue;
      // Збіг зі свіжішим записом під новим ключем — перемагає новіший
      if (!entries[newKey] || _entryTime(entries[oldKey]) > _entryTime(entries[newKey])) {
        entries[newKey] = entries[oldKey];
      }
      delete entries[oldKey];
      changed = true;
    }
  }
  return changed;
}

function _ensureDevKeysMigrated() {
  if (_devKeysMigrated || !state.stationsData || !Object.keys(state.stationsData).length) return;
  _devKeysMigrated = true;
  let notes;
  try { notes = JSON.parse(Storage.get(STORAGE_KEYS.DEV_NOTES) || '{}'); } catch { notes = {}; }
  if (_migrateRowKeys(notes)) Storage.set(STORAGE_KEYS.DEV_NOTES, JSON.stringify(notes));
  const confirmations = _readConfirmationsRaw();
  if (_migrateRowKeys(confirmations)) _writeConfirmations(confirmations);
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
function _readConfirmationsRaw() {
  try { return JSON.parse(Storage.get(STORAGE_KEYS.DEV_CONFIRMATIONS) || '{}'); }
  catch(e) { return {}; }
}

function _readConfirmations() {
  _ensureDevKeysMigrated();
  return _readConfirmationsRaw();
}

function _writeConfirmations(data) {
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
  const btn = sheet.querySelector('#devStationNoteBtn');
  if (!btn) return;
  // Панель з index.html; якщо її колись видалили з DOM — створюємо заново,
  // інакше кнопка нотатки до перезапуску нічого не відкриває.
  let panel = sheet.querySelector('#devStationNotePanel');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'devStationNotePanel';
    panel.className = 'dev-note-panel dev-station-note-panel';
    sheet.querySelector('#sheetBody')?.before(panel);
  }

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

  // Закриваємо та видаляємо відкриті нотатки виходів, але НЕ панель станції
  document.querySelectorAll('.dev-note-panel').forEach(p => {
    if (p !== panel) {
      p.classList.remove('panel-open');
      setTimeout(() => p.remove(), 280);
    }
  });

  const currentText = getStationNote(slug);
  panel.innerHTML = `
    <textarea class="dev-note-textarea dev-station-note-textarea" placeholder="Загальна нотатка по станції…">${escapeHtml(currentText)}</textarea>
    <div class="dev-note-actions">
      <button type="button" class="dev-station-note-save confirm-btn-save">Готово</button>
      ${currentText ? `<button type="button" class="dev-station-note-delete confirm-btn-discard">Видалити</button>` : ''}
    </div>`;

  const textarea = panel.querySelector('textarea');
  textarea.addEventListener('input', () => {
    setStationNote(slug, textarea.value, true);
    btn.style.color = textarea.value.trim() ? lineColor : defaultColor;
  });

  panel.querySelector('.dev-station-note-save').addEventListener('click', e => {
    e.stopPropagation();
    setStationNote(slug, textarea.value.trim(), false);
    btn.style.color = textarea.value.trim() ? lineColor : defaultColor;
    panel.classList.remove('panel-open');
  });

  const deleteBtn = panel.querySelector('.dev-station-note-delete');
  if (deleteBtn) {
    deleteBtn.addEventListener('click', e => {
      e.stopPropagation();
      setStationNote(slug, '', false);
      btn.style.color = defaultColor;
      panel.classList.remove('panel-open');
    });
  }

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
function _closeDevMoreMenus() {
  document.querySelectorAll('.dev-more-menu.is-open').forEach(m => m.classList.remove('is-open'));
}
document.addEventListener('click', _closeDevMoreMenus);

export function attachDevModeUI(container, slug) {
  if (!isDevMode()) return;
  const lineColor = LINE_COLOR[state.stationsData?.[slug]?.line] || 'var(--text-muted)';

  const defaultColor   = 'var(--border)';
  const defaultOpacity = '1';

  container.querySelectorAll('.position-row').forEach((row, rowIdx) => {
    if (row.querySelector('.dev-confirm-btn')) return;

    // Дані розробника зберігаються за стабільним ключем рядка (devRowKey);
    // rowIdx — старий порядковий номер, потрібен лише для старих фото.
    const posIdx = row.dataset.rowKey || String(rowIdx);
    row.dataset.devPosIdx = rowIdx;
    // Фото, зняті до появи id позицій, лежать під старим ключем рядка
    row.dataset.devOldKey = _oldRowKeyFor(slug, posIdx);
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

    // ── «⋮» праворуч від піна: ховає нотатку і фото, щоб ліворуч лишалась
    //    тільки кнопка підтвердження і не перекривала значки доступності ──
    const moreBtn = document.createElement('button');
    moreBtn.className = 'dev-more-btn';
    moreBtn.type = 'button';
    moreBtn.setAttribute('aria-label', 'Нотатка і фото');
    moreBtn.innerHTML = DEV_MORE_SVG;

    const moreMenu = document.createElement('div');
    moreMenu.className = 'dev-more-menu';
    moreMenu.append(noteBtn, photoBtn);

    // «⋮» підсвічується кольором лінії, якщо є нотатка або фото
    const syncMoreColor = () => {
      const active = [noteBtn, photoBtn].some(b => b.style.color !== defaultColor);
      moreBtn.style.color = active ? lineColor : defaultColor;
    };
    syncMoreColor();
    const colorObserver = new MutationObserver(syncMoreColor);
    colorObserver.observe(noteBtn,  { attributes: true, attributeFilter: ['style'] });
    colorObserver.observe(photoBtn, { attributes: true, attributeFilter: ['style'] });

    row.prepend(confirmBtn);
    row.append(moreBtn, moreMenu);

    moreBtn.addEventListener('click', e => {
      e.stopPropagation();
      const willOpen = !moreMenu.classList.contains('is-open');
      _closeDevMoreMenus();
      moreMenu.classList.toggle('is-open', willOpen);
    });

    listPhotosForPosition(slug, posIdx, [rowIdx, row.dataset.devOldKey]).then(photos => {
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
      _closeDevMoreMenus();
      toggleDevNotePanel(row, slug, posIdx, lineColor, noteBtn, defaultColor, defaultOpacity);
    });

    photoBtn.addEventListener('click', e => {
      e.stopPropagation();
      _closeDevMoreMenus();
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
    if (p.id !== 'devStationNotePanel') {
      setTimeout(() => p.remove(), 280);
    }
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
    if (p.id !== 'devStationNotePanel') {
      setTimeout(() => p.remove(), 280);
    }
  });

  const existingNote = getDevNote(slug, posIdx);
  const panel = document.createElement('div');
  panel.className = 'dev-note-panel';
  panel.dataset.type = 'note';
  
  // Додаємо третю кнопку "Видалити" з червоним підсвічуванням (confirm-btn-discard)
  // Вона рендериться тільки якщо нотатка фізично вже існує в базі
  panel.innerHTML = `
    <textarea class="dev-note-textarea">${escapeHtml(existingNote)}</textarea> 
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

/**
 * @param {string} slug
 * @param {string} posIdx    — стабільний ключ рядка (devRowKey)
 * @param {Array<string|number>} [legacyKeys] — старі ключі рядка (порядковий номер,
 *   хеш до появи id позицій): фото, зняті раніше, лишаються під ними
 *   (їхні id у хмарі не перейменовуємо)
 * @returns {Promise<Array<{id:string, dataUrl:string}>>} усі фото для конкретної позиції
 */
async function listPhotosForPosition(slug, posIdx, legacyKeys = []) {
  const prefixes = [_photoPrefix(slug, posIdx)];
  for (const key of legacyKeys) {
    if (key !== undefined && key !== '') prefixes.push(_photoPrefix(slug, key));
  }
  const all = await PhotoStorage.getAllPhotos();
  return Object.keys(all)
    .filter(id => prefixes.some(prefix => id.startsWith(prefix)))
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
    if (p.id !== 'devStationNotePanel') {
      setTimeout(() => p.remove(), 280);
    }
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
    const photos = await listPhotosForPosition(slug, posIdx, [row.dataset.devPosIdx, row.dataset.devOldKey]);
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
          // Через tombstone — інакше наступна синхронізація поверне фото з хмари
          await removeDevPhoto(btn.dataset.id);
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
const _showToast = showToast;

/**
 * Показує тимчасовий тост про стан dev-режиму.
 * @param {boolean} active
 */
export function showDevModeToast(active) {
  _showToast(active ? 'Режим розробника увімкнено' : 'Режим розробника вимкнено');
}

const DEV_MINI_SVG = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 15 15"><path fill="currentColor" fill-rule="evenodd" d="M9.964 2.686a.5.5 0 1 0-.928-.372l-4 10a.5.5 0 1 0 .928.372zm-6.11 2.46a.5.5 0 0 1 0 .708L2.207 7.5l1.647 1.646a.5.5 0 1 1-.708.708l-2-2a.5.5 0 0 1 0-.708l2-2a.5.5 0 0 1 .708 0m7.292 0a.5.5 0 0 1 .708 0l2 2a.5.5 0 0 1 0 .708l-2 2a.5.5 0 0 1-.708-.708L12.793 7.5l-1.647-1.646a.5.5 0 0 1 0-.708" clip-rule="evenodd"/></svg>`;


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
  if (!container) return;
  container.innerHTML = active ? DEV_MINI_SVG : '';
  if (active) setupDevDataClear(container);
  // #aboutDevSyncBtn прибрано — синхронізація лише через меню розробника
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
  _ensureDevAuthWatch();
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
/**
 * Запам'ятовує About-шторку й показує на ній стан режиму розробника.
 * Лічильник дотиків, що вмикає режим, живе в features/devHooks.js.
 */
export function attachAboutSheet(aboutSheet) {
  _lastAboutSheet = aboutSheet;
  updateDevModeIndicator(aboutSheet, isDevMode());
}

/** Показує/ховає плаваючу кнопку меню розробника зверху карти. */
export function updateDevMenuButtonVisibility() {
  document.getElementById('devMenuBtn')?.classList.toggle('is-hidden', !isDevMode());
  if (isDevMode()) _ensureDevAuthWatch();
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
          onYes: async () => {
  Storage.remove(STORAGE_KEYS.DEV_LOG);
  Storage.remove(STORAGE_KEYS.DEV_VERIFIED);
  Storage.remove(STORAGE_KEYS.DEV_NOTES);
  Storage.remove(STORAGE_KEYS.DEV_BACKLOG);
  Storage.remove(STORAGE_KEYS.DEV_CONFIRMATIONS);
  Storage.remove(STORAGE_KEYS.DEV_STATION_NOTES);
  Storage.remove(DEV_BACKLOG_SYNC_BASE_KEY);

  await PhotoStorage.clearAllPhotos().catch(err =>
    console.warn('[KyivMetroGO] Помилка очищення PhotoStorage:', err)
  );

  setTimeout(() => Storage.flush().then(() => location.reload()), 180);
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

export function closeAllDevPanels() {
  // Закриваємо панелі та видаляємо з DOM лише динамічні панелі виходів
  document.querySelectorAll('.dev-note-panel, .dev-station-note-modal, .dev-note-overlay')
    .forEach(el => {
      el.classList.remove('panel-open', 'modal-open');
      if (el.id !== 'devStationNotePanel') {
        el.remove();
      }
    });
}