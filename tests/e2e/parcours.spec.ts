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

  // Statystyki dnia: dystans „Parcours”, Trefferbild na tarczy wzorcowej (2026-11-10).
  await nav(page, 'Stats').click();
  await page.getByRole('main').getByRole('button', { name: 'Täglich', exact: true }).click();
  await page.waitForTimeout(1500);
  await expect(page.getByRole('main')).toContainText('Parcours');
  await expect(page.getByText('Trefferbild', { exact: true }).first()).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('parcours-stats.png'), fullPage: true });
  await expectNoErrors(page, errors, 'Parcours');
});

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

// Kropki (nie pierścienie) na tarczy Trefferbild — tylko one mają fill-opacity.
const hitDots = (page: Page) => page.evaluate(() =>
  Array.from(document.querySelectorAll('main svg[viewBox="0 0 300 300"] circle[fill-opacity]'))
    .map(c => ({ x: +c.getAttribute('cx')!, y: +c.getAttribute('cy')! })));

test('Parcours Trefferbild: 4-Spot 20 cm przeskalowany na tarczę pełną (środek tarczki = środek tarczy)', async ({ page, request }) => {
  test.setTimeout(180_000);
  const errors = watchErrors(page);
  const uid = await registerUser(page, 'ParcTb');
  await nav(page, 'Einst.').click();
  await settingsTab(page, 'AUSRÜSTUNG').click();
  await page.getByRole('radio', { name: 'IFAA', exact: true }).click();
  await page.getByRole('button', { name: 'verified_user Speichern & Aktualisieren' }).click();
  await expect.poll(async () => JSON.stringify((await adminListDocs(request, 'users')).find(u => u.name.endsWith(uid))?.fields?.setups ?? {}), { timeout: 15_000 }).toContain('"ifaa"');

  await page.goto('/');
  await page.getByRole('navigation').getByRole('button', { name: 'target' }).click();
  await page.getByTestId('parcours-toggle').check();
  await page.getByRole('button', { name: 'Training', exact: true }).click();
  const bar = page.getByTestId('parcours-bar');
  await bar.getByRole('radio', { name: 'IFAA Field 20cm 4-Spot', exact: true }).click();
  await bar.getByRole('spinbutton', { name: 'Distanz' }).fill('10');
  await page.getByText('Auflage', { exact: true }).click();
  // Środki tarczek (r 66): X X X, czwarta 25 w prawo od środka = 4.
  await clickSvg(page, 80, 125);
  await clickSvg(page, 220, 125);
  await clickSvg(page, 220, 275);
  await clickSvg(page, 80 + 25, 275);
  await expect(page.getByRole('main')).toContainText(/P1\s*X\s*X\s*X\s*4\s*19/);
  await page.waitForTimeout(800);

  const near = (d: { x: number; y: number }, x: number, y: number) => Math.hypot(d.x - x, d.y - y) < 3;
  await page.getByRole('button', { name: 'Trainingseinheit speichern' }).click();
  await page.getByRole('button', { name: /^Als unvollständig markieren/ }).click();
  await expect(page.getByRole('button', { name: /^Zuletzt 19/ })).toBeVisible();
  await syncWrites(page);

  // Statystyki: tarcza pełna (wzorzec 35 cm), kropki przeliczone ze spotów.
  await nav(page, 'Stats').click();
  await page.getByRole('main').getByRole('button', { name: 'Täglich', exact: true }).click();
  await page.waitForTimeout(1500);
  await expect(page.getByTestId('parcours-scaled-note')).toBeVisible();
  const statDots = await hitDots(page);
  expect(statDots).toHaveLength(4);
  expect(statDots.filter(d => near(d, 150, 150))).toHaveLength(3);
  expect(statDots.filter(d => near(d, 150 + 25 * 150 / 66, 150))).toHaveLength(1);
  await page.screenshot({ path: test.info().outputPath('parcours-trefferbild-stats.png'), fullPage: true });
  await expectNoErrors(page, errors, 'Parcours Trefferbild');
});

test('długa runda (14 tarcz): tabela nie nachodzi na notatki, bieżąca seria widoczna', async ({ page, request }) => {
  test.setTimeout(180_000);
  const errors = watchErrors(page);
  const uid = await registerUser(page, 'Lang');
  await nav(page, 'Einst.').click();
  await settingsTab(page, 'AUSRÜSTUNG').click();
  await page.getByRole('radio', { name: 'IFAA', exact: true }).click();
  await page.getByRole('button', { name: 'verified_user Speichern & Aktualisieren' }).click();
  await expect.poll(async () => JSON.stringify((await adminListDocs(request, 'users')).find(u => u.name.endsWith(uid))?.fields?.setups ?? {}), { timeout: 15_000 }).toContain('"ifaa"');
  await page.goto('/');
  await page.getByRole('navigation').getByRole('button', { name: 'target' }).click();
  await page.getByRole('button', { name: 'Training', exact: true }).click();
  // 12 serii po 4 strzały (runda 1 = 14 tarcz).
  for (let i = 0; i < 12; i++) { await shoot(page, ['5', '4', '4', '3']); await page.waitForTimeout(700); }
  await expect(page.getByRole('main')).toContainText(/Gesamtringzahl\s*192/);

  const table = page.getByTestId('ends-table');
  const tableBox = (await table.boundingBox())!;
  const sumBar = (await page.getByText('Gesamtringzahl').first().locator('xpath=ancestor::div[contains(@class,"rounded-2xl")][1]').boundingBox())!;
  const notes = (await page.getByText('Wie lief es?').first().boundingBox())!;
  // Kolejność bez nakładania: tabela → pasek sumy → notatki.
  expect(tableBox.y + tableBox.height).toBeLessThanOrEqual(sumBar.y + 1);
  expect(sumBar.y + sumBar.height).toBeLessThanOrEqual(notes.y + 1);
  // Bieżąca seria (P13) widoczna w przewijanej tabeli.
  const cur = (await table.locator('[data-current]').boundingBox())!;
  expect(cur.y).toBeGreaterThanOrEqual(tableBox.y - 1);
  expect(cur.y + cur.height).toBeLessThanOrEqual(tableBox.y + tableBox.height + 1);
  await expect(table.locator('[data-current]')).toContainText('P13');
  // Klawisze nie spłaszczone (pełna wysokość jak przy zwykłym treningu).
  expect((await page.getByRole('button', { name: '5', exact: true }).boundingBox())!.height).toBeGreaterThan(40);
  await page.screenshot({ path: test.info().outputPath('long-round.png') });
  await expectNoErrors(page, errors, 'długa runda');
});

test('okienko celownika (Distanz-Einstellungen) na małym ekranie: całe, pełne nazwy tarcz', async ({ page, request }) => {
  test.setTimeout(150_000);
  const errors = watchErrors(page);
  await page.setViewportSize({ width: 375, height: 667 });
  const uid = await registerUser(page, 'Klein');
  await nav(page, 'Einst.').click();
  await settingsTab(page, 'AUSRÜSTUNG').click();
  await page.getByRole('radio', { name: 'IFAA', exact: true }).click();
  await page.getByRole('button', { name: 'verified_user Speichern & Aktualisieren' }).click();
  await expect.poll(async () => JSON.stringify((await adminListDocs(request, 'users')).find(u => u.name.endsWith(uid))?.fields?.setups ?? {}), { timeout: 15_000 }).toContain('"ifaa"');
  await page.goto('/');
  await page.getByRole('navigation').getByRole('button', { name: 'target' }).click();
  await page.locator('button:has-text("edit")').first().click();
  const box = page.getByTestId('sight-editor');
  await expect(box).toBeVisible();
  const b = (await box.boundingBox())!;
  expect(b.y).toBeGreaterThanOrEqual(0);
  expect(b.y + b.height).toBeLessThanOrEqual(668);
  // Zwykła 20 cm i Expert są rozróżnialne — żadna nazwa nie jest ucięta.
  await expect(box.getByRole('button', { name: 'IFAA Field 20cm 4-Spot', exact: true })).toBeVisible();
  await expect(box.getByRole('button', { name: 'IFAA Field 20cm 4-Spot Expert', exact: true })).toBeVisible();
  const truncated = await box.evaluate(el => Array.from(el.querySelectorAll('button span')).filter(s => (s as HTMLElement).scrollWidth > (s as HTMLElement).clientWidth + 1).map(s => s.textContent));
  expect(truncated).toEqual([]);
  // „Speichern” osiągalny przewinięciem okienka.
  const save = box.getByRole('button', { name: 'Speichern', exact: true });
  await save.scrollIntoViewIfNeeded();
  await expect(save).toBeInViewport();
  await page.screenshot({ path: test.info().outputPath('sight-small.png') });
  await expectNoErrors(page, errors, 'okienko celownika');
});
