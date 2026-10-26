/**
 * [HARMONOGRAM] Stały trening grupy (user 2026-10-26: „trener ma regularnie
 * treningi, np. zawsze w środę o 18”). Leży przy grupie w `users/{coachId}.coachGroups`,
 * więc nie kosztuje osobnego odczytu. Terminów nie zapisujemy z wyprzedzeniem —
 * liczymy je z szablonu w locie (dziś, następne, poprzedni).
 *
 * Grupa może mieć kilka terminów w tygodniu o różnych godzinach (user
 * 2026-10-26: „sobota 12, środa 18”) — stąd lista `slots`. Pierwsza wersja
 * zapisywała `days` + jedną `time`; `normalizeSchedule` przerabia ją w locie.
 *
 * Potwierdzanie obecności przez uczniów — później (decyzja usera: „najpierw
 * taką możliwość daj”).
 */
export interface ScheduleSlot {
  /** Dzień tygodnia jak Date.getDay(): 0 = niedziela … 6 = sobota. */
  day: number;
  /** „HH:MM”. */
  time: string;
}

export interface GroupSchedule {
  slots: ScheduleSlot[];
  /** Co ile tygodni: 1 = co tydzień, 2 = co drugi tydzień. */
  every: 1 | 2;
  /** Dzień (YYYY-MM-DD) w tygodniu, od którego liczy się „co drugi tydzień”. */
  anchor: string;
  place?: string;
}

export interface Occurrence {
  date: string;
  time: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const TIME_RE = /^\d{1,2}:\d{2}$/;

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

/** Kolejność od poniedziałku: pn=0 … nd=6. */
const weekPos = (day: number) => (day + 6) % 7;

/** Zapis z bazy (także stary format days+time) → aktualny kształt albo null. */
export function normalizeSchedule(raw: unknown): GroupSchedule | null {
  const x = raw as Partial<GroupSchedule> & { days?: number[]; time?: string };
  if (!x || (x.every !== 1 && x.every !== 2) || !/^\d{4}-\d{2}-\d{2}$/.test(x.anchor || '')) return null;
  const slots: ScheduleSlot[] = Array.isArray(x.slots)
    ? x.slots
    : Array.isArray(x.days) && x.time ? x.days.map(day => ({ day, time: x.time as string })) : [];
  const clean = sortSlots(slots.filter(s => Number.isInteger(s?.day) && s.day >= 0 && s.day <= 6 && TIME_RE.test(s.time || '')));
  if (clean.length === 0) return null;
  return { slots: clean, every: x.every, anchor: x.anchor as string, ...(x.place ? { place: x.place } : {}) };
}

export function isValidSchedule(s: unknown): s is GroupSchedule {
  return normalizeSchedule(s) !== null;
}

/** Od poniedziałku, w ramach dnia po godzinie; bez duplikatów. */
export function sortSlots(slots: ScheduleSlot[]): ScheduleSlot[] {
  const seen = new Set<string>();
  return slots
    .map(s => ({ day: s.day, time: s.time.padStart(5, '0') }))
    .filter(s => { const k = `${s.day}|${s.time}`; if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((a, b) => weekPos(a.day) - weekPos(b.day) || a.time.localeCompare(b.time));
}

/** Godziny treningów tego dnia (posortowane), pusta lista = brak treningu. */
export function timesOn(raw: unknown, dayKey: string): string[] {
  const s = normalizeSchedule(raw);
  if (!s) return [];
  if (s.every === 2) {
    const weeks = Math.round((mondayOf(dayKey).getTime() - mondayOf(s.anchor).getTime()) / (7 * DAY_MS));
    if (weeks % 2 !== 0) return [];
  }
  const day = noon(dayKey).getDay();
  return s.slots.filter(x => x.day === day).map(x => x.time);
}

export function occursOn(raw: unknown, dayKey: string): boolean {
  return timesOn(raw, dayKey).length > 0;
}

/** Kolejne treningi od `fromDayKey` włącznie (najwyżej `count`, w oknie `maxDays`). */
export function upcomingOccurrences(raw: unknown, fromDayKey: string, count = 2, maxDays = 35): Occurrence[] {
  const out: Occurrence[] = [];
  const d = noon(fromDayKey);
  for (let i = 0; i < maxDays && out.length < count; i++) {
    const date = dayKeyOfDate(d);
    for (const time of timesOn(raw, date)) if (out.length < count) out.push({ date, time });
    d.setDate(d.getDate() + 1);
  }
  return out;
}

/** Najbliższy dzień treningu od `fromDayKey` włącznie. */
export function nextOccurrence(raw: unknown, fromDayKey: string, maxDays = 28): string | null {
  return upcomingOccurrences(raw, fromDayKey, 1, maxDays)[0]?.date ?? null;
}

/** Ostatni dzień treningu przed `beforeDayKey` (bez niego). */
export function prevOccurrence(raw: unknown, beforeDayKey: string, maxDays = 28): string | null {
  const d = noon(beforeDayKey);
  for (let i = 0; i < maxDays; i++) {
    d.setDate(d.getDate() - 1);
    const key = dayKeyOfDate(d);
    if (occursOn(raw, key)) return key;
  }
  return null;
}
