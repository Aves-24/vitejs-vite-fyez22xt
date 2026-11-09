import type { TargetFace, TargetRing } from '../targetFaces';
import { QUAD, DICE5, type FaceSpotSpec } from '../spotGeometry';

/**
 * [IFAA 2026-11-09] Tarcze IFAA / DFBV — osobny plik (zasada usera: nowa
 * tarcza = nowy plik). Źródło: IFAA Archers' Handbook 2017–2018:
 *
 *  FIELD ROUND — „black spot with a white inner ring and black outer ring”,
 *    punktacja 5 (spot) / 4 (pierścień wewnętrzny) / 3 (zewnętrzny).
 *    Rozmiary 20/35/50/65 cm; pierścień wewnętrzny 12/21/30/39 cm (0,6 D),
 *    spot 4/7/10/13 cm (0,2 D). 4 strzały na tarczę.
 *  HUNTER ROUND — „all black with a white spot”, wymiary i punktacja jak Field.
 *  20 cm — cztery tarczki 2×2, strzały kolejno: lewa górna, prawa górna,
 *    lewa dolna, prawa dolna (u nas: jedna strzała na tarczkę).
 *  INDOOR ROUND — 40 cm, matowa niebieska (Pantone 282C), białe linie;
 *    środek 8 cm, X 4 cm (TYLKO do remisów — liczy się jak 5); 5-4-3-2-1
 *    od środka. 6 serii × 5 strzał, dwie jednostki = 12 serii.
 *  INDOOR 5-SPOT — pięć tarczek 16 cm jak „piątka na kostce”: biały środek
 *    8 cm = 5, niebieski = 4; jedna strzała na tarczkę.
 *
 * X w IFAA nie punktuje dodatkowo i służy wyłącznie do remisów (na zawodach
 * terenowych remis i tak rozstrzyga dogrywka) — dlatego klawiatura nie ma X,
 * a trafienie w środek to 5. Expert Field Round (5-4-3-2-1 na liniach
 * pośrednich) — na razie nie, nikt jeszcze o nią nie prosił.
 *
 * Świat statystyk 'ifaa' (skala 5) — patrz config/statsGroups.ts.
 */

const BLACK = '#222222', WHITE = '#ffffff', LINE = '#333333';
const BLUE = '#1B3A6B'; // Pantone 282C (granat), przyciemniony do ekranu

/** Strefy pełnej tarczy w viewBoxie 300: spot 0,2 D → r 30, pierścień 0,6 D → r 90. */
const FIELD_ZONES = [{ r: 30, value: 5 }, { r: 90, value: 4 }, { r: 150, value: 3 }] as const;

const FIELD_RINGS: readonly TargetRing[] = [
  { r: 150, fill: BLACK, stroke: WHITE },
  { r: 90, fill: WHITE, stroke: LINE },
  { r: 30, fill: BLACK, stroke: WHITE },
  { r: 4, fill: WHITE, stroke: WHITE }, // biały „x” w środku (tylko znak, nie strefa)
];
const HUNTER_RINGS: readonly TargetRing[] = [
  { r: 150, fill: BLACK, stroke: WHITE },
  { r: 90, fill: BLACK, stroke: WHITE },
  { r: 30, fill: WHITE, stroke: LINE },
  { r: 4, fill: BLACK, stroke: BLACK }, // czarny „x” w białym środku
];

/** 4 strzały na tarczę; jednostka 14 tarcz, runda = 2 jednostki (28). */
const FIELD_ROUND = { arrowsPerEnd: 4, ends: 28 } as const;

const FIELD_KEYS = { '5': 'black', '4': 'white', '3': 'black' } as const;
const HUNTER_KEYS = { '5': 'white', '4': 'black', '3': 'black' } as const;

const single = (
  id: string, cm: number, rings: readonly TargetRing[], keys: Record<string, 'black' | 'white'>, pickOrder: number, aliases: string[],
): TargetFace => ({
  id,
  layout: 'single',
  diameterCm: cm,
  scoringRingStep: 30,
  minScoringRing: 3,
  rings,
  zones: FIELD_ZONES,
  aliases,
  scorable: true,
  statsGroup: 'ifaa',
  keyColors: keys,
  round: FIELD_ROUND,
  pickOrder,
});

/** 20 cm: tarczki 2×2 z tymi samymi proporcjami (spot 0,2 r, pierścień 0,6 r). */
const quadSpec = (hunter: boolean): FaceSpotSpec => ({
  arrangement: QUAD,
  rings: hunter
    ? [{ f: 1, fill: BLACK, stroke: WHITE }, { f: 0.6, fill: BLACK, stroke: WHITE }, { f: 0.2, fill: WHITE, stroke: LINE }]
    : [{ f: 1, fill: BLACK, stroke: WHITE }, { f: 0.6, fill: WHITE, stroke: LINE }, { f: 0.2, fill: BLACK, stroke: WHITE }],
  zones: [{ f: 0.2, value: '5' }, { f: 0.6, value: '4' }, { f: 1, value: '3' }],
});

const quad = (id: string, hunter: boolean, pickOrder: number, aliases: string[]): TargetFace => ({
  id,
  layout: 'spots', // wielospotowa z własną geometrią (rysunek i punktacja ze `spot`)
  diameterCm: 20,
  scoringRingStep: 13.2, // 0,2 r przy r = 66 — szerokość „pierścienia” do skupienia
  minScoringRing: 3,
  rings: [],
  // Klawiatura i strefy: 5/4/3 (wartości z `zones`).
  zones: [{ r: 13.2, value: 5 }, { r: 39.6, value: 4 }, { r: 66, value: 3 }],
  aliases,
  scorable: true,
  statsGroup: 'ifaa',
  keyColors: hunter ? HUNTER_KEYS : FIELD_KEYS,
  spot: quadSpec(hunter),
  round: FIELD_ROUND,
  pickOrder,
});

export const IFAA_FIELD_FACES: TargetFace[] = [
  quad('IFAA Field 20cm 4-Spot', false, 20, ['DFBV Feld 20cm 4-Spot', 'IFAA Field 20cm']),
  single('IFAA Field 35cm', 35, FIELD_RINGS, FIELD_KEYS, 21, ['DFBV Feld 35cm']),
  single('IFAA Field 50cm', 50, FIELD_RINGS, FIELD_KEYS, 22, ['DFBV Feld 50cm']),
  single('IFAA Field 65cm', 65, FIELD_RINGS, FIELD_KEYS, 23, ['DFBV Feld 65cm']),
  quad('IFAA Hunter 20cm 4-Spot', true, 24, ['DFBV Hunting 20cm 4-Spot', 'IFAA Hunter 20cm']),
  single('IFAA Hunter 35cm', 35, HUNTER_RINGS, HUNTER_KEYS, 25, ['DFBV Hunting 35cm']),
  single('IFAA Hunter 50cm', 50, HUNTER_RINGS, HUNTER_KEYS, 26, ['DFBV Hunting 50cm']),
  single('IFAA Hunter 65cm', 65, HUNTER_RINGS, HUNTER_KEYS, 27, ['DFBV Hunting 65cm']),
];

/** Indoor 40 cm: środek 8 cm (r 30), potem co 4 cm (r 60/90/120/150); X 4 cm (r 15) — tylko znak. */
export const IFAA_INDOOR_FACE: TargetFace = {
  id: 'IFAA Indoor 40cm',
  layout: 'single',
  diameterCm: 40,
  scoringRingStep: 30,
  minScoringRing: 1,
  rings: [
    { r: 150, fill: BLUE, stroke: WHITE },
    { r: 120, fill: BLUE, stroke: WHITE },
    { r: 90, fill: BLUE, stroke: WHITE },
    { r: 60, fill: BLUE, stroke: WHITE },
    { r: 30, fill: WHITE, stroke: WHITE },
    { r: 15, fill: WHITE, stroke: BLUE }, // X-ring (remisy)
  ],
  zones: [{ r: 30, value: 5 }, { r: 60, value: 4 }, { r: 90, value: 3 }, { r: 120, value: 2 }, { r: 150, value: 1 }],
  aliases: ['DFBV Indoor 40cm', 'IFAA Indoor'],
  scorable: true,
  statsGroup: 'ifaa',
  keyColors: { '5': 'white', '4': 'blue', '3': 'blue', '2': 'blue', '1': 'blue' },
  round: { arrowsPerEnd: 5, ends: 12 },
  pickOrder: 28,
};

/** Indoor 5-Spot: tarczka 16 cm — biały środek 8 cm (0,5 r) = 5, niebieski = 4. */
export const IFAA_INDOOR5_FACE: TargetFace = {
  id: 'IFAA Indoor 5-Spot',
  layout: 'spots',
  diameterCm: 40,
  scoringRingStep: 29,
  minScoringRing: 4,
  rings: [],
  zones: [{ r: 29, value: 5 }, { r: 58, value: 4 }],
  aliases: ['DFBV Indoor 5-Spot', 'IFAA 5-Spot'],
  scorable: true,
  statsGroup: 'ifaa',
  keyColors: { '5': 'white', '4': 'blue' },
  spot: {
    arrangement: DICE5,
    rings: [
      { f: 1, fill: BLUE, stroke: WHITE },
      { f: 0.5, fill: WHITE, stroke: WHITE },
      { f: 0.25, fill: WHITE, stroke: BLUE }, // X-ring (remisy)
    ],
    zones: [{ f: 0.5, value: '5' }, { f: 1, value: '4' }],
  },
  round: { arrowsPerEnd: 5, ends: 12 },
  pickOrder: 29,
};

/** Tarcza IFAA dla dystansu (Field Round: 20 cm do ~11 m, 35 do ~27 m, 50 do ~46 m, dalej 65). */
export function ifaaFaceForMeters(m?: number | null): string {
  const v = m || 0;
  if (v > 0 && v <= 11) return 'IFAA Field 20cm 4-Spot';
  if (v > 0 && v <= 27) return 'IFAA Field 35cm';
  if (v > 0 && v <= 46) return 'IFAA Field 50cm';
  return 'IFAA Field 65cm';
}
