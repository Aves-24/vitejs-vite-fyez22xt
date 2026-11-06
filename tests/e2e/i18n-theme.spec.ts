import { test, expect, type Page } from '@playwright/test';
import { resetEmulators, registerUser, shoot, syncWrites } from './helpers';

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
    const bad: string[] = await page.evaluate(() => {
      const lum = (c: number[]) => { const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
      const rgba = (s: string) => (s.match(/[\d.]+/g) || []).map(Number);
      const out: string[] = [];
      const els = Array.from(document.querySelectorAll<HTMLElement>('body *'));
      for (const el of els) {
        const text = Array.from(el.childNodes).filter(n => n.nodeType === 3).map(n => n.textContent || '').join('').trim();
        if (!text || text.length < 2) continue;
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        if (r.width === 0 || r.height === 0 || cs.visibility === 'hidden' || Number(cs.opacity) < 0.3) continue;
        if (cs.fontFamily.includes('Material')) continue;
        const fg = rgba(cs.color); if (fg.length >= 4 && fg[3] < 0.3) continue;
        let bg: number[] | null = null; let node: HTMLElement | null = el; let skip = false;
        while (node) {
          const s = getComputedStyle(node);
          if (s.backgroundImage && s.backgroundImage !== 'none') { skip = true; break; }
          const b = rgba(s.backgroundColor);
          if (b.length >= 3 && (b.length < 4 || b[3] > 0.6)) { bg = b; break; }
          node = node.parentElement;
        }
        if (skip || !bg) continue;
        const l1 = lum(fg), l2 = lum(bg);
        const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
        if (ratio < 1.5) out.push(`"${text.slice(0, 40)}" ${cs.color} na ${getComputedStyle(node!).backgroundColor} (${ratio.toFixed(2)})`);
      }
      return out;
    });
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
    const wrong = lng === 'en'
      ? /\b(Einstellungen|Speichern|Schüler|Pfeile|Gesamtringzahl|Trainingseinheit|Zuletzt|Wettkampf|Ringe|Zapisz|Ustawienia|Strzały|Trening)\b/
      : /\b(Einstellungen|Speichern|Schüler|Pfeile|Gesamtringzahl|Trainingseinheit|Zuletzt|Wettkampf|Ringe|Settings|Save|Arrows|Last|Training session)\b/;
    const rawKey = /\b[a-z][a-zA-Z]+\.[a-z][a-zA-Z]+(\.[a-zA-Z]+)?\b/;
    const problems: string[] = [];
    await screens(page, async (name) => {
      const text = await page.locator('body').innerText();
      for (const line of text.split('\n')) {
        const l = line.trim();
        if (!l) continue;
        const w = l.match(wrong); if (w) problems.push(`${name}: obce słowo „${w[0]}” w „${l.slice(0, 60)}”`);
        const k = l.match(rawKey); if (k && !/\d\.\d|@|https?:|www\.|\.(de|com|pl|app)\b|GROT-X|e\.g\.|z\.B\.|np\./.test(l)) problems.push(`${name}: klucz? „${k[0]}” w „${l.slice(0, 60)}”`);
      }
    });
    const uniq = [...new Set(problems)];
    console.log(`LANG ${lng}\n` + uniq.join('\n'));
    expect(uniq, uniq.join('\n')).toEqual([]);
  });
}
