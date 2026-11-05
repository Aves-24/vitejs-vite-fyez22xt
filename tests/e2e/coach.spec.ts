import { test, expect } from '@playwright/test';
import { resetEmulators, registerUser, nav, newUserPage, closeUserPages } from './helpers';

// Trener i uczeń w dwóch osobnych przeglądarkach (dwa konta naraz):
// trener włącza tryb trenera → dodaje ucznia po ID → uczeń akceptuje
// zaproszenie → trener widzi ucznia w swoim panelu.
test.beforeEach(async ({ request }) => resetEmulators(request));
test.afterEach(() => closeUserPages());

test('trener dodaje ucznia, uczeń akceptuje zaproszenie', async ({ browser }) => {
  const coach = await newUserPage(browser);
  const student = await newUserPage(browser);

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

  // Zakładka Schüler (pusta lista) → „Schüler hinzufügen” → ID ucznia zamiast QR.
  await coach.getByRole('main').getByRole('button', { name: /^person_add Schüler hinzufügen 0\/1$/ }).click();
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

  // Świeżo dodany uczeń NIE jest „bez treningu od 14+ dni” — liczy się od dołączenia.
  await coach.getByRole('navigation').getByRole('button', { name: 'space_dashboard Übersicht' }).click();
  await expect(coach.getByRole('heading', { name: 'Trainer-Panel' })).toBeVisible();
  await coach.waitForTimeout(1500);
  await expect(coach.getByRole('button', { name: /Ohne Training seit 14\+ Tagen/ })).toHaveCount(0);
  // Kropka „nowy” / data dołączenia przetrwa przeładowanie.
  await coach.reload();
  await coach.getByRole('navigation').getByRole('button', { name: 'sports Trainer' }).click().catch(() => {});
  await expect(coach.getByRole('heading', { name: 'Trainer-Panel' })).toBeVisible();
  await coach.waitForTimeout(1500);
  await expect(coach.getByRole('button', { name: /Ohne Training seit 14\+ Tagen/ })).toHaveCount(0);
});
