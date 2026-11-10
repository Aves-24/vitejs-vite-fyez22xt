import { describe, it, expect } from 'vitest';
import { animalPoints, stationResult, stationDone, animalSummary, isAnimalRound } from './animalRound';
import { statsGroupOf } from './statsGroups';
import { rankWorldOf, handicapOfSession } from '../utils/rankEngine';
import { IFAA_ANIMAL_FACE_ID } from './targets/ifaaAnimal';
import { selectableTargetIds } from './targetFaces';

describe('animal round', () => {
  it('punkty IFAA: 20/18, 16/14, 12/10, dalej 0', () => {
    expect([0, 1, 2, 3].map(i => animalPoints(i, 'K'))).toEqual([20, 16, 12, 0]);
    expect([0, 1, 2].map(i => animalPoints(i, 'W'))).toEqual([18, 14, 10]);
  });

  it('wynik stanowiska i zamknięcie', () => {
    expect(stationResult(['M', '16'])).toEqual({ arrow: 2, hit: 'K', points: 16 });
    expect(stationResult(['18'])).toEqual({ arrow: 1, hit: 'W', points: 18 });
    expect(stationResult(['M', 'M', 'M'])).toBeNull();
    expect(stationDone(['M'])).toBe(false);
    expect(stationDone(['M', '14'])).toBe(true);
    expect(stationDone(['M', 'M', 'M'])).toBe(true);
  });

  it('Trefferquote', () => {
    const s = animalSummary([{ arrows: ['20'] }, { arrows: ['M', '14'] }, { arrows: ['M', 'M', 'M'] }, { arrows: ['M', 'M', '12'] }]);
    expect(s).toMatchObject({ stations: 4, score: 46, byArrow: [1, 1, 1], kills: 2, wounds: 1, misses: 1 });
    expect(s.perStation).toBe(11.5);
  });

  it('osobny świat, bez rangi i handicapu, nie na listach tarcz', () => {
    expect(isAnimalRound({ distance: 'Animal' })).toBe(true);
    expect(statsGroupOf({ targetType: IFAA_ANIMAL_FACE_ID })).toBe('animal');
    expect(rankWorldOf({ targetType: IFAA_ANIMAL_FACE_ID })).toBeNull();
    expect(handicapOfSession({ score: 300, scoreArrows: 40, distance: 'Animal', targetType: IFAA_ANIMAL_FACE_ID } as any)).toBeNull();
    expect(selectableTargetIds()).not.toContain(IFAA_ANIMAL_FACE_ID);
  });
});
