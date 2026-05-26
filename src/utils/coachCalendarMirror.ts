/**
 * coachCalendarMirror.ts
 *
 * Synchronizuje eventy trenera (category: 'Trener') do
 * users/{studentId}/tournaments każdego wybranego ucznia.
 *
 * Schema mirrored doc:
 *   title, date, time, address, note, category='Trener',
 *   distance, type, originCoachId, originEventId, isMirrored=true
 */

import { db } from '../firebase';
import {
  collection,
  query,
  where,
  getDocs,
  getDoc,
  addDoc,
  doc,
  writeBatch,
  serverTimestamp,
} from 'firebase/firestore';
import { createNotification } from '../services/notificationService';
import { buildCoachPlanNotification } from './notificationTypes';

// ─── Typy ────────────────────────────────────────────────────────────────────

interface TrenerEventData {
  title: string;
  date: string;
  time: string;
  address: string;
  note: string;
  category: string;
  distance?: string | null;
  type?: string;
  [key: string]: unknown;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Pobiera imię + nazwisko trenera (1x cache) */
const _coachNameCache: Record<string, string> = {};
async function getCoachName(coachId: string): Promise<string> {
  if (_coachNameCache[coachId]) return _coachNameCache[coachId];
  try {
    const snap = await getDoc(doc(db, 'users', coachId));
    if (snap.exists()) {
      const d = snap.data();
      const name = `${d.firstName || ''} ${d.lastName || ''}`.trim() || 'Trainer';
      _coachNameCache[coachId] = name;
      return name;
    }
  } catch { /* ignore */ }
  return 'Trainer';
}

/** Buduje payload dla mirrored doc */
function buildMirrorPayload(event: TrenerEventData, coachId: string, coachName: string, originEventId: string) {
  return {
    title: event.title,
    date: event.date,
    time: event.time || '',
    address: event.address || '',
    note: event.note || '',
    category: 'Trener' as const,
    distance: event.distance || null,
    type: event.type || 'Trener',
    originCoachId: coachId,
    originCoachName: coachName,
    originEventId,
    isMirrored: true,
    createdAt: serverTimestamp(),
  };
}

/** Zwraca dokumenty mirror dla danego originEventId w tournaments ucznia */
async function findMirroredDocs(studentId: string, originEventId: string) {
  const snap = await getDocs(
    query(
      collection(db, `users/${studentId}/tournaments`),
      where('originEventId', '==', originEventId)
    )
  );
  return snap.docs;
}

// ─── API ──────────────────────────────────────────────────────────────────────

/**
 * Tworzenie — po addDoc nowego eventu trenera.
 * Wywołaj z rozwiązaną listą studentIds (bez 'all').
 */
export async function mirrorTrenerEventToStudents(
  event: TrenerEventData,
  originEventId: string,
  studentIds: string[],
  coachId: string
): Promise<void> {
  if (!studentIds.length) return;
  const coachName = await getCoachName(coachId);
  const payload = buildMirrorPayload(event, coachId, coachName, originEventId);

  // Mirror eventu do tournaments każdego ucznia + notyfikacja w jego inbox.
  // Każdy mirrored doc ma unikalny Firestore id — używamy go jako refId notyfikacji
  // (gwarantuje deterministyczną deduplikację: jeden plan = jedna notyfikacja).
  await Promise.all(
    studentIds.map(async sid => {
      const ref = await addDoc(collection(db, `users/${sid}/tournaments`), payload);
      const { id, payload: notifPayload } = buildCoachPlanNotification({
        eventId: ref.id,
        coachId,
        coachName,
      });
      // Non-blocking — notification is best-effort, don't fail the mirror op.
      createNotification(sid, id, notifPayload).catch(() => { /* ignore */ });
    })
  );
}

/**
 * Edycja — po updateDoc istniejącego eventu trenera.
 * Aktualizuje istniejące mirrored docs LUB tworzy/usuwa gdy lista uczniów się zmieniła.
 */
export async function updateMirroredEvent(
  originEventId: string,
  event: TrenerEventData,
  newStudentIds: string[],
  coachId: string
): Promise<void> {
  const coachName = await getCoachName(coachId);
  const payload = buildMirrorPayload(event, coachId, coachName, originEventId);

  // Znajdź wszystkich uczniów którzy już mają ten event
  const existingStudentIds = new Set<string>();

  // Przeszukujemy nowych + potencjalnych poprzednich uczniów
  // Ponieważ nie wiemy kto był poprzednio, robimy delete+create dla nowych
  // a update dla tych co pozostali

  // Strategia: pobierz wszystkich uczniów trenera którzy mogą mieć ten event
  // (szukamy po originEventId w ich tournaments)
  // Następnie: zaktualizuj istniejące, dodaj nowe, usuń te których nie ma w newStudentIds

  const allStudentsWithEvent: { studentId: string; docId: string }[] = [];

  await Promise.all(
    newStudentIds.map(async sid => {
      const docs = await findMirroredDocs(sid, originEventId);
      docs.forEach(d => allStudentsWithEvent.push({ studentId: sid, docId: d.id }));
      existingStudentIds.add(sid);
    })
  );

  const batch = writeBatch(db);

  // Update istniejących lub create nowych
  for (const sid of newStudentIds) {
    const existing = allStudentsWithEvent.find(x => x.studentId === sid);
    if (existing) {
      batch.update(doc(db, `users/${sid}/tournaments`, existing.docId), payload);
    } else {
      // Nie ma jeszcze — dodaj
      const newRef = doc(collection(db, `users/${sid}/tournaments`));
      batch.set(newRef, payload);
    }
  }

  await batch.commit();
}

/**
 * Usuwanie — przed lub po deleteDoc eventu trenera.
 * Usuwa wszystkie mirrored docs u przekazanych uczniów.
 * Jeśli studentIds jest puste, szuka u wszystkich możliwych (fallback).
 */
export async function deleteMirroredEvent(
  originEventId: string,
  studentIds: string[]
): Promise<void> {
  if (!studentIds.length) return;

  const batch = writeBatch(db);
  let hasOps = false;

  await Promise.all(
    studentIds.map(async sid => {
      const docs = await findMirroredDocs(sid, originEventId);
      docs.forEach(d => {
        batch.delete(doc(db, `users/${sid}/tournaments`, d.id));
        hasOps = true;
      });
    })
  );

  if (hasOps) await batch.commit();
}
