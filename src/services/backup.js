// ══ BACKUP SERVICE ══
// Відповідальність: серіалізація / десеріалізація даних користувача.
// Правило: жодного MetroApp, жодного bus, жодного UI.
//          Повертає дані та Promise<ImportResult> — caller вирішує, що показати.

import { STORAGE_KEYS, Storage } from '../core/storage.js';

// ── Константи ─────────────────────────────────────────────────

const APP_PREFIX   = 'metro_';
const BACKUP_TOKEN = STORAGE_KEYS.FAVS; // маркер валідного бекапу

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
 * Зчитує всі metro_* ключі з localStorage.
 * Не читає через Storage.get(), щоб гарантовано захопити всі ключі,
 * включно з тими, що не оголошені в STORAGE_KEYS (legacy або майбутні).
 *
 * @returns {Record<string, string>}
 */
function _readAllAppData() {
  const result = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(APP_PREFIX)) {
      result[key] = localStorage.getItem(key);
    }
  }
  return result;
}

/**
 * Перевіряє, чи об'єкт є валідним бекапом KyivMetroGO.
 * Мінімальна умова: наявність хоча б одного з відомих ключів.
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
 * Записує данні в localStorage, пропускаючи службові маркери dev-логу.
 * Ключі-роздільники (═══...) ігноруються.
 *
 * @param {Record<string, unknown>} data
 */
function _restoreToStorage(data) {
  // Очищаємо тільки metro_* ключі, не чіпаємо сторонні (напр. Formspree token)
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const key = localStorage.key(i);
    if (key && key.startsWith(APP_PREFIX)) localStorage.removeItem(key);
  }
  for (const [key, value] of Object.entries(data)) {
    if (!key.startsWith(APP_PREFIX))    continue;  // ігнор сторонніх
    if (key.startsWith('═'))            continue;  // ігнор роздільників
    if (typeof value !== 'string')      continue;  // ігнор _dev_change_log (масив)
    localStorage.setItem(key, value);
  }
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
 * Генерує та завантажує JSON-файл резервної копії.
 * Синхронний — Blob і URL.createObjectURL не потребують await.
 *
 * @param {{ devLog?: Array<object>|null }} [opts]
 */
export function exportData({ devLog = null } = {}) {
  const allData = _readAllAppData();

  // Dev-лог додається як нефільтрований масив в окремий ключ
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
  const blob     = new Blob([json], { type: 'application/json' });
  const url      = URL.createObjectURL(blob);
  const filename = `KyivMetroGO_backup_${new Date().toISOString().slice(0, 10)}.json`;

  const a = Object.assign(document.createElement('a'), {
    href: url, download: filename, style: 'display:none',
  });
  document.body.appendChild(a);
  a.click();
  // Мікротаск: прибираємо після того, як браузер ініціював завантаження
  Promise.resolve().then(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });
}

/**
 * Відкриває файловий діалог, читає файл, валідує, повертає результат.
 * НЕ перезаписує Storage — caller вирішує, що робити з результатом.
 *
 * @returns {Promise<ImportResult>}
 */
export function pickAndValidateBackup() {
  return new Promise(resolve => {
    const input = Object.assign(document.createElement('input'), {
      type: 'file', accept: '.json', style: 'display:none',
    });
    document.body.appendChild(input);

    // Cleanup helper
    const cleanup = () => {
      if (input.parentNode) document.body.removeChild(input);
    };

    // Якщо користувач закрив діалог без вибору файлу
    // 'cancel' подія є лише в нових браузерах — fallback через focus + таймер
    const onWindowFocus = () => {
      setTimeout(() => {
        if (!input.files?.length) { cleanup(); resolve({ status: 'cancelled' }); }
      }, 400);
    };
    window.addEventListener('focus', onWindowFocus, { once: true });

    input.addEventListener('change', () => {
      window.removeEventListener('focus', onWindowFocus);
      const file = input.files?.[0];
      cleanup();
      if (!file) { resolve({ status: 'cancelled' }); return; }

      const reader = new FileReader();
      reader.onerror = () => resolve({ status: 'error', error: reader.error });
      reader.onload  = ev => {
        try {
          const parsed     = JSON.parse(ev.target.result);
          const validation = _validate(parsed);
          if (!validation.valid) {
            resolve({ status: 'invalid', reason: validation.reason });
            return;
          }
          // Повертаємо розібрані дані — caller зробить підтвердження і потім restore
          resolve({ status: 'success', data: parsed });
        } catch {
          resolve({ status: 'invalid', reason: 'Файл містить некоректний JSON.' });
        }
      };
      reader.readAsText(file);
    });

    input.click();
  });
}

/**
 * Відновлює дані з валідованого об'єкту бекапу та перезавантажує сторінку.
 * Викликається лише після підтвердження користувачем.
 *
 * @param {Record<string, string>} data — результат успішного pickAndValidateBackup
 */
export function restoreAndReload(data) {
  _restoreToStorage(data);
  window.location.reload();
}

export const BackupService = { exportData, pickAndValidateBackup, restoreAndReload, hasUserData };