import { compareStage, scoreSeenBy } from './battleStage';

/**
 * [ARENA] Statystyki bitew gracza do okna Multiplayer Arena (user 2026-10-21).
 * Wcześniej „Kampfstatistiken” było tylko licznikiem otwartych gier klubu.
 *
 * Liczymy z dokumentów bitew, które i tak pobiera się raz przy otwarciu okna:
 *  - rozegrane: gry, które gracz ukończył (finishedParticipants),
 *  - wygrane:   1. miejsce w grze z ≥2 graczami,
 *  - podia:     miejsca 1–3 w grze z ≥3 graczami,
 *  - najlepszy: najwyższy własny wynik w ukończonej grze.
 * Miejsce według pełnych wyników (punkty, potem X, 10, 9) — tak jak ranking.
 */
export interface BattleStats { played: number; wins: number; podiums: number; best: number }

export function computeBattleStats(battles: any[], uid: string): BattleStats {
  const out: BattleStats = { played: 0, wins: 0, podiums: 0, best: 0 };
  for (const b of battles) {
    if (!b?.finishedParticipants?.includes(uid)) continue;
    out.played++;
    const players: string[] = Array.isArray(b.participants) ? b.participants : [];
    const ranked = players
      .map(id => ({ id, sc: scoreSeenBy(b, id, uid, 0, true) }))
      .sort((p, q) => compareStage(p.sc, q.sc));
    const place = ranked.findIndex(p => p.id === uid) + 1;
    if (players.length >= 2 && place === 1) out.wins++;
    if (players.length >= 3 && place >= 1 && place <= 3) out.podiums++;
    const mine = ranked.find(p => p.id === uid)?.sc?.score ?? 0;
    if (mine > out.best) out.best = mine;
  }
  return out;
}
