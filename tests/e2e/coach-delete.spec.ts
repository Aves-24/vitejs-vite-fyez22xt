import { test, expect, type Page } from '@playwright/test';
import { resetEmulators, registerUser, linkCoachAndStudent, watchErrors, expectNoErrors, newUserPage, closeUserPages, nav, adminListDocs, syncWrites, TEST_PASSWORD } from './helpers';

// Usunięcie konta trenera z grupami (polityka §2.4 „Trainingsgruppen”):
// współtrener → znika ze składu trenerów, grupa zostaje; Haupttrainer →
// grupa, jej lustro dla uczniów (groupPlans) i zaproszenia znikają.
test.beforeEach(async ({ request }) => resetEmulators(request));
test.afterEach(() => closeUserPages());

const coachNav = (page: Page, name: string) => page.getByRole('navigation').getByRole('button', { name, exact: true });

async function deleteAccount(page: Page) {
  // Trener w trybie trenera → przełącznik „Schütze”, potem Einst. zawodnika.
  const toArcher = page.getByRole('navigation').getByRole('button', { name: /Schütze$/ });
  if (await toArcher.isVisible().catch(() => false)) await toArcher.click();
  await nav(page, 'Einst.').click();
  await page.getByRole('button', { name: 'delete_forever Konto löschen' }).click();
  await page.getByPlaceholder('LÖSCHEN').fill('LÖSCHEN');
  await page.getByPlaceholder('••••••••').fill(TEST_PASSWORD);
  await page.getByRole('button', { name: 'Konto endgültig löschen' }).click();
  await expect(page.getByRole('button', { name: /ohne konto ausprobieren/i })).toBeVisible({ timeout: 20_000 });
}

test('usunięcie konta: współtrener wychodzi z grupy, Haupttrainer kasuje grupę', async ({ browser, request }) => {
  test.setTimeout(240_000);
  const head = await newUserPage(browser);
  const co = await newUserPage(browser);
  const student = await newUserPage(browser);
  const headErrors = watchErrors(head);
  const studentErrors = watchErrors(student);

  const headId = await registerUser(head, 'Trenerka');
  const coId = await registerUser(co, 'Kotrener');
  const sid = await registerUser(student, 'Uczen');
  await linkCoachAndStudent(head, student, sid, 'Trenerka');
  await nav(co, 'Einst.').click();
  await co.getByRole('button', { name: /^TRAINER/ }).click();
  await co.getByRole('button', { name: /Trainermodus aktivieren/ }).click();
  await co.getByRole('navigation').getByRole('button', { name: 'sports Trainer' }).click();

  // Grupa z uczniem, stały trening (lustro groupPlans) i współtrener.
  await coachNav(head, 'folder_shared Gruppen').click();
  await head.getByRole('button', { name: 'Gruppe erstellen' }).click();
  await head.getByPlaceholder('Z.B. Anfänger, Kader...').fill('Kader');
  await head.getByRole('button', { name: 'Speichern', exact: true }).click();
  await head.getByRole('button', { name: 'person_add Hinzufügen' }).click();
  await head.getByRole('button', { name: 'check Uczen' }).click();
  await head.getByRole('button', { name: 'Hinzufügen (1)' }).click();
  await head.getByRole('button', { name: /Regelmäßiges Training/ }).click();
  await head.getByRole('combobox', { name: 'Termine' }).selectOption({ label: new Date().toLocaleDateString('de-DE', { weekday: 'long' }) });
  await head.getByRole('textbox', { name: 'Uhrzeit' }).fill('23:30');
  await head.getByRole('button', { name: 'Speichern', exact: true }).click();
  await expect(head.getByText('Trainingszeit gespeichert')).toBeVisible();
  await head.getByRole('button', { name: 'person_add Einladen' }).click();
  await head.getByPlaceholder('Benutzer-ID einfügen...').fill(coId);
  await head.getByRole('button', { name: 'Hinzufügen', exact: true }).click();
  await expect(co.getByText(/Trenerka lädt dich als Co-Trainer/)).toBeVisible({ timeout: 20_000 });
  await co.getByRole('button', { name: 'Annehmen', exact: true }).click();
  await expect.poll(async () => JSON.stringify((await adminListDocs(request, 'groups'))[0]?.fields?.coachIds ?? ''), { timeout: 15_000 }).toContain(coId);
  await expect(student.getByTestId('group-plan')).toContainText('Kader');

  // 1) Współtrener usuwa konto → grupa zostaje, on znika ze składu.
  await deleteAccount(co);
  await expect.poll(async () => JSON.stringify((await adminListDocs(request, 'groups'))[0]?.fields?.coachIds ?? ''), { timeout: 15_000 }).not.toContain(coId);
  expect(await adminListDocs(request, 'groups')).toHaveLength(1);
  await expect(head.getByText('Kader').first()).toBeVisible();

  // 2) Haupttrainer usuwa konto → grupa, lustro i zaproszenia znikają.
  await syncWrites(head);
  await deleteAccount(head);
  await expect.poll(async () => (await adminListDocs(request, 'groups')).length, { timeout: 15_000 }).toBe(0);
  expect(await adminListDocs(request, 'groupPlans')).toHaveLength(0);
  expect(await adminListDocs(request, 'groupInvites')).toHaveLength(0);
  expect((await adminListDocs(request, 'users')).map(u => u.name.split('/').pop())).toEqual([sid]);

  // Uczeń: bez planu grupy na Home i bez trenera.
  await student.reload();
  await expect(student.getByRole('heading', { name: 'GROT-X', level: 1 })).toBeVisible();
  await student.waitForTimeout(1500);
  await expect(student.getByTestId('group-plan')).toHaveCount(0);
  const studentDoc = (await adminListDocs(request, 'users')).find(u => u.name.endsWith(sid));
  expect(JSON.stringify(studentDoc?.fields?.coaches ?? {})).not.toContain(headId);
  await expectNoErrors(head, headErrors, 'trener');
  await expectNoErrors(student, studentErrors, 'uczeń');
});
