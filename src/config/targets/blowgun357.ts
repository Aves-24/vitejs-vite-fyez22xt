import type { TargetFace, TargetRing } from '../targetFaces';

/**
 * [DMUCHAWKA] Tarcza dmuchawkowa 3-5-7 — druga rodzina tarcz do rury.
 *
 * Osobny plik, zgodnie z zasadą z 2026-09-03: nowa tarcza NIE dopisuje się
 * do pliku z tarczą już przestrzelaną. Tamta (`blowgun.ts`, spot 6-10) zostaje
 * nietknięta — obie krążą w różnych federacjach i katalog unosi obie naraz.
 *
 * ── Czym różni się od wszystkiego, co było ──────────────────────────────────
 *
 * To pierwsza tarcza w aplikacji, której punktacji NIE da się wyliczyć wzorem
 * `10 - floor(odległość / krok)`. Ma trzy strefy o nierównych wartościach:
 * żółty środek 7, czerwona obręcz 5, niebieski pierścień 3. Dlatego powstało
 * pole `zones` w `TargetFace` — to samo rozszerzenie, którego wymagają tarcze
 * IFAA Field z punktacją 5-4-3 (T1 w TODO.md).
 *
 * ── ŹRÓDŁO DANYCH — CZĘŚCIOWO NIEPOTWIERDZONE ───────────────────────────────
 *
 * POTWIERDZONE przez usera 2026-09-04:
 *  - średnica 20 cm
 *  - trzy strefy: 7 (żółta) / 5 (czerwona) / 3 (niebieska)
 *
 * ZMIERZONE ZE ZDJĘCIA, DO POTWIERDZENIA (dlatego ta tarcza NIE MA jeszcze
 * `pickOrder`, czyli nie jest proponowana przy starcie treningu):
 *  - proporcje stref: czerwona ≈ 0,6 średnicy, żółta ≈ 0,2 średnicy.
 *    Pomiar z obrazka dał 0,58 i 0,22, więc 0,6/0,2 jest najbliższą sensowną
 *    interpretacją — to zresztą dokładnie proporcje tarcz IFAA Field.
 *  - brak X do rozstrzygania remisów (na zdjęciu nie widać)
 *  - jedna tarcza na kartce, nie trzy spoty
 *
 * Gdy user potwierdzi wymiary: dopisać `pickOrder` i tarcza pojawi się
 * w wyborze. Gdyby proporcje okazały się inne — zmienia się `zones` i `rings`
 * w tym pliku i NIC więcej.
 */

/**
 * Promienie w viewBoxie 300x300 (promień całej tarczy = 150).
 * 0,6 średnicy → r = 90; 0,2 średnicy → r = 30.
 */
const R_OUTER = 150;
const R_MID = 90;
const R_INNER = 30;

/** Rysowanie: od największego, tak jak `FULL_RINGS`. Kolory jak na zdjęciu. */
const BLOWGUN357_RINGS: readonly TargetRing[] = [
  { r: R_OUTER, fill: '#2F80ED', stroke: '#333333' }, // 3 — niebieski
  { r: R_MID,   fill: '#EB5757', stroke: '#333333' }, // 5 — czerwony
  { r: R_INNER, fill: '#F2C94C', stroke: '#333333' }, // 7 — żółty
];

/** Punktowanie: od środka na zewnątrz, pierwsza pasująca strefa wygrywa. */
const BLOWGUN357_ZONES = [
  { r: R_INNER, value: 7 },
  { r: R_MID,   value: 5 },
  { r: R_OUTER, value: 3 },
] as const;

export const BLOWGUN357_FACE_ID = 'Blowgun 3-5-7';

export const BLOWGUN357_FACE: TargetFace = {
  id: BLOWGUN357_FACE_ID,
  layout: 'single',
  diameterCm: 20,
  // Oba pola są IGNOROWANE, gdy tarcza ma `zones` — `TargetInput` liczy ze stref.
  // Zostawione, bo interfejs ich wymaga; wartości opisują stan faktyczny
  // (najniższa punktowana strefa to 3), a nie zmyślony krok pierścienia.
  scoringRingStep: 0,
  minScoringRing: 3,
  rings: BLOWGUN357_RINGS,
  zones: BLOWGUN357_ZONES,
  aliases: ['Blasrohr 3-5-7', 'Dmuchawka 3-5-7'],
  scorable: true,
  discipline: 'blowgun',
  // `pickOrder` CELOWO POMINIĘTE — patrz nagłówek. Tarcza jest obsługiwana
  // (narysuje się i policzy), ale nie proponujemy jej, dopóki user nie
  // potwierdzi proporcji stref.
};
