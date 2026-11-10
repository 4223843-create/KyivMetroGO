// ══ РЕЖИМ РОЗРОБНИКА: sync.js ══
// Firebase: стан входу, синхронізація між пристроями, черга автосинку,
// перехід зі старих ключів; форма входу в меню розробника (з очищенням даних),
// індикатор у «Про застосунок», тост активації.
// Частина src/features/devmode.js (публічне API — там).

import { STORAGE_KEYS, Storage } from '../../core/storage.js';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { state } from '../../core/state.js';
import { PhotoStorage } from '../../data/photoStorage.js';
import { bus } from '../../core/eventBus.js';
import { LINE_COLOR } from '../../core/constants.js';
import { getPositionDescriptorsForStation, devRowKey } from '../../sheets/renderStation.js';
import { legacyKeyMap } from '../../data/positions.js';
import {
  onDevAuthChange,
  loginDev,
  logoutDev,
  syncDevState,
  uploadDevPhoto,
  deleteDevPhoto,
  listDevPhotoIds,
  downloadDevPhoto,
} from '../../services/devCloud.js';
import { showToast } from '../../ui/toast.js';
import { isDevMode } from '../devFlags.js';
import {
  mergeKeyedMap as _mergeKeyedMap,
  purgeTombstones as _purgeTombstones,
  mergeConfirmations as _mergeConfirmations,
  deriveVerifiedFromConfirmations as _deriveVerifiedFromConfirmations,
  applyCloudVerifiedIntoConfirmations as _applyCloudVerifiedIntoConfirmations,
  mergeBacklog as _mergeBacklog,
  mergeStationNotes as _mergeStationNotes,
  mergePhotoTombstones as _mergePhotoTombstones,
  purgePhotoTombstones as _purgePhotoTombstones,
} from '../../domain/devMerge.js';
import { _readConfirmationsRaw, _writeConfirmations, getAllDevConfirmations, getAllStationNotes } from './data.js';

// ── Активація / деактивація ──────────────────────────

// ── Локальний таймстамп останньої зміни (планування автосинку) ──
// DEV_SYNC_LOCAL_TS більше не бере участі у порівнянні "хто новіший" —
// синхронізація тепер об'єднує дані, а не обирає переможця цілим блоком
// (див. _performFullSync нижче). Таймстамп лишається лише як тригер
// для _scheduleAutoSync().
export function _touchSyncTimestamp() {
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
    const signedIn   = !!user && !_devUser;
    _devUser         = user;
    _devAuthResolved = true;
    if (signedIn) _requestSync(false); // вхід або запуск — забрати зміни інших пристроїв
    if (_lastDevAuthContainer?.isConnected) {
      renderDevAuthSection(_lastDevAuthContainer);
    }
    if (_lastAboutSheet?.isConnected) {
      updateDevModeIndicator(_lastAboutSheet, isDevMode());
    }
  });
}

// ── Синхронізація ─────────────────────────────────────
// Мета: на всіх пристроях розробника однаковий вміст, і видалене на одному
// зникає на інших. Як це забезпечено:
//  – нотатки виходів і станцій — записи з часом { v, t } або позначка
//    видалення { d:true, t }; перемагає новіший (domain/devMerge.js);
//  – підтвердження позиції — запис цілком, перемагає новіша дія;
//  – беклог — текст цілком (без склеювання версій), див. mergeBacklog;
//  – видалені фото — спільний список у хмарі, за ним фото прибираються
//    і з інших пристроїв;
//  – читання, злиття і запис у хмару — одна транзакція Firestore, тож два
//    пристрої не затирають записи один одного;
//  – синхронізація запускається не лише після змін, а й при вході, запуску
//    й поверненні з фону — щоб пристрій без власних змін теж отримав чужі.
let _syncInFlight = false;
let _syncAgain    = false; // зміни під час синхронізації — ще одне коло після неї

function _readJson(key) {
  try { return JSON.parse(Storage.get(key) || '{}'); } catch { return {}; }
}

/** Знімок локального стану розробника в форматі документа в хмарі. */
function _readLocalDevState() {
  _ensureDevKeysMigrated();
  return {
    notes:         _purgeTombstones(_readJson(STORAGE_KEYS.DEV_NOTES)),
    confirmations: getAllDevConfirmations(),
    stationNotes:  getAllStationNotes(),
    backlog:       { v: Storage.get(STORAGE_KEYS.DEV_BACKLOG) || '', t: Number(Storage.get(STORAGE_KEYS.DEV_BACKLOG_T)) || 0 },
    backlogBase:   Storage.get(STORAGE_KEYS.DEV_BACKLOG_SYNC_BASE) || '',
    deletedPhotos: _purgePhotoTombstones(_getPhotoTombstones()),
  };
}

/** Чисте злиття локального стану з хмарним документом (або з уже записаним станом). */
function _mergeDevState(local, cloud) {
  if (!cloud) return local;
  const notes = _mergeKeyedMap(local.notes, cloud.notes);
  const confirmations = _applyCloudVerifiedIntoConfirmations(
    _mergeConfirmations(local.confirmations, cloud.confirmations),
    cloud.verified,
    !!cloud.confirmations,
  );
  // Хмара (інший пристрій зі старою версією) могла принести старі ключі рядків
  _migrateRowKeys(notes);
  _migrateRowKeys(confirmations);
  return {
    notes,
    confirmations,
    stationNotes:  _mergeStationNotes(local.stationNotes, cloud.stationNotes),
    backlog:       _mergeBacklog(local.backlog, { v: cloud.backlog, t: cloud.backlogT }, local.backlogBase),
    backlogBase:   local.backlogBase,
    deletedPhotos: _purgePhotoTombstones(_mergePhotoTombstones(local.deletedPhotos, cloud.deletedPhotos)),
  };
}

const _same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** Записує в Storage ті частини стану, що відрізняються від поточних. @returns {boolean} чи щось змінилось */
function _writeLocalDevState(next, current) {
  let changed = false;
  const put = (key, a, b, value = JSON.stringify(a)) => {
    if (_same(a, b)) return;
    Storage.set(key, value);
    changed = true;
  };
  put(STORAGE_KEYS.DEV_NOTES,          next.notes,         current.notes);
  put(STORAGE_KEYS.DEV_CONFIRMATIONS,  next.confirmations, current.confirmations);
  put(STORAGE_KEYS.DEV_STATION_NOTES,  next.stationNotes,  current.stationNotes);
  put(STORAGE_KEYS.DEV_DELETED_PHOTOS, next.deletedPhotos, current.deletedPhotos);
  if (next.backlog.v !== current.backlog.v.trim()) {
    Storage.set(STORAGE_KEYS.DEV_BACKLOG, next.backlog.v);
    changed = true;
  }
  if (next.backlog.t !== current.backlog.t) Storage.set(STORAGE_KEYS.DEV_BACKLOG_T, String(next.backlog.t));
  return changed;
}

/**
 * Повна синхронізація з хмарою (див. опис вище).
 * @returns {Promise<'downloaded'|'uploaded'|'busy'>}
 */
async function _performFullSync() {
  if (_syncInFlight) { _syncAgain = true; return 'busy'; }
  _syncInFlight = true;
  _syncAgain    = false;

  try {
    const written = await syncDevState(cloudData => {
      const merged = _mergeDevState(_readLocalDevState(), cloudData);
      return {
        notes:         merged.notes,
        verified:      _deriveVerifiedFromConfirmations(merged.confirmations), // для старих версій
        confirmations: merged.confirmations,
        stationNotes:  merged.stationNotes,
        backlog:       merged.backlog.v,
        backlogT:      merged.backlog.t,
        deletedPhotos: merged.deletedPhotos,
      };
    });
    if (!written) return 'uploaded';

    // Записаний у хмару стан зливаємо зі свіжим локальним: правки, зроблені
    // поки йшов запит, не губляться, а підуть наступним колом.
    const current = _readLocalDevState();
    const next    = _mergeDevState(current, written);
    const changed = _writeLocalDevState(next, current);
    // Хмара тепер містить цей текст беклогу — він база для наступного злиття
    Storage.set(STORAGE_KEYS.DEV_BACKLOG_SYNC_BASE, written.backlog);
    if (changed) {
      bus.emit('station:refresh');
      bus.emit('devmenu:refresh');
    }

    await _syncPhotos();

    return changed ? 'downloaded' : 'uploaded';

  } finally {
    _syncInFlight = false;
    if (_syncAgain) _requestSync(false);
  }
}

/**
 * Синхронізація фото. Видалені фото — { photoId: deletedAt } у Storage
 * (DEV_DELETED_PHOTOS) і в документі в хмарі; список спільний для всіх
 * пристроїв і зберігається рік. Фото з цього списку прибирається з хмари
 * і з кожного пристрою, а не вивантажується назад.
 *
 * Читаємо з IndexedDB спочатку тільки ключі (без даних) — завантажуємо
 * dataUrl лише для тих фото, які реально треба вивантажити в хмару.
 */
function _getPhotoTombstones() {
  return _readJson(STORAGE_KEYS.DEV_DELETED_PHOTOS);
}

function _savePhotoTombstones(map) {
  Storage.set(STORAGE_KEYS.DEV_DELETED_PHOTOS, JSON.stringify(map));
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

  // 1. Видалені на будь-якому пристрої — прибрати з хмари і звідси
  const deletedHere = [...localIds].filter(id => tombstones[id]);
  await Promise.allSettled([
    ...[...cloudIds].filter(id => tombstones[id]).map(id => deleteDevPhoto(id)),
    ...deletedHere.map(id => PhotoStorage.removePhoto(id)),
  ]);
  if (deletedHere.length) bus.emit('station:refresh');

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
const AUTO_SYNC_DEBOUNCE_MS   = 1500;
const URGENT_SYNC_DEBOUNCE_MS = 100;
let _autoSyncTimer = null;

export function _requestSync(immediate = false) {
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

function _scheduleAutoSync() { _requestSync(false); }

// Повернення з фону — підтягнути зміни з інших пристроїв, не частіше
// ніж раз на хвилину.
const RESUME_SYNC_INTERVAL_MS = 60 * 1000;
let _lastResumeSync = 0;
function _syncOnResume() {
  if (!isDevMode() || Date.now() - _lastResumeSync < RESUME_SYNC_INTERVAL_MS) return;
  _lastResumeSync = Date.now();
  _requestSync(false);
}
if (Capacitor.isNativePlatform()) {
  App.addListener('resume', _syncOnResume);
} else {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') _syncOnResume();
  });
}


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
export function _oldRowKeyFor(slug, rowKey) {
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

export function _ensureDevKeysMigrated() {
  if (_devKeysMigrated || !state.stationsData || !Object.keys(state.stationsData).length) return;
  _devKeysMigrated = true;
  let notes;
  try { notes = JSON.parse(Storage.get(STORAGE_KEYS.DEV_NOTES) || '{}'); } catch { notes = {}; }
  if (_migrateRowKeys(notes)) Storage.set(STORAGE_KEYS.DEV_NOTES, JSON.stringify(notes));
  const confirmations = _readConfirmationsRaw();
  if (_migrateRowKeys(confirmations)) _writeConfirmations(confirmations);
}


// ── UI: тост активації ────────────────────────────────
export const _showToast = showToast;

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
  Storage.remove(STORAGE_KEYS.DEV_BACKLOG_SYNC_BASE);
  Storage.remove(STORAGE_KEYS.DEV_BACKLOG_T);
  Storage.remove(STORAGE_KEYS.DEV_DELETED_PHOTOS);

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
