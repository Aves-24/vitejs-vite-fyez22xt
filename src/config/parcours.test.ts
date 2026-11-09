import { describe, it, expect } from 'vitest';
import { multiPartHandicap, expectedArrowScore, faceSpecFor, sessionHandicap } from '../utils/handicapEngine';
import { handicapOfSession, applySessionsToRank, rankFromStored, storedForWorld } from '../utils/rankEngine';
import { distanceMeters } from './distances';
import { hasPerEndTargets, isParcours } from './parcours';

// [PARCOURS 2026-11-09] Runda terenowa: każda tarcza z własnym dystansem.
describe('handicap rundy wielodystansowej', () => {
  it('jedna część = zwykły handicap sesji', () => {
    const avg = 4.3;
    expect(multiPartHandicap([{ arrows: 4, distanceM: 30, targetType: 'IFAA Field 50cm' }], avg * 4))
      .toBe(sessionHandicap(avg, 30, 'IFAA Field 50cm'));
  });

  it('suma oczekiwanych wyników z różnych tarcz wraca do tego samego handicapu', () => {
    const parts = [
      { arrows: 4, distanceM: distanceMeters('80yd'), targetType: 'IFAA Field 65cm' },
      { arrows: 4, distanceM: distanceMeters('40yd'), targetType: 'IFAA Field 50cm' },
      { arrows: 4, distanceM: distanceMeters('20yd'), targetType: 'IFAA Field 35cm' },
      { arrows: 4, distanceM: distanceMeters('30ft'), targetType: 'IFAA Field 20cm 4-Spot' },
    ];
    const expected = parts.reduce((s, p) => s + p.arrows * expectedArrowScore(42, p.distanceM, faceSpecFor(p.targetType)!), 0);
    expect(multiPartHandicap(parts, expected)).toBe(42);
  });

  it('część poza modelem → null', () => {
    expect(multiPartHandicap([{ arrows: 4, distanceM: 0, targetType: 'IFAA Field 50cm' }], 16)).toBeNull();
    expect(multiPartHandicap([], 0)).toBeNull();
  });
});

describe('sesja Parcours w randze', () => {
  const ends = [
    { arrows: ['5', '5', '4', '4'], distance: '50yd', targetType: 'IFAA Field 50cm' },
    { arrows: ['5', '4', '4', '3'], distance: '25yd', targetType: 'IFAA Field 35cm' },
    { arrows: ['X', '5', '4', '3'], distance: '30ft', targetType: 'IFAA Field 20cm 4-Spot' },
  ];
  it('rozpoznanie serii z własnymi tarczami', () => {
    expect(isParcours({ distance: 'Parcours' })).toBe(true);
    expect(hasPerEndTargets(ends)).toBe(true);
    expect(hasPerEndTargets([{ arrows: ['5'] }])).toBe(false);
  });
  it('handicap z serii, ranga IFAA', () => {
    const s = { score: 51, scoreArrows: 12, distance: 'Parcours', targetType: 'IFAA Field 50cm', bowClass: 'Goły (Barebow)', ends };
    const hc = handicapOfSession(s)!;
    expect(hc).toBeGreaterThan(0);
    expect(hc).toBeLessThan(150);
    // Bez serii (dystans „Parcours” = 0 m) nie dałoby się policzyć.
    expect(handicapOfSession({ ...s, ends: undefined })).toBeNull();
    const out = applySessionsToRank(null, [s, s, s])!;
    expect(rankFromStored(storedForWorld(out, 'ifaa')).handicap).toBe(hc);
  });
});
