import { isFullFace } from '../config/targetFaces';
import { centerFor } from './spread';
import { ringScale } from './arrowStats';

/**
 * [PODSUMOWANIE TRENINGU] Grupa na tarczy (2026-10-29): gdzie siedzi środek
 * grupy względem środka tarczy i jak jest duża — w cm, do regulacji celownika.
 *
 * Spot: każda kropka liczona względem SWOJEGO spotu (centerFor), więc grupa
 * „lewo-dół” na trzech spotach daje jedno przesunięcie, nie rozmazaną chmurę.
 *
 * Środek = mediana x i y. Średnica = koło wokół środka grupy, w którym leży
 * 80% strzał. Pojedyncza pomylona strzała nie rozdmuchuje wtedy wyniku.
 */

/** Poniżej tylu strzał z pozycją grupa nic nie znaczy. */
export const GROUP_MIN_DOTS = 3;
/** Do środka (w pierścieniach) przesunięcie uznajemy za „mittig”. */
export const GROUP_CENTER_RINGS = 0.3;
const COVER = 0.8;

const median = (v: number[]): number => {
  const s = [...v].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export interface GroupStats {
  n: number;
  /** Przesunięcie środka grupy w cm (x w prawo, y w dół). */
  dxCm: number;
  dyCm: number;
  /** Przesunięcie w pierścieniach — do progu „mittig”. */
  offsetRings: number;
  /** Średnica koła z 80% strzał, w cm. */
  diameterCm: number;
  /** Do rysowania na pełnej tarczy (układ 300×300); na spotach null. */
  svg: { cx: number; cy: number; r: number } | null;
}

export function groupStats(ends: Array<{ dots?: Array<{ x: number | null; y: number | null }> }>, targetType: string): GroupStats | null {
  const offs: Array<[number, number]> = [];
  ends.forEach(end => end.dots?.forEach(d => {
    if (d?.x == null || d?.y == null) return;
    const { cX, cY } = centerFor(targetType, d.x, d.y);
    offs.push([d.x - cX, d.y - cY]);
  }));
  if (offs.length < GROUP_MIN_DOTS) return null;

  // Mediana, nie średnia: jedna dzika strzała nie ciągnie środka grupy.
  const mx = median(offs.map(o => o[0]));
  const my = median(offs.map(o => o[1]));
  const radii = offs.map(([x, y]) => Math.hypot(x - mx, y - my)).sort((a, b) => a - b);
  const r = radii[Math.max(0, Math.ceil(radii.length * COVER) - 1)];

  const { unit, cm } = ringScale(targetType);
  const toCm = (v: number) => (v / unit) * cm;
  return {
    n: offs.length,
    dxCm: toCm(mx),
    dyCm: toCm(my),
    offsetRings: Math.hypot(mx, my) / unit,
    diameterCm: toCm(2 * r),
    svg: isFullFace(targetType) ? { cx: 150 + mx, cy: 150 + my, r } : null,
  };
}
