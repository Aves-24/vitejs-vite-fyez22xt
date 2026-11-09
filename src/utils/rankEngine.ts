// ─────────────────────────────────────────────────────────────────────────────
// GROT-X "THE TARGET SERIES" — rangi z handicapu (2026-10-22)
//
// Ranga = poziom umiejętności, nie staż: wyznacza ją handicap (handicapEngine),
// a progi zależą od rodzaju łuku — compound z natury strzela wyżej. Progi i
// kroki klas wzorem klasyfikacji Archery GB na torach (datum + (i−2)·krok):
// 9 klas od EMB do A3 → poziomy 10..2, poniżej A3 = poziom 1.
// XP zniknęło (user 2026-10-22): systematyczność pokazują dziennik i liczniki.
// ─────────────────────────────────────────────────────────────────────────────

import { calculateCurrentHandicap, sessionHandicap } from './handicapEngine';
import { distanceMeters } from '../config/distances';
import { statsGroupOf, type StatsGroup } from '../config/statsGroups';

export interface RankDef {
  level: number;
  name: string;
  color: string;       // kolor wypełnienia odznaki
  border: string;      // kolor obramowania odznaki
  textColor: string;   // kolor cyfry na odznace
}

export const TARGET_RANKS: RankDef[] = [
  { level: 1,  name: 'WHITE I',  color: '#F0F0F0', border: '#cccccc', textColor: '#555555' },
  { level: 2,  name: 'WHITE II', color: '#F0F0F0', border: '#cccccc', textColor: '#555555' },
  { level: 3,  name: 'BLACK I',  color: '#222222', border: '#444444', textColor: '#ffffff' },
  { level: 4,  name: 'BLACK II', color: '#222222', border: '#444444', textColor: '#ffffff' },
  { level: 5,  name: 'BLUE I',   color: '#0099FF', border: '#007acc', textColor: '#ffffff' },
  { level: 6,  name: 'BLUE II',  color: '#0099FF', border: '#007acc', textColor: '#ffffff' },
  { level: 7,  name: 'RED I',    color: '#FF3300', border: '#cc2900', textColor: '#ffffff' },
  { level: 8,  name: 'RED II',   color: '#FF3300', border: '#cc2900', textColor: '#ffffff' },
  { level: 9,  name: 'GOLD I',   color: '#FFCC00', border: '#e0a800', textColor: '#7a5c00' },
  { level: 10, name: 'GOLD II',  color: '#FFCC00', border: '#e0a800', textColor: '#7a5c00' },
];

export type RankBow = 'RECURVE' | 'COMPOUND' | 'BAREBOW' | 'TRADITIONAL';

/** Klucze tłumaczeń nazw łuków (te same co w Ustawieniach). */
export const RANK_BOW_LABEL: Record<RankBow, string> = {
  RECURVE: 'rules.bow_recurve', COMPOUND: 'rules.bow_compound', BAREBOW: 'rules.bow_barebow', TRADITIONAL: 'rules.bow_trad',
};

/** Archery GB, klasyfikacje na torach: handicap klasy MB i krok między klasami. */
const BOW_SCALE: Record<RankBow, { datum: number; step: number }> = {
  COMPOUND:    { datum: 15, step: 6 },
  RECURVE:     { datum: 30, step: 7 },
  BAREBOW:     { datum: 47, step: 5.5 },
  TRADITIONAL: { datum: 47, step: 5.5 },
};

/** Sesje potrzebne, zanim ranga się pokaże — po 1–2 handicap jest przypadkowy. */
export const MIN_SESSIONS_FOR_RANK = 3;
/** Ile sesji na łuk pamiętamy do handicapu. */
export const HANDICAP_WINDOW = 10;
/** Spadek rangi dopiero przy wyraźnym pogorszeniu — ranga nie miga na granicy. */
const DROP_MARGIN = 2;

/** Klasa łuku z sesji/zestawu → skala rang. Brak = recurve. */
export function rankBowOf(bowClass?: string | null): RankBow {
  if (!bowClass) return 'RECURVE';
  if (bowClass.includes('Compound')) return 'COMPOUND';
  if (bowClass.includes('Barebow')) return 'BAREBOW';
  if (bowClass === 'Tradycyjny') return 'TRADITIONAL';
  return 'RECURVE';
}

/** Najgorszy handicap, który jeszcze daje dany poziom (2..10). */
export function levelThreshold(level: number, bow: RankBow): number {
  const { datum, step } = BOW_SCALE[bow];
  // Poziom 10 = EMB (i=0) … poziom 2 = A3 (i=8)
  return Math.floor(datum + (10 - level - 2) * step);
}

/** Poziom dla handicapu; `prevLevel` hamuje spadek o DROP_MARGIN. */
export function levelForHandicap(handicap: number, bow: RankBow, prevLevel?: number): number {
  let level = 1;
  for (let l = 10; l >= 2; l--) {
    if (handicap <= levelThreshold(l, bow)) { level = l; break; }
  }
  if (prevLevel && prevLevel > level && prevLevel >= 2
      && handicap <= levelThreshold(prevLevel, bow) + DROP_MARGIN) {
    return prevLevel;
  }
  return level;
}

/** Postęp (0–100) do następnego poziomu i handicap, którego on wymaga. */
export function progressToNext(handicap: number, level: number, bow: RankBow): { progress: number; nextHandicap: number | null } {
  if (level >= 10) return { progress: 100, nextHandicap: null };
  const next = levelThreshold(level + 1, bow);
  const upper = level >= 2 ? levelThreshold(level, bow) : levelThreshold(2, bow) + 3 * BOW_SCALE[bow].step;
  const span = Math.max(1, upper - next);
  return {
    progress: Math.min(100, Math.max(0, Math.round(((upper - handicap) / span) * 100))),
    nextHandicap: next,
  };
}

/** Pola rangi zapisywane w users/{uid}. */
export interface StoredRank {
  hcByBow?: Partial<Record<RankBow, number[]>>;
  levelByBow?: Partial<Record<RankBow, number>>;
  bestLevel?: number;
  /**
   * [RANGA TERENOWA 2026-11-09] Osobna ranga dla terenu i IFAA (decyzja usera:
   * „A — osobna ranga”). Pola na górze to tarcze WA (jak dotąd, czytają je
   * World/lobby/profil publiczny); teren i IFAA żyją tutaj w tym samym kształcie.
   */
  rankWorlds?: Partial<Record<RankWorld, Omit<StoredRank, 'rankWorlds'>>>;
}

/** Światy z własną rangą (dmuchawka — bez rangi). */
export type RankWorld = 'field' | 'ifaa';

/** Świat rangi dla sesji: 'target' (tarcze WA), 'field', 'ifaa' albo null (dmuchawka). */
export function rankWorldOf(s: { bowClass?: string | null; targetType?: string | null }): 'target' | RankWorld | null {
  const g: StatsGroup = statsGroupOf({ bowClass: s.bowClass, targetType: s.targetType || '' });
  return g === 'blowgun' ? null : g;
}

/** Zapisane pola rangi danego świata (do rankFromStored). */
export function storedForWorld(d: StoredRank | null | undefined, world: 'target' | RankWorld | StatsGroup): StoredRank | undefined {
  if (!d) return undefined;
  return world === 'field' || world === 'ifaa' ? d.rankWorlds?.[world] : d;
}

export interface RankResult {
  level: number;
  rankName: string;
  color: string;
  border: string;
  textColor: string;
  /** Łuk, z którego jest ranga (najwyższa ze wszystkich łuków). */
  bow: RankBow | null;
  handicap: number | null;
  /** Sesje policzone dla tego łuku; < MIN_SESSIONS_FOR_RANK = ranga w trakcie oceny. */
  sessions: number;
  progress: number;
  nextRankName: string | null;
  nextHandicap: number | null;
  bestLevel: number;
}

const rankDef = (level: number) => TARGET_RANKS[Math.min(10, Math.max(1, level)) - 1];

/** Ranga do pokazania z zapisanych pól profilu. */
export function rankFromStored(d: StoredRank | null | undefined): RankResult {
  let best: { bow: RankBow; level: number; handicap: number; sessions: number } | null = null;
  let pending: { bow: RankBow; sessions: number } | null = null;
  for (const bow of Object.keys(d?.hcByBow || {}) as RankBow[]) {
    const list = d?.hcByBow?.[bow] || [];
    const hc = calculateCurrentHandicap(list);
    if (hc === null) continue;
    if (list.length < MIN_SESSIONS_FOR_RANK) {
      if (!pending || list.length > pending.sessions) pending = { bow, sessions: list.length };
      continue;
    }
    const level = d?.levelByBow?.[bow] ?? levelForHandicap(hc, bow);
    if (!best || level > best.level || (level === best.level && hc < best.handicap)) {
      best = { bow, level, handicap: hc, sessions: list.length };
    }
  }
  const level = best?.level ?? 1;
  const def = rankDef(level);
  const prog = best ? progressToNext(best.handicap, level, best.bow) : { progress: 0, nextHandicap: null };
  return {
    level,
    rankName: def.name,
    color: def.color,
    border: def.border,
    textColor: def.textColor,
    bow: best?.bow ?? pending?.bow ?? null,
    handicap: best?.handicap ?? null,
    sessions: best?.sessions ?? pending?.sessions ?? 0,
    progress: prog.progress,
    nextRankName: level < 10 ? rankDef(level + 1).name : null,
    nextHandicap: prog.nextHandicap,
    bestLevel: Math.max(d?.bestLevel || 1, level),
  };
}

/** Sesja w formie potrzebnej rankingowi. */
export interface RankSession {
  score: number;
  scoreArrows: number;
  distance?: string | null;
  targetType?: string | null;
  bowClass?: string | null;
}

/** Handicap sesji albo null, gdy nie liczy się do rangi (dmuchawka, Field, technika, brak strzał). */
export function handicapOfSession(s: RankSession): number | null {
  if (!(s.scoreArrows > 0)) return null;
  // Dmuchawka bez rangi (zabawka — decyzja usera). Teren i IFAA liczą się tym
  // samym modelem ze stref tarczy, ale do WŁASNEJ rangi (applySessionsToRank).
  if (rankWorldOf(s) === null) return null;
  return sessionHandicap(s.score / s.scoreArrows, distanceMeters(s.distance), s.targetType);
}

/**
 * Nowe pola profilu po sesjach (od najstarszej do najnowszej). Zwraca null,
 * gdy żadna sesja nie liczy się do rangi — wtedy profil zostaje bez zmian.
 */
/** Pola profilu do zapisu po sesji (część może brakować — np. tylko `rankWorlds`). */
export type RankFields = StoredRank & {
  level?: number; rankName?: string; rankColor?: string; rankBorder?: string; rankTextColor?: string;
  currentHandicap?: number | null; rankVersion: number;
};

export function applySessionsToRank(prev: StoredRank | null | undefined, sessions: RankSession[]): RankFields | null {
  const hcByBow: Partial<Record<RankBow, number[]>> = { ...(prev?.hcByBow || {}) };
  const levelByBow: Partial<Record<RankBow, number>> = { ...(prev?.levelByBow || {}) };
  // [RANGA TERENOWA] Teren i IFAA — ta sama mechanika, osobne listy.
  const worlds: NonNullable<StoredRank['rankWorlds']> = {};
  for (const w of ['field', 'ifaa'] as RankWorld[]) {
    const p = prev?.rankWorlds?.[w];
    if (p) worlds[w] = { hcByBow: { ...(p.hcByBow || {}) }, levelByBow: { ...(p.levelByBow || {}) }, bestLevel: p.bestLevel };
  }
  let changed = false;
  let worldsChanged = false;
  for (const s of sessions) {
    const hc = handicapOfSession(s);
    if (hc === null) continue;
    const world = rankWorldOf(s);
    if (world === 'field' || world === 'ifaa') {
      const w = worlds[world] ?? (worlds[world] = { hcByBow: {}, levelByBow: {} });
      const bowW = rankBowOf(s.bowClass);
      const listW = [hc, ...(w.hcByBow![bowW] || [])].slice(0, HANDICAP_WINDOW);
      w.hcByBow![bowW] = listW;
      const curW = calculateCurrentHandicap(listW);
      if (curW !== null && listW.length >= MIN_SESSIONS_FOR_RANK) {
        w.levelByBow![bowW] = levelForHandicap(curW, bowW, w.levelByBow![bowW]);
      }
      w.bestLevel = rankFromStored(w).bestLevel;
      worldsChanged = true;
      continue;
    }
    const bow = rankBowOf(s.bowClass);
    const list = [hc, ...(hcByBow[bow] || [])].slice(0, HANDICAP_WINDOW);
    hcByBow[bow] = list;
    const current = calculateCurrentHandicap(list);
    if (current !== null && list.length >= MIN_SESSIONS_FOR_RANK) {
      levelByBow[bow] = levelForHandicap(current, bow, levelByBow[bow]);
    }
    changed = true;
  }
  if (!changed && !worldsChanged) return null;
  // Tylko teren/IFAA: dopisujemy wyłącznie ich pola — ranga WA zostaje nietknięta.
  if (!changed) return { rankWorlds: worlds, rankVersion: RANK_VERSION };
  const result = rankFromStored({ hcByBow, levelByBow, bestLevel: prev?.bestLevel });
  return {
    hcByBow,
    levelByBow,
    bestLevel: result.bestLevel,
    // Denormalizacja dla innych ekranów (World, lobby, profil publiczny).
    level: result.level,
    rankName: result.rankName,
    rankColor: result.color,
    rankBorder: result.border,
    rankTextColor: result.textColor,
    currentHandicap: result.handicap,
    ...(worldsChanged || prev?.rankWorlds ? { rankWorlds: worlds } : {}),
    rankVersion: RANK_VERSION,
  };
}

/** localStorage: awans z ostatniego zapisu, czeka na pokazanie na Home. */
export const RANK_UP_KEY = 'grotX_rankUp';

/** Ile ostatnich sesji porównuje trend (dla trenera). */
export const TREND_SESSIONS = 3;

/**
 * Kierunek formy: handicap teraz kontra handicap bez ostatnich TREND_SESSIONS
 * sesji tego łuku. Słowa zamiast liczb — trener nie czytał „HC 34 → 30”
 * (decyzja usera 2026-09-10). Zmiana < 2 HC to zwykły rozrzut.
 */
export function rankTrend(d: StoredRank | null | undefined): 'up' | 'down' | 'flat' | null {
  const r = rankFromStored(d);
  if (!r.bow || r.handicap === null) return null;
  const older = (d?.hcByBow?.[r.bow] || []).slice(TREND_SESSIONS);
  if (older.length < MIN_SESSIONS_FOR_RANK) return null;
  const before = calculateCurrentHandicap(older);
  if (before === null) return null;
  const diff = before - r.handicap; // dodatni = handicap spadł = lepiej
  return diff >= 2 ? 'up' : diff <= -2 ? 'down' : 'flat';
}

/** Awans po zapisie sesji: nowa ranga wyżej niż przed nią (albo pierwsza ranga). */
export function rankUpBetween(before: StoredRank | null | undefined, after: StoredRank, world: 'target' | RankWorld = 'target'): RankResult | null {
  // [RANGA TERENOWA] Porównujemy rangę świata tej sesji; `after` to pola po merge'u.
  const prev = rankFromStored(storedForWorld(before, world));
  const next = rankFromStored(storedForWorld({ ...(before || {}), ...after }, world));
  if (next.handicap === null) return null;
  return prev.handicap === null || next.level > prev.level ? next : null;
}

/** Wersja pól rangi — stare profile (XP) przeliczamy raz z historii sesji. */
// 3 = [RANGA TERENOWA 2026-11-09]: teren i IFAA dostają własną rangę z historii.
export const RANK_VERSION = 3;
