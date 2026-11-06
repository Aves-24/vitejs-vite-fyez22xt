import { describe, it, expect } from 'vitest';
import { zonesOf, ringLabels, countsForZones } from './zones';

describe('zones', () => {
  it('liczy strefy ze strzał serii', () => {
    expect(zonesOf([{ arrows: ['X', '10', '9', '8', '6', '4'] }, { arrows: ['2', 'M'] }])).toEqual([3, 1, 1, 1, 1, 1]);
  });
  it('etykiety tylko dla dużych i nienakładających się wycinków', () => {
    const labels = ringLabels([56, 30, 10, 2, 1, 1]);
    expect(labels.map(l => l.i).sort()).toEqual([0, 1, 2]);
    expect(ringLabels([0, 0, 0, 0, 0, 0])).toEqual([]);
  });
  it('pomija techniczne, dmuchawkę i treningi bez punktów', () => {
    expect(countsForZones({ score: 50, type: 'Trening', distance: '18m' })).toBe(true);
    expect(countsForZones({ score: 50, type: 'TECHNICAL', distance: '18m' })).toBe(false);
    expect(countsForZones({ score: 0, distance: '18m' })).toBe(false);
    expect(countsForZones({ score: 50, distance: '10m', bowClass: 'Dmuchawka (Blasrohr)' })).toBe(false);
  });
});
