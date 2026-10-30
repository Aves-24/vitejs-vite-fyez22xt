import { collection, deleteDoc, doc, FieldPath, getDoc, getDocs, query, setDoc, updateDoc, where } from 'firebase/firestore';
import { db } from '../firebase';
import { EquipmentSetup } from '../config/equipmentSetups';
import { guestExpiryFields } from './guestMode';
import { doneKey, dueReminders, localDateStr } from './maintenanceSchedule';

/**
 * [WARTUNG] Przypomnienia o konserwacji → todo w kalendarzu.
 *
 * Plan Spark = brak Cloud Functions, więc liczy to aplikacja przy starcie
 * (App.tsx, po wczytaniu users/{uid}). Przypomnienie to zwykłe todo „Inne”
 * (`todo: true`, data pusta) z polem `maintenance` — Home i kalendarz pokazują
 * je bez żadnych zmian, a „erledigt” działa jak przy każdym todo.
 *
 * Zasady:
 *  - wpis pojawia się 21 dni przed terminem i wisi, dopóki nie jest zrobiony,
 *  - na czynność wisi najwyżej jeden wpis (stałe id = zestaw + czynność + termin),
 *  - wpis, którego reguła zniknęła (wyłączona, zmieniona data/rytm, usunięty
 *    zestaw), jest kasowany — inaczej po zmianie rytmu wisiałyby dwa naraz.
 */

export interface MaintenanceRef {
  setupId: string;
  taskId: string;
  due: string;
}

const SYNC_KEY = (uid: string) => `grotX_mntSync_${uid}`;

/**
 * Synchronizuje przypomnienia. Tanie przy częstym wołaniu: liczy się „podpis”
 * (reguły + wykonania + dzisiejsza data) i bez zmian nie czyta nic z bazy.
 */
export async function syncMaintenanceReminders(
  userId: string,
  setups: EquipmentSetup[] | undefined,
  done: Record<string, string> | undefined,
  titleFor: (taskId: string) => string,
): Promise<void> {
  const today = localDateStr(new Date());
  const signature = JSON.stringify([
    today,
    (setups || []).map(s => [s.id, s.name, s.discipline, s.maintenance ?? null]),
    done ?? null,
  ]);
  try {
    if (localStorage.getItem(SYNC_KEY(userId)) === signature) return;
  } catch { /* brak localStorage — po prostu liczymy */ }

  const wanted = dueReminders(setups || [], done, today);
  const wantedIds = new Set(wanted.map(r => r.docId));

  const col = collection(db, 'users', userId, 'tournaments');
  const open = await getDocs(query(col, where('todo', '==', true)));
  const openMaintenance = open.docs.filter(d => d.data().maintenance);
  const openIds = new Set(openMaintenance.map(d => d.id));

  let changed = false;

  for (const d of openMaintenance) {
    if (!wantedIds.has(d.id)) {
      await deleteDoc(d.ref);
      changed = true;
    }
  }

  for (const r of wanted) {
    if (openIds.has(r.docId)) continue;
    const ref = doc(col, r.docId);
    // Już zrobiony (np. zapis daty wykonania nie doszedł) — nie wskrzeszamy.
    if ((await getDoc(ref)).exists()) continue;
    const maintenance: MaintenanceRef = { setupId: r.setupId, taskId: r.taskId, due: r.due };
    await setDoc(ref, {
      category: 'Inne',
      title: titleFor(r.taskId),
      date: '',
      todo: true,
      time: '',
      address: '',
      // Nazwa zestawu — kto ma dwa łuki, wie, który woskować.
      note: (setups || []).length > 1 ? r.setupName : '',
      type: 'maintenance',
      maintenance,
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
