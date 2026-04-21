import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  // Ignoruj artefakty buildu i locales
  {
    ignores: ['dist/**', 'node_modules/**', 'src/locales/**'],
  },

  // Baza JS
  js.configs.recommended,

  // TypeScript
  ...tseslint.configs.recommended,

  // Ustawienia globalne dla przeglądarki + react-hooks
  {
    plugins: {
      'react-hooks': reactHooks,
    },
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.es2020,
      },
    },
    rules: {
      // React Hooks — błędy krytyczne
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',

      // any — warn (dużo legacy kodu, refaktor potem)
      '@typescript-eslint/no-explicit-any': 'warn',
      // Nieużywane zmienne — warn, ignoruj _prefiks
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],

      // NBSP i inne whitespace w JSX/i18n — false positive, wyłączone
      'no-irregular-whitespace': 'off',

      // console.log — warn (dopuść warn/error)
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  }
);
