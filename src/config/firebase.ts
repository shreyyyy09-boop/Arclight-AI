import { getApps, initializeApp } from "firebase/app";
import { getAnalytics, isSupported } from "firebase/analytics";
import { Capacitor } from "@capacitor/core";
import {
  browserLocalPersistence,
  getAuth,
  GoogleAuthProvider,
  indexedDBLocalPersistence,
  initializeAuth,
  setPersistence,
} from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCdbjiGHtqxt57qAo7q9bKjV4_9S6R9-4o",
  authDomain: "arclight-ai.firebaseapp.com",
  projectId: "arclight-ai",
  storageBucket: "arclight-ai.firebasestorage.app",
  messagingSenderId: "937181559644",
  appId: "1:937181559644:web:3b0a042bf66bbcfb051f99",
  measurementId: "G-1FGZEKZMYZ"
};


const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);

const createAuth = () => {
  if (Capacitor.isNativePlatform()) {
    try {
      return initializeAuth(app, {
        persistence: indexedDBLocalPersistence,
      });
    } catch {
      return getAuth(app);
    }
  }

  return getAuth(app);
};

export const analyticsReady =
  typeof window !== "undefined"
    ? isSupported()
        .then((supported) => (supported ? getAnalytics(app) : null))
        .catch(() => null)
    : Promise.resolve(null);

export const auth = createAuth();

if (!Capacitor.isNativePlatform()) {
  void setPersistence(auth, browserLocalPersistence).catch((error) => {
    console.warn("Firebase auth persistence could not be enabled:", error);
  });
}
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });
