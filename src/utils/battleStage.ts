// ═══════════════════════════════════════════════════════════════════
//  [VEREIN] Ranking „na ślepo" w grach klubowych (user 2026-10-21)
//
//  Gra klubowa jest otwarta 3 h, ludzie dołączają w różnych momentach.
//  Żeby spóźniony nie zobaczył od razu „600 punktów" i nie zrezygnował,
//  wyniki innych widać tylko na TYM SAMYM etapie: po tylu strzałach, ile
//  oddał patrzący. Pełne wyniki dopiero po własnym końcu. Gospodarz, który
//  nie strzela (organizuje), widzi wszystko. LOCAL/WORLD bez zmian.
//
//  Każdy gracz trzyma w liveScores.{uid}.ends wynik NARASTAJĄCY po każdej
//  serii — porównujemy po liczbie strzał, nie serii, więc zgadza się też
//  przy krótszym treningu i różnej liczbie strzał w serii.
//
//  Po przejściu na Blaze te same dane pójdą do prywatnego dokumentu
//  czytanego tylko przez Cloud Function (patrz pamięć projektu).
// ═══════════════════════════════════════════════════════════════════

/** Stan po jednej serii, narastająco: strzały, punkty, X, 10, 9. */
export interface StagePoint { a: number; s: number; x: number; t: number; n: number }

export interface StageScore { score: number; x: number; t: number; n: number; arrows: number }

/** Maks. graczy w grze klubowej — pilnuje też reguła JOIN w firestore.rules. */
export const CLUB_MAX_PLAYERS = 12;

const asScore = (d: any): StageScore => (typeof d === 'object' && d !== null)
  ? { score: d.score || 0, x: d.x || 0, t: d.t || 0, n: d.n || 0, arrows: lastArrows(d) }
  : { score: d || 0, x: 0, t: 0, n: 0, arrows: 0 };

function lastArrows(d: any): number {
  const ends: StagePoint[] = Array.isArray(d?.ends) ? d.ends : [];
  return ends.length ? ends[ends.length - 1].a : 0;
}

/** Ile strzał oddał gracz w tej bitwie (według zapisanych serii). */
export function arrowsShot(battle: any, uid: string): number {
  return lastArrows(battle?.liveScores?.[uid]);
}

/**
 * Czy `uid` widzi pełne wyniki: poza grą klubową zawsze; w klubowej po
 * własnym końcu albo jako gospodarz, który jeszcze nie oddał ani jednej strzały.
 */
export function seesFullScores(battle: any, uid: string): boolean {
  if (battle?.mode !== 'CLUB') return true;
  if (battle.finishedParticipants?.includes(uid)) return true;
  return battle.hostId === uid && arrowsShot(battle, uid) === 0;
}

/**
 * Wynik gracza `id` widziany przez `viewer`: pełny albo przycięty do etapu
 * (ostatnia seria z ≤ `viewerArrows` strzałami). `null` = jeszcze nic do pokazania.
 */
export function scoreSeenBy(battle: any, id: string, viewer: string, viewerArrows: number, full: boolean): StageScore | null {
  const d = battle?.liveScores?.[id];
  if (full || id === viewer) return asScore(d);
  const ends: StagePoint[] = Array.isArray(d?.ends) ? d.ends : [];
  let hit: StagePoint | null = null;
  for (const e of ends) { if (e.a <= viewerArrows) hit = e; else break; }
  return hit ? { score: hit.s, x: hit.x, t: hit.t, n: hit.n, arrows: hit.a } : null;
}

/** Sortowanie rankingu: punkty, potem X, 10, 9; brak wyniku na końcu. */
export function compareStage(a: StageScore | null, b: StageScore | null): number {
  if (!a || !b) return (a ? 0 : 1) - (b ? 0 : 1);
  return (b.score - a.score) || (b.x - a.x) || (b.t - a.t) || (b.n - a.n);
}
