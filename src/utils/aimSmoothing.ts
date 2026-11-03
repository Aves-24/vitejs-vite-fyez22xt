/**
 * [STABILIZACJA] Wygładzanie krzyżyka (user 2026-11-03: „celownik drga”).
 *
 * Krzyżyk stoi w średniej z ostatnich ~100 ms dotyku (w pikselach ekranu).
 * Drżenie palca (8–12 Hz) w takim oknie się znosi, a gdy palec stanie,
 * średnia schodzi dokładnie w jego punkt — bez stałego opóźnienia.
 * Szybki, celowy ruch (skok > FAST_PX) idzie od razu, bez uśredniania.
 */
export interface Pt { x: number; y: number }
export interface Sample extends Pt { t: number }

export const WINDOW_MS = 100;
const FAST_PX = 24;

/** Dopisuje próbkę i zwraca [nowe próbki, pozycja krzyżyka]. */
export function smoothAim(samples: Sample[], s: Sample): [Sample[], Pt] {
  const old = samples.filter(p => p.t >= s.t - WINDOW_MS);
  const mean = (ps: Pt[]): Pt => ({
    x: ps.reduce((a, p) => a + p.x, 0) / ps.length,
    y: ps.reduce((a, p) => a + p.y, 0) / ps.length,
  });
  if (!old.length || Math.hypot(s.x - mean(old).x, s.y - mean(old).y) > FAST_PX) return [[s], { x: s.x, y: s.y }];
  const kept = [...old, s];
  return [kept, mean(kept)];
}
