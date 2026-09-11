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
