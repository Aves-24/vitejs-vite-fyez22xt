/// <reference types="vite/client" />

declare global {
  // Injected przez vite.config.ts via `define` — data i godzina startu build/dev-server.
  const __BUILD_TIME__: string;

  interface ImportMetaEnv {
    // DEV-only: debug token App Check zarejestrowany w Firebase Console.
    // Patrz komentarz w src/firebase.ts. Trzymany w .env.local, nie w repo.
    readonly VITE_APPCHECK_DEBUG_TOKEN?: string;
    // '1' tylko w trybie `--mode e2e` (.env.e2e) — emulatory zamiast chmury.
    readonly VITE_USE_EMULATORS?: string;
  }

  interface Window {
    // Czytane przez Firebase App Check SDK przy inicjalizacji (tylko DEV).
    FIREBASE_APPCHECK_DEBUG_TOKEN?: string | boolean;
  }
}

export {};
