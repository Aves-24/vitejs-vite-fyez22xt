import { test, expect } from '@playwright/test';
import { resetEmulators, startAsGuest, shoot, nav, registerUser, reloadAfterSync } from './helpers';

// Najważniejsza ścieżka apki: gość → trening na klawiaturze → zapis →
// wynik widać na Home, po odświeżeniu (czyli w Firestore) i w Tagebuchu.
test.beforeEach(async ({ request }) => resetEmulators(request));

test('gość zapisuje trening i widzi go na Home i w Tagebuchu', async ({ page }) => {
  await startAsGuest(page);

  // Ustawienia sesji: domyślnie 18 m, 3-Spot.
  await expect(page.getByRole('button', { name: '18m', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('setup-card')).toContainText('3-Spot');
  await page.getByRole('button', { name: 'Training', exact: true }).click();

  // Ekran wpisywania: przed pierwszą strzałą nie da się zapisać.
  const save = page.getByRole('button', { name: 'Trainingseinheit speichern' });
  await expect(save).toBeDisabled();

  await shoot(page, ['X', '10', '9', '9', '8', '7']);
  // textContent skleja komórki bez spacji, stąd \s* w wyrażeniach.
  const main = page.getByRole('main');
  await expect(main).toContainText(/X\/10\/9\s*1\/2\/2/);
  // Średnia z przecinkiem po niemiecku (wcześniej „8.83”).
  await expect(main).toContainText(/SCHNITT\s*8,83/);
  await expect(main).toContainText(/Gesamtringzahl\s*53/);

  // Undo cofa ostatnią strzałę, a nowa wraca do tej samej sumy.
  await page.getByRole('button', { name: 'undo' }).click();
  await expect(main).toContainText(/Gesamtringzahl\s*46/);
  await shoot(page, ['7']);
  await expect(main).toContainText(/Gesamtringzahl\s*53/);

  // 1 z 12 Passen → pytanie o niepełny trening.
  await save.click();
  await expect(page.getByRole('heading', { name: 'Unvollständiges Training' })).toBeVisible();
  await page.getByRole('button', { name: /^Als unvollständig markieren/ }).click();

  // Home: kafelek „Zuletzt”.
  const last = page.getByRole('button', { name: /^Zuletzt 53 18m · 1\/12/ });
  await expect(last).toBeVisible();
  await expect(page.getByRole('button', { name: /^6 Pfeile \/ Monat/ })).toBeVisible();

  // Po przeładowaniu dane muszą przyjść z Firestore (nie ze stanu Reacta).
  await reloadAfterSync(page);
  await expect(last).toBeVisible();

  // Tagebuch: wpis treningu w bieżącym tygodniu.
  await nav(page, 'Tagebuch').click();
  await expect(page.getByRole('button', { name: /1 Training · 6 Pfeile · Ø 8,83/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Training 18m 53 Ringe · 6 Pfeile/ })).toBeVisible();
});

test('„Beenden ohne Speichern” niczego nie zapisuje', async ({ page }) => {
  await startAsGuest(page);
  await page.getByRole('button', { name: 'Training', exact: true }).click();
  await shoot(page, ['10', '10', '10', '9', '9', '9']);
  await page.getByRole('button', { name: 'Trainingseinheit speichern' }).click();
  await page.getByRole('button', { name: /^Beenden ohne Speichern/ }).click();

  await nav(page, 'Tagebuch').click();
  await expect(page.getByRole('heading', { name: 'Tagebuch' })).toBeVisible();
  // Czekamy, aż dziennik się wczyta (pasek fokusu), dopiero potem „brak wpisu” coś znaczy.
  await expect(page.getByRole('button', { name: /Setz dir einen Fokus/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Training 18m/ })).toHaveCount(0);
});

test('szybkie wpisywanie: strzała tuż po szóstej nie przepada', async ({ page }) => {
  // Po 6. strzale seria zamyka się po 600 ms. Stuknięcia w tym oknie
  // wcześniej ginęły po cichu — teraz zamykają serię od razu.
  await startAsGuest(page);
  await page.getByRole('button', { name: 'Training', exact: true }).click();
  await shoot(page, ['X', '10', '9', '9', '8', '7', '10', '10', '9', '8', '8', 'M']);
  const main = page.getByRole('main');
  await expect(main).toContainText(/P2\s*10\s*10\s*9\s*8\s*8\s*M\s*45\s*98/);
  await expect(main).toContainText(/Gesamtringzahl\s*98/);
});

test('szybki start po wejściu w Vorbereitung nie łapie 10 m dmuchawki', async ({ page }) => {
  // Zanim profil (dyscyplina) dojedzie, lista dystansów zawiera też 10 m
  // dmuchawki. Wcześniej automatyczny wybór łapał właśnie je, a szybkie
  // „Training” zapisywało łucznikowi trening 10 m / Blowgun 20cm.
  await registerUser(page, 'Schnell');
  await page.getByRole('navigation').getByRole('button', { name: 'target' }).click();
  await page.getByRole('button', { name: 'Training', exact: true }).click();
  await expect(page.getByRole('main')).toContainText(/18m\s*3-Spot/i);
  await shoot(page, ['X', '10', '9', '9', '8', '7']);
  await page.getByRole('button', { name: 'Trainingseinheit speichern' }).click();
  await page.getByRole('button', { name: /^Als unvollständig markieren/ }).click();
  await expect(page.getByRole('button', { name: /^Zuletzt 53 18m/ })).toBeVisible();
});
