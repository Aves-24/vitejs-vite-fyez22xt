import React from 'react';
import { createRoot } from 'react-dom/client';
import './tailwind.css';
import App from './App';
import './i18n'; // <--- DODANE: Aktywacja systemu tłumaczeń i autodetekcji języka
import { initTheme } from './utils/theme';

// [C20] Dark mode — aplikuje zapisany motyw + nasłuch zmian systemowych.
// Anty-flash robi public/theme-init.js (przed pierwszym renderem).
initTheme();

// [C11] Service worker — offline na strzelnicy. Generowany w buildzie przez
// scripts/generate-sw.mjs (nie istnieje w dev, stąd guard na PROD).
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.warn('SW: rejestracja nieudana', err);
    });
  });
}

// ── DEV ONLY: suppress Vite HMR WebSocket noise ─────────────────────────────
// Co ~30s Vite próbuje wysłać ping przez WebSocket w momencie gdy połączenie
// jest jeszcze w stanie CLOSING — to nieszkodliwy szum, ale zaśmieca Console.
// Filtrujemy TYLKO tę konkretną wiadomość, reszta błędów przechodzi normalnie.
if (import.meta.env.DEV) {
  const _origError = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    if (
      typeof args[0] === 'string' &&
      args[0].includes('WebSocket is already in CLOSING or CLOSED state')
    ) return;
    _origError(...args);
  };

  const _origWarn = console.warn.bind(console);
  console.warn = (...args: unknown[]) => {
    if (
      typeof args[0] === 'string' &&
      args[0].includes('WebSocket is already in CLOSING or CLOSED state')
    ) return;
    _origWarn(...args);
  };
}
// ─────────────────────────────────────────────────────────────────────────────

// React 18: createRoot zamiast ReactDOM.render (concurrent features).
// StrictMode w dev montuje komponenty 2x — efekty z subskrypcjami (onSnapshot)
// muszą mieć poprawne cleanupy (mają — patrz App.tsx).
createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);