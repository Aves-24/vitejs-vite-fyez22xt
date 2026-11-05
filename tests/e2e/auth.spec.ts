import { test, expect } from '@playwright/test';
import { resetEmulators, finishWelcome, testEmail, TEST_PASSWORD, nav, adminListDocs } from './helpers';

// Rejestracja e-mailem (ze zgodą RODO), wylogowanie, błędne hasło, ponowne logowanie.
test.beforeEach(async ({ request }) => resetEmulators(request));

test('rejestracja, wylogowanie i ponowne logowanie e-mailem', async ({ page, request }) => {
  const email = testEmail('reg');
  await page.goto('/');

  // Rejestracja: przycisk zablokowany, dopóki nie ma zgody na AGB + Datenschutz.
  await page.getByRole('button', { name: 'Konto erstellen', exact: true }).click();
  await page.getByPlaceholder('e-mail').fill(email);
  await page.getByPlaceholder('••••••••').fill(TEST_PASSWORD);
  const submit = page.getByRole('button', { name: /person_add Konto erstellen/ });
  await expect(submit).toBeDisabled();
  await page.getByRole('checkbox').check();
  await submit.click();

  // Pierwsze logowanie → ekran powitalny z imieniem.
  await finishWelcome(page, 'Rejestracja', 'home');
  await expect(page.getByRole('heading', { name: 'GROT-X', level: 1 })).toBeVisible();

  // [RODO] Zgoda zapisana w profilu (rozliczalność, art. 7 ust. 1).
  await expect.poll(async () => {
    const users = await adminListDocs(request, 'users');
    return users.some(u => u.fields?.privacyConsent?.mapValue?.fields?.version);
  }).toBe(true);

  // Wylogowanie z Ustawień.
  await nav(page, 'Einst.').click();
  await page.getByRole('button', { name: 'logout Vom Profil abmelden' }).click();
  await expect(page.getByRole('heading', { name: 'Vom Profil abmelden', level: 2 })).toBeVisible();
  await page.getByRole('button', { name: 'Vom Profil abmelden', exact: true }).click();
  await expect(page.getByRole('button', { name: /ohne konto ausprobieren/i })).toBeVisible();

  // Błędne hasło → konkretny komunikat, bez wejścia do apki.
  await page.getByPlaceholder('e-mail').fill(email);
  await page.getByPlaceholder('••••••••').fill('falsch-123');
  await page.getByRole('button', { name: /login Anmelden/ }).click();
  await expect(page.getByText('Ungültige E-Mail oder falsches Passwort.')).toBeVisible();

  // Poprawne hasło → prosto na Home, bez ponownego ekranu powitalnego.
  await page.getByPlaceholder('••••••••').fill(TEST_PASSWORD);
  await page.getByRole('button', { name: /login Anmelden/ }).click();
  await expect(page.getByRole('heading', { name: 'GROT-X', level: 1 })).toBeVisible();
  await expect(page.getByPlaceholder('Dein Name oder Spitzname')).toHaveCount(0);
});
