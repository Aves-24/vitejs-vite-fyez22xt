import { doc, serverTimestamp, setDoc, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import { TRIAL_DAYS } from './proAccess';

// [AUDYT 2026-11-02] Trial raz na konto. Reguła wpuszcza trialEndsAt tylko
// razem z NOWYM znacznikiem trialClaims/{uid} w tym samym batchu; znacznik
// zostaje po skasowaniu profilu, więc „usuń i załóż od nowa” nie daje nowego
// trialu. Gdy trial był już wykorzystany, zapisujemy same pola bez trialu.
export async function setProfileWithTrial(uid: string, fields: Record<string, unknown> = {}): Promise<void> {
  const batch = writeBatch(db);
  batch.set(doc(db, 'users', uid), {
    ...fields,
    trialEndsAt: Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000,
  }, { merge: true });
  batch.set(doc(db, 'trialClaims', uid), { claimedAt: serverTimestamp() });
  try {
    await batch.commit();
  } catch (e) {
    if (Object.keys(fields).length === 0) throw e;
    await setDoc(doc(db, 'users', uid), fields, { merge: true });
  }
}
