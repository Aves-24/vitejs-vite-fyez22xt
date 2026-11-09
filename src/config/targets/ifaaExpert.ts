import type { TargetFace, TargetRing } from '../targetFaces';
import { QUAD, type FaceSpotSpec } from '../spotGeometry';

/**
 * [IFAA EXPERT 2026-11-09] Expert Field Round — osobny plik (zasada usera:
 * nowa tarcza = nowy plik; tarcze Field z `ifaa.ts` zostają nietknięte).
 *
 * Regulamin (IFAA Archers’ Handbook 2017–2018, „Expert Field Round”):
 * „All distances and target faces as for the IFAA Field Round shall apply,
 * except that the main score lines as well as the sub dividing score lines,
 * being the lines midway the main score lines, shall be used for scoring.
 * Five points for the spot, four for the second circle, three for the third,
 * two for the fourth and one for the fifth. The white X in the centre spot is
 * used for tie breakers only.”
 *
 * Linie główne Field: spot 0,2 D, pierścień 0,6 D, brzeg D. Linie pośrednie
 * w połowie: 0,4 D i 0,8 D. Strefy (średnice): 5 = 0,2 D, 4 = 0,4 D,
 * 3 = 0,6 D, 2 = 0,8 D, 1 = D → promienie w viewBoxie 300: 30/60/90/120/150.
 * Tylko tarcze Field (Hunter nie należy do tej rundy).
 */

const BLACK = '#222222', WHITE = '#ffffff', LINE = '#333333';

const EXPERT_ZONES = [
  { r: 30, value: 5 }, { r: 60, value: 4 }, { r: 90, value: 3 }, { r: 120, value: 2 }, { r: 150, value: 1 },
] as const;

/** Wygląd tarczy Field + cienkie linie pośrednie (0,4 D na bieli, 0,8 D na czerni). */
const EXPERT_RINGS: readonly TargetRing[] = [
  { r: 150, fill: BLACK, stroke: WHITE },
  { r: 120, fill: BLACK, stroke: WHITE }, // linia pośrednia (2 | 1)
  { r: 90, fill: WHITE, stroke: LINE },
  { r: 60, fill: WHITE, stroke: LINE },   // linia pośrednia (4 | 3)
  { r: 30, fill: BLACK, stroke: WHITE },
  { r: 15, fill: BLACK, stroke: WHITE },  // X-ring (remisy), 0,1 D jak w ifaa.ts
  { r: 4, fill: WHITE, stroke: WHITE },   // biały „x”
];

/** Kolory klawiszy jak kolory stref: 5 czarny środek, 4–3 biały pierścień, 2–1 czarny brzeg. */
const EXPERT_KEYS = { X: 'black', '5': 'black', '4': 'white', '3': 'white', '2': 'black', '1': 'black' } as const;

const ROUND = { arrowsPerEnd: 4, ends: 28 } as const;

const single = (cm: 35 | 50 | 65, pickOrder: number): TargetFace => ({
  id: `IFAA Field ${cm}cm Expert`,
  layout: 'single',
  diameterCm: cm,
  scoringRingStep: 30,
  minScoringRing: 1,
  rings: EXPERT_RINGS,
  zones: EXPERT_ZONES,
  xRing: 15,
  aliases: [`DFBV Feld ${cm}cm Experten`, `IFAA Expert ${cm}cm`],
  scorable: true,
  statsGroup: 'ifaa',
  keyColors: EXPERT_KEYS,
  round: ROUND,
  pickOrder,
});

const QUAD_EXPERT: FaceSpotSpec = {
  arrangement: QUAD,
  spotCm: 20,
  rings: [
    { f: 1, fill: BLACK, stroke: WHITE },
    { f: 0.8, fill: BLACK, stroke: WHITE },
    { f: 0.6, fill: WHITE, stroke: LINE },
    { f: 0.4, fill: WHITE, stroke: LINE },
    { f: 0.2, fill: BLACK, stroke: WHITE },
    { f: 0.1, fill: BLACK, stroke: WHITE },
  ],
  zones: [
    { f: 0.1, value: 'X' }, { f: 0.2, value: '5' }, { f: 0.4, value: '4' }, { f: 0.6, value: '3' }, { f: 0.8, value: '2' }, { f: 1, value: '1' },
  ],
};

export const IFAA_EXPERT_FACES: TargetFace[] = [
  {
    id: 'IFAA Field 20cm 4-Spot Expert',
    layout: 'spots',
    diameterCm: 20,
    scoringRingStep: 13.2,
    minScoringRing: 1,
    rings: [],
    zones: [{ r: 13.2, value: 5 }, { r: 26.4, value: 4 }, { r: 39.6, value: 3 }, { r: 52.8, value: 2 }, { r: 66, value: 1 }],
    xRing: 6.6,
    aliases: ['DFBV Feld 20cm 4-Spot Experten', 'IFAA Expert 20cm'],
    scorable: true,
    statsGroup: 'ifaa',
    keyColors: EXPERT_KEYS,
    spot: QUAD_EXPERT,
    round: ROUND,
    pickOrder: 30,
  },
  single(35, 31),
  single(50, 32),
  single(65, 33),
];
