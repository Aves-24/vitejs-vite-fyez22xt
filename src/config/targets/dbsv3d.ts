import type { TargetFace } from '../targetFaces';

/**
 * [DBSV 3D 2026-11-10] Runda 3D DBSV (Deutscher Bogensport-Verband) — osobny
 * plik (zasada usera: nowa tarcza = nowy plik). Jak „IFAA Animal”: bez
 * geometrii, wpisuje się Kill / Körper / Miss (config/animalRound.ts).
 *
 *  - 3D-Waldrunde: do 3 strzał, pierwsze trafienie kończy; Kill 15/10/5,
 *    Körper 12/7/2.
 *  - 3D-Jagdrunde: 1 strzała; Kill 15, Körper 12.
 *
 * Źródło: DBSV Wettkampfordnung Teil 10 „3D-Wald- und Jagdrunde”, Stand 2026-1
 * (10.5.2 „Der erste klar erkennbare Treffer beendet das Schießen”, 10.6.2
 * „Jeder Bogensportler schießt nur einen Pfeil”, Abb. 10-3/10-4).
 * Kill = innere ALBO äußere Killzone (w 2026 bez wyjątku czerwonego kołka).
 *
 * Świat statystyk 'animal' — bez rangi; bez `pickOrder` (kafelek w Vorbereitung).
 */
export const DBSV_WALD_FACE_ID = 'DBSV 3D Waldrunde';
export const DBSV_JAGD_FACE_ID = 'DBSV 3D Jagdrunde';

const base = {
  layout: 'single' as const,
  diameterCm: 0,
  scoringRingStep: 30,
  minScoringRing: 1,
  rings: [],
  scorable: true,
  statsGroup: 'animal' as const,
};

export const DBSV_WALD_FACE: TargetFace = {
  ...base,
  id: DBSV_WALD_FACE_ID,
  aliases: ['DBSV Waldrunde', '3D Waldrunde'],
  // Kill złoty, Körper biały.
  keyColors: { '15': 'gold', '10': 'gold', '5': 'gold', '12': 'white', '7': 'white', '2': 'white' },
  round: { arrowsPerEnd: 3, ends: 28 },
};

export const DBSV_JAGD_FACE: TargetFace = {
  ...base,
  id: DBSV_JAGD_FACE_ID,
  aliases: ['DBSV Jagdrunde', '3D Jagdrunde'],
  keyColors: { '15': 'gold', '12': 'white' },
  round: { arrowsPerEnd: 1, ends: 28 },
};
