import { auth, db } from './firebase.js';
import { signInWithEmailAndPassword, onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';

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
export async function uploadDevState(notes, verified) {
  const ref = _devDocRef();
  if (!ref) return;

  await setDoc(ref, {
    notes: notes,
    verified: verified,
    updatedAt: Date.now()
  });
}

// 3. Завантаження даних з хмари
export async function downloadDevState() {
  const ref = _devDocRef();
  if (!ref) return null;

  const docSnap = await getDoc(ref);

  if (docSnap.exists()) {
    return docSnap.data();
  }
  return null;
}