import { test, expect, type Page } from '@playwright/test';
import { resetEmulators, registerUser, nav, watchErrors, expectNoErrors, reloadAfterSync } from './helpers';

// Zawody: termin na dziś → wynik (karta wyników) → statystyki, Tagebuch, Rekorde.
test.beforeEach(async ({ request }) => resetEmulators(request));

// W oknie wyniku pod spodem zostają przyciski dni kalendarza (1–30) — klawisze
// karty wyników to ostatnie pasujące przyciski.
const key = (page: Page, v: string) => page.getByRole('button', { name: v, exact: true }).last();

test('wynik zawodów: zapis, statystyki, Tagebuch i Rekorde', async ({ page }) => {
  const errors = watchErrors(page);
  await registerUser(page, 'Turnier');
  await nav(page, 'Kalender').click();
  await page.getByRole('button', { name: 'Neuer Termin' }).click();
  const d = new Date();
  await page.getByPlaceholder('Name des Turniers').fill('Kreismeisterschaft');
  await page.getByRole('spinbutton', { name: 'DD' }).fill(String(d.getDate()));
  await page.getByRole('spinbutton', { name: 'MM' }).fill(String(d.getMonth() + 1));
  await page.getByRole('spinbutton', { name: 'YYYY' }).fill(String(d.getFullYear()));
  await page.getByRole('button', { name: 'Termin speichern' }).click();

  // Niemiecki format dat i dni tygodnia (wcześniej „Thu 5”, „05/11/2026”).
  await expect(page.getByRole('main').getByText(/^Do|^Mo|^Di|^Mi|^Fr|^Sa|^So/).first()).toBeVisible();
  await page.getByRole('main').getByText('Kreismeisterschaft').first().click();
  await expect(page.getByText(new RegExp(`${d.getDate()}\\.${d.getMonth() + 1}\\.${d.getFullYear()}`)).first()).toBeVisible();

  await page.getByRole('button', { name: 'edit_note Ringzahl eingeben' }).click();
  for (const v of ['X', '10', '9', '9', '8', '7']) await key(page, v).click();
  await page.getByRole('button', { name: 'Wettkampfergebnis speichern' }).click();

  // Po zapisie: karta zawodów w statystykach.
  await expect(page.getByText(/Turnier\s*Kreismeisterschaft/).first()).toBeVisible();
  await expect(page.getByText('Ringzahl 53').or(page.getByText(/Ringzahl\s*53/)).first()).toBeVisible();
  // Tarcza po nazwie z katalogu (było: surowy alias „Full”).
  await expect(page.getByText('122cm', { exact: true }).first()).toBeVisible();

  await reloadAfterSync(page);
  await nav(page, 'Tagebuch').click();
  await expect(page.getByRole('main')).toContainText('Kreismeisterschaft');
  await nav(page, 'Stats').click();
  await page.getByRole('main').getByRole('button', { name: 'Rekorde', exact: true }).click();
  await expect(page.getByRole('main')).toContainText('Kreismeisterschaft');
  await expect(page.getByRole('main')).toContainText('53');
  await expectNoErrors(page, errors, 'zawody');
});
