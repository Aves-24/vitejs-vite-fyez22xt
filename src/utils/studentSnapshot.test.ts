import { describe, it, expect } from 'vitest';
import { buildSnapshot, type SnapSession } from './studentSnapshot';

const NOW = new Date(2026, 9, 30, 12).getTime();
const DAY = 86400000;
const sess = (id: string, daysAgo: number, distance: string, score: number, sums: number[]): SnapSession => ({
  id, ts: NOW - daysAgo * DAY, distance, distanceLabel: distance, score, scoreArrows: sums.length * 6, arrows: sums.length * 6,
  ends: sums.map(total_sum => ({ total_sum, arrows: [] })),
});

describe('buildSnapshot — dystans', () => {
  const list = [
    sess('a', 10, '70m', 300, [50, 50]),
    sess('b', 8, '70m', 310, [52, 51]),
    sess('c', 6, '70m', 320, [53, 54]),
    sess('d', 1, '30m', 110, [40, 58]),
  ];

  it('domyślnie dystans ostatniego treningu, nie najczęstszy', () => {
    const s = buildSnapshot(list, undefined, NOW);
    expect(s.distance).toBe('30m');
    expect(s.distances.map(d => d.distance)).toEqual(['30m', '70m']);
    expect(s.recent).toHaveLength(1);
  });

  it('wybrany dystans: wyniki i rozstęp serii tylko z niego', () => {
    const s = buildSnapshot(list, undefined, NOW, '70m');
    expect(s.distance).toBe('70m');
    expect(s.recent).toHaveLength(3);
    expect(s.endRange).toEqual([53, 54]); // ostatni trening na 70 m, nie 30 m
  });
});
