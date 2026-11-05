import { collection, deleteDoc, doc, onSnapshot, query, setDoc, where, type Unsubscribe } from 'firebase/firestore';
import { db } from '../firebase';
import type { CoachGroup } from './coachGroups';
import type { GroupSchedule } from './groupSchedule';

// [PLAN DLA UCZNIA 2026-11-05] Uczeń nie czyta groups/ (tematy, notatki,
// zgody — tylko trenerzy), a trener nie pisze w dokumencie ucznia. Dlatego
// osobne lustro groupPlans/{groupId}: nazwa, symbol, plan treningów i skład.
// Czytają je członkowie i trenerzy grupy (reguły), pisze trener grupy.
// Lustro synchronizuje się samo z nasłuchu grup trenera — każda zmiana planu,
// odwołanie, przerwa, skład czy nazwa trafia tu bez względu na to, która
// funkcja ją zapisała.

export interface GroupPlan {
  groupId: string;
  name: string;
  icon?: string;
  schedule?: GroupSchedule;
}

export const groupPlanRef = (groupId: string) => doc(db, 'groupPlans', groupId);

function payloadOf(g: CoachGroup) {
  return {
    name: g.name,
    ...(g.icon ? { icon: g.icon } : {}),
    ...(g.schedule ? { schedule: g.schedule } : {}),
    memberIds: g.memberIds,
    coachIds: g.coachIds,
  };
}

// Ostatnio zapisane lustra w tej sesji — bez zapisu, gdy nic się nie zmieniło.
const synced = new Map<string, string>();

/** Wołane z nasłuchu grup trenera: dogania lustra planów. */
export function syncGroupPlans(groups: CoachGroup[]): void {
  for (const g of groups) {
    const payload = payloadOf(g);
    const key = JSON.stringify(payload);
    if (synced.get(g.id) === key) continue;
    synced.set(g.id, key);
    writePlan(g.id, payload, key, 0);
  }
}

// Nasłuch odpala się też z lokalnym, jeszcze niezatwierdzonym stanem grupy —
// reguła porównuje skład z ZAPISANĄ grupą i może chwilowo odrzucić lustro.
// Wtedy ponawiamy po chwili (to samo lustro, o ile w międzyczasie nie przyszło nowsze).
function writePlan(groupId: string, payload: object, key: string, attempt: number): void {
  setDoc(groupPlanRef(groupId), payload).catch(e => {
    if (synced.get(groupId) !== key) return; // nowsze lustro już w drodze
    if (attempt < 3) { setTimeout(() => writePlan(groupId, payload, key, attempt + 1), 1500 * (attempt + 1)); return; }
    synced.delete(groupId);
    console.error('Plan grupy: zapis lustra nieudany', e);
  });
}

/** Przy usuwaniu grupy — PRZED skasowaniem groups/{id} (reguła sprawdza trenera w grupie). */
export async function deleteGroupPlan(groupId: string): Promise<void> {
  synced.delete(groupId);
  await deleteDoc(groupPlanRef(groupId)).catch(() => { /* lustra mogło nie być */ });
}

/** Uczeń: plany grup, w których jest — na żywo. */
export function subscribeMyGroupPlans(uid: string, cb: (plans: GroupPlan[]) => void): Unsubscribe {
  return onSnapshot(
    query(collection(db, 'groupPlans'), where('memberIds', 'array-contains', uid)),
    snap => cb(snap.docs.map(d => {
      const x = d.data();
      return { groupId: d.id, name: x.name || '', icon: x.icon, schedule: x.schedule };
    })),
    err => { console.error('Plan grupy: błąd odczytu', err); cb([]); },
  );
}
