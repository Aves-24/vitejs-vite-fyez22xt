// Porównania do kart treningów w dzienniku: średnia na strzałę, różnica do
// poprzedniego treningu na tym samym dystansie i odznaka rekordu.
//
// Dystans = `distanceKey` (jak w statystykach), więc zmiana nazwy dystansu
// nie rozcina historii. Punkty porównujemy tylko przy tej samej liczbie
// strzał, więc przerwany trening (50 zamiast 72) nie psuje porównania
// następnego pełnego; sam porównuje się średnią.

export interface InsightInput {
  id: string;
  ts: number;
  isTech: boolean;
  distKey: string;
  score: number;
  arrows: number;
}

export type InsightDelta = { kind: 'pts'; value: number } | { kind: 'avg'; value: number };

// record = najlepszy wynik w całej znanej historii (w chwili oddania);
// best = najlepszy z ostatnich `count`, gdy starsza historia nie jest wczytana.
export type InsightBadge = { kind: 'record' } | { kind: 'best'; count: number };

export interface SessionInsight {
  avg: number;
  delta?: InsightDelta;
  badge?: InsightBadge;
}

const MIN_PRIOR_RECORD = 3; // rekord dopiero po 3 wcześniejszych treningach
const MIN_PRIOR_BEST = 4;   // „najlepszy z N" dopiero od N = 5

export function computeInsights(sessions: InsightInput[], historyComplete: boolean): Map<string, SessionInsight> {
  const out = new Map<string, SessionInsight>();
  const scored = sessions
    .filter(s => !s.isTech && s.score > 0 && s.arrows > 0)
    .sort((a, b) => a.ts - b.ts);

  const prior = new Map<string, InsightInput[]>();
  for (const s of scored) {
    const earlier = prior.get(s.distKey) || [];
    const avg = s.score / s.arrows;
    const insight: SessionInsight = { avg };

    // Najpierw ostatni trening z tą samą liczbą strzał (pełny z pełnym),
    // dopiero bez niego — ostatni w ogóle, porównany średnią.
    const same = earlier.filter(p => p.arrows === s.arrows);
    const prevSame = same[same.length - 1];
    const prev = earlier[earlier.length - 1];
    if (prevSame) {
      insight.delta = { kind: 'pts', value: s.score - prevSame.score };
    } else if (prev) {
      insight.delta = { kind: 'avg', value: avg - prev.score / prev.arrows };
    }

    const beatsAll = same.every(p => s.score > p.score);
    if (beatsAll && historyComplete && same.length >= MIN_PRIOR_RECORD) {
      insight.badge = { kind: 'record' };
    } else if (beatsAll && !historyComplete && same.length >= MIN_PRIOR_BEST) {
      insight.badge = { kind: 'best', count: same.length + 1 };
    }

    out.set(s.id, insight);
    earlier.push(s);
    prior.set(s.distKey, earlier);
  }
  return out;
}
