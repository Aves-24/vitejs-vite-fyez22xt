import { describe, it, expect } from 'vitest';
import { parcoursTargetView } from './parcoursTarget';
import { QUAD } from './spotGeometry';

const end = (targetType: string, dots: any[]) => ({ targetType, dots, arrows: dots.map(() => '5') });

describe('parcoursTargetView', () => {
  it('pełne tarcze zostają bez zmian, wzorcem jest najczęstsza', () => {
    const ends = [
      end('IFAA Field 50cm', [{ x: 160, y: 140 }]),
      end('IFAA Field 35cm', [{ x: 150, y: 150 }]),
      end('IFAA Field 35cm', [{ x: 100, y: 150 }]),
    ];
    const v = parcoursTargetView(ends, 'IFAA Field 50cm');
    expect(v.targetType).toBe('IFAA Field 35cm');
    expect(v.ends[0].dots[0]).toEqual({ x: 160, y: 140 });
  });

  it('tarczka 4-Spot: kropka przeliczona względem swojego spotu do promienia 150', () => {
    const s = QUAD.spots[3]; // prawa dolna
    const dot = { x: s.cx + QUAD.r * 0.2, y: s.cy, spotId: s.id }; // na granicy 5 (0,2 r)
    const v = parcoursTargetView([end('IFAA Field 20cm 4-Spot', [dot])], 'IFAA Field 20cm 4-Spot');
    expect(v.targetType).toBe('IFAA Field 35cm'); // sam 4-Spot → pełny odpowiednik
    const d = v.ends[0].dots[0];
    expect(d.x).toBeCloseTo(150 + 30); // spot 5 = r 30 na pełnej
    expect(d.y).toBeCloseTo(150);
    expect(d.spotId).toBe(s.id);
  });

  it('bez spotId bierze najbliższy spot; puste kropki zostają', () => {
    const s = QUAD.spots[0];
    const v = parcoursTargetView([end('IFAA Hunter 20cm 4-Spot', [{ x: s.cx, y: s.cy - 10 }, { x: null, y: null }])], null);
    expect(v.targetType).toBe('IFAA Hunter 35cm');
    expect(v.ends[0].dots[0].x).toBeCloseTo(150);
    expect(v.ends[0].dots[0].y).toBeCloseTo(150 - 10 * 150 / QUAD.r);
    expect(v.ends[0].dots[1]).toEqual({ x: null, y: null });
  });

  it('teren WA: 20 cm 3-Spot mapuje na Field 40cm, pełna tarcza wygrywa remis', () => {
    const v = parcoursTargetView([
      end('Field 20cm 3-Spot', [{ x: 75, y: 66, spotId: 'L0' }]),
      end('Field 80cm', [{ x: 150, y: 150 }]),
    ], 'Field 20cm 3-Spot');
    expect(v.targetType).toBe('Field 80cm');
    expect(v.ends[0].dots[0]).toMatchObject({ x: 150, y: 150 });
  });
});
