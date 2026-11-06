import { test, expect, type Page, type Browser } from '@playwright/test';
import { resetEmulators, registerUser, linkCoachAndStudent, shoot, newUserPage, closeUserPages, syncWrites } from './helpers';
import { contrastIssues, langIssues, iconButton } from './uiChecks';

// Przegląd ekranów TRENERA i okienek + ekranu treningu: ciemny motyw (kontrast)
// oraz EN/PL (surowe klucze, słowa z innego języka). Nawigacja po ikonach.
test.beforeEach(async ({ request }) => resetEmulators(request));
test.afterEach(() => closeUserPages());

const coachNav = (page: Page, name: string) => page.getByRole('navigation').getByRole('button', { name, exact: true });

async function setup(browser: Browser) {
  const coach = await newUserPage(browser);
  const student = await newUserPage(browser);
  await registerUser(coach, 'Trenerka');
  const sid = await registerUser(student, 'Uczen');
  await linkCoachAndStudent(coach, student, sid, 'Trenerka');
  // Uczeń ma trening — profil u trenera z danymi.
  await student.getByRole('navigation').getByRole('button', { name: 'target' }).click();
  await student.getByRole('button', { name: 'Training', exact: true }).click();
  await shoot(student, ['X', '10', '9', '9', '8', '7']);
  await student.getByRole('button', { name: 'Trainingseinheit speichern' }).click();
  await student.getByRole('button', { name: /^Als unvollständig markieren/ }).click();
  await syncWrites(student);
  // Grupa z uczniem i tematem na dziś.
  await coachNav(coach, 'folder_shared Gruppen').click();
  await coach.getByRole('button', { name: 'Gruppe erstellen' }).click();
  await coach.getByPlaceholder('Z.B. Anfänger, Kader...').fill('Kader');
  await coach.getByRole('button', { name: 'Speichern', exact: true }).click();
  await coach.getByRole('button', { name: 'person_add Hinzufügen' }).click();
  await coach.getByRole('button', { name: 'check Uczen' }).click();
  await coach.getByRole('button', { name: 'Hinzufügen (1)' }).click();
  await coachNav(coach, 'folder_shared Gruppen').click();
  const kader = coach.getByRole('main').getByText('Kader', { exact: true });
  if (await kader.isVisible().catch(() => false)) await kader.click();
  await coach.getByRole('button', { name: 'add Thema' }).click();
  await coach.getByPlaceholder('z. B. Ellenbogenrotation im Vollauszug').fill('Anker');
  await coach.getByRole('button', { name: 'Speichern', exact: true }).click();
  await syncWrites(coach);
  return { coach, student };
}

async function walk(coach: Page, student: Page, visit: (who: Page, name: string) => Promise<void>) {
  const nav = (icon: string) => iconButton(coach.getByRole('navigation'), icon).first().click();
  await coach.reload();
  // Po przeładowaniu start w trybie zawodnika → przełącznik „Trainer” (ikona sports).
  await iconButton(coach.getByRole('navigation'), 'sports').first().click();
  await nav('space_dashboard'); await coach.waitForTimeout(1200); await visit(coach, 'Übersicht');
  await nav('event_note'); await coach.waitForTimeout(1000); await visit(coach, 'Termine');
  await nav('group'); await coach.waitForTimeout(1000); await visit(coach, 'Schüler');
  // Szybki podgląd ucznia i pełny profil.
  await coach.getByRole('main').getByText('Uczen').first().click();
  await coach.waitForTimeout(1200); await visit(coach, 'Schüler/Vorschau');
  const full = coach.getByRole('button', { name: /Schülerprofil|athlete profile|profil zawodnika|profile/i }).first();
  if (await full.isVisible().catch(() => false)) {
    await full.click(); await coach.waitForTimeout(1500); await visit(coach, 'Schülerprofil');
    await iconButton(coach, 'arrow_back').first().click();
  }
  await coach.goto('/');
  if (!(await iconButton(coach.getByRole('navigation'), 'space_dashboard').first().isVisible().catch(() => false))) await iconButton(coach.getByRole('navigation'), 'sports').first().click();
  await nav('folder_shared'); await coach.waitForTimeout(1000); await visit(coach, 'Gruppen');
  const kader = coach.getByRole('main').getByText('Kader', { exact: true }).first();
  if (await kader.isVisible().catch(() => false)) { await kader.click(); await coach.waitForTimeout(1000); await visit(coach, 'Gruppe Kader'); }
  // Okno wiadomości do grupy.
  await iconButton(coach.getByRole('main'), 'mail').first().click();
  await coach.waitForTimeout(800); await visit(coach, 'Nachricht');
  await coach.getByRole('dialog').locator('button').last().evaluate(() => {}); // obecność okna
  await coach.keyboard.press('Escape');
  await coach.goto('/');
  if (!(await iconButton(coach.getByRole('navigation'), 'space_dashboard').first().isVisible().catch(() => false))) await iconButton(coach.getByRole('navigation'), 'sports').first().click();
  await nav('settings'); await coach.waitForTimeout(1000); await visit(coach, 'Einst. Trainer');
  // Ekran treningu (zawodnik): pusty i po jednej Passe.
  await student.goto('/');
  await student.getByRole('navigation').getByRole('button', { name: 'target' }).click();
  await student.getByRole('button', { name: /^(Training|Trening)$/ }).click();
  await student.waitForTimeout(800); await visit(student, 'Training');
  await shoot(student, ['10', '9', '9', '8', '8', '7']);
  await student.waitForTimeout(900); await visit(student, 'Training/Passe');
  await student.screenshot({ path: test.info().outputPath('training.png') });
}

test('trener + trening: ciemny motyw bez niewidocznego tekstu', async ({ browser }) => {
  test.setTimeout(240_000);
  const { coach, student } = await setup(browser);
  for (const p of [coach, student]) await p.evaluate(() => localStorage.setItem('grotx_theme', 'dark'));
  const problems: string[] = [];
  await walk(coach, student, async (who, name) => {
    await expect(who.locator('html')).toHaveClass(/dark/);
    for (const b of await contrastIssues(who)) problems.push(`${name}: ${b}`);
  });
  const uniq = [...new Set(problems)];
  console.log('DARK-COACH\n' + uniq.join('\n'));
  expect(uniq, uniq.join('\n')).toEqual([]);
});

for (const lng of ['en', 'pl'] as const) {
  test(`trener + trening: język ${lng}`, async ({ browser }) => {
    test.setTimeout(240_000);
    const { coach, student } = await setup(browser);
    for (const p of [coach, student]) await p.evaluate((l) => localStorage.setItem('i18nextLng', l), lng);
    const problems: string[] = [];
    await walk(coach, student, async (who, name) => {
      for (const p of await langIssues(who, lng)) problems.push(`${name}: ${p}`);
    });
    const uniq = [...new Set(problems)];
    console.log(`LANG-COACH ${lng}\n` + uniq.join('\n'));
    expect(uniq, uniq.join('\n')).toEqual([]);
  });
}
