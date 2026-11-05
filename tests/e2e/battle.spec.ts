import { test, expect, type Page } from '@playwright/test';
import { resetEmulators, registerUser, shoot, watchErrors, expectNoErrors, newUserPage, closeUserPages } from './helpers';

// Pojedynek dwóch graczy (dwa konta naraz): Anna tworzy arenę, Ben dołącza
// kodem, Anna startuje, obaj strzelają serię, ranking pokazuje oba wyniki.
test.beforeEach(async ({ request }) => resetEmulators(request));
test.afterEach(() => closeUserPages());

test('pojedynek: tworzenie areny, dołączenie kodem, strzelanie, ranking', async ({ browser }) => {
  test.setTimeout(120_000);
  const a = await newUserPage(browser);
  const b = await newUserPage(browser);
  const aErrors = watchErrors(a);
  const bErrors = watchErrors(b);
  await registerUser(a, 'Anna');
  await registerUser(b, 'Ben');

  // Anna: nowa arena — dystans z jej dyscypliny (wcześniej: 10 m dmuchawki).
  await a.getByText('Duell starten').click();
  await a.getByRole('button', { name: 'add_circle Neue Arena erstellen' }).click();
  await expect(a.getByRole('button', { name: /Meine Distanz 18m/ })).toBeVisible();
  await expect(a.getByRole('button', { name: /Scheibenauflage 3-Spot/ })).toBeVisible();
  await a.getByRole('button', { name: 'SPIEL ERSTELLEN' }).click();
  await expect(a.getByRole('button', { name: 'Wettkampf starten' })).toBeDisabled();
  const code = (await a.getByRole('heading', { level: 1 }).first().textContent())!.trim();
  expect(code).toMatch(/^[A-Z0-9]{6}$/);

  // Ben: dołączenie kodem.
  await b.getByText('Duell starten').click();
  await b.getByRole('button', { name: 'Mit Code / QR beitreten' }).click();
  await expect(b.getByText('Deine eindeutige ID:')).toBeVisible();
  await expect(b.getByText(/Schüler-ID/)).toHaveCount(0);
  await b.getByPlaceholder('z.B. AB12CD').fill(code);
  await b.getByRole('button', { name: 'BEITRETEN' }).click();
  await expect(b.getByRole('heading', { name: 'Diesem Spiel beitreten?' })).toBeVisible();
  await expect(b.getByText('Gastgeber: Anna')).toBeVisible();
  await b.getByRole('button', { name: 'Beitreten & schießen' }).click();

  // Anna widzi Bena i startuje.
  await expect(a.getByRole('main').getByText('Ben', { exact: false }).first()).toBeVisible();
  await a.getByRole('button', { name: 'Wettkampf starten' }).click();

  const fullEnd = async (p: Page, arrows: string[]) => {
    await expect(p.getByRole('button', { name: '10', exact: true })).toBeVisible();
    await shoot(p, arrows);
    await expect(p.getByRole('main')).toContainText(/Gesamtringzahl\s*\d+/);
  };
  await fullEnd(a, ['X', '10', '9', '9', '8', '7']);   // 53
  await fullEnd(b, ['10', '10', '10', '9', '9', '9']); // 57
  await expect(a.getByRole('main')).toContainText(/Gesamtringzahl\s*53/);
  await expect(b.getByRole('main')).toContainText(/Gesamtringzahl\s*57/);

  // Ranking pojedynku lokalnego: dopiero po 1. rundzie (6 Passen).
  await a.getByRole('button', { name: 'Ranking' }).click();
  await expect(a.getByText('Ranking erst nach der 1. Runde (6 Passen) verfügbar.')).toBeVisible();

  for (let i = 0; i < 5; i++) {
    await shoot(a, ['X', '10', '9', '9', '8', '7']);
    await shoot(b, ['10', '10', '10', '9', '9', '9']);
  }
  await expect(a.getByRole('main')).toContainText(/Gesamtringzahl\s*318/);
  await expect(b.getByRole('main')).toContainText(/Gesamtringzahl\s*342/);

  // 6. Passe zamyka się po 600 ms — dopiero wtedy ranking jest odblokowany.
  await expect(a.getByRole('button', { name: /RUNDE 1 \(318\)/ })).toBeVisible();
  await a.getByRole('button', { name: 'Ranking' }).click();
  const board = a.locator('body');
  await expect(board.getByText('Ben').last()).toBeVisible();
  await expect(board.getByText('342').last()).toBeVisible();
  await expect(board.getByText('318').last()).toBeVisible();

  await expectNoErrors(a, aErrors, 'Anna');
  await expectNoErrors(b, bErrors, 'Ben');
});
