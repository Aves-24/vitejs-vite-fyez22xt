// src/utils/worldMatchmakingService.ts

import { db } from '../firebase';
import {
  collection, doc, setDoc, deleteDoc, updateDoc, getDoc,
  query, where, orderBy, limit, getDocs, runTransaction,
  Timestamp,
} from 'firebase/firestore';

// ─── Timing ───────────────────────────────────────────────────────────────────
export const MATCH_TIMEOUT_MS  = 5 * 60 * 1000;  // 5 min → wygaśnięcie
export const EXPAND_TO_2_MS    =      90 * 1000;  // 90 s  → rozszerzenie do ±2
export const EXPAND_TO_3_MS    =     180 * 1000;  // 180 s → rozszerzenie do ±3

// ─── XP ───────────────────────────────────────────────────────────────────────
export const WORLD_XP_PARTICIPATION = 5;
export const WORLD_XP_WIN           = 10;

// ─── Types ────────────────────────────────────────────────────────────────────
export interface QueueEntry {
  userId:       string;
  displayName:  string;   // "Imię N." — prywatność
  clubName:     string;
  country:      string;
  level:        number;   // ranga 1–10
  searchRadius: 1 | 2 | 3;
  status:       'waiting' | 'matched' | 'expired';
  battleId?:    string;
  timestamp:    Timestamp;
}

export interface WorldStats {
  userId:          string;
  displayName:     string;
  clubName:        string;
  country:         string;
  level:           number;
  worldWins:       number;
  worldLosses:     number;
  worldXP:         number;
  lastWorldBattle: Timestamp;
}

// ─── Privacy helper ───────────────────────────────────────────────────────────
// Zwraca "Jan K." zamiast pełnego nazwiska
export const formatWorldDisplayName = (
  firstName: string,
  lastName: string
): string => {
  if (!firstName) return 'Łucznik';
  const initial = lastName ? ` ${lastName[0].toUpperCase()}.` : '';
  return `${firstName}${initial}`;
};

// ─── Queue management ─────────────────────────────────────────────────────────

export const joinWorldQueue = async (
  userId:    string,
  firstName: string,
  lastName:  string,
  clubName:  string,
  country:   string,
  level:     number,
): Promise<void> => {
  // Wyczyść stary wpis (ochrona przed duplikatami)
  await leaveWorldQueue(userId);

  const entry: QueueEntry = {
    userId,
    displayName: formatWorldDisplayName(firstName, lastName),
    clubName:    clubName || '',
    country:     country  || '',
    level,
    searchRadius: 1,
    status:      'waiting',
    timestamp:   Timestamp.fromDate(new Date()),
  };

  await setDoc(doc(db, 'world_queue', userId), entry);
};

export const leaveWorldQueue = async (userId: string): Promise<void> => {
  await deleteDoc(doc(db, 'world_queue', userId));
};

export const expandSearchRadius = async (
  userId:    string,
  newRadius: 1 | 2 | 3,
): Promise<void> => {
  await updateDoc(doc(db, 'world_queue', userId), { searchRadius: newRadius });
};

// ─── Matchmaking ──────────────────────────────────────────────────────────────

// Tworzy dokument bitwy w kolekcji `battles` (wymagany przez ScoringView).
// Wywołuje tylko Player B (ten, który znalazł rywala).
const createWorldBattleDoc = async (
  battleId:          string,
  player1Id:         string,
  player1Name:       string,
  player1Club:       string,
  player1Country:    string,
  player2Id:         string,
  player2Name:       string,
  player2Club:       string,
  player2Country:    string,
  distance:          string,
  targetType:        string,
): Promise<void> => {
  await setDoc(doc(db, 'battles', battleId), {
    hostId:        player1Id,
    hostName:      player1Name,
    hostClub:      player1Club,
    hostCountry:   player1Country,
    hostIsPremium: false,
    status:        'ACTIVE',
    mode:          'WORLD',
    isPublic:      false,
    isWorldBattle: true,
    distance,
    targetType,
    participants:  [player1Id, player2Id],
    liveScores:    { [player1Id]: 0, [player2Id]: 0 },
    guests:        [],
    participantsData: {
      [player1Id]: { name: player1Name, club: player1Club, country: player1Country },
      [player2Id]: { name: player2Name, club: player2Club, country: player2Country },
    },
    createdAt: new Date().toISOString(),
  });
};

// Szuka rywala, atomowo rezerwuje obu graczy i tworzy dokument bitwy.
// Zwraca battleId jeśli dopasowanie się udało, null jeśli brak kandydatów.
export const tryMatchOpponent = async (
  userId:        string,
  myDisplayName: string,
  myClub:        string,
  myCountry:     string,
  level:         number,
  searchRadius:  number,
  distance:      string,
  targetType:    string,
): Promise<string | null> => {
  const minLevel = Math.max(1,  level - searchRadius);
  const maxLevel = Math.min(10, level + searchRadius);

  const q = query(
    collection(db, 'world_queue'),
    where('status', '==', 'waiting'),
    where('level', '>=', minLevel),
    where('level', '<=', maxLevel),
    orderBy('level'),
    orderBy('timestamp'),   // najdłużej czekający mają priorytet
    limit(20),
  );

  const snapshot = await getDocs(q);
  const candidates = snapshot.docs.filter(d => d.id !== userId);
  if (candidates.length === 0) return null;

  // Próbuj zarezerwować pierwszego dostępnego kandydata
  for (const candidate of candidates) {
    try {
      const result = await runTransaction(db, async (tx) => {
        const candidateRef = doc(db, 'world_queue', candidate.id);
        const myRef        = doc(db, 'world_queue', userId);

        const [candidateSnap, mySnap] = await Promise.all([
          tx.get(candidateRef),
          tx.get(myRef),
        ]);

        if (!candidateSnap.exists() || candidateSnap.data()?.status !== 'waiting') {
          throw new Error('candidate_unavailable');
        }
        if (!mySnap.exists() || mySnap.data()?.status !== 'waiting') {
          throw new Error('self_unavailable');
        }

        const newBattleId = `world_${Date.now()}_${userId.slice(0, 6)}`;
        const opponentData = candidateSnap.data() as QueueEntry;

        tx.update(candidateRef, { status: 'matched', battleId: newBattleId });
        tx.update(myRef,        { status: 'matched', battleId: newBattleId });

        return { battleId: newBattleId, opponentData };
      });

      // Utwórz dokument bitwy (robi tylko "matcher" — Player B)
      await createWorldBattleDoc(
        result.battleId,
        userId,         myDisplayName,                    myClub,                    myCountry,
        candidate.id,  result.opponentData.displayName,  result.opponentData.clubName, result.opponentData.country,
        distance, targetType,
      );

      return result.battleId;
    } catch {
      // Kandydat już zajęty — próbuj następnego
      continue;
    }
  }

  return null;
};

// ─── Post-battle ──────────────────────────────────────────────────────────────

// Zapisuje wynik w world_stats i dodaje XP do profilu użytkownika
export const recordWorldBattleResult = async (
  userId:      string,
  displayName: string,
  clubName:    string,
  country:     string,
  level:       number,
  didWin:      boolean,
): Promise<void> => {
  const xpEarned = WORLD_XP_PARTICIPATION + (didWin ? WORLD_XP_WIN : 0);

  // ── world_stats ──
  const statsRef  = doc(db, 'world_stats', userId);
  const statsSnap = await getDoc(statsRef);

  if (statsSnap.exists()) {
    const d = statsSnap.data();
    await updateDoc(statsRef, {
      worldWins:       (d.worldWins   || 0) + (didWin ? 1 : 0),
      worldLosses:     (d.worldLosses || 0) + (didWin ? 0 : 1),
      worldXP:         (d.worldXP     || 0) + xpEarned,
      level,
      displayName,
      clubName,
      country,
      lastWorldBattle: Timestamp.fromDate(new Date()),
    });
  } else {
    await setDoc(statsRef, {
      userId,
      displayName,
      clubName,
      country,
      level,
      worldWins:       didWin ? 1 : 0,
      worldLosses:     didWin ? 0 : 1,
      worldXP:         xpEarned,
      lastWorldBattle: Timestamp.fromDate(new Date()),
    });
  }

  // ── XP w profilu użytkownika ──
  const userRef  = doc(db, 'users', userId);
  const userSnap = await getDoc(userRef);
  if (userSnap.exists()) {
    await updateDoc(userRef, {
      xp: (userSnap.data().xp || 0) + xpEarned,
    });
  }
};

// Aktualizuje tylko world_stats (bez XP użytkownika — XP doliczane osobno w ScoringView)
export const updateWorldStatsOnly = async (
  userId:      string,
  displayName: string,
  clubName:    string,
  country:     string,
  level:       number,
  didWin:      boolean,
  worldXpEarned: number,
): Promise<void> => {
  const statsRef  = doc(db, 'world_stats', userId);
  const statsSnap = await getDoc(statsRef);

  if (statsSnap.exists()) {
    const d = statsSnap.data();
    await updateDoc(statsRef, {
      worldWins:       (d.worldWins   || 0) + (didWin ? 1 : 0),
      worldLosses:     (d.worldLosses || 0) + (didWin ? 0 : 1),
      worldXP:         (d.worldXP     || 0) + worldXpEarned,
      level,
      displayName,
      clubName,
      country,
      lastWorldBattle: Timestamp.fromDate(new Date()),
    });
  } else {
    await setDoc(statsRef, {
      userId,
      displayName,
      clubName,
      country,
      level,
      worldWins:       didWin ? 1 : 0,
      worldLosses:     didWin ? 0 : 1,
      worldXP:         worldXpEarned,
      lastWorldBattle: Timestamp.fromDate(new Date()),
    });
  }
};

// ─── Leaderboard ──────────────────────────────────────────────────────────────

export const fetchWorldLeaderboard = async (level: number): Promise<WorldStats[]> => {
  const q = query(
    collection(db, 'world_stats'),
    where('level', '==', level),
    orderBy('worldWins', 'desc'),
    orderBy('worldXP',   'desc'),
    limit(50),
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => d.data() as WorldStats);
};
