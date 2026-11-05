import { test, expect, type Page } from '@playwright/test';
import { resetEmulators, startAsGuest } from './helpers';

// Wpisywanie strzał na tarczy 3-Spot (widok „Auflage”).
// Współrzędne CSS dla widoku Pixel 7 (playwright.config) — tarcza ma stały
// układ: dwie kolumny po trzy spoty, środki niżej.
test.beforeEach(async ({ request }) => resetEmulators(request));

const LEFT_X = 96, RIGHT_X = 227;
const ROW_Y = [154, 272, 388];
const RING_PX = 35; // od środka spotu do czerwonego pola (7)

async function openTarget(page: Page) {
  await startAsGuest(page);
  await page.getByRole('button', { name: 'Training', exact: true }).click();
  await page.getByText('Auflage', { exact: true }).click();
  await expect(page.getByRole('button', { name: 'Fadenkreuz-Abstand' })).toBeVisible();
}

test('mysz: trafienie tam, gdzie klik (bez odsunięcia celownika), obie kolumny 3-Spotu', async ({ page }) => {
  await openTarget(page);
  const main = page.getByRole('main');
  // Lewa kolumna: X, 7 (czerwone), X.
  await page.mouse.click(LEFT_X, ROW_Y[0]);
  await page.mouse.click(LEFT_X + RING_PX, ROW_Y[1]);
  await page.mouse.click(LEFT_X, ROW_Y[2]);
  await expect(main).toContainText(/P1\s*X\s*7\s*X/);
  // Prawa kolumna (aktywna po trzech strzałach): trzy X.
  for (const y of ROW_Y) await page.mouse.click(RIGHT_X, y);
  await expect(main).toContainText(/Gesamtringzahl\s*57/);
});

test('dotyk: celownik nad palcem (odsunięcie), więc stuknięcie pod środkiem trafia X', async ({ page }) => {
  await openTarget(page);
  // Domyślne odsunięcie 55 px: palec 55 px pod środkiem spotu.
  await page.touchscreen.tap(LEFT_X, ROW_Y[0] + 55);
  await expect(page.getByRole('main')).toContainText(/P1\s*X/);
});
