import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';

/**
 * [ZESTAWY] Stempel zestawu sprzętowego na sesji.
 *
 * Zestawy (osobne konfiguracje: recurve plener / compound hala / dmuchawka)
 * jeszcze nie istnieją, ale sesje muszą JUŻ nieść informację, z czego padł
 * wynik. Bez tego przesiadka na inną klasę sprzętu miesza rekordy i średnie
 * bezpowrotnie — 560/600 z compounda i 540/600 z recurve to inne skale,
 * a wykres progresu pokaże skok, którego nie było.
 *
 * `bowClass` jest polem nośnym: przetrwa zmianę nazwy zestawu, jego
 * skasowanie i migrację. `setupId` to na razie stała — przy wprowadzaniu
 * zestawów migracja MUSI grupować stare sesje po `bowClass`, nie po
 * `setupId`, bo użytkownik mógł zmienić klasę sprzętu zanim zestawy
 * powstały i jeden `setupId` kryje wtedy dwie różne klasy.
 */
export const DEFAULT_SETUP_ID = 'default';

export interface SetupStamp {
  setupId: string;
  bowClass?: string;
}

// bowType nie zmienia się w trakcie strzelania — jeden odczyt na użytkownika
// wystarcza na całą wizytę w aplikacji.
const cache = new Map<string, SetupStamp>();

/**
 * Zwraca stempel do rozłożenia w payloadzie sesji (`...await getSetupStamp(uid)`).
 * Nigdy nie rzuca — zapis treningu nie może paść przez stempel.
 */
export async function getSetupStamp(userId: string): Promise<SetupStamp> {
  if (!userId) return { setupId: DEFAULT_SETUP_ID };

  const cached = cache.get(userId);
  if (cached) return cached;

  try {
    const snap = await getDoc(doc(db, 'users', userId));
    const bowClass = snap.exists() ? (snap.data().bowType as string | undefined) : undefined;
    // Brak klasy zapisujemy jako BRAK POLA, nie pusty string — pusty string
    // wyglądałby przy migracji na dane i trafiłby do złej grupy.
    const stamp: SetupStamp = bowClass
      ? { setupId: DEFAULT_SETUP_ID, bowClass }
      : { setupId: DEFAULT_SETUP_ID };
    cache.set(userId, stamp);
    return stamp;
  } catch {
    // Świadomie nie cache'ujemy porażki — następny zapis spróbuje ponownie.
    return { setupId: DEFAULT_SETUP_ID };
  }
}

/** Wołane po zapisie ustawień — użytkownik mógł właśnie zmienić klasę sprzętu. */
export function invalidateSetupStamp(userId?: string): void {
  if (userId) cache.delete(userId);
  else cache.clear();
}
