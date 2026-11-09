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
      expect(at(0)).toBe('X'); // X-ring 0,1 D (remisy), liczy się 5
      expect(at(16)).toBe('5');
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

  it('klawiatura z X (= 5, licznik remisów): Field X/5/4/3, Indoor X/5–1, 5-Spot 5/4 bez X', () => {
    expect(keypadValuesFor('IFAA Field 35cm')).toEqual(['X', '5', '4', '3']);
    expect(keypadValuesFor('IFAA Hunter 20cm 4-Spot')).toEqual(['X', '5', '4', '3']);
    expect(keypadValuesFor('IFAA Indoor 40cm')).toEqual(['X', '5', '4', '3', '2', '1']);
    expect(keypadValuesFor('IFAA Indoor 5-Spot')).toEqual(['5', '4']);
  });

  it('Indoor 40: środek 8 cm, co 4 cm', () => {
    const f = resolveTargetFace('IFAA Indoor 40cm');
    const at = (r: number) => scoreSingleFace(f, 150 + r, 150).val;
    expect([at(10), at(20), at(45), at(75), at(105), at(140), at(151)]).toEqual(['X', '5', '4', '3', '2', '1', 'M']);
  });

  it('20 cm 4-Spot: cztery tarczki 2×2, jedna kartka na 4 strzały', () => {
    const g = spotGeometryOf('IFAA Field 20cm 4-Spot')!;
    expect(isSpotFace('IFAA Field 20cm 4-Spot')).toBe(true);
    expect(g.spots).toHaveLength(4);
    expect([0, 1, 2, 3].map(i => sheetForArrow(g, i))).toEqual([0, 0, 0, 0]);
    const s = g.spots[3];
    expect(scoreSpot(g, s.cx, s.cy, 0)).toEqual({ val: 'X', sId: 'Q3' });
    expect(scoreSpot(g, s.cx + 10, s.cy, 0).val).toBe('5');
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

  it('osobny świat statystyk IFAA (skala 5) z własnym handicapem', () => {
    expect(statsGroupOf({ targetType: 'DFBV Feld 50cm' })).toBe('ifaa');
    expect(statsGroupOfSetup({ discipline: 'Goły (Barebow)', style: 'ifaa' })).toBe('ifaa');
    expect(scaleMaxOf('ifaa')).toBe(5);
    expect(zonesOf([{ arrows: ['5', '5', '4', '3', 'M'] }], 'ifaa')).toEqual([2, 1, 1, 0, 0, 1]);
    expect(zoneIndexOf('2', 'ifaa')).toBe(3);
    const s = { score: 16, scoreArrows: 4, distance: '30m', bowClass: 'Goły (Barebow)', targetType: 'IFAA Field 50cm' } as any;
    // [RANGA TERENOWA] Handicap z modelu Atkinsona po strefach 5/4/3 — liczba, nie null.
    const hc = handicapOfSession(s)!;
    expect(hc).toBeGreaterThan(0);
    expect(hc).toBeLessThan(150);
  });

  it('lista tarcz tylko przy zestawie IFAA i dobór do dystansu', () => {
    const ifaa = selectableTargetIdsFor('Goły (Barebow)', 'ifaa');
    expect(ifaa).toHaveLength(14);
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

describe('IFAA Expert Field Round', () => {
  it('strefy 5–1 na liniach głównych i pośrednich (0,2 / 0,4 / 0,6 / 0,8 / 1 D)', () => {
    const f = resolveTargetFace('IFAA Field 50cm Expert');
    const at = (r: number) => scoreSingleFace(f, 150 + r, 150).val;
    expect([at(10), at(20), at(45), at(75), at(105), at(140), at(151)]).toEqual(['X', '5', '4', '3', '2', '1', 'M']);
    expect(keypadValuesFor('IFAA Field 35cm Expert')).toEqual(['X', '5', '4', '3', '2', '1']);
    expect(resolveTargetFace('DFBV Feld 65cm Experten').id).toBe('IFAA Field 65cm Expert');
    expect(resolveTargetFace('IFAA Field 50cm Expert').round).toEqual({ arrowsPerEnd: 4, ends: 28 });
  });
  it('20 cm 4-Spot Expert: te same tarczki, punktacja 5–1', () => {
    const g = spotGeometryOf('IFAA Field 20cm 4-Spot Expert')!;
    const s = g.spots[0];
    expect([0, 10, 20, 30, 45, 60, 70].map(dx => scoreSpot(g, s.cx + dx, s.cy, 0).val)).toEqual(['X', '5', '4', '3', '2', '1', 'M']);
  });
  it('lista IFAA ma teraz 14 tarcz (Expert tylko dla Field)', () => {
    const ifaa = selectableTargetIdsFor('Goły (Barebow)', 'ifaa');
    expect(ifaa).toHaveLength(14);
    expect(ifaa.filter(id => id.endsWith('Expert'))).toEqual(['IFAA Field 20cm 4-Spot Expert', 'IFAA Field 35cm Expert', 'IFAA Field 50cm Expert', 'IFAA Field 65cm Expert']);
  });
});

describe('licznik X (IFAA)', async () => {
  const { getStats } = await import('../../utils/endStats');
  const { xPointsFor, arrowPoints } = await import('../../utils/arrowPoints');
  const { faceSpecFor, sessionHandicap } = await import('../../utils/handicapEngine');
  it('X = 5 pkt na IFAA, 10 na WA; liczba X osobno, bez dziesiątek', () => {
    expect(xPointsFor('IFAA Field 50cm')).toBe(5);
    expect(xPointsFor('IFAA Indoor 40cm')).toBe(5);
    expect(xPointsFor('122cm')).toBe(10);
    expect(arrowPoints('X', 5)).toBe(5);
    const st = getStats([{ arrows: ['X', 'X', '5', '4'] }], [], 5);
    expect(st).toMatchObject({ x: 2, t: 0, score: 19, count: 4 });
    // WA bez zmian.
    expect(getStats([{ arrows: ['X', '10', '9'] }])).toMatchObject({ x: 1, t: 2, n: 1, score: 29 });
  });
  it('handicap nie zmienia się przez X (X leży w strefie 5)', () => {
    expect(faceSpecFor('IFAA Field 20cm 4-Spot')!.zones!.map(z => z.value)).toEqual([5, 4, 3]);
    expect(sessionHandicap(4.5, 20, 'IFAA Field 35cm')).toBe(sessionHandicap(4.5, 20, 'IFAA Field 35cm'));
  });
});
