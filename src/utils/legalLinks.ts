// Wersjonowanie polityki prywatności — przy istotnej zmianie treści podbij
// wersję; appka poprosi użytkowników o ponowną akceptację (LEGAL_DATA_INVENTORY.md §5).
// Wersja zgody (privacyConsent / parentalConsent). Dokumenty są w v1.2
// (2026-09-25: usunięta pogoda/lokalizacja — mniej przetwarzania), ale zgoda
// na v1.1 obejmuje v1.2, więc NIE podbijamy — inaczej opiekunowie niepełnoletnich
// musieliby zatwierdzać ponownie (needsParentalConsent porównuje wersję).
// v1.3 (2026-09-28, C36): §2.4 dokładniej wylicza, co widzi trener (to samo co
// popup zgody C35) — doprecyzowanie, bez nowego przetwarzania, więc też bez podbicia.
export const PRIVACY_POLICY_VERSION = '1.1';

// Strony prawne to statyczne pliki w public/legal/ — serwowane przez Firebase
// Hosting przed SPA-rewrite, dostępne też bez logowania (wymóg Play/App Store).
export function privacyPolicyUrl(lang: string): string {
  if (lang.startsWith('de')) return '/legal/datenschutz.html';
  if (lang.startsWith('pl')) return '/legal/polityka-prywatnosci.html';
  return '/legal/privacy-policy.html';
}

export const IMPRESSUM_URL = '/legal/impressum.html';
