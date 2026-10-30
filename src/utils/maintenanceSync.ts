import { collection, deleteDoc, doc, FieldPath, getDocs, query, setDoc, updateDoc, where } from 'firebase/firestore';
import { db } from '../firebase';
import { EquipmentSetup } from '../config/equipmentSetups';
import { guestExpiryFields } from './guestMode';
import {
  doneKey, dueReminders, GroupItem, groupDue, localDateStr, mergeGroupItems, openItems, sameItems,
} from './maintenanceSchedule';

/**
 * [WARTUNG] Przypomnienia o konserwacji → todo w kalendarzu.
 *
 * Plan Spark = brak Cloud Functions, więc liczy to aplikacja przy starcie
 * (App.tsx, po wczytaniu users/{uid}). Przypomnienie to zwykłe todo „Inne”
 * (`todo: true`, data pusta) — Home i kalendarz pokazują je bez zmian.
 *
 * JEDEN wpis na zestaw (decyzja usera 2026-10-30), a w nim lista czynności
 * (`maintenanceGroup.items`), każda odhaczana osobno w kalendarzu:
 *  - czynność pojawia się 21 dni przed swoim terminem i dochodzi do otwartego
 *    wpisu zestawu, zamiast zakładać drugi,
 *  - wyłączona/przesunięta czynność znika z wpisu, odhaczona zostaje z ptaszkiem,
 *  - gdy nic nie zostało do zrobienia, wpis idzie do archiwum (albo znika,
 *    jeśli nic w nim nie odhaczono).
 */

export interface MaintenanceRef {
  setupId: string;
  taskId: string;
}

export interface MaintenanceGroup {
  setupId: string;
  /** Najwcześniejszy termin wśród nieodhaczonych. */
  due: string;
  items: GroupItem[];
}

const SYNC_KEY = (uid: string) => `grotX_mntSync_${uid}`;

// Snapshot users/{uid} potrafi strzelić kilka razy pod rząd — dwie równoległe
// synchronizacje założyłyby dwa wpisy dla jednego zestawu. Kolejka per moduł.
let queue: Promise<void> = Promise.resolve();

/**
 * Synchronizuje przypomnienia. Tanie przy częstym wołaniu: liczy się „podpis”
 * (reguły + wykonania + dzisiejsza data) i bez zmian nie czyta nic z bazy.
 */
export function syncMaintenanceReminders(
  userId: string,
  setups: EquipmentSetup[] | undefined,
  done: Record<string, string> | undefined,
  /** Tytuł wpisu z listy nieodhaczonych czynności. */
  titleFor: (openTaskIds: string[]) => string,
): Promise<void> {
  const run = queue.then(() => doSync(userId, setups || [], done, titleFor));
  queue = run.catch(() => {});
  return run;
}

async function doSync(
  userId: string,
  setups: EquipmentSetup[],
  done: Record<string, string> | undefined,
  titleFor: (openTaskIds: string[]) => string,
): Promise<void> {
  const today = localDateStr(new Date());
  const signature = JSON.stringify([
    today,
    setups.map(s => [s.id, s.name, s.discipline, s.maintenance ?? null]),
    done ?? null,
  ]);
  try {
    if (localStorage.getItem(SYNC_KEY(userId)) === signature) return;
  } catch { /* brak localStorage — po prostu liczymy */ }

  const wanted = dueReminders(setups, done, today);
  const col = collection(db, 'users', userId, 'tournaments');
  const open = await getDocs(query(col, where('todo', '==', true)));
  let changed = false;

  // Pojedyncze wpisy z pierwszej wersji (241cc8c, kilka godzin na prod) — zastępuje je wpis zbiorczy.
  for (const d of open.docs.filter(d => d.data().maintenance)) {
    await deleteDoc(d.ref);
    changed = true;
  }

  const groups = open.docs.filter(d => d.data().maintenanceGroup);
  const setupIds = new Set([
    ...wanted.map(r => r.setupId),
    ...groups.map(d => (d.data().maintenanceGroup as MaintenanceGroup).setupId),
  ]);

  for (const setupId of setupIds) {
    const mine = groups.filter(d => (d.data().maintenanceGroup as MaintenanceGroup).setupId === setupId);
    const [primary, ...extra] = mine;
    for (const d of extra) { await deleteDoc(d.ref); changed = true; }

    const prev: GroupItem[] = primary ? (primary.data().maintenanceGroup as MaintenanceGroup).items ?? [] : [];
    const items = mergeGroupItems(prev, wanted.filter(r => r.setupId === setupId));
    const todo = openItems(items);

    if (todo.length === 0) {
      if (primary) {
        const doneDates = items.map(i => i.done).filter(Boolean).sort() as string[];
        if (doneDates.length > 0) {
          await updateDoc(primary.ref, {
            todo: false, wasATodo: true, date: doneDates[doneDates.length - 1],
            title: titleFor(items.map(i => i.taskId)),
            'maintenanceGroup.items': items,
          });
        } else {
          await deleteDoc(primary.ref);
        }
        changed = true;
      }
      continue;
    }

    const title = titleFor(todo.map(i => i.taskId));
    const group: MaintenanceGroup = { setupId, due: groupDue(items)!, items };
    if (primary) {
      if (!sameItems(prev, items) || primary.data().title !== title) {
        await updateDoc(primary.ref, { title, maintenanceGroup: group });
        changed = true;
      }
      continue;
    }

    const setup = setups.find(s => s.id === setupId);
    await setDoc(doc(col, `mnt_${setupId}_${Date.now()}`), {
      category: 'Inne',
      title,
      date: '',
      todo: true,
      time: '',
      address: '',
      // Nazwa zestawu — kto ma dwa łuki, wie, którego dotyczy lista.
      note: setups.length > 1 && setup ? setup.name : '',
      type: 'maintenance',
      maintenanceGroup: group,
      ...guestExpiryFields(),
    });
    changed = true;
  }

  if (changed) {
    try { localStorage.removeItem(`grotX_todos_${userId}`); } catch { /* ignore */ }
    window.dispatchEvent(new Event('grotx-todos-changed'));
  }
  try { localStorage.setItem(SYNC_KEY(userId), signature); } catch { /* ignore */ }
}

/**
 * Zapisuje wykonanie (albo pominięcie) czynności. Osobne pole na users/{uid},
 * pisane ścieżką — Ustawienia nadpisują `setups` w całości i zjadłyby datę
 * wpisaną w zestawie.
 */
export async function markMaintenanceDone(userId: string, ref: MaintenanceRef, date: string): Promise<void> {
  await updateDoc(
    doc(db, 'users', userId),
    new FieldPath('maintenanceDone', doneKey(ref.setupId, ref.taskId)),
    date,
  );
}

/**
 * Odhacza czynności we wpisie zbiorczym. Kolejność ma znaczenie: NAJPIERW
 * wpis, POTEM daty wykonania — zapis daty budzi synchronizację, a ta musi
 * już widzieć ptaszek, inaczej uzna czynność za nieaktualną i ją wyrzuci.
 * Gdy nic nie zostaje do zrobienia, wpis idzie do archiwum.
 */
export async function completeGroupItems(
  userId: string,
  eventId: string,
  group: MaintenanceGroup,
  taskIds: string[],
  date: string,
  /** Tytuł w archiwum — z liczbą WSZYSTKICH czynności wpisu, a nie ostatnio otwartych. */
  titleFor: (taskIds: string[]) => string,
): Promise<void> {
  const items = group.items.map(i => (taskIds.includes(i.taskId) && !i.done ? { ...i, done: date } : i));
  const rest = openItems(items);
  const ref = doc(db, 'users', userId, 'tournaments', eventId);
  await updateDoc(ref, rest.length === 0
    ? { todo: false, wasATodo: true, date, title: titleFor(items.map(i => i.taskId)), 'maintenanceGroup.items': items }
    : { 'maintenanceGroup.items': items, 'maintenanceGroup.due': groupDue(items) });
  for (const taskId of taskIds) {
    await markMaintenanceDone(userId, { setupId: group.setupId, taskId }, date);
  }
  try {
    localStorage.removeItem(`grotX_todos_${userId}`);
    localStorage.removeItem(`grotX_tournaments_${userId}`);
  } catch { /* ignore */ }
}
