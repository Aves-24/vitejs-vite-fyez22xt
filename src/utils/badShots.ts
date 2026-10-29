/**
 * [FEHLSCHUSS] Strzała oznaczona jako źle wykonana (flier) — trener 2026-10-29:
 * „taki strzał nie powinien być wliczany do statystyki skupienia i rekomendacji
 * celownika, bo zakłamuje obraz poprawnej grupy”.
 *
 * Znacznik leży na samej strzale: `dots[i].bad = true` (dots są równoległe do
 * rawArrows, także przy wpisywaniu klawiaturą — wtedy x/y = null). Dzięki temu
 * cofanie, szkic treningu w localStorage i zapis sesji niosą go bez osobnego
 * pola. Punkty się NIE zmieniają — strzał padł i liczy się do wyniku; wypada
 * tylko z analizy (grupa, celownik, rozrzut, statystyka per strzała).
 */

export interface DotLike { x?: number | null; y?: number | null; spotId?: string | null; bad?: boolean }

export const isBad = (d?: DotLike | null): boolean => !!d?.bad;

const WEIGHT: Record<string, number> = { X: 11, '10': 10, '9': 9, '8': 8, '7': 7, '6': 6, '5': 5, '4': 4, '3': 3, '2': 2, '1': 1, M: 0 };

/**
 * Indeksy rawArrows w kolejności, w jakiej stoją w posortowanej serii (`arrows`).
 * Ta sama reguła co sortArrows w ScoringView (malejąco, stabilnie), więc pole
 * nr k w tabeli = strzała rawArrows[result[k]] — także przy dwóch takich samych
 * wartościach.
 */
export function sortedRawIndices(raw: string[]): number[] {
  return raw.map((_, i) => i).sort((a, b) => (WEIGHT[raw[b]] || 0) - (WEIGHT[raw[a]] || 0));
}

/** Kopia dots z przełączonym znacznikiem strzały `i` (brak pola = nie dotykamy). */
export function toggleBad<T extends DotLike>(dots: T[], i: number): T[] {
  if (i < 0 || i >= dots.length) return dots;
  return dots.map((d, k) => {
    if (k !== i) return d;
    const { bad, ...rest } = d;
    return (bad ? rest : { ...rest, bad: true }) as T;
  });
}

/** Ile strzał w seriach oznaczono jako złe. */
export const countBad = (ends: Array<{ dots?: DotLike[] }>): number =>
  ends.reduce((n, e) => n + (e.dots || []).filter(isBad).length, 0);
