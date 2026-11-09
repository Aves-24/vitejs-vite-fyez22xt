import { test, expect, type Page } from '@playwright/test';
import { resetEmulators, registerUser, shoot, watchErrors, expectNoErrors, syncWrites } from './helpers';

// [HOME 2026-11-06] Nowa strona startowa: pierścień stref z ostatnich treningów
// (PRO), ikonka (i) z dymkiem, klik → PRO Progress z kartą „Trefferzonen”,
// wykres formy od 3 treningów, Schnellstatistik z przełącznikiem Pfeile/Ringe.
test.beforeEach(async ({ request }) => resetEmulators(request));

async function training(page: Page, arrows: string[]) {
  await page.getByRole('navigation').getByRole('button', { name: 'target' }).click();
  await page.getByRole('button', { name: 'Training', exact: true }).click();
  await shoot(page, arrows);
  await page.getByRole('button', { name: 'Trainingseinheit speichern' }).click();
  await page.getByRole('button', { name: /^Als unvollständig markieren/ }).click();
  await expect(page.getByRole('button', { name: /^Zuletzt/ })).toBeVisible();
}

test('Home: pierścień stref, (i), forma i przejście do Trefferzonen', async ({ page }) => {
  test.setTimeout(150_000);
  const errors = watchErrors(page);
  await registerUser(page, 'Zonen');

  // Przed treningami: bez pierścienia (brak danych), bez wykresu formy.
  await expect(page.getByTestId('home-zones')).toBeVisible();
  await expect(page.getByTestId('home-zones-info')).toHaveCount(0);
  await expect(page.getByTestId('home-form')).toHaveCount(0);

  // Strefy: Gold = X/10/9, Rot = 8/7, Blau = 6/5 …, M = pudło.
  await training(page, ['X', '10', '9', '9', '8', '7']);
  await training(page, ['10', '9', '8', '7', '6', 'M']);
  // Po 2 treningach forma jeszcze nie (od 3).
  await expect(page.getByTestId('home-form')).toHaveCount(0);
  await training(page, ['9', '9', '8', '8', '7', '6']);
  const rank = page.getByRole('button', { name: 'Super', exact: true });
  if (await rank.isVisible({ timeout: 5_000 }).catch(() => false)) await rank.click();
  await syncWrites(page);

  // 18 strzał: Gold 8 (44 %), Rot 7 (39 %), Blau 2 (11 %), M 1 (6 %).
  const zones = page.getByTestId('home-zones');
  await expect(zones).toHaveAttribute('aria-label', /letzte 3 Trainings: Gold 44 %, \S+ 39 %, \S+ 11 %, M 6 %/);
  // Konto z trialem PRO → pierścień (SVG), nie samo „Gold %”.
  await expect(zones.locator('svg circle')).toHaveCount(4); // tor + 3 kolory (M = pusta szara część)
  await expect(page.getByTestId('home-form')).toContainText('letzte 3 Trainings');

  // (i) → dymek, sam znika.
  await page.getByTestId('home-zones-info').click();
  await expect(page.getByRole('status').filter({ hasText: 'Basiert auf den letzten 3 Trainings' })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'Basiert auf den letzten 3 Trainings' })).toHaveCount(0, { timeout: 6_000 });
  await page.screenshot({ path: test.info().outputPath('home.png') });

  // Klik w pierścień → PRO Progress, karta „Trefferzonen · letzte 3 Trainings” z tymi samymi liczbami.
  await zones.click();
  const card = page.getByTestId('recent-zones');
  await expect(card).toBeVisible({ timeout: 15_000 });
  await expect(card).toContainText('Trefferzonen · letzte 3 Trainings');
  await expect(card).toContainText('Gold: 44 %');
  await expect(card).toContainText('(8)'); // Gold: 8 strzał
  await expect(card).toBeInViewport();
  await page.screenshot({ path: test.info().outputPath('pro-zones.png') });
  await expectNoErrors(page, errors, 'strefy');

  // Schnellstatistik: kafelek „Pfeile / Monat” → okno, przełącznik Ringe.
  await page.goto('/');
  await page.getByRole('button', { name: /Pfeile \/ Monat/ }).click();
  const dlg = page.getByRole('dialog', { name: /Schnellstatistik/ });
  await expect(dlg).toBeVisible();
  await expect(dlg).toContainText('18');
  await dlg.getByRole('button', { name: 'Ringe', exact: true }).click();
  await expect(dlg).toContainText(/\d,\d|\d\.\d/); // Ringe/Pfeil z ułamkiem
  await page.screenshot({ path: test.info().outputPath('quickstats.png') });
  await expectNoErrors(page, errors, 'Schnellstatistik');
});
