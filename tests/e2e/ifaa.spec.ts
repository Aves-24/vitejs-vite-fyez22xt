import { test, expect, type Page } from '@playwright/test';
import { resetEmulators, registerUser, nav, shoot, watchErrors, expectNoErrors, adminListDocs, syncWrites } from './helpers';

// [IFAA 2026-11-09] Zestaw „IFAA”: tylko tarcze IFAA, format jak na zawodach
// (Field 4 strzały × 28 tarcz, Indoor 5 × 12), klawiatura 5/4/3 bez X,
// 4-Spot 20 cm i 5-Spot strzelane myszą (jedna strzała na tarczkę),
// statystyki w świecie IFAA.
test.beforeEach(async ({ request }) => resetEmulators(request));

const settingsTab = (page: Page, name: string) => page.getByRole('main').getByRole('button', { name, exact: true });
const save = (page: Page) => page.getByRole('button', { name: 'verified_user Speichern & Aktualisieren' });

async function clickSvg(page: Page, x: number, y: number) {
  const p = await page.evaluate(([sx, sy]) => {
    const svg = document.querySelector('main svg[viewBox="0 -4 300 408"]') as SVGSVGElement;
    const pt = svg.createSVGPoint(); pt.x = sx; pt.y = sy;
    const s = pt.matrixTransform(svg.getScreenCTM()!);
    return { x: s.x, y: s.y };
  }, [x, y]);
  await page.mouse.click(p.x, p.y);
}

async function ifaaSetup(page: Page, request: any, name: string) {
  const uid = await registerUser(page, name);
  await nav(page, 'Einst.').click();
  await settingsTab(page, 'AUSRÜSTUNG').click();
  await page.getByRole('radio', { name: 'IFAA', exact: true }).click();
  await expect(page.getByText(/nur IFAA-Auflagen/)).toBeVisible();
  await save(page).click();
  await expect.poll(async () => JSON.stringify((await adminListDocs(request, 'users')).find(u => u.name.endsWith(uid))?.fields ?? {}), { timeout: 15_000 }).toContain('"ifaa"');
  return uid;
}

async function pickFor18m(page: Page, request: any, uid: string, to: string, from = '3-Spot') {
  await page.goto('/');
  await nav(page, 'Einst.').click();
  await settingsTab(page, 'DISTANZEN').click();
  await page.getByRole('button', { name: `Auflage wählen: ${from}` }).click();
  const sheet = page.getByRole('dialog', { name: 'Auflage wählen · 18m' });
  await expect(sheet.getByRole('button', { name: /IFAA/ })).toHaveCount(10);
  await page.screenshot({ path: test.info().outputPath(`picker-${to.replace(/\W+/g, '_')}.png`) });
  await sheet.getByRole('button', { name: new RegExp(`^${to}`) }).click();
  await save(page).click();
  await expect.poll(async () => JSON.stringify((await adminListDocs(request, 'users')).find(u => u.name.endsWith(uid))?.fields ?? {}), { timeout: 15_000 }).toContain(to);
}

test('IFAA Field 35 cm: seria 4 strzał, 28 tarcz, klawiatura 5/4/3, świat IFAA', async ({ page, request }) => {
  test.setTimeout(150_000);
  const errors = watchErrors(page);
  const uid = await ifaaSetup(page, request, 'Ifaa');

  await page.goto('/');
  await page.getByRole('navigation').getByRole('button', { name: 'target' }).click();
  // 18 m → domyślnie IFAA Field 35 cm, format zawodów bez skracania.
  await expect(page.getByTestId('setup-card')).toContainText('IFAA Field 35cm');
  await expect(page.getByTestId('face-round')).toContainText('28 × 4');
  await page.getByRole('button', { name: 'Training', exact: true }).click();
  for (const v of ['5', '4', '3', 'M']) await expect(page.getByRole('button', { name: v, exact: true })).toBeVisible();
  for (const v of ['X', '6', '2']) await expect(page.getByRole('button', { name: v, exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '5', exact: true })).toHaveCSS('background-color', 'rgb(51, 51, 51)'); // czarny środek
  await expect(page.getByRole('button', { name: '4', exact: true })).toHaveCSS('background-color', 'rgb(255, 255, 255)'); // biały pierścień

  await shoot(page, ['5', '5', '4', '3']); // seria 1 = 17 (4 strzały)
  await page.waitForTimeout(800);
  await shoot(page, ['5', '4', '4', '3']); // seria 2 = 16
  await page.waitForTimeout(800);
  const main = page.getByRole('main');
  await expect(main).toContainText(/P1\s*5\s*5\s*4\s*3\s*17\s*17/);
  await expect(main).toContainText(/Gesamtringzahl\s*33/);
  await expect(main).toContainText('P14'); // runda 1 = 14 tarcz
  await page.screenshot({ path: test.info().outputPath('ifaa-field-scoring.png') });

  await page.getByRole('button', { name: 'Trainingseinheit speichern' }).click();
  await page.getByRole('button', { name: /^Als unvollständig markieren/ }).click();
  await expect(page.getByRole('button', { name: /^Zuletzt 33/ })).toBeVisible();
  await syncWrites(page);
  const s = (await adminListDocs(request, `users/${uid}/sessions`))[0].fields;
  expect(s.targetType.stringValue).toBe('IFAA Field 35cm');
  expect(s.ends.arrayValue.values).toHaveLength(2);
  expect(s.ends.arrayValue.values[0].mapValue.fields.arrows.arrayValue.values).toHaveLength(4);
  expect(Number(s.endsPlanned.integerValue)).toBe(28);

  // Home w świecie IFAA: 5 = „złoto” 3/8, 4 = 3/8, 3 = 2/8.
  await page.goto('/');
  await expect(page.getByTestId('home-zones')).toHaveAttribute('aria-label', /letzte 1 Trainings: Gold 38 %, \S+ 38 %, \S+ 25 %/);
  await expectNoErrors(page, errors, 'IFAA Field');
});

test('IFAA 4-Spot 20 cm i Indoor 5-Spot: jedna strzała na tarczkę, seria 4 / 5', async ({ page, request }) => {
  test.setTimeout(180_000);
  const errors = watchErrors(page);
  const uid = await ifaaSetup(page, request, 'Spots');

  // 4-Spot: środki (80,125) (220,125) (80,275) (220,275), r 66 → 5 w środku.
  await pickFor18m(page, request, uid, 'IFAA Field 20cm 4-Spot');
  await page.goto('/');
  await page.getByRole('navigation').getByRole('button', { name: 'target' }).click();
  await page.getByRole('button', { name: 'Training', exact: true }).click();
  await page.getByText('Auflage', { exact: true }).click();
  await clickSvg(page, 80, 125);
  await clickSvg(page, 220, 125);
  await clickSvg(page, 80 + 25, 275); // 4 (0,2r–0,6r)
  await page.screenshot({ path: test.info().outputPath('ifaa-4spot.png') });
  await clickSvg(page, 220, 275);
  await expect(page.getByRole('main')).toContainText(/P1\s*5\s*5\s*5\s*4\s*19/);
  await page.waitForTimeout(800);
  await page.getByRole('button', { name: 'Trainingseinheit speichern' }).click();
  await page.getByRole('button', { name: /^Als unvollständig markieren/ }).click();
  await expect(page.getByRole('button', { name: /^Zuletzt 19/ })).toBeVisible();

  // 5-Spot: kostka — (72,100) (228,100) (150,200) (72,300) (228,300), r 58.
  await pickFor18m(page, request, uid, 'IFAA Indoor 5-Spot', 'IFAA Field 20cm 4-Spot');
  await page.goto('/');
  await page.getByRole('navigation').getByRole('button', { name: 'target' }).click();
  await expect(page.getByTestId('face-round')).toContainText('12 × 5');
  await page.getByRole('button', { name: 'Training', exact: true }).click();
  await page.getByText('Auflage', { exact: true }).click();
  for (const [x, y] of [[72, 100], [228, 100], [150, 200], [72, 300]]) await clickSvg(page, x, y);
  await clickSvg(page, 228 + 40, 300); // niebieski = 4
  await page.screenshot({ path: test.info().outputPath('ifaa-5spot.png') });
  await expect(page.getByRole('main')).toContainText(/P1\s*5\s*5\s*5\s*5\s*4\s*24/);
  await page.waitForTimeout(800);
  await page.getByRole('button', { name: 'Trainingseinheit speichern' }).click();
  await page.getByRole('button', { name: /^Als unvollständig markieren/ }).click();
  await expect(page.getByRole('button', { name: /^Zuletzt 24/ })).toBeVisible();
  await syncWrites(page);
  const sessions = await adminListDocs(request, `users/${uid}/sessions`);
  const five = sessions.find(d => d.fields.targetType.stringValue === 'IFAA Indoor 5-Spot')!.fields;
  const dots = five.ends.arrayValue.values[0].mapValue.fields.dots.arrayValue.values;
  expect(dots.map((d: any) => d.mapValue.fields.spotId.stringValue)).toEqual(['D0', 'D1', 'D2', 'D3', 'D4']);

  // Statystyki dnia z 5-Spotem (Trefferbild, tabela 5 kolumn) bez błędów.
  await nav(page, 'Stats').click();
  await page.getByRole('main').getByRole('button', { name: 'Täglich', exact: true }).click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: test.info().outputPath('ifaa-stats.png'), fullPage: true });
  await expectNoErrors(page, errors, 'IFAA spots');
});

test('ranga IFAA: po 3 treningach własna ranga z handicapem, ranga WA nietknięta', async ({ page, request }) => {
  test.setTimeout(180_000);
  const errors = watchErrors(page);
  const uid = await ifaaSetup(page, request, 'Rang');
  for (const end of [['5', '5', '4', '4'], ['5', '4', '4', '3'], ['5', '5', '5', '4']]) {
    await page.goto('/');
    await page.getByRole('navigation').getByRole('button', { name: 'target' }).click();
    await page.getByRole('button', { name: 'Training', exact: true }).click();
    await shoot(page, end);
    await page.waitForTimeout(800);
    await page.getByRole('button', { name: 'Trainingseinheit speichern' }).click();
    await page.getByRole('button', { name: /^Als unvollständig markieren/ }).click();
    await expect(page.getByRole('button', { name: /^Zuletzt/ })).toBeVisible();
    await syncWrites(page);
  }
  const user = (await adminListDocs(request, 'users')).find(u => u.name.endsWith(uid))!.fields;
  // Ranga IFAA zapisana osobno; pola rangi WA puste.
  const ifaa = user.rankWorlds.mapValue.fields.ifaa.mapValue.fields;
  expect(ifaa.hcByBow.mapValue.fields.RECURVE.arrayValue.values).toHaveLength(3);
  expect(user.hcByBow?.mapValue?.fields?.RECURVE).toBeUndefined();

  await page.goto('/');
  const rankTile = page.getByRole('button', { name: /^Bogenschützen-Ranking/ });
  await expect(rankTile).toHaveAttribute('aria-label', /IFAA$/);
  await expect(rankTile).toContainText(/HCP \d+/);
  await page.waitForTimeout(1500);
  await expect(rankTile).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('ifaa-rank.png') });
  await expectNoErrors(page, errors, 'ranga IFAA');
});
