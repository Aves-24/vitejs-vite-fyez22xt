import { describe, it, expect } from 'vitest';
import {
  arrowPoints, seededRand, createShooterProfiles, generateEnd, isNearLine,
  sortedValues, expectedAnswer, summarizeGame, isBetterResult, configKey, MAT_RADIUS, SPOT_CENTERS,
  type SchreiberArrow,
} from './schreiberGame';
import { resolveTargetFace } from '../config/targetFaces';
import { scoreSingleFace } from './targetScoring';

const arrow = (value: string, shooter = 0): SchreiberArrow =>
  ({ x: 0, y: 0, value, points: arrowPoints(value), shooter });

describe('arrowPoints', () => {
  it('X = 10, M = 0, liczby wprost', () => {
    expect(arrowPoints('X')).toBe(10);
    expect(arrowPoints('M')).toBe(0);
    expect(arrowPoints('7')).toBe(7);
  });
});

describe('generateEnd', () => {
  const face = resolveTargetFace('122cm');

  it('daje właściwą liczbę strzał każdemu zawodnikowi', () => {
    const rand = seededRand(1);
    const profiles = createShooterProfiles(4, 'club', rand);
    const end = generateEnd(profiles, 6, rand);
    expect(end.arrows).toHaveLength(24);
    for (let s = 0; s < 4; s++) {
      expect(end.arrows.filter(a => a.shooter === s)).toHaveLength(6);
    }
  });

  it('suma zawodnika = suma jego strzał, punkty jak przy wpisywaniu treningu', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const rand = seededRand(seed);
      const profiles = createShooterProfiles(3, 'beginner', rand);
      const end = generateEnd(profiles, 3, rand);
      end.arrows.forEach(a => {
        expect(a.value).toBe(scoreSingleFace(face, a.x, a.y).val);
        expect(a.points).toBe(arrowPoints(a.value));
      });
      end.sums.forEach((sum, s) => {
        const mine = end.arrows.filter(a => a.shooter === s).reduce((acc, a) => acc + a.points, 0);
        expect(sum).toBe(mine);
      });
    }
  });

  it('strzały nie leżą na liniach, nie nachodzą na siebie i mieszczą się na macie', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const rand = seededRand(seed);
      const end = generateEnd(createShooterProfiles(4, 'beginner', rand), 6, rand);
      end.arrows.forEach((a, i) => {
        expect(isNearLine(a.x, a.y)).toBe(false);
        expect(Math.hypot(a.x - 150, a.y - 150)).toBeLessThanOrEqual(MAT_RADIUS);
        end.arrows.slice(i + 1).forEach(b => {
          expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(6);
        });
      });
    }
  });

  it('elita strzela średnio wyżej niż początkujący', () => {
    const avg = (level: 'beginner' | 'elite') => {
      let total = 0;
      for (let seed = 1; seed <= 40; seed++) {
        const rand = seededRand(seed);
        total += generateEnd(createShooterProfiles(1, level, rand), 6, rand).sums[0];
      }
      return total / 40;
    };
    expect(avg('elite')).toBeGreaterThan(avg('beginner'));
  });

  it('to samo ziarno = ta sama seria', () => {
    const run = () => {
      const rand = seededRand(42);
      return generateEnd(createShooterProfiles(2, 'club', rand), 3, rand);
    };
    expect(run()).toEqual(run());
  });
});

describe('inne tarcze', () => {
  it('6-Ring: tylko 10..5 albo pudło, punkty jak w treningu', () => {
    const face = resolveTargetFace('80cm (6-Ring)');
    for (let seed = 1; seed <= 40; seed++) {
      const rand = seededRand(seed);
      const end = generateEnd(createShooterProfiles(3, 'beginner', rand), 6, rand, 'six');
      end.arrows.forEach(a => {
        expect(['X', '10', '9', '8', '7', '6', '5', 'M']).toContain(a.value);
        expect(a.value).toBe(scoreSingleFace(face, a.x, a.y).val);
        expect(isNearLine(a.x, a.y, 'six')).toBe(false);
      });
    }
  });

  it('3-Spot: zawsze 3 strzały na zawodnika, po jednej w każdy spot, 10..6 albo pudło', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const rand = seededRand(seed);
      const end = generateEnd(createShooterProfiles(4, 'beginner', rand), 6, rand, 'spot3');
      expect(end.arrows).toHaveLength(12);
      for (let s = 0; s < 4; s++) {
        const mine = end.arrows.filter(a => a.shooter === s);
        const spots = mine.map(a => SPOT_CENTERS.findIndex(c => Math.hypot(a.x - c.x, a.y - c.y) <= 66));
        expect([...spots].sort()).toEqual([0, 1, 2]);
        mine.forEach(a => {
          expect(['X', '10', '9', '8', '7', '6', 'M']).toContain(a.value);
          expect(isNearLine(a.x, a.y, 'spot3')).toBe(false);
        });
      }
    }
  });

  it('configKey: 3-Spot zawsze jako 3 strzały', () => {
    const base = { target: 'spot3' as const, shooters: 2, level: 'club' as const, mode: 'end' as const, ends: 10 };
    expect(configKey({ ...base, arrows: 6 })).toBe(configKey({ ...base, arrows: 3 }));
  });
});

describe('isNearLine', () => {
  it('wykrywa środek strzały tuż przy linii pierścienia', () => {
    expect(isNearLine(150 + 30.5, 150)).toBe(true);
    expect(isNearLine(150 + 37, 150)).toBe(false);
    expect(isNearLine(150 + 149, 150)).toBe(true);
  });
});

describe('sortedValues', () => {
  it('od najwyższej, X przed 10, pudło na końcu', () => {
    expect(sortedValues([arrow('7'), arrow('M'), arrow('10'), arrow('X'), arrow('9')]))
      .toEqual(['X', '10', '9', '7', 'M']);
  });
});

describe('expectedAnswer', () => {
  const ends = [
    { arrows: [], sums: [27, 20] },
    { arrows: [], sums: [25, 18] },
    { arrows: [], sums: [29, 22] },
  ];
  it('tryb serii: suma tylko tej serii', () => {
    expect(expectedAnswer(ends, 1, 0, 'end')).toBe(25);
  });
  it('tryb narastający: suma wszystkich serii do tej włącznie', () => {
    expect(expectedAnswer(ends, 2, 0, 'running')).toBe(81);
    expect(expectedAnswer(ends, 0, 1, 'running')).toBe(20);
  });
});

describe('wynik i rekord', () => {
  it('summarizeGame liczy dobre odpowiedzi i średni czas', () => {
    const r = summarizeGame([
      { correct: true, ms: 2000 }, { correct: false, ms: 4000 }, { correct: true, ms: 3000 },
    ]);
    expect(r).toEqual({ correct: 2, total: 3, totalMs: 9000, avgMs: 3000 });
    expect(summarizeGame([]).avgMs).toBe(0);
  });

  it('lepszy = więcej dobrych, przy remisie szybciej', () => {
    const best = { correct: 8, total: 10, totalMs: 30000, avgMs: 3000 };
    expect(isBetterResult({ ...best, correct: 9 }, best)).toBe(true);
    expect(isBetterResult({ ...best, correct: 7, avgMs: 1000 }, best)).toBe(false);
    expect(isBetterResult({ ...best, avgMs: 2500 }, best)).toBe(true);
    expect(isBetterResult({ ...best, avgMs: 3000 }, best)).toBe(false);
    expect(isBetterResult(best, null)).toBe(true);
    expect(isBetterResult({ correct: 0, total: 5, totalMs: 5000, avgMs: 1000 }, null)).toBe(false);
  });

  it('configKey rozróżnia ustawienia', () => {
    const base = { target: 'full' as const, shooters: 2, arrows: 3, level: 'club' as const, mode: 'end' as const, ends: 10 };
    expect(configKey(base)).not.toBe(configKey({ ...base, mode: 'running' }));
  });
});
