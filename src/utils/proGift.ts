/**
 * [PREZENT PRO] Admin dopisuje komuś (albo całemu klubowi) N miesięcy PRO.
 *
 * Prezent przesuwa `trialEndsAt` — to jedyne pole „PRO ważne do" w modelu
 * (obok stałego `isPremium` i globalnego `isPremiumPromo`) i większość
 * ekranów już liczy z niego dostęp PRO. Własne pole wymagałoby przepisania
 * kilkunastu miejsc, które sprawdzają PRO.
 *
 * Miesiące doliczamy do tego, co ktoś JUŻ ma: aktywny dostęp wydłużamy od
 * jego końca, wygasły albo brak — od dziś. Stałe PRO pomijamy.
 *
 * `proGiftedAt` / `proGiftMonths` służą tylko do wyświetlania (Home, zakładka
 * PRO) — żeby prezent nie udawał 30-dniowego okresu próbnego.
 */

export const PRO_GIFT_MAX_MONTHS = 12;

/** Ile dni po prezencie Home pokazuje komunikat „dostałeś PRO". */
export const PRO_GIFT_ANNOUNCE_DAYS = 14;

/** Dodaje miesiące kalendarzowe; 31.01 + 1 → 28/29.02, a nie 03.03. */
export function addMonthsClamped(ms: number, months: number): number {
  const d = new Date(ms);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, lastDay));
  return d.getTime();
}

/** `trialEndsAt` bywa liczbą (ms) albo napisem ISO — zwraca ms albo null. */
export function proEndMs(trialEndsAt: unknown): number | null {
  if (trialEndsAt === null || trialEndsAt === undefined || trialEndsAt === '') return null;
  const ms = new Date(trialEndsAt as string | number).getTime();
  return Number.isFinite(ms) ? ms : null;
}

export type ProGiftPlan =
  | { kind: 'PERMANENT' }
  | { kind: 'EXTEND'; currentEnd: number | null; newEnd: number };

export function planProGift(
  user: { isPremium?: boolean; trialEndsAt?: unknown },
  months: number,
  now: number = Date.now(),
): ProGiftPlan {
  if (user.isPremium) return { kind: 'PERMANENT' };
  const end = proEndMs(user.trialEndsAt);
  const active = end !== null && end > now;
  return {
    kind: 'EXTEND',
    currentEnd: active ? end : null,
    newEnd: addMonthsClamped(active ? end : now, months),
  };
}
