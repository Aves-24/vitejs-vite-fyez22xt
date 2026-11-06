import { test, expect } from '@playwright/test';
import { resetEmulators, registerUser, nav, watchErrors, expectNoErrors, adminListDocs, syncWrites } from './helpers';

// Wartung: 2 czynności z terminem na dziś → jeden wpis na zestaw (Home +
// kalendarz) → odhaczenie jednej → wpis zostaje z drugą.
test.beforeEach(async ({ request }) => resetEmulators(request));

test('Wartung: plan, wpis w kalendarzu, częściowe odhaczanie', async ({ page, request }) => {
  test.setTimeout(120_000);
  const errors = watchErrors(page);
  const uid = await registerUser(page, 'Wart');
  const d = new Date();
  const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  await nav(page, 'Einst.').click();
  await page.getByRole('main').getByRole('button', { name: 'AUSRÜSTUNG', exact: true }).click();
  await page.getByRole('button', { name: 'Wartungsplan' }).click();
  const dlg = page.locator('body > div').last();
  await dlg.getByRole('switch').nth(0).click();               // Sehne wachsen
  await dlg.getByRole('textbox', { name: 'Erste Erinnerung' }).first().fill(iso);
  await dlg.getByRole('switch').nth(4).click();               // Visier prüfen
  await dlg.getByRole('textbox', { name: 'Erste Erinnerung' }).last().fill(iso);
  await expect(dlg.getByText('Aktiv: 2')).toBeVisible();
  await dlg.getByRole('button', { name: 'Fertig' }).click();

  // Home: brązowy pasek z jednym wpisem na zestaw.
  await page.goto('/');
  await expect(page.getByRole('button', { name: /Wartung \(2 Aufgaben\)/ })).toBeVisible({ timeout: 15_000 });

  // Kalendarz: wpis → odhaczenie „Sehne wachsen” → zapis jednej.
  await nav(page, 'Kalender').click();
  await page.getByRole('button', { name: /Wartung \(2 Aufgaben\) Wartung · fällig/ }).click();
  await page.getByRole('button', { name: 'Als erledigt markieren' }).first().click(); // Sehne wachsen
  await page.getByRole('button', { name: /1 erledigt – speichern/ }).click();
  // Została jedna czynność — wpis nosi już jej nazwę.
  await expect(page.getByRole('button', { name: /Visier prüfen Wartung · fällig/ })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('button', { name: /Wartung \(2 Aufgaben\)/ })).toHaveCount(0);
  await syncWrites(page);

  // W bazie: data wykonania tylko dla jednej czynności.
  const user = JSON.stringify((await adminListDocs(request, 'users')).find(u => u.name.endsWith(uid))?.fields?.maintenanceDone ?? {});
  expect(user.match(/__/g) || []).toHaveLength(1);
  await expectNoErrors(page, errors, 'Wartung');
});
