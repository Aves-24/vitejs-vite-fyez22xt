// [TERMINE] Jeden ekran trenera z dwoma widokami: lista (panel trenera) i
// miesiąc (kalendarz). Zapamiętany ostatni wybór — dolne menu otwiera ten widok.
export type TermineView = 'LIST' | 'MONTH';

const KEY = 'grotX_coachTermineView';

export function getTermineView(): TermineView {
  try { return localStorage.getItem(KEY) === 'MONTH' ? 'MONTH' : 'LIST'; } catch { return 'LIST'; }
}

export function setTermineView(v: TermineView) {
  try { localStorage.setItem(KEY, v); } catch { /* ignore */ }
}

// „Privat” w obu widokach ten sam (klucz z listy Termine).
const PRIVATE_KEY = 'grotX_coachShowPrivate';

export function getShowPrivate(): boolean {
  try { return localStorage.getItem(PRIVATE_KEY) === '1'; } catch { return false; }
}

export function saveShowPrivate(v: boolean) {
  try { localStorage.setItem(PRIVATE_KEY, v ? '1' : '0'); } catch { /* ignore */ }
}

// Stałe treningi grup i starty uczniów — też wspólne dla Liste i Monat (user 2026-11-13).
const PLAN_KEY = 'grotX_coachShowPlan';
const STARTS_KEY = 'grotX_coachShowStarts';

export function getShowPlan(): boolean {
  try { return localStorage.getItem(PLAN_KEY) !== '0'; } catch { return true; }
}

export function saveShowPlan(v: boolean) {
  try { localStorage.setItem(PLAN_KEY, v ? '1' : '0'); } catch { /* ignore */ }
}

export function getShowStarts(): boolean {
  try { return localStorage.getItem(STARTS_KEY) !== '0'; } catch { return true; }
}

export function saveShowStarts(v: boolean) {
  try { localStorage.setItem(STARTS_KEY, v ? '1' : '0'); } catch { /* ignore */ }
}

// Prywatny kalendarz: trener-uczeń widzi własne terminy trenerskie i plan grupy,
// do której należy — osobne przełączniki od tych w Termine trenera (user 2026-11-13).
const AS_TRAINER_KEY = 'grotX_calShowAsTrainer';
const MY_GROUP_KEY = 'grotX_calShowMyGroup';

export function getShowAsTrainer(): boolean {
  try { return localStorage.getItem(AS_TRAINER_KEY) !== '0'; } catch { return true; }
}

export function saveShowAsTrainer(v: boolean) {
  try { localStorage.setItem(AS_TRAINER_KEY, v ? '1' : '0'); } catch { /* ignore */ }
}

export function getShowMyGroup(): boolean {
  try { return localStorage.getItem(MY_GROUP_KEY) !== '0'; } catch { return true; }
}

export function saveShowMyGroup(v: boolean) {
  try { localStorage.setItem(MY_GROUP_KEY, v ? '1' : '0'); } catch { /* ignore */ }
}
