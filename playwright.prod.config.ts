import { defineConfig, devices } from '@playwright/test';

// [E2E PROD] Testy na zbudowanej aplikacji z service workerem (tests/e2e-prod/).
// Build w trybie e2e (emulatory, bez App Check) do dist-e2e/ + sw.js, serwowany
// przez `vite preview` — tak jak na telefonie, łącznie z cache'em offline.
// Uruchamianie: `npm run test:e2e:prod` (emulatory wstają i gasną same).
const PORT = 5175;

export default defineConfig({
  testDir: 'tests/e2e-prod',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    ...devices['Pixel 7'],
    locale: 'de-DE',
    serviceWorkers: 'allow',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'mobile-chrome-prod' }],
  webServer: {
    command: `npx vite build --mode e2e --outDir dist-e2e --emptyOutDir && node -e "process.env.SW_DIST='dist-e2e';import('./scripts/generate-sw.mjs')" && npx vite preview --mode e2e --outDir dist-e2e --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 240_000,
  },
});
