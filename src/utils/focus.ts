import { useEffect, useState } from 'react';
import { doc, getDoc, getDocs, collection, query, where, Timestamp } from 'firebase/firestore';
import { db } from '../firebase';

// --- FOKUS ---
// „Nad czym teraz pracuję". Własny fokus siedzi w users/{uid}.focus; trener
// ustawia fokus wpisem typu „Ziel" w coachLog. Obowiązuje nowszy z nich.
// Kropki (postęp) są opcjonalne — users/{uid}.focusDots. Kto je włączy,
// zbiera kropkę za każdy trening z tematem fokusu (session.topics); po
// users/{uid}.focusGoal takich treningach (2–5, sam wybiera) fokus jest
// „utrwalony". Trening bez fokusu niczego nie zeruje — suma, nie seria.

export const FOCUS_TEXT_MAX = 120;
export const FOCUS_GOAL_OPTIONS = [2, 3, 4, 5] as const;
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
  ts: number;
  text: string;
  topics: string[];
  authorName?: string;
}

export interface ActiveFocus {
  topic: string;         // '' = bez tematu (cel trenera bez tematów) — bez kropek
  text: string;
  since: number;
  fromCoach: boolean;
  authorName?: string;
}

export function readOwnFocus(userData: any): OwnFocus | null {
  const f = userData?.focus;
  return f && typeof f.setAt === 'number' ? f : null;
}

export function resolveActiveFocus(own: OwnFocus | null, goal: CoachGoal | undefined): ActiveFocus | null {
  if (own && (!goal || own.setAt >= goal.ts)) {
    // Sam tekst bez tematu też jest fokusem (jak u trenera) — tylko bez kropek.
    if (own.cleared || (!own.topic && !own.text)) return null;
    return { topic: own.topic || '', text: own.text || '', since: own.setAt, fromCoach: false };
  }
  if (!goal) return null;
  return { topic: goal.topics[0] || '', text: goal.text, since: goal.ts, fromCoach: true, authorName: goal.authorName };
}

// Liczą się treningi od początku dnia ustawienia fokusu — ktoś trenuje rano,
// a fokus wpisuje wieczorem, i ten poranny trening też chce zaznaczyć.
export function focusFrom(focus: ActiveFocus): number {
  return new Date(focus.since).setHours(0, 0, 0, 0);
}

export function countFocusSessions(sessions: { ts: number; topics: string[] }[], focus: ActiveFocus): number {
  if (!focus.topic) return 0;
  const from = focusFrom(focus);
  return sessions.filter(s => s.ts >= from && s.topics.includes(focus.topic)).length;
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
      return { ts: toMs(data.createdAt), text: data.text || '', topics: data.topics || [], authorName: data.authorName };
    })
    .sort((a, b) => b.ts - a.ts)[0];
}

// Daty treningów zaliczonych do fokusu (do podglądu w panelu trenera —
// "kiedy uczeń nad tym pracował"). Ten sam filtr co countFocusSessions,
// ale zwraca same znaczniki czasu, bez opakowania w hook.
export async function loadFocusSessionDates(userId: string, focus: ActiveFocus): Promise<number[]> {
  if (!focus.topic) return [];
  const snap = await getDocs(query(
    collection(db, `users/${userId}/sessions`),
    where('timestamp', '>=', Timestamp.fromMillis(focusFrom(focus))),
  ));
  return snap.docs
    .map(d => ({ ts: toMs(d.data().timestamp), topics: d.data().topics || [] }))
    .filter(s => s.topics.includes(focus.topic))
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
    (async () => {
      const failed: string[] = [];
      // Każde źródło osobno: wcześniej jeden odrzucony odczyt (np. dziennik
      // trenerski) wywracał Promise.all i fokus po cichu znikał w całości.
      const [userRes, goalRes] = await Promise.allSettled([
        getDoc(doc(db, 'users', userId)),
        loadLatestCoachGoal(userId),
      ]);
      let data: any = {};
      if (userRes.status === 'fulfilled') {
        data = userRes.value.exists() ? userRes.value.data() : {};
      } else {
        failed.push('user');
        console.error('Fokus: błąd odczytu profilu', userRes.reason);
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
      if (withCount && dots && focus?.topic) {
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
      if (!cancelled) {
        setState({ focus, dots, goal: readFocusGoal(data), count, ...(failed.length ? { failed } : {}) });
      }
    })();
    return () => { cancelled = true; };
  }, [userId, withCount, refreshKey]);

  return state;
}
