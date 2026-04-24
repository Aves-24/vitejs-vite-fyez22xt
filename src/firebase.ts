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

// --- TRYB DEBUG APP CHECK DLA DEVELOPMENTU ---
// Na localhost reCAPTCHA v3 często nie działa poprawnie. Firebase udostępnia
// "debug token" — samopodpisany token który trzeba raz zarejestrować
// w Firebase Console (App Check → Apps → Manage debug tokens).
// Włączamy go TYLKO w dev — w produkcji pozostaje pełna walidacja reCAPTCHA.
if (import.meta.env.DEV) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (self as any).FIREBASE_APPCHECK_DEBUG_TOKEN = true;
}

const app = initializeApp(firebaseConfig);

// --- APP CHECK — ochrona przed requestami z obcych originów ---
// reCAPTCHA v3 sprawdza niewidzialnie czy request pochodzi z prawdziwej
// przeglądarki odwiedzającej twoją domenę. Site key jest publiczny —
// to normalne, ochrona polega na weryfikacji domeny przez Google.
initializeAppCheck(app, {
  provider: new ReCaptchaV3Provider('6LdoQb8sAAAAAKUvHd7Wpu3aqbX9cJPTMWJfe_xp'),
  isTokenAutoRefreshEnabled: true,
});

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

