import { EquipmentSetup, MaintenanceRule } from '../config/equipmentSetups';
import { MAINTENANCE_LEAD_DAYS, tasksForDiscipline } from '../config/maintenanceTasks';

/**
 * [WARTUNG] Czysta logika terminów konserwacji — bez Firestore, żeby dało się
 * ją testować. Zapis do kalendarza robi `maintenanceSync.ts`.
 *
 * Daty to zawsze lokalne YYYY-MM-DD (jak `date` w kalendarzu). Porównujemy je
 * jako stringi — format jest stałej długości, więc kolejność się zgadza.
 */

/** Klucz w `users/{uid}.maintenanceDone`. */
export const doneKey = (setupId: string, taskId: string) => `${setupId}__${taskId}`;

export function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function parse(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
}

/**
 * Dodaje miesiące. 31.01 + 1 → 28/29.02, a nie 03.03 — przypomnienie
 * „co miesiąc” nie może przeskoczyć całego miesiąca.
 */
export function addMonths(dateStr: string, months: number): string {
  const d = parse(dateStr);
  const day = d.getDate();
  const target = new Date(d.getFullYear(), d.getMonth() + months, 1, 12);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(day, lastDay));
  return localDateStr(target);
}

export function addDays(dateStr: string, days: number): string {
  const d = parse(dateStr);
  d.setDate(d.getDate() + days);
  return localDateStr(d);
}

/**
 * Następny termin. Liczony od dnia WYKONANIA (ustalone z userem 2026-10-30),
 * ale nigdy wcześniej niż `start` — przesunięcie daty startu w ustawieniach
 * odsuwa też termin wynikający z wykonania.
 */
export function nextDue(rule: MaintenanceRule, lastDone?: string | null): string {
  if (!lastDone) return rule.start;
  const fromDone = addMonths(lastDone, rule.every);
  return fromDone > rule.start ? fromDone : rule.start;
}

/** Od kiedy przypomnienie widać w kalendarzu. */
export const visibleFrom = (due: string) => addDays(due, -MAINTENANCE_LEAD_DAYS);

export interface DueReminder {
  /** Stałe id dokumentu kalendarza — ten sam termin z dwóch urządzeń to jeden wpis. */
  docId: string;
  setupId: string;
  setupName: string;
  taskId: string;
  due: string;
}

/**
 * Id wpisu w `users/{uid}/tournaments`. Z terminem w środku: po „erledigt”
 * następny termin dostaje NOWE id, a zrobiony wpis zostaje w archiwum.
 */
export const reminderDocId = (setupId: string, taskId: string, due: string) =>
  `mnt_${setupId}_${taskId}_${due}`;

/**
 * Przypomnienia, które dziś powinny wisieć w kalendarzu.
 * Czynność spoza dyscypliny zestawu (np. po zmianie łuku na dmuchawkę) nie
 * przypomina, nawet jeśli jej reguła została zapisana wcześniej.
 */
export function dueReminders(
  setups: EquipmentSetup[],
  done: Record<string, string> | null | undefined,
  today: string,
): DueReminder[] {
  const out: DueReminder[] = [];
  for (const setup of setups || []) {
    const rules = setup.maintenance;
    if (!rules) continue;
    for (const task of tasksForDiscipline(setup.discipline)) {
      const rule = rules[task.id];
      if (!rule?.on || !rule.start || !(rule.every > 0)) continue;
      const due = nextDue(rule, done?.[doneKey(setup.id, task.id)]);
      if (today < visibleFrom(due)) continue;
      out.push({
        docId: reminderDocId(setup.id, task.id, due),
        setupId: setup.id,
        setupName: setup.name,
        taskId: task.id,
        due,
      });
    }
  }
  return out;
}
