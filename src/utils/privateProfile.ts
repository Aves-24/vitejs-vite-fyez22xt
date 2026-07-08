import { db } from '../firebase';
import { doc, getDoc, setDoc, updateDoc, deleteField } from 'firebase/firestore';

// ═══════════════════════════════════════════════════════════════════
//  [RODO C21] Profil prywatny — users/{uid}/private/profile
//
//  Dokument users/{uid} jest czytelny dla trenerów/uczniów w relacji
//  (dashboard trenera potrzebuje rang, sprzętu, lastSession*). Pola,
//  których relacja widzieć NIE powinna (data urodzenia, płeć, legacy
//  e-mail), żyją w podkolekcji private/ — reguły Firestore dopuszczają
//  tam wyłącznie właściciela i admina.
//
//  Trener zamiast daty urodzenia widzi wyliczoną kategorię wiekową
//  (users/{uid}.ageCategory) — wystarcza do turniejów, nie zdradza DOB.
// ═══════════════════════════════════════════════════════════════════

export interface PrivateProfile {
  birthDate?: string;      // ISO YYYY-MM-DD
  gender?: 'M' | 'K';
}

// Kategorie wiekowe DSB — progi zgodne z getRecommendation (archeryRules.ts):
// wiek liczony kalendarzowo (rok bieżący − rok urodzenia).
export function getAgeCategory(birthDate: string, gender: 'M' | 'K'): string {
  const birthYear = new Date(birthDate).getFullYear();
  if (!birthYear || isNaN(birthYear)) return '';
  const age = new Date().getFullYear() - birthYear;
  const sfx = gender === 'K' ? ' w' : ' m';
  if (age <= 10) return 'Schüler C' + sfx;
  if (age <= 12) return 'Schüler B' + sfx;
  if (age <= 14) return 'Schüler A' + sfx;
  if (age <= 17) return 'Jugend' + sfx;
  if (age <= 20) return 'Junioren' + sfx;
  if (age <= 49) return gender === 'K' ? 'Damen' : 'Herren';
  if (age <= 65) return 'Master' + sfx;
  return 'Senioren' + sfx;
}

export async function loadPrivateProfile(uid: string): Promise<PrivateProfile | null> {
  try {
    const snap = await getDoc(doc(db, 'users', uid, 'private', 'profile'));
    return snap.exists() ? (snap.data() as PrivateProfile) : null;
  } catch {
    return null;
  }
}

export async function savePrivateProfile(uid: string, data: PrivateProfile): Promise<void> {
  const payload: Record<string, string> = {};
  if (data.birthDate) payload.birthDate = data.birthDate;
  if (data.gender) payload.gender = data.gender;
  if (Object.keys(payload).length === 0) return;
  await setDoc(doc(db, 'users', uid, 'private', 'profile'), payload, { merge: true });
}

// Jednorazowa migracja starych kont: birthDate/gender → private/profile,
// e-mail znika z Firestore całkowicie (żyje w Firebase Auth — admin ma go
// w konsoli). Reguła Path B blokuje ponowne dodanie tych pól do users/{uid},
// dopuszcza jedynie ich usunięcie (sprawdza stan PO zapisie).
export async function migrateSensitiveFields(uid: string, data: Record<string, any>): Promise<void> {
  if (data.birthDate || data.gender) {
    await savePrivateProfile(uid, { birthDate: data.birthDate, gender: data.gender });
  }
  const update: Record<string, any> = {
    email: deleteField(),
    birthDate: deleteField(),
    gender: deleteField(),
  };
  if (data.birthDate) {
    update.ageCategory = getAgeCategory(data.birthDate, data.gender || 'M');
  }
  await updateDoc(doc(db, 'users', uid), update);
}
