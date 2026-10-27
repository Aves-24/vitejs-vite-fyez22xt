// [GRUPY] Grupa treningowa jako osobny dokument `groups/{groupId}` (etap 1
// z 2026-10-27). Wcześniej wszystko leżało w dokumencie trenera
// (users.coachGroups, studentGroupMap, coachGroupTopics) i w jego
// users/{uid}/private/groupTraining_<id>. Osobny dokument pozwoli w etapie 2
// dopuścić do grupy do 3 trenerów (coachIds) bez dzielenia całego profilu.
//
//   groups/{id}                  { ownerId, coachIds[], name, icon?, schedule?,
//                                  memberIds[], topics: { [day]: GroupTopic }, createdAt }
//   groups/{id}/private/training historia treningów (notatki trenera, luźne wpisy)
//
// ID grupy przy migracji zostaje stare („group_<ts>”), bo terminy tematu
// w kalendarzu trenera wskazują na nie przez trainingTopicGroupId.
import { db } from '../firebase';
import {
  collection, deleteDoc, doc, getDoc, getDocs, onSnapshot, query, setDoc, updateDoc, where,
  type Unsubscribe,
} from 'firebase/firestore';
import type { GroupSchedule } from './groupSchedule';
import type { GroupTopic, GroupTopicsByDay } from '../components/GroupTopicPanel';

export const MAX_GROUPS = 5;
export const MAX_GROUP_COACHES = 3;

export interface CoachGroup {
  id: string;
  ownerId: string;
  coachIds: string[];
  name: string;
  icon?: string;
  schedule?: GroupSchedule;
  memberIds: string[];
  topics: GroupTopicsByDay;
  createdAt: number;
}

export const groupRef = (groupId: string) => doc(db, 'groups', groupId);
export const groupTrainingRef = (groupId: string) => doc(db, 'groups', groupId, 'private', 'training');

const coachGroupsQuery = (uid: string) => query(collection(db, 'groups'), where('coachIds', 'array-contains', uid));

function fromDoc(id: string, d: any): CoachGroup {
  return {
    id,
    ownerId: d.ownerId || '',
    coachIds: Array.isArray(d.coachIds) ? d.coachIds : [],
    name: d.name || '',
    icon: d.icon,
    schedule: d.schedule,
    memberIds: Array.isArray(d.memberIds) ? d.memberIds : [],
    topics: d.topics && typeof d.topics === 'object' ? d.topics : {},
    createdAt: typeof d.createdAt === 'number' ? d.createdAt : 0,
  };
}

// Kolejność jak dawniej w tablicy coachGroups: od najstarszej.
const byCreated = (a: CoachGroup, b: CoachGroup) => a.createdAt - b.createdAt || a.name.localeCompare(b.name);

/** Grupy, w których użytkownik jest trenerem — na żywo. */
export function subscribeCoachGroups(uid: string, cb: (groups: CoachGroup[]) => void): Unsubscribe {
  return onSnapshot(
    coachGroupsQuery(uid),
    snap => cb(snap.docs.map(d => fromDoc(d.id, d.data())).sort(byCreated)),
    err => { console.error('Grupy: błąd odczytu', err); cb([]); },
  );
}

/** Jednorazowy odczyt (strona główna, kalendarz, dziennik). */
export async function fetchCoachGroups(uid: string): Promise<CoachGroup[]> {
  try {
    const snap = await getDocs(coachGroupsQuery(uid));
    return snap.docs.map(d => fromDoc(d.id, d.data())).sort(byCreated);
  } catch (e) {
    console.error('Grupy: błąd odczytu', e);
    return [];
  }
}

/** Uczeń → jego grupy (dawne users.studentGroupMap), liczone ze składów grup. */
export function studentGroupMapOf(groups: CoachGroup[]): Record<string, string[]> {
  const map: Record<string, string[]> = {};
  for (const g of groups) for (const sid of g.memberIds) (map[sid] ||= []).push(g.id);
  return map;
}

export async function createGroup(uid: string, name: string, icon: string): Promise<string> {
  const ref = doc(collection(db, 'groups'));
  await setDoc(ref, { ownerId: uid, coachIds: [uid], name, icon, memberIds: [], topics: {}, createdAt: Date.now() });
  return ref.id;
}

export const updateGroup = (groupId: string, patch: Record<string, unknown>) => updateDoc(groupRef(groupId), patch);

/** Usunięcie grupy: najpierw historia (reguła sprawdza trenera w dokumencie grupy), potem grupa. */
export async function deleteGroup(groupId: string): Promise<void> {
  await deleteDoc(groupTrainingRef(groupId));
  await deleteDoc(groupRef(groupId));
}

/**
 * Jednorazowe przeniesienie grup z dokumentu trenera do `groups/`. Stare pola
 * zostają w users/{uid} jako kopia zapasowa (sprzątanie później); flaga
 * `groupsMigrated` mówi, że nowe miejsce jest jedynym źródłem.
 */
export async function migrateLegacyGroups(uid: string, data: any): Promise<void> {
  if (data?.groupsMigrated) return;
  const legacy: any[] = Array.isArray(data?.coachGroups) ? data.coachGroups : [];
  const students = new Set<string>(Array.isArray(data?.students) ? data.students : []);
  const groupMap: Record<string, string[]> = data?.studentGroupMap || {};
  const notes: Record<string, any[]> = data?.groupNotes || {};

  // Tematy po dniach + pierwsza wersja (jeden temat na grupę, coachGroupTopic).
  const topics: Record<string, GroupTopicsByDay> = { ...(data?.coachGroupTopics || {}) };
  Object.entries((data?.coachGroupTopic || {}) as Record<string, GroupTopic>).forEach(([gid, gt]) => {
    if (gt?.day && !topics[gid]?.[gt.day]) topics[gid] = { ...(topics[gid] || {}), [gt.day]: gt };
  });

  const base = Date.now();
  for (const [i, g] of legacy.entries()) {
    if (!g?.id) continue;
    const memberIds = Object.entries(groupMap)
      .filter(([sid, gids]) => students.has(sid) && Array.isArray(gids) && gids.includes(g.id))
      .map(([sid]) => sid);
    const group: Record<string, unknown> = {
      ownerId: uid, coachIds: [uid], name: g.name || '', icon: g.icon || null,
      memberIds, topics: topics[g.id] || {}, createdAt: base + i,
    };
    if (g.schedule) group.schedule = g.schedule;
    // merge: powtórka po przerwanej migracji nadpisze tylko te pola.
    await setDoc(groupRef(g.id), group, { merge: true });

    // Historia treningów + stary dziennik grupy (groupNotes) jako luźne wpisy.
    const old = await getDoc(doc(db, 'users', uid, 'private', `groupTraining_${g.id}`)).catch(() => null);
    const history: any = old?.exists() ? { ...old.data() } : {};
    const legacyNotes = Array.isArray(notes[g.id]) ? notes[g.id] : [];
    if (legacyNotes.length) {
      const known = new Set((history.loose || []).map((n: any) => n.id));
      history.loose = [...(history.loose || []), ...legacyNotes.filter(n => !known.has(n.id))];
    }
    if (Object.keys(history).length) await setDoc(groupTrainingRef(g.id), history, { merge: true });
  }
  await updateDoc(doc(db, 'users', uid), { groupsMigrated: true });
}
