// ══ PHOTO STORAGE ══
// Відповідальність: зберігання фотографій позицій у IndexedDB.

const DB_NAME    = 'MetroPhotoDB';
const STORE_NAME = 'photos';
const DB_VERSION = 1;

// ── Внутрішній хелпер: відкриття з'єднання ──────────────────
// Кешуємо Promise, щоб не відкривати нове з'єднання на кожен виклик.
// IndexedDB не є thread-safe — один екземпляр на вкладку достатньо.

let _dbPromise = null;

function _openDB() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE_NAME);
    req.onsuccess       = () => resolve(req.result);
    req.onerror         = () => { _dbPromise = null; reject(req.error); };
    req.onblocked       = () => console.warn('[PhotoStorage] IndexedDB заблоковано іншою вкладкою');
  });
  return _dbPromise;
}

// ── Публічне API ──────────────────────────────────────────────

/**
 * Зберегти або оновити фото.
 * @param {string} id        — унікальний ключ, напр. `"slug_0"`
 * @param {string} dataUrl   — base64 data URL (результат FileReader)
 * @returns {Promise<void>}
 */
export async function savePhoto(id, dataUrl) {
  const db = await _openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).put(dataUrl, id);
    req.onsuccess = () => resolve();
    req.onerror   = () => reject(req.error);
  });
}

/**
 * Завантажити фото.
 * @param {string} id
 * @returns {Promise<string|undefined>}  — dataUrl або undefined, якщо фото немає
 */
export async function loadPhoto(id) {
  const db = await _openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE_NAME).objectStore(STORE_NAME).get(id);
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

/**
 * Видалити одне фото.
 * @param {string} id
 * @returns {Promise<void>}
 */
export async function removePhoto(id) {
  const db = await _openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).delete(id);
    req.onsuccess = () => resolve();
    req.onerror   = () => reject(req.error);
  });
}

/**
 * Очистити весь сховище (використовується при скиданні даних dev-режиму).
 * @returns {Promise<void>}
 */
export async function clearAllPhotos() {
  const db = await _openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).clear();
    req.onsuccess = () => resolve();
    req.onerror   = () => reject(req.error);
  });
}

/**
 * Повертає ВСІ фото як плаский об'єкт { id: dataUrl }.
 * Використовується для збірки пейлоада синхронізації Dev Mode —
 * інших сценаріїв масового читання в застосунку немає.
 * @returns {Promise<Record<string,string>>}
 */
export async function getAllPhotos() {
  const db = await _openDB();
  return new Promise((resolve, reject) => {
    const store  = db.transaction(STORE_NAME).objectStore(STORE_NAME);
    const result = {};

    // getAllKeys/getAll підтримуються у всіх платформах, де є IndexedDB
    // (включно з WKWebView/Android WebView, на яких працює цей застосунок).
    const keysReq = store.getAllKeys();
    keysReq.onerror = () => reject(keysReq.error);
    keysReq.onsuccess = () => {
      const keys = keysReq.result;
      const valuesReq = store.getAll();
      valuesReq.onerror = () => reject(valuesReq.error);
      valuesReq.onsuccess = () => {
        const values = valuesReq.result;
        keys.forEach((key, i) => { result[key] = values[i]; });
        resolve(result);
      };
    };
  });
}

/**
 * Накатує набір фото { id: dataUrl } поверх поточного сховища.
 * Існуючі id з тим самим ключем перезаписуються; решта — не чіпається.
 * Використовується при застосуванні пейлоада синхронізації Dev Mode.
 * @param {Record<string,string>} photosMap
 * @returns {Promise<void>}
 */
export async function bulkSavePhotos(photosMap) {
  const entries = Object.entries(photosMap || {});
  if (!entries.length) return;
  const db = await _openDB();
  return new Promise((resolve, reject) => {
    const tx    = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    entries.forEach(([id, dataUrl]) => store.put(dataUrl, id));
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error);
  });
}

// Іменований об'єкт для зручного імпорту одним рядком
export const PhotoStorage = { savePhoto, loadPhoto, removePhoto, clearAllPhotos, getAllPhotos, bulkSavePhotos };