import { db, auth } from '../firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';

// ═══════════════════════════════════════════════════════════════════
//  [RODO C6] Publiczny profil — kolekcja profiles_public/{uid}
//
//  /users/{uid} zawiera dane osobowe (e-mail, data urodzenia, pełne
//  nazwisko) i od hardeningu C6 jest czytelny TYLKO dla właściciela,
//  admina i osób w relacji trener↔uczeń. Wszystko, co mają widzieć
//  obcy użytkownicy (popupy zaproszeń, lobby battles), pochodzi z tego
//  lustra — już przefiltrowanego flagami prywatności (showFullName,
//  showNickname, showClub, showRegion).
//
//  Lustro utrzymuje App.tsx: przy każdej zmianie users/{uid} woła
//  syncPublicProfile(); zapis leci tylko gdy treść faktycznie się
//  zmieniła (porównanie JSON), więc nie generuje pętli zapisów.
// ═══════════════════════════════════════════════════════════════════

export interface PublicProfile {
  displayName: string;
  club: string;
  country: string;
  level: number;
}

// Logika zgodna z formatUserName/formatUserClub z BattleLobbyView —
// respektuje flagi prywatności użytkownika.
export function buildPublicProfile(data: Record<string, any>): PublicProfile {
  const showFull = data.showFullName !== false;
  const showNick = data.showNickname !== false;
  const showCl = data.showClub !== false;
  const showReg = data.showRegion !== false;

  const fName = data.firstName || '';
  const lName = data.lastName || '';
  const nick = data.nickname || '';

  const baseName = showFull
    ? `${fName} ${lName}`.trim()
    : `${fName} ${lName ? lName.charAt(0) + '.' : ''}`.trim();

  let displayName: string;
  if (showNick && nick) {
    displayName = baseName
      ? `${fName} "${nick}" ${showFull ? lName : (lName ? lName.charAt(0) + '.' : '')}`.trim()
      : nick;
  } else {
    displayName = baseName || '';
  }

  const clubParts: string[] = [];
  if (showCl && data.clubName) clubParts.push(data.clubName);
  if (showReg && data.clubCity) clubParts.push(data.clubCity);

  return {
    displayName,
    club: clubParts.join(' - '),
    country: data.countryCode || data.country || '',
    level: data.level || 1,
  };
}

// Cache ostatnio zapisanej wersji per uid — chroni przed zapisem przy
// każdym snapshot (users/{uid} zmienia się często, np. pfeilzaehler).
const lastSynced = new Map<string, string>();

export async function syncPublicProfile(uid: string, userData: Record<string, any>): Promise<void> {
  // [GOŚĆ] Konta anonimowe nie mają publicznego lustra — nie pojawiają się
  // w popupach zaproszeń/lobby, a TTL nie musi czyścić profiles_public.
  if (auth.currentUser?.isAnonymous) return;
  const profile = buildPublicProfile(userData);
  const serialized = JSON.stringify(profile);
  if (lastSynced.get(uid) === serialized) return;
  try {
    await setDoc(doc(db, 'profiles_public', uid), { ...profile, updatedAt: Date.now() });
    lastSynced.set(uid, serialized);
  } catch (e) {
    console.warn('Sync profilu publicznego nieudany:', e);
  }
}

export async function getPublicProfile(uid: string): Promise<PublicProfile | null> {
  try {
    const snap = await getDoc(doc(db, 'profiles_public', uid));
    return snap.exists() ? (snap.data() as PublicProfile) : null;
  } catch {
    return null;
  }
}
