import { test, expect, type Page } from '@playwright/test';
import { resetEmulators, registerUser, nav, watchErrors, expectNoErrors, adminListDocs, adminPatchDoc, syncWrites } from './helpers';

// [ANIMAL ROUND 2026-11-10] Runda zwierzęca IFAA: Kill/Wound/Miss, do 3 strzał
// na zwierzę, pierwsze trafienie zamyka stanowisko; nazwy zwierząt wpisywane.
test.beforeEach(async ({ request }) => resetEmulators(request));

const settingsTab = (page: Page, name: string) => page.getByRole('main').getByRole('button', { name, exact: true });

test('Animal Round: Kill 20 / Miss+Wound 10 / 3×Miss 0, nazwy zwierząt, Trefferquote', async ({ page, request }) => {
  test.setTimeout(180_000);
  const errors = watchErrors(page);
  const uid = await registerUser(page, 'Animal');
  await nav(page, 'Einst.').click();
  await settingsTab(page, 'AUSRÜSTUNG').click();
  await page.getByRole('radio', { name: 'IFAA', exact: true }).click();
  await page.getByRole('button', { name: 'verified_user Speichern & Aktualisieren' }).click();
  await expect.poll(async () => JSON.stringify((await adminListDocs(request, 'users')).find(u => u.name.endsWith(uid))?.fields?.setups ?? {}), { timeout: 15_000 }).toContain('"ifaa"');

  await page.goto('/');
  await page.getByRole('navigation').getByRole('button', { name: 'target' }).click();
  // Zwierzęta = kafelek obok dystansów (bez ustawiania dystansu).
  await page.getByTestId('animal-tile').click();
  await expect(page.getByText(/Bis zu 3 Pfeile pro Tier/)).toBeVisible();
  // Tarcza/celownik i Parcours dotyczą dystansu — przy zwierzętach ich nie ma.
  await expect(page.getByTestId('parcours-toggle')).toHaveCount(0);
  await page.getByRole('button', { name: 'Training', exact: true }).click();

  const bar = page.getByTestId('animal-bar');
  const keypad = page.getByTestId('animal-keypad');
  await expect(bar).toContainText('Tier 1/28');
  await bar.getByRole('combobox', { name: 'Tier' }).fill('Hirsch');
  await keypad.getByRole('button', { name: 'Kill 20' }).click();
  await page.waitForTimeout(800);

  await expect(bar).toContainText('Tier 2/28');
  await expect(bar.getByRole('combobox', { name: 'Tier' })).toHaveValue('');
  await bar.getByRole('combobox', { name: 'Tier' }).fill('Fuchs');
  await keypad.getByRole('button', { name: 'Miss' }).click();
  // Druga strzała: Kill 14 / Wound 10.
  await expect(keypad.getByRole('button', { name: 'Wound 10' })).toBeVisible();
  await keypad.getByRole('button', { name: 'Wound 10' }).click();
  await page.waitForTimeout(800);

  await expect(bar).toContainText('Tier 3/28');
  await bar.getByRole('combobox', { name: 'Tier' }).fill('Bär');
  for (let i = 0; i < 3; i++) await keypad.getByRole('button', { name: 'Miss' }).click();
  await page.waitForTimeout(800);
  await expect(bar).toContainText('Tier 4/28');

  const table = page.getByTestId('ends-table');
  await expect(table).toContainText(/1 Hirsch\s*20/);
  await expect(table).toContainText(/2 Fuchs\s*M\s*10/);
  await expect(page.getByRole('main')).toContainText(/Gesamtringzahl\s*30/);
  await page.screenshot({ path: test.info().outputPath('animal-scoring.png') });

  await page.getByRole('button', { name: 'Trainingseinheit speichern' }).click();
  await page.getByRole('button', { name: /^Als unvollständig markieren/ }).click();
  await expect(page.getByRole('button', { name: /^Zuletzt 30/ })).toBeVisible();
  await syncWrites(page);

  const s = (await adminListDocs(request, `users/${uid}/sessions`))[0].fields;
  expect(s.distance.stringValue).toBe('Animal');
  expect(s.targetType.stringValue).toBe('IFAA Animal');
  expect(Number(s.score.integerValue)).toBe(30);
  const ends = s.ends.arrayValue.values.map((v: any) => v.mapValue.fields);
  expect(ends.map((e: any) => [e.animal?.stringValue, e.arrows.arrayValue.values.map((a: any) => a.stringValue).join(',')])).toEqual([
    ['Hirsch', '20'], ['Fuchs', 'M,10'], ['Bär', 'M,M,M'],
  ]);
  // Bez rangi: profil bez rankWorlds.animal i bez handicapu z tej sesji.
  const user = (await adminListDocs(request, 'users')).find(u => u.name.endsWith(uid))!.fields;
  expect(JSON.stringify(user.rankWorlds ?? {})).not.toContain('animal');

  // Statystyki dnia: Trefferquote zamiast Trefferbild.
  await nav(page, 'Stats').click();
  await page.getByRole('main').getByRole('button', { name: 'Täglich', exact: true }).click();
  await page.waitForTimeout(1500);
  const card = page.getByTestId('animal-card');
  await expect(card).toBeVisible();
  await expect(card).toContainText('Hirsch');
  await expect(page.getByText('Trefferbild', { exact: true })).toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath('animal-stats.png'), fullPage: true });
  await expectNoErrors(page, errors, 'Animal Round');
});

test('Animal Round: zapis trasy, kolejna runda z wpisanymi zwierzętami, obrys PRO z paczki na żądanie', async ({ page, request }) => {
  test.setTimeout(240_000);
  const errors = watchErrors(page);
  const outlineRequests: string[] = [];
  page.on('request', r => { if (new URL(r.url()).pathname === '/animals/outlines.json') outlineRequests.push(r.url()); });
  const uid = await registerUser(page, 'Trasa');
  await nav(page, 'Einst.').click();
  await settingsTab(page, 'AUSRÜSTUNG').click();
  await page.getByRole('radio', { name: 'IFAA', exact: true }).click();
  await page.getByRole('button', { name: 'verified_user Speichern & Aktualisieren' }).click();
  await expect.poll(async () => JSON.stringify((await adminListDocs(request, 'users')).find(u => u.name.endsWith(uid))?.fields?.setups ?? {}), { timeout: 15_000 }).toContain('"ifaa"');
  // Paczka obrysów NIE ładuje się poza trybem zwierząt.
  expect(outlineRequests).toEqual([]);
  await adminPatchDoc(request, `users/${uid}`, { trialEndsAt: Date.now() + 30 * 86_400_000 }); // PRO

  // Runda 1: dwa zwierzęta, drugie z obrysem z paczki.
  await page.goto('/');
  await page.getByRole('navigation').getByRole('button', { name: 'target' }).click();
  await page.getByTestId('animal-tile').click();
  await page.getByRole('button', { name: 'Training', exact: true }).click();
  const bar = page.getByTestId('animal-bar');
  const keypad = page.getByTestId('animal-keypad');
  const name = bar.getByRole('combobox', { name: 'Tier' });
  await name.fill('Hirsch');
  await keypad.getByRole('button', { name: 'Kill 20' }).click();
  await page.waitForTimeout(800);
  await bar.getByTestId('outline-btn').click();
  const picker = page.getByRole('dialog', { name: 'Umriss des Tiers' });
  await picker.getByRole('textbox', { name: 'Tier suchen' }).fill('Wildschw');
  await picker.getByRole('button', { name: /Wildschwein/ }).click();
  await expect(name).toHaveValue('Wildschwein'); // pusta nazwa → nazwa obrysu
  expect(outlineRequests.some(u => u.endsWith('/animals/outlines.json'))).toBe(true);
  await keypad.getByRole('button', { name: 'Wound 16' }).click();
  await page.waitForTimeout(800);

  // Zapis trasy z podsumowania.
  await page.getByRole('button', { name: /Statistiken anzeigen/ }).click();
  await page.getByRole('textbox', { name: 'Name der Strecke' }).fill('Waldkurs');
  await page.getByTestId('course-save').click();
  await expect(page.getByTestId('course-saved')).toBeVisible();
  await syncWrites(page);
  const courses = await adminListDocs(request, `users/${uid}/courses`);
  expect(courses).toHaveLength(1);
  const st = courses[0].fields.stations.arrayValue.values.map((v: any) => [v.mapValue.fields.name.stringValue, v.mapValue.fields.outlineId?.stringValue]);
  expect(st).toEqual([['Hirsch', undefined], ['Wildschwein', 'wild-boar']]);
  await page.getByRole('button', { name: 'Trainingseinheit speichern' }).click();
  await page.getByRole('button', { name: /^Als unvollständig markieren/ }).click();
  await expect(page.getByRole('button', { name: /^Zuletzt 36/ })).toBeVisible();

  // Runda 2 z trasą: nazwy i obrys wypełnione, liczba stanowisk z trasy.
  await page.getByRole('navigation').getByRole('button', { name: 'target' }).click();
  await page.getByTestId('course-tile').filter({ hasText: 'Waldkurs' }).click();
  await page.getByRole('button', { name: 'Training', exact: true }).click();
  await expect(bar).toContainText('Tier 1/2');
  await expect(name).toHaveValue('Hirsch');
  await keypad.getByRole('button', { name: 'Miss' }).click();
  await keypad.getByRole('button', { name: 'Kill 14' }).click();
  await page.waitForTimeout(800);
  await expect(bar).toContainText('Tier 2/2');
  await expect(name).toHaveValue('Wildschwein');
  await expect(bar.getByTestId('outline-btn').locator('svg')).toBeVisible();
  // Zwierzę wymienione na trasie → zmiana do zapisania w trasie.
  await name.fill('Bär');
  await keypad.getByRole('button', { name: 'Kill 20' }).click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: test.info().outputPath('animal-course.png'), fullPage: true });
  await page.getByTestId('course-update').click();
  await expect(page.getByTestId('course-saved')).toBeVisible();
  await syncWrites(page);
  const c2 = (await adminListDocs(request, `users/${uid}/courses`))[0].fields.stations.arrayValue.values.map((v: any) => v.mapValue.fields.name.stringValue);
  expect(c2).toEqual(['Hirsch', 'Bär']);
  await expectNoErrors(page, errors, 'Animal Strecke');
});

test('Strecken in Einstellungen: Strecke anlegen (Tiere, Umriss PRO), Kachel in Vorbereitung, Training mit eingetragenen Tieren', async ({ page, request }) => {
  test.setTimeout(240_000);
  const errors = watchErrors(page);
  const uid = await registerUser(page, 'Editor');
  await nav(page, 'Einst.').click();
  await settingsTab(page, 'AUSRÜSTUNG').click();
  await page.getByRole('radio', { name: 'IFAA', exact: true }).click();
  await page.getByRole('button', { name: 'verified_user Speichern & Aktualisieren' }).click();
  await expect.poll(async () => JSON.stringify((await adminListDocs(request, 'users')).find(u => u.name.endsWith(uid))?.fields?.setups ?? {}), { timeout: 15_000 }).toContain('"ifaa"');
  await adminPatchDoc(request, `users/${uid}`, { trialEndsAt: Date.now() + 30 * 86_400_000 }); // PRO

  // Vorbereitung → „+ Strecke anlegen” prowadzi do Ustawień → Distanzen.
  await page.goto('/');
  await page.getByRole('navigation').getByRole('button', { name: 'target' }).click();
  await page.getByTestId('course-new-tile').click();
  const section = page.getByTestId('courses-section');
  await expect(section).toBeVisible();
  await section.getByTestId('course-add').click();
  const ed = page.getByRole('dialog', { name: 'Strecke bearbeiten' });
  await ed.getByRole('textbox', { name: 'Name der Strecke' }).fill('Hausstrecke');
  await ed.getByRole('textbox', { name: 'Station 1' }).fill('Reh');
  await ed.getByRole('textbox', { name: 'Station 2' }).fill('Luchs');
  // Station 3: Umriss wybrany z paczki — pusta nazwa bierze nazwę obrysu.
  await ed.getByRole('button', { name: 'Umriss des Tiers' }).nth(2).click();
  const picker = page.getByRole('dialog', { name: 'Umriss des Tiers' });
  await picker.getByRole('textbox', { name: 'Tier suchen' }).fill('Wolf');
  await picker.getByRole('button', { name: /^Wolf/ }).first().click();
  await expect(ed.getByRole('textbox', { name: 'Station 3' })).toHaveValue('Wolf');
  await ed.getByRole('button', { name: 'Station 4 löschen' }).click();
  await page.screenshot({ path: test.info().outputPath('course-editor.png') });
  await ed.getByTestId('course-editor-save').click();
  await expect(section).toContainText('Hausstrecke');
  await expect(section).toContainText('3 Tiere');
  await syncWrites(page);
  const st = (await adminListDocs(request, `users/${uid}/courses`))[0].fields.stations.arrayValue.values.map((v: any) => [v.mapValue.fields.name.stringValue, v.mapValue.fields.outlineId?.stringValue]);
  expect(st).toEqual([['Reh', undefined], ['Luchs', undefined], ['Wolf', 'wolf']]);

  // Kafelek trasy w Vorbereitung → trening z wpisanymi zwierzętami.
  await page.goto('/');
  await page.getByRole('navigation').getByRole('button', { name: 'target' }).click();
  await page.getByTestId('course-tile').filter({ hasText: 'Hausstrecke' }).click();
  await page.screenshot({ path: test.info().outputPath('setup-tiles.png') });
  await page.getByRole('button', { name: 'Training', exact: true }).click();
  const bar = page.getByTestId('animal-bar');
  await expect(bar).toContainText('Tier 1/3');
  await expect(bar.getByRole('combobox', { name: 'Tier' })).toHaveValue('Reh');
  await expectNoErrors(page, errors, 'Strecken-Editor');
});
