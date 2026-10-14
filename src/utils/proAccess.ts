/**
 * Czy konto ma PRO w tej chwili: stałe (`isPremium`), globalna promocja
 * (`isPremiumPromo`) albo trial/prezent — `trialEndsAt` w przyszłości
 * (prezent od admina przesuwa tę datę, patrz utils/proGift).
 *
 * LUSTRO funkcji `hasActivePro` w firestore.rules — reguły liczą z niej
 * limity zestawów i dystansów, więc obie strony muszą mówić to samo.
 * Stąd tylko liczba: reguły nie porównają napisu ISO z czasem, a jedyny
 * napis w bazie to data z przeszłości wpisywana przy „Odbierz PRO".
 */
export function hasActivePro(
  d: { isPremium?: unknown; isPremiumPromo?: unknown; trialEndsAt?: unknown } | null | undefined,
  now: number = Date.now(),
): boolean {
  if (!d) return false;
  if (d.isPremium === true || d.isPremiumPromo === true) return true;
  return typeof d.trialEndsAt === 'number' && d.trialEndsAt > now;
}

/**
 * Długość darmowego okresu próbnego PRO dla nowego konta (decyzja usera
 * 2026-10-14: 40 dni zamiast 30). Po terminie PRO po prostu wygasa — bez
 * automatycznej płatności. LUSTRO: `validTrialEndsAt` w firestore.rules
 * przepuszcza max 41 dni; regulamin (public/legal) podaje tę samą liczbę.
 */
export const TRIAL_DAYS = 40;
