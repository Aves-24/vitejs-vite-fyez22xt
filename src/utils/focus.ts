import { useEffect, useState } from 'react';
import { doc, getDoc, getDocs, collection, query, where, Timestamp, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';

// --- FOKUS ---
// „Nad czym teraz pracuję". Własny fokus siedzi w users/{uid}.focus; trener
// ustawia fokus wpisem typu „Ziel" w coachLog. Od 2026-10-14 (DWA FOKUSY)
// oba żyją równolegle — dwa tory, każdy z własnymi kropkami; ekran pokazuje
// „główny” (na razie nowszy). Wcześniej obowiązywał tylko nowszy z nich.
// Kropki (postęp) są opcjonalne — users/{uid}.focusDots. Kto je włączy,
// zbiera kropkę za każdy trening z tematem fokusu (session.topics; fokus bez
// tematu — za każdy trening); po
// users/{uid}.focusGoal takich treningach (2–5, sam wybiera) fokus jest
// „utrwalony". Fokus trenera ma własną liczbę na wpisie (goal) i kropki
// zaznaczane przez trenera (marks). Trening bez fokusu niczego nie zeruje —
// suma, nie seria.

export const FOCUS_TEXT_MAX = 120;
// 1 dopuszczone od 2026-09-18 (user: „nie można ustawić 1 jednostki”).
export const FOCUS_GOAL_OPTIONS = [1, 2, 3, 4, 5] as const;
export const FOCUS_GOAL_DEFAULT = 5;

export function readFocusGoal(userData: any): number {
  const g = userData?.focusGoal;
  return (FOCUS_GOAL_OPTIONS as readonly number[]).includes(g) ? g : FOCUS_GOAL_DEFAULT;
}

// users/{uid}.focus — własny fokus albo jego zakończenie (cleared). Zakończenie
// też ma datę, żeby starszy cel trenera nie wrócił na górę sam z siebie.
// `ended` — migawka zakończonego fokusu: dziennik pokazuje go dalej jako
// „ostatni zakończony” (user 2026-09-25: „to jest dziennik, wpisy zostają”).
export interface OwnFocus {
  topic?: string;
  text?: string;
  setAt: number;
  cleared?: boolean;
  ended?: SessionFocus;
  // Od kiedy liczyć treningi, gdy NIE od początku dnia (newFocusCountFrom).
  countFrom?: number;
}

export interface CoachGoal {
  id?: string;           // ID wpisu w coachLog — autor może zmienić temat (C39)
  authorId?: string;
  ts: number;
  text: string;
  topics: string[];
  authorName?: string;
  // [DWA FOKUSY] Liczba treningów TEGO fokusu (dawniej wspólne users.focusGoal).
  goal?: number;
  // Lekcje zaznaczone przez trenera (znaczniki czasu) — kropka mimo braku
  // zapisanego treningu (user 2026-10-14: „2 lekcje były na ten temat i koniec”).
  marks?: number[];
  endedAt?: number;      // trener zakończył fokus
}

// [DWA FOKUSY] users/{uid}.coachFocusCleared — uczeń zakończył (albo przejął
// edycją) fokus od trenera; wpisu trenera sam zmienić nie może.
export interface CoachFocusCleared { since: number; setAt: number; ended?: SessionFocus }

// Cele trenera sprzed dwóch fokusów: wtedy nowszy własny fokus (albo jego
// zakończenie, także przez trenera — Path L) zastępował cel trenera. Takie
// cele nie wracają teraz jako drugi, równoległy fokus.
export const TWO_FOCUS_SINCE = Date.parse('2026-10-14T16:00:00Z');

export interface ActiveFocus {
  topic: string;         // '' = bez tematu — kropki liczą wtedy każdy trening
  text: string;
  since: number;
  fromCoach: boolean;
  authorName?: string;
  goalId?: string;       // tylko fokus trenera — wpis w coachLog
  authorId?: string;
  countFrom?: number;    // tylko własny fokus — patrz newFocusCountFrom
  marks?: number[];      // tylko fokus trenera — lekcje zaznaczone przez trenera
  entryGoal?: number;    // tylko fokus trenera — liczba treningów zapisana na wpisie
}

export function readOwnFocus(userData: any): OwnFocus | null {
  const f = userData?.focus;
  return f && typeof f.setAt === 'number' ? f : null;
}

export function readCoachFocusCleared(userData: any): CoachFocusCleared | null {
  const c = userData?.coachFocusCleared;
  return c && typeof c.since === 'number' && typeof c.setAt === 'number' ? c : null;
}

/** Własny tor. Sam tekst bez tematu też jest fokusem (jak u trenera). */
export function resolveOwnFocus(own: OwnFocus | null): ActiveFocus | null {
  if (!own || own.cleared || (!own.topic && !own.text)) return null;
  return { topic: own.topic || '', text: own.text || '', since: own.setAt, fromCoach: false,
    ...(typeof own.countFrom === 'number' ? { countFrom: own.countFrom } : {}) };
}

/** Tor trenera: ostatni cel, o ile nikt go nie zakończył. */
export function resolveCoachFocus(goal: CoachGoal | undefined, own: OwnFocus | null, cleared: CoachFocusCleared | null): ActiveFocus | null {
  if (!goal || goal.endedAt) return null;
  if (cleared && cleared.since === goal.ts) return null;
  if (goal.ts < TWO_FOCUS_SINCE && own && own.setAt >= goal.ts) return null;
  return { topic: goal.topics[0] || '', text: goal.text, since: goal.ts, fromCoach: true, authorName: goal.authorName, goalId: goal.id, authorId: goal.authorId,
    ...(goal.marks?.length ? { marks: goal.marks } : {}),
    ...(goal.goal ? { entryGoal: goal.goal } : {}) };
}

// [DWA FOKUSY, etap 2] Który tor jest na górze — wybór ucznia (tap w kropkę
// drugiego fokusu), users/{uid}.focusPrimary. Bez wyboru: nowszy.
export type FocusSide = 'own' | 'coach';

export function readFocusPrimary(userData: any): FocusSide | undefined {
  const p = userData?.focusPrimary;
  return p === 'own' || p === 'coach' ? p : undefined;
}

const sideOf = (f: ActiveFocus): FocusSide => (f.fromCoach ? 'coach' : 'own');

/** Główny i drugi fokus. */
export function resolveFocusPair(own: OwnFocus | null, goal: CoachGoal | undefined, cleared: CoachFocusCleared | null = null, primary?: FocusSide): { main: ActiveFocus | null; other: ActiveFocus | null } {
  const o = resolveOwnFocus(own);
  const c = resolveCoachFocus(goal, own, cleared);
  if (!o || !c) return { main: o || c, other: null };
  const ownFirst = primary ? primary === 'own' : o.since >= c.since;
  return ownFirst ? { main: o, other: c } : { main: c, other: o };
}

/** Główny fokus (ten na ekranie). */
export function resolveActiveFocus(own: OwnFocus | null, goal: CoachGoal | undefined, cleared: CoachFocusCleared | null = null, primary?: FocusSide): ActiveFocus | null {
  return resolveFocusPair(own, goal, cleared, primary).main;
}

// Liczą się treningi od początku dnia ustawienia fokusu — ktoś trenuje rano,
// a fokus wpisuje wieczorem, i ten poranny trening też chce zaznaczyć.
export function focusFrom(focus: ActiveFocus): number {
  return focus.countFrom ?? new Date(focus.since).setHours(0, 0, 0, 0);
}

const sameDay = (a: number, b: number) => new Date(a).toDateString() === new Date(b).toDateString();

/**
 * Początek liczenia dla NOWEGO własnego fokusu (user 2026-10-14: nowy fokus
 * od razu „wykonany”). „Od początku dnia” ma sens tylko dla pierwszego fokusu
 * dnia (rano trening, wieczorem fokus). Jeśli tego dnia był już fokus:
 * - zastępujemy aktywny → liczymy od teraz (dzisiejsze treningi należą do niego),
 * - poprzedni zakończony dziś → od chwili zakończenia.
 * undefined = domyślnie od początku dnia.
 */
export function newFocusCountFrom(own: OwnFocus | null, active: ActiveFocus | null, now: number): number | undefined {
  if (active) return now;
  if (own?.cleared && sameDay(own.setAt, now)) return own.setAt;
  return undefined;
}

// Fokus bez tematu (user 2026-09-18: temat nieobowiązkowy) — każdy trening
// od dnia ustawienia dokłada kropkę; z tematem tylko treningi z tym tematem.
function countsForFocus(topics: string[], focus: ActiveFocus): boolean {
  return !focus.topic || topics.includes(focus.topic);
}

// Trening do liczenia: `snaps` = migawki fokusów, pod które był robiony
// (since + tor). `decided` = uczeń świadomie wybrał fokusy przy zapisie
// (DWA FOKUSY, etap 2) — wtedy brak migawki znaczy „nie pod ten fokus”,
// a nie „sprawdź po temacie”.
export interface FocusSnapRef { since: number; fromCoach: boolean }
export interface FocusSessionRef { ts: number; topics: string[]; snaps: FocusSnapRef[]; decided?: boolean }

/** Migawki z sesji: nowe `focuses[]`, a w starszych sesjach jedno `focus`. */
export function readSessionFocuses(data: any): SessionFocus[] {
  if (Array.isArray(data?.focuses)) return data.focuses.filter((f: any) => readSessionFocus({ focus: f })) as SessionFocus[];
  const f = readSessionFocus(data);
  return f ? [f] : [];
}

export function sessionFocusRef(data: any, ts: number): FocusSessionRef {
  return {
    ts,
    topics: data?.topics || [],
    snaps: sessionSnapRefs(data),
    ...(data?.focusChoice === true ? { decided: true } : {}),
  };
}

export function sessionSnapRefs(data: any): FocusSnapRef[] {
  return readSessionFocuses(data).map(f => ({ since: f.since, fromCoach: !!f.fromCoach }));
}

// Migawki z tego samego toru co fokus — migawka własnego fokusu nie blokuje
// liczenia fokusu trenera po temacie i odwrotnie.
const sameTrack = (s: FocusSessionRef, focus: ActiveFocus) => s.snaps.filter(x => x.fromCoach === focus.fromCoach);

// Okno fokusu: od początku dnia ustawienia (poranny trening + fokus wpisany
// wieczorem). ALE trening sprzed ustawienia, zrobiony pod INNY fokus (tego
// samego toru), do nowego się nie liczy — user 2026-10-14: nowy fokus
// ustawiony w dniu, w którym trenował pod poprzedni, od razu był „wykonany”.
export function inFocusWindow(s: FocusSessionRef, focus: ActiveFocus): boolean {
  if (s.ts >= focus.since) return true;
  if (s.ts < focusFrom(focus)) return false;
  const track = sameTrack(s, focus);
  return track.length === 0 || track.some(x => x.since === focus.since);
}

// Czy trening liczy się do fokusu (poza oknem czasu). User 2026-10-14: trening
// zrobiony POD ten fokus (migawka z tym samym since) liczy się zawsze —
// późniejsza zmiana tematu treningu albo fokusu nie zabiera kropki („można
// zapomnieć”). Trening bez migawki tego toru (np. poranny, sprzed ustawienia)
// — jak dotąd po temacie. Kropkę zabiera tylko świadome odznaczenie w dzienniku
// (usuwa migawkę i temat — toggleSessionFocus).
export function countsForFocusSession(s: FocusSessionRef, focus: ActiveFocus): boolean {
  const track = sameTrack(s, focus);
  if (track.some(x => x.since === focus.since)) return true;
  if (s.decided) return false;
  return track.length === 0 && countsForFocus(s.topics, focus);
}

const dayKey = (ts: number) => new Date(ts).toDateString();

/**
 * Daty kropek: zaliczone treningi + lekcje zaznaczone przez trenera (marks).
 * Lekcja trenera w dniu, w którym jest już zaliczony trening, nie dokłada
 * drugiej kropki — to ta sama lekcja.
 */
export function focusHitDates(sessions: FocusSessionRef[], focus: ActiveFocus): number[] {
  const hits = sessions.filter(s => inFocusWindow(s, focus) && countsForFocusSession(s, focus)).map(s => s.ts);
  const days = new Set(hits.map(dayKey));
  for (const m of focus.marks || []) {
    if (!days.has(dayKey(m))) { hits.push(m); days.add(dayKey(m)); }
  }
  return hits.sort((a, b) => a - b);
}

export function countFocusSessions(sessions: FocusSessionRef[], focus: ActiveFocus): number {
  return focusHitDates(sessions, focus).length;
}

/** Migawka do zaznaczenia treningu przełącznikiem w dzienniku (bez step/goal). */
export function manualSessionFocus(focus: ActiveFocus): SessionFocus {
  return {
    text: focus.text.slice(0, FOCUS_TEXT_MAX),
    topic: focus.topic,
    since: focus.since,
    fromCoach: focus.fromCoach,
    ...(focus.authorName ? { authorName: focus.authorName } : {}),
  };
}

// Migawka fokusu zapisywana w sesji (`session.focuses[]`, w starszych sesjach
// `session.focus`) — po zmianie albo zakończeniu fokusu w statystykach nadal
// widać, pod jaki fokus był trening. step/goal tylko przy włączonych kropkach:
// „trening 2 z 5".
export interface SessionFocus {
  text: string;
  topic: string;
  since: number;
  fromCoach: boolean;
  authorName?: string;
  step?: number;
  goal?: number;
}

function trackSnapshot(track: FocusTrack): SessionFocus {
  const { focus } = track;
  return {
    text: focus.text,
    topic: focus.topic,
    since: focus.since,
    fromCoach: focus.fromCoach,
    ...(focus.authorName ? { authorName: focus.authorName } : {}),
    ...(track.dots ? { step: track.count + 1, goal: track.goal } : {}),
  };
}

/**
 * Migawki dla nowej sesji z tematami `topics` — każdy aktywny tor, do którego
 * trening się liczy (główny pierwszy). Ukończony tor nie dostaje już treningów.
 */
export function sessionFocusSnapshots(state: FocusState | null, topics: string[]): SessionFocus[] {
  if (!state) return [];
  return orderedTracks(state)
    .filter(tr => !isTrackDone(tr) && countsForFocus(topics, tr.focus))
    .map(trackSnapshot);
}

/** Pola fokusu do zapisu sesji: `focuses[]` + `focus` (pierwsza migawka — dla starszych ekranów). */
export function sessionFocusFields(state: FocusState | null, topics: string[], choice?: FocusChoice): { focus?: SessionFocus; focuses?: SessionFocus[]; focusChoice?: true } {
  if (choice && state && orderedTracks(state).length) {
    // Świadomy wybór (chipy przy zapisie) — tylko zaznaczone tory, niezależnie
    // od tematów; brak migawki = „nie pod ten fokus” (focusChoice).
    const list = orderedTracks(state).filter(tr => choice[sideOf(tr.focus)]).map(trackSnapshot);
    return list.length ? { focus: list[0], focuses: list, focusChoice: true } : { focuses: [], focusChoice: true };
  }
  const list = sessionFocusSnapshots(state, topics);
  return list.length ? { focus: list[0], focuses: list } : {};
}

/** Który fokus liczy ten trening (chipy przy zapisie). */
export type FocusChoice = Record<FocusSide, boolean>;

/** Domyślnie: tylko fokus z góry (user 2026-10-14). */
export function defaultFocusChoice(state: FocusState | null): FocusChoice {
  const main = state ? orderedTracks(state)[0] : undefined;
  return { own: main ? !main.focus.fromCoach : false, coach: main ? main.focus.fromCoach : false };
}

/**
 * Wybór chipów na ekranie zapisu. Dopóki nikt nie kliknął, podąża za fokusem
 * z góry (np. po zamianie miejsc); po kliknięciu zostaje wybór użytkownika.
 */
export function useFocusChoice(state: FocusState | null): [FocusChoice, (next: FocusChoice) => void] {
  const [picked, setPicked] = useState<FocusChoice | null>(null);
  return [picked ?? defaultFocusChoice(state), setPicked];
}

/** Tematy zaznaczonych fokusów — dokładane do tematów treningu. */
export function chosenFocusTopics(state: FocusState | null, choice: FocusChoice): string[] {
  if (!state) return [];
  return orderedTracks(state).filter(tr => choice[sideOf(tr.focus)] && tr.focus.topic).map(tr => tr.focus.topic);
}

/** Migawka fokusu kończonego przyciskiem „Fokus beenden” (uczeń albo trener). */
export function endedFocusSnapshot(focus: ActiveFocus, dots: boolean, count: number, goal: number): SessionFocus {
  return {
    // Cel trenera z dziennika bywa dłuższy — reguła Path L przyjmuje ≤ 120 znaków.
    text: focus.text.slice(0, FOCUS_TEXT_MAX),
    topic: focus.topic,
    since: focus.since,
    fromCoach: focus.fromCoach,
    ...(focus.authorName ? { authorName: focus.authorName } : {}),
    ...(dots ? { step: Math.min(count, goal), goal } : {}),
  };
}

/** Zakończony fokus do pokazania w dzienniku — tylko gdy nic nowszego go nie zastąpiło. */
export function readEndedFocus(own: OwnFocus | null, active: ActiveFocus | null): (SessionFocus & { endedAt: number }) | null {
  if (active || !own?.cleared) return null;
  const e = readSessionFocus({ focus: own.ended });
  return e ? { ...e, endedAt: own.setAt } : null;
}

// --- KAMIEŃ MILOWY W DZIENNIKU ---
// Ukończony (komplet kropek) albo zakończony („Fokus beenden”) fokus zostaje
// na osi czasu jako wpis (user 2026-09-25: „powinno pokazać w Diese Woche”).
// Zapis w users/{uid}/privateNotes/focus_<since> — stałe id = bez duplikatów,
// wpis zostaje też po ustawieniu nowego fokusu. Trener nie pisze do
// privateNotes, więc wpis po zakończeniu przez trenera dopisuje dziennik ucznia.
export interface FocusMilestone extends SessionFocus {
  endedAt: number;
  done: boolean;        // komplet kropek; false = zakończony wcześniej
}

export const focusMilestoneId = (since: number) => `focus_${since}`;

/** Data treningu (albo lekcji trenera), który zapełnił ostatnią kropkę — null, gdy jeszcze nie ma kompletu. */
export function focusCompletedAt(sessions: FocusSessionRef[], focus: ActiveFocus, goal: number): number | null {
  const hits = focusHitDates(sessions, focus);
  return hits.length >= goal ? hits[goal - 1] : null;
}

export function readFocusMilestone(data: any): FocusMilestone | null {
  const f = readSessionFocus({ focus: data?.focus });
  return data?.kind === 'focusMilestone' && f && typeof data.focus.endedAt === 'number'
    ? { ...f, endedAt: data.focus.endedAt, done: data.focus.done === true }
    : null;
}

export function readSessionFocus(session: any): SessionFocus | null {
  const f = session?.focus;
  return f && typeof f.since === 'number' && (f.text || f.topic) ? f : null;
}

function toMs(v: any): number {
  if (!v) return 0;
  if (typeof v === 'number') return v;
  if (typeof v.toMillis === 'function') return v.toMillis();
  if (typeof v.seconds === 'number') return v.seconds * 1000;
  return 0;
}

export function readCoachGoal(id: string, data: any): CoachGoal {
  return {
    id, authorId: data.authorId, ts: toMs(data.createdAt), text: data.text || '', topics: data.topics || [], authorName: data.authorName,
    ...((FOCUS_GOAL_OPTIONS as readonly number[]).includes(data.goal) ? { goal: data.goal } : {}),
    ...(Array.isArray(data.marks) ? { marks: data.marks.filter((m: any) => typeof m === 'number') } : {}),
    ...(typeof data.endedAt === 'number' ? { endedAt: data.endedAt } : {}),
  };
}

// Sam filtr równości — bez orderBy, żeby nie potrzebować indeksu złożonego.
// Celów trenera jest mało, najnowszy wybieramy na miejscu.
async function loadLatestCoachGoal(userId: string): Promise<CoachGoal | undefined> {
  const snap = await getDocs(query(collection(db, `users/${userId}/coachLog`), where('type', '==', 'goal')));
  return snap.docs
    .map(d => readCoachGoal(d.id, d.data()))
    .sort((a, b) => b.ts - a.ts)[0];
}

// Daty kropek fokusu (do podglądu w panelu trenera i w FocusModal —
// "kiedy uczeń nad tym pracował"): zaliczone treningi + lekcje trenera.
export async function loadFocusSessionDates(userId: string, focus: ActiveFocus): Promise<number[]> {
  const snap = await getDocs(query(
    collection(db, `users/${userId}/sessions`),
    where('timestamp', '>=', Timestamp.fromMillis(focusFrom(focus))),
  ));
  return focusHitDates(snap.docs.map(d => sessionFocusRef(d.data(), toMs(d.data().timestamp))), focus);
}

/** Jeden tor fokusu (własny albo trenera) z jego kropkami. */
export interface FocusTrack {
  focus: ActiveFocus;
  dots: boolean;
  goal: number;
  count: number;         // liczone tylko przy włączonych kropkach
}

export function isTrackDone(tr: FocusTrack | null | undefined): boolean {
  return !!tr && tr.dots && tr.count >= tr.goal;
}

/** Tory: główny pierwszy (na razie nowszy). */
export function orderedTracks(state: { own: FocusTrack | null; coach: FocusTrack | null; primary?: FocusSide }): FocusTrack[] {
  const list = [state.own, state.coach].filter(Boolean) as FocusTrack[];
  if (state.primary && list.length === 2) return state.primary === 'own' ? [state.own!, state.coach!] : [state.coach!, state.own!];
  return list.sort((a, b) => b.focus.since - a.focus.since);
}

/** Drugi tor (kropka po prawej na pasku fokusu) — null, gdy jest tylko jeden. */
export function otherTrack(state: FocusState | null): FocusTrack | null {
  return state ? orderedTracks(state)[1] ?? null : null;
}

/** Stan z innym torem na górze (bez ponownego wczytywania). */
export function withPrimary(state: FocusState, primary: FocusSide): FocusState {
  const next = { ...state, primary };
  const main = orderedTracks(next)[0];
  return main ? { ...next, focus: main.focus, dots: main.dots, goal: main.goal, count: main.count } : next;
}

const FOCUS_PRIMARY_EVENT = 'grotx-focus-primary';

/**
 * Zamiana fokusów miejscami — zapis w profilu + sygnał dla wszystkich ekranów
 * z useActiveFocus (Home, Vorbereitung, trening), żeby od razu pokazały to samo.
 */
export async function saveFocusPrimary(userId: string, primary: FocusSide): Promise<void> {
  window.dispatchEvent(new CustomEvent(FOCUS_PRIMARY_EVENT, { detail: { userId, primary } }));
  await updateDoc(doc(db, 'users', userId), { focusPrimary: primary });
}

/** Tap w kropkę drugiego fokusu: drugi tor idzie na górę. */
export function swapFocus(userId: string | null | undefined, state: FocusState | null): void {
  const other = otherTrack(state);
  if (!userId || !other) return;
  saveFocusPrimary(userId, other.focus.fromCoach ? 'coach' : 'own')
    .catch(e => console.error('Fokus: błąd zamiany', e));
}

/** Kropki toru: własny — users.focusDots/focusGoal; trener — goal z wpisu (starsze cele: jak własny). */
export function trackSettings(focus: ActiveFocus, userData: any): { dots: boolean; goal: number } {
  if (focus.fromCoach && focus.entryGoal) return { dots: true, goal: focus.entryGoal };
  return { dots: userData?.focusDots === true, goal: readFocusGoal(userData) };
}

export interface FocusState {
  // Główny tor (na ekranie) — pola jak przed dwoma fokusami.
  focus: ActiveFocus | null;
  dots: boolean;
  goal: number;
  count: number;         // liczone tylko przy włączonych kropkach
  own: FocusTrack | null;
  coach: FocusTrack | null;
  primary?: FocusSide;   // wybór ucznia, który tor na górze (brak = nowszy)
  // Które źródło się nie wczytało ('user' | 'goal' | 'sessions'). Pozostałe
  // i tak są użyte — błąd jednego nie kasuje całego fokusu. Trener w profilu
  // ucznia widzi to jako komunikat zamiast pustego miejsca.
  failed?: string[];
}

/** Stan z torów; główny = pierwszy z orderedTracks (bez fokusu — ustawienia kropek ucznia). */
export function buildFocusState(own: FocusTrack | null, coach: FocusTrack | null, userData: any, failed: string[] = []): FocusState {
  const primary = readFocusPrimary(userData);
  const main = orderedTracks({ own, coach, primary })[0];
  return {
    focus: main?.focus ?? null,
    dots: main ? main.dots : userData?.focusDots === true,
    goal: main ? main.goal : readFocusGoal(userData),
    count: main?.count ?? 0,
    own, coach,
    ...(primary ? { primary } : {}),
    ...(failed.length ? { failed } : {}),
  };
}

/**
 * Fokus jednej osoby: profil (własny fokus, kropki, liczba) + ostatni cel
 * trenera, a przy `withCount` i włączonych kropkach — treningi od startu.
 * `userData` = już wczytany dokument `users/{uid}` (panel trenera ma go
 * z listy uczniów), wtedy bez drugiego odczytu profilu.
 */
export async function loadFocusState(userId: string, withCount: boolean, userData?: any): Promise<FocusState> {
  const failed: string[] = [];
  // Każde źródło osobno: wcześniej jeden odrzucony odczyt (np. dziennik
  // trenerski) wywracał Promise.all i fokus po cichu znikał w całości.
  const [userRes, goalRes] = await Promise.allSettled([
    userData !== undefined ? Promise.resolve(null) : getDoc(doc(db, 'users', userId)),
    loadLatestCoachGoal(userId),
  ]);
  let data: any = userData ?? {};
  if (userData === undefined) {
    if (userRes.status === 'fulfilled' && userRes.value) {
      data = userRes.value.exists() ? userRes.value.data() : {};
    } else {
      failed.push('user');
      console.error('Fokus: błąd odczytu profilu', userRes.status === 'rejected' ? userRes.reason : null);
    }
  }
  let goal: CoachGoal | undefined;
  if (goalRes.status === 'fulfilled') {
    goal = goalRes.value;
  } else {
    failed.push('goal');
    console.error('Fokus: błąd odczytu celów trenera', goalRes.reason);
  }
  const own = readOwnFocus(data);
  const focuses = [resolveOwnFocus(own), resolveCoachFocus(goal, own, readCoachFocusCleared(data))]
    .filter(Boolean) as ActiveFocus[];
  const tracks: FocusTrack[] = focuses.map(f => ({ focus: f, ...trackSettings(f, data), count: 0 }));
  const toCount = tracks.filter(tr => tr.dots);
  if (withCount && toCount.length) {
    try {
      const from = Math.min(...toCount.map(tr => focusFrom(tr.focus)));
      const sSnap = await getDocs(query(
        collection(db, `users/${userId}/sessions`),
        where('timestamp', '>=', Timestamp.fromMillis(from)),
      ));
      const refs = sSnap.docs.map(d => sessionFocusRef(d.data(), toMs(d.data().timestamp)));
      for (const tr of toCount) tr.count = countFocusSessions(refs, tr.focus);
    } catch (e) {
      failed.push('sessions');
      console.error('Fokus: błąd odczytu treningów', e);
    }
  }
  return buildFocusState(
    tracks.find(tr => !tr.focus.fromCoach) ?? null,
    tracks.find(tr => tr.focus.fromCoach) ?? null,
    data,
    failed,
  );
}

/**
 * Fokus dla ekranów poza dziennikiem (Home, start treningu, wyniki).
 * `withCount` dociąga treningi od dnia ustawienia fokusu — tylko gdy kropki
 * są włączone, żeby reszta ludzi nie płaciła za dodatkowy odczyt.
 */
export function useActiveFocus(
  userId: string | null | undefined,
  withCount = false,
  // Zmiana wartości = ponowne wczytanie (np. trener wraca z zakładki Dziennik,
  // gdzie właśnie dodał „Ziel").
  refreshKey: unknown = 0,
): FocusState | null {
  const [state, setState] = useState<FocusState | null>(null);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    loadFocusState(userId, withCount).then(st => { if (!cancelled) setState(st); });
    // Zamiana fokusów na innym ekranie — od razu tutaj, bez ponownego wczytania.
    const onPrimary = (e: Event) => {
      const d = (e as CustomEvent).detail;
      if (d?.userId === userId) setState(st => (st ? withPrimary(st, d.primary) : st));
    };
    window.addEventListener(FOCUS_PRIMARY_EVENT, onPrimary);
    return () => { cancelled = true; window.removeEventListener(FOCUS_PRIMARY_EVENT, onPrimary); };
  }, [userId, withCount, refreshKey]);

  return state;
}

/** Fokus ukończony: kropki włączone i komplet treningów. */
export function isFocusDone(state: FocusState | null): boolean {
  return !!state?.focus && state.dots && state.count >= state.goal;
}

/** Bez ukończonych torów — główny staje się następny nieukończony. */
export function withoutDoneTracks(state: FocusState): FocusState {
  const own = isTrackDone(state.own) ? null : state.own;
  const coach = isTrackDone(state.coach) ? null : state.coach;
  if (own === state.own && coach === state.coach) return state;
  const main = orderedTracks({ own, coach, primary: state.primary })[0];
  return main
    ? { ...state, own, coach, focus: main.focus, dots: main.dots, goal: main.goal, count: main.count }
    : { ...state, own, coach, focus: null };
}

/**
 * Fokus do pracy „teraz” (Home, Vorbereitung, trening): ukończony fokus
 * znika — zostaje tylko w dzienniku jako „ostatni zakończony” (user
 * 2026-09-18). Treningi nie dostają już jego tematu ani migawki.
 */
export function useCurrentFocus(userId: string | null | undefined): FocusState | null {
  const state = useActiveFocus(userId, true);
  return state ? withoutDoneTracks(state) : state;
}
