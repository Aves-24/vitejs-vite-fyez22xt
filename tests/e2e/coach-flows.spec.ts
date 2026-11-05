import { test, expect, type Page, type Browser } from '@playwright/test';
import { resetEmulators, registerUser, linkCoachAndStudent, shoot, watchErrors, expectNoErrors, newUserPage, closeUserPages } from './helpers';

// Ścieżki trenera z zapisem, sprawdzane po stronie ucznia (dwa konta naraz):
// grupa + temat treningu, komentarz trenera do treningu ucznia.
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

test('grupa i temat treningu: uczeń widzi temat na Home i w Tagebuchu', async ({ browser }) => {
  test.setTimeout(120_000);
  const { coach, student, coachErrors, studentErrors } = await setup(browser);

  // Nowa grupa + uczeń w grupie (Einst. trenera).
  await coachNav(coach, 'folder_shared Gruppen').click();
  await coach.getByRole('button', { name: 'Gruppe erstellen' }).click();
  await coach.getByPlaceholder('Z.B. Anfänger, Kader...').fill('Kader');
  await coach.getByRole('button', { name: 'Speichern', exact: true }).click();
  await expect(coach.getByRole('button', { name: /folder_shared Kader 0 Schüler/ })).toBeVisible();
  await coach.getByRole('button', { name: 'person_add Hinzufügen' }).click();
  await coach.getByRole('button', { name: 'check Uczen' }).click();
  await coach.getByRole('button', { name: 'Hinzufügen (1)' }).click();
  await expect(coach.getByRole('button', { name: /folder_shared Kader 1 Schüler/ })).toBeVisible();

  // Temat na dziś.
  await coachNav(coach, 'folder_shared Gruppen').click();
  await coach.getByRole('button', { name: 'add Thema' }).click();
  await coach.getByPlaceholder('z. B. Ellenbogenrotation im Vollauszug').fill('Schulter tief');
  await coach.getByPlaceholder('Was genau wir machen, worauf wir achten…').fill('Spiegelübung, 3 × 6 Pfeile');
  await coach.getByRole('button', { name: 'Speichern', exact: true }).click();
  await expect(coach.getByRole('main').getByText('Schulter tief').first()).toBeVisible();
  await expectNoErrors(coach, coachErrors, 'trener: grupa + temat');

  // Uczeń: temat dnia na Home (po przeładowaniu) i w Tagebuchu.
  await student.reload();
  await expect(student.getByRole('main').getByText('Schulter tief').first()).toBeVisible();
  await student.getByRole('navigation').getByRole('button', { name: /Tagebuch$/ }).click();
  await expect(student.getByRole('main').getByText('Schulter tief').first()).toBeVisible();
  await expectNoErrors(student, studentErrors, 'uczeń: temat');
});

test('komentarz trenera do treningu trafia do Tagebucha ucznia', async ({ browser }) => {
  test.setTimeout(120_000);
  const { coach, student, coachErrors, studentErrors } = await setup(browser);

  // Uczeń strzela trening.
  await student.getByRole('navigation').getByRole('button', { name: 'target' }).click();
  await student.getByRole('button', { name: 'Training', exact: true }).click();
  await shoot(student, ['X', '10', '9', '9', '8', '7']);
  await student.getByRole('button', { name: 'Trainingseinheit speichern' }).click();
  await student.getByRole('button', { name: /^Als unvollständig markieren/ }).click();
  await expect(student.getByRole('button', { name: /^Zuletzt 53/ })).toBeVisible();

  // Trener: profil ucznia → komentarz do ostatniego treningu.
  await coachNav(coach, 'group Schüler').click();
  await coach.getByRole('main').getByText('Uczen').first().click();
  await coach.getByRole('button', { name: /Vollständiges Schülerprofil/ }).click();
  await coach.getByPlaceholder('Kurzen Hinweis für den Schüler eingeben...').fill('Super Gold-Gruppe!');
  await coach.getByRole('button', { name: 'Speichern', exact: true }).click();
  await expect(coach.getByPlaceholder('Kurzen Hinweis für den Schüler eingeben...')).toHaveValue('Super Gold-Gruppe!');
  await expectNoErrors(coach, coachErrors, 'trener: komentarz');

  // Uczeń: komentarz w Tagebuchu przy treningu.
  await student.reload();
  await student.getByRole('navigation').getByRole('button', { name: /Tagebuch$/ }).click();
  const entry = student.getByRole('button', { name: /Training 18m 53 Ringe/ });
  await expect(entry).toBeVisible();
  await expect(student.getByRole('main')).toContainText('Super Gold-Gruppe!', { timeout: 3000 }).catch(async () => {
    await entry.click();
    await expect(student.getByRole('main')).toContainText('Super Gold-Gruppe!');
  });
  await expectNoErrors(student, studentErrors, 'uczeń: komentarz');
});
