// [KARTA UCZNIA] Szybki obraz ucznia dla trenera (user 2026-09-18): ile
// trenuje, jak strzela i co go boli — liczone na miejscu z sesji z ostatnich
// 28 dni i licznika strzał (`pfeilzaehler`) z profilu. Bez UI i bez Firestore,
// żeby dało się to sprawdzić na surowych danych.

export const SNAPSHOT_DAYS = 14;
const DAY = 24 * 60 * 60 * 1000;

export type DayKind = 'score' | 'practice' | 'none';

export interface SnapSession {
  id: string;
  ts: number;
  type?: string;               // 'TECHNICAL' = trening techniczny
  score?: number;
  scoreArrows?: number;
  arrows?: number;
  totalArrows?: number;
  distance?: string;
  distanceLabel?: string;
  ends?: { arrows?: string[]; total_sum?: number }[];
  note?: string;
  isNotePublic?: boolean;
  coachNote?: string;
  coachEditCount?: number;
  coachSeenAt?: unknown;       // trener odhaczył notatkę bez odpowiedzi
  coachTopics?: string[];
  date?: string;
}

export interface StudentSnapshot {
  days: DayKind[];             // 14 dni, najstarszy pierwszy, dziś ostatni
  dayCounts: number[];         // ile treningów danego dnia (cyfra w kwadracie przy 2+)
  fromTs: number;              // początek pierwszego dnia paska
  sessions: number;            // treningi (z wynikiem + techniczne) w 14 dniach
  sessionsPrev: number;        // to samo w poprzednich 14 dniach
  arrows: number;              // strzały (sesje + licznik) w 14 dniach
  arrowsPrev: number;
  distance: string | null;     // główny dystans (najczęstszy z wynikiem)
  distanceLabel: string | null;
  // Do 5 ostatnich treningów na głównym dystansie, najstarszy pierwszy. Wykres
  // idzie po średniej na strzałę — suma 36 i 72 strzał nie jest porównywalna
  // (user 2026-09-18: 173 obok 541 wyglądało jak skok formy).
  recent: { score: number; arrows: number; avg: number }[];
  avgArrow: number | null;     // średnia na strzałę, 14 dni, główny dystans
  avgArrowPrev: number | null;
  gold: number;                // strzały X/10/9 w ostatnich 3 treningach na głównym dystansie
  goldOf: number;              // wszystkie strzały z tych treningów (0 = brak serii)
  misses: number;              // pudła (M) w tych samych treningach
  roundDiff: number | null;    // śr. (runda 2 − runda 1) z ostatnich 3 pełnych treningów
  roundN: number;              // z ilu treningów liczona roundDiff
  endRange: [number, number] | null; // najsłabsza i najlepsza seria ostatniego treningu
  note: SnapSession | null;    // ostatnia notatka udostępniona trenerowi
}

const isTech = (s: SnapSession) => s.type === 'TECHNICAL' || s.distance === 'TECH';
const hasScore = (s: SnapSession) => !isTech(s) && (s.score || 0) > 0;

function dayStart(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Klucz licznika strzał — ten sam format co SessionSetup (`2026_09_18`). */
function counterKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}_${String(d.getMonth() + 1).padStart(2, '0')}_${String(d.getDate()).padStart(2, '0')}`;
}

const arrowValue = (a: string) => (a === 'X' ? 10 : a === 'M' ? 0 : Number(a) || 0);

function sessionArrows(s: SnapSession): number {
  if (isTech(s)) return s.totalArrows || s.arrows || 0;
  return s.arrows || s.scoreArrows || 0;
}

export function buildSnapshot(sessionsIn: SnapSession[], counter: Record<string, number> | undefined, now = Date.now()): StudentSnapshot {
  const sessions = [...sessionsIn].sort((a, b) => a.ts - b.ts);
  const today = dayStart(now);
  const from = today - (SNAPSHOT_DAYS - 1) * DAY;          // początek bieżących 14 dni
  const prevFrom = from - SNAPSHOT_DAYS * DAY;

  const cur = sessions.filter(s => s.ts >= from);
  const prev = sessions.filter(s => s.ts >= prevFrom && s.ts < from);

  // Pasek dni: wynik wygrywa z treningiem technicznym i samym licznikiem.
  const inDayOf = (i: number) => cur.filter(s => s.ts >= from + i * DAY && s.ts < from + (i + 1) * DAY);
  const dayCounts = Array.from({ length: SNAPSHOT_DAYS }, (_, i) => inDayOf(i).length);
  const days: DayKind[] = Array.from({ length: SNAPSHOT_DAYS }, (_, i) => {
    const d0 = from + i * DAY;
    const inDay = inDayOf(i);
    if (inDay.some(hasScore)) return 'score';
    if (inDay.length > 0 || (counter?.[counterKey(d0)] || 0) > 0) return 'practice';
    return 'none';
  });

  const counterSum = (start: number) => {
    let n = 0;
    for (let i = 0; i < SNAPSHOT_DAYS; i++) n += counter?.[counterKey(start + i * DAY)] || 0;
    return n;
  };
  const arrows = cur.reduce((n, s) => n + sessionArrows(s), 0) + counterSum(from);
  const arrowsPrev = prev.reduce((n, s) => n + sessionArrows(s), 0) + counterSum(prevFrom);

  // Główny dystans: najczęstszy z wynikiem w całym oknie 28 dni.
  const scored = sessions.filter(hasScore);
  const freq = new Map<string, number>();
  scored.forEach(s => s.distance && freq.set(s.distance, (freq.get(s.distance) || 0) + 1));
  const distance = [...freq.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const onDist = scored.filter(s => s.distance === distance);
  const distanceLabel = onDist.length ? (onDist[onDist.length - 1].distanceLabel || distance) : null;

  const avg = (list: SnapSession[]) => {
    const pts = list.reduce((n, s) => n + (s.score || 0), 0);
    const arr = list.reduce((n, s) => n + (s.scoreArrows || 0), 0);
    return arr > 0 ? pts / arr : null;
  };

  const last3 = onDist.slice(-3);
  let gold = 0, all = 0, misses = 0;
  last3.forEach(s => (s.ends || []).forEach(e => (e.arrows || []).forEach(a => {
    all++;
    if (a === 'X' || a === '10' || a === '9') gold++;
    if (a === 'M') misses++;
  })));

  const endSum = (e: { arrows?: string[]; total_sum?: number }) =>
    typeof e.total_sum === 'number' ? e.total_sum : (e.arrows || []).reduce((n, a) => n + arrowValue(a), 0);
  const full = onDist.filter(s => (s.ends || []).length >= 12).slice(-3);
  const roundDiff = full.length
    ? full.reduce((n, s) => {
        const e = s.ends!;
        const r1 = e.slice(0, 6).reduce((m, x) => m + endSum(x), 0);
        const r2 = e.slice(6, 12).reduce((m, x) => m + endSum(x), 0);
        return n + (r2 - r1);
      }, 0) / full.length
    : null;

  const lastScored = scored[scored.length - 1];
  const sums = (lastScored?.ends || []).map(endSum);
  const endRange: [number, number] | null = sums.length >= 2 ? [Math.min(...sums), Math.max(...sums)] : null;

  const note = [...sessions].reverse().find(s => s.isNotePublic !== false && (s.note || '').trim()) ?? null;

  return {
    days,
    dayCounts,
    fromTs: from,
    sessions: cur.length,
    sessionsPrev: prev.length,
    arrows,
    arrowsPrev,
    distance,
    distanceLabel,
    recent: onDist.slice(-5).map(s => ({
      score: s.score || 0,
      arrows: s.scoreArrows || 0,
      avg: (s.scoreArrows || 0) > 0 ? (s.score || 0) / (s.scoreArrows || 1) : 0,
    })),
    avgArrow: avg(onDist.filter(s => s.ts >= from)),
    avgArrowPrev: avg(onDist.filter(s => s.ts >= prevFrom && s.ts < from)),
    gold,
    goldOf: all,
    misses,
    roundDiff: roundDiff === null ? null : Math.round(roundDiff),
    roundN: full.length,
    endRange,
    note,
  };
}
