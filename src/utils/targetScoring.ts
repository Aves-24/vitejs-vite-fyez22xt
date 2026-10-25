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

// EKSPORTOWANA LOGIKA OBLICZEŃ - Sercem tarczy 3-Spot jest precyzyjny pomiar odległości
export const calculateSpotScore = (x: number, y: number, isVertical: boolean, isTarget2: boolean): ShotScore => {
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

  // 3. WERYFIKACJA TRAFIENIA: Największy krąg (6 punktów) ma promień 62.5
  if (closest.d <= 62.5) {
    const s = 10 - Math.floor(closest.d / 12.5);
    const val = closest.d <= 6.25 ? "X" : s >= 6 ? s.toString() : "M";
    return { val, sId: closest.id }; // Trafienie w kolor - zwracamy ID spotu
  }

  // Trafienie w białe/szare tło - sId musi być PUSTE
  return { val: "M", sId: "" };
};

/** Pełna tarcza (layout 'single'), środek w (150, 150) viewBoxa 300x300. */
export const scoreSingleFace = (face: TargetFace, x: number, y: number): ShotScore => {
  let val = "M"; const sId = "";
  const d = Math.hypot(x - 150, y - 150);

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
