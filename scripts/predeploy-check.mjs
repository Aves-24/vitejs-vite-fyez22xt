// [CI BRAMKA] Hook `hosting.predeploy` z firebase.json (2026-10-25).
//
// Ręczne `npx firebase deploy --only hosting` z komputera omijało CI —
// wdrażało to, co akurat leżało w dist/, bez lintu i testów. Teraz przed
// każdym ręcznym deployem idą lint + testy logiki + świeży build; błąd
// zatrzymuje deploy.
//
// W GitHub Actions (CI=true) nic nie robimy: tam to samo sprawdził już job
// `lint-build`, a deploy wysyła DOKŁADNIE ten przetestowany build (artefakt).
import { spawnSync } from 'node:child_process';

if (process.env.CI === 'true') {
  console.log('[predeploy] CI — lint/testy/build sprawdzone w jobie lint-build, pomijam.');
  process.exit(0);
}

for (const script of ['lint', 'test', 'build']) {
  console.log(`\n[predeploy] npm run ${script}`);
  const r = spawnSync('npm', ['run', script], { stdio: 'inherit', shell: true });
  if (r.status !== 0) {
    console.error(`\n[predeploy] npm run ${script} nie przeszło — deploy ZATRZYMANY.`);
    process.exit(r.status || 1);
  }
}
console.log('\n[predeploy] lint + testy + build OK.');
