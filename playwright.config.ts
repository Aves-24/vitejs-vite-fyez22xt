import { defineConfig, devices } from '@playwright/test';

// [E2E] Testy całych ścieżek w prawdziwej przeglądarce (tests/e2e/).
// Aplikacja startuje w trybie `--mode e2e` i gada WYŁĄCZNIE z lokalnymi
// emulatorami Firebase (Auth 9099 + Firestore 8080, projekt demo-grotx) —
// zero kontaktu z produkcją, bez App Check, reguły Firestore działają naprawdę.
//
// Uruchamianie: `npm run test:e2e` (emulatory wstają i gasną same).
// Podgląd krok po kroku: `npm run test:e2e:ui`.
const PORT = 5174;

export default defineConfig({
  testDir: 'tests/e2e',
  // Emulator jest wspólny — testy po kolei, żeby nie mieszały sobie danych.
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    // Apka jest głównie na telefon — testujemy w widoku telefonu.
    ...devices['Pixel 7'],
    locale: 'de-DE',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'mobile-chrome' }],
  webServer: {
    command: `npx vite --mode e2e --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
