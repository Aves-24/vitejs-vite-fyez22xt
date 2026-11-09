import { test, expect, type Page } from '@playwright/test';
import { resetEmulators, registerUser, nav, shoot, watchErrors, expectNoErrors, adminListDocs, syncWrites } from './helpers';

// [PARCOURS 2026-11-09] Runda terenowa IFAA: każda tarcza (seria) z własną
// wielkością tarczy i dystansem. Zapis per seria, handicap z całej rundy,
// statystyki bez Trefferbild (różne tarcze), dystans sesji „Parcours”.
test.beforeEach(async ({ request }) => resetEmulators(request));

const settingsTab = (page: Page, name: string) => page.getByRole('main').getByRole('button', { name, exact: true });

test('Parcours: tarcza 1 = 50 cm / 50 yd, tarcza 2 = 35 cm / 25 yd, zapis per seria, handicap rundy', async ({ page, request }) => {
  test.setTimeout(180_000);
  const errors = watchErrors(page);
  const uid = await registerUser(page, 'Parcours');
  await nav(page, 'Einst.').click();
  await settingsTab(page, 'AUSRÜSTUNG').click();
  await page.getByRole('radio', { name: 'IFAA', exact: true }).click();
  await page.getByRole('button', { name: 'verified_user Speichern & Aktualisieren' }).click();
  await expect.poll(async () => JSON.stringify((await adminListDocs(request, 'users')).find(u => u.name.endsWith(uid))?.fields?.setups ?? {}), { timeout: 15_000 }).toContain('"ifaa"');

  // Vorbereitung: przełącznik Parcours.
  await page.goto('/');
  await page.getByRole('navigation').getByRole('button', { name: 'target' }).click();
  await page.getByTestId('parcours-toggle').check();
  await expect(page.getByText(/Jede Scheibe mit eigener Auflage und Distanz/)).toBeVisible();
  await page.getByRole('button', { name: 'Training', exact: true }).click();

  // Tarcza 1: 50 cm, 50 yd.
  const bar = page.getByTestId('parcours-bar');
  await expect(bar).toContainText('Scheibe 1/28');
  await bar.getByRole('radio', { name: 'IFAA Field 50cm', exact: true }).click();
  await bar.getByRole('radio', { name: 'yd', exact: true }).click();
  await bar.getByRole('spinbutton', { name: 'Distanz' }).fill('50');
  await page.screenshot({ path: test.info().outputPath('parcours-bar.png') });
  await shoot(page, ['5', '5', '4', '4']); // 18
  await page.waitForTimeout(800);

  // Tarcza 2: 35 cm, 25 yd.
  await expect(bar).toContainText('Scheibe 2/28');
  await bar.getByRole('radio', { name: 'IFAA Field 35cm', exact: true }).click();
  await bar.getByRole('spinbutton', { name: 'Distanz' }).fill('25');
  await shoot(page, ['5', '4']);
  // W trakcie serii tarczy i dystansu nie da się zmienić.
  await expect(bar.getByRole('radio', { name: 'IFAA Field 50cm', exact: true })).toBeDisabled();
  await shoot(page, ['4', '3']); // 16
  await page.waitForTimeout(800);
  await expect(page.getByRole('main')).toContainText(/Gesamtringzahl\s*34/);

  await page.getByRole('button', { name: 'Trainingseinheit speichern' }).click();
  await page.getByRole('button', { name: /^Als unvollständig markieren/ }).click();
  await expect(page.getByRole('button', { name: /^Zuletzt 34/ })).toBeVisible();
  await syncWrites(page);

  const s = (await adminListDocs(request, `users/${uid}/sessions`))[0].fields;
  expect(s.distance.stringValue).toBe('Parcours');
  expect(s.parcours.booleanValue).toBe(true);
  expect(s.targetType.stringValue).toBe('IFAA Field 50cm');
  const ends = s.ends.arrayValue.values.map((v: any) => v.mapValue.fields);
  expect(ends.map((e: any) => [e.distance.stringValue, e.targetType.stringValue])).toEqual([
    ['50yd', 'IFAA Field 50cm'],
    ['25yd', 'IFAA Field 35cm'],
  ]);

  // Statystyki dnia: bez Trefferbild, bez błędów; dystans „Parcours”.
  await nav(page, 'Stats').click();
  await page.getByRole('main').getByRole('button', { name: 'Täglich', exact: true }).click();
  await page.waitForTimeout(1500);
  await expect(page.getByRole('main')).toContainText('Parcours');
  await expect(page.getByText('Trefferbild', { exact: false })).toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath('parcours-stats.png'), fullPage: true });
  await expectNoErrors(page, errors, 'Parcours');
});
