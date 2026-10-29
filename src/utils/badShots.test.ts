import { describe, it, expect } from 'vitest';
import { sortedRawIndices, toggleBad, countBad, isBad } from './badShots';
import { groupStats } from './groupStats';
import { computeArrowStats } from './arrowStats';

describe('badShots', () => {
  it('pole w posortowanej serii wskazuje właściwą strzałę, także przy powtórkach', () => {
    // raw: 9, X, 9, 10 → posortowane X, 10, 9, 9 → indeksy 1, 3, 0, 2
    expect(sortedRawIndices(['9', 'X', '9', '10'])).toEqual([1, 3, 0, 2]);
    expect(sortedRawIndices(['M', '7', 'M'])).toEqual([1, 0, 2]);
  });

  it('toggleBad włącza i wyłącza znacznik bez ruszania reszty', () => {
    const dots = [{ x: 1, y: 2 }, { x: null, y: null }];
    const on = toggleBad(dots, 1);
    expect(on[1]).toEqual({ x: null, y: null, bad: true });
    expect(on[0]).toBe(dots[0]);
    expect(toggleBad(on, 1)[1]).toEqual({ x: null, y: null });
    expect(toggleBad(dots, 5)).toBe(dots);
  });

  it('countBad liczy oznaczone strzały we wszystkich seriach', () => {
    expect(countBad([{ dots: [{ bad: true }, {}] }, { dots: [{ bad: true }] }, {}])).toBe(2);
    expect(isBad(undefined)).toBe(false);
  });

  it('zła strzała nie liczy się do grupy', () => {
    const dot = (rx: number, ry: number, bad = false) => ({ x: 150 + rx * 15, y: 150 + ry * 15, ...(bad ? { bad: true } : {}) });
    const tight = [dot(0, 0.1), dot(0.1, 0), dot(0, -0.1), dot(-0.1, 0), dot(0.05, 0.05)];
    const withBad = groupStats([{ dots: [...tight, dot(4, 4, true), dot(4, -4, true)] }], '122cm')!;
    expect(withBad.n).toBe(5);
    expect(withBad.diameterCm).toBeLessThan(3);
  });

  it('zła strzała nie liczy się do statystyki per strzała (pozycja)', () => {
    const d = (rx: number, ry: number, bad = false) => ({ x: 150 + rx * 15, y: 150 + ry * 15, spotId: null, ...(bad ? { bad: true } : {}) });
    const end = (bad: boolean) => ({ rawArrows: ['10', '10', '10', '10', '10', '10'], dots: [d(3, 0, bad), d(0, 0.2), d(0.2, 0), d(0, -0.2), d(-0.2, 0), d(0.1, 0.1)] });
    const ends = Array.from({ length: 12 }, () => end(true));
    const st = computeArrowStats([{ arrowColors: true, targetType: '122cm', ends }])!;
    // Strzała 1 była zawsze oznaczona — brak pozycji, brak ostrzeżenia.
    expect(st.arrows[0].n).toBe(0);
    expect(st.arrows[0].suspect).toBe(false);
  });
});
