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

// --- APP CHECK ---
// UWAGA: wymuszanie App Check jest włączone dla Authentication od 2026-07-15.
// Bez ważnego tokenu App Check localhost NIE ZALOGUJE SIĘ żadną metodą (Google,
// gość, e-mail) — SDK zwraca auth/firebase-app-check-token-is-invalid. Build
// produkcyjny puszczony lokalnie (vite preview) dostaje 403, bo reCAPTCHA v3 nie
// akceptuje originów localhost. Zmiana edytora ani przeglądarki nic tu nie da.
//
// Dlatego w DEV idzie debug token zamiast reCAPTCHA. Jednorazowa konfiguracja:
//   1. `npm run dev`, otwórz konsolę przeglądarki — Firebase wypisze
//      "App Check debug token: <uuid>"
//   2. wklej ten uuid w Firebase Console → App Check → Apps → Manage debug tokens
//   3. zapisz go w `.env.local` jako VITE_APPCHECK_DEBUG_TOKEN=<uuid>, żeby przetrwał
//      wyczyszczenie danych przeglądarki i działał w innej przeglądarce
// Bez kroku 3 SDK generuje nowy token na każdym czystym profilu przeglądarki
// i trzeba go rejestrować od nowa.
//
// Produkcji to nie dotyczy: tam `import.meta.env.DEV` jest false, więc blok debug
// tokenu znika przy tree-shakingu i zostaje sama reCAPTCHA v3.
if (import.meta.env.DEV) {
  // `true` = każ SDK wygenerować token i wypisać go w konsoli.
  self.FIREBASE_APPCHECK_DEBUG_TOKEN = import.meta.env.VITE_APPCHECK_DEBUG_TOKEN || true;
}

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

