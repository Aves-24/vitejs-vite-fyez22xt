import { test, expect } from '@playwright/test';
import { resetEmulators, registerUser, nav, shoot, watchErrors, expectNoErrors, adminListDocs, syncWrites } from './helpers';

// Dmuchawka jako dyscyplina: drugi zestaw „Blasrohr” → przy starcie tylko
// 10 m / Blowgun 20cm, klawiatura 6–10 + X, zapis; zestaw łuczniczy dalej
// bez dmuchawki.
test.beforeEach(async ({ request }) => resetEmulators(request));

test('zestaw Blasrohr: 10 m, tarcza 6–10, zapis, oddzielnie od łuku', async ({ page, request }) => {
  test.setTimeout(120_000);
  const errors = watchErrors(page);
  const uid = await registerUser(page, 'Rohr');
  await nav(page, 'Einst.').click();
  await page.getByRole('main').getByRole('button', { name: 'AUSRÜSTUNG', exact: true }).click();
  await page.getByRole('button', { name: '+ Hinzufügen' }).click();
  await expect(page.getByText('Sets 2/4')).toBeVisible();
  await page.getByRole('main').getByRole('textbox').first().fill('Rohr');
  await page.getByRole('button', { name: 'Blasrohr', exact: true }).click();
  await page.getByRole('button', { name: 'verified_user Speichern & Aktualisieren' }).click();
  await expect.poll(async () => JSON.stringify((await adminListDocs(request, 'users')).find(u => u.name.endsWith(uid))?.fields ?? {}), { timeout: 15_000 }).toContain('Rohr');

  // Start: zestaw Rohr → tylko 10 m z tarczą dmuchawki.
  await page.goto('/');
  await page.getByRole('navigation').getByRole('button', { name: 'target' }).click();
  await page.getByRole('button', { name: 'Rohr', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Rohr', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: '10m', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '18m', exact: true })).toHaveCount(0);
  await expect(page.getByText('Blowgun 20cm').first()).toBeVisible();

  // Klawiatura dmuchawki: X, 10–6, M — bez 5 i niżej.
  await page.getByRole('button', { name: 'Training', exact: true }).click();
  for (const v of ['X', '10', '9', '8', '7', '6', 'M']) await expect(page.getByRole('button', { name: v, exact: true })).toBeVisible();
  for (const v of ['5', '1']) await expect(page.getByRole('button', { name: v, exact: true })).toHaveCount(0);
  await shoot(page, ['X', '10', '9', '8', '7', '6']);
  await expect(page.getByRole('main')).toContainText(/Gesamtringzahl\s*50/);
  await page.getByRole('button', { name: 'Trainingseinheit speichern' }).click();
  await page.getByRole('button', { name: /^Als unvollständig markieren/ }).click();
  await expect(page.getByRole('button', { name: /^Zuletzt 50/ })).toBeVisible();
  await syncWrites(page);

  // W bazie: 10 m, tarcza dmuchawki, zestaw Rohr.
  const sess = JSON.stringify((await adminListDocs(request, `users/${uid}/sessions`))[0].fields);
  expect(sess).toContain('10m');
  expect(sess).toMatch(/[Bb]low/);
  expect(sess).toContain('Dmuchawka (Blasrohr)'); // klasa sprzętu z zestawu (setupId obok)
  expect(sess).toContain('"setupId"');

  // Zestaw łuczniczy: znów dystanse łucznicze, bez 10 m dmuchawki.
  await page.getByRole('navigation').getByRole('button', { name: 'target' }).click();
  await page.getByRole('button', { name: 'Mein Set', exact: true }).click();
  await expect(page.getByRole('button', { name: '18m', exact: true })).toBeVisible();
  await expect(page.getByText('Blowgun 20cm')).toHaveCount(0);
  await expectNoErrors(page, errors, 'dmuchawka');
});
