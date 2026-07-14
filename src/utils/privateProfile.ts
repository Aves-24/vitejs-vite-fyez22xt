import { db } from '../firebase';
import { doc, getDoc, setDoc, updateDoc, deleteField } from 'firebase/firestore';
import { PRIVACY_POLICY_VERSION } from './legalLinks';
import { guestExpiryFields } from './guestMode';

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

// [RODO art. 8] Zgoda opiekuna dla użytkownika < 16 lat (próg DE i PL).
// „Reasonable efforts": oświadczenie opiekuna + jego e-mail jako dowód.
// Twarda weryfikacja (link mailowy) dojdzie z Cloud Functions (Blaze).
export interface ParentalConsent {
  version: string;            // wersja polityki w chwili zgody
  acceptedAt: number;         // ms
  guardianEmail: string;      // e-mail rodzica/opiekuna (dowód)
  birthDateAtConsent: string; // ISO — wykrycie późniejszej zmiany daty ur.
}

export interface PrivateProfile {
  birthDate?: string;      // ISO YYYY-MM-DD
  gender?: 'M' | 'K';
  parentalConsent?: ParentalConsent;
}

// [RODO art. 8] Wiek progowy zgody cyfrowej dla Niemiec i Polski = 16 lat.
// Używamy 16 na sztywno (surowszy próg jest zawsze zgodny — kraje z niższym
// progiem, np. 13, też są pokryte). Zmiana wymaga świadomej decyzji prawnej.
export const DIGITAL_CONSENT_AGE = 16;

// Pełny wiek ukończony (uwzględnia miesiąc/dzień) — do celów prawnych,
// inaczej niż kategoria WA liczona po samym roczniku.
export function computeAge(birthDate: string, now: Date = new Date()): number {
  const b = new Date(birthDate);
  if (isNaN(b.getTime())) return NaN;
  let age = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age--;
  return age;
}

export function isMinorUnderConsentAge(birthDate: string | undefined): boolean {
  if (!birthDate) return false; // bez daty nie orzekamy — wizard i tak ją wymusi
  const age = computeAge(birthDate);
  return !isNaN(age) && age < DIGITAL_CONSENT_AGE;
}

// Czy trzeba pokazać bramkę zgody opiekuna:
//  - użytkownik < 16 lat, ORAZ
//  - brak zgody / zgoda do innej daty urodzenia / starsza wersja polityki.
export function needsParentalConsent(priv: PrivateProfile | null | undefined): boolean {
  const birthDate = priv?.birthDate;
  if (!isMinorUnderConsentAge(birthDate)) return false;
  const c = priv?.parentalConsent;
  if (!c) return true;
  return c.birthDateAtConsent !== birthDate || c.version !== PRIVACY_POLICY_VERSION;
}

export async function saveParentalConsent(
  uid: string,
  birthDate: string,
  guardianEmail: string,
): Promise<void> {
  const consent: ParentalConsent = {
    version: PRIVACY_POLICY_VERSION,
    acceptedAt: Date.now(),
    guardianEmail: guardianEmail.trim(),
    birthDateAtConsent: birthDate,
  };
  await setDoc(doc(db, 'users', uid, 'private', 'profile'), { parentalConsent: consent }, { merge: true });
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
  const payload: Record<string, any> = {};
  if (data.birthDate) payload.birthDate = data.birthDate;
  if (data.gender) payload.gender = data.gender;
  if (Object.keys(payload).length === 0) return;
  // [GOŚĆ] Dane wrażliwe gościa też wygasają po 24h (TTL na grupie 'private')
  Object.assign(payload, guestExpiryFields());
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
