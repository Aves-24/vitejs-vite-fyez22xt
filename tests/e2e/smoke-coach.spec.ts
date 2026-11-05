import { test, expect, type Page } from '@playwright/test';
import { resetEmulators, registerUser, nav, watchErrors, expectNoErrors, shoot, linkCoachAndStudent, newUserPage, closeUserPages } from './helpers';

// Test dymny trenera: uczeń z jednym treningiem + trener z tym uczniem,
// potem każdy ekran panelu trenera i profilu ucznia — bez wyjątków JS,
// ekranu błędu i odrzuceń reguł Firestore.
test.beforeEach(async ({ request }) => resetEmulators(request));
test.afterEach(() => closeUserPages());

const coachNav = (page: Page, name: string) => page.getByRole('navigation').getByRole('button', { name, exact: true });

test('trener: wszystkie ekrany panelu i profil ucznia bez błędów', async ({ browser }) => {
  test.setTimeout(150_000);
  const coach = await newUserPage(browser);
  const student = await newUserPage(browser);
  const coachErrors = watchErrors(coach);
  const studentErrors = watchErrors(student);

  await registerUser(coach, 'Trenerka');
  const studentId = await registerUser(student, 'Uczen');

  // Uczeń: jeden trening, żeby trener miał co oglądać.
  await student.getByRole('navigation').getByRole('button', { name: 'target' }).click();
  await student.getByRole('button', { name: 'Training', exact: true }).click();
  await shoot(student, ['X', '10', '9', '9', '8', '7']);
  await student.getByRole('button', { name: 'Trainingseinheit speichern' }).click();
  await student.getByRole('button', { name: /^Als unvollständig markieren/ }).click();
  await expect(student.getByRole('button', { name: /^Zuletzt 53/ })).toBeVisible();

  await linkCoachAndStudent(coach, student, studentId, 'Trenerka');
  await expectNoErrors(student, studentErrors, 'uczeń po akceptacji');

  const visit = async (step: string, action: () => Promise<unknown>) => {
    await action();
    await coach.waitForTimeout(1200);
    await expectNoErrors(coach, coachErrors, step);
  };

  await visit('Übersicht', () => coachNav(coach, 'space_dashboard Übersicht').click());
  await visit('Termine', () => coachNav(coach, 'event_note Termine').click());
  await visit('Gruppen', () => coachNav(coach, 'folder_shared Gruppen').click());
  await visit('Einst.', () => coachNav(coach, 'settings Einst.').click());
  await visit('Schüler', () => coachNav(coach, 'group Schüler').click());

  // Szybki podgląd ucznia (arkusz) → pełny profil i jego zakładki.
  await visit('Podgląd ucznia', () => coach.getByRole('main').getByText('Uczen').first().click());
  // Dystans treningu ucznia w podglądzie: 18m (wcześniej szybki start dawał 10 m dmuchawki).
  await expect(coach.getByText(/Heute · 18m · 53 Pkt/).first()).toBeVisible();
  await visit('Profil ucznia', () => coach.getByRole('button', { name: /Vollständiges Schülerprofil/ }).click());
  await expect(coach.getByRole('heading', { name: 'Uczen', level: 1 })).toBeVisible();
  await expect(coach.getByText(/\d{1,2}\.\d{1,2}\.\d{4} · 18m/).first()).toBeVisible();
  for (const tab of ['edit_note Tagebuch', 'monitoring Analytik', 'space_dashboard Aktuell']) {
    await visit(`Profil/${tab}`, () => coach.getByRole('button', { name: tab, exact: true }).click());
  }
  // Okienka z nagłówka profilu: sprzęt, notatka trenera, fokus.
  for (const name of ['Ausrüstungskarte', 'Trainer-Notiz', /^center_focus_strong Fokus/]) {
    await visit(`Profil/${name}`, () => coach.getByRole('button', { name, exact: typeof name === 'string' }).click());
    await coach.goBack();
    await expect(coach.getByRole('heading', { name: 'Uczen', level: 1 })).toBeVisible();
  }
  await visit('Profil/Statistik', () => coach.getByRole('button', { name: /Detaillierte Statistik anzeigen/ }).click());
  await coach.getByRole('button', { name: 'arrow_back' }).first().click();

  // Przełącznik z powrotem do trybu zawodnika.
  await visit('Schüler', () => coachNav(coach, 'group Schüler').click());
  await visit('Schütze', () => coachNav(coach, 'target Schütze').click());
  await visit('Kalender (Schütze)', () => nav(coach, 'Kalender').click());
});
