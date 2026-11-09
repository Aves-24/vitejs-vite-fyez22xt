import { describe, it, expect } from 'vitest';
import { resolveTargetFace, keypadValuesFor, selectableTargetIdsFor, isSpotFace } from '../targetFaces';
import { scoreSingleFace } from '../../utils/targetScoring';
import { spotGeometryOf, scoreSpot, sheetForArrow } from '../spotGeometry';
import { statsGroupOf, statsGroupOfSetup, scaleMaxOf, zoneIndexOf } from '../statsGroups';
import { zonesOf } from '../../utils/zones';
import { handicapOfSession } from '../../utils/rankEngine';
import { ifaaFaceForMeters } from './ifaa';
import { faceKeyClass } from '../arrowKeyColors';


describe('IFAA — regulamin (Archers’ Handbook 2017–2018)', () => {
  it('Field 35/50/65: spot 0,2 D = 5, pierścień 0,6 D = 4, reszta = 3', () => {
    for (const id of ['IFAA Field 35cm', 'IFAA Field 50cm', 'IFAA Field 65cm', 'IFAA Hunter 50cm']) {
      const f = resolveTargetFace(id);
      const at = (r: number) => scoreSingleFace(f, 150 + r, 150).val;
      expect(at(0)).toBe('5');
      expect(at(29)).toBe('5');
      expect(at(31)).toBe('4');
      expect(at(89)).toBe('4');
      expect(at(91)).toBe('3');
      expect(at(149)).toBe('3');
      expect(at(151)).toBe('M');
    }
    // 50 cm: spot 10 cm, pierścień 30 cm — 30/150 i 90/150 z 25 cm promienia.
    expect((30 / 150) * 50).toBe(10);
    expect((90 / 150) * 50).toBe(30);
  });

  it('seria jak na zawodach: Field/Hunter 4 strzały × 28 tarcz, Indoor 5 × 12', () => {
    expect(resolveTargetFace('IFAA Field 50cm').round).toEqual({ arrowsPerEnd: 4, ends: 28 });
    expect(resolveTargetFace('IFAA Hunter 20cm 4-Spot').round).toEqual({ arrowsPerEnd: 4, ends: 28 });
    expect(resolveTargetFace('IFAA Indoor 40cm').round).toEqual({ arrowsPerEnd: 5, ends: 12 });
    expect(resolveTargetFace('IFAA Indoor 5-Spot').round).toEqual({ arrowsPerEnd: 5, ends: 12 });
    expect(resolveTargetFace('3-Spot').round).toBeUndefined();
  });

  it('klawiatura bez X (X tylko do remisów): Field 5/4/3, Indoor 5–1, 5-Spot 5/4', () => {
    expect(keypadValuesFor('IFAA Field 35cm')).toEqual(['5', '4', '3']);
    expect(keypadValuesFor('IFAA Hunter 20cm 4-Spot')).toEqual(['5', '4', '3']);
    expect(keypadValuesFor('IFAA Indoor 40cm')).toEqual(['5', '4', '3', '2', '1']);
    expect(keypadValuesFor('IFAA Indoor 5-Spot')).toEqual(['5', '4']);
  });

  it('Indoor 40: środek 8 cm, co 4 cm', () => {
    const f = resolveTargetFace('IFAA Indoor 40cm');
    const at = (r: number) => scoreSingleFace(f, 150 + r, 150).val;
    expect([at(10), at(45), at(75), at(105), at(140), at(151)]).toEqual(['5', '4', '3', '2', '1', 'M']);
  });

  it('20 cm 4-Spot: cztery tarczki 2×2, jedna kartka na 4 strzały', () => {
    const g = spotGeometryOf('IFAA Field 20cm 4-Spot')!;
    expect(isSpotFace('IFAA Field 20cm 4-Spot')).toBe(true);
    expect(g.spots).toHaveLength(4);
    expect([0, 1, 2, 3].map(i => sheetForArrow(g, i))).toEqual([0, 0, 0, 0]);
    const s = g.spots[3];
    expect(scoreSpot(g, s.cx, s.cy, 0)).toEqual({ val: '5', sId: 'Q3' });
    expect(scoreSpot(g, s.cx + 20, s.cy, 0).val).toBe('4');
    expect(scoreSpot(g, s.cx + 60, s.cy, 0).val).toBe('3');
    for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) {
      expect(Math.hypot(g.spots[i].cx - g.spots[j].cx, g.spots[i].cy - g.spots[j].cy)).toBeGreaterThan(2 * g.r);
    }
  });

  it('5-Spot: pięć tarczek jak na kostce, biały środek = 5, niebieski = 4', () => {
    const g = spotGeometryOf('IFAA Indoor 5-Spot')!;
    expect(g.spots).toHaveLength(5);
    expect(g.spots[2]).toMatchObject({ cx: 150, cy: 200 });
    const c = g.spots[0];
    expect(scoreSpot(g, c.cx + 20, c.cy, 0).val).toBe('5');
    expect(scoreSpot(g, c.cx + 40, c.cy, 0).val).toBe('4');
    expect(scoreSpot(g, c.cx + 60, c.cy, 0).val).toBe('M');
    for (let i = 0; i < 5; i++) for (let j = i + 1; j < 5; j++) {
      expect(Math.hypot(g.spots[i].cx - g.spots[j].cx, g.spots[i].cy - g.spots[j].cy)).toBeGreaterThan(2 * g.r);
    }
  });

  it('osobny świat statystyk IFAA (skala 5), bez rangi', () => {
    expect(statsGroupOf({ targetType: 'DFBV Feld 50cm' })).toBe('ifaa');
    expect(statsGroupOfSetup({ discipline: 'Goły (Barebow)', style: 'ifaa' })).toBe('ifaa');
    expect(scaleMaxOf('ifaa')).toBe(5);
    expect(zonesOf([{ arrows: ['5', '5', '4', '3', 'M'] }], 'ifaa')).toEqual([2, 1, 1, 0, 0, 1]);
    expect(zoneIndexOf('2', 'ifaa')).toBe(3);
    const s = { score: 16, scoreArrows: 4, distance: '30m', bowClass: 'Goły (Barebow)', targetType: 'IFAA Field 50cm' } as any;
    expect(handicapOfSession(s)).toBeNull();
  });

  it('lista tarcz tylko przy zestawie IFAA i dobór do dystansu', () => {
    const ifaa = selectableTargetIdsFor('Goły (Barebow)', 'ifaa');
    expect(ifaa).toHaveLength(10);
    expect(ifaa.every(id => id.startsWith('IFAA '))).toBe(true);
    expect(selectableTargetIdsFor('Goły (Barebow)')).not.toContain('IFAA Field 50cm');
    expect(selectableTargetIdsFor('Goły (Barebow)', 'field')).not.toContain('IFAA Field 50cm');
    expect([8, 20, 40, 60].map(ifaaFaceForMeters)).toEqual(['IFAA Field 20cm 4-Spot', 'IFAA Field 35cm', 'IFAA Field 50cm', 'IFAA Field 65cm']);
  });

  it('kolory klawiszy wg tarczy (Field: 5 czarny, 4 biały; Hunter: 5 biały)', () => {
    expect(faceKeyClass('IFAA Field 35cm', '5')).toContain('#333333');
    expect(faceKeyClass('IFAA Field 35cm', '4')).toContain('bg-white');
    expect(faceKeyClass('IFAA Hunter 35cm', '5')).toContain('bg-white');
    expect(faceKeyClass('3-Spot', '9')).toBeNull();
  });
});
