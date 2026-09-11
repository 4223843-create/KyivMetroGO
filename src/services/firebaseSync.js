import { auth, db } from './firebase.js';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';

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

// 2. Відправка локальних даних у хмару
export async function uploadDevState(notes, verified) {
  if (!auth.currentUser) return;
  
  // Зберігаємо в колекцію dev_data, документ main_state
  const docRef = doc(db, "dev_data", "main_state");
  await setDoc(docRef, {
    notes: notes,
    verified: verified,
    updatedAt: Date.now()
  });
}

// 3. Завантаження даних з хмари
export async function downloadDevState() {
  if (!auth.currentUser) return null;

  const docRef = doc(db, "dev_data", "main_state");
  const docSnap = await getDoc(docRef);
  
  if (docSnap.exists()) {
    return docSnap.data();
  }
  return null;
}