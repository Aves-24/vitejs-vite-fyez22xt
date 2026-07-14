import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

// Importujemy nasze moduły językowe
import { views as viewsPL, components as componentsPL } from './locales/pl';
import { views as viewsEN, components as componentsEN } from './locales/en';
import { views as viewsDE, components as componentsDE } from './locales/de';

i18n
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
    supportedLngs: ['pl', 'en', 'de'],
    nonExplicitSupportedLngs: true,
    interpolation: {
      escapeValue: false, // React samo escape'uje wartości, chroniąc przed XSS
    },
    resources: {
      pl: {
        translation: {
          ...viewsPL,
          ...componentsPL
        }
      },
      en: {
        translation: {
          ...viewsEN,
          ...componentsEN
        }
      },
      de: {
        translation: {
          ...viewsDE,
          ...componentsDE
        }
      }
    }
  });

export default i18n;
