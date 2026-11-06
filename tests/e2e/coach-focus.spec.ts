import { test, expect, type Page, type Browser } from '@playwright/test';
import { resetEmulators, registerUser, linkCoachAndStudent, shoot, watchErrors, expectNoErrors, newUserPage, closeUserPages, syncWrites, reloadAfterSync } from './helpers';

// Fokus ustawiany przez trenera: trener → profil ucznia → „Neuer Fokus”;
// uczeń widzi go na Home i liczy trening pod fokus.
test.beforeEach(async ({ request }) => resetEmulators(request));
test.afterEach(() => closeUserPages());

const coachNav = (page: Page, name: string) => page.getByRole('navigation').getByRole('button', { name, exact: true });

async function setup(browser: Browser) {
  const coach = await newUserPage(browser);
  const student = await newUserPage(browser);
  const coachErrors = watchErrors(coach);
  const studentErrors = watchErrors(student);
  await registerUser(coach, 'Trenerka');
  const studentId = await registerUser(student, 'Uczen');
  await linkCoachAndStudent(coach, student, studentId, 'Trenerka');
  return { coach, student, coachErrors, studentErrors };
}

test('fokus od trenera: uczeń widzi go na Home i trening liczy się do fokusu', async ({ browser }) => {
  test.setTimeout(150_000);
  const { coach, student, coachErrors, studentErrors } = await setup(browser);

  // Trener: profil ucznia → pusty fokus → nowy fokus na 3 treningi.
  await coachNav(coach, 'group Schüler').click();
  await coach.getByRole('main').getByText('Uczen').first().click();
  await coach.getByRole('button', { name: /Vollständiges Schülerprofil/ }).click();
  await coach.getByRole('button', { name: /Kein Fokus/ }).click();
  const newBox = coach.getByPlaceholder('Kurz beschreiben, worauf der Schüler sich konzentrieren soll…');
  if (!(await newBox.isVisible().catch(() => false))) await coach.getByRole('button', { name: /Neuer Fokus/ }).click();
  await newBox.fill('Anker konstant halten');
  await coach.getByRole('button', { name: '3', exact: true }).click();
  await coach.getByRole('button', { name: 'Fokus setzen', exact: true }).click();
  await expect(coach.getByText('Anker konstant halten').first()).toBeVisible();
  await expectNoErrors(coach, coachErrors, 'trener: fokus');

  // Uczeń: fokus od trenera na Home.
  await syncWrites(coach);
  await reloadAfterSync(student);
  await expect(student.getByRole('main').getByText('Anker konstant halten').first()).toBeVisible();

  // Trening pod fokus → postęp 1/3 widoczny u ucznia i u trenera.
  await student.getByRole('navigation').getByRole('button', { name: 'target' }).click();
  await student.getByRole('button', { name: 'Training', exact: true }).click();
  await shoot(student, ['10', '10', '9', '9', '8', '8']);
  await student.getByRole('button', { name: 'Trainingseinheit speichern' }).click();
  const unfinished = student.getByRole('button', { name: /^Als unvollständig markieren/ });
  if (await unfinished.isVisible().catch(() => false)) await unfinished.click();
  await expectNoErrors(student, studentErrors, 'uczeń: trening pod fokus');
  await syncWrites(student);

  await student.getByRole('navigation').getByRole('button', { name: /Tagebuch$/ }).click();
  await expect(student.getByRole('main').getByText('Anker konstant halten').first()).toBeVisible();
  await expectNoErrors(student, studentErrors, 'uczeń: Tagebuch');
});

test('wiadomość ✉ do całej grupy dochodzi do ucznia', async ({ browser }) => {
  test.setTimeout(150_000);
  const { coach, student, coachErrors, studentErrors } = await setup(browser);

  await coachNav(coach, 'folder_shared Gruppen').click();
  await coach.getByRole('button', { name: 'Gruppe erstellen' }).click();
  await coach.getByPlaceholder('Z.B. Anfänger, Kader...').fill('Kader');
  await coach.getByRole('button', { name: 'Speichern', exact: true }).click();
  await coach.getByRole('button', { name: 'person_add Hinzufügen' }).click();
  await coach.getByRole('button', { name: 'check Uczen' }).click();
  await coach.getByRole('button', { name: 'Hinzufügen (1)' }).click();
  await expect(coach.getByRole('button', { name: /folder_shared Kader 1 Schüler/ })).toBeVisible();

  // Lista grup → ✉ przy grupie.
  await coachNav(coach, 'folder_shared Gruppen').click();
  await coach.getByRole('button', { name: 'Nachricht an die ganze Gruppe' }).first().click();
  await expect(coach.getByText(/Kader · 1/)).toBeVisible();
  await coach.getByPlaceholder('Benachrichtigungstitel').fill('Training fällt aus');
  await coach.getByPlaceholder('Nachrichteninhalt...').fill('Halle gesperrt, wir sehen uns Freitag.');
  await coach.getByRole('button', { name: /Senden an 1 Schüler/ }).click();
  await expect(coach.getByPlaceholder('Benachrichtigungstitel')).toHaveCount(0);
  await expectNoErrors(coach, coachErrors, 'trener: wiadomość do grupy');

  // Trener: ✉ grupy jeszcze raz → na dole „Gesendet an Kader” z tą wiadomością.
  await coach.getByRole('button', { name: 'Nachricht an die ganze Gruppe' }).first().click();
  await coach.getByRole('button', { name: /Gesendet an Kader/ }).click();
  const sentList = coach.getByTestId('coach-sent-list');
  await expect(sentList).toContainText('Training fällt aus');
  await expect(sentList).toContainText('Kader · 1 Schüler');
  await coach.screenshot({ path: process.env.TEMP + '/dm/msg-modal.png' });
  await coach.getByRole('dialog').getByRole('button', { name: /close|Abbrechen/ }).first().click();
  await expectNoErrors(coach, coachErrors, 'trener: wysłane');

  // Uczeń: powiadomienie w dzwoneczku → treść wiadomości.
  await syncWrites(coach);
  await reloadAfterSync(student);
  await student.getByRole('button', { name: /notifications/ }).first().click();
  await expect(student.getByText('Training fällt aus').first()).toBeVisible();
  await student.getByText('Training fällt aus').first().click();
  await expect(student.getByText('Halle gesperrt, wir sehen uns Freitag.').first()).toBeVisible();
  await expectNoErrors(student, studentErrors, 'uczeń: wiadomość od trenera');
});
