/**
 * [3-SPOT] Zasada „jedna strzała na spot” — wydzielona z ScoringView
 * (2026-11-03), żeby dało się ją przetestować.
 *
 * Dwie strzały w tym samym spocie: liczy się niższa, druga to M (WA).
 * Remis — nowsza to M. Strzała poza spotem (pusty spotId) to M.
 */
export interface EndCoord { x: number | null; y: number | null; spotId: string | null; bad?: boolean }

const weight = (val: string): number => {
  if (val === 'X') return 11;
  if (val === 'M' || !val) return 0;
  return parseInt(val) || 0;
};

/** Dopisuje strzałę z tarczy do serii 3-Spot. Zwraca nowe tablice (wejście nietknięte). */
export function addSpotArrow(arrows: string[], coords: EndCoord[], v: string, coord: EndCoord): { arrows: string[]; coords: EndCoord[] } {
  const newArrows = [...arrows];
  let finalVal = v;
  if (!coord.spotId) {
    finalVal = 'M';
  } else {
    const existingIdx = coords.findIndex((c, i) => c?.spotId === coord.spotId && newArrows[i] !== 'M');
    if (existingIdx !== -1) {
      if (weight(v) < weight(newArrows[existingIdx])) newArrows[existingIdx] = 'M';
      else finalVal = 'M';
    }
  }
  return { arrows: [...newArrows, finalVal], coords: [...coords, coord] };
}

