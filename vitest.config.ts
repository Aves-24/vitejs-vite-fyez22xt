import { defineConfig } from 'vitest/config';

// Testy czystej logiki (npm test). Tylko src/ — tests/rules/ to testy reguł
// Firestore na emulatorze (npm run test:rules), a vitejs-vite-fyez22xt/ to
// nieaktualna kopia projektu.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
