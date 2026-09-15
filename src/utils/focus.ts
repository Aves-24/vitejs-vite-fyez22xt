import { useEffect, useState } from 'react';
import { doc, getDoc, getDocs, collection, query, where, Timestamp } from 'firebase/firestore';
import { db } from '../firebase';

// --- FOKUS ---
// „Nad czym teraz pracuję". Własny fokus siedzi w users/{uid}.focus; trener
// ustawia fokus wpisem typu „Ziel" w coachLog. Obowiązuje nowszy z nich.
// Kropki (postęp) są opcjonalne — users/{uid}.focusDots. Kto je włączy,
// zaznacza fokus przy treningach (temat w session.topics); po FOCUS_GOAL
// takich treningach fokus jest „utrwalony". Trening bez fokusu niczego nie
// zeruje — liczy się suma, nie seria.

export const FOCUS_TEXT_MAX = 120;
export const FOCUS_GOAL = 5;

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
    if (own.cleared || !own.topic) return null;
    return { topic: own.topic, text: own.text || '', since: own.setAt, fromCoach: false };
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

export interface FocusState {
  focus: ActiveFocus | null;
  dots: boolean;
  count: number;         // liczone tylko przy włączonych kropkach
}

/**
 * Fokus dla ekranów poza dziennikiem (Home, start treningu, wyniki).
 * `withCount` dociąga treningi od dnia ustawienia fokusu — tylko gdy kropki
 * są włączone, żeby reszta ludzi nie płaciła za dodatkowy odczyt.
 */
export function useActiveFocus(userId: string | null | undefined, withCount = false): FocusState | null {
  const [state, setState] = useState<FocusState | null>(null);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      try {
        const [userSnap, goal] = await Promise.all([
          getDoc(doc(db, 'users', userId)),
          loadLatestCoachGoal(userId),
        ]);
        const data = userSnap.exists() ? userSnap.data() : {};
        const focus = resolveActiveFocus(readOwnFocus(data), goal);
        const dots = data.focusDots === true;
        let count = 0;
        if (withCount && dots && focus?.topic) {
          const sSnap = await getDocs(query(
            collection(db, `users/${userId}/sessions`),
            where('timestamp', '>=', Timestamp.fromMillis(focusFrom(focus))),
          ));
          count = countFocusSessions(
            sSnap.docs.map(d => ({ ts: toMs(d.data().timestamp), topics: d.data().topics || [] })),
            focus,
          );
        }
        if (!cancelled) setState({ focus, dots, count });
      } catch (e) {
        console.error('Fokus: błąd wczytywania', e);
      }
    })();
    return () => { cancelled = true; };
  }, [userId, withCount]);

  return state;
}
