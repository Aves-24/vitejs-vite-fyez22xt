import { test, expect, type Page } from '@playwright/test';
import { resetEmulators, registerUser, nav, watchErrors, expectNoErrors, reloadAfterSync } from './helpers';

// Turniej halowy 18 m w formacie 2×30 (Passe po 3 strzały, wiersz = 2 Passen):
// pełna karta 60 strzał, sumy Durchgängen, zapis, statystyki i Rekorde.
test.beforeEach(async ({ request }) => resetEmulators(request));

const key = (page: Page, v: string) => page.getByRole('button', { name: v, exact: true }).last();

test('hala 2×30: pełna karta 60 strzał, sumy, zapis i Rekorde', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = watchErrors(page);
  await registerUser(page, 'Halle');
  await nav(page, 'Kalender').click();
  await page.getByRole('button', { name: 'Neuer Termin' }).click();
  const d = new Date();
  await page.getByPlaceholder('Name des Turniers').fill('Hallen-Kreismeisterschaft');
  await page.getByRole('button', { name: /Turnierdistanz 70m/ }).click();
  await page.getByRole('button', { name: '18m', exact: true }).last().click();
  await expect(page.getByRole('button', { name: /Turnierdistanz 18m/ })).toBeVisible();
  await page.getByRole('spinbutton', { name: 'DD' }).fill(String(d.getDate()));
  await page.getByRole('spinbutton', { name: 'MM' }).fill(String(d.getMonth() + 1));
  await page.getByRole('spinbutton', { name: 'YYYY' }).fill(String(d.getFullYear()));
  await page.getByRole('button', { name: 'Termin speichern' }).click();
  await page.getByRole('main').getByText('Hallen-Kreismeisterschaft').first().click();
  await page.getByRole('button', { name: 'edit_note Ringzahl eingeben' }).click();

  // 18 m → domyślnie 2×30 po 3 strzały.
  const fmt = page.getByRole('button', { name: /2×30/ });
  await expect(fmt).toBeVisible();
  await expect(page.getByText('3 pro Passe').first()).toBeVisible();

  // Durchgang 1: 30 × 9 = 270; Durchgang 2: 30 × 10 = 300.
  for (let i = 0; i < 30; i++) await key(page, '9').click();
  // Szybkie wpisywanie: żadna strzała nie ginie (wcześniej z 30 zostawało 24).
  await expect(page.getByText('D1: 270 / D2: 0')).toBeVisible();
  for (let i = 0; i < 30; i++) await key(page, '10').click();
  await expect(page.getByText('D1: 270 / D2: 300')).toBeVisible();
  await expect(page.getByText('570', { exact: true }).first()).toBeVisible();
  // Karta pełna — kolejne naciśnięcie nic nie dopisuje.
  if (await key(page, '9').isVisible().catch(() => false)) await key(page, '9').click();
  await expect(page.getByText('D1: 270 / D2: 300')).toBeVisible();
  await page.screenshot({ path: process.env.TEMP + '/dm/indoor.png', fullPage: true });
  await page.getByRole('button', { name: 'Wettkampfergebnis speichern' }).click();

  await expect(page.getByText(/Turnier\s*Hallen-Kreismeisterschaft/).first()).toBeVisible();
  await expect(page.getByText(/Ringzahl\s*570/).first()).toBeVisible();
  await expect(page.getByText('3-Spot', { exact: false }).first()).toBeVisible();

  await reloadAfterSync(page);
  await nav(page, 'Stats').click();
  await page.getByRole('main').getByRole('button', { name: 'Rekorde', exact: true }).click();
  await expect(page.getByRole('main')).toContainText('Hallen-Kreismeisterschaft');
  await expect(page.getByRole('main')).toContainText('570');
  await expectNoErrors(page, errors, 'hala 2×30');
});
