import { test, expect } from '@playwright/test';
import { resetEmulators, registerUser, startAsGuest, nav, watchErrors, expectNoErrors, reloadAfterSync, adminPatchDoc, adminListDocs, testEmail, TEST_PASSWORD } from './helpers';

// Poprawki z przeglądu 2026-11-05 (decyzje usera po pierwszej rundzie testów).
test.beforeEach(async ({ request }) => resetEmulators(request));

test('3-Spot: klawiatura tylko X, 10–6 i M', async ({ page }) => {
  await startAsGuest(page);
  await page.getByRole('button', { name: 'Training', exact: true }).click();
  for (const v of ['X', '10', '9', '8', '7', '6', 'M']) {
    await expect(page.getByRole('button', { name: v, exact: true })).toBeVisible();
  }
  for (const v of ['5', '4', '3', '2', '1']) {
    await expect(page.getByRole('button', { name: v, exact: true })).toHaveCount(0);
  }
});

test('gość: PRO tylko na czas życia konta, po założeniu konta trial 40 dni', async ({ page }) => {
  const errors = watchErrors(page);
  await startAsGuest(page);
  await page.getByRole('button', { name: 'arrow_back' }).click();
  await expect(page.getByRole('button', { name: /^hourglass_top PRO · noch 1 Tag$/ })).toBeVisible();

  await page.getByRole('button', { name: /Gastmodus .* Konto erstellen/ }).click();
  await page.getByPlaceholder('e-mail').fill(testEmail('gastpro'));
  await page.getByPlaceholder('••••••••').fill(TEST_PASSWORD);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'person_add Konto erstellen' }).click();
  await expect(page.getByRole('button', { name: /Gastmodus/ })).toHaveCount(0);
  await reloadAfterSync(page);
  await expect(page.getByRole('button', { name: /^hourglass_top PRO · noch 40 Tage$/ })).toBeVisible();
  await expectNoErrors(page, errors, 'gość PRO');
});

test('zmiana klasy wiekowej w ciągu roku: okienko i nowe dystanse', async ({ page, request }) => {
  const errors = watchErrors(page);
  const uid = await registerUser(page, 'Jugend');
  // Data urodzenia → klasa zapamiętana po cichu (bez „Frohes neues Jahr”).
  await nav(page, 'Einst.').click();
  const y = new Date().getFullYear() - 13;
  await page.getByRole('spinbutton', { name: 'DD' }).fill('1');
  await page.getByRole('spinbutton', { name: 'MM' }).fill('2');
  await page.getByRole('spinbutton', { name: 'YYYY' }).fill(String(y));
  await page.getByRole('button', { name: 'verified_user Speichern & Aktualisieren' }).click();
  // Zapis Ustawień rusza po odczycie profilu — czekamy, aż data urodzenia jest w bazie.
  await expect.poll(async () => JSON.stringify(await adminListDocs(request, `users/${uid}/private`)), { timeout: 15_000 })
    .toContain(String(y));
  await reloadAfterSync(page);
  await expect(page.getByRole('heading', { level: 1, name: 'GROT-X' })).toBeVisible();
  // 13 lat → bramka zgody rodzica (< 16, RODO art. 8).
  await expect(page.getByRole('heading', { name: 'Einwilligung der Eltern erforderlich' })).toBeVisible();
  await page.getByPlaceholder('E-Mail der Aufsichtsperson').fill('eltern@example.test');
  await page.getByRole('checkbox', { name: /Als Elternteil/ }).check();
  await page.getByRole('button', { name: /Einwilligung bestätigen/ }).click();
  await expect(page.getByRole('heading', { name: 'Einwilligung der Eltern erforderlich' })).toHaveCount(0);
  await page.waitForTimeout(1500);
  await expect(page.getByText(/Frohes neues Jahr|Neue Altersklasse/)).toHaveCount(0);

  // Zapisana klasa różni się od wyliczonej (np. poprawiona data urodzenia).
  await adminPatchDoc(request, `users/${uid}`, { ageCategory: 'Herren' });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Neue Altersklasse, Jugend!' })).toBeVisible();
  await page.getByRole('button', { name: /Danke/i }).click();
  await reloadAfterSync(page);
  await page.waitForTimeout(1500);
  await expect(page.getByText(/Neue Altersklasse/)).toHaveCount(0);
  await expectNoErrors(page, errors, 'klasa wiekowa');
});
