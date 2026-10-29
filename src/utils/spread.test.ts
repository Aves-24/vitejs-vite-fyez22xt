import { describe, it, expect } from 'vitest';
import { calculateSpreadSessions } from './spread';

// Pełna tarcza 122 cm: środek (150,150), pierścień = 15 jednostek.
const dot = (rx: number, ry: number, bad = false) => ({ x: 150 + rx * 15, y: 150 + ry * 15, ...(bad ? { bad: true } : {}) });
const ringOf = (cx: number, cy: number, rx: number, ry: number) =>
  Array.from({ length: 12 }, (_, k) => dot(cx + Math.cos(k * Math.PI / 6) * rx, cy + Math.sin(k * Math.PI / 6) * ry));
const sess = (dots: any[], targetType = '122cm') => ({ targetType, ends: [{ dots }] });

describe('calculateSpreadSessions', () => {
  it('przesunięcie ponad 0,3 pierścienia → kierunek, poniżej → Mitte', () => {
    const r = calculateSpreadSessions([sess(ringOf(0.5, -0.5, 0.3, 0.3))])!;
    expect(r.hKey).toBe('stats.pro.zones.right');
    expect(r.vKey).toBe('stats.pro.zones.up');
    const c = calculateSpreadSessions([sess(ringOf(0.2, 0.1, 0.3, 0.3))])!;
    expect(c.hKey).toBe('stats.pro.zones.center');
    expect(c.vKey).toBe('stats.pro.zones.center');
  });

  it('mediana: kilka dzikich strzał nie przesuwa środka', () => {
    const dots = [...ringOf(0, 0, 0.3, 0.3), dot(5, 0), dot(5, 0.1), dot(5, -0.1)];
    expect(calculateSpreadSessions([sess(dots)])!.hKey).toBe('stats.pro.zones.center');
  });

  it('oś błędu: rozciągnięta pionowo / poziomo / okrągła', () => {
    expect(calculateSpreadSessions([sess(ringOf(0, 0, 0.3, 1))])!.errorKey).toBe('stats.pro.zones.vert');
    expect(calculateSpreadSessions([sess(ringOf(0, 0, 1, 0.3))])!.errorKey).toBe('stats.pro.zones.horiz');
    expect(calculateSpreadSessions([sess(ringOf(0, 0, 0.5, 0.5))])!.errorKey).toBe('stats.pro.zones.symm');
  });

  it('złe strzały (Fehlschuss) się nie liczą', () => {
    const dots = [...ringOf(0, 0, 0.3, 0.3), ...Array.from({ length: 20 }, () => dot(2, 0, true))];
    expect(calculateSpreadSessions([sess(dots)])!.hKey).toBe('stats.pro.zones.center');
  });

  it('różne tarcze liczone w pierścieniach swojej tarczy', () => {
    // 3-Spot: pierścień = 12,5 jednostki; 0,5 pierścienia w prawo od spotu (75,66).
    const spot = Array.from({ length: 12 }, (_, k) => ({ x: 75 + 6.25 + Math.cos(k * Math.PI / 6) * 3, y: 66 + Math.sin(k * Math.PI / 6) * 3 }));
    const r = calculateSpreadSessions([sess(spot, '3-Spot'), sess(ringOf(0.5, 0, 0.2, 0.2))])!;
    expect(r.hKey).toBe('stats.pro.zones.right');
    expect(r.vKey).toBe('stats.pro.zones.center');
  });

  it('brak pozycji → null', () => {
    expect(calculateSpreadSessions([{ targetType: '122cm', ends: [{ dots: [{ x: null, y: null }] }] }])).toBeNull();
  });
});
