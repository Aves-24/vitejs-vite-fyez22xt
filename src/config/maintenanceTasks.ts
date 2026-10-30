import { BLOWGUN_DISCIPLINE, Discipline } from './equipmentSetups';

/**
 * [WARTUNG] Katalog czynności konserwacji sprzętu (2026-10-30).
 *
 * Lista z researchu w WARTUNG_PLAN.md, zaakceptowana przez usera. Teksty
 * (tytuł + (i): po co / jak / uwaga / wskazówka) leżą w tłumaczeniach pod
 * `maintenance.tasks.<id>.*` — tu tylko to, czego tłumaczenie nie zna:
 * dla jakich dyscyplin czynność ma sens i jaki rytm proponujemy.
 *
 * Tekst może mieć wariant dyscypliny: `how_compound`, `warn_trad` itd.
 * (patrz `maintenanceTextKey`). Dzięki temu „woskuj cięciwę” dla compoundu
 * mówi też o kablach, bez osobnej czynności z osobnym przypomnieniem.
 */

/** Krótki klucz dyscypliny do wariantów tekstu. */
export type DisciplineKey = 'recurve' | 'compound' | 'barebow' | 'trad' | 'blowgun';

export function disciplineKey(d?: string | null): DisciplineKey {
  switch (d) {
    case 'Bloczkowy (Compound)': return 'compound';
    case 'Goły (Barebow)': return 'barebow';
    case 'Tradycyjny': return 'trad';
    case BLOWGUN_DISCIPLINE: return 'blowgun';
    default: return 'recurve';
  }
}

export interface MaintenanceTask {
  id: string;
  /** Dla jakich dyscyplin czynność w ogóle widać. */
  for: DisciplineKey[];
  /** Proponowany rytm w miesiącach — user zmienia go dowolnie. */
  every: number;
}

const BOWS: DisciplineKey[] = ['recurve', 'compound', 'barebow', 'trad'];

/** Kolejność = kolejność w zakładce WARTUNG (od najczęstszych). */
export const MAINTENANCE_TASKS: MaintenanceTask[] = [
  { id: 'stringWax', for: BOWS, every: 1 },
  { id: 'stringCheck', for: BOWS, every: 1 },
  { id: 'peep', for: ['compound'], every: 1 },
  { id: 'braceTiller', for: ['recurve', 'barebow', 'trad'], every: 1 },
  { id: 'limbBolts', for: BOWS, every: 1 },
  { id: 'sight', for: ['recurve', 'compound'], every: 1 },
  { id: 'stabilizers', for: ['recurve', 'compound', 'barebow'], every: 1 },
  { id: 'arrows', for: BOWS, every: 1 },
  { id: 'nockingPoint', for: BOWS, every: 2 },
  { id: 'limbsCheck', for: BOWS, every: 2 },
  { id: 'restButton', for: ['recurve', 'compound', 'barebow'], every: 2 },
  { id: 'clicker', for: ['recurve'], every: 2 },
  { id: 'tab', for: ['recurve', 'barebow', 'trad'], every: 2 },
  { id: 'dLoop', for: ['compound'], every: 2 },
  { id: 'release', for: ['compound'], every: 2 },
  { id: 'timing', for: ['compound'], every: 3 },
  { id: 'cams', for: ['compound'], every: 3 },
  { id: 'gripShelf', for: ['trad'], every: 3 },
  { id: 'woodCare', for: ['trad'], every: 6 },
  { id: 'boreClean', for: ['blowgun'], every: 1 },
  { id: 'mouthpiece', for: ['blowgun'], every: 1 },
  { id: 'darts', for: ['blowgun'], every: 1 },
  { id: 'joints', for: ['blowgun'], every: 3 },
  { id: 'spares', for: [...BOWS, 'blowgun'], every: 6 },
  { id: 'stringReplace', for: BOWS, every: 12 },
  { id: 'proService', for: BOWS, every: 12 },
];

/** Rytmy do wyboru (w miesiącach). */
export const MAINTENANCE_INTERVALS = [1, 2, 3, 4, 6, 12] as const;

/** Ile dni przed terminem przypomnienie pojawia się w kalendarzu (ustalone z userem). */
export const MAINTENANCE_LEAD_DAYS = 21;

export function tasksForDiscipline(d?: string | null): MaintenanceTask[] {
  const key = disciplineKey(d);
  return MAINTENANCE_TASKS.filter(task => task.for.includes(key));
}

export function findMaintenanceTask(id: string): MaintenanceTask | undefined {
  return MAINTENANCE_TASKS.find(task => task.id === id);
}

/** Części tekstu (i). `title` jest zawsze, reszta tylko gdy klucz istnieje. */
export type MaintenanceTextPart = 'title' | 'why' | 'how' | 'warn' | 'tip';

/**
 * Klucz tłumaczenia z wariantem dyscypliny, jeśli istnieje
 * (`how_compound` wygrywa z `how`).
 */
export function maintenanceTextKey(
  taskId: string,
  part: MaintenanceTextPart,
  discipline: string | null | undefined,
  exists: (key: string) => boolean,
): string {
  const base = `maintenance.tasks.${taskId}.${part}`;
  const variant = `${base}_${disciplineKey(discipline)}`;
  return exists(variant) ? variant : base;
}
