// [STREFY 2026-11-06] Strzały → strefy tarczy. Wspólne dla Home (pierścień)
// i PRO Progress (karta „Trefferzonen · letzte 6 Trainings”), żeby liczyły
// identycznie. Kolejność: złoto (X/10/9), czerwień (8/7), niebieski (6/5),
// czarny (4/3), biały (2/1), M (pudło).
import { statsGroupOf, zoneIndexOf, type StatsGroup } from '../config/statsGroups';

export type Zones = [number, number, number, number, number, number];

export const ZONE_COLORS = ['#f2c94c', '#e5534b', '#3b82f6', '#222222', '#cfd5d2', ''] as const;
export const ZONE_KEYS = ['gold', 'red', 'blue', 'black', 'white', 'miss'] as const;

/** [FELD] `group` = świat statystyk: na tarczy terenowej 6 i 5 to złoto, 4–1 czerń. */
export function zonesOf(ends: unknown, group: StatsGroup = 'target'): Zones {
  const z: Zones = [0, 0, 0, 0, 0, 0];
  for (const e of Array.isArray(ends) ? ends : []) {
    const arrows = (e as { arrows?: unknown })?.arrows;
    for (const v of Array.isArray(arrows) ? arrows : []) {
      const i = zoneIndexOf(v, group);
      if (i !== null) z[i]++;
    }
  }
  return z;
}

export const addZones = (a: Zones, b: Zones): Zones => a.map((v, i) => v + b[i]) as Zones;

/**
 * Treningi z punktami, które liczą się do stref/formy danego świata
 * (domyślnie tarcze WA — bez technicznych, dmuchawki i terenu).
 */
export function countsForZones(s: { type?: string; score?: number; distance?: string; bowClass?: string | null; targetType?: string | null }, group: StatsGroup = 'target'): boolean {
  return (s.score || 0) > 0 && s.type !== 'TECHNICAL' && s.distance !== 'TECH' && statsGroupOf(s) === group;
}

/**
 * Etykiety procentów na obwodzie pierścienia: tylko wycinki ≥ minPct i takie,
 * których środki są dość daleko od już przyjętych (większe mają pierwszeństwo).
 * Kąty w stopniach od góry, zgodnie z ruchem wskazówek.
 */
export function ringLabels(z: number[], minPct = 9, minGapDeg = 40): { i: number; pct: number; midDeg: number }[] {
  const total = z.reduce((a, b) => a + b, 0);
  if (!total) return [];
  let acc = 0;
  const all = z.map((n, i) => {
    const pct = (n / total) * 100;
    const mid = (acc + pct / 2) * 3.6;
    acc += pct;
    return { i, pct, midDeg: mid };
  }).filter(x => x.pct >= minPct);
  const out: typeof all = [];
  for (const cand of [...all].sort((a, b) => b.pct - a.pct)) {
    const clash = out.some(o => {
      const d = Math.abs(o.midDeg - cand.midDeg) % 360;
      return Math.min(d, 360 - d) < minGapDeg;
    });
    if (!clash) out.push(cand);
  }
  return out;
}
