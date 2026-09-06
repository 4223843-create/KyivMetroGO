// ══ GOOGLE DRIVE SYNC SERVICE (appDataFolder) ══
// Відповідальність: авторизація Google Identity Services (GIS) та обмін
// одним файлом `dev_data_backup.json` у прихованій папці appDataFolder.
// Правило: жодного bus, жодного UI, жодного читання/запису Storage чи
// PhotoStorage напряму — тільки мережа й токен. Caller (devmode.js) вирішує,
// що робити з результатом.
//
// appDataFolder — спеціальна папка Google Drive, невидима користувачу в
// звичайному інтерфейсі Drive і недоступна іншим застосункам: ідеальне
// місце для даних, які не повинні "муляти око" чи плутатись зі звичайними
// файлами користувача. Саме тому обраний найвужчий можливий scope —
// `drive.appdata` — він НЕ дає доступу до жодних інших файлів на диску.
//
// Модель колбеків: initGoogleDriveAuth(onSuccess, onError) реєструє
// "постійні" обробники — вони спрацьовують на КОЖЕН акт авторизації,
// незалежно від того, хто його ініціював (клік по кнопці синхронізації чи
// внутрішній виклик з downloadDevDataFromDrive/uploadDevDataToDrive).
// requestDriveAuth() — той самий механізм, але як Promise, зручний для
// await всередині цього ж модуля. Токен живе лише в пам'яті процесу.

const CLIENT_ID  = '107053151946-9aorgec5m7lnr5bnco6kb4f2urninooc.apps.googleusercontent.com';
const SCOPE      = 'https://www.googleapis.com/auth/drive.appdata';
const FILE_NAME  = 'dev_data_backup.json';
const API_FILES  = 'https://www.googleapis.com/drive/v3/files';
const API_UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';

let _tokenClient        = null;
let _accessToken        = null;
let _tokenExpiry        = 0; // Date.now() у момент, коли токен вважаємо застарілим
let _permanentOnSuccess = null;
let _permanentOnError   = null;

function _hasValidToken() {
  return !!_accessToken && Date.now() < _tokenExpiry;
}

function _storeToken(response) {
  _accessToken = response.access_token;
  // GIS повертає expires_in у секундах; лишаємо 60-секундний запас про всяк випадок
  _tokenExpiry = Date.now() + (Number(response.expires_in || 3600) - 60) * 1000;
}

// ── Ініціалізація ─────────────────────────────────────────────
/**
 * Ініціалізує GIS token client і реєструє постійні обробники результату
 * авторизації. Викликати один раз (наприклад, при активації Dev Mode UI),
 * коли скрипт https://accounts.google.com/gsi/client вже завантажився.
 *
 * @param {(token: string) => void} onSuccess — на кожен успішний акт авторизації
 * @param {(error: any) => void}    onError   — на кожну відмову/помилку GIS
 * @returns {boolean} true якщо client встановлено, false якщо GIS ще не завантажився
 */
export function initGoogleDriveAuth(onSuccess, onError) {
  _permanentOnSuccess = onSuccess || null;
  _permanentOnError   = onError   || null;

  if (typeof google === 'undefined' || !google.accounts?.oauth2) {
    _permanentOnError?.(new Error('Google Identity Services ще не завантажено'));
    return false;
  }

  _tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope:     SCOPE,
    // Дефолтний callback — спрацьовує, якщо requestAccessToken викликали
    // напряму (в обхід requestDriveAuth). У нашому потоці цього не буває,
    // але лишаємо для коректності на випадок прямого виклику ззовні.
    callback: (response) => {
      if (response.error) { _permanentOnError?.(response); return; }
      _storeToken(response);
      _permanentOnSuccess?.(_accessToken);
    },
    error_callback: (err) => _permanentOnError?.(err),
  });

  return true;
}

/**
 * Забезпечує наявність дійсного access token: повертає його одразу, якщо
 * він ще дійсний, інакше показує вікно згоди Google (перший раз) або
 * silent-запит (prompt:'' — без вікна, якщо в цій сесії вже був консент).
 * Той самий permanent onSuccess/onError з initGoogleDriveAuth спрацьовує
 * і тут — тож UI, підписаний на них, завжди в курсі стану авторизації.
 *
 * @param {{ silent?: boolean }} [opts]
 * @returns {Promise<string>} access token
 */
export function requestDriveAuth({ silent = false } = {}) {
  return new Promise((resolve, reject) => {
    if (_hasValidToken()) {
      resolve(_accessToken);
      return;
    }
    if (!_tokenClient) {
      const err = new Error('initGoogleDriveAuth() не викликано або GIS не завантажено');
      _permanentOnError?.(err);
      reject(err);
      return;
    }

    _tokenClient.callback = (response) => {
      if (response.error) {
        _permanentOnError?.(response);
        reject(response);
        return;
      }
      _storeToken(response);
      _permanentOnSuccess?.(_accessToken);
      resolve(_accessToken);
    };

    _tokenClient.requestAccessToken({ prompt: silent ? '' : 'consent' });
  });
}

/** Скидає токен у пам'яті (наприклад, при виході з Dev Mode). */
export function clearDriveAuth() {
  _accessToken = null;
  _tokenExpiry = 0;
}

/** @returns {boolean} чи є зараз дійсний токен без потреби питати заново */
export function isDriveAuthorized() {
  return _hasValidToken();
}

// ── Внутрішній хелпер: пошук файлу в appDataFolder ────────────
/**
 * @param {string} token
 * @returns {Promise<string|null>} fileId або null якщо файл ще не створено
 */
async function _findBackupFileId(token) {
  const query = encodeURIComponent(`name='${FILE_NAME}' and trashed=false`);
  const url   = `${API_FILES}?spaces=appDataFolder&fields=files(id,name,modifiedTime)&q=${query}`;
  const res   = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Drive API помилка пошуку файлу: ${res.status}`);
  const json = await res.json();
  return json.files?.[0]?.id ?? null;
}

// ── Публічне API: завантаження ────────────────────────────────
/**
 * Шукає dev_data_backup.json в appDataFolder і повертає розібраний вміст.
 * Повертає null якщо файл ще не існує (перша синхронізація з цього акаунта).
 *
 * @returns {Promise<object|null>}
 */
export async function downloadDevDataFromDrive() {
  const token  = await requestDriveAuth();
  const fileId = await _findBackupFileId(token);
  if (!fileId) return null;

  const res = await fetch(`${API_FILES}/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Drive API помилка завантаження файлу: ${res.status}`);

  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('dev_data_backup.json у Drive містить некоректний JSON');
  }
}

// ── Публічне API: вивантаження ────────────────────────────────
/**
 * Створює (якщо файлу ще нема) або оновлює dev_data_backup.json в appDataFolder.
 *
 * @param {object} payload — { notes, verified, photos, updatedAt }
 * @returns {Promise<void>}
 */
export async function uploadDevDataToDrive(payload) {
  const token  = await requestDriveAuth();
  const fileId = await _findBackupFileId(token);
  const body   = JSON.stringify(payload);

  if (fileId) {
    // Файл вже існує — оновлюємо тільки вміст (PATCH media), метадані не чіпаємо.
    const res = await fetch(`${API_UPLOAD}/${fileId}?uploadType=media`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body,
    });
    if (!res.ok) throw new Error(`Drive API помилка оновлення файлу: ${res.status}`);
    return;
  }

  // Файл ще не існує — створюємо через multipart (метадані + вміст одним запитом).
  const boundary = 'kyivmetrogo_devsync_boundary';
  const metadata = { name: FILE_NAME, parents: ['appDataFolder'] };
  const multipartBody =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: application/json\r\n\r\n` +
    `${body}\r\n` +
    `--${boundary}--`;

  const res = await fetch(`${API_UPLOAD}?uploadType=multipart`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body: multipartBody,
  });
  if (!res.ok) throw new Error(`Drive API помилка створення файлу: ${res.status}`);
}

export const GoogleDriveSync = {
  initGoogleDriveAuth,
  requestDriveAuth,
  clearDriveAuth,
  isDriveAuthorized,
  downloadDevDataFromDrive,
  uploadDevDataToDrive,
};