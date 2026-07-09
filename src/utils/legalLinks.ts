// Wersjonowanie polityki prywatności — przy istotnej zmianie treści podbij
// wersję; appka poprosi użytkowników o ponowną akceptację (LEGAL_DATA_INVENTORY.md §5).
export const PRIVACY_POLICY_VERSION = '1.1';

// Strony prawne to statyczne pliki w public/legal/ — serwowane przez Firebase
// Hosting przed SPA-rewrite, dostępne też bez logowania (wymóg Play/App Store).
export function privacyPolicyUrl(lang: string): string {
  if (lang.startsWith('de')) return '/legal/datenschutz.html';
  if (lang.startsWith('pl')) return '/legal/polityka-prywatnosci.html';
  return '/legal/privacy-policy.html';
}

export const IMPRESSUM_URL = '/legal/impressum.html';
