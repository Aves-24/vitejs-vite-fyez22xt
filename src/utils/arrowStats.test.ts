import { describe, it, expect } from 'vitest';
import { computeArrowStats, directionKey, ringScale, ARROW_MIN_ENDS } from './arrowStats';

// Pełna tarcza: środek (150,150), pierścień = 15 jednostek.
const dot = (rx: number, ry: number) => ({ x: 150 + rx * 15, y: 150 + ry * 15, spotId: null });

// Seria 6 strzał rozsianych wokół środka; miejsca rotują z serii na serię
// (`k`), jak w prawdziwej grupie. Strzała `bad` dostaje stałe +`off` pierścieni w prawo.
const endWith = (bad: number, off: number, k = 0) => {
  const base: Array<[number, number]> = [[0, -0.3], [0.3, 0], [-0.3, 0], [0, 0.3], [0.2, 0.2], [-0.2, -0.2]];
  const dots = base.map((_, i) => {
    const [x, y] = base[(i + k) % base.length];
    return dot(x + (i === bad ? off : 0), y);
  });
  return { rawArrows: ['10', '10', '10', '10', '10', '10'], dots };
};

const session = (ends: any[], extra: object = {}) => ({ arrowColors: true, targetType: '122cm', ends, ...extra });

describe('computeArrowStats', () => {
  it('bez sesji w kolorowej kolejności — null', () => {
    expect(computeArrowStats([{ targetType: '122cm', ends: [endWith(0, 2)] }])).toBeNull();
  });

  it('wykrywa strzałę, która stale ucieka w jedną stronę', () => {
    const ends = Array.from({ length: ARROW_MIN_ENDS }, (_, k) => endWith(4, 1, k));
    const r = computeArrowStats([session(ends)])!;
    const red = r.arrows.find(a => a.index === 4)!;
    expect(red.suspect).toBe(true);
    expect(red.dx).toBeGreaterThan(0.9);
    expect(directionKey(red.dx, red.dy)).toBe('right');
    expect(r.arrows.filter(a => a.suspect).map(a => a.index)).toEqual([4]);
  });

  it('za mało serii — jeszcze bez ostrzeżenia', () => {
    const ends = Array.from({ length: ARROW_MIN_ENDS - 1 }, (_, k) => endWith(4, 1, k));
    const r = computeArrowStats([session(ends)])!;
    expect(r.arrows.some(a => a.suspect)).toBe(false);
    expect(r.minEnds).toBe(ARROW_MIN_ENDS - 1);
  });

  it('przesunięcie całej serii (celownik) nie robi z nikogo podejrzanego', () => {
    const shifted = (k: number) => {
      const e = endWith(0, 0, k);
      e.dots = e.dots.map(d => ({ ...d, x: d.x + (k % 4) * 10, y: d.y - (k % 4) * 5 }));
      return e;
    };
    const r = computeArrowStats([session(Array.from({ length: 18 }, (_, k) => shifted(k)))])!;
    expect(r.arrows.some(a => a.suspect)).toBe(false);
  });

  it('M liczy się do średniej punktów, ale nie do pozycji', () => {
    const e = endWith(0, 0);
    e.rawArrows = ['M', '10', '10', '10', '10', '10'];
    const r = computeArrowStats([session([e])])!;
    const green = r.arrows.find(a => a.index === 0)!;
    expect(green.misses).toBe(1);
    expect(green.avgScore).toBe(0);
    expect(green.n).toBe(0);
  });

  it('wpis klawiaturą (bez kropek) daje tylko średnią punktów', () => {
    const r = computeArrowStats([session([{ rawArrows: ['9', '8', '10', '10', '7', 'X'], dots: [] }])])!;
    expect(r.arrows.map(a => a.avgScore)).toEqual([9, 8, 10, 10, 7, 10]);
    expect(r.arrows.every(a => a.n === 0)).toBe(true);
  });

  it('spot: środek z id spotu, nie z pozycji', () => {
    // Strzała na dolnym spocie lewej połowy (L2: 75,333) dokładnie w środku.
    const e = {
      rawArrows: ['10', '10', '10'],
      dots: [
        { x: 75, y: 66, spotId: 'L0' },
        { x: 75, y: 200, spotId: 'L1' },
        { x: 75, y: 333, spotId: 'L2' },
      ],
    };
    const r = computeArrowStats([{ arrowColors: true, targetType: '3-Spot', ends: [e] }])!;
    expect(r.arrows.every(a => a.dist < 1e-9)).toBe(true);
  });
});

describe('ringScale', () => {
  it('122 cm: pierścień 6,1 cm; spot 40 cm: 2 cm', () => {
    expect(ringScale('122cm').cm).toBeCloseTo(6.1);
    expect(ringScale('3-Spot')).toEqual({ unit: 12.5, cm: 2 });
  });
});

describe('directionKey', () => {
  it('8 stron i środek (y w dół)', () => {
    expect(directionKey(0, 0.05)).toBe('center');
    expect(directionKey(0, -1)).toBe('up');
    expect(directionKey(-1, 1)).toBe('downLeft');
    expect(directionKey(1, -1)).toBe('upRight');
  });
});
