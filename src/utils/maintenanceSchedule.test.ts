import { describe, it, expect } from 'vitest';
import { addMonths, nextDue, dueReminders, reminderDocId, doneKey } from './maintenanceSchedule';
import { EquipmentSetup } from '../config/equipmentSetups';

const recurve = (maintenance: EquipmentSetup['maintenance']): EquipmentSetup => ({
  id: 'default',
  name: 'Recurve',
  discipline: 'Klasyczny (Recurve)',
  maintenance,
});

describe('addMonths', () => {
  it('dodaje miesiące', () => {
    expect(addMonths('2026-11-15', 1)).toBe('2026-12-15');
    expect(addMonths('2026-11-15', 2)).toBe('2027-01-15');
  });
  it('koniec miesiąca nie przeskakuje miesiąca', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29');
  });
});

describe('nextDue', () => {
  const rule = { on: true, start: '2026-11-01', every: 1 };
  it('bez wykonania = data startu', () => {
    expect(nextDue(rule)).toBe('2026-11-01');
  });
  it('od dnia wykonania, nie od planu', () => {
    expect(nextDue(rule, '2026-11-10')).toBe('2026-12-10');
  });
  it('nigdy przed datą startu', () => {
    expect(nextDue({ ...rule, start: '2027-03-01' }, '2026-11-10')).toBe('2027-03-01');
  });
});

describe('dueReminders', () => {
  const setups = [recurve({ stringWax: { on: true, start: '2026-12-01', every: 1 } })];

  it('pojawia się dopiero 21 dni przed terminem', () => {
    expect(dueReminders(setups, {}, '2026-11-09')).toHaveLength(0);
    const r = dueReminders(setups, {}, '2026-11-10');
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ taskId: 'stringWax', due: '2026-12-01', docId: reminderDocId('default', 'stringWax', '2026-12-01') });
  });

  it('wisi dalej po terminie, dopóki nie zrobione', () => {
    expect(dueReminders(setups, {}, '2027-02-01')).toHaveLength(1);
  });

  it('po wykonaniu znika do następnego okna', () => {
    const done = { [doneKey('default', 'stringWax')]: '2026-12-03' };
    expect(dueReminders(setups, done, '2026-12-03')).toHaveLength(0);
    expect(dueReminders(setups, done, '2026-12-13')[0].due).toBe('2027-01-03');
  });

  it('wyłączona czynność nie przypomina', () => {
    const off = [recurve({ stringWax: { on: false, start: '2026-11-01', every: 1 } })];
    expect(dueReminders(off, {}, '2026-11-20')).toHaveLength(0);
  });

  it('czynność spoza dyscypliny nie przypomina', () => {
    // Peep jest tylko dla compoundu.
    const s = [recurve({ peep: { on: true, start: '2026-11-01', every: 1 } })];
    expect(dueReminders(s, {}, '2026-11-20')).toHaveLength(0);
  });
});
