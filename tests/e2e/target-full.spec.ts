import { test, expect } from '@playwright/test';
import { resetEmulators, registerUser, watchErrors, expectNoErrors, adminListDocs } from './helpers';

// Pełna tarcza 122 cm (70 m): trafienia w każdy pierścień myszą, lupa przy
// przesuwaniu (przeciąganie zmienia miejsce strzały), Fehlschuss w tabeli.
test.beforeEach(async ({ request }) => resetEmulators(request));

// Pixel 7: środek tarczy i szerokość pierścienia w px CSS.
const CX = 186, CY = 272, RING = 15.2;
// Bliżej zewnętrznej krawędzi pierścienia: grot dotykający wyższej linii liczy się wyżej (LINE_TOUCH).
const at = (score: number) => ({ x: CX + (10 - score + 0.75) * RING, y: CY });

test('tarcza 122 cm: pierścienie, lupa przy przeciąganiu, Fehlschuss', async ({ page, request }) => {
  test.setTimeout(120_000);
  const errors = watchErrors(page);
  const uid = await registerUser(page, 'Ziel');
  await page.getByRole('navigation').getByRole('button', { name: 'target' }).click();
  await page.getByRole('button', { name: '70m', exact: true }).click();
  await page.getByRole('button', { name: 'Training', exact: true }).click();
  await page.getByText('Auflage', { exact: true }).click();
  await expect(page.getByText('122CM', { exact: false }).first()).toBeVisible();
  const main = page.getByRole('main');

  // X (tuż obok środka), 9, 8, 7.
  await page.mouse.click(CX + 2, CY);
  for (const s of [9, 8, 7]) { const p = at(s); await page.mouse.click(p.x, p.y); }
  await expect(main).toContainText(/P1\s*X\s*9\s*8\s*7/);

  // Lupa: przycisk wciśnięty w 6, przeciągnięcie do 1 → lupa widoczna, strzała = 1.
  const six = at(6), one = at(1);
  await page.mouse.move(six.x, six.y);
  await page.mouse.down();
  await expect(page.getByTestId('target-loupe')).toBeVisible();
  await page.mouse.move(one.x, one.y, { steps: 8 });
  await expect(page.getByTestId('target-loupe')).toBeVisible();
  await page.mouse.up();
  await expect(page.getByTestId('target-loupe')).toHaveCount(0);
  await expect(main).toContainText(/P1\s*X\s*9\s*8\s*7\s*1/);

  // Szósta strzała w 6 → Passe 41.
  await page.mouse.click(six.x, six.y);
  await expect(main).toContainText(/Gesamtringzahl\s*41/);

  // Fehlschuss: tryb flagi → strzała 1 oznaczona.
  await page.getByRole('button', { name: 'Pfeil antippen = Fehlschuss' }).click();
  await page.getByRole('button', { name: 'Pfeil 1: als Fehlschuss markieren' }).click();
  await page.getByRole('button', { name: 'Pfeil antippen = Fehlschuss' }).click();

  await page.getByRole('button', { name: 'Trainingseinheit speichern' }).click();
  await page.getByRole('button', { name: /^Als unvollständig markieren/ }).click();
  await expect(page.getByRole('button', { name: /^Zuletzt 41/ })).toBeVisible();

  // W bazie: 70 m, tarcza 122, jedna strzała oznaczona jako Fehlschuss.
  await expect.poll(async () => (await adminListDocs(request, `users/${uid}/sessions`)).length, { timeout: 10_000 }).toBe(1);
  const sess = JSON.stringify((await adminListDocs(request, `users/${uid}/sessions`))[0].fields);
  expect(sess).toContain('70m');
  expect(sess.match(/"bad":\{"booleanValue":true\}/g) || []).toHaveLength(1);
  await expectNoErrors(page, errors, 'tarcza 122');
});
