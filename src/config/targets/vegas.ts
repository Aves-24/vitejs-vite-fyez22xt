import type { TargetFace } from '../targetFaces';
import type { FaceSpotSpec } from '../spotGeometry';

/**
 * [VEGAS 2026-11-09] WA Auflage 3×20 cm Vegas Spot — osobny plik (zasada usera).
 *
 * Trzy spoty 20 cm ułożone w TRÓJKĄT: jeden u góry na środku, dwa niżej obok
 * siebie. Punktacja jak na naszym 3-Spocie: 6–10 z wewnętrzną 10 (X), poniżej
 * 6 = pudło (user: „to jest po prostu spot inaczej ustawiony”). Używana na
 * turniejach Vegas (hala) i NFAA; dobra dla Blankbogen.
 *
 * Seria ma u nas 6 strzał (jak 3-Spot na 18 m: dwie kartki), więc rysujemy
 * DWIE kartki jedna nad drugą: strzały 1–3 na górną, 4–6 na dolną, jedna
 * strzała na spot. viewBox 300 × 400, kartka 300 × 195, spot r = 50:
 *  - góra (150, 55), dół (92, 145) i (208, 145) — odstępy > 2r, nie nachodzą.
 * Kolory i strefy = klasyczny spot WA (domyślne w spotGeometry).
 */
const TOP = 0, BOTTOM = 205;
const tri = (sheet: number, y0: number, tag: string) => [
  { id: `${tag}0`, cx: 150, cy: y0 + 55, sheet },
  { id: `${tag}1`, cx: 92, cy: y0 + 145, sheet },
  { id: `${tag}2`, cx: 208, cy: y0 + 145, sheet },
];

export const VEGAS_SPOT: FaceSpotSpec = {
  arrangement: {
    sheets: [{ x: 0, y: TOP, w: 300, h: 195 }, { x: 0, y: BOTTOM, w: 300, h: 195 }],
    spots: [...tri(0, TOP, 'A'), ...tri(1, BOTTOM, 'B')],
    r: 50,
    perSheet: 3,
  },
};

export const VEGAS_FACE_ID = 'Vegas 3-Spot';

export const VEGAS_FACE: TargetFace = {
  id: VEGAS_FACE_ID,
  layout: 'spots',
  // Fizycznie spot 20 cm, ale wymiarami stref = tarcza 40 cm (handicap liczy jak 3-Spot).
  diameterCm: 40,
  scoringRingStep: 10, // 0,2 r przy r = 50 — szerokość pierścienia do skupienia
  minScoringRing: 6,
  rings: [],
  aliases: ['Vegas', 'WA Vegas 3x20cm', 'Vegas 3x20cm'],
  scorable: true,
  spot: VEGAS_SPOT,
  pickOrder: 1.5,
};
