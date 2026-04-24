import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Build timestamp injected as compile-time constant.
// Aktualizuje się przy każdym `npm run dev` (start) i `npm run build`.
// W dev HMR nie przelicza tego, ale pełny restart serwera odświeży.
const now = new Date();
const pad = (n: number) => String(n).padStart(2, '0');
const buildStamp =
  `${pad(now.getDate())}.${pad(now.getMonth() + 1)}.${now.getFullYear()} · ` +
  `${pad(now.getHours())}:${pad(now.getMinutes())}`;

// https://vitejs.dev/config/
export default defineConfig({
  define: {
    __BUILD_TIME__: JSON.stringify(buildStamp),
  },
  plugins: [react()],
  build: {
    // Podniesiony limit (1600 KiB) — vendor.js wyjątkowo duży przez Firebase SDK.
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      output: {
        // Code splitting: osobne chunki dla ciężkich bibliotek.
        // Przeglądarka cachuje je niezależnie od kodu aplikacji — deploye
        // appki nie invaliduja cache'u Firebase/React.
        manualChunks: {
          'firebase-vendor': [
            'firebase/app',
            'firebase/auth',
            'firebase/firestore',
            'firebase/app-check',
          ],
          'react-vendor': ['react', 'react-dom'],
          'i18n-vendor': ['i18next', 'react-i18next', 'i18next-browser-languagedetector'],
          'pdf-vendor': ['jspdf', 'jspdf-autotable'],
        },
      },
    },
  },
})
