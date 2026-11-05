import {
  arrayRemove, arrayUnion, collection, deleteDoc, doc, onSnapshot, query, serverTimestamp, setDoc, updateDoc, where, writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from '../firebase';

// [PRZEKAZANIE UCZNIA 2026-11-05] Trener przekazuje ucznia innemu trenerowi
// (np. z grupy podstawowej do średniozaawansowanej). Kolejność:
//   1. stary trener: wniosek + opcjonalna notatka dla następcy (pending_coach),
//   2. nowy trener: przyjmuje (pending_student) — zakłada zwykłe zaproszenie
//      coachInvites/{nowy}_{uczeń} z polem transferId,
//   3. uczeń: świadoma zgoda w osobnym oknie → nowy trener dochodzi, stary
//      traci dostęp (decyzja usera), dokument zostaje jako dowód zgody (done).
// Zapisy relacji idą istniejącymi, przetestowanymi ścieżkami reguł (C/E/D/F).
// LUSTRO: firestore.rules → /coachTransfers.

export type TransferStatus = 'pending_coach' | 'pending_student' | 'done';

export interface CoachTransfer {
  id: string;
  fromCoachId: string;
  fromName: string;
  toCoachId: string;
  toName: string;
  studentId: string;
  studentName: string;
  note?: string;
  status: TransferStatus;
  createdAt: number;
}

/** Wersja tekstu zgody — zapisywana przy zgodzie ucznia (rozliczalność, art. 7 ust. 1 RODO). */
export const TRANSFER_CONSENT_VERSION = '2026-11-05';
export const TRANSFER_NOTE_MAX = 500;

const col = () => collection(db, 'coachTransfers');
const fromDoc = (id: string, d: any): CoachTransfer => ({
  id,
  fromCoachId: d.fromCoachId, fromName: d.fromName || '',
  toCoachId: d.toCoachId, toName: d.toName || '',
  studentId: d.studentId, studentName: d.studentName || '',
  ...(d.note ? { note: d.note } : {}),
  status: d.status, createdAt: d.createdAt || 0,
});

function subscribe(field: 'fromCoachId' | 'toCoachId' | 'studentId', uid: string, cb: (list: CoachTransfer[]) => void): Unsubscribe {
  return onSnapshot(
    query(col(), where(field, '==', uid)),
    snap => cb(snap.docs.map(d => fromDoc(d.id, d.data())).sort((a, b) => b.createdAt - a.createdAt)),
    err => { console.error('Przekazanie: błąd odczytu', err); cb([]); },
  );
}
export const subscribeOutgoingTransfers = (uid: string, cb: (l: CoachTransfer[]) => void) => subscribe('fromCoachId', uid, cb);
export const subscribeIncomingTransfers = (uid: string, cb: (l: CoachTransfer[]) => void) => subscribe('toCoachId', uid, cb);
export const subscribeStudentTransfers = (uid: string, cb: (l: CoachTransfer[]) => void) => subscribe('studentId', uid, cb);

/** 1. Stary trener zakłada wniosek. */
export async function startTransfer(t: Omit<CoachTransfer, 'id' | 'status' | 'createdAt'>): Promise<void> {
  const ref = doc(col());
  const note = (t.note || '').trim().slice(0, TRANSFER_NOTE_MAX);
  await setDoc(ref, {
    fromCoachId: t.fromCoachId, fromName: t.fromName.slice(0, 80),
    toCoachId: t.toCoachId, toName: t.toName.slice(0, 80),
    studentId: t.studentId, studentName: t.studentName.slice(0, 80),
    ...(note ? { note } : {}),
    status: 'pending_coach', createdAt: Date.now(),
  });
}

/** 2. Nowy trener przyjmuje: zaproszenie do ucznia (z transferId) + status dla ucznia. */
export async function acceptTransferAsCoach(t: CoachTransfer): Promise<void> {
  await setDoc(doc(db, 'coachInvites', `${t.toCoachId}_${t.studentId}`), {
    coachId: t.toCoachId, studentId: t.studentId, transferId: t.id, createdAt: serverTimestamp(),
  });
  await updateDoc(doc(col(), t.id), { status: 'pending_student', acceptedByCoachAt: serverTimestamp() });
}

/** Odrzucenie / wycofanie (stary trener, nowy trener albo uczeń) — przed zgodą ucznia. */
export async function cancelTransfer(t: CoachTransfer): Promise<void> {
  await deleteDoc(doc(db, 'coachInvites', `${t.toCoachId}_${t.studentId}`)).catch(() => { /* mogło nie być */ });
  await deleteDoc(doc(col(), t.id));
}

/** 3. Zgoda ucznia: nowy trener dochodzi, stary traci dostęp, dowód zgody zostaje. */
export async function acceptTransferAsStudent(t: CoachTransfer): Promise<void> {
  // a) nowy trener — ścieżki C (własne coaches[]) i E (students[] trenera), atomowo
  const add = writeBatch(db);
  add.update(doc(db, 'users', t.toCoachId), { students: arrayUnion(t.studentId) });
  add.update(doc(db, 'users', t.studentId), { coaches: arrayUnion(t.toCoachId) });
  await add.commit();
  // b) stary trener traci dostęp — ścieżki D i F (odłączenie, jak w Ustawieniach)
  const remove = writeBatch(db);
  remove.update(doc(db, 'users', t.studentId), { coaches: arrayRemove(t.fromCoachId) });
  remove.update(doc(db, 'users', t.fromCoachId), { students: arrayRemove(t.studentId) });
  await remove.commit();
  // c) dowód zgody + sprzątanie zaproszenia
  await updateDoc(doc(col(), t.id), { status: 'done', doneAt: serverTimestamp(), consentVersion: TRANSFER_CONSENT_VERSION });
  await deleteDoc(doc(db, 'coachInvites', `${t.toCoachId}_${t.studentId}`)).catch(() => { /* już nie ma */ });
}
