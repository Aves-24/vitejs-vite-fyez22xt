import { describe, it, expect } from 'vitest';
import {
  PLANNED_ENDS, SHORT_END_OPTIONS, isPartialSession, isShortPlanned, roundSizeFor, partialLabel,
} from './partialSession';

// Zapis z ScoringView: pełny trening bez flag; przerwany albo z góry krótszy
// → { isPartial: true, endsShot, endsPlanned }.
const full = {};
const shortDone = (n: number) => ({ isPartial: true, endsShot: n, endsPlanned: n });
const interrupted = (shot: number, planned = PLANNED_ENDS) => ({ isPartial: true, endsShot: shot, endsPlanned: planned });

describe('stałe krótszego treningu', () => {
  it('standard to 12 serii (2 rundy po 6)', () => {
    expect(PLANNED_ENDS).toBe(12);
  });

  it('do wyboru 6, 8, 10 — wszystkie krótsze od standardu i parzyste', () => {
    expect([...SHORT_END_OPTIONS]).toEqual([6, 8, 10]);
    SHORT_END_OPTIONS.forEach(n => {
      expect(n).toBeLessThan(PLANNED_ENDS);
      expect(n % 2).toBe(0);
    });
  });
});

describe('isPartialSession', () => {
  it('stara sesja bez flagi = pełna', () => {
    expect(isPartialSession(full)).toBe(false);
  });

  it('brak sesji = nie częściowa', () => {
    expect(isPartialSession(null)).toBe(false);
    expect(isPartialSession(undefined)).toBe(false);
  });

  it('tylko dokładnie true się liczy', () => {
    expect(isPartialSession({ isPartial: false })).toBe(false);
    expect(isPartialSession({ isPartial: 'true' as any })).toBe(false);
    expect(isPartialSession({ isPartial: true })).toBe(true);
  });

  it('przerwany i krótszy ukończony są częściowe (wypadają z sum i krzywych)', () => {
    expect(isPartialSession(interrupted(7))).toBe(true);
    expect(isPartialSession(shortDone(8))).toBe(true);
  });
});

describe('isShortPlanned', () => {
  it.each(SHORT_END_OPTIONS)('krótszy %i serii ukończony do końca', n => {
    expect(isShortPlanned(shortDone(n))).toBe(true);
  });

  it('przerwany 12-seryjny to NIE krótszy', () => {
    expect(isShortPlanned(interrupted(6))).toBe(false);
  });

  it('krótszy, ale przerwany przed końcem, to NIE ukończony krótszy', () => {
    expect(isShortPlanned(interrupted(5, 8))).toBe(false);
  });

  it('bez flagi isPartial nigdy krótszy', () => {
    expect(isShortPlanned({ endsShot: 6, endsPlanned: 6 })).toBe(false);
    expect(isShortPlanned(full)).toBe(false);
    expect(isShortPlanned(null)).toBe(false);
  });

  it('bez endsPlanned albo z 12 zaplanowanymi — nie krótszy', () => {
    expect(isShortPlanned({ isPartial: true, endsShot: 6 })).toBe(false);
    expect(isShortPlanned(shortDone(12))).toBe(false);
  });
});

describe('roundSizeFor — serii na Durchgang', () => {
  it('pełny trening: 6', () => {
    expect(roundSizeFor(full)).toBe(6);
    expect(roundSizeFor(null)).toBe(6);
  });

  it('krótszy ukończony: po połowie (6 = 3+3, 8 = 4+4, 10 = 5+5)', () => {
    expect(roundSizeFor(shortDone(6))).toBe(3);
    expect(roundSizeFor(shortDone(8))).toBe(4);
    expect(roundSizeFor(shortDone(10))).toBe(5);
  });

  it('przerwany 12-seryjny: dalej 6', () => {
    expect(roundSizeFor(interrupted(4))).toBe(6);
    expect(roundSizeFor(interrupted(9))).toBe(6);
  });

  it('zgodne z podziałem w ScoringView (ceil(plan / 2)) dla ukończonych', () => {
    [6, 8, 10, 12].forEach(n => {
      const s = n === PLANNED_ENDS ? full : shortDone(n);
      expect(roundSizeFor(s)).toBe(Math.ceil(n / 2));
    });
  });

  // Poprawione 2026-10-25: wcześniej statystyki dzieliły taki trening po 6 (5+0).
  it('krótszy przerwany: też po połowie planu, jak w ScoringView (plan 8, oddane 5 = 4+1)', () => {
    expect(roundSizeFor(interrupted(5, 8))).toBe(4);
    expect(roundSizeFor(interrupted(2, 6))).toBe(3);
    expect(roundSizeFor(interrupted(7, 10))).toBe(5);
  });

  it('bez flagi isPartial plan jest ignorowany', () => {
    expect(roundSizeFor({ endsShot: 4, endsPlanned: 8 })).toBe(6);
  });
});

describe('partialLabel', () => {
  it('„oddane/zaplanowane”', () => {
    expect(partialLabel(interrupted(7))).toBe('7/12');
    expect(partialLabel(shortDone(8))).toBe('8/8');
  });

  it('brak endsPlanned = 12, brak endsShot = ?', () => {
    expect(partialLabel({ isPartial: true, endsShot: 3 })).toBe('3/12');
    expect(partialLabel({ isPartial: true })).toBe('?/12');
  });
});
