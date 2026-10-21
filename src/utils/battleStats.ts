import { collection, doc, getDoc, getDocs, limit, orderBy, query, updateDoc, where } from 'firebase/firestore';
import { db } from '../firebase';
import { compareStage, scoreSeenBy } from './battleStage';

/**
 * [ARENA] Statystyki bitew gracza do okna Multiplayer Arena (user 2026-10-21).
 *
 * Zasady:
 *  - rozegrane: gry, które gracz ukończył (finishedParticipants),
 *  - wygrane:   1. miejsce w grze z ≥2 graczami,
 *  - podia:     miejsca 1–3 w grze z ≥3 graczami,
 *  - najlepszy: najwyższy własny wynik w ukończonej grze.
 * Miejsce według pełnych wyników (punkty, potem X, 10, 9) — tak jak ranking.
 *
 * Bez limitu przy latach użytkowania: podsumowanie mieszka w users/{uid}.battleStats
 * ze znacznikiem `cursor` (createdAt ostatniej doliczonej bitwy). Przy otwarciu
 * okna pobieramy tylko bitwy NOWSZE od znacznika (indeks participants+createdAt).
 * Na stałe doliczamy tylko gry OSTATECZNE — zamknięte albo starsze niż 24 h;
 * wynik trwającej gry może się jeszcze zmienić, więc liczy się tylko do widoku.
 */
export interface BattleStats { played: number; wins: number; podiums: number; best: number; bestAt?: string }
interface StoredStats extends BattleStats { cursor: string }

const EMPTY: BattleStats = { played: 0, wins: 0, podiums: 0, best: 0 };
const FINAL_AFTER_MS = 24 * 60 * 60 * 1000;
const PAGE = 200;

/** Dolicza jedną bitwę do statystyk (bez mutowania wejścia). */
function addBattle(acc: BattleStats, b: any, uid: string): BattleStats {
  if (!b?.finishedParticipants?.includes(uid)) return acc;
  const players: string[] = Array.isArray(b.participants) ? b.participants : [];
  const ranked = players
    .map(id => ({ id, sc: scoreSeenBy(b, id, uid, 0, true) }))
    .sort((p, q) => compareStage(p.sc, q.sc));
  const place = ranked.findIndex(p => p.id === uid) + 1;
  const mine = ranked.find(p => p.id === uid)?.sc?.score ?? 0;
  return {
    played: acc.played + 1,
    wins: acc.wins + (players.length >= 2 && place === 1 ? 1 : 0),
    podiums: acc.podiums + (players.length >= 3 && place >= 1 && place <= 3 ? 1 : 0),
    best: Math.max(acc.best, mine),
    // createdAt gry z najlepszym wynikiem — „Bestwert” otwiera STATS tego dnia.
    bestAt: mine > acc.best ? b.createdAt : acc.bestAt,
  };
}

export function computeBattleStats(battles: any[], uid: string): BattleStats {
  return battles.reduce((acc, b) => addBattle(acc, b, uid), EMPTY);
}

/** Gra już się nie zmieni: zamknięta albo starsza niż doba. */
export function isFinalBattle(b: any, now = Date.now()): boolean {
  if (b?.status === 'FINISHED') return true;
  const created = Date.parse(b?.createdAt || '');
  return Number.isFinite(created) && now - created > FINAL_AFTER_MS;
}

/**
 * Dzieli bitwy (rosnąco po createdAt) na część ostateczną — ciągły początek
 * listy, który można zapisać na stałe — i resztę liczoną tylko do widoku.
 * Pierwsza nieostateczna gra zatrzymuje znacznik, żeby jej nie pominąć później.
 */
export function splitFinal(sorted: any[], now = Date.now()): { final: any[]; pending: any[] } {
  const firstOpen = sorted.findIndex(b => !isFinalBattle(b, now));
  if (firstOpen < 0) return { final: sorted, pending: [] };
  return { final: sorted.slice(0, firstOpen), pending: sorted.slice(firstOpen) };
}

/**
 * Statystyki do wyświetlenia: zapisane podsumowanie + bitwy od znacznika.
 * Odczyty: profil (zwykle z cache) + tylko nowe bitwy; zapis tylko przy zmianie.
 */
export async function loadBattleStats(uid: string): Promise<BattleStats> {
  const userRef = doc(db, 'users', uid);
  const userSnap = await getDoc(userRef);
  // Podsumowanie sprzed pola bestAt (gdy był już jakiś wynik) przeliczamy raz od nowa.
  const raw = userSnap.data()?.battleStats as StoredStats | undefined;
  const stored = raw && (raw.bestAt || !raw.best) ? raw : undefined;
  let acc: BattleStats = stored ? { played: stored.played, wins: stored.wins, podiums: stored.podiums, best: stored.best, bestAt: stored.bestAt } : EMPTY;
  let cursor = stored?.cursor || '';
  let pendingAll: any[];

  // Porcjami — pierwsze przeliczenie po latach to może być kilkaset bitew.
  for (;;) {
    const q = query(
      collection(db, 'battles'),
      where('participants', 'array-contains', uid),
      ...(cursor ? [where('createdAt', '>', cursor)] : []),
      orderBy('createdAt'),
      limit(PAGE),
    );
    const page = (await getDocs(q)).docs.map(d => d.data());
    const { final, pending } = splitFinal(page);
    acc = final.reduce((a, b) => addBattle(a, b, uid), acc);
    if (final.length) cursor = final[final.length - 1].createdAt;
    if (pending.length || page.length < PAGE) { pendingAll = pending; break; }
  }

  if (cursor && cursor !== stored?.cursor) {
    updateDoc(userRef, { battleStats: { ...acc, cursor } }).catch(e => console.warn('battleStats save failed:', e));
  }
  return pendingAll.reduce((a, b) => addBattle(a, b, uid), acc);
}
