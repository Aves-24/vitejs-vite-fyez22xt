/**
 * [PARCOURS 2026-11-09] Runda terenowa jak na zawodach IFAA: 28 tarcz (2 × 14),
 * każda z innym dystansem i często inną wielkością tarczy (Field Round:
 * 65/50/35/20 cm, dystanse 80 yd … 20 ft). Sesja ma wtedy „dystans” Parcours,
 * a każda seria (= tarcza) niesie własne `distance` i `targetType`.
 *
 * Stały napis i id kubełka — statystyki Parcours zbierają się w jednym
 * miejscu, niezależnie od tego, jakie dystanse padły na trasie.
 */
export const PARCOURS_DISTANCE = 'Parcours';
export const PARCOURS_DISTANCE_ID = 'd_parcours';

export const isParcours = (s?: { distance?: string | null } | null): boolean => s?.distance === PARCOURS_DISTANCE;

/** Seria z własną tarczą i dystansem (tylko w Parcours). */
export interface ParcoursEnd { arrows?: string[]; distance?: string; targetType?: string }

/** Czy seria ma zapisany własny dystans i tarczę (handicap liczy wtedy z nich). */
export const hasPerEndTargets = (ends?: ParcoursEnd[] | null): boolean =>
  Array.isArray(ends) && ends.length > 0 && ends.every(e => !!e.distance && !!e.targetType);
