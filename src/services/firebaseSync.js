import { auth, db, storage } from './firebase.js';
import { signInWithEmailAndPassword, onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { ref, uploadString, getDownloadURL, listAll } from 'firebase/storage';

// ── Стан авторизації (реактивний, не читаємо auth.currentUser напряму) ──
// auth.currentUser відновлюється з IndexedDB АСИНХРОННО: одразу після
// getAuth() він майже завжди null, навіть якщо сесія валідна. Тому весь
// застосунок має орієнтуватись на цей підписний стан, а не на currentUser
// напряму — інакше UI при старті показує "не авторизовано" для вже
// залогіненого розробника.
let _authReady = false;
let _authListeners = [];

onAuthStateChanged(auth, user => {
  _authReady = true;
  _authListeners.forEach(cb => cb(user));
});

/**
 * Підписка на зміну стану авторизації. Викликає callback одразу з поточним
 * станом (null, якщо SDK ще не встиг відповісти) і надалі — при кожній зміні.
 * @param {(user: import('firebase/auth').User|null) => void} callback
 * @returns {() => void} функція відписки
 */
export function onDevAuthChange(callback) {
  _authListeners.push(callback);
  if (_authReady) callback(auth.currentUser);
  return () => { _authListeners = _authListeners.filter(cb => cb !== callback); };
}

/** @returns {boolean} true щойно SDK вперше відповів (успішно чи ні) на питання "хто залогінений" */
export function isAuthResolved() {
  return _authReady;
}

/** @returns {import('firebase/auth').User|null} поточний користувач, якщо стан вже відомий */
export function getCurrentDevUser() {
  return _authReady ? auth.currentUser : null;
}

// 1. Авторизація розробника
export async function loginDev(email, password) {
  try {
    const credential = await signInWithEmailAndPassword(auth, email, password);
    return credential.user;
  } catch (error) {
    console.error("Помилка авторизації Firebase:", error);
    throw error;
  }
}

/** Вихід з акаунту розробника. */
export async function logoutDev() {
  await signOut(auth);
}

// ── Шлях до документа: окремий на кожного розробника (по uid) ──
// Раніше всі писали в один спільний dev_data/main_state — другий розробник
// затирав би дані першого. uid стабільний і унікальний для кожного акаунта.
function _devDocRef() {
  if (!auth.currentUser) return null;
  return doc(db, 'dev_data', auth.currentUser.uid);
}

// 2. Відправка локальних даних у хмару
export async function uploadDevState(notes, verified, backlog, confirmations, stationNotes) {
  const docRef = _devDocRef();
  if (!docRef) return;

  await setDoc(docRef, {
    notes: notes,
    verified: verified,
    backlog: backlog || '',
    confirmations: confirmations || {},
    stationNotes: stationNotes || {},
    updatedAt: Date.now()
  });
}

// 3. Завантаження даних з хмари
export async function downloadDevState() {
  const docRef = _devDocRef();
  if (!docRef) return null;

  const docSnap = await getDoc(docRef);

  if (docSnap.exists()) {
    return docSnap.data();
  }
  return null;
}

// ── Фото: Firebase Storage, окремими файлами (не base64 в Firestore) ──
// Firestore-документ обмежений 1 МіБ — кілька фото в base64 його б
// переповнили миттєво. Тому фото зберігаються в Storage як окремі об'єкти
// dev_photos/{uid}/{photoId}.jpg, а Firestore-документ їх узагалі не бачить.
function _photoRef(photoId) {
  if (!auth.currentUser) return null;
  return ref(storage, `dev_photos/${auth.currentUser.uid}/${photoId}.jpg`);
}

function _photosFolderRef() {
  if (!auth.currentUser) return null;
  return ref(storage, `dev_photos/${auth.currentUser.uid}`);
}

/**
 * Вивантажує одне фото (data URL) у Storage під заданим id.
 * @param {string} photoId
 * @param {string} dataUrl
 */
export async function uploadDevPhoto(photoId, dataUrl) {
  const fileRef = _photoRef(photoId);
  if (!fileRef) return;
  await uploadString(fileRef, dataUrl, 'data_url');
}

/**
 * @returns {Promise<string[]>} id усіх фото, які зараз лежать у хмарі для цього акаунта
 */
export async function listDevPhotoIds() {
  const folder = _photosFolderRef();
  if (!folder) return [];
  const result = await listAll(folder);
  return result.items.map(item => item.name.replace(/\.jpg$/, ''));
}

/**
 * Завантажує одне фото з хмари і повертає його як data URL
 * (щоб одразу можна було покласти в PhotoStorage без додаткової конвертації).
 * @param {string} photoId
 * @returns {Promise<string>}
 */
export async function downloadDevPhoto(photoId) {
  const fileRef = _photoRef(photoId);
  const url = await getDownloadURL(fileRef);
  const res = await fetch(url);
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}