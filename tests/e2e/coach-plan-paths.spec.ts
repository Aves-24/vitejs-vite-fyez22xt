import { test, expect, type Page, type Browser } from '@playwright/test';
import { resetEmulators, registerUser, linkCoachAndStudent, watchErrors, expectNoErrors, newUserPage, closeUserPages, syncWrites } from './helpers';

// [ŚCIEŻKI 2026-11-12] Skąd trener dochodzi do treningu grupy z planu i gdzie ląduje:
// Home (Nächste Termine), Übersicht (karta dnia), Termine Liste, Termine Monat (trójkącik i dzień).
// Test-sonda: zapisuje cel każdej ścieżki (bez i z tematem) i drukuje tabelę.
test.beforeEach(async ({ request }) => resetEmulators(request));
test.afterEach(() => closeUserPages());

const coachNav = (page: Page, name: string) => page.getByRole('navigation').getByRole('button', { name, exact: true });

async function coachWithGroup(browser: Browser) {
  const coach = await newUserPage(browser);
  const student = await newUserPage(browser);
  const errors = watchErrors(coach);
  await registerUser(coach, 'Trenerka');
  const sid = await registerUser(student, 'Uczen');
  await linkCoachAndStudent(coach, student, sid, 'Trenerka');
  await coachNav(coach, 'folder_shared Gruppen').click();
  await coach.getByRole('button', { name: 'Gruppe erstellen' }).click();
  await coach.getByPlaceholder('Z.B. Anfänger, Kader...').fill('Kader');
  await coach.getByRole('button', { name: 'Speichern', exact: true }).click();
  await coach.getByRole('button', { name: 'person_add Hinzufügen' }).click();
  await coach.getByRole('button', { name: 'check Uczen' }).click();
  await coach.getByRole('button', { name: 'Hinzufügen (1)' }).click();
  await expect(coach.getByRole('button', { name: /folder_shared Kader 1 Schüler/ })).toBeVisible();
  // Stały trening: dziś 23:30 — zawsze „przed nami”, więc jest na Home, w Übersicht i w Termine.
  const today = new Date().toLocaleDateString('de-DE', { weekday: 'long' });
  await coach.getByRole('button', { name: /Regelmäßiges Training/ }).click();
  await coach.getByRole('combobox', { name: 'Termine' }).selectOption({ label: today });
  await coach.getByRole('textbox', { name: 'Uhrzeit' }).fill('23:30');
  await coach.getByPlaceholder('z. B. Halle').fill('Halle Nord');
  await coach.getByRole('button', { name: 'Speichern', exact: true }).click();
  await expect(coach.getByText('Trainingszeit gespeichert')).toBeVisible();
  return { coach, errors };
}

/** Gdzie wylądowaliśmy po kliknięciu. */
async function landing(page: Page): Promise<string> {
  await page.waitForTimeout(900);
  const vis = (l: ReturnType<Page['getByText']>) => l.first().isVisible().catch(() => false);
  if (await vis(page.getByRole('heading', { name: 'Thema bearbeiten' }))) return 'TOPIC_EDIT (okienko tematu, edycja)';
  if (await vis(page.getByRole('heading', { name: 'Trainingsthema', exact: true }))) return 'TOPIC_NEW (okienko tematu, nowy)';
  if (await vis(page.getByText('Gruppe Kader im Trainerbereich öffnen'))) return 'CAL_EVENT (podgląd terminu w kalendarzu)';
  if (await vis(page.getByRole('button', { name: /Regelmäßiges Training/ })) || await vis(page.getByRole('heading', { name: 'Gruppen' }))) return 'GROUP (ekran grupy Kader)';
  const h = await page.getByRole('heading').first().textContent().catch(() => '');
  return `INNE: ${(h || '').trim().slice(0, 60)}`;
}

/** Zamyka okienko; na wszelki wypadek przeładowuje i wraca do trybu trenera. */
async function closeOverlay(page: Page) {
  await page.mouse.click(5, 5);
  await page.waitForTimeout(400);
  await page.goto('/').catch(() => {});
  await page.waitForTimeout(1500);
  const sw = page.getByRole('button', { name: /Trainer$/ }).last();
  if (await sw.isVisible().catch(() => false)) await sw.click({ timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(500);
}

/** Jedna ścieżka: kliknięcia → cel; brak elementu zapisuje się jako BRAK zamiast wieszać test. */
async function step(page: Page, out: string[], label: string, clicks: (() => Promise<unknown>)[]) {
  try {
    for (const c of clicks) await c();
    const where = await landing(page);
    await page.screenshot({ path: `test-results/paths/${label.replace(/[^a-zA-Z0-9]+/g, '_')}.png` });
    out.push(`${label} → ${where}`);
  } catch (e) {
    out.push(`${label} → BRAK (${String((e as Error).message).split('\n')[0].slice(0, 80)})`);
  }
  console.log(out[out.length - 1]);
  await closeOverlay(page);
}

async function toCoach(page: Page) {
  const sw = page.getByRole('button', { name: /Trainer$/ }).last();
  if (await sw.isVisible().catch(() => false)) await sw.click({ timeout: 5000 });
}

async function probeAll(coach: Page, phase: string, out: string[]) {
  const dayNum = String(new Date().getDate());
  const T = { timeout: 8000 };

  await step(coach, out, `${phase} | Home: Nächste Termine`, [
    () => coach.getByRole('button', { name: /Schütze$/ }).last().click(T),
    () => coach.getByText('Kader', { exact: true }).first().click(T),
  ]);
  await coach.goto('/').catch(() => {});
  await coach.waitForTimeout(1500);
  await toCoach(coach);

  await step(coach, out, `${phase} | Übersicht: karta treningu`, [
    () => coachNav(coach, 'space_dashboard Übersicht').click(T),
    () => coach.getByRole('button', { name: /^Kader/ }).first().click(T),
  ]);
  await step(coach, out, `${phase} | Termine Liste: karta`, [
    () => coachNav(coach, 'event_note Termine').click(T),
    () => coach.getByRole('button', { name: 'Liste' }).click(T),
    () => coach.getByRole('button', { name: /Kader Plan/ }).first().click(T),
  ]);
  // Komórki dni z trójkącikiem; dzisiejsza = ta z samym numerem dnia.
  const triDays = coach.locator('button').filter({ has: coach.getByRole('button', { name: 'Trainingsthema' }) });
  const todayCell = triDays.filter({ hasText: new RegExp('^' + dayNum + '$') });
  await step(coach, out, `${phase} | Monat: trójkącik (dziś)`, [
    () => coachNav(coach, 'event_note Termine').click(T),
    () => coach.getByRole('button', { name: 'Monat' }).click(T),
    () => todayCell.getByRole('button', { name: 'Trainingsthema' }).click(T),
  ]);
  if (new Date().getDate() > 7) {
    await step(coach, out, `${phase} | Monat: trójkącik (dzień przeszły)`, [
      () => coachNav(coach, 'event_note Termine').click(T),
      () => coach.getByRole('button', { name: 'Monat' }).click(T),
      () => triDays.first().getByRole('button', { name: 'Trainingsthema' }).click(T),
    ]);
  }
  await step(coach, out, `${phase} | Monat: klik w dzień (dziś)`, [
    () => coachNav(coach, 'event_note Termine').click(T),
    () => coach.getByRole('button', { name: 'Monat' }).click(T),
    () => todayCell.click({ ...T, position: { x: 8, y: 25 } }),
  ]);
  await coach.getByRole('button', { name: 'Liste' }).click(T).catch(() => {});
}

test('ścieżki do treningu z planu: bez tematu i z tematem', async ({ browser }) => {
  test.skip(!!process.env.CI, 'sonda ścieżek (2,5 min) — uruchamiana ręcznie, nie w CI');
  test.setTimeout(480_000);
  const { coach, errors } = await coachWithGroup(browser);
  const out: string[] = [];

  await probeAll(coach, 'BEZ TEMATU', out);

  // Temat na dziś przez trójkącik w Monat.
  const T = { timeout: 10000 };
  const dayNum = String(new Date().getDate());
  await coachNav(coach, 'event_note Termine').click(T);
  await coach.getByRole('button', { name: 'Monat' }).click(T);
  await coach.locator('button').filter({ has: coach.getByRole('button', { name: 'Trainingsthema' }) })
    .filter({ hasText: new RegExp('^' + dayNum + '$') }).getByRole('button', { name: 'Trainingsthema' }).click(T);
  await coach.getByPlaceholder('z. B. Ellenbogenrotation im Vollauszug').fill('Anker halten', T);
  await coach.getByRole('button', { name: /^Speichern/ }).last().click(T);
  await syncWrites(coach);
  await coach.waitForTimeout(1500);
  await closeOverlay(coach);
  await coach.getByRole('button', { name: 'Liste' }).click(T).catch(() => {});
  console.log('--- temat zapisany ---');

  await probeAll(coach, 'Z TEMATEM', out);

  console.log('\n=== CELE ŚCIEŻEK ===\n' + out.join('\n') + '\n');
  await expectNoErrors(coach, errors, 'ścieżki do treningu z planu');
});
