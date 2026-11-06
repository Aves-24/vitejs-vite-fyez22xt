import { test, expect, type Page } from '@playwright/test';
import { resetEmulators, testEmail, TEST_PASSWORD, watchErrors, expectNoErrors, adminListDocs, nav } from './helpers';

// Pierwsze uruchomienie: konto → „Konfiguration fortsetzen” → Profil-Assistent
// (7 kroków) → 13-latka dostaje bramkę zgody opiekuna (RODO art. 8).
test.beforeEach(async ({ request }) => resetEmulators(request));

async function signUpToGate(page: Page, name: string) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Konto erstellen', exact: true }).click();
  await page.getByPlaceholder('e-mail').fill(testEmail(name.toLowerCase()));
  await page.getByPlaceholder('••••••••').fill(TEST_PASSWORD);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: /person_add Konto erstellen/ }).click();
  await page.getByPlaceholder('Dein Name oder Spitzname').fill(name);
  return page;
}

const wiz = (page: Page) => page.locator('body > div').last();

test('Profil-Assistent krok po kroku + zgoda opiekuna dla 13-latki', async ({ page, request }) => {
  test.setTimeout(120_000);
  const errors = watchErrors(page);
  await signUpToGate(page, 'Wiki');
  await page.getByRole('button', { name: /Konfiguration fortsetzen/i }).click();
  const w = wiz(page);
  const next = () => w.getByRole('button', { name: 'Weiter', exact: true }).click();

  // 1/7 imię i nazwisko
  await expect(w.getByText('1/7')).toBeVisible();
  await w.getByRole('textbox', { name: 'Nachname' }).fill('Kowalska');
  await next();

  // 2/7 płeć i data urodzenia (13 lat)
  await expect(w.getByRole('heading', { name: 'Hallo, Wiki!' })).toBeVisible();
  const year = new Date().getFullYear() - 13;
  await w.getByRole('button', { name: 'Weiblich' }).click();
  await w.getByRole('spinbutton', { name: 'DD' }).fill('1');
  await w.getByRole('spinbutton', { name: 'MM' }).fill('3');
  await w.getByRole('spinbutton', { name: 'YYYY' }).fill(String(year));
  await next();

  // 3/7 ręka i wzrost — podpowiedź po niemiecku (wcześniej „np. 180”)
  await expect(w.getByRole('heading', { name: 'Körperliche Merkmale' })).toBeVisible();
  await expect(w.getByPlaceholder('z.B. 180')).toBeVisible();
  await w.getByRole('button', { name: 'Linkshänder (LH)' }).click();
  await w.getByPlaceholder('z.B. 180').fill('160');
  await next();

  // 4/7 łuk i poziom
  await expect(w.getByRole('heading', { name: 'Niveau & Ausrüstung' })).toBeVisible();
  await w.getByRole('button', { name: 'Recurve', exact: true }).click();
  await w.getByRole('button', { name: 'Vereinsmeisterschaft' }).click();
  await next();

  // 5/7 nastawy celownika — tylko dystanse łucznicze, bez dmuchawki
  await expect(w.getByRole('heading', { name: 'Deine Visiermarken' })).toBeVisible();
  await expect(w.getByText(/Blowgun/)).toHaveCount(0);
  await w.getByRole('textbox', { name: 'Visierauszug' }).first().fill('5.2');
  await next();

  // 6/7 zawody — pomijamy
  await expect(w.getByRole('heading', { name: 'Nächster Wettkampf' })).toBeVisible();
  await w.getByRole('button', { name: 'Überspringen' }).click();

  // 7/7 → zapis
  await expect(w.getByText('7/7')).toBeVisible();
  await w.getByRole('button', { name: /Abschließen/ }).last().click();

  // 13 lat → bramka zgody opiekuna.
  await expect(page.getByRole('heading', { name: 'Einwilligung der Eltern erforderlich' })).toBeVisible({ timeout: 15_000 });
  await page.getByPlaceholder('E-Mail der Aufsichtsperson').fill('eltern@example.test');
  await page.getByRole('checkbox', { name: /Als Elternteil/ }).check();
  await page.getByRole('button', { name: /Einwilligung bestätigen/ }).click();
  await expect(page.getByRole('heading', { name: 'Einwilligung der Eltern erforderlich' })).toHaveCount(0);

  // Dane w bazie: profil publiczny bez daty urodzenia, prywatny z datą i zgodą.
  const uid = await page.evaluate(() => (window as any).__fb.auth.currentUser.uid as string);
  await expect.poll(async () => JSON.stringify(await adminListDocs(request, `users/${uid}/private`)), { timeout: 15_000 })
    .toContain('eltern@example.test');
  const priv = JSON.stringify(await adminListDocs(request, `users/${uid}/private`));
  expect(priv).toContain(String(year));
  const pub = JSON.stringify((await adminListDocs(request, 'users')).find(d => d.name.endsWith(`/users/${uid}`)));
  expect(pub).toContain('Kowalska');
  expect(pub).not.toContain(String(year) + '-');

  // Ustawienia pokazują dane z kreatora.
  await nav(page, 'Einst.').click();
  await expect(page.getByRole('textbox', { name: 'Nachname' })).toHaveValue('Kowalska');
  await expectNoErrors(page, errors, 'kreator');
});

test('nowa wersja regulaminu: bramka „Neue Nutzungsbedingungen”, akceptacja zapisuje wersję', async ({ page, request }) => {
  const errors = watchErrors(page);
  await signUpToGate(page, 'Terra');
  await page.getByRole('button', { name: /zum startbildschirm/i }).click();
  await expect(page.getByRole('heading', { name: 'GROT-X', level: 1 })).toBeVisible();
  const uid = await page.evaluate(() => (window as any).__fb.auth.currentUser.uid as string);
  // Nowe konto akceptuje aktualny regulamin przy rejestracji — bramki brak.
  await expect(page.getByRole('heading', { name: /Nutzungsbedingungen/ })).toHaveCount(0);

  // Konto z akceptacją starszej wersji (jak po zmianie AGB).
  const res = await request.patch(
    `http://127.0.0.1:8080/v1/projects/demo-grotx/databases/(default)/documents/users/${uid}?updateMask.fieldPaths=termsAccepted.version`,
    { headers: { Authorization: 'Bearer owner' }, data: { fields: { termsAccepted: { mapValue: { fields: { version: { stringValue: '1.0' } } } } } } },
  );
  expect(res.ok(), await res.text()).toBeTruthy();

  // Bramka pojawia się na żywo (snapshot profilu), z tekstem o aktualizacji.
  await expect(page.getByRole('heading', { name: 'Neue Nutzungsbedingungen' })).toBeVisible();
  await expect(page.getByText(/aktualisiert \(Version \d/)).toBeVisible();
  await expect(page.getByRole('link', { name: /Nutzungsbedingungen lesen/ })).toHaveAttribute('href', /agb/);
  await page.getByRole('button', { name: /Ich stimme zu/ }).click();
  await expect(page.getByRole('heading', { name: 'Neue Nutzungsbedingungen' })).toHaveCount(0);

  // W bazie aktualna wersja; po przeładowaniu bramka nie wraca.
  await expect.poll(async () => JSON.stringify((await adminListDocs(request, 'users')).find(d => d.name.endsWith(`/users/${uid}`))?.fields?.termsAccepted), { timeout: 10_000 })
    .not.toContain('"1.0"');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'GROT-X', level: 1 })).toBeVisible();
  await page.waitForTimeout(1500);
  await expect(page.getByRole('heading', { name: /Nutzungsbedingungen/ })).toHaveCount(0);
  await expectNoErrors(page, errors, 'regulamin');
});
