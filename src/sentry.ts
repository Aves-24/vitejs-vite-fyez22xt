import * as Sentry from '@sentry/react';

// Raporty błędów z telefonów użytkowników (projekt aves-24/grot-x, region UE).
// DSN nie jest sekretem — jak klucz Firebase, trafia do przeglądarki tak czy siak.
// Celowo oszczędnie (RODO, opisane w Datenschutzerklärung):
//   - tylko produkcja; localhost i `vite preview` nic nie wysyłają,
//   - bez IP, ciasteczek i nagłówków (sendDefaultPii: false),
//   - bez Replay i bez śledzenia wydajności — same wyjątki.
const DSN = 'https://3cfdb5cb4c80797989efaf8129fc37d4@o4512366660550657.ingest.de.sentry.io/4512366668873808';

export function initSentry() {
  if (!import.meta.env.PROD) return;
  if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') return;
  Sentry.init({
    dsn: DSN,
    environment: location.hostname,
    // SDK v11: dataCollection zamiast sendDefaultPii; domyślnie zbiera dużo,
    // więc wszystko wyłączone jawnie. IP wycina dodatkowo ustawienie projektu
    // w Sentry (Security & Privacy → Prevent Storing of IP Addresses).
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
    },
    tracesSampleRate: 0,
    // Bez BrowserSession — nie liczymy sesji użytkowników, tylko błędy.
    integrations: (defaults) => defaults.filter((i) => i.name !== 'BrowserSession'),
  });
}
