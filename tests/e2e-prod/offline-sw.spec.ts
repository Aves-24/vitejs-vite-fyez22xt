import { test, expect } from '@playwright/test';
import { resetEmulators, registerUser, shoot, nav, adminListDocs } from '../e2e/helpers';

// Strzelnica bez zasięgu na PRAWDZIWYM buildzie: service worker trzyma apkę,
// więc start bez sieci (pełne przeładowanie) otwiera ją z cache'u; trening
// zapisany offline trafia do bazy po powrocie sieci.
test.beforeEach(async ({ request }) => resetEmulators(request));

test('start apki bez sieci (service worker), trening offline, synchronizacja', async ({ page, context, request }) => {
  test.setTimeout(150_000);
  const uid = await registerUser(page, 'Strzelnica');

  // Service worker zainstalowany, przejął stronę i dogrzał widoki.
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller), { timeout: 20_000 }).toBe(true);
  await page.waitForTimeout(4000); // dogrzewanie lazy widoków (warm cache)

  // Bez sieci: pełne przeładowanie — apka wstaje z cache'u SW.
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'GROT-X', level: 1 })).toBeVisible({ timeout: 20_000 });

  // Trening offline.
  await page.getByRole('navigation').getByRole('button', { name: 'target' }).click();
  await page.getByRole('button', { name: 'Training', exact: true }).click();
  await shoot(page, ['X', '10', '9', '9', '8', '7']);
  await page.getByRole('button', { name: 'Trainingseinheit speichern' }).click();
  await page.getByRole('button', { name: /^Als unvollständig markieren/ }).click();
  await expect(page.getByRole('button', { name: /^Zuletzt 53/ })).toBeVisible();
  await nav(page, 'Tagebuch').click();
  await expect(page.getByRole('button', { name: /Training 18m 53 Ringe/ })).toBeVisible();
  await nav(page, 'Stats').click();
  await expect(page.getByRole('main')).toContainText('53');
  expect(await adminListDocs(request, `users/${uid}/sessions`)).toHaveLength(0);

  // Sieć wraca → sesja w bazie.
  await context.setOffline(false);
  await expect.poll(async () => (await adminListDocs(request, `users/${uid}/sessions`)).length, { timeout: 30_000 }).toBe(1);
});
