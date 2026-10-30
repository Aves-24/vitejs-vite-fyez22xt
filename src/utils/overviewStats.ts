// [PRO PROGRESS — ÜBERBLICK 2026-10-30] Liczby niezależne od dystansu:
// rytm treningów w miesiącach, tematy treningów technicznych, strzały na
// tydzień (z punktacją + technika) i przebieg handicapu. Czyste funkcje —
// liczone z już wczytanych sesji, bez dodatkowych odczytów Firestore.
import { calculateCurrentHandicap } from './handicapEngine';
import { handicapOfSession, rankBowOf, HANDICAP_WINDOW, type RankBow } from './rankEngine';

export const sessionMs = (s: any): number => {
  const ts = s?.timestamp;
  if (!ts) return 0;
  if (typeof ts === 'number') return ts;
  if (typeof ts.toMillis === 'function') return ts.toMillis();
  if (ts.seconds) return ts.seconds * 1000;
  return 0;
};

const isTech = (s: any) => s.type === 'TECHNICAL' || s.distance === 'TECH';
const arrowsOf = (s: any) => Number(isTech(s) ? (s.totalArrows ?? s.arrows) : s.arrows) || 0;

export interface MonthRhythm {
  key: string;      // 'YYYY-MM'
  year: number;
  month: number;    // 0–11
  scored: number;   // treningi z punktacją (bez zawodów)
  tech: number;
  tourney: number;
}

/** Ostatnie `months` miesięcy kalendarzowych (najstarszy pierwszy). */
export function monthlyRhythm(sessions: any[], months: number, now: number = Date.now()): MonthRhythm[] {
  const d = new Date(now);
  const out: MonthRhythm[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const m = new Date(d.getFullYear(), d.getMonth() - i, 1);
    out.push({ key: `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`, year: m.getFullYear(), month: m.getMonth(), scored: 0, tech: 0, tourney: 0 });
  }
  const byKey = new Map(out.map(m => [m.key, m]));
  for (const s of sessions) {
    const ms = sessionMs(s);
    if (!ms) continue;
    const t = new Date(ms);
    const row = byKey.get(`${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}`);
    if (!row) continue;
    if (isTech(s)) row.tech++;
    else if (s.type === 'Turniej') row.tourney++;
    else row.scored++;
  }
  return out;
}

export interface TechTopics {
  count: number;          // treningi techniczne w okresie
  arrows: number;
  focus: number;          // ile z nich pod fokus
  mirror: number;         // ile z Delay Mirror
  topics: { id: string; count: number }[];   // od najczęstszego
}

export function techTopics(sessions: any[], sinceMs: number): TechTopics {
  const counts = new Map<string, number>();
  let count = 0, arrows = 0, focus = 0, mirror = 0;
  for (const s of sessions) {
    if (!isTech(s) || sessionMs(s) < sinceMs) continue;
    count++;
    arrows += arrowsOf(s);
    if (s.focus && (s.focus.text || s.focus.topic)) focus++;
    if (s.source === 'DELAY_MIRROR') mirror++;
    for (const id of new Set<string>(Array.isArray(s.topics) ? s.topics : [])) counts.set(id, (counts.get(id) || 0) + 1);
  }
  const topics = [...counts.entries()].map(([id, c]) => ({ id, count: c })).sort((a, b) => b.count - a.count);
  return { count, arrows, focus, mirror, topics };
}

export interface WeekArrows { scored: number; tech: number }

/** 12 tygodni (najstarszy pierwszy): strzały z punktacją i techniczne osobno. */
export function weeklyArrowsSplit(sessions: any[], now: number = Date.now()): WeekArrows[] {
  const weeks: WeekArrows[] = Array.from({ length: 12 }, () => ({ scored: 0, tech: 0 }));
  for (const s of sessions) {
    const ms = sessionMs(s);
    if (!ms) continue;
    const w = Math.floor(Math.max(0, now - ms) / (7 * 86400000));
    if (w >= 12) continue;
    const row = weeks[11 - w];
    if (isTech(s)) row.tech += arrowsOf(s); else row.scored += arrowsOf(s);
  }
  return weeks;
}

export interface HandicapPoint {
  ts: number;
  date: string;
  hc: number;        // handicap tego treningu
  current: number;   // handicap „aktualny” po tym treningu (jak ranga: lepsze 60% z ostatnich 10)
}

/**
 * Przebieg handicapu dla jednego łuku (najstarszy pierwszy). Treningi, które
 * nie liczą się do rangi (technika, dmuchawka, Field, bez strzał), odpadają.
 */
export function handicapSeries(sessions: any[], bow: RankBow, fallbackBowClass?: string | null): HandicapPoint[] {
  const sorted = [...sessions].filter(s => !isTech(s)).sort((a, b) => sessionMs(a) - sessionMs(b));
  const window: number[] = [];
  const out: HandicapPoint[] = [];
  for (const s of sorted) {
    const bowClass = s.bowClass ?? fallbackBowClass ?? null;
    if (rankBowOf(bowClass) !== bow) continue;
    const hc = handicapOfSession({
      score: Number(s.score) || 0,
      scoreArrows: Number(s.scoreArrows ?? s.arrows) || 0,
      distance: s.distance,
      targetType: s.targetType,
      bowClass,
    });
    if (hc === null) continue;
    window.unshift(hc);
    if (window.length > HANDICAP_WINDOW) window.pop();
    const current = calculateCurrentHandicap(window);
    if (current === null) continue;
    out.push({ ts: sessionMs(s), date: s.date || '', hc, current });
  }
  return out;
}
