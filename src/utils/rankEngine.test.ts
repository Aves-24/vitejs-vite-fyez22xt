import { describe, it, expect } from 'vitest';
import { expectedArrowScore, faceSpecFor, sessionHandicap, calculateCurrentHandicap } from './handicapEngine';
import { applySessionsToRank, levelForHandicap, levelThreshold, rankBowOf, rankFromStored, type RankSession } from './rankEngine';

const s = (avg: number, distance: string, targetType: string, bowClass = 'Klasyczny (Recurve)'): RankSession =>
  ({ score: Math.round(avg * 60), scoreArrows: 60, distance, targetType, bowClass });

describe('handicapEngine (model rozrzutu)', () => {
  it('liczy wyniki rund zgodne z modelem', () => {
    // H30: 72 strzały na 70 m ≈ 597, 60 strzał na 18 m (spoty) ≈ 555
    const outdoor = faceSpecFor('122cm')!;
    const spot = faceSpecFor('3-Spot')!;
    expect(Math.ceil(72 * expectedArrowScore(30, 70, outdoor))).toBe(597);
    expect(Math.ceil(60 * expectedArrowScore(30, 18, spot))).toBe(555);
  });

  it('hala i 70 m dają różny handicap dla tej samej średniej', () => {
    expect(sessionHandicap(8.0, 70, '122cm')).toBe(34);
    expect(sessionHandicap(9.0, 18, '3-Spot')).toBe(35);
    expect(sessionHandicap(9.0, 70, '122cm')).toBe(19);
  });

  it('pomija tarcze spoza modelu', () => {
    expect(sessionHandicap(8, 18, 'TECHNICAL')).toBeNull();
    expect(faceSpecFor('80cm (6-Ring)')).toEqual({ diameterM: 0.8, minRing: 5 });
  });

  it('bierze średnią najlepszych 60%', () => {
    expect(calculateCurrentHandicap([40, 30, 50, 60, 35])).toBe(35); // 30,35,40
    expect(calculateCurrentHandicap([])).toBeNull();
  });
});

describe('rankEngine (rangi z handicapu)', () => {
  it('progi zależą od łuku', () => {
    expect(levelThreshold(10, 'RECURVE')).toBe(16);
    expect(levelThreshold(2, 'RECURVE')).toBe(72);
    expect(levelThreshold(10, 'COMPOUND')).toBe(3);
    expect(levelThreshold(10, 'BAREBOW')).toBe(36);
    expect(rankBowOf('Bloczkowy (Compound)')).toBe('COMPOUND');
    expect(rankBowOf(undefined)).toBe('RECURVE');
  });

  it('spada dopiero 2 punkty poza próg', () => {
    // RED I recurve = HC ≤ 37
    expect(levelForHandicap(37, 'RECURVE')).toBe(7);
    expect(levelForHandicap(39, 'RECURVE', 7)).toBe(7);
    expect(levelForHandicap(40, 'RECURVE', 7)).toBe(6);
  });

  it('ranga pojawia się po 3 treningach', () => {
    const two = applySessionsToRank(null, [s(8, '70m', '122cm'), s(8, '70m', '122cm')])!;
    expect(rankFromStored(two).handicap).toBeNull();
    expect(rankFromStored(two).sessions).toBe(2);
    const three = applySessionsToRank(two, [s(8, '70m', '122cm')])!;
    const r = rankFromStored(three);
    expect(r.handicap).toBe(34);
    expect(r.level).toBe(7); // RED I
    expect(three.level).toBe(7);
  });

  it('dmuchawka i trening techniczny nie liczą się', () => {
    expect(applySessionsToRank(null, [s(9, '5m', '40cm', 'Dmuchawka (Blasrohr)')])).toBeNull();
    expect(applySessionsToRank(null, [s(9, '18m', 'TECHNICAL')])).toBeNull();
  });

  it('pokazuje najwyższą rangę spośród łuków', () => {
    // Ta sama średnia 8,5: recurve na 70 m to RED II, compound na 50 m (6-Ring) dużo niżej.
    const recurve = [1, 2, 3].map(() => s(8.5, '70m', '122cm'));
    const compound = [1, 2, 3].map(() => s(8.5, '50m', '80cm (6-Ring)', 'Bloczkowy (Compound)'));
    const both = rankFromStored(applySessionsToRank(null, [...recurve, ...compound]));
    const onlyCompound = rankFromStored(applySessionsToRank(null, compound));
    expect(both.bow).toBe('RECURVE');
    expect(both.level).toBe(8);
    expect(onlyCompound.level).toBeLessThan(both.level);
  });
});
