import { describe, it, expect } from 'vitest';
import { occursOn, timesOn, nextOccurrence, prevOccurrence, upcomingOccurrences, listOccurrences, scheduleForSave, isValidSchedule, normalizeSchedule, sortSlots, type GroupSchedule } from './groupSchedule';

// 2026-10-28 to środa, 2026-10-31 sobota.
const wed: GroupSchedule = { slots: [{ day: 3, time: '18:00' }], every: 1, anchor: '2026-10-28' };
const biweekly: GroupSchedule = { ...wed, every: 2 };
const wedSat: GroupSchedule = { slots: [{ day: 6, time: '12:00' }, { day: 3, time: '18:00' }], every: 1, anchor: '2026-10-28' };

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
    const s: GroupSchedule = { slots: [{ day: 0, time: '10:00' }], every: 2, anchor: '2026-10-18' };
    expect(occursOn(s, '2026-10-25')).toBe(false);
    expect(occursOn(s, '2026-11-01')).toBe(true);
  });

  it('różne godziny w różne dni: środa 18, sobota 12', () => {
    expect(timesOn(wedSat, '2026-10-28')).toEqual(['18:00']);
    expect(timesOn(wedSat, '2026-10-31')).toEqual(['12:00']);
    expect(upcomingOccurrences(wedSat, '2026-10-26', 3)).toEqual([
      { date: '2026-10-28', time: '18:00' },
      { date: '2026-10-31', time: '12:00' },
      { date: '2026-11-04', time: '18:00' },
    ]);
  });

  it('dwa treningi jednego dnia — po godzinie', () => {
    const s: GroupSchedule = { slots: [{ day: 6, time: '15:00' }, { day: 6, time: '9:30' }], every: 1, anchor: '2026-10-31' };
    expect(timesOn(s, '2026-10-31')).toEqual(['09:30', '15:00']);
  });

  it('następny i poprzedni termin', () => {
    expect(nextOccurrence(wed, '2026-10-26')).toBe('2026-10-28');
    expect(nextOccurrence(wed, '2026-10-28')).toBe('2026-10-28');
    expect(prevOccurrence(wed, '2026-10-28')).toBe('2026-10-21');
    expect(prevOccurrence(wedSat, '2026-10-31')).toBe('2026-10-28');
    expect(nextOccurrence(biweekly, '2026-10-29')).toBe('2026-11-11');
  });

  it('stary zapis (days + time) dalej działa', () => {
    const old = { days: [3, 6], time: '18:00', every: 1, anchor: '2026-10-28' };
    expect(normalizeSchedule(old)?.slots).toEqual([{ day: 3, time: '18:00' }, { day: 6, time: '18:00' }]);
    expect(occursOn(old, '2026-10-31')).toBe(true);
  });

  it('niepoprawny szablon nigdy nie wypada', () => {
    expect(isValidSchedule({ slots: [], every: 1, anchor: '2026-10-28' })).toBe(false);
    expect(isValidSchedule({ slots: [{ day: 3, time: '' }], every: 1, anchor: '2026-10-28' })).toBe(false);
    expect(nextOccurrence({ slots: [], every: 1, anchor: '2026-10-28' }, '2026-10-26')).toBeNull();
  });

  it('miejsce osobno dla terminu, stare miejsce grupy przechodzi na terminy', () => {
    const s = { slots: [{ day: 3, time: '18:00', place: 'Halle' }, { day: 6, time: '12:00', place: 'Platz' }], every: 1, anchor: '2026-10-28' };
    expect(upcomingOccurrences(s, '2026-10-28', 2)).toEqual([
      { date: '2026-10-28', time: '18:00', place: 'Halle' },
      { date: '2026-10-31', time: '12:00', place: 'Platz' },
    ]);
    const old = { slots: [{ day: 3, time: '18:00' }], every: 1, anchor: '2026-10-28', place: 'Halle' };
    expect(normalizeSchedule(old)?.slots).toEqual([{ day: 3, time: '18:00', place: 'Halle' }]);
  });

  it('odwołany pojedynczy trening i przerwa: znikają z planu, a lista je oznacza', () => {
    const s: GroupSchedule = {
      ...wedSat,
      cancelled: { '2026-10-28 18:00': 'Halle belegt' },
      breaks: [{ from: '2026-11-02', to: '2026-11-06', note: 'Herbstferien' }],
    };
    expect(occursOn(s, '2026-10-28')).toBe(false);
    expect(occursOn(s, '2026-11-04')).toBe(false);
    expect(nextOccurrence(s, '2026-10-26')).toBe('2026-10-31');
    expect(prevOccurrence(s, '2026-11-07')).toBe('2026-10-31');
    expect(listOccurrences(s, '2026-10-26', '2026-11-08')).toEqual([
      { date: '2026-10-28', time: '18:00', cancelled: true, note: 'Halle belegt' },
      { date: '2026-10-31', time: '12:00' },
      { date: '2026-11-04', time: '18:00', cancelled: true, note: 'Herbstferien' },
      { date: '2026-11-07', time: '12:00' },
    ]);
  });

  it('zapis: bez undefined i bez odwołań starszych niż 60 dni', () => {
    const s = normalizeSchedule({
      slots: [{ day: 3, time: '18:00' }], every: 1, anchor: '2026-10-28',
      cancelled: { '2026-07-01 18:00': '', '2026-10-28 18:00': '' },
      breaks: [{ from: '2026-07-01', to: '2026-07-10' }, { from: '2026-12-21', to: '2027-01-06', note: 'Weihnachten' }],
    })!;
    const out = scheduleForSave(s, '2026-10-26');
    expect(out).toEqual({
      slots: [{ day: 3, time: '18:00' }], every: 1, anchor: '2026-10-28',
      cancelled: { '2026-10-28 18:00': '' },
      breaks: [{ from: '2026-12-21', to: '2027-01-06', note: 'Weihnachten' }],
    });
    expect(JSON.stringify(out)).not.toContain('undefined');
  });

  it('sloty od poniedziałku, niedziela na końcu, bez duplikatów', () => {
    expect(sortSlots([{ day: 0, time: '10:00' }, { day: 3, time: '18:00' }, { day: 1, time: '17:00' }, { day: 3, time: '18:00' }]))
      .toEqual([{ day: 1, time: '17:00' }, { day: 3, time: '18:00' }, { day: 0, time: '10:00' }]);
  });
});
