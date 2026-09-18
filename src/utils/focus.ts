import { useEffect, useState } from 'react';
import { doc, getDoc, getDocs, collection, query, where, Timestamp } from 'firebase/firestore';
import { db } from '../firebase';

// --- FOKUS ---
// „Nad czym teraz pracuję". Własny fokus siedzi w users/{uid}.focus; trener
// ustawia fokus wpisem typu „Ziel" w coachLog. Obowiązuje nowszy z nich.
// Kropki (postęp) są opcjonalne — users/{uid}.focusDots. Kto je włączy,
// zbiera kropkę za każdy trening z tematem fokusu (session.topics; fokus bez
// tematu — za każdy trening); po
// users/{uid}.focusGoal takich treningach (2–5, sam wybiera) fokus jest
// „utrwalony". Trening bez fokusu niczego nie zeruje — suma, nie seria.

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
export interface OwnFocus {
  topic?: string;
  text?: string;
  setAt: number;
  cleared?: boolean;
}

export interface CoachGoal {
  id?: string;           // ID wpisu w coachLog — autor może zmienić temat (C39)
  authorId?: string;
  ts: number;
  text: string;
  topics: string[];
  authorName?: string;
}

export interface ActiveFocus {
  topic: string;         // '' = bez tematu — kropki liczą wtedy każdy trening
  text: string;
  since: number;
  fromCoach: boolean;
  authorName?: string;
  goalId?: string;       // tylko fokus trenera — wpis w coachLog
  authorId?: string;
}

export function readOwnFocus(userData: any): OwnFocus | null {
  const f = userData?.focus;
  return f && typeof f.setAt === 'number' ? f : null;
}

export function resolveActiveFocus(own: OwnFocus | null, goal: CoachGoal | undefined): ActiveFocus | null {
  if (own && (!goal || own.setAt >= goal.ts)) {
    // Sam tekst bez tematu też jest fokusem (jak u trenera).
    if (own.cleared || (!own.topic && !own.text)) return null;
    return { topic: own.topic || '', text: own.text || '', since: own.setAt, fromCoach: false };
  }
  if (!goal) return null;
  return { topic: goal.topics[0] || '', text: goal.text, since: goal.ts, fromCoach: true, authorName: goal.authorName, goalId: goal.id, authorId: goal.authorId };
}

// Liczą się treningi od początku dnia ustawienia fokusu — ktoś trenuje rano,
// a fokus wpisuje wieczorem, i ten poranny trening też chce zaznaczyć.
export function focusFrom(focus: ActiveFocus): number {
  return new Date(focus.since).setHours(0, 0, 0, 0);
}

// Fokus bez tematu (user 2026-09-18: temat nieobowiązkowy) — każdy trening
// od dnia ustawienia dokłada kropkę; z tematem tylko treningi z tym tematem.
function countsForFocus(topics: string[], focus: ActiveFocus): boolean {
  return !focus.topic || topics.includes(focus.topic);
}

export function countFocusSessions(sessions: { ts: number; topics: string[] }[], focus: ActiveFocus): number {
  const from = focusFrom(focus);
  return sessions.filter(s => s.ts >= from && countsForFocus(s.topics, focus)).length;
}

function toMs(v: any): number {
  if (!v) return 0;
  if (typeof v === 'number') return v;
  if (typeof v.toMillis === 'function') return v.toMillis();
  if (typeof v.seconds === 'number') return v.seconds * 1000;
  return 0;
}

// Sam filtr równości — bez orderBy, żeby nie potrzebować indeksu złożonego.
// Celów trenera jest mało, najnowszy wybieramy na miejscu.
async function loadLatestCoachGoal(userId: string): Promise<CoachGoal | undefined> {
  const snap = await getDocs(query(collection(db, `users/${userId}/coachLog`), where('type', '==', 'goal')));
  return snap.docs
    .map(d => {
      const data = d.data();
      return { id: d.id, authorId: data.authorId, ts: toMs(data.createdAt), text: data.text || '', topics: data.topics || [], authorName: data.authorName };
    })
    .sort((a, b) => b.ts - a.ts)[0];
}

// Daty treningów zaliczonych do fokusu (do podglądu w panelu trenera —
// "kiedy uczeń nad tym pracował"). Ten sam filtr co countFocusSessions,
// ale zwraca same znaczniki czasu, bez opakowania w hook.
export async function loadFocusSessionDates(userId: string, focus: ActiveFocus): Promise<number[]> {
  const snap = await getDocs(query(
    collection(db, `users/${userId}/sessions`),
    where('timestamp', '>=', Timestamp.fromMillis(focusFrom(focus))),
  ));
  return snap.docs
    .map(d => ({ ts: toMs(d.data().timestamp), topics: d.data().topics || [] }))
    .filter(s => countsForFocus(s.topics, focus))
    .map(s => s.ts)
    .sort((a, b) => a - b);
}

export interface FocusState {
  focus: ActiveFocus | null;
  dots: boolean;
  goal: number;
  count: number;         // liczone tylko przy włączonych kropkach
  // Które źródło się nie wczytało ('user' | 'goal' | 'sessions'). Pozostałe
  // i tak są użyte — błąd jednego nie kasuje całego fokusu. Trener w profilu
  // ucznia widzi to jako komunikat zamiast pustego miejsca.
  failed?: string[];
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
  const focus = resolveActiveFocus(readOwnFocus(data), goal);
  const dots = data.focusDots === true;
  let count = 0;
  if (withCount && dots && focus) {
    try {
      const sSnap = await getDocs(query(
        collection(db, `users/${userId}/sessions`),
        where('timestamp', '>=', Timestamp.fromMillis(focusFrom(focus))),
      ));
      count = countFocusSessions(
        sSnap.docs.map(d => ({ ts: toMs(d.data().timestamp), topics: d.data().topics || [] })),
        focus,
      );
    } catch (e) {
      failed.push('sessions');
      console.error('Fokus: błąd odczytu treningów', e);
    }
  }
  return { focus, dots, goal: readFocusGoal(data), count, ...(failed.length ? { failed } : {}) };
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
    return () => { cancelled = true; };
  }, [userId, withCount, refreshKey]);

  return state;
}
