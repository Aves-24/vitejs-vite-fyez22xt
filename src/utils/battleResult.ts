import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { isFinalBattle, placeInBattle } from './battleStats';

/**
 * [DZIENNIK] Wynik bitwy przy treningu w dzienniku (user 2026-10-21):
 * „Platz 2/5” po zakończeniu gry, „läuft noch” w trakcie.
 *
 * Sesja zapisuje battleId; gdy gra jest już ostateczna (zamknięta albo
 * starsza niż doba), miejsce trafia NA STAŁE do sesji (battlePlace /
 * battlePlayers) — kolejne otwarcia dziennika nie czytają już bitwy.
 * Do tego czasu jeden odczyt bitwy na otwarcie dziennika (cache w pamięci).
 */
export type BattleResult = { place: number; players: number } | { live: true };

const cache = new Map<string, Promise<BattleResult | null>>();

export function resolveBattleResult(uid: string, sessionId: string, battleId: string): Promise<BattleResult | null> {
  const key = `${sessionId}:${battleId}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const p = (async (): Promise<BattleResult | null> => {
    const snap = await getDoc(doc(db, 'battles', battleId));
    if (!snap.exists()) return null;
    const b = snap.data();
    if (!isFinalBattle(b)) return { live: true };
    const { place, players } = placeInBattle(b, uid);
    if (!place) return null;
    updateDoc(doc(db, 'users', uid, 'sessions', sessionId), { battlePlace: place, battlePlayers: players })
      .catch(e => console.warn('battle result save failed:', e));
    return { place, players };
  })().catch(() => null);
  cache.set(key, p);
  return p;
}
