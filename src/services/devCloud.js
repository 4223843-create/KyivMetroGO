// ══ ХМАРА РОЗРОБНИКА: ЛІНИВЕ ЗАВАНТАЖЕННЯ FIREBASE ══
// Firebase (Auth + Firestore + Storage) — це ~3/4 усього JavaScript застосунку,
// а потрібен він лише в режимі розробника. Тому firebaseSync.js підтягується
// динамічним import() при першому зверненні і потрапляє в окремий файл збірки,
// який звичайний користувач ніколи не завантажує.
//
// API те саме, що в firebaseSync.js; усі функції асинхронні, крім onDevAuthChange.

let _modulePromise = null;

function _load() {
  _modulePromise ??= import('./firebaseSync.js').catch(err => {
    _modulePromise = null; // наприклад, офлайн при першому завантаженні — спробуємо ще раз
    throw err;
  });
  return _modulePromise;
}

/**
 * Підписка на стан авторизації. Сама запускає завантаження Firebase.
 * @param {(user: object|null) => void} callback
 * @returns {() => void} відписка
 */
export function onDevAuthChange(callback) {
  let unsubscribe = null;
  let cancelled   = false;
  _load()
    .then(m => { if (!cancelled) unsubscribe = m.onDevAuthChange(callback); })
    .catch(err => console.warn('[devCloud] Firebase не завантажився:', err));
  return () => { cancelled = true; unsubscribe?.(); };
}

const _call = name => async (...args) => (await _load())[name](...args);

export const loginDev         = _call('loginDev');
export const logoutDev        = _call('logoutDev');
export const uploadDevState   = _call('uploadDevState');
export const downloadDevState = _call('downloadDevState');
export const uploadDevPhoto   = _call('uploadDevPhoto');
export const deleteDevPhoto   = _call('deleteDevPhoto');
export const listDevPhotoIds  = _call('listDevPhotoIds');
export const downloadDevPhoto = _call('downloadDevPhoto');
