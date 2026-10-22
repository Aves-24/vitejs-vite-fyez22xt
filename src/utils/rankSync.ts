import { collection, deleteField, doc, getDocs, limit, orderBy, query, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { applySessionsToRank, RANK_VERSION, type RankSession } from './rankEngine';

/** Pola starego systemu XP — znikają przy przeliczeniu (user 2026-10-22). */
const LEGACY_RANK_FIELDS = ['xp', 'last10Avgs', 'rollingAvg', 'last10Handicaps'];

/** Sesja z Firestore → wejście rankingu. Stare sesje nie mają scoreArrows. */
export function toRankSession(s: any, fallbackBowClass?: string | null): RankSession {
  return {
    score: Number(s.score) || 0,
    scoreArrows: Number(s.scoreArrows ?? s.arrows) || 0,
    distance: s.distance,
    targetType: s.targetType,
    bowClass: s.bowClass ?? fallbackBowClass ?? null,
  };
}

/**
 * Jednorazowe przeliczenie rangi z historii (profil z systemu XP albo starszej
 * wersji rangi). Czyta ostatnie 60 sesji — z zapasem na 10 na każdy łuk.
 * Zwraca nowe pola profilu (już zapisane).
 */
export async function rebuildRankFromHistory(userId: string, userData: any): Promise<Record<string, unknown>> {
  const snap = await getDocs(query(collection(db, `users/${userId}/sessions`), orderBy('timestamp', 'desc'), limit(60)));
  const sessions = snap.docs
    .map(d => toRankSession(d.data(), userData?.bowType))
    .reverse(); // od najstarszej — tak jak przychodziły
  const fields: Record<string, unknown> = applySessionsToRank(null, sessions) ?? { rankVersion: RANK_VERSION };
  const deletes = Object.fromEntries(LEGACY_RANK_FIELDS.map(f => [f, deleteField()]));
  await updateDoc(doc(db, 'users', userId), { ...fields, ...deletes });
  return fields;
}
