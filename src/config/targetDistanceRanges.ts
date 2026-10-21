import { findTargetFace } from './targetFaces';
import { distanceMeters } from './distances';

/**
 * [TARCZA ↔ DYSTANS] Z jakich dystansów strzela się na daną tarczę
 * (user 2026-10-21, zakresy wg tabel DSB/WA z `archeryRules.ts`).
 *
 * `getRecommendation` odpowiada „ta osoba na tym dystansie → jaka tarcza”;
 * tu jest odwrotność, której potrzebuje bitwa: wspólna tarcza hosta i
 * własne dystanse graczy. Bez tego dało się dołączyć z 18 m do gry na 122 cm.
 *
 * Osobny plik, a nie pole przy definicji tarczy — definicje z geometrią
 * zostają nietknięte. Tarcza bez wpisu (dmuchawka, przyszłe Field/3D) nie
 * ma ograniczeń — lepiej przepuścić niż zablokować komuś grę.
 */
const RANGES: Record<string, readonly [number, number]> = {
  '3-Spot': [18, 18],
  'Vertical 3-Spot': [18, 18],
  '40cm': [18, 18],
  '60cm': [18, 25],          // Schüler B: hala 18 m, tory 25 m
  '80cm': [20, 50],
  '80cm (6-Ring)': [20, 50], // compound tory: 25–50 m
  '122cm': [30, 90],         // DSB: od 35 m barebow Jugend, 40 m Schüler A/Seniorinnen; WA do 90 m
};

/** Zakres [min, max] w metrach albo `null`, gdy tarcza nie ma ograniczeń. */
export function distanceRangeFor(targetType?: string | null): readonly [number, number] | null {
  const face = findTargetFace(targetType);
  return face ? RANGES[face.id] ?? null : null;
}

/** Czy na tarczę `targetType` strzela się z dystansu `m` (np. „70m”). */
export function targetFitsDistance(targetType: string | null | undefined, m: string | null | undefined): boolean {
  const range = distanceRangeFor(targetType);
  if (!range) return true;
  const meters = distanceMeters(m);
  if (!meters) return true; // dystans własny bez liczby — nie blokujemy
  return meters >= range[0] && meters <= range[1];
}

/** Zakres do podpowiedzi w UI, np. „30–90 m” albo „18 m”. */
export function formatRange(targetType?: string | null): string {
  const r = distanceRangeFor(targetType);
  if (!r) return '';
  return r[0] === r[1] ? `${r[0]} m` : `${r[0]}–${r[1]} m`;
}
