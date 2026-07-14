import { auth, db } from '../firebase';
import {
  collection, doc, getDocs, updateDoc, deleteField, Timestamp
} from 'firebase/firestore';

// ═══════════════════════════════════════════════════════════════════
//  TRYB GOŚCIA (konto anonimowe Firebase)
//
//  Zasada: gość dostaje pełną aplikację, ale każdy dokument, który
//  tworzy, ma pole `expiresAt` = utworzenie konta + 24h. Polityki TTL
//  Firestore (konsola → Firestore → TTL, pole `expiresAt`) kasują te
//  dokumenty po terminie. Zwykli użytkownicy nie mają `expiresAt`,
//  więc TTL ich nie dotyka.
//
//  Po rejestracji (linkWithCredential — to samo uid) wołamy
//  clearGuestExpiry(), które zdejmuje `expiresAt` ze wszystkiego —
//  dorobek z okresu gościa zostaje na stałe.
// ═══════════════════════════════════════════════════════════════════

export const GUEST_TTL_MS = 24 * 60 * 60 * 1000;

export function isGuestUser(): boolean {
  return !!auth.currentUser?.isAnonymous;
}

// Termin wygaśnięcia liczony od UTWORZENIA konta (twardy okres próbny),
// nie od momentu zapisu — dokument dodany w 20. godzinie żyje tylko 4h.
export function guestExpiresAtMs(): number | null {
  const u = auth.currentUser;
  if (!u?.isAnonymous) return null;
  const created = u.metadata?.creationTime ? Date.parse(u.metadata.creationTime) : Date.now();
  return created + GUEST_TTL_MS;
}

// Pola doklejane do KAŻDEGO dokumentu tworzonego przez gościa.
// Dla zalogowanego zwykłego użytkownika zwraca {} (spread jest no-opem).
export function guestExpiryFields(): { expiresAt?: Timestamp; isGuest?: boolean } {
  const ms = guestExpiresAtMs();
  return ms ? { expiresAt: Timestamp.fromMillis(ms), isGuest: true } : {};
}

// Podkolekcje, w których gość realnie zostawia dane w ciągu 24h.
// Musi być zgodne z politykami TTL w konsoli Firestore.
const GUEST_SUBCOLLECTIONS = ['sessions', 'tournaments', 'dailyStats', 'private', 'scores'];

// Po upgrade konta (gość → pełne): zdejmij expiresAt/isGuest ze
// wszystkich dokumentów, żeby TTL ich nie skasował.
export async function clearGuestExpiry(uid: string): Promise<void> {
  const strip = { expiresAt: deleteField(), isGuest: deleteField() };
  try {
    await updateDoc(doc(db, 'users', uid), strip);
  } catch (e) {
    console.error('clearGuestExpiry: users doc failed', e);
  }
  for (const sub of GUEST_SUBCOLLECTIONS) {
    try {
      const snap = await getDocs(collection(db, `users/${uid}/${sub}`));
      await Promise.all(
        snap.docs
          .filter(d => d.data().expiresAt !== undefined)
          .map(d => updateDoc(d.ref, strip).catch(() => {}))
      );
    } catch {
      // Podkolekcja może nie istnieć / brak uprawnień — nie blokuje upgrade'u.
    }
  }
}
