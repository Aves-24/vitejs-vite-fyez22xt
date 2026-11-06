import { test, expect, type Page } from '@playwright/test';
import { resetEmulators, registerUser, shoot, syncWrites } from './helpers';
import { contrastIssues, langIssues } from './uiChecks';

// Przegląd głównych ekranów: (1) ciemny motyw — tekst prawie niewidoczny na
// swoim tle (kontrast < 1.5), (2) EN/PL — surowe klucze tłumaczeń i słowa
// z innego języka. Zbiera wszystko i pokazuje listę naraz.
test.beforeEach(async ({ request }) => resetEmulators(request));

// Nawigacja po ikonach (nazwy przycisków różnią się między językami).
const navIcon = (page: Page, icon: string) =>
  page.getByRole('navigation').getByRole('button', { name: new RegExp(`^${icon}( |$)`) }).first();

async function screens(page: Page, visit: (name: string) => Promise<void>) {
  await page.goto('/');
  await visit('Home');
  for (const [name, icon] of [['Kalender', 'event_note'], ['Tagebuch', 'menu_book'], ['Stats', 'analytics'], ['Einst', 'tune']] as const) {
    await navIcon(page, icon).click();
    await page.waitForTimeout(900);
    await visit(name);
  }
  // Zakładki statystyk i ustawień (drugi i trzeci przycisk zakładek).
  await navIcon(page, 'analytics').click();
  const statTabs = page.getByRole('main').getByRole('button').filter({ hasText: /^(Rekorde|Records|Rekordy)$/ });
  if (await statTabs.count()) { await statTabs.first().click(); await page.waitForTimeout(800); await visit('Stats/Rekorde'); }
  await navIcon(page, 'tune').click();
  for (const tab of ['AUSRÜSTUNG|EQUIPMENT|SPRZĘT', 'DISTANZEN|DISTANCES|DYSTANSE', 'PRO']) {
    const b = page.getByRole('main').getByRole('button', { name: new RegExp(`^(${tab})`) }).first();
    if (await b.isVisible().catch(() => false)) { await b.click(); await page.waitForTimeout(600); await visit(`Einst/${tab.split('|')[0]}`); }
  }
  await page.goto('/');
  await page.getByRole('navigation').getByRole('button', { name: 'target' }).click();
  await page.waitForTimeout(800);
  await visit('Vorbereitung');
}

async function oneTraining(page: Page) {
  await page.getByRole('navigation').getByRole('button', { name: 'target' }).click();
  await page.getByRole('button', { name: 'Training', exact: true }).click();
  await shoot(page, ['X', '10', '9', '9', '8', '7']);
  await page.getByRole('button', { name: 'Trainingseinheit speichern' }).click();
  await page.getByRole('button', { name: /^Als unvollständig markieren/ }).click();
  await syncWrites(page);
}

test('ciemny motyw: brak niewidocznego tekstu na głównych ekranach', async ({ page }) => {
  test.setTimeout(150_000);
  await registerUser(page, 'Nacht');
  await oneTraining(page);
  await page.evaluate(() => localStorage.setItem('grotx_theme', 'dark'));
  const problems: string[] = [];
  await screens(page, async (name) => {
    await expect(page.locator('html')).toHaveClass(/dark/);
    const bad = await contrastIssues(page);
    for (const b of bad) problems.push(`${name}: ${b}`);
  });
  await page.goto('/');
  await expect(page.getByRole('button', { name: /^Zuletzt 53/ })).toBeVisible();
  await page.waitForTimeout(800);
  await page.screenshot({ path: test.info().outputPath('dark-home.png') });
  console.log('DARK\n' + problems.join('\n'));
  expect(problems, problems.join('\n')).toEqual([]);
});

for (const lng of ['en', 'pl'] as const) {
  test(`język ${lng}: bez surowych kluczy i słów z innego języka`, async ({ page }) => {
    test.setTimeout(150_000);
    await registerUser(page, 'Sprache');
    await oneTraining(page);
    await page.evaluate((l) => localStorage.setItem('i18nextLng', l), lng);
    const problems: string[] = [];
    await screens(page, async (name) => {
      for (const p of await langIssues(page, lng)) problems.push(`${name}: ${p}`);
    });
    const uniq = [...new Set(problems)];
    console.log(`LANG ${lng}\n` + uniq.join('\n'));
    expect(uniq, uniq.join('\n')).toEqual([]);
  });
}
