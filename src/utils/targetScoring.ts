import type { TargetFace } from '../config/targetFaces';

/**
 * [PUNKTACJA] Kliknięcie na tarczy → wartość strzały. Wydzielone 1:1
 * z TargetInput i SpotTarget (2026-10-25), żeby dało się to przetestować —
 * działanie bez zmian.
 *
 * Wynik: `val` = 'X' | '10'..'1' | 'M', `sId` = id spotu (tylko 3-Spot,
 * pilnuje zasady „jedna strzała na spot”), dla pełnej tarczy pusty.
 */
export interface ShotScore { val: string; sId: string }

/**
 * [LINIENSCHUSS] Zasada WA: strzała, która DOTYKA linii, dostaje wyższą
 * wartość. Kliknięcie to środek przestrzeliny, więc pierścień liczymy od
 * krawędzi strzały bliższej środka: odległość − promień strzały.
 *
 * Do 2026-11-03 liczyliśmy ze środka i strzała na linii dostawała punkt
 * mniej, niż zapisałby sędzia. Średnica na razie stała — 6 mm to raczej
 * cienka strzała, więc w razie wątpliwości liczymy ostrożnie, nigdy za dużo.
 */
export const ARROW_DIAMETER_MM = 6;

/** Promień strzały w jednostkach viewBoxa danej tarczy. Dmuchawka — 0 (inne zasady, cienka strzałka). */
export const arrowRadiusUnits = (face: TargetFace, diameterMm = ARROW_DIAMETER_MM): number => {
  if (!face.scorable || face.discipline === "blowgun" || !face.diameterCm) return 0;
  // Pełna tarcza: 300 jednostek = cała średnica. Spot: promień 62,5 =
  // zewnętrzna krawędź „6” = 1/4 średnicy pełnej tarczy (40 cm → 10 cm).
  const isSpot = face.layout === "spot3-double" || face.layout === "spot3-single";
  const mmPerUnit = isSpot ? (face.diameterCm * 10) / 4 / 62.5 : (face.diameterCm * 10) / 300;
  return diameterMm / 2 / mmPerUnit;
};

// EKSPORTOWANA LOGIKA OBLICZEŃ - Sercem tarczy 3-Spot jest precyzyjny pomiar odległości
export const calculateSpotScore = (x: number, y: number, isVertical: boolean, isTarget2: boolean, arrowR = 0): ShotScore => {
  const tX = !isVertical ? (isTarget2 ? 225 : 75) : 150;

  // 1. Blokada Vegas (nie pozwalamy na zaliczenie punktów z nieaktywnej połowy)
  if (!isVertical) {
    if ((!isTarget2 && x > 150) || (isTarget2 && x <= 150)) {
      return { val: "M", sId: "" };
    }
  }

  // 2. Szukamy najbliższego środka spośród 3 tarcz (TOP, MID, BOT)
  const centers = [66, 200, 333].map((cy, i) => ({
    id: `${!isVertical ? (isTarget2 ? 'R' : 'L') : 'V'}${i}`,
    d: Math.hypot(x - tX, y - cy)
  }));

  const closest = centers.reduce((p, n) => p.d < n.d ? p : n);
  // [LINIENSCHUSS] Od krawędzi strzały, nie od jej środka.
  const d = Math.max(0, closest.d - arrowR);

  // 3. WERYFIKACJA TRAFIENIA: Największy krąg (6 punktów) ma promień 62.5
  if (d <= 62.5) {
    const s = 10 - Math.floor(d / 12.5);
    const val = d <= 6.25 ? "X" : s >= 6 ? s.toString() : "M";
    return { val, sId: closest.id }; // Trafienie w kolor - zwracamy ID spotu
  }

  // Trafienie w białe/szare tło - sId musi być PUSTE
  return { val: "M", sId: "" };
};

/** Pełna tarcza (layout 'single'), środek w (150, 150) viewBoxa 300x300. */
export const scoreSingleFace = (face: TargetFace, x: number, y: number, arrowR = 0): ShotScore => {
  let val = "M"; const sId = "";
  // [LINIENSCHUSS] Od krawędzi strzały, nie od jej środka.
  const d = Math.max(0, Math.hypot(x - 150, y - 150) - arrowR);

  // [STREFY] Tarcze o nierównej punktacji (dmuchawkowa 3-5-7, w przyszłości
  // IFAA 5-4-3) nie dają się wyliczyć wzorem `10 - floor(d / krok)` — mają
  // jawną listę stref. Pierwsza strefa, w którą trafiamy, wygrywa.
  if (face.zones) {
    const zone = face.zones.find(z => d <= z.r);
    return { val: zone ? String(zone.value) : "M", sId: "" };
  }

  const ring = face.scoringRingStep;
  const maxRadius = ring * 10;
  if (d <= maxRadius) {
    const s = 10 - Math.floor(d / ring);
    val = d <= ring / 2 ? "X" : s >= 1 ? s.toString() : "M";
    // Tarcza 6-Ring punktuje tylko 10..5 — niżej jest pudło.
    if (s < face.minScoringRing) val = "M";
  }
  return { val, sId: sId || "" };
};
