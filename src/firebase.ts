import { initializeApp } from 'firebase/app';
// Nowe importy dla najnowszego standardu Firebase
import { initializeFirestore, connectFirestoreEmulator, persistentLocalCache, persistentMultipleTabManager, persistentSingleTabManager, doc, getDoc, getDocs, collection, updateDoc, waitForPendingWrites } from 'firebase/firestore';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';

const firebaseConfig = {
  apiKey: 'AIzaSyCTBVxgdbTMDf4XIc0GQ7MCIuRRWgrcvLE',
  authDomain: 'grotx-fb8f8.firebaseapp.com',
  projectId: 'grotx-fb8f8',
  storageBucket: 'grotx-fb8f8.firebasestorage.app',
  messagingSenderId: '639521703891',
  appId: '1:639521703891:web:b8e9befdefd9b016591126',
};

// [E2E] `vite --mode e2e` (.env.e2e: VITE_USE_EMULATORS=1) = aplikacja gada wyłącznie
// z lokalnymi emulatorami Auth + Firestore (testy Playwright, tests/e2e/). Projekt
// `demo-grotx` — prefiks demo- gwarantuje, że SDK nie dotknie żadnego prawdziwego
// zasobu w chmurze. W buildzie produkcyjnym zmienna nie istnieje, więc cały ten
// tryb wylatuje przy tree-shakingu.
const USE_EMULATORS = import.meta.env.VITE_USE_EMULATORS === '1';

const app = initializeApp(USE_EMULATORS ? { ...firebaseConfig, projectId: 'demo-grotx' } : firebaseConfig);

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
if (import.meta.env.DEV && !USE_EMULATORS) {
  // `true` = każ SDK wygenerować token i wypisać go w konsoli.
  self.FIREBASE_APPCHECK_DEBUG_TOKEN = import.meta.env.VITE_APPCHECK_DEBUG_TOKEN || true;
}

// Emulatory nie sprawdzają App Check — w trybie e2e go nie inicjujemy (reCAPTCHA
// i tak nie działa na localhost, a debug tokenu nie ma w CI).
if (!USE_EMULATORS) initializeAppCheck(app, {
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

if (USE_EMULATORS) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
}

// --- DEV-ONLY: wystaw Firebase na window dla testów w DevTools Console ---
// W produkcji ten blok jest usuwany przez tree-shaking (import.meta.env.DEV = false).
if (import.meta.env.DEV) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).__fb = { db, auth, doc, getDoc, getDocs, collection, updateDoc, waitForPendingWrites };
  // eslint-disable-next-line no-console
  console.log('[DEV] Firebase expose na window.__fb');
}

