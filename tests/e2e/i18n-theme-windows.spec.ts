import { test, expect, type Page } from '@playwright/test';
import { resetEmulators, registerUser, shoot, syncWrites } from './helpers';
import { contrastIssues, langIssues } from './uiChecks';

// Przegląd okienek, których nie obejmują i18n-theme(-coach): nowe Home
// (menu, Schnellstatistik obie zakładki, dymek (i), Ergebniskurve, ranga),
// PRO Trefferzonen, Schreiber-Training (ustawienia + gra), okno fokusu,
// formularz nowego terminu. Ciemny motyw (kontrast < 1.5) oraz EN/PL
// (surowe klucze, słowa z innego języka). Zrzuty każdego okienka w outputPath.
test.beforeEach(async ({ request }) => resetEmulators(request));

type Mode = 'dark' | 'en' | 'pl';
const L = {
  dark: { arrowsMonth: /Pfeile \/ Monat/, points: 'Ringe', rank: /^Bogenschützen-Ranking/, schreiber: /Schreiber-Training/, start: 'Los geht’s', focus: /Setz dir einen Fokus/, addEvent: 'Neuer Termin' },
  en: { arrowsMonth: /Arrows \/ month/, points: 'Score', rank: /^Archer Ranking/, schreiber: /Scorer Training/, start: 'Start', focus: /Set a focus/, addEvent: 'New Event' },
  pl: { arrowsMonth: /Strzał \/ mies\./, points: 'Punkty', rank: /^Ranking Łucznika/, schreiber: /Trening liczenia/, start: 'Start', focus: /Ustaw fokus/, addEvent: 'Nowy Termin' },
} as const;

const navIcon = (page: Page, icon: string) =>
  page.getByRole('navigation').getByRole('button', { name: new RegExp(`^${icon}( |$)`) }).first();

async function training(page: Page, arrows: string[]) {
  await page.getByRole('navigation').getByRole('button', { name: 'target' }).click();
  await page.getByRole('button', { name: 'Training', exact: true }).click();
  await shoot(page, arrows);
  await page.getByRole('button', { name: 'Trainingseinheit speichern' }).click();
  await page.getByRole('button', { name: /^Als unvollständig markieren/ }).click();
  await expect(page.getByRole('button', { name: /^Zuletzt/ })).toBeVisible();
}

const home = async (page: Page) => { await page.goto('/'); await page.waitForTimeout(1200); };
const closeDialog = (page: Page) => page.keyboard.press('Escape');

for (const mode of ['dark', 'en', 'pl'] as Mode[]) {
  test(`okienka: ${mode === 'dark' ? 'ciemny motyw' : `język ${mode}`}`, async ({ page }) => {
    test.setTimeout(240_000);
    const l = L[mode];
    await registerUser(page, 'Fenster');
    await training(page, ['X', '10', '9', '9', '8', '7']);
    await training(page, ['10', '9', '8', '7', '6', 'M']);
    await training(page, ['9', '9', '8', '8', '7', '6']);
    const rankOk = page.getByRole('button', { name: 'Super', exact: true });
    if (await rankOk.isVisible({ timeout: 5_000 }).catch(() => false)) await rankOk.click();
    await syncWrites(page);
    await page.evaluate((m) => {
      if (m === 'dark') localStorage.setItem('grotx_theme', 'dark');
      else localStorage.setItem('i18nextLng', m);
    }, mode);

    const problems: string[] = [];
    let shot = 0;
    const check = async (name: string) => {
      await page.waitForTimeout(700);
      const found = mode === 'dark' ? await contrastIssues(page) : await langIssues(page, mode);
      for (const p of found) problems.push(`${name}: ${p}`);
      await page.screenshot({ path: test.info().outputPath(`${String(++shot).padStart(2, '0')}-${name.replace(/[^\w-]+/g, '_')}.png`) });
    };

    // Home + menu.
    await home(page);
    if (mode === 'dark') await expect(page.locator('html')).toHaveClass(/dark/);
    await check('Home');
    await page.getByRole('button', { name: /^(Menü|Menu)$/ }).click();
    await check('Home-Menu');
    await home(page);

    // (i) przy pierścieniu stref.
    await page.getByTestId('home-zones-info').click();
    await check('Home-Zonen-Info');

    // Schnellstatistik: obie zakładki.
    await home(page);
    await page.getByRole('button', { name: l.arrowsMonth }).click();
    await check('Schnellstatistik-Pfeile');
    await page.getByRole('dialog').getByRole('button', { name: l.points, exact: true }).click();
    await check('Schnellstatistik-Ringe');

    // Wykres formy → Ergebniskurve.
    await home(page);
    await page.getByTestId('home-form').click();
    await check('Ergebniskurve');

    // Ranga.
    await home(page);
    await page.getByRole('button', { name: l.rank }).click();
    await check('Rang-Info');

    // Pierścień → PRO Trefferzonen.
    await home(page);
    await page.getByTestId('home-zones').click();
    await expect(page.getByTestId('recent-zones')).toBeVisible({ timeout: 15_000 });
    await check('PRO-Trefferzonen');

    // Schreiber-Training: ustawienia i ekran gry.
    await home(page);
    await page.getByRole('button', { name: /^(Menü|Menu)$/ }).click();
    await page.getByRole('menuitem', { name: l.schreiber }).click();
    await check('Schreiber-Setup');
    await page.getByRole('button', { name: l.start, exact: true }).last().click();
    await page.waitForTimeout(2500); // „Durchgang läuft” — strzały spadają
    await check('Schreiber-Spiel');

    // Okno fokusu w Tagebuchu.
    await home(page);
    await navIcon(page, 'menu_book').click();
    await page.getByRole('button', { name: l.focus }).click();
    await check('Fokus-Fenster');
    await closeDialog(page);

    // Formularz nowego terminu w kalendarzu.
    await home(page);
    await navIcon(page, 'event_note').click();
    await page.getByRole('button', { name: l.addEvent, exact: true }).click();
    await check('Termin-Formular');

    const uniq = [...new Set(problems)];
    console.log(`WINDOWS ${mode}\n` + uniq.join('\n'));
    expect(uniq, uniq.join('\n')).toEqual([]);
  });
}
