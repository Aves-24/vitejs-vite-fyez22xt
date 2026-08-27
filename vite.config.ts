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
export default defineConfig(({ command }) => ({
  // Prod build: console.log/info/debug oznaczone jako "pure" — minifier je wycina.
  // Logi diagnostyczne (np. "Trener AI: ...") ujawniały dane usera w konsoli produkcyjnej.
  // console.error i console.warn zostają — potrzebne do diagnostyki błędów na produkcji.
  esbuild: command === 'build'
    ? { pure: ['console.log', 'console.info', 'console.debug'] }
    : {},
  server: {
    headers: {
      // signInWithPopup wymaga aby popup mógł komunikować się z openerem.
      // Vite dev server domyślnie wysyła 'same-origin' co to blokuje.
      'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
    },
  },
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
        //
        // [PERF] Forma FUNKCYJNA, nie obiektowa. Przy formie obiektowej Rollup
        // wrzucił runtime-helper Vite (__vitePreload, obsługa dynamicznych
        // import()) do chunka 'pdf-vendor'. Efekt: entry statycznie importował
        // pdf-vendor, więc CAŁY jsPDF (399 KB / 134 KB gz) leciał w
        // <link rel=modulepreload> na starcie aplikacji — mimo że eksport PDF
        // siedzi za lazy-loadowanym StatsView. Helper ma teraz własny mikro-chunk.
        manualChunks(id) {
          if (id.includes('vite/preload-helper')) return 'vite-preload';

          const pkg = id.split(/node_modules[\\/]/).pop();
          if (!id.includes('node_modules') || !pkg) return;
          // Nazwa paczki: '@firebase/app/dist/x.js' -> '@firebase/app'
          const parts = pkg.split(/[\\/]/);
          const name = parts[0].startsWith('@') ? parts[0] + '/' + parts[1] : parts[0];

          if (name === 'firebase' || name.startsWith('@firebase/')) return 'firebase-vendor';
          if (name === 'i18next' || name === 'react-i18next'
              || name === 'i18next-browser-languagedetector') return 'i18n-vendor';
          if (name === 'react' || name === 'react-dom' || name === 'scheduler') return 'react-vendor';
          if (name === 'jspdf' || name === 'jspdf-autotable') return 'pdf-vendor';
        },
      },
    },
  },
}))
