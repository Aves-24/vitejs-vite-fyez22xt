import { test, expect } from '@playwright/test';
import { resetEmulators, registerUser, nav, shoot, watchErrors, expectNoErrors, adminListDocs, syncWrites } from './helpers';

// [FELD 2026-11-09] Pierwszy (darmowy) zestaw ustawiony na „Feld”: przy starcie
// tylko tarcze terenowe, klawiatura 6–1, zapis z tarczą Field, Home pokazuje
// statystyki terenu (strefy złoto/czerń). Distanzen: okienko tarcz z obrazkami.
// Powrót na „Scheibe” → Home znów w świecie tarcz WA.
test.beforeEach(async ({ request }) => resetEmulators(request));

const settingsTab = (page: any, name: string) => page.getByRole('main').getByRole('button', { name, exact: true });
const save = (page: any) => page.getByRole('button', { name: 'verified_user Speichern & Aktualisieren' });

test('zestaw Feld: tarcze terenowe, klawiatura 6–1, statystyki terenu, wybór tarczy z obrazkami', async ({ page, request }) => {
  test.setTimeout(150_000);
  const errors = watchErrors(page);
  const uid = await registerUser(page, 'Feld');
  const userFields = async () => JSON.stringify((await adminListDocs(request, 'users')).find(u => u.name.endsWith(uid))?.fields ?? {});

  // 1. Zestaw #1 (FREE) → „Feld (WA)”.
  await nav(page, 'Einst.').click();
  await settingsTab(page, 'AUSRÜSTUNG').click();
  await page.getByRole('radio', { name: 'Feld (WA)' }).click();
  await expect(page.getByRole('radio', { name: 'Feld (WA)' })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByText(/nur Feldauflagen/)).toBeVisible();
  await save(page).click();
  await expect.poll(userFields, { timeout: 15_000 }).toContain('"field"');

  // 2. Distanzen: okienko z obrazkami, tylko tarcze terenowe.
  await page.goto('/');
  await nav(page, 'Einst.').click();
  await settingsTab(page, 'DISTANZEN').click();
  // 18 m (3-Spot z hali) — przy zestawie Feld lista proponuje już tylko teren.
  await page.getByRole('button', { name: 'Auflage wählen: 3-Spot' }).click();
  const sheet = page.getByRole('dialog', { name: 'Auflage wählen · 18m' });
  await expect(sheet).toBeVisible();
  for (const id of ['Field 80cm', 'Field 60cm', 'Field 40cm']) await expect(sheet.getByRole('button', { name: new RegExp(id) })).toBeVisible();
  await expect(sheet.getByRole('button', { name: /^122cm/ })).toHaveCount(0);
  await expect(sheet.locator('svg circle').first()).toBeVisible(); // miniatury
  await page.screenshot({ path: test.info().outputPath('distanzen-picker.png') });
  await sheet.getByRole('button', { name: /Field 40cm/ }).click();
  await expect(sheet).toHaveCount(0);

  // 3. Start: tarcza terenowa, klawiatura 6..1 bez X/10.
  await page.goto('/');
  await page.getByRole('navigation').getByRole('button', { name: 'target' }).click();
  await expect(page.getByTestId('setup-card')).toContainText('Field 40cm');
  await page.getByRole('button', { name: 'Training', exact: true }).click();
  for (const v of ['6', '5', '4', '3', '2', '1', 'M']) await expect(page.getByRole('button', { name: v, exact: true })).toBeVisible();
  for (const v of ['X', '10', '7']) await expect(page.getByRole('button', { name: v, exact: true })).toHaveCount(0);
  // Kolory terenu: 6/5 żółte, 4–1 czarne (wcześniej klasa się nie generowała → biały na białym).
  await expect(page.getByRole('button', { name: '5', exact: true })).toHaveCSS('background-color', 'rgb(242, 201, 76)');
  await expect(page.getByRole('button', { name: '4', exact: true })).toHaveCSS('background-color', 'rgb(51, 51, 51)');
  await page.screenshot({ path: test.info().outputPath('field-keypad.png') });
  await shoot(page, ['6', '6', '5', '4', '3', 'M']); // 24
  await expect(page.getByRole('main')).toContainText(/Gesamtringzahl\s*24/);
  await page.getByRole('button', { name: 'Trainingseinheit speichern' }).click();
  await page.getByRole('button', { name: /^Als unvollständig markieren/ }).click();
  await expect(page.getByRole('button', { name: /^Zuletzt 24/ })).toBeVisible();
  await syncWrites(page);
  const sessions = await adminListDocs(request, `users/${uid}/sessions`);
  expect(sessions).toHaveLength(1);
  expect(sessions[0].fields.targetType.stringValue).toBe('Field 40cm');

  // 4. Home w świecie terenu: strefy 6/5 złoto (3 z 6), 4–1 czerń (2), M (1).
  await page.goto('/');
  await expect(page.getByTestId('home-zones')).toHaveAttribute('aria-label', /letzte 1 Trainings: Gold 50 %, \S+ 33 %, M 17 %/);
  await page.getByRole('button', { name: /Pfeile \/ Monat/ }).click();
  const qs = page.getByRole('dialog', { name: /Schnellstatistik/ });
  await qs.getByRole('button', { name: 'Ringe', exact: true }).click();
  await expect(qs).toContainText('4,0'); // 24 / 6 strzał
  await page.screenshot({ path: test.info().outputPath('field-home-quickstats.png') });
  await page.keyboard.press('Escape');

  // 5. Z powrotem „Scheibe (WA)” → Home bez treningów z tarcz WA (teren się nie miesza).
  await page.goto('/');
  await nav(page, 'Einst.').click();
  await settingsTab(page, 'AUSRÜSTUNG').click();
  await page.getByRole('radio', { name: 'Scheibe (WA)' }).click();
  await save(page).click();
  await expect.poll(userFields, { timeout: 15_000 }).toContain('"target"');
  await page.goto('/');
  await expect(page.getByTestId('home-zones')).toHaveAttribute('aria-label', 'Gold');
  await expect(page.getByTestId('home-zones-info')).toHaveCount(0);
  // Pfeile/Monat liczy wszystkie strzały, niezależnie od świata.
  await expect(page.getByRole('button', { name: /Pfeile \/ Monat/ })).toContainText('6');
  await expectNoErrors(page, errors, 'Feld');
});
