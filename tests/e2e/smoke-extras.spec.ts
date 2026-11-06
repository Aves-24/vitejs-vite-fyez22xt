import { test, expect } from '@playwright/test';
import { resetEmulators, registerUser, nav, watchErrors, expectNoErrors, adminVerifyEmail, homeMenu } from './helpers';

// Test dymny ekranów pobocznych: Schreiber-Training i Admin Center.
test.beforeEach(async ({ request }) => resetEmulators(request));

test('Schreiber-Training: gra startuje, klawiatura działa', async ({ page }) => {
  const errors = watchErrors(page);
  await registerUser(page, 'Schreib');
  // [HOME 2026-11-06] Wejście z żółtego menu na Home (z Einstellungen usunięte).
  await homeMenu(page, /Schreiber-Training/);
  await expect(page.getByRole('heading', { name: 'Schreiber-Training' })).toBeVisible();
  for (const shooters of ['4 ABCD', '1 A']) await page.getByRole('button', { name: shooters }).click();
  await page.getByRole('button', { name: 'Los geht’s' }).click();
  await expect(page.getByRole('img', { name: 'Scheibe mit Pfeilen' })).toBeVisible();
  await expect(page.getByText(/Passe 1\/3/)).toBeVisible();
  await page.getByRole('button', { name: 'M', exact: true }).click();
  await page.getByRole('button', { name: 'Löschen', exact: true }).last().click();
  await expectNoErrors(page, errors, 'Schreiber');
});

test('Admin Center: wszystkie zakładki bez błędów, widzi użytkowników', async ({ page, request }) => {
  const errors = watchErrors(page);
  // Konto admina istnieje TYLKO w lokalnym emulatorze.
  const uid = await registerUser(page, 'Admin', 'info@aves-24.de');
  await adminVerifyEmail(request, uid);
  await page.evaluate(() => (window as any).__fb.auth.currentUser.getIdToken(true));
  await page.reload();

  await nav(page, 'Einst.').click();
  await page.getByRole('button', { name: 'ADMIN', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Admin Center' })).toBeVisible();
  await expect(page.getByText('Wszyscy Użytkownicy').locator('..').getByText('1', { exact: true })).toBeVisible();
  for (const tab of ['Kluby', 'Komunikaty', 'SYSTEM', 'Userzy']) {
    await page.getByRole('button', { name: tab, exact: true }).click();
    await page.waitForTimeout(1000);
    await expectNoErrors(page, errors, `Admin/${tab}`);
  }
});
