// ══ BACKUP SERVICE ══
// Відповідальність: серіалізація / десеріалізація даних користувача.
// Правило: жодного bus, жодного UI.
//          Повертає дані та Promise<ImportResult> — caller вирішує, що показати.
//
// Платформна логіка:
//   - Нативний Android/iOS → exportData через Filesystem+Share, pickAndValidate через FilePicker
//   - Веб / PWA (iPhone)   → exportData через Blob+<a>, pickAndValidate через <input type=file>

import { Capacitor }                       from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share }                           from '@capacitor/share';
import { FilePicker }                      from '@capawesome/capacitor-file-picker';
import { STORAGE_KEYS, Storage }           from '../core/storage.js';

// ── Константи ─────────────────────────────────────────────────

const APP_PREFIX   = 'metro_';
const BACKUP_TOKEN = STORAGE_KEYS.FAVS;

/**
 * Ключі, які належать користувачу (не налаштуванням).
 * Використовується також кнопкою «Очистити все» в settings.js.
 */
export const USER_DATA_KEYS = [
  STORAGE_KEYS.FAVS,
  STORAGE_KEYS.EXIT_FAVS,
  STORAGE_KEYS.CHECKINS,
  STORAGE_KEYS.LOCAL_EDITS,
  STORAGE_KEYS.EXIT_LABELS,
  STORAGE_KEYS.FAV_ROWS_ORDER,
];

// ── Типи результатів ──────────────────────────────────────────

/** @typedef {'success'|'cancelled'|'invalid'|'error'} ImportStatus */
/**
 * @typedef {Object} ImportResult
 * @property {ImportStatus} status
 * @property {string}       [reason]   — для 'invalid'
 * @property {Error}        [error]    — для 'error'
 */

// ── Хелпери ───────────────────────────────────────────────────

/**
 * Зчитує всі metro_* ключі з in-memory кешу Storage.
 * Коректно читає дані незалежно від платформи (Preferences / localStorage fallback).
 *
 * @returns {Record<string, string>}
 */
function _readAllAppData() {
  const result = {};
  for (const key of Object.values(STORAGE_KEYS)) {
    const value = Storage.get(key);
    if (value !== null) result[key] = value;
  }
  return result;
}

/**
 * Генерує ім'я файлу бекапу з поточною датою.
 * @returns {string}
 */
function _backupFilename() {
  return `KyivMetroGO_backup_${new Date().toISOString().slice(0, 10)}.json`;
}

/**
 * Перевіряє, чи об'єкт є валідним бекапом KyivMetroGO.
 *
 * @param {unknown} data
 * @returns {{ valid: boolean, reason?: string }}
 */
function _validate(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { valid: false, reason: 'Файл не є обʼєктом JSON.' };
  }
  const hasKnownKey = USER_DATA_KEYS.some(k => k in data)
    || BACKUP_TOKEN in data
    || 'metro_favs' in data; // legacy ключ до міграції STORAGE_KEYS
  if (!hasKnownKey) {
    return { valid: false, reason: 'Файл не містить даних KyivMetroGO.' };
  }
  return { valid: true };
}

/**
 * Парсить і валідує рядок JSON бекапу.
 * @param {string} text
 * @returns {ImportResult}
 */
function _parseAndValidate(text) {
  try {
    const parsed     = JSON.parse(text);
    const validation = _validate(parsed);
    if (!validation.valid) return { status: 'invalid', reason: validation.reason };
    return { status: 'success', data: parsed };
  } catch {
    return { status: 'invalid', reason: 'Файл містить некоректний JSON.' };
  }
}

// ── Реалізації експорту ───────────────────────────────────────

/**
 * Нативний експорт: записує файл у кеш і відкриває системний шеринг.
 * @param {string} json
 * @param {string} filename
 */
async function _exportNative(json, filename) {
  await Filesystem.writeFile({
    path:      filename,
    data:      json,
    directory: Directory.Cache,
    encoding:  Encoding.UTF8,
  });
  const { uri } = await Filesystem.getUri({
    directory: Directory.Cache,
    path:      filename,
  });
  await Share.share({
    title:       'KyivMetroGO — резервна копія',
    url:         uri,
    dialogTitle: 'Зберегти резервну копію',
  });
}

/**
 * Веб-експорт: Blob + <a download>.
 * @param {string} json
 * @param {string} filename
 */
function _exportWeb(json, filename) {
  const blob = new Blob([json], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement('a'), {
    href: url, download: filename, style: 'display:none',
  });
  document.body.appendChild(a);
  a.click();
  Promise.resolve().then(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });
}

// ── Реалізації імпорту ────────────────────────────────────────

/**
 * Веб-пікер: <input type="file"> з подвійним fallback для скасування.
 * focus (десктоп) + visibilitychange (Android WebView).
 * @returns {Promise<ImportResult>}
 */
function _pickWeb() {
  return new Promise(resolve => {
    const input = Object.assign(document.createElement('input'), {
      type: 'file', accept: '.json', style: 'display:none',
    });
    document.body.appendChild(input);

    let settled = false;
    const settle = result => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(result);
    };

    const cleanup = () => {
      if (input.parentNode) document.body.removeChild(input);
      window.removeEventListener('focus',            onFocus);
      document.removeEventListener('visibilitychange', onVisible);
    };

    // Fallback А — десктоп і більшість браузерів
    const onFocus = () => {
      setTimeout(() => {
        if (!input.files?.length) settle({ status: 'cancelled' });
      }, 400);
    };

    // Fallback Б — Android WebView: додаток повертається у фокус через visibilitychange
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        setTimeout(() => {
          if (!input.files?.length) settle({ status: 'cancelled' });
        }, 500);
      }
    };

    window.addEventListener('focus',            onFocus,   { once: true });
    document.addEventListener('visibilitychange', onVisible, { once: true });

    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) { settle({ status: 'cancelled' }); return; }

      const reader = new FileReader();
      reader.onerror = () => settle({ status: 'error', error: reader.error });
      reader.onload  = ev => settle(_parseAndValidate(ev.target.result));
      reader.readAsText(file);
    });

    // Нативна подія скасування (сучасні браузери)
    input.addEventListener('cancel', () => settle({ status: 'cancelled' }));

    input.click();
  });
}

// ── Публічне API ──────────────────────────────────────────────

/**
 * Перевіряє, чи є хоч якісь дані користувача в Storage.
 * Використовується для керування disabled-станом кнопок.
 *
 * @returns {boolean}
 */
export function hasUserData() {
  return USER_DATA_KEYS.some(k => {
    const v = Storage.get(k);
    return v !== null && v !== '{}' && v !== '[]' && v !== '';
  });
}

/**
 * Генерує та зберігає JSON-файл резервної копії.
 * Нативний: Filesystem + Share. Веб: Blob + <a download>.
 *
 * @param {{ devLog?: Array<object>|null }} [opts]
 * @returns {Promise<void>}
 */
export async function exportData({ devLog = null } = {}) {
  const allData = _readAllAppData();

  // Dev-лог — окремий нефільтрований ключ (не рядок → _restoreToStorage ігнорує)
  if (devLog && devLog.length > 0) {
    allData['═══════════════════════════════════════════════════'] =
      '══ ЛОГ ЗМІН — РЕЖИМ РОЗРОБНИКА ══';
    allData['_dev_change_log'] = devLog.map(entry => ({
      час:     new Date(entry.ts).toLocaleString('uk-UA'),
      станція: entry.station,
      slug:    entry.slug,
      напрям:  entry.dir   || '—',
      вихід:   entry.exit  || '—',
      поле:    entry.field || '—',
      було:    entry.from  ?? '—',
      стало:   entry.to    ?? '—',
    }));
  }

  const json     = JSON.stringify(allData, null, 2);
  const filename = _backupFilename();

  if (Capacitor.isNativePlatform()) {
    await _exportNative(json, filename);
  } else {
    _exportWeb(json, filename);
  }
}

// ── Нативний пікер ────────────────────────────────────────────

/**
 * Нативний пікер через @capawesome/capacitor-file-picker.
 * Використовує системний Intent.ACTION_GET_CONTENT (Android) або UIDocumentPickerViewController (iOS).
 * Скасування — явне: FilePicker повертає порожній files[], жодних таймерів.
 * readData:true → file.data є base64, безпечно для маленьких JSON-файлів.
 *
 * @returns {Promise<ImportResult>}
 */
async function _pickNative() {
  const result = await FilePicker.pickFiles({
    types:    ['application/json'],
    limit:    1,
    readData: true,
  });

  // Порожній масив = користувач закрив пікер без вибору
  if (!result.files.length) return { status: 'cancelled' };

  const file = result.files[0];

  // file.data — base64-рядок; atob() декодує в UTF-8 текст
  let text;
  try {
    text = atob(file.data);
  } catch {
    return { status: 'invalid', reason: 'Не вдалося прочитати вміст файлу.' };
  }

  return _parseAndValidate(text);
}

// ── Публічне API ──────────────────────────────────────────────

/**
 * Відкриває файловий діалог, читає, валідує — повертає ImportResult.
 * НЕ перезаписує Storage — caller вирішує, що робити з результатом.
 *
 * Нативний Android/iOS → FilePicker (системний Intent, надійне скасування).
 * Веб / PWA (iPhone)   → <input type="file"> з подвійним fallback.
 *
 * @returns {Promise<ImportResult>}
 */
export function pickAndValidateBackup() {
  return Capacitor.isNativePlatform() ? _pickNative() : _pickWeb();
}

/**
 * Відновлює дані з валідованого об'єкту бекапу та перезавантажує сторінку.
 * Викликається лише після підтвердження користувачем.
 * Гарантує завершення запису до reload().
 *
 * @param {Record<string, string>} data — результат успішного pickAndValidateBackup
 * @returns {Promise<void>}
 */
export async function restoreAndReload(data) {
  await Storage.restoreFromBackup(data);
  window.location.reload();
}

export const BackupService = { exportData, pickAndValidateBackup, restoreAndReload, hasUserData };
