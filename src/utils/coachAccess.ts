/**
 * [TRENER] Tryb trenera włącza każdy sam (Ustawienia → TRENER) i dostaje
 * FREE_COACH_SLOTS miejsc za darmo. Większy pakiet = `coachLimit`, które
 * pisze tylko admin (pole chronione w regułach).
 *
 * LUSTRO funkcji `coachSlots` w firestore.rules — serwer odrzuca dopisanie
 * ucznia ponad ten limit, więc UI musi liczyć tak samo.
 */
export const FREE_COACH_SLOTS = 1;

export function effectiveCoachLimit(
  d: { isCoach?: unknown; coachLimit?: unknown } | null | undefined,
): number {
  if (!d || d.isCoach !== true) return 0;
  const bought = typeof d.coachLimit === 'number' ? d.coachLimit : 0;
  return Math.max(bought, FREE_COACH_SLOTS);
}
