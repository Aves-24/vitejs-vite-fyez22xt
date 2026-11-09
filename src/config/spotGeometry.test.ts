import { describe, it, expect } from 'vitest';
import { spotGeometryOf, scoreSpot, sheetForArrow, nearestSpot, DOUBLE_COLUMN, WA_SPOT_RINGS, WA_SPOT_ZONES } from './spotGeometry';
import { calculateSpotScore } from '../utils/targetScoring';
import { keypadValuesFor, isSpotFace, selectableTargetIdsFor, resolveTargetFace } from './targetFaces';
import { statsGroupOf } from './statsGroups';
import { centerFor } from '../utils/spread';
import { ringScale } from '../utils/arrowStats';

describe('geometria spotów', () => {
  it('3-Spot: te same środki i promień co wcześniej na sztywno', () => {
    const g = spotGeometryOf('3-Spot')!;
    expect(g.spots.map(s => [s.id, s.cx, s.cy])).toEqual([
      ['L0', 75, 66], ['L1', 75, 200], ['L2', 75, 333], ['R0', 225, 66], ['R1', 225, 200], ['R2', 225, 333],
    ]);
    expect(g.r).toBe(62.5);
    expect(g.rings.map(r => g.r * r.f)).toEqual([62.5, 50, 37.5, 25, 12.5, 6.25]);
    expect(spotGeometryOf('Vertical 3-Spot')!.spots.map(s => s.cx)).toEqual([150, 150, 150]);
    expect(spotGeometryOf('122cm')).toBeNull();
  });

  it('scoreSpot na 3-Spocie = calculateSpotScore (siatka, poza samymi granicami)', () => {
    const g = { ...DOUBLE_COLUMN, rings: WA_SPOT_RINGS, zones: WA_SPOT_ZONES };
    let checked = 0;
    for (let x = 1; x < 300; x += 3.7) for (let y = 1; y < 400; y += 3.3) {
      for (const t2 of [false, true]) {
        const d = Math.min(...g.spots.map(s => Math.hypot(x - s.cx, y - s.cy)));
        if (Math.abs((d / 12.5) - Math.round(d / 12.5)) < 0.02 || Math.abs(d - 6.25) < 0.1) continue; // granica
        const a = calculateSpotScore(x, y, false, t2);
        const b = scoreSpot(g, x, y, t2 ? 1 : 0);
        expect(b.val, `${x},${y},${t2}`).toBe(a.val);
        if (a.val !== 'M') expect(b.sId).toBe(a.sId);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(3000);
  });
});

describe('Vegas 3×20 (trójkąt)', () => {
  const g = spotGeometryOf('Vegas 3-Spot')!;
  it('dwie kartki po trzy spoty w trójkącie, bez nakładania', () => {
    expect(isSpotFace('Vegas')).toBe(true);
    expect(g.sheets).toHaveLength(2);
    for (const sheet of [0, 1]) {
      const sp = g.spots.filter(s => s.sheet === sheet);
      expect(sp).toHaveLength(3);
      // góra na środku, dwa niżej po bokach
      expect(sp[0].cx).toBe(150);
      expect(sp[1].cy).toBe(sp[2].cy);
      expect(sp[1].cy).toBeGreaterThan(sp[0].cy);
      for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) {
        expect(Math.hypot(sp[i].cx - sp[j].cx, sp[i].cy - sp[j].cy)).toBeGreaterThan(2 * g.r);
      }
      // spoty mieszczą się w kartce
      const s = g.sheets[sheet];
      for (const p of sp) {
        expect(p.cx - g.r).toBeGreaterThanOrEqual(s.x);
        expect(p.cx + g.r).toBeLessThanOrEqual(s.x + s.w);
        expect(p.cy - g.r).toBeGreaterThanOrEqual(s.y);
        expect(p.cy + g.r).toBeLessThanOrEqual(s.y + s.h);
      }
    }
  });

  it('punktacja 6–10 + X, strzały 1–3 górna kartka, 4–6 dolna', () => {
    const top = g.spots[0];
    expect(scoreSpot(g, top.cx, top.cy, 0).val).toBe('X');
    expect(scoreSpot(g, top.cx + 7, top.cy, 0).val).toBe('10');
    expect(scoreSpot(g, top.cx + 15, top.cy, 0).val).toBe('9');
    expect(scoreSpot(g, top.cx + 49, top.cy, 0).val).toBe('6');
    expect(scoreSpot(g, top.cx + 51, top.cy, 0).val).toBe('M');
    expect(scoreSpot(g, top.cx, top.cy, 0).sId).toBe('A0');
    // Strzała w dolną kartkę, gdy aktywna górna = M (jak blokada drugiej kolumny).
    const low = g.spots[3];
    expect(scoreSpot(g, low.cx, low.cy, 0).val).toBe('M');
    expect(scoreSpot(g, low.cx, low.cy, 1)).toEqual({ val: 'X', sId: 'B0' });
    expect([0, 1, 2, 3, 4, 5].map(i => sheetForArrow(g, i))).toEqual([0, 0, 0, 1, 1, 1]);
  });

  it('klawiatura i lista tarcz jak 3-Spot (tarcze WA, świat statystyk tarczowy)', () => {
    expect(keypadValuesFor('Vegas 3-Spot')).toEqual(['X', '10', '9', '8', '7', '6']);
    expect(selectableTargetIdsFor('Goły (Barebow)')).toContain('Vegas 3-Spot');
    expect(selectableTargetIdsFor('Goły (Barebow)', 'field')).not.toContain('Vegas 3-Spot');
    expect(statsGroupOf({ targetType: 'Vegas 3-Spot' })).toBe('target');
  });

  it('skupienie i statystyki strzał liczą względem właściwego spotu', () => {
    const p = g.spots[4];
    expect(centerFor('Vegas 3-Spot', p.cx + 3, p.cy - 2)).toEqual({ cX: p.cx, cY: p.cy });
    expect(ringScale('Vegas 3-Spot')).toEqual({ unit: 10, cm: 2 });
    expect(nearestSpot(g, 10, 390).id).toBe('B1');
  });
});

describe('WA Field 20 cm 3-fach', () => {
  const g = spotGeometryOf('Field 20cm 3-Spot')!;
  it('geometria 3-Spota, strefy 6–1, czarny spot z żółtym środkiem', () => {
    expect(g.spots).toEqual(spotGeometryOf('3-Spot')!.spots);
    const c = g.spots[0];
    expect(scoreSpot(g, c.cx, c.cy, 0).val).toBe('6');
    expect(scoreSpot(g, c.cx + 10, c.cy, 0).val).toBe('5');
    expect(scoreSpot(g, c.cx + 20, c.cy, 0).val).toBe('4');
    expect(scoreSpot(g, c.cx + 60, c.cy, 0).val).toBe('1');
    expect(scoreSpot(g, c.cx + 64, c.cy, 0).val).toBe('M');
    expect(g.rings[0].fill).toBe('#333333');
    expect(g.rings[5].fill).toBe('#F2C94C');
  });
  it('teren: klawiatura 6–1, tylko przy zestawie Feld, świat terenu', () => {
    expect(keypadValuesFor('Field 20cm 3-Spot')).toEqual(['6', '5', '4', '3', '2', '1']);
    expect(selectableTargetIdsFor('Klasyczny (Recurve)', 'field')).toContain('Field 20cm 3-Spot');
    expect(selectableTargetIdsFor('Klasyczny (Recurve)')).not.toContain('Field 20cm 3-Spot');
    expect(statsGroupOf({ targetType: 'WA Field 20cm' })).toBe('field');
    expect(resolveTargetFace('Feld 20cm 3-fach').id).toBe('Field 20cm 3-Spot');
  });
});
