import type { TargetFace } from '../targetFaces';

/**
 * [WA 3D 2026-11-10] Runda 3D World Archery — osobny plik (zasada usera: nowa
 * tarcza = nowy plik). Według WA strzela też Polska (PZŁucz, od aktualizacji
 * regulaminu 2022) i DSB w Niemczech.
 *
 *  - 2 strzały na zwierzę, liczą się obie: WA Book 4 (2026-09-14) 20.3.1
 *    „In 3D, two arrows per target will be shot in all rounds.”
 *  - Strefy: WA Book 2, 8.2.2.1 „four scoring zones (11, 10, 8 and 5)”:
 *    11 = małe koło w środku dziesiątki, 10 = większe koło w strefie vital,
 *    8 = reszta vital, 5 = reszta ciała. Linia = wyższa wartość.
 *    Odbicie (ricochet) = M; spór o wbity pfeil = 5 (Book 4 22.2.1).
 *
 * Wpisuje się strefą (config/animalRound.ts), bez geometrii. Świat 'animal',
 * bez rangi; bez `pickOrder` (kafelek w Vorbereitung).
 */
export const WA_3D_FACE_ID = 'WA 3D';

export const WA_3D_FACE: TargetFace = {
  id: WA_3D_FACE_ID,
  layout: 'single',
  diameterCm: 0,
  scoringRingStep: 30,
  minScoringRing: 1,
  rings: [],
  aliases: ['World Archery 3D', 'PZŁucz 3D', 'DSB 3D'],
  scorable: true,
  statsGroup: 'animal',
  // 11 i 10 złote, 8 czerwone (vital), 5 białe (ciało).
  keyColors: { '11': 'gold', '10': 'gold', '8': 'red', '5': 'white' },
  round: { arrowsPerEnd: 2, ends: 24 },
};
