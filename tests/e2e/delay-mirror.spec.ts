import { test, expect, type Page } from '@playwright/test';
import { resetEmulators, registerUser, watchErrors, expectNoErrors, homeMenu } from './helpers';

// Delay Mirror w głąb (sztuczna kamera Chromium): nagrywanie z opóźnieniem,
// koniec Passe → strzały na tarczy → powtórka, stopklatka z tarczą,
// znaczniki strzał na osi, zapis treningu technicznego.
test.beforeEach(async ({ request }) => resetEmulators(request));

async function recordEndToReplay(page: Page) {
  // Chromium testowy nagrywa H.264, ale MSE go nie odtwarza (bufor stoi na 0%).
  // Na telefonach działa — tu wymuszamy WebM, który apka ma jako zapas.
  await page.addInitScript(() => {
    const orig = MediaRecorder.isTypeSupported.bind(MediaRecorder);
    (MediaRecorder as any).isTypeSupported = (c: string) => !c.startsWith('video/mp4') && orig(c);
  });
  await registerUser(page, 'Mira');

  // Ustawienia: tryb eksperta (Spiegel + Aufnahme), opóźnienie 2 s.
  await homeMenu(page, /Delay Mirror/);
  await page.getByRole('button', { name: 'tune Expertenmodus' }).click();
  await expect(page.getByRole('button', { name: /Spiegel \+ Aufnahme/ })).toBeVisible();
  await page.getByRole('button', { name: /schedule 15s/ }).click();
  await page.getByRole('slider').fill('2');
  await page.getByRole('button', { name: 'OK', exact: true }).click();
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await page.getByRole('button', { name: 'play_arrow Aufnahme starten' }).click();

  // Bufor się zapełnia → obraz z opóźnieniem (znika „Puffer wird geladen…”).
  await expect(page.getByText('Puffer wird geladen…')).toHaveCount(0, { timeout: 15_000 });
  await expect(page.getByRole('button', { name: 'schedule -2s' })).toBeVisible();
  await page.waitForTimeout(2500); // trochę nagrania

  // Koniec Passe → 6 strzał na tarczy (122 cm, środek ekranu).
  await page.getByRole('button', { name: 'flag Passe beenden Analyse' }).click();
  await expect(page.getByRole('heading', { name: 'Passe beendet' })).toBeVisible();
  await page.getByRole('button', { name: 'Pfeile eintragen' }).click();
  await expect(page.getByText('Wo sitzt Pfeil 1?')).toBeVisible();
  const cx = 206, cy = 424; // środek tarczy w widoku Pixel 7
  for (const dx of [0, 3, -3, 0, 20, -20]) await page.mouse.click(cx + dx, cy);
  await expect(page.getByText('Alle Pfeile eingetragen')).toBeVisible();
  await expect(page.getByText(/Σ60/)).toBeVisible();
  await page.getByRole('button', { name: 'Speichern', exact: true }).click();

  // Powtórka z tarczą.
  await expect(page.getByText('Diese Passe')).toBeVisible();

}


test('Delay Mirror: nagranie, Passe na tarczy, stopklatka, znaczniki, zapis', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = watchErrors(page);
  await recordEndToReplay(page);

  // Stopklatka: klatka + tarcza + „Bild teilen”.
  await page.getByRole('button', { name: 'photo_camera' }).click();
  await expect(page.getByRole('button', { name: 'share Bild teilen' })).toBeVisible();
  await page.getByRole('button', { name: 'arrow_back' }).first().click();
  await expect(page.getByRole('button', { name: 'share Bild teilen' })).toHaveCount(0);

  // Znaczniki strzał na osi + notatka do strzały.
  await page.getByRole('button', { name: 'Pfeile markieren' }).click();
  await page.getByRole('button', { name: 'Pfeil 1' }).click();
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: 'Pfeil 2' }).click();
  await expect(page.getByText('2 von 6 markiert')).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Notiz zu Pfeil 2' })).toBeVisible();
  await page.getByRole('button', { name: 'Fertig' }).click();

  // Koniec sesji → trening techniczny zapisany (6 strzał).
  await page.getByRole('button', { name: 'home' }).click();
  await expect(page.getByText('Gespeichert — du kannst beruhigt beenden')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Technisches Training 6' })).toBeVisible();
  // Strzały trafiły do licznika dnia (Home: Pfeile / Monat).
  await page.getByRole('button', { name: 'arrow_back' }).first().click();
  await expect(page.getByRole('button', { name: /^6 Pfeile \/ Monat/ })).toBeVisible();
  await expectNoErrors(page, errors, 'Delay Mirror');
});

test('Delay Mirror: eksport klipu — samo wideo i z wypaloną tarczą + wycięty fragment', async ({ page }) => {
  test.setTimeout(150_000);
  const errors = watchErrors(page);
  await recordEndToReplay(page);

  // Bez systemowego „Teilen” (headless) klip trafia do pobranych plików.
  await page.getByRole('button', { name: 'share', exact: true }).click();
  await page.getByRole('button', { name: /Nur Video/ }).click();
  const [raw] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'share Teilen', exact: true }).click(),
  ]);
  expect(raw.suggestedFilename()).toMatch(/^GROTX_DelayMirror_.*.webm$/);

  // Z tarczą + wycięty kawałek: klip budowany w czasie rzeczywistym.
  await page.getByRole('button', { name: 'share', exact: true }).click();
  await page.getByRole('button', { name: /Mit Scheibe/ }).click();
  await page.getByRole('button', { name: /Stück herausschneiden/ }).click();
  await expect(page.getByText(/Rot gestreift = wird herausgeschnitten/)).toBeVisible();
  await page.getByRole('button', { name: 'share Teilen', exact: true }).click();
  // Klip powstaje w czasie rzeczywistym, potem drugi gest „Video teilen”
  // (system pozwala otworzyć udostępnianie tylko po dotknięciu).
  await expect(page.getByText('Clip fertig')).toBeVisible({ timeout: 60_000 });
  const [withTarget] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'share Video teilen' }).click(),
  ]);
  expect(withTarget.suggestedFilename()).toMatch(/^GROTX_DelayMirror_.*.webm$/);
  const fs = await import('fs');
  expect(fs.statSync((await withTarget.path())!).size).toBeGreaterThan(10_000);
  await expectNoErrors(page, errors, 'eksport klipu');
});
