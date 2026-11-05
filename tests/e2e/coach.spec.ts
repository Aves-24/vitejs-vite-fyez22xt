import { test, expect } from '@playwright/test';
import { resetEmulators, registerUser, nav } from './helpers';

// Trener i uczeń w dwóch osobnych przeglądarkach (dwa konta naraz):
// trener włącza tryb trenera → dodaje ucznia po ID → uczeń akceptuje
// zaproszenie → trener widzi ucznia w swoim panelu.
test.beforeEach(async ({ request }) => resetEmulators(request));

test('trener dodaje ucznia, uczeń akceptuje zaproszenie', async ({ browser }) => {
  const coachCtx = await browser.newContext();
  const studentCtx = await browser.newContext();
  const coach = await coachCtx.newPage();
  const student = await studentCtx.newPage();

  await registerUser(coach, 'Trenerka');
  const studentId = await registerUser(student, 'Uczen');

  // Trener: Ustawienia → włącz tryb trenera (1 miejsce gratis).
  await nav(coach, 'Einst.').click();
  await coach.getByRole('button', { name: /^TRAINER/ }).click();
  await coach.getByRole('button', { name: /Trainermodus aktivieren/ }).click();
  await expect(coach.getByText('Plätze: 0/1')).toBeVisible();

  // W dolnym menu pojawia się „Trainer” → panel trenera.
  await coach.getByRole('navigation').getByRole('button', { name: 'sports Trainer' }).click();
  await expect(coach.getByRole('heading', { name: 'Trainer-Panel' })).toBeVisible();
  await coach.getByRole('navigation').getByRole('button', { name: 'group Schüler' }).click();
  await expect(coach.getByRole('heading', { name: 'Alle Schüler (0)' })).toBeVisible();

  // Ustawienia trenera → „Schüler hinzufügen” → ID ucznia zamiast QR.
  await coach.getByRole('navigation').getByRole('button', { name: 'settings Einst.' }).click();
  await coach.getByRole('button', { name: 'person_add Schüler hinzufügen' }).click();
  await coach.getByPlaceholder('Benutzer-ID einfügen...').fill(studentId);
  await coach.getByRole('button', { name: 'Hinzufügen', exact: true }).click();
  await expect(coach.getByText('Einladung gesendet', { exact: true })).toBeVisible();
  await expect(coach.getByText(/Uczen hat die Einladung erhalten/)).toBeVisible();
  await coach.getByRole('button', { name: 'OK', exact: true }).click();

  // Uczeń: popup zaproszenia (na żywo, bez przeładowania).
  await expect(student.getByText('Trenerka möchte dich als Trainer beobachten.')).toBeVisible();
  await student.getByRole('button', { name: 'Annehmen', exact: true }).click();
  await expect(student.getByText('Trenerka möchte dich als Trainer beobachten.')).toHaveCount(0);

  // Trener widzi ucznia na liście.
  await coach.getByRole('navigation').getByRole('button', { name: 'group Schüler' }).click();
  await expect(coach.getByRole('heading', { name: 'Alle Schüler (1)' })).toBeVisible();
  await expect(coach.getByRole('main').getByText('Uczen').first()).toBeVisible();

  await coachCtx.close();
  await studentCtx.close();
});
