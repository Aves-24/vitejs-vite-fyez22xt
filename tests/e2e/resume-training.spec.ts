import { test, expect } from '@playwright/test';
import { resetEmulators, registerUser, shoot, watchErrors, expectNoErrors, syncWrites, adminListDocs } from './helpers';

// Przerwany trening: strzały wpisane, apka zamknięta/przeładowana w środku Passe.
// Środkowy przycisk pokazuje „LÄUFT” (play_arrow) i wznawia trening z tymi samymi
// strzałami; dokończona Passe i zapis dają w bazie obie Passen z poprawną sumą.
test.beforeEach(async ({ request }) => resetEmulators(request));

test('trening przerwany przeładowaniem wznawia się z wpisanymi strzałami', async ({ page, request }) => {
  test.setTimeout(120_000);
  const errors = watchErrors(page);
  const uid = await registerUser(page, 'Weiter');

  await page.getByRole('navigation').getByRole('button', { name: 'target' }).click();
  await page.getByRole('button', { name: 'Training', exact: true }).click();
  await shoot(page, ['X', '10', '9', '9', '8', '7']); // 53
  await page.waitForTimeout(800); // Passe zamyka się po 600 ms
  await shoot(page, ['10', '9', '8']);                  // połowa drugiej Passe
  await page.waitForTimeout(500);

  await page.reload();
  // Po przeładowaniu: Home, środkowy przycisk = „LÄUFT”.
  const resume = page.getByRole('navigation').getByRole('button', { name: 'play_arrow' });
  await expect(resume).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('navigation').getByText('LÄUFT')).toBeVisible();
  await resume.click();

  // Te same strzały na ekranie treningu: suma 53 + 27 = 80.
  await expect(page.getByText('80', { exact: true }).first()).toBeVisible();
  await shoot(page, ['7', '6', 'M']); // + 13 → 93 (3-Spot 18 m: klawiatura X, 10–6, M)
  await page.getByRole('button', { name: 'Trainingseinheit speichern' }).click();
  await page.getByRole('button', { name: /^Als unvollständig markieren/ }).click();
  await expect(page.getByRole('button', { name: /^Zuletzt 93/ })).toBeVisible();
  // Po zapisie przycisk wraca do zwykłego „Training”.
  await expect(page.getByRole('navigation').getByRole('button', { name: 'target' })).toBeVisible();
  await syncWrites(page);

  const sessions = await adminListDocs(request, `users/${uid}/sessions`);
  expect(sessions).toHaveLength(1);
  const f = sessions[0].fields;
  expect(Number(f.score.integerValue ?? f.score.doubleValue)).toBe(93);
  expect(f.ends.arrayValue.values).toHaveLength(2);
  await expectNoErrors(page, errors, 'wznowienie');
});
