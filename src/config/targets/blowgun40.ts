import type { TargetFace, TargetRing } from '../targetFaces';

/**
 * [DMUCHAWKA] Pełna tarcza 40 cm do dmuchawki — prośba usera 2026-09-11.
 *
 * Wygląda i punktuje DOKŁADNIE jak łucznicza '40cm' (10 pierścieni + X,
 * 1-10), ale należy do dyscypliny „dmuchawka". Osobny wpis zamiast
 * dopięcia dmuchawki do łuczniczej '40cm', bo:
 *  - filtr listy tarcz (`selectableTargetIdsFor`) jest rozłączny — tarcza
 *    należy do łucznictwa ALBO do dmuchawki, nie do obu;
 *  - sesje bez stempla zestawu rozpoznaje się po id tarczy
 *    (`isBlowgunSession`), a strzał z rury na łuczniczej '40cm' wyglądałby
 *    jak trening łuczniczy i wszedłby do handicapu.
 *
 * Osobny plik, zgodnie z zasadą z 2026-09-03 — łucznicza '40cm' w
 * `targetFaces.ts` zostaje nietknięta.
 */

/**
 * Kopia `FULL_RINGS` z `targetFaces.ts`, a nie import: tamten plik importuje
 * ten z powrotem, więc import WARTOŚCI dałby cykl i `undefined` przy starcie
 * modułu. Promienie w viewBoxie 300x300, co 15 — `scoringRingStep` niżej
 * musi się z nimi zgadzać.
 */
const BLOWGUN40_RINGS: readonly TargetRing[] = [
  { r: 150,  fill: '#ffffff', stroke: '#333333' }, // 1
  { r: 135,  fill: '#ffffff', stroke: '#333333' }, // 2
  { r: 120,  fill: '#333333', stroke: '#ffffff' }, // 3
  { r: 105,  fill: '#333333', stroke: '#ffffff' }, // 4
  { r: 90,   fill: '#2F80ED', stroke: '#333333' }, // 5
  { r: 75,   fill: '#2F80ED', stroke: '#333333' }, // 6
  { r: 60,   fill: '#EB5757', stroke: '#333333' }, // 7
  { r: 45,   fill: '#EB5757', stroke: '#333333' }, // 8
  { r: 30,   fill: '#F2C94C', stroke: '#333333' }, // 9
  { r: 15,   fill: '#F2C94C', stroke: '#333333' }, // 10
  { r: 7.5,  fill: '#F2C94C', stroke: '#333333' }, // X
];

/** Id jest wyświetlane wprost w UI — nazwy tarcz nie mają dziś tłumaczeń. */
export const BLOWGUN40_FACE_ID = 'Blowgun 40cm';

export const BLOWGUN40_FACE: TargetFace = {
  id: BLOWGUN40_FACE_ID,
  layout: 'single',
  diameterCm: 40,
  scoringRingStep: 15,
  minScoringRing: 1,
  rings: BLOWGUN40_RINGS,
  aliases: ['Blasrohr 40cm', 'Dmuchawka 40cm'],
  scorable: true,
  discipline: 'blowgun',
  // Za spotem 20 cm (pickOrder 7) — spot zostaje pierwszym wyborem.
  pickOrder: 8,
};
