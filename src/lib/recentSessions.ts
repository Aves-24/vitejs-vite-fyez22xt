import { db } from '../firebase';
import { collection, query, where, orderBy, getDocs, getDocsFromCache, Timestamp } from 'firebase/firestore';

// Współdzielone źródło sesji z ostatnich 12 tygodni.
// Zarówno ProStatsView, jak i QuickStatsModal potrzebują tego samego okna —
// bez tego modułu każdy z nich robił własny, niezależny odczyt z Firestore.
//
// Dwie warstwy oszczędności:
//  1. Dedup w pamięci — pierwszy czytelnik startuje fetch, drugi reużywa tej
//     samej Promise (zero dodatkowych odczytów przy przełączaniu zakładek).
//  2. getDocsFromCache przed serwerem — przy powtórnym wejściu dane idą z
//     lokalnego IndexedDB (niepłatne), serwer odpytujemy tylko gdy cache pusty.
//
// Inwalidacja: ScoringView woła invalidateRecentSessions(uid) po zapisie treningu.

const TWELVE_WEEKS_MS = 84 * 24 * 60 * 60 * 1000;

type AnySession = { id: string; [k: string]: any };

const memCache = new Map<string, Promise<AnySession[]>>();

export function invalidateRecentSessions(uid?: string): void {
  if (uid) memCache.delete(uid);
  else memCache.clear();
}

export function getRecentSessions(uid: string): Promise<AnySession[]> {
  const existing = memCache.get(uid);
  if (existing) return existing;

  const twelveWeeksAgo = new Date(Date.now() - TWELVE_WEEKS_MS);
  const q = query(
    collection(db, `users/${uid}/sessions`),
    where('timestamp', '>=', Timestamp.fromDate(twelveWeeksAgo)),
    orderBy('timestamp', 'asc')
  );

  const promise = (async () => {
    try {
      const cacheSnap = await getDocsFromCache(q);
      if (!cacheSnap.empty) {
        return cacheSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      }
    } catch { /* brak w cache — pobierz z serwera poniżej */ }
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  })();

  // Jeśli fetch padnie, usuń wpis, by kolejna próba mogła ponowić.
  promise.catch(() => memCache.delete(uid));

  memCache.set(uid, promise);
  return promise;
}
