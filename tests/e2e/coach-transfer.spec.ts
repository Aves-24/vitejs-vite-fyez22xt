import { test, expect, type Page } from '@playwright/test';
import {
  resetEmulators, registerUser, linkCoachAndStudent, watchErrors, expectNoErrors, newUserPage, closeUserPages, nav, adminListDocs,
} from './helpers';

// Przekazanie ucznia innemu trenerowi (trzy konta naraz): stary trener →
// nowy trener przyjmuje → uczeń świadomie się zgadza → stary traci dostęp,
// nowy widzi ucznia i notatkę, dowód zgody zostaje w bazie.
test.beforeEach(async ({ request }) => resetEmulators(request));
test.afterEach(() => closeUserPages());

const coachNav = (page: Page, name: string) => page.getByRole('navigation').getByRole('button', { name, exact: true });

// Einst. trenera → Schülerliste → ikonka ⇄ przy uczniu (user 2026-11-05: tutaj).
async function openTransfer(page: Page) {
  await coachNav(page, 'settings Einst.').click();
  await page.getByRole('button', { name: /Schülerliste \(1\)/ }).click();
  await page.getByRole('button', { name: 'Schüler übergeben', exact: true }).click();
}

async function enableCoachMode(page: Page) {
  await nav(page, 'Einst.').click();
  await page.getByRole('button', { name: /^TRAINER/ }).click();
  await page.getByRole('button', { name: /Trainermodus aktivieren/ }).click();
  await expect(page.getByText(/Plätze: 0\/1/)).toBeVisible();
  await page.getByRole('navigation').getByRole('button', { name: 'sports Trainer' }).click();
}

test('przekazanie ucznia: wniosek, przyjęcie, zgoda ucznia, stary trener traci dostęp', async ({ browser, request }) => {
  test.setTimeout(150_000);
  const oldCoach = await newUserPage(browser);
  const newCoach = await newUserPage(browser);
  const student = await newUserPage(browser);
  const errs = [watchErrors(oldCoach), watchErrors(newCoach), watchErrors(student)];

  await registerUser(oldCoach, 'Anna');
  const newCoachId = await registerUser(newCoach, 'Bert');
  const studentId = await registerUser(student, 'Uczen');
  await linkCoachAndStudent(oldCoach, student, studentId, 'Anna');
  await enableCoachMode(newCoach);

  // 1. Stary trener: podgląd ucznia → „Schüler übergeben” + notatka.
  await openTransfer(oldCoach);
  const dialog = oldCoach.getByRole('dialog', { name: 'Schüler übergeben' });
  await dialog.getByPlaceholder('Trainer-ID des neuen Trainers').fill(newCoachId);
  await dialog.getByPlaceholder(/Notiz für den neuen Trainer/).fill('Arbeitet am Anker, Knie schonen.');
  await dialog.getByRole('button', { name: 'Anfrage senden' }).click();
  await expect(oldCoach.getByTestId('transfer-pending')).toContainText('Übergabe an Bert · wartet auf Bert');

  // 2. Nowy trener: karta na Übersicht → przyjęcie.
  await coachNav(newCoach, 'space_dashboard Übersicht').click();
  const incoming = newCoach.getByTestId('transfer-incoming');
  await expect(incoming).toContainText('Anna möchte dir Uczen übergeben.');
  await expect(incoming).toContainText('Arbeitet am Anker, Knie schonen.');
  await incoming.getByRole('button', { name: 'Annehmen' }).click();
  await expect(incoming).toContainText('wartet auf Zustimmung von Uczen');

  // 3. Uczeń: okno zgody z pełną informacją; „Zustimmen” dopiero po zaznaczeniu.
  const consent = student.getByRole('dialog', { name: 'Trainerwechsel' });
  await expect(consent).toBeVisible();
  await expect(consent).toContainText('Anna möchte dich an Bert übergeben.');
  await expect(consent).toContainText('Anna verliert den Zugriff auf deine Daten sofort.');
  await expect(consent).toContainText('Arbeitet am Anker, Knie schonen.');
  // Zwykłe okienko zaproszenia trenera NIE pojawia się równolegle.
  await expect(student.getByText(/möchte dich als Trainer beobachten/)).toHaveCount(0);
  const yes = consent.getByRole('button', { name: 'Zustimmen' });
  await expect(yes).toBeDisabled();
  await consent.getByRole('checkbox').check();
  await yes.click();
  await expect(consent).toHaveCount(0);

  // Baza: uczeń ma tylko nowego trenera, dowód zgody zapisany.
  await expect.poll(async () => {
    const u = (await adminListDocs(request, 'users')).find(d => d.name.endsWith(studentId));
    return JSON.stringify(u?.fields?.coaches ?? null);
  }).toBe(JSON.stringify({ arrayValue: { values: [{ stringValue: newCoachId }] } }));
  const transfers = await adminListDocs(request, 'coachTransfers');
  expect(transfers).toHaveLength(1);
  expect(transfers[0].fields.status.stringValue).toBe('done');
  expect(transfers[0].fields.consentVersion.stringValue).toBe('2026-11-05');
  expect(transfers[0].fields.doneAt.timestampValue).toBeTruthy();

  // 4. Nowy trener: uczeń na liście, w podglądzie notatka od poprzednika.
  await coachNav(newCoach, 'group Schüler').click();
  await expect(newCoach.getByRole('heading', { name: 'Alle Schüler (1)' })).toBeVisible();
  await newCoach.getByRole('main').getByRole('heading', { name: 'Uczen', level: 3 }).click();
  await expect(newCoach.getByTestId('transfer-received')).toContainText('Übergeben von Anna');
  await expect(newCoach.getByTestId('transfer-received')).toContainText('Arbeitet am Anker, Knie schonen.');

  // 5. Stary trener: ucznia już nie ma.
  await oldCoach.reload();
  await coachNav(oldCoach, 'sports Trainer').click().catch(() => {});
  await coachNav(oldCoach, 'group Schüler').click();
  await expect(oldCoach.getByRole('heading', { name: 'Alle Schüler (0)' })).toBeVisible();

  for (const [i, p] of [oldCoach, newCoach, student].entries()) await expectNoErrors(p, errs[i], `konto ${i}`);
});

test('przekazanie: uczeń odrzuca — nic się nie zmienia', async ({ browser, request }) => {
  test.setTimeout(150_000);
  const oldCoach = await newUserPage(browser);
  const newCoach = await newUserPage(browser);
  const student = await newUserPage(browser);
  await registerUser(oldCoach, 'Anna');
  const newCoachId = await registerUser(newCoach, 'Bert');
  const studentId = await registerUser(student, 'Uczen');
  await linkCoachAndStudent(oldCoach, student, studentId, 'Anna');
  await enableCoachMode(newCoach);

  await openTransfer(oldCoach);
  await oldCoach.getByPlaceholder('Trainer-ID des neuen Trainers').fill(newCoachId);
  await oldCoach.getByRole('button', { name: 'Anfrage senden' }).click();
  await coachNav(newCoach, 'space_dashboard Übersicht').click();
  await newCoach.getByTestId('transfer-incoming').getByRole('button', { name: 'Annehmen' }).click();

  const consent = student.getByRole('dialog', { name: 'Trainerwechsel' });
  await consent.getByRole('button', { name: 'Ablehnen' }).click();
  await expect(consent).toHaveCount(0);

  await expect.poll(async () => (await adminListDocs(request, 'coachTransfers')).length).toBe(0);
  const u = (await adminListDocs(request, 'users')).find(d => d.name.endsWith(studentId));
  expect(JSON.stringify(u?.fields?.coaches)).not.toContain(newCoachId);
  await expect(oldCoach.getByTestId('transfer-pending')).toHaveCount(0);
});
