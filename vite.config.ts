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
    // Vendor.js (~1.5 MB) jest duży bo Firebase SDK jest ciężki.
    // Docelowo: code splitting (TODO #6). Na razie podnosimy limit ostrzeżenia.
    chunkSizeWarningLimit: 1600,
  },
})
