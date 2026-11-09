import { test, expect, type Page } from '@playwright/test';
import { resetEmulators, registerUser, nav, watchErrors, expectNoErrors, adminListDocs, syncWrites } from './helpers';

// [SPOTY 2026-11-09] Nowe tarcze wielospotowe: Vegas 3×20 (trójkąt, 6–10 + X)
// i WA Field 20 cm 3-fach (teren, 6–1). Wybór w Distanzen (okienko z obrazkami),
// strzelanie myszą w środki spotów, zapis ze spotId, mapa trafień bez błędów.
test.beforeEach(async ({ request }) => resetEmulators(request));

const settingsTab = (page: Page, name: string) => page.getByRole('main').getByRole('button', { name, exact: true });
const save = (page: Page) => page.getByRole('button', { name: 'verified_user Speichern & Aktualisieren' });

/** Punkt z układu tarczy (viewBox) → piksele ekranu na tarczy do wpisywania. */
async function clickSvg(page: Page, x: number, y: number) {
  const p = await page.evaluate(([sx, sy]) => {
    const svg = document.querySelector('main svg[viewBox="0 -4 300 408"]') as SVGSVGElement;
    const pt = svg.createSVGPoint(); pt.x = sx; pt.y = sy;
    const s = pt.matrixTransform(svg.getScreenCTM()!);
    return { x: s.x, y: s.y };
  }, [x, y]);
  await page.mouse.click(p.x, p.y);
}

async function pickTargetFor18m(page: Page, from: RegExp, to: string) {
  await nav(page, 'Einst.').click();
  await settingsTab(page, 'DISTANZEN').click();
  await page.getByRole('button', { name: from }).click();
  const sheet = page.getByRole('dialog', { name: 'Auflage wählen · 18m' });
  await sheet.getByRole('button', { name: new RegExp(to) }).click();
  await save(page).click();
}

async function startOnTarget(page: Page) {
  await page.goto('/');
  await page.getByRole('navigation').getByRole('button', { name: 'target' }).click();
  await page.getByRole('button', { name: 'Training', exact: true }).click();
  await page.getByText('Auflage', { exact: true }).click();
  await expect(page.locator('main svg[viewBox="0 -4 300 408"]')).toBeVisible();
}

test('Vegas 3×20: trójkąt, X/10–6, kartka 2 dla strzał 4–6, zapis ze spotami', async ({ page, request }) => {
  test.setTimeout(120_000);
  const errors = watchErrors(page);
  const uid = await registerUser(page, 'Vegas');
  await pickTargetFor18m(page, /^Auflage wählen: 3-Spot/, 'Vegas 3-Spot');
  await expect.poll(async () => JSON.stringify((await adminListDocs(request, 'users')).find(u => u.name.endsWith(uid))?.fields ?? {}), { timeout: 15_000 }).toContain('Vegas 3-Spot');

  await startOnTarget(page);
  await expect(page.getByRole('main')).toContainText(/Vegas 3-Spot/i);
  await page.screenshot({ path: test.info().outputPath('vegas-input.png') });
  // Kartka 1 (góra): trzy X w trójkącie.
  await clickSvg(page, 150, 55);
  await clickSvg(page, 92, 145);
  await clickSvg(page, 208, 145);
  // Kartka 2 (dół, y + 205): X, 9 (15 j. od środka), X.
  await clickSvg(page, 150, 260);
  await clickSvg(page, 92 + 15, 350);
  await clickSvg(page, 208, 350);
  await expect(page.getByRole('main')).toContainText(/Gesamtringzahl\s*59/);
  await page.screenshot({ path: test.info().outputPath('vegas-6-arrows.png') });

  await page.getByRole('button', { name: 'Trainingseinheit speichern' }).click();
  await page.getByRole('button', { name: /^Als unvollständig markieren/ }).click();
  await expect(page.getByRole('button', { name: /^Zuletzt 59/ })).toBeVisible();
  await syncWrites(page);
  const s = (await adminListDocs(request, `users/${uid}/sessions`))[0].fields;
  expect(s.targetType.stringValue).toBe('Vegas 3-Spot');
  const dots = s.ends.arrayValue.values[0].mapValue.fields.dots.arrayValue.values;
  expect(dots.map((d: any) => d.mapValue.fields.spotId.stringValue)).toEqual(['A0', 'A1', 'A2', 'B0', 'B1', 'B2']);

  // Statystyki dnia (mapa trafień, Trefferbild) z tarczą Vegas — bez błędów.
  await nav(page, 'Stats').click();
  await page.getByRole('main').getByRole('button', { name: 'Täglich', exact: true }).click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: test.info().outputPath('vegas-stats.png'), fullPage: true });
  await expectNoErrors(page, errors, 'Vegas');
});

test('Field 20 cm 3-fach: zestaw Feld, spoty 6–1, zapis w świecie terenu', async ({ page, request }) => {
  test.setTimeout(120_000);
  const errors = watchErrors(page);
  const uid = await registerUser(page, 'Feld20');
  await nav(page, 'Einst.').click();
  await settingsTab(page, 'AUSRÜSTUNG').click();
  await page.getByRole('radio', { name: 'Feld (WA)' }).click();
  await save(page).click();
  await page.goto('/');
  await pickTargetFor18m(page, /^Auflage wählen: 3-Spot/, 'Field 20cm 3-Spot');
  await expect.poll(async () => JSON.stringify((await adminListDocs(request, 'users')).find(u => u.name.endsWith(uid))?.fields ?? {}), { timeout: 15_000 }).toContain('Field 20cm 3-Spot');

  await startOnTarget(page);
  await page.screenshot({ path: test.info().outputPath('field20-input.png') });
  // Lewa kartka: 6, 5 (10 j. = między 0,1r a 0,2r), 6; prawa: 6, 6, 1 (60 j.).
  await clickSvg(page, 75, 66);
  await clickSvg(page, 75 + 10, 200);
  await clickSvg(page, 75, 333);
  await clickSvg(page, 225, 66);
  await clickSvg(page, 225, 200);
  await clickSvg(page, 225 + 60, 333);
  await expect(page.getByRole('main')).toContainText(/Gesamtringzahl\s*30/);
  await page.getByRole('button', { name: 'Trainingseinheit speichern' }).click();
  await page.getByRole('button', { name: /^Als unvollständig markieren/ }).click();
  await expect(page.getByRole('button', { name: /^Zuletzt 30/ })).toBeVisible();
  await syncWrites(page);
  expect((await adminListDocs(request, `users/${uid}/sessions`))[0].fields.targetType.stringValue).toBe('Field 20cm 3-Spot');
  // Home w świecie terenu: 6/5 złoto (5 z 6), 1 czerń.
  await page.goto('/');
  await expect(page.getByTestId('home-zones')).toHaveAttribute('aria-label', /letzte 1 Trainings: Gold 83 %, \S+ 17 %/);
  await expectNoErrors(page, errors, 'Field 20');
});
