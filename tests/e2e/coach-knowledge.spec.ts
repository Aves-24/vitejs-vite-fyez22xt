import { test, expect, type Page, type Browser } from '@playwright/test';
import { resetEmulators, registerUser, linkCoachAndStudent, watchErrors, expectNoErrors, newUserPage, closeUserPages } from './helpers';

test.beforeEach(async ({ request }) => resetEmulators(request));
test.afterEach(() => closeUserPages());

const coachNav = (page: Page, name: string) => page.getByRole('navigation').getByRole('button', { name, exact: true });

async function coachWithGroup(browser: Browser) {
  const coach = await newUserPage(browser);
  const student = await newUserPage(browser);
  const errors = watchErrors(coach);
  await registerUser(coach, 'Trenerka');
  const sid = await registerUser(student, 'Uczen');
  await linkCoachAndStudent(coach, student, sid, 'Trenerka');
  await coachNav(coach, 'folder_shared Gruppen').click();
  await coach.getByRole('button', { name: 'Gruppe erstellen' }).click();
  await coach.getByPlaceholder('Z.B. Anfänger, Kader...').fill('Kader');
  await coach.getByRole('button', { name: 'Speichern', exact: true }).click();
  await coach.getByRole('button', { name: 'person_add Hinzufügen' }).click();
  await coach.getByRole('button', { name: 'check Uczen' }).click();
  await coach.getByRole('button', { name: 'Hinzufügen (1)' }).click();
  await expect(coach.getByRole('button', { name: /folder_shared Kader 1 Schüler/ })).toBeVisible();
  return { coach, errors };
}

const dayKey = (offset: number) => {
  const d = new Date(); d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// [WISSEN] Temat z linkiem z planu grupy → baza wiedzy: kategoria, link (Kopieren),
// trening z opisem, a „Ins nächste Training” otwiera okienko tematu z tym linkiem.
test('Wissen: temat z planu, kopiowanie linku i link do następnego treningu', async ({ browser }) => {
  test.setTimeout(150_000);
  const { coach, errors } = await coachWithGroup(browser);
  await coach.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await coachNav(coach, 'folder_shared Gruppen').click();

  // Jutrzejszy (zaplanowany) trening z tematem Klickerkontrolle, opisem i linkiem.
  await coach.getByRole('button', { name: 'add Thema' }).click();
  await coach.locator('input[type="date"]').fill(dayKey(1));
  await coach.getByPlaceholder('z. B. Ellenbogenrotation im Vollauszug').fill('Klicker halten');
  await coach.getByPlaceholder('Was genau wir machen, worauf wir achten…').fill('Klick aus dem Rücken, nicht aus dem Arm.');
  await coach.getByRole('button', { name: 'Zielen & Expansion' }).click();
  await coach.getByRole('button', { name: 'Klickerkontrolle' }).click();
  await coach.getByPlaceholder('https://… (YouTube oder Webseite)').first().fill('https://example.com/klicker');
  await coach.getByRole('button', { name: 'Speichern', exact: true }).click();
  await expect(coach.getByRole('heading', { name: 'Trainingsthema' })).toBeHidden();

  // Baza wiedzy: lista → temat.
  await coachNav(coach, 'local_library Wissen').click();
  await expect(coach.getByText('1 Thema · 1 Link')).toBeVisible();
  await expect(coach.getByRole('heading', { name: 'Zielen & Expansion' })).toBeVisible();
  await coach.getByRole('button', { name: /Klickerkontrolle/ }).click();
  await expect(coach.getByRole('heading', { name: 'Klickerkontrolle' })).toBeVisible();
  await expect(coach.getByText('https://example.com/klicker')).toBeVisible();
  await expect(coach.getByText(/1× verwendet/)).toBeVisible();
  await expect(coach.getByText('Klicker halten')).toBeVisible();
  await expect(coach.getByText('Klick aus dem Rücken, nicht aus dem Arm.')).toBeVisible();

  await coach.getByRole('button', { name: 'content_copy Kopieren' }).click();
  await expect(coach.getByRole('button', { name: 'check Kopiert' })).toBeVisible();
  expect(await coach.evaluate(() => navigator.clipboard.readText())).toBe('https://example.com/klicker');

  // Jedna grupa, dziś bez tematu → od razu okienko tematu na dziś z linkiem i tematem.
  await coach.getByRole('button', { name: 'add Ins nächste Training' }).click();
  await expect(coach.getByRole('heading', { name: 'Trainingsthema' })).toBeVisible();
  await expect(coach.locator('input[type="date"]')).toHaveValue(dayKey(0));
  await expect(coach.getByPlaceholder('https://… (YouTube oder Webseite)').first()).toHaveValue('https://example.com/klicker');
  await coach.getByPlaceholder('z. B. Ellenbogenrotation im Vollauszug').fill('Klicker wiederholen');
  await coach.getByRole('button', { name: 'Speichern', exact: true }).click();
  await expect(coach.getByRole('heading', { name: 'Trainingsthema' })).toBeHidden();

  // Ten sam temat (wybrany sam) i ten sam link — teraz 2 treningi, link 2×.
  await expect(coach.getByText(/2× verwendet/)).toBeVisible();
  await expect(coach.getByText('Klicker wiederholen')).toBeVisible();
  await expect(coach.getByText('Klicker halten')).toBeVisible();
  await coach.screenshot({ path: 'test-results/wissen/topic.png' });

  // Dziś link już jest → wybór treningu z informacją zamiast okienka.
  await coach.getByRole('button', { name: 'add Ins nächste Training' }).click();
  await expect(coach.getByText('Link ist schon drin')).toBeVisible();
  await coach.getByRole('button', { name: 'Abbrechen' }).click();

  // Szukajka na liście.
  await coach.getByRole('button', { name: 'Zurück', exact: true }).click();
  await coach.screenshot({ path: 'test-results/wissen/list.png' });

  // Podkategorie: klik w kategorię rozwija jej tematy, też te bez treningów.
  await coach.getByRole('button', { name: /Zielen & Expansion/ }).click();
  await expect(coach.getByRole('button', { name: 'Klickerkontrolle 2×' })).toBeVisible();
  await expect(coach.getByRole('button', { name: 'Atemtechnik', exact: true })).toBeVisible();
  await coach.screenshot({ path: 'test-results/wissen/subtopics.png' });
  await coach.getByRole('button', { name: 'Atemtechnik', exact: true }).click();
  await expect(coach.getByRole('heading', { name: 'Atemtechnik' })).toBeVisible();
  await expect(coach.getByText('Noch keine Trainings zu diesem Thema.')).toBeVisible();
  await coach.getByRole('button', { name: 'Zurück', exact: true }).click();
  await coach.getByRole('button', { name: 'Klickerkontrolle 2×' }).click();
  await expect(coach.getByText('Klicker halten')).toBeVisible();
  await coach.getByRole('button', { name: 'Zurück', exact: true }).click();
  await coach.getByRole('button', { name: /Alle/ }).first().click();
  await coach.getByPlaceholder('Thema, Link oder Notiz suchen').fill('rücken');
  await expect(coach.getByRole('button', { name: /Klickerkontrolle/ })).toBeVisible();
  await coach.getByPlaceholder('Thema, Link oder Notiz suchen').fill('xyz');
  await expect(coach.getByText('Nichts gefunden.')).toBeVisible();
  await expectNoErrors(coach, errors, 'Wissen');
});
