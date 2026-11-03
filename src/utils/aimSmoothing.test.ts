import { describe, it, expect } from 'vitest';
import { smoothAim, holdStill, Sample, Pt } from './aimSmoothing';

const run = (pts: Sample[]): Pt => {
  let s: Sample[] = []; let p: Pt = pts[0];
  for (const q of pts) [s, p] = smoothAim(s, q);
  return p;
};

describe('stabilizacja krzyżyka', () => {
  it('pierwszy punkt bez zmian', () => {
    expect(smoothAim([], { x: 5, y: 7, t: 0 })[1]).toEqual({ x: 5, y: 7 });
  });

  it('drżenie ±2 px co 8 ms tłumione do ułamka', () => {
    const pts = Array.from({ length: 40 }, (_, i) => ({ x: 100 + (i % 2 ? 2 : -2), y: 100, t: i * 8 }));
    expect(Math.abs(run(pts).x - 100)).toBeLessThan(0.3);
  });

  it('po zatrzymaniu palca krzyżyk stoi w jego punkcie', () => {
    const slide = Array.from({ length: 20 }, (_, i) => ({ x: i * 0.5, y: 0, t: i * 8 }));
    const hold = Array.from({ length: 25 }, (_, i) => ({ x: 10, y: 0, t: 160 + i * 8 }));
    expect(run([...slide, ...hold]).x).toBeCloseTo(10, 5);
  });

  it('strefa spokoju: ruch < 1 px nie przesuwa krzyżyka', () => {
    expect(holdStill({ x: 10, y: 10 }, { x: 10.6, y: 10.5 })).toEqual({ x: 10, y: 10 });
    expect(holdStill({ x: 10, y: 10 }, { x: 11.5, y: 10 })).toEqual({ x: 11.5, y: 10 });
    expect(holdStill(null, { x: 3, y: 4 })).toEqual({ x: 3, y: 4 });
  });

  it('szybki skok idzie od razu', () => {
    expect(run([{ x: 0, y: 0, t: 0 }, { x: 40, y: 0, t: 8 }])).toEqual({ x: 40, y: 0 });
  });
});
