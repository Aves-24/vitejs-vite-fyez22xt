import { initializeApp } from 'firebase/app';
// Nowe importy dla najnowszego standardu Firebase
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, persistentSingleTabManager, doc, getDoc, getDocs, collection, updateDoc } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';

const firebaseConfig = {
  apiKey: 'AIzaSyCTBVxgdbTMDf4XIc0GQ7MCIuRRWgrcvLE',
  authDomain: 'grotx-fb8f8.firebaseapp.com',
  projectId: 'grotx-fb8f8',
  storageBucket: 'grotx-fb8f8.firebasestorage.app',
  messagingSenderId: '639521703891',
  appId: '1:639521703891:web:b8e9befdefd9b016591126',
};

const app = initializeApp(firebaseConfig);

// App Check aktywny tylko w produkcji — w DEV reCAPTCHA v3 i tak nie działa
// poprawnie na localhost, a debug token wymaga ręcznej rejestracji w Console.
if (!import.meta.env.DEV) {
  initializeAppCheck(app, {
    provider: new ReCaptchaV3Provider('6LdoQb8sAAAAAKUvHd7Wpu3aqbX9cJPTMWJfe_xp'),
    isTokenAutoRefreshEnabled: true,
  });
}

// --- NOWA TARCZA OCHRONNA PRZED "DUCHAMI" (Zastępuje przekreślone enableIndexedDbPersistence) ---
// Ten sposób jest oficjalnym standardem Firebase V10.
// DEV: singleTab — eliminuje WebSocket "CLOSING/CLOSED" szum podczas HMR Vite.
// PROD: multipleTab — pełne współdzielenie cache między kartami (offline support).
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: import.meta.env.DEV
      ? persistentSingleTabManager({})
      : persistentMultipleTabManager()
  })
});

export const auth = getAuth(app);

// --- DEV-ONLY: wystaw Firebase na window dla testów w DevTools Console ---
// W produkcji ten blok jest usuwany przez tree-shaking (import.meta.env.DEV = false).
if (import.meta.env.DEV) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).__fb = { db, auth, doc, getDoc, getDocs, collection, updateDoc };
  // eslint-disable-next-line no-console
  console.log('[DEV] Firebase expose na window.__fb');
}

