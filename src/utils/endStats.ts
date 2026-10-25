/**
 * [SCORING] Sumy serii: X, 10 (X też się liczy jako 10), 9, punkty, liczba
 * strzał i średnia. Wydzielone 1:1 z ScoringView (2026-10-25), żeby dało się
 * to przetestować — działanie bez zmian.
 *
 * Zasady:
 *  - X = 10 pkt i liczy się zarówno do `x`, jak i do `t` (dziesiątki),
 *  - M = 0 pkt, ale to strzała (wchodzi do `count`, więc obniża średnią),
 *  - pusta wartość ('') nie jest strzałą,
 *  - `active` = strzały bieżącej, jeszcze niezatwierdzonej serii,
 *  - średnia jako tekst z 2 miejscami po przecinku ('0.00' bez strzał).
 */
export interface EndStats {
  x: number;
  t: number;
  n: number;
  score: number;
  count: number;
  avg: string;
}

export const getStats = (ends: any[], active: string[] = []): EndStats => {
  let x=0, t=0, n=0, score=0, count=0;
  const proc = (v: string) => { if (!v) return; count++; if (v === 'X') { x++; t++; score += 10; } else if (v === '10') { t++; score += 10; } else if (v === '9') { n++; score += 9; } else if (v !== 'M') { score += parseInt(v); } };
  ends.forEach(e => e.arrows?.forEach(proc)); active.forEach(proc);
  const avg = count > 0 ? (score / count).toFixed(2) : '0.00';
  return { x, t, n, score, count, avg };
};
