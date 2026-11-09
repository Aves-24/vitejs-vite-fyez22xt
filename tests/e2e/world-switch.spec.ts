import { test, expect, type Page } from '@playwright/test';
import { resetEmulators, registerUser, nav, watchErrors, expectNoErrors, adminListDocs } from './helpers';

// [PRZEŁĄCZNIK ŚWIATA 2026-11-09] Żółte menu na Home: WA / Feld / IFAA.
// Jeden zestaw → zmienia jego styl; kilka zestawów → aktywuje zestaw o tym
// stylu (nie przerabia innego). Ranga i statystyki Home idą za wyborem.
test.beforeEach(async ({ request }) => resetEmulators(request));

const openMenu = (page: Page) => page.getByRole('button', { name: /^(Menü|Menu)$/ }).click();
const radio = (page: Page, name: string) => page.getByRole('menu').getByRole('radio', { name, exact: true });
const rankTile = (page: Page) => page.getByRole('button', { name: /^Bogenschützen-Ranking/ });

async function userFields(request: any, uid: string) {
  return (await adminListDocs(request, 'users')).find(u => u.name.endsWith(uid))!.fields;
}

test('jeden zestaw: przełącznik zmienia styl zestawu, Home idzie za nim', async ({ page, request }) => {
  const errors = watchErrors(page);
  const uid = await registerUser(page, 'Welt');
  await openMenu(page);
  await expect(radio(page, 'WA')).toHaveAttribute('aria-checked', 'true');
  await page.screenshot({ path: test.info().outputPath('menu.png') });
  await radio(page, 'IFAA').click();
  await expect(page.getByRole('menu')).toHaveCount(0);
  await expect(rankTile(page)).toHaveAttribute('aria-label', /IFAA$/);
  await expect.poll(async () => JSON.stringify((await userFields(request, uid)).setups), { timeout: 15_000 }).toContain('"ifaa"');

  // Po przeładowaniu dalej IFAA; przy starcie tylko tarcze IFAA.
  await page.reload();
  await expect(rankTile(page)).toHaveAttribute('aria-label', /IFAA$/);
  await page.getByRole('navigation').getByRole('button', { name: 'target' }).click();
  await expect(page.getByTestId('setup-card')).toContainText('IFAA');

  await page.goto('/');
  await openMenu(page);
  await radio(page, 'Feld').click();
  await expect(rankTile(page)).toHaveAttribute('aria-label', /Feld \(WA\)$/);
  await openMenu(page);
  await radio(page, 'WA').click();
  await expect(rankTile(page)).not.toHaveAttribute('aria-label', /IFAA|Feld/);
  await expect.poll(async () => JSON.stringify((await userFields(request, uid)).setups), { timeout: 15_000 }).toContain('"target"');
  await expectNoErrors(page, errors, 'przełącznik');
});

test('dwa zestawy (PRO): przełącznik aktywuje zestaw „Feld”, nie zmienia zestawu WA', async ({ page, request }) => {
  const errors = watchErrors(page);
  const uid = await registerUser(page, 'Zwei');
  // Drugi zestaw „Gelände” ustawiony na Feld.
  await nav(page, 'Einst.').click();
  await page.getByRole('main').getByRole('button', { name: 'AUSRÜSTUNG', exact: true }).click();
  await page.getByRole('button', { name: '+ Hinzufügen' }).click();
  await page.getByRole('main').getByRole('textbox').first().fill('Gelände');
  await page.getByRole('radio', { name: 'Feld (WA)' }).click();
  await page.getByRole('button', { name: 'verified_user Speichern & Aktualisieren' }).click();
  await expect.poll(async () => JSON.stringify((await userFields(request, uid)).setups), { timeout: 15_000 }).toContain('Gelände');
  // Aktywny z powrotem zestaw 1 (WA), żeby przełącznik miał co aktywować.
  const first = () => userFields(request, uid);
  await page.goto('/');
  await openMenu(page);
  if ((await radio(page, 'WA').getAttribute('aria-checked')) !== 'true') {
    await radio(page, 'WA').click();
    await expect(page.getByRole('menu')).toHaveCount(0); // przełączenie skończone
    await expect.poll(async () => (await first()).activeSetupId?.stringValue, { timeout: 15_000 }).toBe('default');
    await openMenu(page);
  }

  await radio(page, 'Feld').click();
  await expect(rankTile(page)).toHaveAttribute('aria-label', /Feld \(WA\)$/);
  await expect.poll(async () => (await first()).activeSetupId?.stringValue, { timeout: 15_000 }).not.toBe('default');
  // Zestaw 1 nadal na tarczach WA (nie przerobiony na teren).
  const setups = (await first()).setups.arrayValue.values.map((v: any) => v.mapValue.fields);
  const def = setups.find((s: any) => s.id.stringValue === 'default');
  expect(def.style?.stringValue ?? 'target').toBe('target');

  await openMenu(page);
  await radio(page, 'WA').click();
  await expect.poll(async () => (await first()).activeSetupId?.stringValue, { timeout: 15_000 }).toBe('default');
  await expectNoErrors(page, errors, 'dwa zestawy');
});
