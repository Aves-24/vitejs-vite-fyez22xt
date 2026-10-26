/**
 * [HARMONOGRAM] Stały trening grupy (user 2026-10-26: „trener ma regularnie
 * treningi, np. zawsze w środę o 18”). Leży przy grupie w `users/{coachId}.coachGroups`,
 * więc nie kosztuje osobnego odczytu. Terminów nie zapisujemy z wyprzedzeniem —
 * liczymy je z szablonu w locie (dziś, następny, poprzedni).
 *
 * Potwierdzanie obecności przez uczniów — później (decyzja usera: „najpierw
 * taką możliwość daj”).
 */
export interface GroupSchedule {
  /** Dni tygodnia jak Date.getDay(): 0 = niedziela … 6 = sobota. */
  days: number[];
  /** „HH:MM”. */
  time: string;
  /** Co ile tygodni: 1 = co tydzień, 2 = co drugi tydzień. */
  every: 1 | 2;
  /** Dzień (YYYY-MM-DD) w tygodniu, od którego liczy się „co drugi tydzień”. */
  anchor: string;
  place?: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Południe danego dnia — odporne na zmianę czasu letniego. */
const noon = (dayKey: string) => new Date(`${dayKey}T12:00:00`);

export function dayKeyOfDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Poniedziałek tygodnia, w którym leży dzień (jako południe). */
function mondayOf(dayKey: string): Date {
  const d = noon(dayKey);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

export function isValidSchedule(s: unknown): s is GroupSchedule {
  const x = s as GroupSchedule;
  return !!x && Array.isArray(x.days) && x.days.length > 0
    && /^\d{1,2}:\d{2}$/.test(x.time || '') && (x.every === 1 || x.every === 2)
    && /^\d{4}-\d{2}-\d{2}$/.test(x.anchor || '');
}

export function occursOn(s: GroupSchedule, dayKey: string): boolean {
  if (!isValidSchedule(s)) return false;
  if (!s.days.includes(noon(dayKey).getDay())) return false;
  if (s.every === 1) return true;
  const weeks = Math.round((mondayOf(dayKey).getTime() - mondayOf(s.anchor).getTime()) / (7 * DAY_MS));
  return weeks % 2 === 0;
}

function walk(s: GroupSchedule, fromDayKey: string, step: 1 | -1, maxDays: number): string | null {
  const d = noon(fromDayKey);
  for (let i = 0; i < maxDays; i++) {
    const key = dayKeyOfDate(d);
    if (occursOn(s, key)) return key;
    d.setDate(d.getDate() + step);
  }
  return null;
}

/** Najbliższy dzień treningu od `fromDayKey` włącznie. */
export function nextOccurrence(s: GroupSchedule, fromDayKey: string, maxDays = 28): string | null {
  return walk(s, fromDayKey, 1, maxDays);
}

/** Ostatni dzień treningu przed `beforeDayKey` (bez niego). */
export function prevOccurrence(s: GroupSchedule, beforeDayKey: string, maxDays = 28): string | null {
  const d = noon(beforeDayKey);
  d.setDate(d.getDate() - 1);
  return walk(s, dayKeyOfDate(d), -1, maxDays);
}

/** Dni w kolejności tygodnia od poniedziałku (do wyświetlania). */
export function sortedDays(days: number[]): number[] {
  return [...new Set(days)].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
}
