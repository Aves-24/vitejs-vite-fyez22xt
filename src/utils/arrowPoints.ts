import { findTargetFace } from '../config/targetFaces';

/**
 * [LICZNIK X 2026-11-09] Ile punktów daje „X” na danej tarczy.
 *
 * Na tarczach WA X to wewnętrzna 10 (10 pkt). W IFAA X leży w środku za 5
 * i służy wyłącznie do remisów (regulamin: „X-ring is used for tie breakers
 * only”) — liczy się 5 punktów, a osobno zbiera się liczba X.
 */
export const xPointsFor = (targetType?: string | null): number =>
  findTargetFace(targetType)?.statsGroup === 'ifaa' ? 5 : 10;

/** Punkty strzały: 'X' wg tarczy, 'M' = 0, liczby wprost. */
export const arrowPoints = (v: string | null | undefined, xPoints = 10): number =>
  v === 'X' ? xPoints : v === 'M' || !v ? 0 : parseInt(v, 10) || 0;
