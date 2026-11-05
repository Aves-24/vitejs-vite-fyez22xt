import { test, expect, type Page } from '@playwright/test';
import { resetEmulators, registerUser, startAsGuest, shoot, nav, watchErrors, expectNoErrors, testEmail, TEST_PASSWORD, adminListDocs } from './helpers';

// Ustawienia z zapisem: profil, zestaw sprzętowy, język, eksport RODO,
// usunięcie konta i przejście z gościa na konto bez utraty danych.
test.beforeEach(async ({ request }) => resetEmulators(request));

const settingsTab = (page: Page, name: string) => page.getByRole('main').getByRole('button', { name, exact: true });
const saveSettings = (page: Page) => page.getByRole('button', { name: 'verified_user Speichern & Aktualisieren' });

test('profil: dane osobowe zostają po przeładowaniu', async ({ page }) => {
  const errors = watchErrors(page);
  await registerUser(page, 'Profil');
  await nav(page, 'Einst.').click();
  await page.getByRole('textbox', { name: 'Nachname' }).fill('Testowa');
  await page.getByRole('spinbutton', { name: 'DD' }).fill('14');
  await page.getByRole('spinbutton', { name: 'MM' }).fill('3');
  await page.getByRole('spinbutton', { name: 'YYYY' }).fill('1990');
  await page.getByRole('spinbutton', { name: 'z.B. 180' }).fill('172');
  await page.getByRole('button', { name: 'Linkshänder (LH)' }).click();
  await saveSettings(page).click();
  await page.waitForTimeout(1500);

  await page.reload();
  // Pierwsza data urodzenia NIE wywołuje noworocznego okienka (było: w listopadzie).
  await expect(page.getByRole('heading', { level: 1, name: 'GROT-X' })).toBeVisible();
  await page.waitForTimeout(1500);
  await expect(page.getByText(/Frohes neues Jahr/)).toHaveCount(0);
  await nav(page, 'Einst.').click();
  await expect(page.getByRole('textbox', { name: 'Nachname' })).toHaveValue('Testowa');
  await expect(page.getByRole('spinbutton', { name: 'YYYY' })).toHaveValue('1990');
  await expect(page.getByRole('spinbutton', { name: 'z.B. 180' })).toHaveValue('172');
  await expectNoErrors(page, errors, 'profil');
});

test('sprzęt: nazwa i dyscyplina zestawu zostają i widać je przy starcie treningu', async ({ page }) => {
  const errors = watchErrors(page);
  await registerUser(page, 'Sprzet');
  await nav(page, 'Einst.').click();
  await settingsTab(page, 'AUSRÜSTUNG').click();
  const name = page.getByRole('main').getByRole('textbox').first();
  await name.fill('Halle 2026');
  await page.getByRole('button', { name: 'Compound', exact: true }).click();
  await page.getByRole('spinbutton', { name: 'z.B. 28.5' }).fill('29');
  await saveSettings(page).click();
  await page.waitForTimeout(1500);

  await page.reload();
  await nav(page, 'Einst.').click();
  await settingsTab(page, 'AUSRÜSTUNG').click();
  await expect(page.getByRole('button', { name: 'Halle 2026', exact: true })).toBeVisible();
  await expect(page.getByRole('spinbutton', { name: 'z.B. 28.5' })).toHaveValue('29');

  await page.goto('/');
  await page.getByRole('navigation').getByRole('button', { name: 'target' }).click();
  await expect(page.getByText(/Halle 2026/).first()).toBeVisible();
  await expectNoErrors(page, errors, 'sprzęt');
});

test('język: przełączenie na English zostaje po przeładowaniu', async ({ page }) => {
  const errors = watchErrors(page);
  await registerUser(page, 'Sprache');
  await nav(page, 'Einst.').click();
  await settingsTab(page, 'SPRACHE').click();
  await page.getByRole('button', { name: 'English', exact: true }).click();
  await page.waitForTimeout(800);
  await page.reload();
  await expect(page.getByRole('navigation').getByRole('button', { name: /Settings|Sett\./ })).toBeVisible();
  await expect(page.getByRole('navigation').getByRole('button', { name: /Einst\./ })).toHaveCount(0);
  await expectNoErrors(page, errors, 'język');
});

test('RODO: eksport danych pobiera plik JSON', async ({ page }) => {
  const errors = watchErrors(page);
  await registerUser(page, 'Export');
  await nav(page, 'Einst.').click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'download Meine Daten exportieren (JSON)' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/\.json$/);
  const body = JSON.parse(await (await file.createReadStream()).toArray().then(c => Buffer.concat(c).toString('utf8')));
  expect(JSON.stringify(body)).toContain('Export');
  await expectNoErrors(page, errors, 'eksport');
});

test('gość zakłada konto i zachowuje trening', async ({ page, request }) => {
  const errors = watchErrors(page);
  await startAsGuest(page, 'Gast');
  await page.getByRole('button', { name: 'Training', exact: true }).click();
  await shoot(page, ['X', '10', '9', '9', '8', '7']);
  await page.getByRole('button', { name: 'Trainingseinheit speichern' }).click();
  await page.getByRole('button', { name: /^Als unvollständig markieren/ }).click();
  await expect(page.getByRole('button', { name: /^Zuletzt 53/ })).toBeVisible();

  const email = testEmail('upgrade');
  await page.getByRole('button', { name: /Gastmodus .* Konto erstellen/ }).click();
  await expect(page.getByRole('heading', { name: 'Behalte deine Daten' })).toBeVisible();
  await page.getByPlaceholder('e-mail').fill(email);
  await page.getByPlaceholder('••••••••').fill(TEST_PASSWORD);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'person_add Konto erstellen' }).click();
  await expect(page.getByRole('button', { name: /Gastmodus/ })).toHaveCount(0);

  // Wylogowanie i logowanie e-mailem: trening dalej jest.
  await nav(page, 'Einst.').click();
  await page.getByRole('button', { name: 'logout Vom Profil abmelden' }).click();
  await page.getByRole('button', { name: 'Vom Profil abmelden', exact: true }).click();
  await page.getByPlaceholder('e-mail').fill(email);
  await page.getByPlaceholder('••••••••').fill(TEST_PASSWORD);
  await page.getByRole('button', { name: /login Anmelden/ }).click();
  await expect(page.getByRole('button', { name: /^Zuletzt 53/ })).toBeVisible();
  // Zgoda RODO zapisana przy przejściu z gościa.
  const users = await adminListDocs(request, 'users');
  expect(users.some(u => u.fields?.privacyConsent)).toBe(true);
  await expectNoErrors(page, errors, 'gość → konto');
});

test('usunięcie konta kasuje profil i wylogowuje', async ({ page, request }) => {
  const errors = watchErrors(page);
  await registerUser(page, 'Loeschen');
  await nav(page, 'Einst.').click();
  await page.getByRole('button', { name: 'delete_forever Konto löschen' }).click();
  const confirm = page.getByRole('button', { name: 'Konto endgültig löschen' });
  await expect(confirm).toBeDisabled();
  await page.getByPlaceholder('LÖSCHEN').fill('LÖSCHEN');
  await page.getByPlaceholder('••••••••').fill(TEST_PASSWORD);
  await confirm.click();

  await expect(page.getByRole('button', { name: /ohne konto ausprobieren/i })).toBeVisible();
  await expect.poll(async () => (await adminListDocs(request, 'users')).length).toBe(0);
  await expectNoErrors(page, errors, 'usunięcie konta');
});
