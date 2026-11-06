import type { Page, Locator } from '@playwright/test';

// Wspólne sprawdzenia przeglądów UI (i18n-theme*.spec.ts).

/** Tekst prawie niewidoczny na swoim tle (kontrast < 1.5) na bieżącym ekranie. */
export async function contrastIssues(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const lum = (c: number[]) => { const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
    const rgba = (s: string) => (s.match(/[\d.]+/g) || []).map(Number);
    const out: string[] = [];
    for (const el of Array.from(document.querySelectorAll<HTMLElement>('body *'))) {
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
}

const WRONG: Record<'en' | 'pl', RegExp> = {
  en: /\b(Einstellungen|Speichern|Schüler|Pfeile|Gesamtringzahl|Trainingseinheit|Zuletzt|Wettkampf|Ringe|Gruppe|Nachricht|Zapisz|Ustawienia|Strzały|Trening|Zawodnik|Grupa)\b/,
  pl: /\b(Einstellungen|Speichern|Schüler|Pfeile|Gesamtringzahl|Trainingseinheit|Zuletzt|Wettkampf|Ringe|Gruppe|Nachricht|Settings|Save|Arrows|Athletes|Group|Message|Training session)\b/,
};
const RAW_KEY = /\b[a-z][a-zA-Z]+\.[a-z][a-zA-Z]+(\.[a-zA-Z]+)?\b/;
const RAW_KEY_OK = /\d\.\d|@|https?:|www\.|\.(de|com|pl|app)\b|GROT-X|e\.g\.|z\.B\.|np\./;

/** Surowe klucze tłumaczeń i słowa z innego języka na bieżącym ekranie. */
export async function langIssues(page: Page, lng: 'en' | 'pl'): Promise<string[]> {
  const out: string[] = [];
  const text = await page.locator('body').innerText();
  for (const line of text.split('\n')) {
    const l = line.trim();
    if (!l) continue;
    const w = l.match(WRONG[lng]); if (w) out.push(`obce słowo „${w[0]}” w „${l.slice(0, 60)}”`);
    const k = l.match(RAW_KEY); if (k && !RAW_KEY_OK.test(l)) out.push(`klucz? „${k[0]}” w „${l.slice(0, 60)}”`);
  }
  return out;
}

/** Przycisk z ikoną Material o danej nazwie (niezależny od języka). */
export function iconButton(scope: Page | Locator, icon: string) {
  // Lokator w „has” musi pochodzić od strony, nie od zakresu.
  const page = 'page' in scope && typeof (scope as Locator).page === 'function' ? (scope as Locator).page() : (scope as Page);
  return scope.locator('button', { has: page.locator('span.material-symbols-outlined', { hasText: new RegExp(`^${icon}$`) }) });
}
