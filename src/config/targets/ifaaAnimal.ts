import type { TargetFace } from '../targetFaces';

/**
 * [ANIMAL ROUND 2026-11-10] Tarcza „zwierzę” IFAA — osobny plik (zasada usera:
 * nowa tarcza = nowy plik). Nie ma geometrii: każde zwierzę na trasie jest
 * inne, więc wpisuje się przyciskami Kill / Wound / Miss (config/animalRound.ts),
 * a nie klikiem w rysunek. Wartość strzały = punkty (IFAA: 20/18, 16/14, 12/10).
 *
 * Bez `pickOrder` — nie pojawia się na listach tarcz dystansów; włącza się
 * przełącznikiem „Animal Round” w Vorbereitung przy zestawie IFAA.
 * Świat statystyk 'animal' (skala 20) — bez rangi.
 */
export const IFAA_ANIMAL_FACE_ID = 'IFAA Animal';

export const IFAA_ANIMAL_FACE: TargetFace = {
  id: IFAA_ANIMAL_FACE_ID,
  layout: 'single',
  diameterCm: 0,
  scoringRingStep: 30,
  minScoringRing: 1,
  rings: [],
  aliases: ['IFAA Tierrunde', 'Animal Round'],
  scorable: true,
  statsGroup: 'animal',
  // Kill (środek) złoty, Wound (reszta zwierzęcia) biały.
  keyColors: { '20': 'gold', '16': 'gold', '12': 'gold', '18': 'white', '14': 'white', '10': 'white' },
  round: { arrowsPerEnd: 3, ends: 28 },
};
