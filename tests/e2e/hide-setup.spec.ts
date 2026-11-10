import { test, expect, type Page } from '@playwright/test';
import { resetEmulators, registerUser, nav, watchErrors, expectNoErrors, adminListDocs } from './helpers';

// [UKRYJ ZESTAW 2026-11-10] Przekreślone oko przy zestawie w Einstellungen:
// ukryty zestaw znika z Home (menu świata) i z wyboru w Vorbereitung, ale jest
// zapisany (sprzęt, nazwa) i da się go przywrócić. Ukryty nigdy nie jest aktywny;
// ostatniego widocznego ukryć nie można.
test.beforeEach(async ({ request }) => resetEmulators(request));

const openMenu = (page: Page) => page.getByRole('button', { name: /^(Menü|Menu)$/ }).click();
const userFields = async (request: any, uid: string) => (await adminListDocs(request, 'users')).find(u => u.name.endsWith(uid))!.fields;
const save = (page: Page) => page.getByRole('button', { name: 'verified_user Speichern & Aktualisieren' }).click();

test('Zestaw ukryty: znika z Vorbereitung i menu Home, zostaje zapisany, da się przywrócić', async ({ page, request }) => {
  test.setTimeout(180_000);
  const errors = watchErrors(page);
  const uid = await registerUser(page, 'Hide');

  // Drugi zestaw „Gelände” na Feld (PRO przez konto testowe z dwoma zestawami).
  await nav(page, 'Einst.').click();
  await page.getByRole('main').getByRole('button', { name: 'AUSRÜSTUNG', exact: true }).click();
  // Jedyny widoczny zestaw — przycisku „ukryj” nie ma.
  await expect(page.getByTestId('hide-setup')).toHaveCount(0);
  await page.getByRole('button', { name: '+ Hinzufügen' }).click();
  await page.getByRole('main').getByRole('textbox').first().fill('Gelände');
  await page.getByRole('radio', { name: 'Feld (WA)' }).click();
  await save(page);
  await expect.poll(async () => JSON.stringify((await userFields(request, uid)).setups), { timeout: 15_000 }).toContain('Gelände');

  // Dwa widoczne → Home ma przełącznik świata (WA / Feld).
  await page.goto('/');
  await openMenu(page);
  await expect(page.getByRole('menu').getByRole('radio', { name: 'Feld', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');

  // Ukrycie aktywnego („Gelände”): przełącza na pierwszy widoczny, zapisuje hidden.
  await nav(page, 'Einst.').click();
  await page.getByRole('main').getByRole('button', { name: 'AUSRÜSTUNG', exact: true }).click();
  await expect(page.getByTestId('hide-setup')).toBeVisible();
  await page.getByTestId('hide-setup').click();
  await expect(page.getByTestId('hidden-setups')).toContainText('Gelände');
  // Został jeden widoczny → ukryć już nie można.
  await expect(page.getByTestId('hide-setup')).toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath('hidden-row.png') });
  await save(page);
  await expect.poll(async () => JSON.stringify((await userFields(request, uid)).setups), { timeout: 15_000 }).toContain('"hidden"');
  const f = await userFields(request, uid);
  expect(f.activeSetupId?.stringValue).toBe('default');
  expect(JSON.stringify(f.setups)).toContain('Gelände'); // zapisany

  // Home: jeden widoczny zestaw → brak przełącznika świata.
  await page.goto('/');
  await openMenu(page);
  await expect(page.getByRole('menu').getByRole('radio')).toHaveCount(0);
  await page.keyboard.press('Escape');

  // Vorbereitung: tylko widoczny zestaw w wyborze.
  await page.getByRole('navigation').getByRole('button', { name: 'target' }).click();
  const card = page.getByTestId('setup-card');
  await expect(card).toContainText('Mein Set');
  await expect(card).not.toContainText('Gelände');

  // Przywrócenie z wiersza „Ausgeblendet” (Vorbereitung nie ma dolnego menu).
  await page.goto('/');
  await nav(page, 'Einst.').click();
  await page.getByRole('main').getByRole('button', { name: 'AUSRÜSTUNG', exact: true }).click();
  await page.getByRole('button', { name: 'Gelände wieder einblenden' }).click();
  await expect(page.getByTestId('hidden-setups')).toHaveCount(0);
  await save(page);
  await expect.poll(async () => JSON.stringify((await userFields(request, uid)).setups), { timeout: 15_000 }).not.toContain('"hidden"');
  await page.goto('/');
  await page.getByRole('navigation').getByRole('button', { name: 'target' }).click();
  await expect(page.getByTestId('setup-card')).toContainText('Gelände');
  await expectNoErrors(page, errors, 'ukryj zestaw');
});
