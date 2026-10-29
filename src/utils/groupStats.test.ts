import { describe, it, expect } from 'vitest';
import { groupStats } from './groupStats';

// Pełna tarcza 122 cm: środek (150,150), pierścień = 15 jednostek = 6,1 cm.
const dot = (rx: number, ry: number) => ({ x: 150 + rx * 15, y: 150 + ry * 15 });

describe('groupStats', () => {
  it('za mało strzał z pozycją → null', () => {
    expect(groupStats([{ dots: [dot(0, 0), { x: null, y: null }] }], '122cm')).toBeNull();
  });

  it('grupa przesunięta o 1 pierścień w prawo i w dół', () => {
    const g = groupStats([{ dots: [dot(1, 1), dot(1.5, 1), dot(0.5, 1), dot(1, 1.5), dot(1, 0.5)] }], '122cm')!;
    expect(g.dxCm).toBeCloseTo(6.1, 1);
    expect(g.dyCm).toBeCloseTo(6.1, 1);
    expect(g.svg).toEqual({ cx: 165, cy: 165, r: 7.5 });
    // 80% z 5 strzał = 4. promień = 0,5 pierścienia → średnica 1 pierścień
    expect(g.diameterCm).toBeCloseTo(6.1, 1);
  });

  it('jedna dzika strzała nie rozdmuchuje średnicy', () => {
    const tight = [dot(0, 0.2), dot(0.2, 0), dot(0, -0.2), dot(-0.2, 0), dot(0.1, 0.1), dot(-0.1, -0.1), dot(0.1, -0.1), dot(-0.1, 0.1), dot(0, 0.15)];
    const g = groupStats([{ dots: [...tight, dot(5, 0)] }], '122cm')!;
    expect(g.diameterCm).toBeLessThan(6.1);
  });

  it('oś błędu: grupa wydłużona w pionie / w poziomie / okrągła', () => {
    const line = (f: (k: number) => [number, number]) => [{ dots: Array.from({ length: 12 }, (_, k) => dot(...f(k))) }];
    expect(groupStats(line(k => [((k % 3) - 1) * 0.2, (k - 5.5) * 0.2]), '122cm')!.axis).toBe('vert');
    expect(groupStats(line(k => [(k - 5.5) * 0.2, ((k % 3) - 1) * 0.2]), '122cm')!.axis).toBe('horiz');
    const ring = Array.from({ length: 12 }, (_, k) => dot(Math.cos(k * Math.PI / 6), Math.sin(k * Math.PI / 6)));
    expect(groupStats([{ dots: ring }], '122cm')!.axis).toBeNull();
    // za mało strzał — bez osi, nawet przy wydłużonej grupie
    expect(groupStats([{ dots: [dot(0, -1), dot(0, 0), dot(0, 1), dot(0.1, 0.5)] }], '122cm')!.axis).toBeNull();
  });

  it('spot: każda kropka względem swojego spotu, bez rysunku', () => {
    // Dwa spoty (75,66) i (225,200), obie strzały 1 pierścień (12,5) w lewo.
    const g = groupStats([{ dots: [{ x: 62.5, y: 66 }, { x: 212.5, y: 200 }, { x: 62.5, y: 333 }] }], '3-Spot')!;
    expect(g.dxCm).toBeCloseTo(-2, 1);
    expect(Math.abs(g.dyCm)).toBeLessThan(0.01);
    expect(g.svg).toBeNull();
  });
});
