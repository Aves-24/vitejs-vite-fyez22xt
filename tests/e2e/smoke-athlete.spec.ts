import { test, expect } from '@playwright/test';
import { resetEmulators, registerUser, nav, watchErrors, expectNoErrors, shoot } from './helpers';

// Test dymny zawodnika: każdy ekran i każda zakładka otwiera się bez wyjątku JS,
// bez ekranu błędu i bez odrzucenia przez reguły Firestore. Nie sprawdza logiki
// — od tego są testy ścieżek — ale łapie wysypki i dziury w regułach wszędzie.
test.beforeEach(async ({ request }) => resetEmulators(request));

test('zawodnik: wszystkie ekrany otwierają się bez błędów', async ({ page }) => {
  const errors = watchErrors(page);
  await registerUser(page, 'Smoke');
  await page.waitForTimeout(1500);
  await expectNoErrors(page, errors, 'Home');

  const visit = async (step: string, action: () => Promise<unknown>) => {
    await action();
    await page.waitForTimeout(1200);
    await expectNoErrors(page, errors, step);
  };

  // Jeden pełny trening (2 Passen), żeby ekrany miały co pokazać.
  await visit('Training-Setup', () => page.getByRole('navigation').getByRole('button', { name: 'target' }).click());
  await visit('Scoring', () => page.getByRole('button', { name: 'Training', exact: true }).click());
  await shoot(page, ['X', '10', '9', '9', '8', '7', '10', '10', '9', '8', '8', 'M']);
  await visit('Scoring/Statistiken', () => page.getByRole('button', { name: /Statistiken anzeigen/ }).click());
  await page.getByRole('button', { name: 'Trainingseinheit speichern' }).click();
  await visit('Training gespeichert', () => page.getByRole('button', { name: /^Als unvollständig markieren/ }).click());
  await expect(page.getByRole('button', { name: /^Zuletzt 98/ })).toBeVisible();

  await visit('Kalender', () => nav(page, 'Kalender').click());
  await visit('Tagebuch', () => nav(page, 'Tagebuch').click());
  await visit('Stats', () => nav(page, 'Stats').click());
  for (const tab of ['Rekorde', 'diamond PRO Progress', 'Täglich']) {
    await visit(`Stats/${tab}`, () => page.getByRole('main').getByRole('button', { name: tab, exact: true }).click());
  }

  await visit('Einst.', () => nav(page, 'Einst.').click());
  for (const tab of ['AUSRÜSTUNG', 'DISTANZEN', 'SPRACHE', 'PRO diamond', 'TRAINER qr_code_scanner', 'TURNIERE emoji_events', 'TEILEN qr_code_2', 'PROFIL']) {
    await visit(`Einst./${tab}`, () => page.getByRole('main').getByRole('button', { name: tab, exact: true }).click());
  }

  await visit('Start', () => nav(page, 'Start').click());
  await visit('Training-Setup', () => page.getByRole('navigation').getByRole('button', { name: 'target' }).click());
  // Setup nie ma dolnego menu — wstecz strzałką.
  await visit('Start (zurück)', () => page.getByRole('button', { name: 'arrow_back' }).click());

  // Kafelki Home.
  const tiles: [string, RegExp | string][] = [
    ['Powiadomienia', 'notifications'],
    ['QR', 'qr_code_2'],
    ['Forma', 'monitoring'],
    ['Delay Mirror', 'slow_motion_video'],
    ['Zuletzt', /^Zuletzt 98/],
    ['Pfeile/Monat', /Pfeile \/ Monat/],
    ['Ranking', /^Bogenschützen-Ranking/],
    ['PRO', /^hourglass_top PRO/],
  ];
  for (const [step, name] of tiles) {
    await visit(`Home/${step}`, () => page.getByRole('main').getByRole('button', { name, exact: typeof name === 'string' }).first().click());
    // Czysty Home przed następnym kafelkiem.
    await page.goto('/');
    await expect(nav(page, 'Start')).toBeVisible();
  }
});
