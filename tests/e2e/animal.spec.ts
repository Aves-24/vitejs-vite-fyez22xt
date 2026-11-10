import { test, expect, type Page } from '@playwright/test';
import { resetEmulators, registerUser, nav, watchErrors, expectNoErrors, adminListDocs, adminPatchDoc, syncWrites } from './helpers';

// [ANIMAL ROUND 2026-11-10] Runda zwierzęca IFAA: Kill/Wound/Miss, do 3 strzał
// na zwierzę, pierwsze trafienie zamyka stanowisko; nazwy zwierząt wpisywane.
test.beforeEach(async ({ request }) => resetEmulators(request));

const settingsTab = (page: Page, name: string) => page.getByRole('main').getByRole('button', { name, exact: true });

test('Animal Round: Kill 20 / Miss+Wound 14 / 3×Miss 0, nazwy zwierząt, Trefferquote', async ({ page, request }) => {
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
  // Domyślnie IFAA (Kill 20/16/12, Wound 18/14/10).
  await expect(page.getByTestId('animal-format').getByRole('radio', { name: 'IFAA Tiere' })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByText(/bis zu 3 Pfeile pro Tier/)).toBeVisible();
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
  // Druga strzała: Kill 16 / Wound 14 (IFAA).
  await expect(keypad.getByRole('button', { name: 'Wound 14' })).toBeVisible();
  await keypad.getByRole('button', { name: 'Wound 14' }).click();
  await page.waitForTimeout(800);

  await expect(bar).toContainText('Tier 3/28');
  await bar.getByRole('combobox', { name: 'Tier' }).fill('Bär');
  for (let i = 0; i < 3; i++) await keypad.getByRole('button', { name: 'Miss' }).click();
  await page.waitForTimeout(800);
  await expect(bar).toContainText('Tier 4/28');

  const table = page.getByTestId('ends-table');
  await expect(table).toContainText(/1 Hirsch\s*20/);
  await expect(table).toContainText(/2 Fuchs\s*M\s*14/);
  await expect(page.getByRole('main')).toContainText(/Gesamtringzahl\s*34/);
  await page.screenshot({ path: test.info().outputPath('animal-scoring.png') });

  await page.getByRole('button', { name: 'Trainingseinheit speichern' }).click();
  await page.getByRole('button', { name: /^Als unvollständig markieren/ }).click();
  await expect(page.getByRole('button', { name: /^Zuletzt 34/ })).toBeVisible();
  await syncWrites(page);

  const s = (await adminListDocs(request, `users/${uid}/sessions`))[0].fields;
  expect(s.distance.stringValue).toBe('Animal');
  expect(s.targetType.stringValue).toBe('IFAA Animal');
  expect(Number(s.score.integerValue)).toBe(34);
  const ends = s.ends.arrayValue.values.map((v: any) => v.mapValue.fields);
  expect(ends.map((e: any) => [e.animal?.stringValue, e.arrows.arrayValue.values.map((a: any) => a.stringValue).join(',')])).toEqual([
    ['Hirsch', '20'], ['Fuchs', 'M,14'], ['Bär', 'M,M,M'],
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
  await keypad.getByRole('button', { name: 'Wound 18' }).click();
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
  await expect(page.getByRole('button', { name: /^Zuletzt 38/ })).toBeVisible();

  // Runda 2 z trasą: nazwy i obrys wypełnione, liczba stanowisk z trasy.
  await page.getByRole('navigation').getByRole('button', { name: 'target' }).click();
  await page.getByTestId('course-tile').filter({ hasText: 'Waldkurs' }).click();
  await page.getByRole('button', { name: 'Training', exact: true }).click();
  await expect(bar).toContainText('Tier 1/2');
  await expect(name).toHaveValue('Hirsch');
  await keypad.getByRole('button', { name: 'Miss' }).click();
  await keypad.getByRole('button', { name: 'Kill 16' }).click();
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

test('DBSV 3D: Jagdrunde 1 Pfeil (Kill 15 / Körper 12, Miss schließt), Waldrunde 15/10/5 – 12/7/2, Format gemerkt', async ({ page, request }) => {
  test.setTimeout(180_000);
  const errors = watchErrors(page);
  const uid = await registerUser(page, 'Dbsv');
  await nav(page, 'Einst.').click();
  await settingsTab(page, 'AUSRÜSTUNG').click();
  await page.getByRole('radio', { name: 'IFAA', exact: true }).click();
  await page.getByRole('button', { name: 'verified_user Speichern & Aktualisieren' }).click();
  await expect.poll(async () => JSON.stringify((await adminListDocs(request, 'users')).find(u => u.name.endsWith(uid))?.fields?.setups ?? {}), { timeout: 15_000 }).toContain('"ifaa"');

  // Jagdrunde.
  await page.goto('/');
  await page.getByRole('navigation').getByRole('button', { name: 'target' }).click();
  await page.getByTestId('animal-tile').click();
  const fmt = page.getByTestId('animal-format');
  await fmt.getByRole('radio', { name: 'DBSV Jagd' }).click();
  await expect(fmt).toContainText('nur 1 Pfeil pro Tier');
  await page.getByRole('button', { name: 'Training', exact: true }).click();
  const keypad = page.getByTestId('animal-keypad');
  const bar = page.getByTestId('animal-bar');
  await expect(keypad.getByRole('button', { name: 'Kill 15' })).toBeVisible();
  await expect(keypad.getByRole('button', { name: 'Körper 12' })).toBeVisible();
  await keypad.getByRole('button', { name: 'Kill 15' }).click();
  await page.waitForTimeout(800);
  await keypad.getByRole('button', { name: 'Miss' }).click(); // 1 strzała — Miss zamyka
  await page.waitForTimeout(800);
  await expect(bar).toContainText('Tier 3/28');
  await keypad.getByRole('button', { name: 'Körper 12' }).click();
  await page.waitForTimeout(800);
  await expect(page.getByRole('main')).toContainText(/Gesamtringzahl\s*27/);
  await page.screenshot({ path: test.info().outputPath('dbsv-jagd.png') });
  await page.getByRole('button', { name: 'Trainingseinheit speichern' }).click();
  await page.getByRole('button', { name: /^Als unvollständig markieren/ }).click();
  await expect(page.getByRole('button', { name: /^Zuletzt 27/ })).toBeVisible();
  await syncWrites(page);
  const s = (await adminListDocs(request, `users/${uid}/sessions`))[0].fields;
  expect(s.targetType.stringValue).toBe('DBSV 3D Jagdrunde');
  expect(s.ends.arrayValue.values.map((v: any) => v.mapValue.fields.arrows.arrayValue.values.map((a: any) => a.stringValue).join(','))).toEqual(['15', 'M', '12']);

  // Waldrunde — format zapamiętany (Jagd), przełączamy na Wald.
  await page.getByRole('navigation').getByRole('button', { name: 'target' }).click();
  await page.getByTestId('animal-tile').click();
  await expect(fmt.getByRole('radio', { name: 'DBSV Jagd' })).toHaveAttribute('aria-checked', 'true');
  await fmt.getByRole('radio', { name: 'DBSV Wald' }).click();
  await page.getByRole('button', { name: 'Training', exact: true }).click();
  await keypad.getByRole('button', { name: 'Miss' }).click();
  await expect(keypad.getByRole('button', { name: 'Kill 10' })).toBeVisible();
  await expect(keypad.getByRole('button', { name: 'Körper 7' })).toBeVisible();
  await keypad.getByRole('button', { name: 'Körper 7' }).click();
  await page.waitForTimeout(800);
  await expect(bar).toContainText('Tier 2/28');
  await page.getByRole('button', { name: /Statistiken anzeigen/ }).click();
  await expect(page.getByTestId('animal-card')).toContainText('Körper');
  await expectNoErrors(page, errors, 'DBSV');
});

test('IFAA 3D: Hunting 1 Pfeil (Kill/Vital/Wound 20/16/10), Standard 2 Pfeile beide zählen (10/8/5)', async ({ page, request }) => {
  test.setTimeout(180_000);
  const errors = watchErrors(page);
  const uid = await registerUser(page, 'Ifaa3d');
  await nav(page, 'Einst.').click();
  await settingsTab(page, 'AUSRÜSTUNG').click();
  await page.getByRole('radio', { name: 'IFAA', exact: true }).click();
  await page.getByRole('button', { name: 'verified_user Speichern & Aktualisieren' }).click();
  await expect.poll(async () => JSON.stringify((await adminListDocs(request, 'users')).find(u => u.name.endsWith(uid))?.fields?.setups ?? {}), { timeout: 15_000 }).toContain('"ifaa"');

  const start = async (fmtName: string) => {
    await page.goto('/');
    await page.getByRole('navigation').getByRole('button', { name: 'target' }).click();
    await page.getByTestId('animal-tile').click();
    await page.getByTestId('animal-format').getByRole('radio', { name: fmtName }).click();
    await page.getByRole('button', { name: 'Training', exact: true }).click();
  };
  const keypad = page.getByTestId('animal-keypad');
  const bar = page.getByTestId('animal-bar');

  // Hunting: Vital 16, potem Miss (od razu dalej), potem Kill 20.
  await start('IFAA 3D Jagd');
  await expect(keypad.getByRole('button', { name: 'Vital 16' })).toBeVisible();
  // Bez surowych kluczy i18n (np. „animal.vital”) na klawiaturze i pasku wyniku.
  await expect(keypad).not.toContainText('animal.');
  await expect(page.getByRole('main')).not.toContainText('animal.');
  await keypad.getByRole('button', { name: 'Vital 16' }).click();
  await page.waitForTimeout(800);
  await keypad.getByRole('button', { name: 'Miss' }).click();
  await page.waitForTimeout(800);
  await expect(bar).toContainText('Tier 3/28');
  await keypad.getByRole('button', { name: 'Kill 20' }).click();
  await page.waitForTimeout(800);
  await expect(page.getByRole('main')).toContainText(/Gesamtringzahl\s*36/);
  await page.getByRole('button', { name: 'Trainingseinheit speichern' }).click();
  await page.getByRole('button', { name: /^Als unvollständig markieren/ }).click();
  await expect(page.getByRole('button', { name: /^Zuletzt 36/ })).toBeVisible();

  // Standard: trafienie nie zamyka, po 2 strzałach dalej; obie się liczą.
  await start('IFAA 3D 2 Pfeile');
  await keypad.getByRole('button', { name: 'Kill 10' }).click();
  await page.waitForTimeout(800);
  await expect(bar).toContainText('Tier 1/28'); // nadal to samo zwierzę
  await keypad.getByRole('button', { name: 'Vital 8' }).click();
  await page.waitForTimeout(800);
  await expect(bar).toContainText('Tier 2/28');
  await keypad.getByRole('button', { name: 'Miss' }).click();
  await keypad.getByRole('button', { name: 'Wound 5' }).click();
  await page.waitForTimeout(800);
  await expect(page.getByRole('main')).toContainText(/Gesamtringzahl\s*23/);
  await page.screenshot({ path: test.info().outputPath('ifaa-3d-std.png') });
  await page.getByRole('button', { name: 'Trainingseinheit speichern' }).click();
  await page.getByRole('button', { name: /^Als unvollständig markieren/ }).click();
  await expect(page.getByRole('button', { name: /^Zuletzt 23/ })).toBeVisible();
  await syncWrites(page);
  const ss = (await adminListDocs(request, `users/${uid}/sessions`)).map(d => d.fields).sort((a: any, b: any) => Number(a.score.integerValue) - Number(b.score.integerValue));
  expect(ss.map((f: any) => f.targetType.stringValue)).toEqual(['IFAA 3D Standard', 'IFAA 3D Hunting']);
  expect(ss[0].ends.arrayValue.values.map((v: any) => v.mapValue.fields.arrows.arrayValue.values.map((a: any) => a.stringValue).join(','))).toEqual(['10,8', 'M,5']);
  await expectNoErrors(page, errors, 'IFAA 3D');
});
