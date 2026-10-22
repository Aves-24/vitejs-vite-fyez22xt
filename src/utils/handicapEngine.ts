import { resolveTargetFace } from '../config/targetFaces';

// ─────────────────────────────────────────────────────────────────────────────
// GROT-X Handicap — model rozrzutu strzał (2026-10-22)
//
// Własna implementacja modelu J. Atkinsona (archeryutils, licencja MIT), na
// bazie prac D. Lane'a: handicap opisuje KĄTOWY rozrzut strzał, a z rozrzutu
// i średnic pierścieni wynika oczekiwana średnia na strzałę. Dzięki temu hala
// i 70 m są porównywalne — poprzedni wzór skalował średnią liniowo i dawał
// strzelcom z daleka za dobry handicap (8,0 na 70 m = 20 zamiast 34).
//
// Skala: niżej = lepiej, 0 ≈ poziom rekordu świata, typowo 0–150.
// ─────────────────────────────────────────────────────────────────────────────

const ANG_0 = 5.0e-4;  // kąt bazowy [rad]
const STEP = 3.5;      // % przyrostu rozrzutu na 1 punkt handicapu
const DATUM = 6.0;     // przesunięcie punktu zerowego
const KD = 0.00365;    // dodatkowy rozrzut rosnący z dystansem (wiatr, lot)
const ARROW_D_OUTDOOR = 5.5e-3; // [m]
const ARROW_D_INDOOR = 9.3e-3;  // grube strzały halowe łatwiej łapią linię

export const HANDICAP_MIN = 0;
export const HANDICAP_MAX = 150;

/** Odchylenie rozrzutu na tarczy [m] dla handicapu na danym dystansie. */
export function sigmaR(handicap: number, distanceM: number): number {
  return distanceM * ANG_0 * Math.pow(1 + STEP / 100, handicap + DATUM) * Math.exp(KD * distanceM);
}

/** Geometria tarczy potrzebna modelowi: średnica i najniższy punktowany pierścień. */
export interface FaceSpec { diameterM: number; minRing: number }

/**
 * Tarcze z katalogu, które model umie policzyć: koncentryczne 10..1,
 * 6-Ring (10..5) i spoty (10..6). Tarcze ze strefami (dmuchawka, Field 5-4-3)
 * i trening techniczny → null — nie wchodzą do handicapu.
 */
export function faceSpecFor(targetType?: string | null): FaceSpec | null {
  const face = resolveTargetFace(targetType);
  if (!face.scorable || face.zones || face.discipline || face.diameterCm <= 0) return null;
  const minRing = face.layout === 'spot3-double' || face.layout === 'spot3-single' ? 6 : face.minScoringRing;
  return { diameterM: face.diameterCm / 100, minRing };
}

/** Oczekiwana średnia na strzałę przy danym handicapie. */
export function expectedArrowScore(handicap: number, distanceM: number, spec: FaceSpec): number {
  const arrowR = (distanceM <= 25 ? ARROW_D_INDOOR : ARROW_D_OUTDOOR) / 2;
  const sig = sigmaR(handicap, distanceM);
  const ringWidth = spec.diameterM / 20;
  const lastK = 11 - spec.minRing;
  let score = 10;
  // Każdy pierścień od środka: szansa wyjścia poza niego odejmuje skok punktów.
  for (let k = 1; k <= lastK; k++) {
    const drop = k === lastK ? spec.minRing : 1;
    score -= drop * Math.exp(-(((arrowR + k * ringWidth) / sig) ** 2));
  }
  return score;
}

/**
 * Handicap jednej sesji ze średniej na strzałę. Zaokrąglenie w górę (gorzej),
 * jak w oryginale. null = tarcza/dystans poza modelem.
 */
export function sessionHandicap(avgScore: number, distanceM: number, targetType?: string | null): number | null {
  const spec = faceSpecFor(targetType);
  if (!spec || !(distanceM > 0) || !(avgScore >= 0)) return null;
  if (avgScore >= expectedArrowScore(HANDICAP_MIN, distanceM, spec)) return HANDICAP_MIN;
  if (avgScore <= expectedArrowScore(HANDICAP_MAX, distanceM, spec)) return HANDICAP_MAX;
  let lo = HANDICAP_MIN;
  let hi = HANDICAP_MAX;
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    if (expectedArrowScore(mid, distanceM, spec) > avgScore) lo = mid; else hi = mid;
  }
  return Math.ceil(lo - 1e-9);
}

/**
 * Bieżący handicap: średnia najlepszych 60% z ostatnich sesji
 * (jeden słaby dzień nie psuje wyniku).
 */
export function calculateCurrentHandicap(recent: number[]): number | null {
  const valid = recent.filter(h => Number.isFinite(h) && h >= HANDICAP_MIN && h <= HANDICAP_MAX);
  if (valid.length === 0) return null;
  const sorted = [...valid].sort((a, b) => a - b);
  const best = sorted.slice(0, Math.max(1, Math.round(sorted.length * 0.6)));
  return Math.round(best.reduce((s, h) => s + h, 0) / best.length);
}
