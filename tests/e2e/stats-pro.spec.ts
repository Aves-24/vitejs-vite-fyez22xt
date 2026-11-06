import { test, expect, type Page } from '@playwright/test';
import { resetEmulators, registerUser, shoot, nav, watchErrors, expectNoErrors, syncWrites, adminListDocs } from './helpers';
import * as fs from 'fs';

// Statystyki z kilkoma treningami (konto z trialem PRO): PRO Progress,
// eksport PDF i CSV z okna analizy treningu.
test.beforeEach(async ({ request }) => resetEmulators(request));

async function training(page: Page, ends: string[][]) {
  await page.getByRole('navigation').getByRole('button', { name: 'target' }).click();
  await page.getByRole('button', { name: 'Training', exact: true }).click();
  for (const e of ends) await shoot(page, e);
  await page.getByRole('button', { name: 'Trainingseinheit speichern' }).click();
  await page.getByRole('button', { name: /^Als unvollständig markieren/ }).click();
  await expect(page.getByRole('button', { name: /^Zuletzt/ })).toBeVisible();
}

test('statystyki PRO z kilkoma treningami + eksport PDF i CSV', async ({ page, request }) => {
  test.setTimeout(150_000);
  const errors = watchErrors(page);
  await registerUser(page, 'Stats');
  await training(page, [['X', '10', '9', '9', '8', '7'], ['10', '9', '9', '8', '8', '7']]);
  await training(page, [['10', '10', '9', '9', '9', '8'], ['X', 'X', '10', '9', '9', '8']]);
  await training(page, [['9', '9', '8', '8', '7', '6'], ['10', '9', '8', '8', '7', 'M']]);
  // Po 3 treningach: pierwsza ranga z handicapu.
  await expect(page.getByText('Dein erster Rang', { exact: false })).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Super', exact: true }).click();
  await syncWrites(page);
  // Każdy trening ma w bazie OBIE Passen (wcześniej druga, wpisana tuż przed
  // „Speichern”, była tylko w sumie — tarcza, statystyki i eksport jej nie miały).
  const uid = await page.evaluate(() => (window as any).__fb.auth.currentUser.uid as string);
  const sessions = await adminListDocs(request, `users/${uid}/sessions`);
  expect(sessions).toHaveLength(3);
  for (const d of sessions) expect(d.fields.ends.arrayValue.values).toHaveLength(2);

  // PRO Progress: liczby z trzech treningów, bez błędów.
  await nav(page, 'Stats').click();
  await page.getByRole('main').getByRole('button', { name: /PRO Progress/ }).click();
  await expect(page.getByRole('main')).toContainText(/\d/);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: process.env.TEMP + '/dm/pro.png', fullPage: true });
  await expectNoErrors(page, errors, 'PRO Progress');

  // Täglich → ostatni trening → eksport.
  await page.getByRole('main').getByRole('button', { name: 'Täglich', exact: true }).click();
  await expect(page.getByText('Ergebnisse exportieren').first()).toBeVisible();
  const [pdf] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: /PDF/ }).first().click(),
  ]);
  expect(pdf.suggestedFilename()).toMatch(/^GrotX_Report_.*\.pdf$/);
  const pdfPath = await pdf.path();
  expect(fs.readFileSync(pdfPath!).subarray(0, 4).toString()).toBe('%PDF');
  expect(fs.statSync(pdfPath!).size).toBeGreaterThan(5000);

  const [csv] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: /CSV/ }).first().click(),
  ]);
  expect(csv.suggestedFilename()).toMatch(/\.csv$/);
  const text = fs.readFileSync((await csv.path())!, 'utf8');
  const lines = text.trim().split('\n');
  // Nagłówek po niemiecku (wcześniej zawsze po polsku) + 2 Passen ostatniego treningu.
  expect(lines[0]).toBe('Passe,Pfeil 1,Pfeil 2,Pfeil 3,Pfeil 4,Pfeil 5,Pfeil 6,Summe');
  expect(lines).toHaveLength(3);
  await expectNoErrors(page, errors, 'eksport');
});
