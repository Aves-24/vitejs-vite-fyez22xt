import { test, expect } from '@playwright/test';
import { resetEmulators, registerUser, shoot, nav, watchErrors, expectNoErrors, adminListDocs, syncWrites, reloadAfterSync } from './helpers';

// Tryb offline: trening zapisany bez sieci widać od razu (cache Firestore),
// a po powrocie sieci trafia do bazy i zostaje po przeładowaniu.
test.beforeEach(async ({ request }) => resetEmulators(request));

test('trening bez sieci: widoczny od razu, po powrocie sieci w bazie', async ({ page, context, request }) => {
  test.setTimeout(120_000);
  const uid = await registerUser(page, 'Offi');
  await syncWrites(page);
  // W trybie dev nie ma service workera (na prod trzyma moduły offline) —
  // Tagebuch i ekran treningu ładujemy raz przy sieci, żeby moduły były w pamięci.
  await nav(page, 'Tagebuch').click();
  await expect(page.getByRole('main')).toBeVisible();
  await page.getByRole('navigation').getByRole('button', { name: 'target' }).click();
  await page.getByRole('button', { name: 'Training', exact: true }).click();
  await expect(page.getByRole('button', { name: 'X', exact: true })).toBeVisible();
  await page.goBack();
  const errors = watchErrors(page);

  await context.setOffline(true);
  // Wstecz z ekranu strzał = Vorbereitung; pasek „Kein Netz” mówi, że zapis czeka.
  await expect(page.getByText(/Kein Netz/)).toBeVisible();
  await page.getByRole('button', { name: 'Training', exact: true }).click();
  await shoot(page, ['X', '10', '9', '9', '8', '7']);
  await page.getByRole('button', { name: 'Trainingseinheit speichern' }).click();
  await page.getByRole('button', { name: /^Als unvollständig markieren/ }).click();

  // Bez sieci: Home i Tagebuch pokazują trening z lokalnego cache.
  await expect(page.getByRole('button', { name: /^Zuletzt 53/ })).toBeVisible();
  await nav(page, 'Tagebuch').click();
  await expect(page.getByRole('button', { name: /Training 18m 53 Ringe/ })).toBeVisible();
  expect(await adminListDocs(request, `users/${uid}/sessions`)).toHaveLength(0);

  // Sieć wraca → zapis dochodzi do bazy.
  await context.setOffline(false);
  await syncWrites(page);
  await expect.poll(async () => (await adminListDocs(request, `users/${uid}/sessions`)).length, { timeout: 15_000 }).toBe(1);

  await reloadAfterSync(page);
  await expect(page.getByRole('button', { name: /^Zuletzt 53/ })).toBeVisible();
  // Błędy sieci w trakcie offline to nie błędy apki.
  const real = errors.filter(e => !/ERR_INTERNET_DISCONNECTED|Failed to fetch|network|offline|Could not reach Cloud Firestore/i.test(e));
  await expectNoErrors(page, real, 'offline');
});
