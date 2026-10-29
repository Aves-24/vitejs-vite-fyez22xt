import { describe, it, expect } from 'vitest';
import { groupTrend } from './groupTrend';

// Pełna tarcza 122 cm: pierścień = 15 jednostek = 6,1 cm. 12 strzał na okręgu o promieniu r pierścieni.
const ring = (r: number) => Array.from({ length: 12 }, (_, k) => ({ x: 150 + Math.cos(k * Math.PI / 6) * r * 15, y: 150 + Math.sin(k * Math.PI / 6) * r * 15 }));
const session = (id: string, ts: number, r: number, extra: object = {}) => ({ id, timestamp: ts, targetType: '122cm', ends: [{ dots: ring(r) }], ...extra });

describe('groupTrend', () => {
  it('średnica grupy na trening, rosnąco w czasie', () => {
    const pts = groupTrend([session('b', 2, 1), session('a', 1, 0.5)]);
    expect(pts.map(p => p.id)).toEqual(['a', 'b']);
    expect(pts[0].diameterCm).toBeCloseTo(6.1, 1);   // promień 0,5 pierścienia → ⌀ 1 pierścień
    expect(pts[1].diameterCm).toBeCloseTo(12.2, 1);
  });

  it('pomija technikę, treningi bez tarczy i za mało strzał', () => {
    const pts = groupTrend([
      session('tech', 1, 1, { type: 'TECHNICAL' }),
      { id: 'kbd', timestamp: 2, ends: [{ dots: Array.from({ length: 12 }, () => ({ x: null, y: null })) }] },
      { id: 'few', timestamp: 3, targetType: '122cm', ends: [{ dots: ring(1).slice(0, 6) }] },
      session('ok', 4, 1),
    ]);
    expect(pts.map(p => p.id)).toEqual(['ok']);
  });

  it('ostatnie N treningów', () => {
    const many = Array.from({ length: 14 }, (_, i) => session(String(i), i, 1));
    expect(groupTrend(many, 10).map(p => p.id)).toEqual(['4', '5', '6', '7', '8', '9', '10', '11', '12', '13']);
  });
});
