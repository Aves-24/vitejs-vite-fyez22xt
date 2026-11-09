import { test, expect, type Page } from '@playwright/test';
import { resetEmulators, registerUser, nav, shoot, watchErrors, expectNoErrors, adminListDocs, syncWrites } from './helpers';

// [JARDY 2026-11-09] Dystans w jardach (IFAA): dodanie „50 yd”, dobór tarczy
// z przeliczenia (45,72 m → IFAA Field 50 cm), zapis treningu z „50yd”.
test.beforeEach(async ({ request }) => resetEmulators(request));

const settingsTab = (page: Page, name: string) => page.getByRole('main').getByRole('button', { name, exact: true });
const save = (page: Page) => page.getByRole('button', { name: 'verified_user Speichern & Aktualisieren' });

test('dystans w jardach: 50 yd → IFAA Field 50 cm, zapis „50yd”', async ({ page, request }) => {
  test.setTimeout(150_000);
  const errors = watchErrors(page);
  const uid = await registerUser(page, 'Yard');
  const fields = async () => (await adminListDocs(request, 'users')).find(u => u.name.endsWith(uid))!.fields;

  await nav(page, 'Einst.').click();
  await settingsTab(page, 'AUSRÜSTUNG').click();
  await page.getByRole('radio', { name: 'IFAA', exact: true }).click();
  await save(page).click();
  await expect.poll(async () => JSON.stringify((await fields()).setups), { timeout: 15_000 }).toContain('"ifaa"');

  await page.goto('/');
  await nav(page, 'Einst.').click();
  await settingsTab(page, 'DISTANZEN').click();
  await page.getByRole('button', { name: /Eigene Distanz/ }).click();
  await page.getByPlaceholder('Meter').fill('50');
  await page.getByRole('radio', { name: 'yd', exact: true }).click();
  await expect(page.getByRole('radio', { name: 'yd', exact: true })).toHaveAttribute('aria-checked', 'true');
  await page.screenshot({ path: test.info().outputPath('add-yards.png') });
  await page.getByRole('button', { name: 'Hinzufügen', exact: true }).click();
  await expect(page.getByText('50yd', { exact: true })).toBeVisible();
  // Nowy dystans zestawu IFAA dostaje tarczę dobraną z metrów (45,72 m).
  await expect(page.getByRole('button', { name: 'Auflage wählen: IFAA Field 50cm' })).toBeVisible();
  await save(page).click();
  await expect.poll(async () => JSON.stringify((await fields()).userDistances), { timeout: 15_000 }).toContain('50yd');

  await page.goto('/');
  await page.getByRole('navigation').getByRole('button', { name: 'target' }).click();
  await page.getByRole('button', { name: '50yd', exact: true }).click();
  await expect(page.getByTestId('setup-card')).toContainText('IFAA Field 50cm');
  await page.getByRole('button', { name: 'Training', exact: true }).click();
  await shoot(page, ['5', '4', '4', '3']);
  await page.waitForTimeout(800);
  await page.getByRole('button', { name: 'Trainingseinheit speichern' }).click();
  await page.getByRole('button', { name: /^Als unvollständig markieren/ }).click();
  await expect(page.getByRole('button', { name: /^Zuletzt 16/ })).toBeVisible();
  await syncWrites(page);
  const s = (await adminListDocs(request, `users/${uid}/sessions`))[0].fields;
  expect(s.distance.stringValue).toBe('50yd');
  expect(s.targetType.stringValue).toBe('IFAA Field 50cm');
  await expectNoErrors(page, errors, 'jardy');
});
