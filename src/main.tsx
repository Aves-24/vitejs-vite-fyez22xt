import React from 'react';
import ReactDOM from 'react-dom';
import './tailwind.css';
import App from './App';
import './i18n'; // <--- DODANE: Aktywacja systemu tłumaczeń i autodetekcji języka

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

ReactDOM.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
  document.getElementById('root')
);