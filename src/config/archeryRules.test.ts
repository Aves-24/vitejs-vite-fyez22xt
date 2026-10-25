import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { getRecommendation, BowType } from './archeryRules';
import { fallbackTargetFor } from './distances';

// Wiek jak w DSB: rok bieżący − rok urodzenia. Zegar zamrożony na 2026,
// żeby testy nie zmieniały wyniku z nowym rokiem.
const YEAR = 2026;
const born = (age: number) => YEAR - age;
beforeAll(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(`${YEAR}-06-15T12:00:00Z`)); });
afterAll(() => { vi.useRealTimers(); });

const R: BowType = 'Klasyczny (Recurve)';
const C: BowType = 'Bloczkowy (Compound)';
const B: BowType = 'Goły (Barebow)';
const T: BowType = 'Tradycyjny';
const hall = (bow: BowType, age: number, g: 'M' | 'K' = 'M') => getRecommendation(bow, born(age), 'Hala (Indoor)', g);
const field = (bow: BowType, age: number, g: 'M' | 'K' = 'M') => getRecommendation(bow, born(age), 'Tory (Outdoor)', g);
const pick = (r: { distance: string; targetType: string }) => `${r.distance} ${r.targetType}`;

describe('hala 18 m', () => {
  it('compound: 3-Spot we wszystkich klasach', () => {
    [11, 14, 17, 30, 55, 70].forEach(a => expect(pick(hall(C, a))).toBe('18m 3-Spot'));
  });

  it('barebow: pełna 40 cm we wszystkich klasach', () => {
    [11, 14, 17, 30, 55, 70].forEach(a => expect(pick(hall(B, a))).toBe('18m 40cm'));
  });

  it('recurve Schüler B (11–12): 60 cm', () => {
    expect(pick(hall(R, 11))).toBe('18m 60cm');
    expect(pick(hall(R, 12))).toBe('18m 60cm');
  });

  it('recurve Schüler A (13–14) i Jugend (15–17): pełna 40 cm', () => {
    [13, 14, 15, 17].forEach(a => expect(pick(hall(R, a))).toBe('18m 40cm'));
  });

  it('recurve Junioren/Herren/Damen (18–49): 3-Spot', () => {
    [18, 20, 21, 35, 49].forEach(a => {
      expect(pick(hall(R, a))).toBe('18m 3-Spot');
      expect(pick(hall(R, a, 'K'))).toBe('18m 3-Spot');
    });
  });

  it('recurve Master (50–65) i Senioren (66+): pełna 40 cm', () => {
    [50, 65, 66, 80].forEach(a => expect(pick(hall(R, a))).toBe('18m 40cm'));
  });

  it('płeć nie zmienia tarczy w hali', () => {
    [12, 16, 30, 60].forEach(a => {
      expect(hall(R, a, 'K')).toEqual(hall(R, a, 'M'));
      expect(hall(C, a, 'K')).toEqual(hall(C, a, 'M'));
      expect(hall(B, a, 'K')).toEqual(hall(B, a, 'M'));
    });
  });
});

describe('tory — compound (80 cm 6-Ring)', () => {
  it('dystans rośnie z klasą: 25 / 30 / 40 / 50 m', () => {
    expect(pick(field(C, 12))).toBe('25m 80cm (6-Ring)');
    expect(pick(field(C, 13))).toBe('30m 80cm (6-Ring)');
    expect(pick(field(C, 14))).toBe('30m 80cm (6-Ring)');
    expect(pick(field(C, 15))).toBe('40m 80cm (6-Ring)');
    expect(pick(field(C, 17))).toBe('40m 80cm (6-Ring)');
    expect(pick(field(C, 18))).toBe('50m 80cm (6-Ring)');
    expect(pick(field(C, 70))).toBe('50m 80cm (6-Ring)');
  });
});

describe('tory — barebow', () => {
  it('Schüler B 20 m / Schüler A 30 m na 80 cm', () => {
    expect(pick(field(B, 12))).toBe('20m 80cm');
    expect(pick(field(B, 13))).toBe('30m 80cm');
    expect(pick(field(B, 14))).toBe('30m 80cm');
  });

  it('Jugend 35 m, dorośli 50 m na 122 cm', () => {
    expect(pick(field(B, 15))).toBe('35m 122cm');
    expect(pick(field(B, 17))).toBe('35m 122cm');
    expect(pick(field(B, 18))).toBe('50m 122cm');
    expect(pick(field(B, 66))).toBe('50m 122cm');
  });
});

describe('tory — recurve', () => {
  it('Schüler B 25 m na 60 cm, Schüler A 40 m na 122 cm (obie płcie)', () => {
    (['M', 'K'] as const).forEach(g => {
      expect(pick(field(R, 11, g))).toBe('25m 60cm');
      expect(pick(field(R, 12, g))).toBe('25m 60cm');
      expect(pick(field(R, 13, g))).toBe('40m 122cm');
      expect(pick(field(R, 14, g))).toBe('40m 122cm');
    });
  });

  it('mężczyźni: Jugend 60 / Herren 70 / Master 60 / Senioren 50 m', () => {
    expect(pick(field(R, 15))).toBe('60m 122cm');
    expect(pick(field(R, 17))).toBe('60m 122cm');
    expect(pick(field(R, 18))).toBe('70m 122cm');
    expect(pick(field(R, 49))).toBe('70m 122cm');
    expect(pick(field(R, 50))).toBe('60m 122cm');
    expect(pick(field(R, 65))).toBe('60m 122cm');
    expect(pick(field(R, 66))).toBe('50m 122cm');
  });

  it('kobiety: Jugend 50 / Damen 70 / Master 50 / Senioren 40 m', () => {
    expect(pick(field(R, 15, 'K'))).toBe('50m 122cm');
    expect(pick(field(R, 17, 'K'))).toBe('50m 122cm');
    expect(pick(field(R, 18, 'K'))).toBe('70m 122cm');
    expect(pick(field(R, 49, 'K'))).toBe('70m 122cm');
    expect(pick(field(R, 50, 'K'))).toBe('50m 122cm');
    expect(pick(field(R, 66, 'K'))).toBe('40m 122cm');
  });

  it('płeć domyślnie M', () => {
    expect(getRecommendation(R, born(30), 'Tory (Outdoor)')).toEqual(field(R, 30, 'M'));
  });
});

describe('wiek liczony rokiem urodzenia, nie dniem', () => {
  it('urodzony w grudniu ma już wiek z bieżącego roku', () => {
    // Rocznik 2008 w 2026 = 18 → Junioren, mimo że 18 urodziny dopiero w grudniu.
    expect(pick(hall(R, 18))).toBe('18m 3-Spot');
    expect(pick(hall(R, 17))).toBe('18m 40cm');
  });
});

// ZNALEZIONE 2026-10-25 — pokazane userowi, działanie NIE zmienione.
// Testy opisują OBECNE działanie; po decyzji usera do poprawy.
describe('[do decyzji] przypadki bez własnej reguły', () => {
  it('łuk tradycyjny: zawsze 70 m 122 cm, także w hali', () => {
    expect(pick(hall(T, 30))).toBe('70m 122cm');
    expect(pick(field(T, 30))).toBe('70m 122cm');
  });

  it('recurve Schüler C (≤10) na torach: dystans dorosłych (60 m / 50 m 122 cm)', () => {
    expect(pick(field(R, 9))).toBe('60m 122cm');
    expect(pick(field(R, 9, 'K'))).toBe('50m 122cm');
  });

  it('recurve Schüler C (≤10) w hali: 40 cm', () => {
    expect(pick(hall(R, 9))).toBe('18m 40cm');
  });
});

describe('fallbackTargetFor — tarcza bez daty urodzenia', () => {
  it('do 18 m pełna 40 cm', () => {
    ['5m', '10m', '15m', '18m'].forEach(m => expect(fallbackTargetFor(m)).toBe('40cm'));
  });

  it('19–30 m: 80 cm', () => {
    ['20m', '25m', '30m'].forEach(m => expect(fallbackTargetFor(m)).toBe('80cm'));
  });

  it('powyżej 30 m: 122 cm', () => {
    ['35m', '50m', '70m', '90m'].forEach(m => expect(fallbackTargetFor(m)).toBe('122cm'));
  });

  it('napis z etykietą liczy się po metrach', () => {
    expect(fallbackTargetFor('18m barebow')).toBe('40cm');
    expect(fallbackTargetFor('70 m')).toBe('122cm');
  });

  it('pusty/nieczytelny dystans = 0 m → 40 cm', () => {
    expect(fallbackTargetFor('')).toBe('40cm');
    expect(fallbackTargetFor('abc')).toBe('40cm');
  });
});
