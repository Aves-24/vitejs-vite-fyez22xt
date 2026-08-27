import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

// [PERF] Tłumaczenia ładowane dynamicznie — tylko język, którego user faktycznie
// używa. Wcześniej pl/en/de szły statycznym importem do chunka wejściowego:
// 191 KB źródeł, ~⅓ całego index.js, mimo że nikt nie potrzebuje trzech naraz.
//
// Bezpieczeństwo fallbacku: pl i de mają KOMPLET kluczy z en (sprawdzane
// w buildzie przez scripts/i18n-parity.mjs), więc fallbackLng: 'en' nigdy nie
// musi sięgnąć po niezaładowaną paczkę. Gdyby ktoś dodał klucz tylko do en,
// build padnie zamiast pokazać surowy klucz polskiemu użytkownikowi.

export const SUPPORTED_LNGS = ['pl', 'en', 'de'] as const;
export type Lng = (typeof SUPPORTED_LNGS)[number];

const loaders: Record<Lng, () => Promise<{ views: object; components: object }>> = {
  pl: () => import('./locales/pl'),
  en: () => import('./locales/en'),
  de: () => import('./locales/de'),
};

/** 'de-DE' -> 'de'; nieobsługiwany język -> 'en' (zgodnie z fallbackLng). */
function normalize(lng?: string | null): Lng {
  const base = (lng || 'en').split('-')[0].toLowerCase();
  return (SUPPORTED_LNGS as readonly string[]).includes(base) ? (base as Lng) : 'en';
}

/** Dociąga paczkę tłumaczeń, jeśli jeszcze jej nie ma w pamięci. */
export async function loadLanguage(lng?: string | null): Promise<Lng> {
  const key = normalize(lng);
  if (!i18n.hasResourceBundle(key, 'translation')) {
    const mod = await loaders[key]();
    i18n.addResourceBundle(key, 'translation', { ...mod.views, ...mod.components }, true, true);
  }
  return key;
}

/**
 * Przełączenie języka z UI. Najpierw pobiera paczkę, dopiero potem przełącza —
 * inaczej i18next przerysowałby ekran surowymi kluczami na czas pobierania.
 */
export async function switchLanguage(lng: string): Promise<void> {
  const key = await loadLanguage(lng);
  await i18n.changeLanguage(key);
}

/** Inicjalizacja + pobranie wykrytego języka. Wołane raz, z main.tsx. */
export async function initI18n(): Promise<typeof i18n> {
  await i18n
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
      debug: false,
      fallbackLng: 'en',
      detection: {
        // localStorage = świadomy wybór użytkownika (ma priorytet);
        // navigator = język przeglądarki dla pierwszej wizyty (zamiast twardego EN)
        order: ['localStorage', 'navigator'],
        caches: ['localStorage'],
      },
      // 'de-DE' / 'pl-PL' z navigatora mapujemy na nasze zasoby 'de' / 'pl'
      load: 'languageOnly',
      supportedLngs: [...SUPPORTED_LNGS],
      nonExplicitSupportedLngs: true,
      interpolation: {
        escapeValue: false, // React samo escape'uje wartości, chroniąc przed XSS
      },
      // Paczki dochodzą przez addResourceBundle w loadLanguage().
      resources: {},
      partialBundledLanguages: true,
    });

  await loadLanguage(i18n.resolvedLanguage || i18n.language);

  // Siatka bezpieczeństwa: gdyby język zmienił się z pominięciem
  // switchLanguage() (np. inna karta zapisała localStorage), paczka i tak
  // zostanie dociągnięta — kosztem krótkiego mignięcia kluczy.
  i18n.on('languageChanged', (lng) => {
    void loadLanguage(lng);
  });

  return i18n;
}

export default i18n;
