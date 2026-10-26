import { describe, it, expect } from 'vitest';
import { occursOn, nextOccurrence, prevOccurrence, isValidSchedule, sortedDays, type GroupSchedule } from './groupSchedule';

// 2026-10-28 to środa.
const wed: GroupSchedule = { days: [3], time: '18:00', every: 1, anchor: '2026-10-28' };
const biweekly: GroupSchedule = { days: [3], time: '18:00', every: 2, anchor: '2026-10-28' };

describe('groupSchedule', () => {
  it('co tydzień w środę', () => {
    expect(occursOn(wed, '2026-10-28')).toBe(true);
    expect(occursOn(wed, '2026-11-04')).toBe(true);
    expect(occursOn(wed, '2026-10-29')).toBe(false);
  });

  it('co drugi tydzień liczony od tygodnia kotwicy, też wstecz', () => {
    expect(occursOn(biweekly, '2026-10-28')).toBe(true);
    expect(occursOn(biweekly, '2026-11-04')).toBe(false);
    expect(occursOn(biweekly, '2026-11-11')).toBe(true);
    expect(occursOn(biweekly, '2026-10-21')).toBe(false);
    expect(occursOn(biweekly, '2026-10-14')).toBe(true);
  });

  it('kotwica w innym dniu tego samego tygodnia', () => {
    const s: GroupSchedule = { ...biweekly, anchor: '2026-10-26' }; // poniedziałek
    expect(occursOn(s, '2026-10-28')).toBe(true);
    expect(occursOn(s, '2026-11-04')).toBe(false);
  });

  it('przez zmianę czasu (25.10.2026) tydzień liczy się dobrze', () => {
    const s: GroupSchedule = { days: [0], time: '10:00', every: 2, anchor: '2026-10-18' };
    expect(occursOn(s, '2026-10-25')).toBe(false);
    expect(occursOn(s, '2026-11-01')).toBe(true);
  });

  it('następny i poprzedni termin', () => {
    expect(nextOccurrence(wed, '2026-10-26')).toBe('2026-10-28');
    expect(nextOccurrence(wed, '2026-10-28')).toBe('2026-10-28');
    expect(prevOccurrence(wed, '2026-10-28')).toBe('2026-10-21');
    expect(prevOccurrence(wed, '2026-10-29')).toBe('2026-10-28');
    expect(nextOccurrence(biweekly, '2026-10-29')).toBe('2026-11-11');
  });

  it('kilka dni w tygodniu', () => {
    const s: GroupSchedule = { days: [2, 4], time: '17:30', every: 1, anchor: '2026-10-26' };
    expect(nextOccurrence(s, '2026-10-28')).toBe('2026-10-29');
    expect(prevOccurrence(s, '2026-10-29')).toBe('2026-10-27');
  });

  it('niepoprawny szablon nigdy nie wypada', () => {
    expect(isValidSchedule({ days: [], time: '18:00', every: 1, anchor: '2026-10-28' })).toBe(false);
    expect(isValidSchedule({ days: [3], time: '', every: 1, anchor: '2026-10-28' })).toBe(false);
    expect(nextOccurrence({ days: [], time: '18:00', every: 1, anchor: '2026-10-28' }, '2026-10-26')).toBeNull();
  });

  it('dni od poniedziałku, niedziela na końcu', () => {
    expect(sortedDays([0, 3, 1, 3])).toEqual([1, 3, 0]);
  });
});
