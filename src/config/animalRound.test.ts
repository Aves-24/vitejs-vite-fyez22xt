import { describe, it, expect } from 'vitest';
import { animalPoints, stationResult, stationDone, animalSummary, isAnimalRound, animalFormatById, animalFormatOf } from './animalRound';
import { DBSV_WALD_FACE_ID, DBSV_JAGD_FACE_ID } from './targets/dbsv3d';
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

describe('DBSV 3D (Wald / Jagd)', () => {
  const wald = animalFormatById('dbsv-wald');
  const jagd = animalFormatById('dbsv-jagd');

  it('Waldrunde: Kill 15/10/5, Körper 12/7/2, do 3 strzał', () => {
    expect([0, 1, 2].map(i => animalPoints(i, 'K', wald))).toEqual([15, 10, 5]);
    expect([0, 1, 2].map(i => animalPoints(i, 'W', wald))).toEqual([12, 7, 2]);
    expect(stationDone(['M', 'M'], wald)).toBe(false);
    expect(stationResult(['M', '10'], wald)).toEqual({ arrow: 2, hit: 'K', points: 10 });
  });

  it('Jagdrunde: 1 strzała — Miss od razu zamyka stanowisko', () => {
    expect(stationDone(['M'], jagd)).toBe(true);
    expect(stationResult(['12'], jagd)).toEqual({ arrow: 1, hit: 'W', points: 12 });
  });

  it('te same wartości, różne strefy: 12 = Kill w IFAA (3. strzała), Körper w DBSV (1. strzała); 10 = Wound IFAA, Kill DBSV', () => {
    expect(stationResult(['M', 'M', '12'])?.hit).toBe('K');
    expect(stationResult(['12'], wald)?.hit).toBe('W');
    expect(stationResult(['M', 'M', '10'])?.hit).toBe('W');
    expect(stationResult(['M', '10'], wald)?.hit).toBe('K');
  });

  it('format z tarczy sesji; DBSV bez rangi, poza listami tarcz', () => {
    expect(animalFormatOf(DBSV_JAGD_FACE_ID).id).toBe('dbsv-jagd');
    expect(animalFormatOf('cokolwiek').id).toBe('ifaa');
    expect(statsGroupOf({ targetType: DBSV_WALD_FACE_ID })).toBe('animal');
    expect(rankWorldOf({ targetType: DBSV_WALD_FACE_ID })).toBeNull();
    expect(selectableTargetIds()).not.toContain(DBSV_WALD_FACE_ID);
  });

  it('Trefferquote w formacie DBSV', () => {
    const s = animalSummary([{ arrows: ['15'] }, { arrows: ['M', '7'] }, { arrows: ['M', 'M', 'M'] }], wald);
    expect(s).toMatchObject({ stations: 3, score: 22, byArrow: [1, 1, 0], kills: 1, wounds: 1, misses: 1 });
  });
});
