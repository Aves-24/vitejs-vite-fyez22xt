import { groupStats } from './groupStats';

/**
 * [GRUPA W CZASIE] Średnica grupy (koło z 80% strzał, cm) dla kolejnych
 * treningów — trener 2026-10-29: „rozmiar grupy w cm to najlepszy wskaźnik
 * postępu technicznego”, ringi zależą od ustawienia celownika.
 *
 * Tylko treningi z naniesionymi strzałami (wpis na tarczy) i co najmniej
 * TREND_MIN_DOTS pozycjami; oznaczone złe strzały wypadają już w groupStats.
 */

export const TREND_MIN_DOTS = 12;
export const TREND_MAX_SESSIONS = 10;

export interface GroupTrendPoint {
  id: string;
  ts: number;
  date: string;
  diameterCm: number;
  offsetCm: number;
  n: number;
}

interface SessionLike {
  id: string;
  type?: string;
  targetType?: string;
  date?: string;
  timestamp?: { toMillis?: () => number; seconds?: number } | number | null;
  ends?: Array<{ dots?: Array<{ x: number | null; y: number | null; bad?: boolean }> }>;
}

const tsOf = (s: SessionLike): number => {
  const t = s.timestamp;
  if (typeof t === 'number') return t;
  if (t?.toMillis) return t.toMillis();
  if (t?.seconds) return t.seconds * 1000;
  return 0;
};

export function groupTrend(sessions: SessionLike[], max = TREND_MAX_SESSIONS): GroupTrendPoint[] {
  const out: GroupTrendPoint[] = [];
  for (const s of sessions) {
    if (s.type === 'TECHNICAL' || !s.ends?.length) continue;
    const g = groupStats(s.ends, s.targetType || 'Full');
    if (!g || g.n < TREND_MIN_DOTS) continue;
    out.push({ id: s.id, ts: tsOf(s), date: s.date || '', diameterCm: g.diameterCm, offsetCm: Math.hypot(g.dxCm, g.dyCm), n: g.n });
  }
  return out.sort((a, b) => a.ts - b.ts).slice(-max);
}
