import { useEffect, useState } from 'react';
import { doc, getDoc, getDocs, collection, query, where, orderBy, limit, Timestamp, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';

// --- FOKUS ---
// „Nad czym teraz pracuję". Własny fokus siedzi w users/{uid}.focus; trener
// ustawia fokus wpisem typu „Ziel" w coachLog. Od 2026-10-15 znowu JEDEN
// fokus (user: dwa tory były zagmatwane) — obowiązuje nowszy z nich, żółty
// od ucznia, niebieski od trenera; obaj mogą go zmienić i zakończyć.
// Obok fokusu: TEMAT TRENINGU od trenera (wpis 'topic' w coachLog, jeden dzień)
// — patrz sekcja „TEMAT TRENINGU” niżej.
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

// users/{uid}.coachFocusCleared — uczeń zakończył (albo przejął edycją) fokus
// od trenera; wpisu trenera sam zmienić nie może.
export interface CoachFocusCleared { since: number; setAt: number; ended?: SessionFocus }

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
  topicId?: string;      // TEMAT TRENINGU (nie fokus) — id wpisu 'topic' w coachLog
  links?: string[];      // TEMAT TRENINGU — linki od trenera
  desc?: string;         // TEMAT TRENINGU — opis pod tytułem (jak treść maila)
  linkTitles?: string[]; // TEMAT TRENINGU — tytuły linków (ten sam indeks co links)
  day?: string;          // TEMAT TRENINGU — dzień treningu 'YYYY-MM-DD' (kafelek daty)
}

/** Dzień tematu treningu jako znacznik czasu (południe — bez przesunięć strefy). */
export function topicDayTs(f: Pick<ActiveFocus, 'day' | 'since'>): number {
  return (f.day && new Date(`${f.day}T12:00:00`).getTime()) || f.since;
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
export function resolveCoachFocus(goal: CoachGoal | undefined, cleared: CoachFocusCleared | null): ActiveFocus | null {
  if (!goal || goal.endedAt) return null;
  if (cleared && cleared.since === goal.ts) return null;
  return { topic: goal.topics[0] || '', text: goal.text, since: goal.ts, fromCoach: true, authorName: goal.authorName, goalId: goal.id, authorId: goal.authorId,
    ...(goal.marks?.length ? { marks: goal.marks } : {}),
    ...(goal.goal ? { entryGoal: goal.goal } : {}) };
}

// Skąd fokus: własny ucznia albo od trenera (chipy wyboru przy zapisie).
export type FocusSide = 'own' | 'coach';

const sideOf = (f: ActiveFocus): FocusSide => (f.fromCoach ? 'coach' : 'own');

/**
 * Jeden fokus (user 2026-10-15): nowszy z własnego (albo jego zakończenia)
 * i ostatniego celu trenera (albo jego zakończenia). Zakończony nowszy = brak
 * fokusu — starszy nie wraca sam z siebie.
 */
export function resolveActiveFocus(own: OwnFocus | null, goal: CoachGoal | undefined, cleared: CoachFocusCleared | null = null): ActiveFocus | null {
  const ownTs = own?.setAt ?? -Infinity;
  if (goal && goal.ts > ownTs) {
    // Uczeń zakończył fokus trenera (coachFocusCleared) — po tej chwili nie ma fokusu.
    return resolveCoachFocus(goal, cleared);
  }
  return resolveOwnFocus(own);
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
export function sessionFocusFields(state: FocusState | null, topics: string[], choice?: FocusChoice): { focus?: SessionFocus; focuses?: SessionFocus[]; focusChoice?: true; trainingTopic?: SessionTrainingTopic } {
  const tt = choice?.topic && state?.trainingTopic ? { trainingTopic: sessionTrainingTopic(state.trainingTopic) } : {};
  return { ...focusOnlyFields(state, topics, choice), ...tt };
}

function focusOnlyFields(state: FocusState | null, topics: string[], choice?: FocusChoice): { focus?: SessionFocus; focuses?: SessionFocus[]; focusChoice?: true } {
  if (choice && state && orderedTracks(state).length) {
    // Świadomy wybór (chipy przy zapisie) — tylko zaznaczone tory, niezależnie
    // od tematów; brak migawki = „nie pod ten fokus” (focusChoice).
    const list = orderedTracks(state).filter(tr => choice[sideOf(tr.focus)]).map(trackSnapshot);
    return list.length ? { focus: list[0], focuses: list, focusChoice: true } : { focuses: [], focusChoice: true };
  }
  const list = sessionFocusSnapshots(state, topics);
  return list.length ? { focus: list[0], focuses: list } : {};
}

/** Pod co idzie ten trening (chipy przy zapisie): fokus i/lub temat treningu. */
export type FocusChoice = Record<FocusSide | 'topic', boolean>;

/** Domyślnie: fokus i dzisiejszy temat treningu, jeśli są. */
export function defaultFocusChoice(state: FocusState | null): FocusChoice {
  const main = state ? orderedTracks(state)[0] : undefined;
  return { own: main ? !main.focus.fromCoach : false, coach: main ? main.focus.fromCoach : false, topic: !!state?.trainingTopic };
}

/**
 * Wybór chipów na ekranie zapisu. Dopóki nikt nie kliknął, podąża za fokusem
 * z góry (np. po zamianie miejsc); po kliknięciu zostaje wybór użytkownika.
 */
export function useFocusChoice(state: FocusState | null, userId?: string | null): [FocusChoice, (next: FocusChoice) => void] {
  // Z userId wybór zostaje na resztę dnia w telefonie — zaznaczony w
  // Vorbereitung przechodzi na ekran z tarczą (user 2026-10-15).
  const key = userId ? `grotx_focusChoice_${userId}` : '';
  const [picked, setPicked] = useState<FocusChoice | null>(() => {
    if (!key) return null;
    try {
      const v = JSON.parse(localStorage.getItem(key) || 'null');
      return v?.day === dayKeyOf(Date.now()) ? v.choice : null;
    } catch { return null; }
  });
  const pick = (next: FocusChoice) => {
    setPicked(next);
    if (key) try { localStorage.setItem(key, JSON.stringify({ day: dayKeyOf(Date.now()), choice: next })); } catch { /* prywatny tryb */ }
  };
  const base = defaultFocusChoice(state);
  if (!picked) return [base, pick];
  // Jeden fokus: zaznaczony = ten, który jest (własny albo od trenera).
  const focusOn = picked.own || picked.coach;
  return [{ own: base.own && focusOn, coach: base.coach && focusOn, topic: base.topic && picked.topic !== false }, pick];
}

/** Tematy zaznaczonych fokusów — dokładane do tematów treningu. */
export function chosenFocusTopics(state: FocusState | null, choice: FocusChoice): string[] {
  if (!state) return [];
  const list = orderedTracks(state).filter(tr => choice[sideOf(tr.focus)] && tr.focus.topic).map(tr => tr.focus.topic);
  if (choice.topic && state.trainingTopic?.topic) list.push(state.trainingTopic.topic);
  return [...new Set(list)];
}

/**
 * Lista tematów widoczna w wyborze tematów: zaznaczone ręcznie + tematy
 * fokusu/tematu treningu z „Dieses Training zählt für” (user 2026-10-23:
 * zaznaczony temat od trenera ma być zaznaczony też w tematach).
 */
export function shownTopics(state: FocusState | null, choice: FocusChoice, picked: string[]): string[] {
  return [...new Set([...picked, ...chosenFocusTopics(state, choice)])];
}

/**
 * Zmiana w wyborze tematów. Odznaczony temat fokusu albo tematu treningu
 * odznacza też jego chip (inaczej wróciłby sam). Ręczne `picked` nie trzyma
 * tematów, które i tak dochodzą z chipów.
 */
export function pickTopics(state: FocusState | null, choice: FocusChoice, next: string[]): { picked: string[]; choice: FocusChoice } {
  let nextChoice = choice;
  if (state) {
    for (const tr of orderedTracks(state)) {
      const side = sideOf(tr.focus);
      if (choice[side] && tr.focus.topic && !next.includes(tr.focus.topic)) nextChoice = { ...nextChoice, [side]: false };
    }
    const tt = state.trainingTopic?.topic;
    if (choice.topic && tt && !next.includes(tt)) nextChoice = { ...nextChoice, topic: false };
  }
  const linked = chosenFocusTopics(state, nextChoice);
  return { picked: next.filter(x => !linked.includes(x)), choice: nextChoice };
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

// Dawniej jedno zapytanie o WSZYSTKIE cele i tematy — tematy grupy dochodzą
// co trening, więc panel trenera czytał po roku ~100 wpisów na ucznia.
// Teraz: najnowszy cel (indeks coachLog: type + createdAt DESC) i tylko
// dzisiejsze tematy — otwarty temat to z definicji dzisiejszy (isTopicOpen).
async function loadCoachFocusEntries(userId: string): Promise<{ goal: CoachGoal | undefined; topic: TrainingTopic | null }> {
  const col = collection(db, `users/${userId}/coachLog`);
  const [goalSnap, topicSnap] = await Promise.all([
    getDocs(query(col, where('type', '==', 'goal'), orderBy('createdAt', 'desc'), limit(1))),
    getDocs(query(col, where('type', '==', 'topic'), where('day', '==', dayKeyOf(Date.now())))),
  ]);
  const goal = goalSnap.docs.map(d => readCoachGoal(d.id, d.data()))[0];
  const topic = topicSnap.docs
    .map(d => readTrainingTopic(d.id, d.data()))
    .filter((x): x is TrainingTopic => !!x && isTopicOpen(x))
    .sort((a, b) => b.ts - a.ts)[0] ?? null;
  return { goal, topic };
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

/** Tor fokusu jako lista (jeden fokus — 0 albo 1 element). */
export function orderedTracks(state: { own: FocusTrack | null; coach: FocusTrack | null }): FocusTrack[] {
  return [state.own, state.coach].filter(Boolean) as FocusTrack[];
}

/**
 * Co jest na górze karty: fokus czy temat treningu (tap w chip). Tylko w dniu
 * treningu, więc wystarczy pamięć telefonu z datą dnia — jutro wraca fokus.
 */
const TOPIC_FIRST_EVENT = 'grotx-topic-first';
const topicFirstKey = (userId: string) => `grotx_topicFirst_${userId}`;

export function readTopicFirst(userId: string): boolean {
  try { return localStorage.getItem(topicFirstKey(userId)) === dayKeyOf(Date.now()); } catch { return false; }
}

/** Główny i drugi element karty fokusu: fokus i temat treningu. */
export function displayPair(state: FocusState | null): { main: ActiveFocus | null; other: ActiveFocus | null } {
  const f = state?.focus ?? null;
  const tp = state?.trainingTopic ?? null;
  if (!f || !tp) return { main: f || tp, other: null };
  return state!.topicFirst ? { main: tp, other: f } : { main: f, other: tp };
}

/** Kropki tylko dla fokusu — temat treningu ich nie ma. */
export function displayProgress(state: FocusState | null, item: ActiveFocus | null): { dots: boolean; goal: number; count: number } {
  if (!state || !item || item.topicId) return { dots: false, goal: 0, count: 0 };
  return { dots: state.dots, goal: state.goal, count: state.count };
}

/** Tap w chip: fokus i temat treningu zamieniają się miejscami. */
export function swapFocus(userId: string | null | undefined, state: FocusState | null): void {
  if (!userId || !state?.trainingTopic || !state.focus) return;
  saveTopicFirst(userId, !state.topicFirst);
}

export function saveTopicFirst(userId: string, next: boolean): void {
  try {
    if (next) localStorage.setItem(topicFirstKey(userId), dayKeyOf(Date.now()));
    else localStorage.removeItem(topicFirstKey(userId));
  } catch { /* prywatny tryb */ }
  window.dispatchEvent(new CustomEvent(TOPIC_FIRST_EVENT, { detail: { userId, topicFirst: next } }));
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
  // Dzisiejszy, otwarty temat treningu od trenera (ActiveFocus z topicId).
  trainingTopic?: ActiveFocus | null;
  topicFirst?: boolean;  // w dniu treningu temat na górze zamiast fokusu (tap w chip)
  // Które źródło się nie wczytało ('user' | 'goal' | 'sessions'). Pozostałe
  // i tak są użyte — błąd jednego nie kasuje całego fokusu. Trener w profilu
  // ucznia widzi to jako komunikat zamiast pustego miejsca.
  failed?: string[];
}

/** Stan z torów; główny = pierwszy z orderedTracks (bez fokusu — ustawienia kropek ucznia). */
export function buildFocusState(own: FocusTrack | null, coach: FocusTrack | null, userData: any, failed: string[] = []): FocusState {
  const main = orderedTracks({ own, coach })[0];
  return {
    focus: main?.focus ?? null,
    dots: main ? main.dots : userData?.focusDots === true,
    goal: main ? main.goal : readFocusGoal(userData),
    count: main?.count ?? 0,
    own, coach,
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
    loadCoachFocusEntries(userId),
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
  let topic: TrainingTopic | null = null;
  if (goalRes.status === 'fulfilled') {
    goal = goalRes.value.goal;
    topic = goalRes.value.topic;
  } else {
    failed.push('goal');
    console.error('Fokus: błąd odczytu celów trenera', goalRes.reason);
  }
  const own = readOwnFocus(data);
  const main = resolveActiveFocus(own, goal, readCoachFocusCleared(data));
  const focuses = main ? [main] : [];
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
  const st = buildFocusState(
    tracks.find(tr => !tr.focus.fromCoach) ?? null,
    tracks.find(tr => tr.focus.fromCoach) ?? null,
    data,
    failed,
  );
  return { ...st, trainingTopic: topic ? topicAsFocus(topic) : null, topicFirst: readTopicFirst(userId) };
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
    // Zamiana fokus ↔ temat na innym ekranie — od razu tutaj, bez ponownego wczytania.
    const onTopicFirst = (e: Event) => {
      const d = (e as CustomEvent).detail;
      if (d?.userId === userId) setState(st => (st ? { ...st, topicFirst: d.topicFirst } : st));
    };
    window.addEventListener(TOPIC_FIRST_EVENT, onTopicFirst);
    return () => {
      cancelled = true;
      window.removeEventListener(TOPIC_FIRST_EVENT, onTopicFirst);
    };
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
  const main = orderedTracks({ own, coach })[0];
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

// --- TEMAT TRENINGU ---
// (user 2026-10-15) Trener rano ustawia grupie temat dzisiejszego treningu —
// wpis 'topic' w users/{uid}/coachLog u każdego członka grupy (day =
// 'YYYY-MM-DD'). Jeden temat = jeden trening. Otwarty tylko w swoim dniu:
// trener zamyka go (closedAt), a jak zapomni — po północy liczy się jako
// zamknięty (Spark: bez funkcji serwera, więc po dacie). Po zamknięciu w
// dzienniku: trenował pod temat (sesja z trainingTopic.id) = ✓, reszta może
// potwierdzić „Zapoznałem się” (ackAt). Fioletowy — inny niż oba kolory fokusu.

export interface TrainingTopic {
  id: string;
  text: string;
  topic: string;
  day: string;
  ts: number;
  authorId?: string;
  authorName?: string;
  groupId?: string;
  closedAt?: number;
  ackAt?: number;
  links?: string[];     // do TOPIC_LINKS_MAX linków http(s) od trenera
  desc?: string;        // opis pod tytułem, do TOPIC_DESC_MAX znaków
  linkTitles?: string[]; // tytuł przy linku (ten sam indeks), '' = bez tytułu
}

// [LINKI W TEMACIE] (user 2026-10-16) Trener dokłada do tematu do 3 linków
// (YouTube, strona). Tylko zwykły link — bez osadzania i miniatur, więc nic
// nie leci do Google/YouTube, dopóki uczeń sam nie potwierdzi otwarcia (RODO).
export const TOPIC_LINKS_MAX = 3;
/** Opis tematu pod tytułem — jak treść maila pod tematem (user 2026-10-22). LUSTRO: firestore.rules (coachLog). */
export const TOPIC_DESC_MAX = 1000;
/** Tytuł linku (wpisany albo pobrany z YouTube przez trenera). LUSTRO: firestore.rules. */
export const TOPIC_LINK_TITLE_MAX = 120;
export const TOPIC_LINK_MAX_LEN = 500;

/** Link wpisany przez trenera → pełny adres http(s) albo null (zły / inny protokół). */
export function normalizeTopicLink(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  try {
    const u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(s) ? s : `https://${s}`);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    if (!u.hostname.includes('.')) return null;
    const href = u.href;
    return href.length <= TOPIC_LINK_MAX_LEN ? href : null;
  } catch {
    return null;
  }
}

export function readTopicLinks(data: any): string[] {
  return Array.isArray(data?.links)
    ? data.links.filter((l: unknown): l is string => typeof l === 'string' && normalizeTopicLink(l) === l).slice(0, TOPIC_LINKS_MAX)
    : [];
}

/** Tytuły do linków z readTopicLinks — ten sam porządek, '' gdy brak. */
export function readTopicLinkTitles(data: any): string[] {
  if (!Array.isArray(data?.links)) return [];
  const titles: unknown[] = Array.isArray(data.linkTitles) ? data.linkTitles : [];
  return (data.links as unknown[])
    .map((l, i) => ({ l, i }))
    .filter(({ l }) => typeof l === 'string' && normalizeTopicLink(l) === l)
    .slice(0, TOPIC_LINKS_MAX)
    .map(({ i }) => (typeof titles[i] === 'string' ? (titles[i] as string).slice(0, TOPIC_LINK_TITLE_MAX) : ''));
}

/** Migawka tematu w sesji — trening robiony pod ten temat. */
export interface SessionTrainingTopic { id: string; text: string; topic: string; day: string }

export function dayKeyOf(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function readTrainingTopic(id: string, data: any): TrainingTopic | null {
  if (data?.type !== 'topic' || typeof data.day !== 'string') return null;
  return {
    id, text: data.text || '', topic: (data.topics || [])[0] || '', day: data.day, ts: toMs(data.createdAt) || Date.now(),
    ...(data.authorId ? { authorId: data.authorId } : {}),
    ...(data.authorName ? { authorName: data.authorName } : {}),
    ...(data.groupId ? { groupId: data.groupId } : {}),
    ...(typeof data.closedAt === 'number' ? { closedAt: data.closedAt } : {}),
    ...(data.ackAt ? { ackAt: toMs(data.ackAt) } : {}),
    ...(readTopicLinks(data).length ? { links: readTopicLinks(data) } : {}),
    ...(typeof data.desc === 'string' && data.desc ? { desc: data.desc } : {}),
    ...(readTopicLinkTitles(data).some(Boolean) ? { linkTitles: readTopicLinkTitles(data) } : {}),
  };
}

/** Otwarty = dzisiejszy i niezamknięty przez trenera. */
export function isTopicOpen(t: Pick<TrainingTopic, 'closedAt' | 'day'>, now = Date.now()): boolean {
  return !t.closedAt && t.day === dayKeyOf(now);
}

export function topicAsFocus(t: TrainingTopic): ActiveFocus {
  return { topic: t.topic, text: t.text, since: t.ts, fromCoach: true, topicId: t.id, day: t.day,
    ...(t.authorName ? { authorName: t.authorName } : {}), ...(t.authorId ? { authorId: t.authorId } : {}),
    ...(t.links?.length ? { links: t.links } : {}), ...(t.desc ? { desc: t.desc } : {}), ...(t.linkTitles ? { linkTitles: t.linkTitles } : {}) };
}

export function sessionTrainingTopic(f: ActiveFocus): SessionTrainingTopic {
  return { id: f.topicId!, text: f.text.slice(0, FOCUS_TEXT_MAX), topic: f.topic, day: dayKeyOf(f.since) };
}

/** Id tematu, pod który był trening (albo ''). */
export function sessionTopicId(data: any): string {
  return typeof data?.trainingTopic?.id === 'string' ? data.trainingTopic.id : '';
}
