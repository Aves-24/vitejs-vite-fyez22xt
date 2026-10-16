import { db } from '../firebase';
import {
  collection, deleteDoc, doc, getDoc, getDocs, query, setDoc, updateDoc,
  where, serverTimestamp, documentId,
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

// Prywatne notatki do podanych sesji: sessionId → tekst. Tylko wskazane id
// (zapytanie 'in' przyjmuje do 30 wartości), żeby dziennik nie czytał całej
// historii przy każdym otwarciu.
export async function readPrivateSessionNotes(uid: string, sessionIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const col = collection(db, `users/${uid}/${SESSION_NOTES_COL}`);
  const chunks: string[][] = [];
  for (let i = 0; i < sessionIds.length; i += 30) chunks.push(sessionIds.slice(i, i + 30));
  const snaps = await Promise.all(chunks.map(ids => getDocs(query(col, where(documentId(), 'in', ids)))));
  snaps.forEach(snap => snap.docs.forEach(d => out.set(d.id, (d.data().note as string) || '')));
  return out;
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
