import { test, expect, type Page } from '@playwright/test';
import { resetEmulators, registerUser, shoot, watchErrors, expectNoErrors, newUserPage, closeUserPages, adminPatchDoc } from './helpers';

// Gra klubowa (Verein): Anna zakłada grę w trybie Verein, Ben z tego samego
// klubu znajduje ją na liście „Vereinsspiele”. Ranking „na ślepo”: wynik
// drugiego gracza widać dopiero po tej samej liczbie strzał.
test.beforeEach(async ({ request }) => resetEmulators(request));
test.afterEach(() => closeUserPages());

async function joinClub(page: Page, request: any, uid: string) {
  await adminPatchDoc(request, `users/${uid}`, { clubName: 'BSV Testdorf', clubCity: 'Testdorf' });
  // Home trzyma klub w cache (grotX_*) — czyścimy, żeby wczytał nowy profil.
  await page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('grotX_')).forEach(k => localStorage.removeItem(k)));
  await page.reload();
  await expect(page.getByText('Duell starten')).toBeVisible();
}

test('gra Verein: lista klubu, dołączenie, ranking na ślepo', async ({ browser, request }) => {
  test.setTimeout(150_000);
  const a = await newUserPage(browser);
  const b = await newUserPage(browser);
  const aErrors = watchErrors(a);
  const bErrors = watchErrors(b);
  const aId = await registerUser(a, 'Anna');
  const bId = await registerUser(b, 'Ben');
  await joinClub(a, request, aId);
  await joinClub(b, request, bId);

  // Anna: arena w trybie Verein.
  await a.getByText('Duell starten').click();
  await a.getByRole('button', { name: 'add_circle Neue Arena erstellen' }).click();
  await a.getByRole('button', { name: /Verein/ }).first().click();
  await a.getByRole('button', { name: 'SPIEL ERSTELLEN' }).click();
  await expect(a.getByText('BSV Testdorf - Testdorf')).toBeVisible();
  await a.getByRole('button', { name: 'Wettkampf starten' }).click();
  await expect(a.getByRole('button', { name: '10', exact: true })).toBeVisible({ timeout: 15_000 });
  await expectNoErrors(a, aErrors, 'Anna: gra Verein');

  // Anna strzela pierwszą Passe (53).
  await shoot(a, ['X', '10', '9', '9', '8', '7']);
  await expect(a.getByRole('main')).toContainText(/Gesamtringzahl\s*53/);

  // Ben: lista „Vereinsspiele” → gra Anny.
  await b.getByText('Duell starten').click();
  await expect(b.getByText('Vereinsspiele').first()).toBeVisible();
  await expect(b.getByText('Vereinsspiel läuft')).toBeVisible();
  await b.getByText(/Anna/).first().click();
  const join = b.getByRole('button', { name: 'Beitreten & schießen' });
  await expect(b.getByText('Gastgeber: Anna')).toBeVisible();
  await join.click();
  await expect(b.getByRole('button', { name: '10', exact: true })).toBeVisible({ timeout: 15_000 });

  // Przed własną Passe Ben nie widzi wyniku Anny.
  await b.getByRole('button', { name: 'Ranking' }).click();
  await expect(b.getByText('Das Ranking erscheint nach deiner 1. Passe.')).toBeVisible();

  // Po własnej Passe — oba wyniki.
  await shoot(b, ['10', '10', '10', '9', '9', '9']);
  await expect(b.getByRole('main')).toContainText(/Gesamtringzahl\s*57/);
  // Passe zamyka się po 600 ms — dopiero wtedy ranking się otwiera.
  await expect(async () => {
    await b.getByRole('button', { name: 'Ranking' }).click();
    await expect(b.getByText('Anna').last()).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 15_000 });
  await expect(b.getByText('Ergebnisse der anderen nach 6 Pfeilen — so viele wie du').first()).toBeVisible();
  await expect(b.getByText('53').last()).toBeVisible();
  await expect(b.getByText('57').last()).toBeVisible();
  await expect(b.getByText('113')).toHaveCount(0);

  await expectNoErrors(a, aErrors, 'Anna');
  await expectNoErrors(b, bErrors, 'Ben');
});
