import { test, expect } from '@playwright/test';
import { resetEmulators, registerUser, watchErrors, expectNoErrors, homeMenu } from './helpers';

// Schreiber-Training od startu do końca: 2 strzelców (AB), 3 strzały, gra
// przechodzi wszystkie Passen (strzały losowe, więc wpisujemy „M” i „0” —
// błędne odpowiedzi też prowadzą dalej), na końcu wynik i ranking
// „Wer hätte gewonnen?” z obydwoma strzelcami. Potem „Nochmal” startuje od nowa.
test.beforeEach(async ({ request }) => resetEmulators(request));

test('Schreiber-Training: cała gra AB do rankingu „Wer hätte gewonnen?”', async ({ page }) => {
  test.setTimeout(150_000);
  const errors = watchErrors(page);
  await registerUser(page, 'Schreiber');
  await homeMenu(page, /Schreiber-Training/);
  await expect(page.getByRole('heading', { name: 'Schreiber-Training' })).toBeVisible();
  await page.getByRole('button', { name: '2 AB' }).click();
  // „3” jest dwa razy: strzały na strzelca i liczba Passen — oba ustawiamy na 3.
  for (const b of await page.getByRole('button', { name: '3', exact: true }).all()) await b.click();
  await page.getByRole('button', { name: 'Los geht’s' }).click();

  const done = page.getByText('Einträge richtig');
  const next = page.getByRole('button', { name: 'Weiter', exact: true });
  const miss = page.getByRole('button', { name: 'M', exact: true });
  const confirm = page.getByRole('button', { name: 'Bestätigen', exact: true });
  const zero = page.getByRole('button', { name: '0', exact: true });

  let steps = 0;
  while (!(await done.isVisible())) {
    expect(++steps, 'gra nie dochodzi do końca').toBeLessThan(400);
    if (await next.isVisible()) { await next.click(); continue; }
    if (await confirm.isVisible()) { await zero.click(); await confirm.click(); continue; }
    if (await miss.isVisible()) {
      // Podczas „Durchgang läuft” klawiatura jest wyłączona — wtedy czekamy.
      await miss.click({ timeout: 800 }).catch(() => {});
      continue;
    }
    await page.waitForTimeout(150);
  }

  await expect(page.getByText('Wer hätte gewonnen?')).toBeVisible();
  await expect(page.getByText('Schütze A', { exact: true })).toBeVisible();
  await expect(page.getByText('Schütze B', { exact: true })).toBeVisible();
  // Same „M” i „0” → 0 poprawnych z 18 (2 strzelców × 3 Passen × (1 odczyt + 2 sumy)).
  await expect(page.getByText('0/18', { exact: true })).toBeVisible();
  // Czasy z przecinkiem po niemiecku (wcześniej „0.7 s”).
  await expect(page.getByText(/^\d+,\d s$/).first()).toBeVisible();
  // Ranking posortowany: 1. miejsce ma co najmniej tyle, co 2.
  const totals = await page.locator('span.w-9.tabular-nums').allInnerTexts();
  expect(totals).toHaveLength(2);
  expect(Number(totals[0])).toBeGreaterThanOrEqual(Number(totals[1]));
  await page.screenshot({ path: test.info().outputPath('schreiber-result.png') });

  await page.getByRole('button', { name: 'Nochmal', exact: true }).click();
  await expect(page.getByText(/Passe 1\/\d/)).toBeVisible();
  await expectNoErrors(page, errors, 'Schreiber');
});
