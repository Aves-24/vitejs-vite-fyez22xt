import { db } from '../firebase';
import {
  collection, deleteDoc, doc, getDoc, getDocs, query, setDoc, updateDoc,
  where, serverTimestamp,
} from 'firebase/firestore';
import { guestExpiryFields } from './guestMode';

// ═══════════════════════════════════════════════════════════════════
//  [RODO C36] Prywatna notatka treningowa — users/{uid}/sessionNotes/{sessionId}
//
//  Trener ma odczyt CAŁEGO dokumentu sesji (reguły nie umieją ukryć
//  pojedynczego pola, a zapytania listowe nie przejdą z warunkiem na
//  resource.data). Dawniej notatka „Prywatna” leżała w `sessions.note`
//  i była ukryta tylko w UI — trener z DevTools mógł ją przeczytać,
//  a polityka prywatności obiecuje, że prywatne notatki są dla niego
//  niedostępne.
//
//  Teraz: notatka udostępniona trenerowi → `sessions.note` (bez zmian).
//  Notatka prywatna → tekst TYLKO tutaj (reguły: właściciel i admin),
//  w sesji `note: ''` + `isNotePublic: false`. Id dokumentu = id sesji.
// ═══════════════════════════════════════════════════════════════════

export const SESSION_NOTES_COL = 'sessionNotes';

export const privateSessionNoteRef = (uid: string, sessionId: string) =>
  doc(db, `users/${uid}/${SESSION_NOTES_COL}/${sessionId}`);

// Pole `note` do zapisania w dokumencie sesji.
export const sessionNoteField = (text: string, isPublic: boolean) => (isPublic ? text : '');

// Zapis prywatnej części: prywatna z treścią → dokument, inaczej go kasujemy
// (np. notatka przestawiona na „udostępnij trenerowi”).
export function writePrivateSessionNote(uid: string, sessionId: string, text: string, isPublic: boolean): Promise<void> {
  const ref = privateSessionNoteRef(uid, sessionId);
  if (!isPublic && text) {
    return setDoc(ref, { note: text, updatedAt: serverTimestamp(), ...guestExpiryFields() });
  }
  return deleteDoc(ref);
}

export async function readPrivateSessionNote(uid: string, sessionId: string): Promise<string> {
  const snap = await getDoc(privateSessionNoteRef(uid, sessionId));
  return snap.exists() ? (snap.data().note || '') : '';
}

// Wszystkie prywatne notatki właściciela: sessionId → tekst.
export async function readAllPrivateSessionNotes(uid: string): Promise<Map<string, string>> {
  const snap = await getDocs(collection(db, `users/${uid}/${SESSION_NOTES_COL}`));
  return new Map(snap.docs.map(d => [d.id, (d.data().note as string) || '']));
}

// Jednorazowo przenosi stare prywatne notatki z `sessions.note`.
// Najpierw kopia, potem czyszczenie sesji — przerwanie w połowie nie gubi
// tekstu, a następne uruchomienie dokończy robotę.
const MIGRATION_KEY = (uid: string) => `grotX_privSessionNotesV1_${uid}`;

export async function migratePrivateSessionNotes(uid: string): Promise<void> {
  try {
    if (localStorage.getItem(MIGRATION_KEY(uid))) return;
  } catch { /* brak localStorage — migracja po prostu przejdzie jeszcze raz */ }

  const snap = await getDocs(query(
    collection(db, `users/${uid}/sessions`),
    where('isNotePublic', '==', false),
  ));
  for (const d of snap.docs) {
    const data = d.data();
    const text = typeof data.note === 'string' ? data.note : '';
    if (!text) continue;
    await setDoc(privateSessionNoteRef(uid, d.id), {
      note: text,
      updatedAt: serverTimestamp(),
      // Sesja gościa wygasa — jej notatka razem z nią (TTL).
      ...(data.expiresAt ? { expiresAt: data.expiresAt, isGuest: true } : {}),
    });
    await updateDoc(d.ref, { note: '' });
  }

  try {
    localStorage.setItem(MIGRATION_KEY(uid), '1');
  } catch { /* j.w. */ }
}
