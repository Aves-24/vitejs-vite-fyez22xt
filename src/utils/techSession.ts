import { addDoc, collection, doc, increment, serverTimestamp, Timestamp, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { getSetupStamp } from './setupStamp';
import { sessionFocusSnapshot, FocusState } from './focus';

function invalidateStatsCache(userId: string) {
  localStorage.removeItem(`grotX_stats_v13_${userId}`);
  localStorage.removeItem(`grotX_lastSession_${userId}`);
  window.dispatchEvent(new CustomEvent('grotx-stats-updated'));
}

/** Strzaly bez sesji — licznik dnia na profilu (Pfeilzaehler), liczony na stronie glownej. */
export async function addToDailyArrowCounter(userId: string, count: number): Promise<void> {
  const now = new Date();
  const dayKey = `${now.getFullYear()}_${String(now.getMonth() + 1).padStart(2, '0')}_${String(now.getDate()).padStart(2, '0')}`;
  await updateDoc(doc(db, 'users', userId), { [`pfeilzaehler.${dayKey}`]: increment(count) });
  invalidateStatsCache(userId);
}

export type TechSessionSource = 'DELAY_MIRROR';

interface TechSessionInput {
  arrows: number;
  note: string;
  topics: string[];
  focusState: FocusState | null;
  source?: TechSessionSource;
}

/** Zapis treningu technicznego — wspólny dla startu treningu i Delay Mirror. */
export async function saveTechnicalSession(userId: string, { arrows, note, topics, focusState, source }: TechSessionInput): Promise<void> {
  // [ZESTAWY] Te strzały liczą się do zużycia cięciwy i strzał zestawu.
  const setupStamp = await getSetupStamp(userId);
  const focusSnap = sessionFocusSnapshot(focusState, topics);

  await addDoc(collection(db, `users/${userId}/sessions`), {
    ...setupStamp,
    ...(focusSnap ? { focus: focusSnap } : {}),
    ...(source ? { source } : {}),
    userId,
    distance: 'TECH',
    targetType: 'TECHNICAL',
    arrows,
    totalArrows: arrows,
    note,
    topics,
    createdAt: serverTimestamp(),
    type: 'TECHNICAL',
    timestamp: Timestamp.fromDate(new Date()),
    date: new Date().toLocaleDateString('pl-PL'),
  });
  // Denormalizacja jak w ScoringView — bez tego trener nie widział
  // treningu technicznego w „Nowe treningi" (user 2026-09-18).
  await updateDoc(doc(db, 'users', userId), {
    lastSessionTimestamp: Timestamp.now(),
    lastSessionType: 'TECHNICAL',
    lastSessionScore: 0,
    lastSessionArrows: arrows,
    lastSessionDistance: '',
  }).catch(e => console.error('Tech: błąd aktualizacji profilu', e));

  invalidateStatsCache(userId);
}
