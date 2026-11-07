// Firebase web API key is publishable (it identifies the project; Firestore rules protect data).
export const FIREBASE_WEB_API_KEY = '';

import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

export const firebaseConfig = {
  // Provide this build-time value through Vercel's Environment Variables.
  apiKey:
    (globalThis as { __DURRAT_FIREBASE_KEY__?: string }).__DURRAT_FIREBASE_KEY__ ||
    (import.meta.env.VITE_FIREBASE_API_KEY as string | undefined) ||
    FIREBASE_WEB_API_KEY,
  authDomain: 'durratalhijarh.firebaseapp.com',
  projectId: 'durratalhijarh',
  storageBucket: 'durratalhijarh.firebasestorage.app',
  messagingSenderId: '641813414689',
  appId: '1:641813414689:web:e8c379a64764e292acb460',
};

export const firebaseConfigReady = Boolean(firebaseConfig.apiKey.trim());

if (!firebaseConfigReady) {
  console.warn('Firebase is not configured: set VITE_FIREBASE_API_KEY before deploying.');
}

const firebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const auth = getAuth(firebaseApp);
export const db = getFirestore(firebaseApp);
export const storage = getStorage(firebaseApp);
