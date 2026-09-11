import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyDVTmTvvR1vQhS-uDSt9cu-X13CF1anvVQ",
  authDomain: "kyivmetrogo-e6bd8.firebaseapp.com",
  projectId: "kyivmetrogo-e6bd8",
  storageBucket: "kyivmetrogo-e6bd8.firebasestorage.app",
  messagingSenderId: "959517690378",
  appId: "1:959517690378:web:ce03a5b902c51f587aedf3"
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const storage = getStorage(app);
export const auth = getAuth(app);