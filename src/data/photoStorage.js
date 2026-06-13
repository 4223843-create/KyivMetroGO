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

// Іменований об'єкт для зручного імпорту одним рядком
export const PhotoStorage = { savePhoto, loadPhoto, removePhoto, clearAllPhotos };