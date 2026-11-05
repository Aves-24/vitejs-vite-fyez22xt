import { test, expect, type Page, type Browser } from '@playwright/test';
import { resetEmulators, registerUser, linkCoachAndStudent, watchErrors, expectNoErrors, newUserPage, closeUserPages, syncWrites } from './helpers';

// Termine trenera (stały trening grupy, odwołanie) i czat uczeń ↔ trener.
test.beforeEach(async ({ request }) => resetEmulators(request));
test.afterEach(() => closeUserPages());

const coachNav = (page: Page, name: string) => page.getByRole('navigation').getByRole('button', { name, exact: true });

async function coachWithGroup(browser: Browser) {
  const coach = await newUserPage(browser);
  const student = await newUserPage(browser);
  const coachErrors = watchErrors(coach);
  const studentErrors = watchErrors(student);
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
  return { coach, student, coachErrors, studentErrors };
}

test('stały trening grupy: Termine, Übersicht i odwołanie', async ({ browser }) => {
  test.setTimeout(120_000);
  const { coach, coachErrors } = await coachWithGroup(browser);

  // Dziś, późnym wieczorem — trening zawsze „przed nami”.
  const today = new Date().toLocaleDateString('de-DE', { weekday: 'long' });
  await coach.getByRole('button', { name: /Regelmäßiges Training/ }).click();
  await coach.getByRole('combobox', { name: 'Termine' }).selectOption({ label: today });
  await coach.getByRole('textbox', { name: 'Uhrzeit' }).fill('23:30');
  await coach.getByPlaceholder('z. B. Halle').fill('Halle Nord');
  await coach.getByRole('button', { name: 'Speichern', exact: true }).click();
  await expect(coach.getByText('Trainingszeit gespeichert')).toBeVisible();

  // Termine: 4 tygodnie po jednym treningu.
  await coachNav(coach, 'event_note Termine').click();
  const sessions = coach.getByRole('button', { name: /Kader Plan schedule 23:30 · Halle Nord/ });
  await expect(sessions).toHaveCount(4);

  // Übersicht: dzisiejszy trening na górze.
  await coachNav(coach, 'space_dashboard Übersicht').click();
  await expect(coach.getByRole('heading', { name: 'Heute Training um 23:30' })).toBeVisible();

  // Odwołanie pierwszego terminu.
  await coachNav(coach, 'event_note Termine').click();
  await coach.getByRole('button', { name: 'Absagen' }).first().click();
  await coach.waitForTimeout(800);
  const confirm = coach.getByRole('button', { name: /absagen|bestätigen/i }).last();
  if (await confirm.isVisible().catch(() => false)) await confirm.click();
  await syncWrites(coach);
  await coachNav(coach, 'space_dashboard Übersicht').click();
  await expect(coach.getByRole('heading', { name: 'Heute Training um 23:30' })).toHaveCount(0);
  await expectNoErrors(coach, coachErrors, 'Termine');
});

test('czat: uczeń pisze do trenera, trener odpowiada', async ({ browser }) => {
  test.setTimeout(120_000);
  const { coach, student, coachErrors, studentErrors } = await coachWithGroup(browser);

  await student.getByRole('navigation').getByRole('button', { name: /Tagebuch$/ }).click();
  await student.getByRole('button', { name: /Chat mit Trainer/ }).click();
  await student.getByPlaceholder('Nachricht schreiben…').fill('Hallo, kann ich morgen kommen?');
  await student.getByRole('button', { name: 'send' }).click();
  await expect(student.locator('p', { hasText: 'Hallo, kann ich morgen kommen?' })).toBeVisible();

  // Trener: lista uczniów → czat z uczniem.
  await coachNav(coach, 'group Schüler').click();
  await coach.getByRole('main').getByRole('button', { name: 'chat' }).first().click();
  await expect(coach.locator('p', { hasText: 'Hallo, kann ich morgen kommen?' })).toBeVisible();
  await coach.getByPlaceholder(/Nachricht/).fill('Ja, gerne!');
  await coach.getByRole('button', { name: 'send' }).click();
  await expect(coach.locator('p', { hasText: 'Ja, gerne!' })).toBeVisible();

  // Uczeń widzi odpowiedź na żywo.
  await expect(student.locator('p', { hasText: 'Ja, gerne!' })).toBeVisible();
  await expectNoErrors(coach, coachErrors, 'czat trener');
  await expectNoErrors(student, studentErrors, 'czat uczeń');
});
