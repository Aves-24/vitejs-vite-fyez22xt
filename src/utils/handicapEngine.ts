// ─────────────────────────────────────────────────────────────────────────────
// GROT-X — Kalkulator Handicapu Łuczniczego
// Normalizacja kątowa do referencji olimpijskiej: 70m / 122cm (WA)
// Skala: 0 (idealny) — 99 (początkujący)  ←  niższy = lepszy
// ─────────────────────────────────────────────────────────────────────────────

export interface HandicapBand {
  max: number;
  labelKey: string;
  descKey: string;
  color: string;      // kolor tekstu / akcentu
  bg: string;         // kolor tła chipa
}

/** Przedziały handicapu — od najlepszego do najsłabszego */
export const HANDICAP_BANDS: HandicapBand[] = [
  { max: 10,  labelKey: 'home.handicap.elite',         descKey: 'home.handicap.eliteDesc',    color: '#7a5c00', bg: '#FFCC00' },
  { max: 20,  labelKey: 'home.handicap.advanced',      descKey: 'home.handicap.advancedDesc', color: '#ffffff', bg: '#FF3300' },
  { max: 35,  labelKey: 'home.handicap.competitor',    descKey: 'home.handicap.competitorDesc',color: '#ffffff', bg: '#0099FF' },
  { max: 50,  labelKey: 'home.handicap.intermediate',  descKey: 'home.handicap.intermediateDesc', color: '#ffffff', bg: '#444444' },
  { max: 65,  labelKey: 'home.handicap.amateur',       descKey: 'home.handicap.amateurDesc',  color: '#333333', bg: '#cccccc' },
  { max: 99,  labelKey: 'home.handicap.beginner',      descKey: 'home.handicap.beginnerDesc', color: '#333333', bg: '#eeeeee' },
];

export function getHandicapBand(handicap: number): HandicapBand {
  return HANDICAP_BANDS.find(b => handicap <= b.max) ?? HANDICAP_BANDS[HANDICAP_BANDS.length - 1];
}

function getTargetDiameterCm(targetType: string): number {
  switch (targetType) {
    case 'Full':    return 122;
    case 'WA 80cm': return 80;
    case '40cm':    return 40;
    case '3-Spot':  return 40;
    default:        return 80;
  }
}

/**
 * Oblicza handicap dla jednej sesji.
 *
 * Metoda: normalizacja kątowej wielkości tarczy do referencji olimpijskiej.
 *   angularSize     = diameterCm / distanceM
 *   reference       = 122 / 70  (≈ 1.743)
 *   diffFactor      = reference / angularSize   (<1 = łatwiej, >1 = trudniej)
 *   adjustedAvg     = min(10, rawAvg × diffFactor)
 *   handicap        = 100 − adjustedAvg × 10
 *
 * Przykłady:
 *   avg 9.0 @ 70m/122cm  → handicap 10  (elita)
 *   avg 9.0 @ 18m/40cm   → handicap 29  (zawodnik, bo warunki łatwiejsze)
 *   avg 7.5 @ 50m/122cm  → handicap 30
 */
export function calculateSessionHandicap(
  avgScore: number,
  distanceM: number,
  targetType: string
): number {
  if (avgScore <= 0 || distanceM <= 0) return 99;

  const diamCm        = getTargetDiameterCm(targetType);
  const angularSize   = diamCm / distanceM;
  const refAngular    = 122 / 70;
  const diffFactor    = refAngular / angularSize;
  const adjustedAvg   = Math.min(10, avgScore * diffFactor);
  const handicap      = Math.round(100 - adjustedAvg * 10);

  return Math.max(0, Math.min(99, handicap));
}

/**
 * Oblicza bieżący handicap użytkownika.
 * Bierze średnią najlepszych 60% z ostatnich sesji (wzorowane na systemie golfowym).
 */
export function calculateCurrentHandicap(last10Handicaps: number[]): number {
  const valid = last10Handicaps.filter(h => h >= 0 && h <= 99);
  if (valid.length === 0) return 99;

  const sorted = [...valid].sort((a, b) => a - b);
  const count  = Math.max(1, Math.round(sorted.length * 0.6));
  const best   = sorted.slice(0, count);
  return Math.round(best.reduce((s, h) => s + h, 0) / best.length);
}
