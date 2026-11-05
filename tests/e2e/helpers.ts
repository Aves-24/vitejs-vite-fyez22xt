import { expect, type Page, type APIRequestContext, type Browser, type BrowserContext } from '@playwright/test';

// Emulatory z firebase.json, projekt demo-grotx (patrz src/firebase.ts, tryb e2e).
const PROJECT = 'demo-grotx';
const FIRESTORE = 'http://127.0.0.1:8080';
const AUTH = 'http://127.0.0.1:9099';

/** Czyści wszystkie konta i dokumenty w emulatorach — każdy test startuje od zera. */
export async function resetEmulators(request: APIRequestContext) {
  const fs = await request.delete(`${FIRESTORE}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`);
  expect(fs.ok(), 'Emulator Firestore nie działa — uruchom testy przez `npm run test:e2e`').toBeTruthy();
  const au = await request.delete(`${AUTH}/emulator/v1/projects/${PROJECT}/accounts`);
  expect(au.ok(), 'Emulator Auth nie działa — uruchom testy przez `npm run test:e2e`').toBeTruthy();
}

/**
 * Dokumenty kolekcji prosto z emulatora, z pominięciem reguł (token `owner`).
 * Zwraca surowy format REST: [{ name, fields: { pole: { stringValue | mapValue … } } }].
 */
export async function adminListDocs(request: APIRequestContext, collection: string) {
  const res = await request.get(
    `${FIRESTORE}/v1/projects/${PROJECT}/databases/(default)/documents/${collection}`,
    { headers: { Authorization: 'Bearer owner' } },
  );
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  return (body.documents ?? []) as { name: string; fields: Record<string, any> }[];
}

/** Oznacza konto w emulatorze Auth jako „e-mail potwierdzony” (np. admin). */
export async function adminVerifyEmail(request: APIRequestContext, uid: string) {
  const res = await request.post(`${AUTH}/identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:update`, {
    headers: { Authorization: 'Bearer owner' },
    data: { localId: uid, emailVerified: true },
  });
  expect(res.ok(), await res.text()).toBeTruthy();
}

// Dodatkowe przeglądarki (drugie konto w teście). MUSZĄ być zamknięte po
// teście — inaczej ich apka żyje dalej, widzi wyczyszczoną bazę i odtwarza
// swój profil w kolejnym teście.
const extraContexts: BrowserContext[] = [];
export async function newUserPage(browser: Browser): Promise<Page> {
  const ctx = await browser.newContext();
  extraContexts.push(ctx);
  return ctx.newPage();
}
export async function closeUserPages() {
  while (extraContexts.length) await extraContexts.pop()!.close().catch(() => {});
}

/** Unikalny e-mail testowy (konta żyją tylko w emulatorze). */
export const testEmail = (tag: string) => `e2e-${tag}-${Date.now()}@example.test`;
export const TEST_PASSWORD = 'Test-1234!';

/** Ekran powitalny po pierwszym logowaniu: imię → „Training starten” / „Zum Startbildschirm”. */
export async function finishWelcome(page: Page, name: string, next: 'training' | 'home') {
  await page.getByPlaceholder('Dein Name oder Spitzname').fill(name);
  if (next === 'training') await page.getByRole('button', { name: /training starten/i }).click();
  else await page.getByRole('button', { name: /zum startbildschirm/i }).click();
}

export async function startAsGuest(page: Page, name = 'Testa') {
  await page.goto('/');
  await page.getByRole('button', { name: /ohne konto ausprobieren/i }).click();
  await finishWelcome(page, name, 'training');
}

/** Nowe konto e-mail (ze zgodą RODO) + imię → Home. Zwraca uid z emulatora. */
export async function registerUser(page: Page, name: string, email = testEmail(name.toLowerCase())) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Konto erstellen', exact: true }).click();
  await page.getByPlaceholder('e-mail').fill(email);
  await page.getByPlaceholder('••••••••').fill(TEST_PASSWORD);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: /person_add Konto erstellen/ }).click();
  await finishWelcome(page, name, 'home');
  await expect(page.getByRole('heading', { name: 'GROT-X', level: 1 })).toBeVisible();
  // Tryb dev wystawia Firebase na window.__fb (src/firebase.ts).
  return page.evaluate(() => (window as any).__fb.auth.currentUser.uid as string);
}

// Szum, który NIE jest błędem apki (headless bez kamery itp.).
const IGNORED_ERRORS = [
  /Camera access error/i,
  /Requested device not found/i,
  // Windows przy długim przebiegu: brak wolnych gniazd w systemie (środowisko, nie apka).
  /net::ERR_NO_BUFFER_SPACE/i,
  // Ogólny komunikat przeglądarki — zamiast niego łapiemy odpowiedź z adresem niżej.
  /Failed to load resource: the server responded with a status of/i,
];
// Odpowiedzi HTTP ≥ 400, które są oczekiwane.
const IGNORED_RESPONSES: RegExp[] = [];

/**
 * Zbiera błędy z przeglądarki: wyjątki JS, console.error (w tym odrzucenia
 * reguł Firestore „Missing or insufficient permissions”) i ekran ViewErrorBoundary.
 * Użycie: const errors = watchErrors(page); … await expectNoErrors(page, errors, 'krok');
 */
export function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
  page.on('console', m => {
    if (m.type() !== 'error') return;
    const text = m.text();
    if (!IGNORED_ERRORS.some(r => r.test(text))) errors.push(`console: ${text.slice(0, 400)}`);
  });
  page.on('response', r => {
    if (r.status() < 400) return;
    const url = r.url();
    if (!IGNORED_RESPONSES.some(re => re.test(url))) errors.push(`http ${r.status()}: ${r.request().method()} ${url.slice(0, 250)}`);
  });
  return errors;
}

export async function expectNoErrors(page: Page, errors: string[], step: string) {
  await expect(page.getByText(/^(Etwas ist schiefgelaufen|Something went wrong|Coś poszło nie tak)$/), `${step}: ekran błędu widoku`).toHaveCount(0);
  expect(errors, `${step}: błędy w konsoli`).toEqual([]);
}

/** Trener włącza tryb trenera, zaprasza ucznia po ID, uczeń akceptuje. */
export async function linkCoachAndStudent(coach: Page, student: Page, studentId: string, coachName: string) {
  await nav(coach, 'Einst.').click();
  await coach.getByRole('button', { name: /^TRAINER/ }).click();
  await coach.getByRole('button', { name: /Trainermodus aktivieren/ }).click();
  await expect(coach.getByText(/Plätze: 0\/1/)).toBeVisible();
  await coach.getByRole('navigation').getByRole('button', { name: 'sports Trainer' }).click();
  await coach.getByRole('navigation').getByRole('button', { name: 'settings Einst.' }).click();
  await coach.getByRole('button', { name: 'person_add Schüler hinzufügen' }).click();
  await coach.getByPlaceholder('Benutzer-ID einfügen...').fill(studentId);
  await coach.getByRole('button', { name: 'Hinzufügen', exact: true }).click();
  await coach.getByRole('button', { name: 'OK', exact: true }).click();
  await expect(student.getByText(`${coachName} möchte dich als Trainer beobachten.`)).toBeVisible();
  await student.getByRole('button', { name: 'Annehmen', exact: true }).click();
  await expect(student.getByText(`${coachName} möchte dich als Trainer beobachten.`)).toHaveCount(0);
}

/** Klawiatura punktów na ekranie treningu: 'X', '10' … '1', 'M'. */
export async function shoot(page: Page, values: string[]) {
  for (const v of values) await page.getByRole('button', { name: v, exact: true }).click();
}

export const nav = (page: Page, label: 'Start' | 'Kalender' | 'Tagebuch' | 'Stats' | 'Einst.') =>
  page.getByRole('navigation').getByRole('button', { name: new RegExp(`${label.replace('.', '\\.')}$`) });
