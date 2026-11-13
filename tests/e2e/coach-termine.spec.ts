import { test, expect, type Page, type Browser } from '@playwright/test';
import { resetEmulators, registerUser, linkCoachAndStudent, watchErrors, expectNoErrors, newUserPage, closeUserPages, syncWrites, adminListDocs, adminPatchDoc } from './helpers';

// Termine trenera: stały trening „alle 2 Wochen” i odwołanie z przesunięciem
// tematów (każdy temat rusza o jeden termin dalej).
test.beforeEach(async ({ request }) => resetEmulators(request));
test.afterEach(() => closeUserPages());

const coachNav = (page: Page, name: string) => page.getByRole('navigation').getByRole('button', { name, exact: true });
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const plusDays = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return d; };

async function coachWithGroup(browser: Browser) {
  const coach = await newUserPage(browser);
  const student = await newUserPage(browser);
  const coachErrors = watchErrors(coach);
  const studentErrors = watchErrors(student);
  await registerUser(coach, 'Trenerka');
  const sid = await registerUser(student, 'Uczen');
  await linkCoachAndStudent(coach, student, sid, 'Trenerka');
  await coachNav(coach, 'folder_shared Gruppen').click();
  await coach.getByRole('button', { name: 'Gruppe erstellen' }).click();
  await coach.getByPlaceholder('Z.B. Anfänger, Kader...').fill('Kader');
  await coach.getByRole('button', { name: 'Speichern', exact: true }).click();
  await coach.getByRole('button', { name: 'person_add Hinzufügen' }).click();
  await coach.getByRole('button', { name: 'check Uczen' }).click();
  await coach.getByRole('button', { name: 'Hinzufügen (1)' }).click();
  await expect(coach.getByRole('button', { name: /folder_shared Kader 1 Schüler/ })).toBeVisible();
  return { coach, student, coachErrors, studentErrors };
}

async function addTopic(coach: Page, day: Date, title: string) {
  await coachNav(coach, 'folder_shared Gruppen').click();
  const kader = coach.getByRole('main').getByText('Kader', { exact: true });
  if (await kader.isVisible().catch(() => false)) await kader.click();
  await coach.getByRole('button', { name: 'add Thema' }).click();
  const date = coach.locator('input[type="date"]').last();
  if (await date.isVisible().catch(() => false)) await date.fill(iso(day));
  await coach.getByPlaceholder('z. B. Ellenbogenrotation im Vollauszug').fill(title);
  await coach.getByRole('button', { name: 'Speichern', exact: true }).click();
  await expect(coach.getByPlaceholder('z. B. Ellenbogenrotation im Vollauszug')).toHaveCount(0);
}

test('rytm co 2 tygodnie + odwołanie z przesunięciem tematów', async ({ browser, request }) => {
  test.setTimeout(150_000);
  const { coach, student, coachErrors, studentErrors } = await coachWithGroup(browser);

  // Stały trening: dziś 23:30, co 2 tygodnie.
  const today = new Date();
  await coach.getByRole('button', { name: /Regelmäßiges Training/ }).click();
  await coach.getByRole('combobox', { name: 'Termine' }).selectOption({ label: today.toLocaleDateString('de-DE', { weekday: 'long' }) });
  await coach.getByRole('textbox', { name: 'Uhrzeit' }).fill('23:30');
  await coach.getByRole('button', { name: 'alle 2 Wochen' }).click();
  await coach.getByRole('button', { name: 'Speichern', exact: true }).click();
  await expect(coach.getByText('Trainingszeit gespeichert')).toBeVisible();

  // Termine (4 tygodnie): tylko 2 treningi — dziś i za 14 dni.
  await coachNav(coach, 'event_note Termine').click();
  await expect(coach.getByRole('button', { name: /Kader Plan schedule 23:30/ })).toHaveCount(2);
  // Żaden uczeń nie ma startu → ikonki „Starts” nie ma (user 2026-11-12).
  await expect(coach.getByTestId('termine-toggle-plan')).toBeVisible();
  await expect(coach.getByTestId('termine-toggle-starts')).toHaveCount(0);

  // Tematy: dziś „Anker” i za 2 tygodnie „Schulter tief”.
  await addTopic(coach, today, 'Anker');
  await addTopic(coach, plusDays(14), 'Schulter tief');

  // Odwołanie dzisiejszego z przesunięciem: Anker → +14, Schulter tief → +28.
  await coachNav(coach, 'event_note Termine').click();
  await coach.getByRole('button', { name: 'Absagen' }).first().click();
  await coach.getByRole('button', { name: 'Absagen und verschieben' }).click();
  // Komunikat bywa krótszy niż czekanie testu — pewniejsza jest lista:
  // dziś „Abgesagt”, „Anker” za 2 tygodnie.
  await expect(coach.getByRole('button', { name: /23:30 · Abgesagt/ })).toBeVisible();
  await expect(coach.getByRole('button', { name: /23:30 · Anker/ })).toBeVisible();
  await syncWrites(coach);
  await expectNoErrors(coach, coachErrors, 'Termine');

  const groups = await adminListDocs(request, 'groups');
  const topics = groups[0].fields.topics.mapValue.fields;
  expect(topics[iso(today)]).toBeUndefined();
  expect(JSON.stringify(topics[iso(plusDays(14))])).toContain('Anker');
  expect(JSON.stringify(topics[iso(plusDays(28))])).toContain('Schulter tief');

  // Uczeń: dziś odwołane, następny trening za 2 tygodnie.
  await student.getByRole('navigation').getByRole('button', { name: /Start$/ }).click();
  const plan = student.getByTestId('group-plan');
  await expect(plan).toContainText('Heute abgesagt');
  const next = plusDays(14);
  await expect(plan).toContainText(new RegExp(`Nächstes Training: .*${next.getDate()}\.${next.getMonth() + 1}\..* · 23:30`));
  await expectNoErrors(student, studentErrors, 'uczeń');
});

test('„Gesehen”: trener odhacza notatkę ucznia, uczeń widzi, że przeczytana', async ({ browser }) => {
  test.setTimeout(150_000);
  const coach = await newUserPage(browser);
  const student = await newUserPage(browser);
  const coachErrors = watchErrors(coach);
  const studentErrors = watchErrors(student);
  await registerUser(coach, 'Trenerka');
  const sid = await registerUser(student, 'Uczen');
  await linkCoachAndStudent(coach, student, sid, 'Trenerka');

  // Uczeń: trening z notatką dla trenera (domyślnie „Notiz mit Trainer teilen”).
  await student.getByRole('navigation').getByRole('button', { name: 'target' }).click();
  await student.getByRole('button', { name: 'Training', exact: true }).click();
  for (const v of ['10', '10', '9', '9', '8', '8']) await student.getByRole('button', { name: v, exact: true }).click();
  await student.getByRole('button', { name: /Trainingstagbuch Wie lief es/ }).click();
  await student.getByPlaceholder(/Beschreibe deine Session/).fill('Bogenarm zittert bei 70 m');
  await expect(student.getByRole('checkbox', { name: /Notiz mit Trainer teilen/ }).or(student.getByText('Notiz mit Trainer teilen'))).toBeVisible();
  await student.getByRole('button', { name: 'Trainingseinheit speichern' }).click();
  await student.getByRole('button', { name: /^Als unvollständig markieren/ }).click();
  await expect(student.getByRole('button', { name: /^Zuletzt 54/ })).toBeVisible();
  await syncWrites(student);

  // Trener: szybki podgląd ucznia → notatka → „Gesehen”.
  await coachNav(coach, 'group Schüler').click();
  await coach.getByRole('main').getByText('Uczen').first().click();
  await expect(coach.getByText('Bogenarm zittert bei 70 m').first()).toBeVisible({ timeout: 15_000 });
  await coach.getByRole('button', { name: /check Gesehen/ }).click();
  await expect(coach.getByText('Abgehakt — du hast die Notiz gesehen')).toBeVisible();
  await expect(coach.getByRole('button', { name: /check Gesehen/ })).toHaveCount(0);
  await syncWrites(coach);
  await expectNoErrors(coach, coachErrors, 'trener: Gesehen');

  // Uczeń: w Tagebuchu „Dein Trainer hat deine Notiz gelesen”.
  await student.reload();
  await student.getByRole('navigation').getByRole('button', { name: /Tagebuch$/ }).click();
  const entry = student.getByRole('button', { name: /Training 18m 54 Ringe/ });
  await expect(entry).toBeVisible();
  const seen = student.getByText('Dein Trainer hat deine Notiz gelesen');
  if (!(await seen.first().isVisible().catch(() => false))) await entry.click();
  await expect(seen.first()).toBeVisible();
  await expectNoErrors(student, studentErrors, 'uczeń: przeczytana');
});

// Przełącznik „Starts” (2026-11-12): start ucznia w Termine, klik → karta ucznia,
// wyłączony znika i zostaje wyłączony po przeładowaniu.
test('starty uczniów: widoczne, klikalne, przełącznik zapamiętany', async ({ browser, request }) => {
  test.setTimeout(120_000);
  const coach = await newUserPage(browser);
  const student = await newUserPage(browser);
  const coachErrors = watchErrors(coach);
  await registerUser(coach, 'Trenerka');
  const sid = await registerUser(student, 'Uczen');
  // Start zapisany przed połączeniem — trener czyta go przy pierwszym wczytaniu uczniów.
  await adminPatchDoc(request, `users/${sid}/tournaments/e2eStart`, { title: 'Hallenmeisterschaft', date: iso(plusDays(3)), category: 'Turniej' });
  await linkCoachAndStudent(coach, student, sid, 'Trenerka');

  await coachNav(coach, 'event_note Termine').click();
  const row = coach.getByRole('button', { name: /Hallenmeisterschaft/ });
  await expect(row).toBeVisible();
  if (process.env.SHOT) await coach.screenshot({ path: process.env.SHOT });
  await row.click();
  await expect(coach.getByText('Vollständiges Schülerprofil')).toBeVisible();
  await coach.goBack(); // useBackClose zamyka kartę ucznia
  await expect(coach.getByText('Vollständiges Schülerprofil')).toHaveCount(0);

  await coachNav(coach, 'event_note Termine').click();
  const toggle = coach.getByTestId('termine-toggle-starts');
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await toggle.click();
  await expect(coach.getByRole('button', { name: /Hallenmeisterschaft/ })).toHaveCount(0);

  await coach.reload();
  // Po przeładowaniu apka startuje w trybie zawodnika — wejście do panelu trenera.
  await coach.getByRole('navigation').getByRole('button', { name: 'sports Trainer' }).click();
  await coachNav(coach, 'event_note Termine').click();
  await expect(coach.getByTestId('termine-toggle-starts')).toHaveAttribute('aria-pressed', 'false');
  await expect(coach.getByRole('button', { name: /Hallenmeisterschaft/ })).toHaveCount(0);
  await expectNoErrors(coach, coachErrors, 'Termine: starty');
});

// Monat u trenera (2026-11-13): te same ikonki co w Liste, wspólny stan; własne zawody = puchar w dniu.
test('Monat: ikonki jak w Liste, zawody jako puchar', async ({ browser, request }) => {
  test.setTimeout(120_000);
  const coach = await newUserPage(browser);
  const student = await newUserPage(browser);
  const coachErrors = watchErrors(coach);
  const cid = await registerUser(coach, 'Trenerka');
  const sid = await registerUser(student, 'Uczen');
  await adminPatchDoc(request, `users/${cid}/tournaments/ownStart`, { title: 'Kreismeisterschaft', date: iso(new Date()), category: 'Turniej' });
  await adminPatchDoc(request, `users/${sid}/tournaments/stuStart`, { title: 'Bezirksmeisterschaft', date: iso(new Date()), category: 'Turniej' });
  await linkCoachAndStudent(coach, student, sid, 'Trenerka');

  await coachNav(coach, 'event_note Termine').click();
  // Privat w Liste włączony → w Monat też włączony (wspólny stan).
  await coach.getByTestId('termine-toggle-private').click();
  await coach.getByRole('button', { name: /Monat/ }).click();
  await expect(coach.getByTestId('termine-toggle-plan')).toBeVisible();
  await expect(coach.getByTestId('termine-toggle-private')).toHaveAttribute('aria-pressed', 'true');
  const day = new Date(); // dziś — zawsze w pokazanym miesiącu
  const cellName = `${day.getDate()} emoji_events emoji_events`;
  await expect(coach.getByRole('button', { name: cellName, exact: true })).toBeVisible();
  // Kilka rzeczy w dniu → okienko wyboru: mój start z ołówkiem (Bearbeiten) i start ucznia.
  await coach.getByRole('button', { name: cellName, exact: true }).click();
  await expect(coach.getByText('Bezirksmeisterschaft')).toBeVisible();
  await expect(coach.getByTestId('day-picker-edit')).toHaveCount(1);
  if (process.env.SHOT2) await coach.screenshot({ path: process.env.SHOT2 });
  await coach.getByTestId('day-picker-edit').click();
  await expect(coach.getByRole('textbox').first()).toBeVisible(); // formularz edycji
  await coach.goBack();
  await expect(coach.getByTestId('day-picker-edit')).toHaveCount(0);

  // Privat wyłączony → prywatne zawody znikają z siatki; na chwilę dymek z opisem.
  await coach.getByTestId('termine-toggle-private').click();
  await expect(coach.getByTestId('termine-filter-hint')).toHaveText('Nur Termine als Trainer');
  if (process.env.SHOT4) await coach.screenshot({ path: process.env.SHOT4 });
  await expect(coach.getByTestId('termine-filter-hint')).toHaveCount(0, { timeout: 5000 });
  await expect(coach.getByRole('button', { name: cellName, exact: true })).toHaveCount(0);
  // Start ucznia: mały złoty puchar; klik w dzień → okienko z imieniem → profil ucznia.
  await expect(coach.getByTestId('student-start-trophy')).toHaveCount(1);
  await coach.getByRole('button', { name: `${day.getDate()} emoji_events`, exact: true }).click();
  await expect(coach.getByText('Bezirksmeisterschaft')).toBeVisible();
  if (process.env.SHOT3) await coach.screenshot({ path: process.env.SHOT3 });
  await coach.getByRole('button', { name: 'Uczen', exact: true }).click();
  await expect(coach.getByText('Schülerprofil')).toBeVisible();
  await coach.goBack();

  // Starts wyłączony → puchar ucznia znika, ikonka zostaje (w miesiącu jest start).
  await coach.getByTestId('termine-toggle-starts').click();
  await expect(coach.getByTestId('student-start-trophy')).toHaveCount(0);
  await expectNoErrors(coach, coachErrors, 'Monat');
});

// Plan grupy w kalendarzu ucznia (2026-11-13): fioletowy róg + karta „Gruppentraining”;
// po odwołaniu przez trenera — szary róg i „Abgesagt · powód”.
test('uczeń: treningi grupy w kalendarzu, odwołany z powodem', async ({ browser }) => {
  test.setTimeout(150_000);
  const { coach, student, coachErrors, studentErrors } = await coachWithGroup(browser);
  const today = new Date();
  await coach.getByRole('button', { name: /Regelmäßiges Training/ }).click();
  await coach.getByRole('combobox', { name: 'Termine' }).selectOption({ label: today.toLocaleDateString('de-DE', { weekday: 'long' }) });
  await coach.getByRole('textbox', { name: 'Uhrzeit' }).fill('23:30');
  await coach.getByRole('button', { name: 'Speichern', exact: true }).click();
  await expect(coach.getByText('Trainingszeit gespeichert')).toBeVisible();
  await syncWrites(coach);

  await student.reload();
  await student.getByRole('navigation').getByRole('button', { name: /Kalender$/ }).click();
  await expect(student.getByTestId('member-plan-tri').first()).toBeVisible();
  await expect(student.getByTestId('group-training-row').first()).toContainText('Kader');
  await student.getByTestId('group-training-row').first().click();
  await expect(student.getByTestId('day-picker-member')).toContainText('23:30');
  if (process.env.SHOT6) await student.screenshot({ path: process.env.SHOT6 });
  await student.goBack();

  // Trener odwołuje dzisiejszy trening z powodem.
  await coachNav(coach, 'event_note Termine').click();
  await coach.getByRole('button', { name: 'Absagen' }).first().click();
  await coach.getByPlaceholder(/Grund/).fill('Halle belegt');
  await coach.getByRole('button', { name: /^Absagen/ }).last().click();
  await expect(coach.getByRole('button', { name: /23:30 · Abgesagt/ })).toBeVisible();
  await syncWrites(coach);

  // Lustro planu uaktualnia się na żywo — bez przeładowania.
  await expect(student.getByTestId('member-plan-tri-cancelled').first()).toBeVisible({ timeout: 15_000 });
  await expect(student.getByTestId('group-training-row').first()).toContainText('Abgesagt · Halle belegt');
  if (process.env.SHOT7) await student.screenshot({ path: process.env.SHOT7 });
  await expectNoErrors(coach, coachErrors, 'trener: odwołanie');
  await expectNoErrors(student, studentErrors, 'uczeń: kalendarz grupy');
});

// [PRYWATNY KALENDARZ 2026-11-13] Trener, który sam jest uczniem innego trenera: dwa osobne
// przełączniki w JEGO prywatnym kalendarzu — „Als Trainer” (różowe: własne terminy jako trener)
// i „Meine Gruppe” (fioletowe: trening grupy, do której należy). Zwykły strzelec bez roli i bez
// grupy nie widzi żadnej ikonki.
test('prywatny kalendarz: Als Trainer / Meine Gruppe osobno, zwykły strzelec bez ikonek', async ({ browser, request }) => {
  test.setTimeout(150_000);
  const mainCoach = await newUserPage(browser);
  const me = await newUserPage(browser); // trener, który jest też uczniem mainCoach
  const plain = await newUserPage(browser); // zwykły strzelec, bez roli i bez grupy
  const meErrors = watchErrors(me);
  await registerUser(mainCoach, 'GlownyTrener');
  const meId = await registerUser(me, 'JaTrener');
  await registerUser(plain, 'Prosty');
  await linkCoachAndStudent(mainCoach, me, meId, 'GlownyTrener');

  // mainCoach: grupa „Liga” z „JaTrener” jako członkiem + stały trening dziś.
  await mainCoach.getByRole('navigation').getByRole('button', { name: 'folder_shared Gruppen' }).click();
  await mainCoach.getByRole('button', { name: 'Gruppe erstellen' }).click();
  await mainCoach.getByPlaceholder('Z.B. Anfänger, Kader...').fill('Liga');
  await mainCoach.getByRole('button', { name: 'Speichern', exact: true }).click();
  await mainCoach.getByRole('button', { name: 'person_add Hinzufügen' }).click();
  await mainCoach.getByRole('button', { name: 'check JaTrener' }).click();
  await mainCoach.getByRole('button', { name: 'Hinzufügen (1)' }).click();
  await expect(mainCoach.getByRole('button', { name: /folder_shared Liga 1 Schüler/ })).toBeVisible();
  const today = new Date();
  await mainCoach.getByRole('button', { name: /Regelmäßiges Training/ }).click();
  await mainCoach.getByRole('combobox', { name: 'Termine' }).selectOption({ label: today.toLocaleDateString('de-DE', { weekday: 'long' }) });
  await mainCoach.getByRole('textbox', { name: 'Uhrzeit' }).fill('19:00');
  await mainCoach.getByRole('button', { name: 'Speichern', exact: true }).click();
  await expect(mainCoach.getByText('Trainingszeit gespeichert')).toBeVisible();
  await syncWrites(mainCoach);

  // Prosty strzelec bez roli i bez grupy: w kalendarzu nie ma żadnej z tych ikonek.
  await plain.getByRole('navigation').getByRole('button', { name: /Kalender$/ }).click();
  await expect(plain.getByTestId('cal-toggle-as-trainer')).toHaveCount(0);
  await expect(plain.getByTestId('cal-toggle-my-group')).toHaveCount(0);

  // „me” zostaje też trenerem (Trainermodus) i wraca do swojego, prywatnego kalendarza.
  await me.getByRole('navigation').getByRole('button', { name: /Einst\.$/ }).click();
  await me.getByRole('button', { name: /^TRAINER/ }).click();
  await me.getByRole('button', { name: /Trainermodus aktivieren/ }).click();
  await expect(me.getByText(/Plätze: 0\/1/)).toBeVisible();
  // Wejście do panelu trenera, a stamtąd od razu z powrotem do trybu zawodnika (przełącznik na dole).
  await me.getByRole('navigation').getByRole('button', { name: 'sports Trainer' }).click();
  await me.getByRole('navigation').getByRole('button', { name: /Schütze$/ }).click();

  // Własny (różowy) termin jako trener — bezpośrednio w bazie, jak przy ręcznym zapisie w formularzu.
  await adminPatchDoc(request, `users/${meId}/tournaments/ownTrainerEvent`, { title: 'Vereinstraining', date: iso(today), category: 'Trener', type: 'Trener' });

  await me.reload();
  await me.getByRole('navigation').getByRole('button', { name: /Kalender$/ }).click();
  await expect(me.getByTestId('cal-toggle-as-trainer')).toHaveAttribute('aria-pressed', 'true');
  await expect(me.getByTestId('cal-toggle-my-group')).toHaveAttribute('aria-pressed', 'true');
  await expect(me.getByTestId('group-training-row').first()).toContainText('Liga');
  await expect(me.getByText('Vereinstraining')).toBeVisible();
  if (process.env.SHOT8) await me.screenshot({ path: process.env.SHOT8 });

  // „Als Trainer” wyłączony: mój termin znika, trening grupy (od GlownyTrener) zostaje.
  await me.getByTestId('cal-toggle-as-trainer').click();
  await expect(me.getByTestId('termine-filter-hint')).toHaveText('Ohne Termine als Trainer');
  await expect(me.getByText('Vereinstraining')).toHaveCount(0);
  await expect(me.getByTestId('group-training-row').first()).toContainText('Liga');
  await me.getByTestId('cal-toggle-as-trainer').click();
  await expect(me.getByText('Vereinstraining')).toBeVisible();

  // „Meine Gruppe” wyłączony: trening grupy znika, mój termin zostaje.
  await me.getByTestId('cal-toggle-my-group').click();
  await expect(me.getByTestId('termine-filter-hint')).toHaveText('Ohne Gruppentraining');
  await expect(me.getByTestId('group-training-row')).toHaveCount(0);
  await expect(me.getByTestId('member-plan-tri')).toHaveCount(0);
  await expect(me.getByText('Vereinstraining')).toBeVisible();
  if (process.env.SHOT9) await me.screenshot({ path: process.env.SHOT9 });
  await me.getByTestId('cal-toggle-my-group').click();
  await expect(me.getByTestId('group-training-row').first()).toContainText('Liga');

  await expectNoErrors(me, meErrors, 'prywatny kalendarz');
});
