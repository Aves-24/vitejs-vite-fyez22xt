import i18n from '../i18n';

/**
 * Liczba z separatorem dziesiętnym wg języka aplikacji: DE/PL „7,85”, EN „7.85”.
 * Zamiast `toFixed()` wszędzie, gdzie liczbę widzi użytkownik.
 */
export const fmtNum = (v: number, digits: number): string =>
  (Number.isFinite(v) ? v : 0).toLocaleString(i18n.language || 'de', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
