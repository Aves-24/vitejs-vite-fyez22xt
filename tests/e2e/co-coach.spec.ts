import { test, expect, type Page } from '@playwright/test';
import { resetEmulators, registerUser, linkCoachAndStudent, watchErrors, expectNoErrors, newUserPage, closeUserPages, nav } from './helpers';

// Współtrener grupy (3 konta): Haupttrainer zaprasza drugiego trenera, ten
// przyjmuje, uczeń zgadza się na nowego trenera → współtrener widzi ucznia.
test.beforeEach(async ({ request }) => resetEmulators(request));
test.afterEach(() => closeUserPages());

const coachNav = (page: Page, name: string) => page.getByRole('navigation').getByRole('button', { name, exact: true });

async function enableCoachMode(page: Page) {
  await nav(page, 'Einst.').click();
  await page.getByRole('button', { name: /^TRAINER/ }).click();
  await page.getByRole('button', { name: /Trainermodus aktivieren/ }).click();
  await expect(page.getByText(/Plätze: 0\/1/)).toBeVisible();
  await page.getByRole('navigation').getByRole('button', { name: 'sports Trainer' }).click();
}

test('współtrener: zaproszenie do grupy, przyjęcie i zgoda ucznia', async ({ browser }) => {
  test.setTimeout(180_000);
  const head = await newUserPage(browser);
  const co = await newUserPage(browser);
  const student = await newUserPage(browser);
  const headErrors = watchErrors(head);
  const coErrors = watchErrors(co);
  const studentErrors = watchErrors(student);

  await registerUser(head, 'Trenerka');
  const coId = await registerUser(co, 'Kotrener');
  const sid = await registerUser(student, 'Uczen');
  await linkCoachAndStudent(head, student, sid, 'Trenerka');
  await enableCoachMode(co);

  // Haupttrainer: grupa z uczniem.
  await coachNav(head, 'folder_shared Gruppen').click();
  await head.getByRole('button', { name: 'Gruppe erstellen' }).click();
  await head.getByPlaceholder('Z.B. Anfänger, Kader...').fill('Kader');
  await head.getByRole('button', { name: 'Speichern', exact: true }).click();
  await head.getByRole('button', { name: 'person_add Hinzufügen' }).click();
  await head.getByRole('button', { name: 'check Uczen' }).click();
  await head.getByRole('button', { name: 'Hinzufügen (1)' }).click();
  await expect(head.getByRole('button', { name: /folder_shared Kader 1 Schüler/ })).toBeVisible();

  // Zaproszenie współtrenera po ID.
  await head.getByRole('button', { name: 'person_add Einladen' }).click();
  await head.getByPlaceholder('Benutzer-ID einfügen...').fill(coId);
  await head.getByRole('button', { name: 'Hinzufügen', exact: true }).click();
  await expect(head.getByText('Kotrener').first()).toBeVisible();
  await expect(head.getByText('eingeladen').first()).toBeVisible();
  await expectNoErrors(head, headErrors, 'Haupttrainer: zaproszenie');

  // Współtrener przyjmuje zaproszenie.
  await expect(co.getByText(/Trenerka lädt dich als Co-Trainer in die Gruppe »Kader« ein\./)).toBeVisible({ timeout: 20_000 });
  await co.getByRole('button', { name: 'Annehmen', exact: true }).click();
  await expect(co.getByText(/Trenerka lädt dich als Co-Trainer/)).toHaveCount(0);
  await expectNoErrors(co, coErrors, 'współtrener: przyjęcie');

  // Uczeń dostaje prośbę o zgodę od współtrenera i ją przyjmuje.
  await expect(student.getByText('Kotrener betreut jetzt auch deine Gruppe »Kader«.')).toBeVisible({ timeout: 20_000 });
  await student.getByRole('button', { name: 'Annehmen', exact: true }).click();
  await expect(student.getByText('Kotrener betreut jetzt auch deine Gruppe »Kader«.')).toHaveCount(0);
  await expectNoErrors(student, studentErrors, 'uczeń: zgoda na współtrenera');

  // Współtrener widzi ucznia na liście i w grupie.
  await coachNav(co, 'group Schüler').click();
  await expect(co.getByRole('main').getByText('Uczen').first()).toBeVisible({ timeout: 20_000 });
  await coachNav(co, 'folder_shared Gruppen').click();
  await expect(co.getByRole('main').getByText('Kader').first()).toBeVisible();
  await expectNoErrors(co, coErrors, 'współtrener: uczeń widoczny');
});
