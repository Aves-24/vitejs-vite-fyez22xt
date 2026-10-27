/**
 * [HARMONOGRAM] Stały trening grupy (user 2026-10-26: „trener ma regularnie
 * treningi, np. zawsze w środę o 18”). Leży przy grupie w `groups/{groupId}.schedule`,
 * więc nie kosztuje osobnego odczytu. Terminów nie zapisujemy z wyprzedzeniem —
 * liczymy je z szablonu w locie (dziś, następne, poprzedni).
 *
 * Grupa może mieć kilka terminów w tygodniu o różnych godzinach i w różnych
 * miejscach (user 2026-10-26: „sobota 12, środa 18”) — stąd lista `slots`.
 * Pierwsza wersja zapisywała `days` + jedną `time`; `normalizeSchedule`
 * przerabia ją w locie.
 *
 * Pojedynczy trening można odwołać (`cancelled`), a ferie wpisać jako przerwę
 * (`breaks`). Potwierdzanie obecności przez uczniów — później.
 */
export interface ScheduleSlot {
  /** Dzień tygodnia jak Date.getDay(): 0 = niedziela … 6 = sobota. */
  day: number;
  /** „HH:MM”. */
  time: string;
  /** Miejsce tego terminu — w różne dni bywa inne (user 2026-10-26). */
  place?: string;
}

export interface ScheduleBreak {
  /** Od–do włącznie, YYYY-MM-DD. */
  from: string;
  to: string;
  note?: string;
}

export interface GroupSchedule {
  slots: ScheduleSlot[];
  /** Co ile tygodni: 1 = co tydzień, 2 = co drugi tydzień. */
  every: 1 | 2;
  /** Dzień (YYYY-MM-DD) w tygodniu, od którego liczy się „co drugi tydzień”. */
  anchor: string;
  /** Tylko w starych zapisach: jedno miejsce dla całej grupy (przenoszone do terminów). */
  place?: string;
  /** Odwołane pojedyncze treningi: klucz occurrenceKey → powód (może być pusty). */
  cancelled?: Record<string, string>;
  /** Przerwy, np. ferie. */
  breaks?: ScheduleBreak[];
}

export interface Occurrence {
  date: string;
  time: string;
  place?: string;
  /** Tylko w listOccurrences: trening odwołany (pojedynczo albo przerwą). */
  cancelled?: boolean;
  /** Powód odwołania albo opis przerwy. */
  note?: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const TIME_RE = /^\d{1,2}:\d{2}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** „YYYY-MM-DD HH:MM” — klucz jednego treningu z planu. */
export const occurrenceKey = (date: string, time: string) => `${date} ${time}`;

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
  if (!x || (x.every !== 1 && x.every !== 2) || !DATE_RE.test(x.anchor || '')) return null;
  const slots: ScheduleSlot[] = Array.isArray(x.slots)
    ? x.slots
    : Array.isArray(x.days) && x.time ? x.days.map(day => ({ day, time: x.time as string })) : [];
  const clean = sortSlots(slots
    .filter(s => Number.isInteger(s?.day) && s.day >= 0 && s.day <= 6 && TIME_RE.test(s.time || ''))
    .map(s => ({ ...s, place: (s.place || x.place || '').trim() || undefined })));
  if (clean.length === 0) return null;
  const cancelled = x.cancelled && typeof x.cancelled === 'object' ? x.cancelled : undefined;
  const breaks = Array.isArray(x.breaks)
    ? x.breaks.filter(b => DATE_RE.test(b?.from || '') && DATE_RE.test(b?.to || '') && b.from <= b.to)
    : [];
  return {
    slots: clean, every: x.every, anchor: x.anchor as string,
    ...(cancelled && Object.keys(cancelled).length ? { cancelled } : {}),
    ...(breaks.length ? { breaks } : {}),
  };
}

export function isValidSchedule(s: unknown): s is GroupSchedule {
  return normalizeSchedule(s) !== null;
}

/** Od poniedziałku, w ramach dnia po godzinie; bez duplikatów. */
export function sortSlots(slots: ScheduleSlot[]): ScheduleSlot[] {
  const seen = new Set<string>();
  return slots
    .map(s => ({ day: s.day, time: s.time.padStart(5, '0'), ...(s.place ? { place: s.place } : {}) }))
    .filter(s => { const k = `${s.day}|${s.time}`; if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((a, b) => weekPos(a.day) - weekPos(b.day) || a.time.localeCompare(b.time));
}

/** Wszystkie treningi z planu tego dnia (po godzinie), odwołane oznaczone. */
function planOn(s: GroupSchedule, dayKey: string): Occurrence[] {
  if (s.every === 2) {
    const weeks = Math.round((mondayOf(dayKey).getTime() - mondayOf(s.anchor).getTime()) / (7 * DAY_MS));
    if (weeks % 2 !== 0) return [];
  }
  const day = noon(dayKey).getDay();
  const brk = (s.breaks || []).find(b => b.from <= dayKey && dayKey <= b.to);
  return s.slots.filter(x => x.day === day).map(x => {
    const key = occurrenceKey(dayKey, x.time);
    const single = !!s.cancelled && key in s.cancelled;
    const note = single ? s.cancelled![key] : brk?.note;
    return {
      date: dayKey, time: x.time,
      ...(x.place ? { place: x.place } : {}),
      ...(single || brk ? { cancelled: true, ...(note ? { note } : {}) } : {}),
    };
  });
}

/** Treningi, które się odbywają (bez odwołanych). */
function slotsOn(raw: unknown, dayKey: string): Occurrence[] {
  const s = normalizeSchedule(raw);
  return s ? planOn(s, dayKey).filter(o => !o.cancelled) : [];
}

/** Godziny treningów tego dnia (posortowane), pusta lista = brak treningu. */
export function timesOn(raw: unknown, dayKey: string): string[] {
  return slotsOn(raw, dayKey).map(x => x.time);
}

export function occursOn(raw: unknown, dayKey: string): boolean {
  return timesOn(raw, dayKey).length > 0;
}

/** Kolejne treningi od `fromDayKey` włącznie (najwyżej `count`, w oknie `maxDays`). */
export function upcomingOccurrences(raw: unknown, fromDayKey: string, count = 2, maxDays = 35): Occurrence[] {
  const out: Occurrence[] = [];
  const d = noon(fromDayKey);
  for (let i = 0; i < maxDays && out.length < count; i++) {
    for (const x of slotsOn(raw, dayKeyOfDate(d))) if (out.length < count) out.push(x);
    d.setDate(d.getDate() + 1);
  }
  return out;
}

/** Lista do zakładki Termine: dni [from, to), odwołane włącznie (oznaczone). */
export function listOccurrences(raw: unknown, fromDayKey: string, toDayKeyExclusive: string): Occurrence[] {
  const s = normalizeSchedule(raw);
  if (!s) return [];
  const out: Occurrence[] = [];
  const d = noon(fromDayKey);
  for (let i = 0; i < 400; i++) {
    const date = dayKeyOfDate(d);
    if (date >= toDayKeyExclusive) break;
    out.push(...planOn(s, date));
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

/**
 * Do zapisu w Firestore: bez pól undefined (Firestore ich nie przyjmuje)
 * i bez odwołań/przerw starszych niż 60 dni, żeby lista nie rosła bez końca.
 */
export function scheduleForSave(s: GroupSchedule, todayKey: string): GroupSchedule {
  const cutoff = dayKeyOfDate(new Date(noon(todayKey).getTime() - 60 * DAY_MS));
  const cancelled = Object.fromEntries(Object.entries(s.cancelled || {}).filter(([k]) => k.slice(0, 10) >= cutoff));
  const breaks = (s.breaks || []).filter(b => b.to >= cutoff).map(b => ({ from: b.from, to: b.to, ...(b.note ? { note: b.note } : {}) }));
  return {
    slots: s.slots.map(x => ({ day: x.day, time: x.time, ...(x.place ? { place: x.place } : {}) })),
    every: s.every, anchor: s.anchor,
    ...(Object.keys(cancelled).length ? { cancelled } : {}),
    ...(breaks.length ? { breaks } : {}),
  };
}
