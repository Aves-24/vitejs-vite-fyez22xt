import type { TargetFace } from '../targetFaces';
import { DOUBLE_COLUMN, type FaceSpotSpec } from '../spotGeometry';
import { FIELD_KEY_COLORS } from './waField';

/**
 * [WA FIELD 20 cm 3-fach 2026-11-09] Feldbogen-Auflage 20 cm, trzy spoty
 * w pionie — osobny plik (zasada usera: nowa tarcza = nowy plik).
 *
 * Geometria IDENTYCZNA z naszym 3-Spotem na 18 m (dwie kartki po trzy spoty,
 * strzały 1–3 lewa, 4–6 prawa, jedna strzała na spot) — różnią się kolory
 * i punktacja: czarny spot z żółtym środkiem, strefy 6–1 jak na dużych
 * tarczach terenowych (6 = D/10, 5 = D/5, 4 = 2D/5, 3 = 3D/5, 2 = 4D/5, 1 = D;
 * złoto 4 cm potwierdza bogenundpfeile.de). Arkusz 22 × 66 cm (Krüger),
 * dystans 5–20 m. Świat statystyk: teren (skala 6).
 */
const YELLOW = '#F2C94C', BLACK = '#333333', WHITE = '#ffffff', LINE = '#333333'; // 6 znaków — PDF (hexRgb) nie czyta skrótu #333

export const FIELD20_SPOT: FaceSpotSpec = {
  arrangement: DOUBLE_COLUMN,
  spotCm: 20,
  rings: [
    { f: 1, fill: BLACK, stroke: WHITE },
    { f: 0.8, fill: BLACK, stroke: WHITE },
    { f: 0.6, fill: BLACK, stroke: WHITE },
    { f: 0.4, fill: BLACK, stroke: WHITE },
    { f: 0.2, fill: YELLOW, stroke: LINE },
    { f: 0.1, fill: YELLOW, stroke: LINE },
  ],
  zones: [
    { f: 0.1, value: '6' },
    { f: 0.2, value: '5' },
    { f: 0.4, value: '4' },
    { f: 0.6, value: '3' },
    { f: 0.8, value: '2' },
    { f: 1, value: '1' },
  ],
};

export const WA_FIELD20_FACE_ID = 'Field 20cm 3-Spot';

export const WA_FIELD20_FACE: TargetFace = {
  id: WA_FIELD20_FACE_ID,
  layout: 'spot3-double',
  diameterCm: 20,
  scoringRingStep: 12.5,
  minScoringRing: 1,
  rings: [],
  // Klawiatura i punktacja ze stref (wartości 6..1), nie ze wzoru spotu WA.
  zones: [
    { r: 6.25, value: 6 },
    { r: 12.5, value: 5 },
    { r: 25, value: 4 },
    { r: 37.5, value: 3 },
    { r: 50, value: 2 },
    { r: 62.5, value: 1 },
  ],
  aliases: ['WA Field 20cm', 'Feld 20cm 3-fach', 'Field 20cm'],
  scorable: true,
  statsGroup: 'field',
  keyColors: FIELD_KEY_COLORS,
  spot: FIELD20_SPOT,
  pickOrder: 13,
};
