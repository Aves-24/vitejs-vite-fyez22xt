import { describe, it, expect } from 'vitest';
import { startAim, stepAim, AimFilter, Pt } from './aimSmoothing';

/** Klatki co 16 ms; raw(i) — gdzie jest palec w klatce i. */
const frames = (n: number, raw: (i: number) => Pt, f0?: AimFilter) => {
  let f = f0 ?? startAim(raw(0), 0);
  const out: Pt[] = [];
  for (let i = 1; i <= n; i++) { f = stepAim(f, raw(i), f.t + 16); out.push(f.x); }
  return { f, out };
};

describe('stabilizacja krzyżyka (One Euro)', () => {
  it('drżenie ±3 px tłumione do ułamka piksela', () => {
    const { out } = frames(120, i => ({ x: 100 + (i % 2 ? 3 : -3), y: 100 }));
    const tail = out.slice(60).map(p => p.x);
    expect(Math.max(...tail) - Math.min(...tail)).toBeLessThan(1);
  });

  it('po zatrzymaniu palca krzyżyk dojeżdża do niego', () => {
    const { f } = frames(120, () => ({ x: 50, y: 0 }), startAim({ x: 0, y: 0 }, 0));
    expect(f.x.x).toBeCloseTo(50, 0);
  });

  it('bez skoków: przy szybkim przesunięciu żaden krok nie przeskakuje palca', () => {
    const { out } = frames(60, i => ({ x: Math.min(i * 10, 200), y: 0 }), startAim({ x: 0, y: 0 }, 0));
    for (let i = 1; i < out.length; i++) {
      expect(out[i].x).toBeGreaterThanOrEqual(out[i - 1].x - 1e-9);
      expect(out[i].x).toBeLessThanOrEqual(200 + 1e-9);
    }
    expect(out[out.length - 1].x).toBeGreaterThan(195);
  });
});
