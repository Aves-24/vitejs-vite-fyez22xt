import { test, expect } from '@playwright/test';
import { resetEmulators, registerUser, nav, watchErrors, expectNoErrors, reloadAfterSync, adminPatchDoc } from './helpers';

// Ścieżki zawodnika z zapisem do bazy: fokus, trening techniczny, licznik
// strzał, notatka/kamień milowy w Tagebuchu, termin zawodów w Kalendarzu.
// Każda kończy się sprawdzeniem po przeładowaniu (dane z Firestore).
test.beforeEach(async ({ request }) => resetEmulators(request));

test('fokus: ustawienie i widoczność w Tagebuchu', async ({ page }) => {
  const errors = watchErrors(page);
  await registerUser(page, 'Fokus');
  await nav(page, 'Tagebuch').click();
  await page.getByRole('button', { name: /Setz dir einen Fokus/ }).click();

  const save = page.getByRole('button', { name: 'Fokus setzen' });
  await expect(save).toBeDisabled();
  await page.getByPlaceholder('Beschreibe kurz, woran du gerade arbeitest…').fill('Anker ruhig halten');
  await page.getByRole('radio', { name: '3' }).check();
  await page.getByRole('button', { name: 'Lösen & Nachhalten' }).click();
  await save.click();
  await expect(page.getByRole('main').getByText('Anker ruhig halten').first()).toBeVisible();

  await reloadAfterSync(page);
  await nav(page, 'Tagebuch').click();
  await expect(page.getByRole('main').getByText('Anker ruhig halten').first()).toBeVisible();
  await expectNoErrors(page, errors, 'fokus');
});

test('trening techniczny: strzały, temat i notatka trafiają do Tagebucha', async ({ page }) => {
  const errors = watchErrors(page);
  await registerUser(page, 'Technik');
  await page.getByRole('navigation').getByRole('button', { name: 'target' }).click();
  await page.getByRole('button', { name: /Technisches Training/ }).click();

  const dialog = page.getByRole('heading', { name: 'Technisches Training', level: 2 }).locator('xpath=ancestor::div[.//button[normalize-space()="Bestätigen & Speichern"]][1]');
  await dialog.getByRole('button', { name: '+6' }).click();
  await dialog.getByRole('button', { name: '+6' }).click();
  await dialog.getByRole('button', { name: '+1' }).click();
  // Kategoria rozwija podtematy — wybieramy podtemat.
  await dialog.getByRole('button', { name: 'Aufbau & Auszug' }).click();
  await dialog.getByRole('button', { name: 'Bogenarmhaltung', exact: true }).click();
  await page.getByPlaceholder(/Arbeit an der Bogenstabilisierung/).fill('Zugarm hoch');
  await page.getByRole('button', { name: 'Bestätigen & Speichern' }).click();

  await expect(nav(page, 'Start')).toBeVisible();
  await reloadAfterSync(page);
  await nav(page, 'Tagebuch').click();
  const entry = page.getByRole('button', { name: /Techniktraining 13 Pfeile/ });
  await expect(entry).toBeVisible();
  await entry.click();
  await expect(page.getByRole('main')).toContainText('Zugarm hoch');
  await expect(page.getByRole('main')).toContainText('Bogenarmhaltung');
  await expectNoErrors(page, errors, 'technik');
});

test('licznik strzał w Vorbereitung liczy się do „Pfeile / Monat”', async ({ page }) => {
  const errors = watchErrors(page);
  await registerUser(page, 'Zaehler');
  await page.getByRole('navigation').getByRole('button', { name: 'target' }).click();
  await page.getByRole('button', { name: '+6' }).click();
  await page.getByRole('button', { name: '+6' }).click();
  await page.getByRole('button', { name: '−1' }).click();
  await page.getByRole('button', { name: 'Speichern', exact: true }).click();
  await page.getByRole('button', { name: 'arrow_back' }).click();
  await expect(page.getByRole('button', { name: /^11 Pfeile \/ Monat/ })).toBeVisible();
  await reloadAfterSync(page);
  await expect(page.getByRole('button', { name: /^11 Pfeile \/ Monat/ })).toBeVisible();
  await expectNoErrors(page, errors, 'licznik');
});

test('notatka jako kamień milowy w Tagebuchu', async ({ page }) => {
  const errors = watchErrors(page);
  await registerUser(page, 'Notiz');
  await nav(page, 'Tagebuch').click();
  await page.getByRole('button', { name: 'Neue Notiz' }).click();
  const dialog = page.getByRole('dialog', { name: 'Neuer Eintrag' });
  await expect(dialog.getByRole('button', { name: 'Speichern' })).toBeDisabled();
  await dialog.getByPlaceholder('Titel (optional)').fill('Erstes Turnier');
  await dialog.getByPlaceholder('Beschreibung (optional)…').fill('Kreismeisterschaft, Platz 3');
  await dialog.getByRole('switch', { name: /Als Meilenstein markieren/ }).click();
  await dialog.getByRole('button', { name: 'Speichern' }).click();
  await expect(dialog).toHaveCount(0);

  await reloadAfterSync(page);
  await nav(page, 'Tagebuch').click();
  await expect(page.getByRole('main')).toContainText('Erstes Turnier');
  await expectNoErrors(page, errors, 'notatka');
});

test('termin zawodów w Kalendarzu', async ({ page }) => {
  const errors = watchErrors(page);
  await registerUser(page, 'Termin');
  await nav(page, 'Kalender').click();
  await page.getByRole('button', { name: 'Neuer Termin' }).click();

  const d = new Date(Date.now() + 20 * 86400000);
  await page.getByPlaceholder('Name des Turniers').fill('Hallen-Cup');
  await page.getByRole('spinbutton', { name: 'DD' }).fill(String(d.getDate()));
  await page.getByRole('spinbutton', { name: 'MM' }).fill(String(d.getMonth() + 1));
  await page.getByRole('spinbutton', { name: 'YYYY' }).fill(String(d.getFullYear()));
  await page.getByPlaceholder('Stadt / Adresse').fill('Hamburg');
  await page.getByRole('button', { name: 'Termin speichern' }).click();
  await expect(page.getByRole('main')).toContainText('Hallen-Cup');

  await reloadAfterSync(page);
  await nav(page, 'Kalender').click();
  await expect(page.getByRole('main')).toContainText('Hallen-Cup');
  await expectNoErrors(page, errors, 'termin');
});

// Kalendarz zawodnika (2026-11-13): zawody = puchar w żółtym kółku (bez zielonego tła),
// dzień z kilkoma terminami → okienko dnia z podglądem i ołówkiem.
test('kalendarz: puchar zawodów i okienko dnia z kilkoma terminami', async ({ page, request }) => {
  const errors = watchErrors(page);
  const uid = await registerUser(page, 'Kalender');
  const d = new Date();
  const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  await adminPatchDoc(request, `users/${uid}/tournaments/own`, { title: 'Stadtmeisterschaft', date: today, category: 'Turniej' });
  await adminPatchDoc(request, `users/${uid}/tournaments/other`, { title: 'Sehne tauschen', date: today, category: 'Inne' });
  await nav(page, 'Kalender').click();
  await expect(page.getByTestId('own-start-trophy')).toHaveCount(1);
  await page.getByRole('button', { name: `${d.getDate()} emoji_events`, exact: true }).click();
  await expect(page.getByTestId('day-picker-edit')).toHaveCount(2);
  if (process.env.SHOT5) await page.screenshot({ path: process.env.SHOT5 });
  await page.getByTestId('day-picker-edit').first().click();
  await expect(page.getByRole('textbox').first()).toBeVisible();
  await expectNoErrors(page, errors, 'kalendarz');
});
