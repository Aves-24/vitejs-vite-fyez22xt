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

test('jeden zestaw (także tylko IFAA): nic na Home i nic w menu', async ({ page, request }) => {
  const errors = watchErrors(page);
  const uid = await registerUser(page, 'Welt');
  // Jeden świat (WA): w menu brak przełącznika, przy plakietce brak skrótu.
  await openMenu(page);
  await expect(page.getByRole('menu').getByRole('radio')).toHaveCount(0);
  await openMenu(page);
  await expect(page.getByTestId('world-short')).toHaveCount(0);
  // Zestaw przestawiony na IFAA w Einstellungen → skrót „IFAA”, ranga IFAA.
  await nav(page, 'Einst.').click();
  await page.getByRole('main').getByRole('button', { name: 'AUSRÜSTUNG', exact: true }).click();
  await page.getByRole('radio', { name: 'IFAA', exact: true }).click();
  await page.getByRole('button', { name: 'verified_user Speichern & Aktualisieren' }).click();
  await expect.poll(async () => JSON.stringify((await userFields(request, uid)).setups), { timeout: 15_000 }).toContain('"ifaa"');
  await page.goto('/');
  // Jeden świat (tu tylko IFAA) — bez skrótu przy plakietce (user 2026-11-09).
  await expect(page.getByTestId('world-short')).toHaveCount(0);
  await expect(rankTile(page)).toHaveAttribute('aria-label', /IFAA$/);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: test.info().outputPath('badge.png') });
  await openMenu(page);
  await expect(page.getByRole('menu').getByRole('radio')).toHaveCount(0);
  await expectNoErrors(page, errors, 'jeden zestaw');
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

  // Tylko światy z zestawów: WA i Feld, bez IFAA (user 2026-11-09).
  await expect(page.getByRole('menu').getByRole('radio')).toHaveCount(2);
  await expect(radio(page, 'IFAA')).toHaveCount(0);
  await radio(page, 'Feld').click();
  await expect(rankTile(page)).toHaveAttribute('aria-label', /Feld \(WA\)$/);
  await expect(page.getByTestId('world-short')).toHaveText('Feld');
  // Skrót na tej samej wysokości co plakietka PRO.
  const badge = await page.getByRole('button', { name: /PRO/ }).first().boundingBox();
  const chip = await page.getByTestId('world-short').boundingBox();
  expect(Math.abs((badge!.y + badge!.height / 2) - (chip!.y + chip!.height / 2))).toBeLessThan(1);
  expect(Math.abs(badge!.height - chip!.height)).toBeLessThan(1.5);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: test.info().outputPath('badge-two-worlds.png'), clip: { x: 0, y: 0, width: 412, height: 140 } });
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

test('kasowanie zestawu: okienko mówi, co zostaje i co przepada; Abbrechen niczego nie kasuje', async ({ page, request }) => {
  const errors = watchErrors(page);
  const uid = await registerUser(page, 'Loesch');
  await nav(page, 'Einst.').click();
  await page.getByRole('main').getByRole('button', { name: 'AUSRÜSTUNG', exact: true }).click();
  await page.getByRole('button', { name: '+ Hinzufügen' }).click();
  await page.getByRole('main').getByRole('textbox').first().fill('Zweitbogen');
  await page.getByRole('button', { name: 'verified_user Speichern & Aktualisieren' }).click();
  await expect.poll(async () => JSON.stringify((await userFields(request, uid)).setups), { timeout: 15_000 }).toContain('Zweitbogen');

  await page.getByRole('button', { name: 'Set löschen' }).click();
  await expect(page.getByText('Dieses Set wirklich löschen?')).toBeVisible();
  await expect(page.getByText(/Bleibt erhalten: alle Trainings, Statistiken und dein Rang/)).toBeVisible();
  await expect(page.getByText(/Geht verloren: die Ausrüstung dieses Sets/)).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('delete-dialog.png') });
  await page.getByRole('button', { name: 'Abbrechen', exact: true }).click();
  await expect(page.getByText('Dieses Set wirklich löschen?')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Zweitbogen', exact: true })).toBeVisible();
  await expectNoErrors(page, errors, 'kasowanie zestawu');
});
