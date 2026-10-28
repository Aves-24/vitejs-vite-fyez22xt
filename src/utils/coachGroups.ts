// [GRUPY] Grupa treningowa jako osobny dokument `groups/{groupId}` (etap 1
// z 2026-10-27). Wcześniej wszystko leżało w dokumencie trenera
// (users.coachGroups, studentGroupMap, coachGroupTopics) i w jego
// users/{uid}/private/groupTraining_<id>. Osobny dokument pozwoli w etapie 2
// dopuścić do grupy do 3 trenerów (coachIds) bez dzielenia całego profilu.
//
//   groups/{id}                  { ownerId, coachIds[], coachNames{uid: imię}, name, icon?,
//                                  schedule?, memberIds[], topics: { [day]: GroupTopic }, createdAt }
//   groups/{id}/private/training historia treningów (notatki trenera, luźne wpisy)
//   groupInvites/{gid}_{toId}    zaproszenie współtrenera (etap 2, max 3 trenerów)
//   consentAsked{coachId: sid[]} etap 3: komu ten trener wysłał już prośbę o zgodę
//
// ID grupy przy migracji zostaje stare („group_<ts>”), bo terminy tematu
// w kalendarzu trenera wskazują na nie przez trainingTopicGroupId.
import { db } from '../firebase';
import {
  arrayRemove, arrayUnion, collection, deleteDoc, deleteField, doc, getDoc, getDocs, onSnapshot, query, setDoc, updateDoc, where,
  type Unsubscribe,
} from 'firebase/firestore';
import type { GroupSchedule } from './groupSchedule';
import type { GroupTopic, GroupTopicsByDay } from '../components/GroupTopicPanel';
import { shiftedTopics, type TopicMove } from './topicShift';

export const MAX_GROUPS = 5;
export const MAX_GROUP_COACHES = 3;

export interface CoachGroup {
  id: string;
  ownerId: string;
  coachIds: string[];
  /** Imiona trenerów grupy — trenerzy nie czytają nawzajem swoich profili. */
  coachNames: Record<string, string>;
  name: string;
  icon?: string;
  schedule?: GroupSchedule;
  memberIds: string[];
  topics: GroupTopicsByDay;
  createdAt: number;
  /** [etap 3] Trener → uczniowie grupy, których już poprosił o zgodę (bez ponawiania po „Nein”). */
  consentAsked: Record<string, string[]>;
}

export const groupRef = (groupId: string) => doc(db, 'groups', groupId);
export const groupTrainingRef = (groupId: string) => doc(db, 'groups', groupId, 'private', 'training');

const coachGroupsQuery = (uid: string) => query(collection(db, 'groups'), where('coachIds', 'array-contains', uid));

function fromDoc(id: string, d: any): CoachGroup {
  return {
    id,
    ownerId: d.ownerId || '',
    coachIds: Array.isArray(d.coachIds) ? d.coachIds : [],
    coachNames: d.coachNames && typeof d.coachNames === 'object' ? d.coachNames : {},
    name: d.name || '',
    icon: d.icon,
    schedule: d.schedule,
    memberIds: Array.isArray(d.memberIds) ? d.memberIds : [],
    topics: d.topics && typeof d.topics === 'object' ? d.topics : {},
    createdAt: typeof d.createdAt === 'number' ? d.createdAt : 0,
    consentAsked: d.consentAsked && typeof d.consentAsked === 'object' ? d.consentAsked : {},
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

export async function createGroup(uid: string, name: string, icon: string, coachName: string): Promise<string> {
  const ref = doc(collection(db, 'groups'));
  await setDoc(ref, { ownerId: uid, coachIds: [uid], coachNames: { [uid]: coachName }, name, icon, memberIds: [], topics: {}, createdAt: Date.now() });
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

// ─── [GRUPY etap 2] Współtrenerzy ─────────────────────────────────

export interface GroupInvite {
  id: string;
  groupId: string;
  groupName: string;
  fromId: string;
  fromName: string;
  toId: string;
  toName: string;
  createdAt: number;
}

const inviteFrom = (id: string, d: any): GroupInvite => ({
  id, groupId: d.groupId, groupName: d.groupName || '', fromId: d.fromId, fromName: d.fromName || '',
  toId: d.toId, toName: d.toName || '', createdAt: d.createdAt || 0,
});

/** Zaproszenia do mnie ('toId') albo wysłane przeze mnie ('fromId') — na żywo. */
export function subscribeGroupInvites(uid: string, side: 'toId' | 'fromId', cb: (invites: GroupInvite[]) => void): Unsubscribe {
  return onSnapshot(
    query(collection(db, 'groupInvites'), where(side, '==', uid)),
    snap => cb(snap.docs.map(d => inviteFrom(d.id, d.data())).sort((a, b) => a.createdAt - b.createdAt)),
    err => { console.error('Zaproszenia do grup: błąd odczytu', err); cb([]); },
  );
}

/** Reguły sprawdzają: właściciel grupy, adresat jest trenerem, w grupie < 3 trenerów. */
export async function sendGroupInvite(group: CoachGroup, fromId: string, fromName: string, toId: string, toName: string): Promise<void> {
  await setDoc(doc(db, 'groupInvites', `${group.id}_${toId}`), {
    groupId: group.id, groupName: group.name.slice(0, 60), fromId, fromName: fromName.slice(0, 80),
    toId, toName: toName.slice(0, 80), createdAt: Date.now(),
  });
}

export const deleteGroupInvite = (inviteId: string) => deleteDoc(doc(db, 'groupInvites', inviteId));

/** Przyjęcie: dopisuję siebie do coachIds (reguła wymaga istniejącego zaproszenia), potem sprzątam zaproszenie. */
export async function acceptGroupInvite(invite: GroupInvite, uid: string, myName: string): Promise<void> {
  await updateDoc(groupRef(invite.groupId), { coachIds: arrayUnion(uid), [`coachNames.${uid}`]: myName.slice(0, 80) });
  await deleteGroupInvite(invite.id);
}

/** Właściciel usuwa współtrenera albo współtrener odchodzi sam (coachId = on). */
export const removeGroupCoach = (groupId: string, coachId: string) =>
  updateDoc(groupRef(groupId), { coachIds: arrayRemove(coachId), [`coachNames.${coachId}`]: deleteField() });

// ─── [GRUPY etap 3] Zgoda ucznia na współtrenera ──────────────────
//
// Każdy trener wspólnej grupy prosi o zgodę tych jej członków, których sam
// jeszcze nie prowadzi — zwykłym zaproszeniem trenera (coachInvites) z nazwą
// grupy. „Ja” = zwykła relacja trener↔uczeń (miejsce u tego trenera, dane,
// wiadomości), „Nein” = tylko imię w składzie. Raz zapytany uczeń trafia do
// consentAsked i nie dostaje prośby ponownie. Bez wolnego miejsca prośba
// czeka, aż się zwolni (user: „miejsce to miejsce”).

/** Członkowie wspólnych grup bez relacji ze mną i jeszcze niepytani: uczeń → jego grupy. */
export function membersToAsk(groups: CoachGroup[], uid: string, myStudents: Set<string>, pending: Set<string>): Map<string, CoachGroup[]> {
  const out = new Map<string, CoachGroup[]>();
  for (const g of groups) {
    if (g.coachIds.length < 2 || !g.coachIds.includes(uid)) continue;
    const asked = new Set(g.consentAsked[uid] || []);
    for (const sid of g.memberIds) {
      if (sid === uid || myStudents.has(sid) || pending.has(sid) || asked.has(sid)) continue;
      out.set(sid, [...(out.get(sid) || []), g]);
    }
  }
  return out;
}

/** Status ucznia grupy, którego nie prowadzę: prośba w toku, odmowa/odłączony albo brak miejsca. */
export type ConsentStatus = 'PENDING' | 'DECLINED' | 'NO_SLOT';
export function consentStatusOf(group: CoachGroup, uid: string, sid: string, pending: Set<string>): ConsentStatus {
  if (pending.has(sid)) return 'PENDING';
  return (group.consentAsked[uid] || []).includes(sid) ? 'DECLINED' : 'NO_SLOT';
}

/** Prośba o zgodę: zaproszenie trenera z nazwą grupy, potem znacznik w każdej z grup ucznia. */
export async function askGroupConsent(coachId: string, coachName: string, studentId: string, groups: CoachGroup[]): Promise<void> {
  await setDoc(doc(db, 'coachInvites', `${coachId}_${studentId}`), {
    coachId, studentId, createdAt: Date.now(),
    groupId: groups[0].id, groupName: groups[0].name.slice(0, 60), coachName: coachName.slice(0, 80),
  });
  await markConsentAsked(coachId, studentId, groups);
}

export const markConsentAsked = (coachId: string, studentId: string, groups: CoachGroup[]) =>
  Promise.all(groups.map(g => updateGroup(g.id, { [`consentAsked.${coachId}`]: arrayUnion(studentId) })));

/** Moje wysłane, nieprzyjęte zaproszenia uczniów (id uczniów) — na żywo. */
export function subscribePendingStudentInvites(uid: string, cb: (studentIds: Set<string>) => void): Unsubscribe {
  return onSnapshot(
    query(collection(db, 'coachInvites'), where('coachId', '==', uid)),
    snap => cb(new Set(snap.docs.map(d => d.data().studentId as string))),
    err => { console.error('Zaproszenia uczniów: błąd odczytu', err); cb(new Set()); },
  );
}

// ─── [PRZESUNIĘCIE TEMATÓW] zapis planu z utils/topicShift ─────────

/**
 * Zapis: wpisy tematu u uczniów i termin w kalendarzu trenera dostają nowy
 * dzień, potem cała mapa tematów grupy jednym zapisem. Błąd u jednego ucznia
 * nie zatrzymuje reszty (jak przy zwykłej edycji tematu).
 */
export async function applyTopicShift(groupId: string, coachId: string, topics: GroupTopicsByDay, moves: TopicMove[]): Promise<void> {
  if (!moves.length) return;
  await Promise.all(moves.map(async ({ from, to }) => {
    const gt: GroupTopic = topics[from];
    await Promise.all(Object.entries(gt.entryIds || {}).map(async ([sid, eid]) => {
      try { await updateDoc(doc(db, `users/${sid}/coachLog`, eid), { day: to, editedAt: Date.now() }); }
      catch (e) { console.error('Przesunięcie tematu: błąd u ucznia', sid, e); }
    }));
    if (gt.calendarEventId) {
      try { await updateDoc(doc(db, 'users', coachId, 'tournaments', gt.calendarEventId), { date: to }); }
      catch (e) { console.error('Przesunięcie tematu: błąd kalendarza', e); }
    }
  }));
  try { localStorage.removeItem(`grotX_tournaments_${coachId}`); } catch { /* ignore */ }
  await updateGroup(groupId, { topics: shiftedTopics(topics, moves) });
}
