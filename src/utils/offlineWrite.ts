import { doc, DocumentReference, getDoc, getDocFromCache, DocumentSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

/**
 * [C41] Zapisy bez zasiegu na strzelnicy.
 *
 * Firestore ma trwaly bufor (`persistentLocalCache` w firebase.ts): zapis
 * trafia do telefonu od razu i wysyla sie sam, gdy wroci siec — takze po
 * zamknieciu aplikacji. ALE promise z `addDoc/updateDoc/batch.commit()`
 * konczy sie dopiero po odpowiedzi serwera, wiec `await` bez sieci wisi
 * w nieskonczonosc, a przycisk „Zapisz" kreci sie bez konca.
 *
 * `settleWrite` czeka na serwer najwyzej chwile:
 * - serwer odpowiedzial → 'sent' (odrzucenie przez reguly rzuca jak dotad,
 *   wiec istniejace komunikaty bledow dzialaja bez zmian),
 * - brak odpowiedzi → 'queued': zapis czeka w telefonie, UI idzie dalej,
 *   a pasek OfflineBanner pokazuje, ile zapisow czeka.
 */

const WAIT_MS = 4000;

export const PENDING_WRITES_EVENT = 'grotx-pending-writes';
export const WRITE_FAILED_EVENT = 'grotx-write-failed';

let pending = 0;
export const pendingWriteCount = () => pending;

function setPending(delta: number) {
  pending = Math.max(0, pending + delta);
  window.dispatchEvent(new Event(PENDING_WRITES_EVENT));
}

export async function settleWrite(write: Promise<unknown>): Promise<'sent' | 'queued'> {
  // Bez sieci nie ma na co czekac — odrzucenie i tak przyjdzie dopiero po powrocie zasiegu.
  const wait = navigator.onLine ? WAIT_MS : 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<'queued'>(resolve => { timer = setTimeout(() => resolve('queued'), wait); });
  const result = await Promise.race([write.then(() => 'sent' as const), timeout])
    .finally(() => clearTimeout(timer));

  if (result === 'queued') {
    setPending(+1);
    write
      .catch(e => {
        // Serwer odrzucil zapis po czasie — Firestore cofnal go juz lokalnie.
        console.error('[C41] Zapis odrzucony po powrocie sieci:', e);
        window.dispatchEvent(new Event(WRITE_FAILED_EVENT));
      })
      .finally(() => setPending(-1));
  }
  return result;
}

/**
 * Odczyt najpierw z telefonu. App.tsx trzyma nasluch `onSnapshot` na profilu
 * uzytkownika, wiec cache jest swiezy; `getDoc` przy slabym zasiegu potrafi
 * czekac kilka sekund, zanim sam spadnie na cache.
 */
export async function getDocCacheFirst(ref: DocumentReference): Promise<DocumentSnapshot> {
  try {
    return await getDocFromCache(ref);
  } catch {
    return getDoc(ref);
  }
}

export const userDocCacheFirst = (userId: string) => getDocCacheFirst(doc(db, 'users', userId));
