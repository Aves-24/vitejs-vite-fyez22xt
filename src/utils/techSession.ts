import { collection, doc, increment, serverTimestamp, Timestamp, updateDoc, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import { getSetupStamp } from './setupStamp';
import { sessionFocusSnapshot, FocusState } from './focus';

function invalidateStatsCache(userId: string) {
  localStorage.removeItem(`grotX_stats_v13_${userId}`);
  localStorage.removeItem(`grotX_lastSession_${userId}`);
  window.dispatchEvent(new CustomEvent('grotx-stats-updated'));
}

function dayCounterField(): string {
  const now = new Date();
  return `pfeilzaehler.${now.getFullYear()}_${String(now.getMonth() + 1).padStart(2, '0')}_${String(now.getDate()).padStart(2, '0')}`;
}

/**
 * Strzaly bez sesji — licznik dnia na profilu (Pfeilzaehler), liczony na
 * stronie glownej. Zapis trafia od razu do trwalego bufora Firestore, wiec
 * bez zasiegu zostaje w telefonie; promise konczy sie dopiero po wyslaniu.
 */
export async function addToDailyArrowCounter(userId: string, count: number): Promise<void> {
  const write = updateDoc(doc(db, 'users', userId), { [dayCounterField()]: increment(count) });
  invalidateStatsCache(userId);
  await write;
}

export type TechSessionSource = 'DELAY_MIRROR';

interface TechSessionInput {
  arrows: number;
  note: string;
  topics: string[];
  focusState: FocusState | null;
  source?: TechSessionSource;
  /** Strzaly juz zapisane w liczniku dnia — przechodza do sesji, zeby nie liczyc ich dwa razy. */
  fromDailyCounter?: number;
}

/** Zapis treningu technicznego — wspólny dla startu treningu i Delay Mirror. */
export async function saveTechnicalSession(userId: string, { arrows, note, topics, focusState, source, fromDailyCounter = 0 }: TechSessionInput): Promise<void> {
  // [ZESTAWY] Te strzały liczą się do zużycia cięciwy i strzał zestawu.
  const setupStamp = await getSetupStamp(userId);
  const focusSnap = sessionFocusSnapshot(focusState, topics);

  // Jeden batch: sesja i zdjecie tych samych strzal z licznika dnia wchodza
  // razem albo wcale — inaczej strona glowna pokazalaby je podwojnie.
  const batch = writeBatch(db);
  batch.set(doc(collection(db, `users/${userId}/sessions`)), {
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
  if (fromDailyCounter > 0) {
    batch.update(doc(db, 'users', userId), { [dayCounterField()]: increment(-fromDailyCounter) });
  }
  await batch.commit();
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
