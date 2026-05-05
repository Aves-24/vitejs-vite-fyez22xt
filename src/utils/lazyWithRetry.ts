import React from 'react';

/**
 * lazyWithRetry — opakowanie React.lazy z automatycznym recovery przy nieudanym
 * pobraniu chunka.
 *
 * PROBLEM: Po deploy nowe pliki JS dostają nowe hashe w nazwie. Tab otwarty
 * przed deployem ma w pamięci referencje do starych chunków, których serwer
 * już nie ma. Wynik: 404 przy nawigacji → biały ekran (Suspense nie obsługuje
 * błędów importu, lecą wyżej; bez ErrorBoundary cała appka crashuje).
 *
 * ROZWIĄZANIE: Przy pierwszym błędzie importu robimy hard reload — appka
 * uruchamia się od nowa z aktualnymi hashami i nawigacja działa. Flaga w
 * sessionStorage zabezpiecza przed pętlą reloadów (jeśli reload nie pomoże,
 * błąd propaguje do ErrorBoundary).
 */

const RETRY_FLAG = 'grotX_chunkRetry';

export function lazyWithRetry<T extends React.ComponentType<any>>(
  componentImport: () => Promise<{ default: T }>
): React.LazyExoticComponent<T> {
  return React.lazy(async () => {
    try {
      const mod = await componentImport();
      // Sukces — wyczyść flagę, by przy następnym deploy znów mieć możliwość 1x reload.
      try { window.sessionStorage.removeItem(RETRY_FLAG); } catch { /* ignore */ }
      return mod;
    } catch (error) {
      const alreadyRetried = (() => {
        try { return window.sessionStorage.getItem(RETRY_FLAG) === '1'; } catch { return false; }
      })();

      if (!alreadyRetried) {
        try { window.sessionStorage.setItem(RETRY_FLAG, '1'); } catch { /* ignore */ }
        // Hard reload — nigdy nie resolvujemy promise, appka się przeładuje
        window.location.reload();
        return new Promise<{ default: T }>(() => { /* never resolves */ });
      }

      // Reload nie pomógł — propagacja do ErrorBoundary
      throw error;
    }
  });
}
