// ══ GOOGLE DRIVE SYNC SERVICE (appDataFolder) ══

const CLIENT_ID = '107053151946-9aorgec5m7lnr5bnco6kb4f2urninooc.apps.googleusercontent.com';
const SCOPE     = 'https://www.googleapis.com/auth/drive.appdata';
const FILE_NAME = 'dev_data_backup.json';

const DRIVE_API  = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3/files';

let _tokenClient = null;
let _accessToken = null;

/**
 * Ініціалізація клієнта авторизації Google
 */
export function initGoogleDriveAuth(onSuccess, onError) {
  if (typeof google === 'undefined' || !google.accounts?.oauth2) {
    console.warn('[GoogleDrive] Google Identity Services SDK не завантажено');
    return;
  }

  _tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: SCOPE,
    callback: (response) => {
      if (response.error) {
        console.error('[GoogleDrive] Auth error:', response);
        onError?.(response);
        return;
      }
      _accessToken = response.access_token;
      onSuccess?.(_accessToken);
    },
  });
}

/**
 * Запит на вхід та отримання токена
 */
export function requestDriveAuth() {
  if (!_tokenClient) {
    initGoogleDriveAuth();
  }
  _tokenClient?.requestAccessToken({ prompt: 'consent' });
}

export function getDriveAccessToken() {
  return _accessToken;
}

/**
 * Пошук ID файла бекапу в appDataFolder
 */
async function _findBackupFile() {
  if (!_accessToken) return null;
  try {
    const res = await fetch(`${DRIVE_API}?spaces=appDataFolder&q=name='${FILE_NAME}'`, {
      headers: { Authorization: `Bearer ${_accessToken}` },
    });
    const data = await res.json();
    return data.files?.[0]?.id || null;
  } catch (err) {
    console.error('[GoogleDrive] Помилка пошуку файлу:', err);
    return null;
  }
}

/**
 * Завантаження даних з Google Drive
 */
export async function downloadDevDataFromDrive() {
  if (!_accessToken) return null;
  const fileId = await _findBackupFile();
  if (!fileId) return null;

  try {
    const res = await fetch(`${DRIVE_API}/${fileId}?alt=media`, {
      headers: { Authorization: `Bearer ${_accessToken}` },
    });
    return await res.json();
  } catch (err) {
    console.error('[GoogleDrive] Помилка завантаження даних:', err);
    return null;
  }
}

/**
 * Відправка локальних даних Dev Mode у Google Drive
 */
export async function uploadDevDataToDrive(payload) {
  if (!_accessToken) return;

  const fileId = await _findBackupFile();
  const fileBlob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });

  try {
    if (fileId) {
      await fetch(`${UPLOAD_API}/${fileId}?uploadType=media`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${_accessToken}`,
          'Content-Type': 'application/json',
        },
        body: fileBlob,
      });
    } else {
      const metadata = { name: FILE_NAME, parents: ['appDataFolder'] };
      const formData = new FormData();
      formData.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
      formData.append('file', fileBlob);

      await fetch(`${UPLOAD_API}?uploadType=multipart`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${_accessToken}` },
        body: formData,
      });
    }
  } catch (err) {
    console.error('[GoogleDrive] Помилка збереження даних:', err);
  }
}