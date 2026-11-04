import { describe, expect, it } from 'vitest';
import { keepSegments, keptTime, noteShotAt } from './mirrorOverlay';
import type { TechShot } from '../views/DelayMirrorSeries';

const shot = (n: number, tMs: number | null, note: string | null = null) =>
  ({ n, x: 0, y: 0, tMs, tSource: null, note } as unknown as TechShot);

describe('noteShotAt', () => {
  const shots = [shot(1, 2000, 'Arm'), shot(2, 5000, 'Zug'), shot(3, null, 'x')];
  it('nic przed pierwszym strzalem', () => {
    expect(noteShotAt(shots, 1)).toBeNull();
  });
  it('notatka strzalu 1 PO nim, do strzalu 2', () => {
    expect(noteShotAt(shots, 2)?.n).toBe(1);
    expect(noteShotAt(shots, 4.9)?.n).toBe(1);
    expect(noteShotAt(shots, 5)?.n).toBe(2);
    expect(noteShotAt(shots, 60)?.n).toBe(2);
  });
});

describe('keepSegments / keptTime', () => {
  it('bez ciec = caly zakres', () => {
    expect(keepSegments({ start: 1, end: 9 }, [])).toEqual([{ start: 1, end: 9 }]);
  });
  it('ciecia w srodku, na brzegu i poza zakresem', () => {
    const segs = keepSegments({ start: 0, end: 10 }, [
      { start: 6, end: 7 }, { start: 2, end: 3 }, { start: 9.5, end: 12 }, { start: 20, end: 21 },
    ]);
    expect(segs).toEqual([{ start: 0, end: 2 }, { start: 3, end: 6 }, { start: 7, end: 9.5 }]);
    expect(keptTime(segs, 1)).toBe(1);
    expect(keptTime(segs, 2.5)).toBeNull();
    expect(keptTime(segs, 4)).toBe(3);
    expect(keptTime(segs, 8)).toBe(6);
  });
  it('nachodzace ciecia sie sklejaja', () => {
    expect(keepSegments({ start: 0, end: 10 }, [{ start: 2, end: 5 }, { start: 4, end: 6 }]))
      .toEqual([{ start: 0, end: 2 }, { start: 6, end: 10 }]);
  });
});
