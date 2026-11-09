import { describe, it, expect } from 'vitest';
import { scoreSingleFace } from '../../utils/targetScoring';
import { resolveTargetFace, keypadValuesFor, selectableTargetIdsFor, getTargetDiameterCm } from '../targetFaces';
import { WA_FIELD_80_FACE, fieldFaceForMeters, isFieldFaceId } from './waField';
import { statsGroupOf, statsGroupOfSetup, zoneIndexOf, scaleMaxOf } from '../statsGroups';
import { zonesOf, countsForZones } from '../../utils/zones';
import { handicapOfSession } from '../../utils/rankEngine';
import { BLOWGUN_DISCIPLINE, styleOfSetup } from '../equipmentSetups';

describe('WA Field — tarcze terenowe', () => {
  it('katalog zna 80/60/40 z aliasami i średnicą', () => {
    expect(resolveTargetFace('Field 80cm').diameterCm).toBe(80);
    expect(resolveTargetFace('WA Field 60cm').id).toBe('Field 60cm');
    expect(resolveTargetFace('Feld 40cm').id).toBe('Field 40cm');
    expect(getTargetDiameterCm('Field 60cm')).toBe(60);
  });

  it('punktacja 6–1 po strefach D/10 … D (viewBox 300, środek 150)', () => {
    const at = (r: number) => scoreSingleFace(WA_FIELD_80_FACE, 150 + r, 150).val;
    expect(at(0)).toBe('6');
    expect(at(14.9)).toBe('6');
    expect(at(15.1)).toBe('5');
    expect(at(29.9)).toBe('5');
    expect(at(45)).toBe('4');
    expect(at(75)).toBe('3');
    expect(at(105)).toBe('2');
    expect(at(149)).toBe('1');
    expect(at(151)).toBe('M');
  });

  it('muśnięcie linii liczy wyżej (jak na tarczach WA)', () => {
    expect(scoreSingleFace(WA_FIELD_80_FACE, 150 + 15.5, 150, 0.95).val).toBe('6');
  });

  it('klawiatura: 6..1 bez X', () => {
    expect(keypadValuesFor('Field 40cm')).toEqual(['6', '5', '4', '3', '2', '1']);
  });

  it('lista tarcz: Field tylko przy zestawie „Feld”, a przy nim wyłącznie Field', () => {
    expect(selectableTargetIdsFor('Klasyczny (Recurve)')).not.toContain('Field 80cm');
    expect(selectableTargetIdsFor('Klasyczny (Recurve)', 'target')).not.toContain('Field 80cm');
    expect(selectableTargetIdsFor('Goły (Barebow)', 'field')).toEqual(['Field 80cm', 'Field 60cm', 'Field 40cm', 'Field 20cm 3-Spot']);
    // Dmuchawka ignoruje styl.
    expect(selectableTargetIdsFor(BLOWGUN_DISCIPLINE, 'field').some(id => id.startsWith('Field'))).toBe(false);
  });

  it('tarcza dla dystansu w terenie', () => {
    expect(fieldFaceForMeters(10)).toBe('Field 20cm 3-Spot');
    expect(fieldFaceForMeters(15)).toBe('Field 40cm');
    expect(fieldFaceForMeters(30)).toBe('Field 60cm');
    expect(fieldFaceForMeters(55)).toBe('Field 80cm');
    expect(fieldFaceForMeters(null)).toBe('Field 80cm');
    expect(isFieldFaceId('WA Field 80cm')).toBe(true);
    expect(isFieldFaceId('80cm')).toBe(false);
  });
});

describe('światy statystyk', () => {
  it('trening należy do świata po tarczy (i dyscyplinie dmuchawki)', () => {
    expect(statsGroupOf({ targetType: 'Field 60cm', bowClass: 'Goły (Barebow)' })).toBe('field');
    expect(statsGroupOf({ targetType: '122cm' })).toBe('target');
    expect(statsGroupOf({ targetType: '40cm', bowClass: BLOWGUN_DISCIPLINE })).toBe('blowgun');
    expect(statsGroupOf(null)).toBe('target');
  });

  it('świat zestawu: styl „field” tylko dla łuku', () => {
    expect(statsGroupOfSetup({ discipline: 'Klasyczny (Recurve)', style: 'field' })).toBe('field');
    expect(statsGroupOfSetup({ discipline: 'Klasyczny (Recurve)' })).toBe('target');
    expect(statsGroupOfSetup({ discipline: BLOWGUN_DISCIPLINE, style: 'field' })).toBe('blowgun');
    expect(styleOfSetup({ discipline: BLOWGUN_DISCIPLINE, style: 'field' })).toBe('target');
    expect(styleOfSetup(null)).toBe('target');
  });

  it('strefy terenu: 6/5 złoto, 4–1 czerń, M pudło', () => {
    expect(zonesOf([{ arrows: ['6', '5', '4', '1', 'M', '3'] }], 'field')).toEqual([2, 0, 0, 3, 0, 1]);
    expect(zoneIndexOf('X', 'field')).toBe(0);
    // Domyślny świat bez zmian.
    expect(zonesOf([{ arrows: ['6', '5'] }])).toEqual([0, 0, 2, 0, 0, 0]);
    expect(scaleMaxOf('field')).toBe(6);
    expect(scaleMaxOf('target')).toBe(10);
  });

  it('strefy/forma liczą tylko trening ze swojego świata', () => {
    const field = { score: 30, distance: '30m', targetType: 'Field 60cm' };
    expect(countsForZones(field)).toBe(false);
    expect(countsForZones(field, 'field')).toBe(true);
    expect(countsForZones({ score: 50, distance: '18m', targetType: '3-Spot' }, 'field')).toBe(false);
  });

  it('teren ma własny handicap (model po strefach 6–1), dmuchawka nie', () => {
    const base = { score: 30, scoreArrows: 6, distance: '30m', bowClass: 'Goły (Barebow)' } as any;
    expect(handicapOfSession({ ...base, targetType: 'Field 60cm' })).not.toBeNull();
    expect(handicapOfSession({ ...base, targetType: '122cm' })).not.toBeNull();
    expect(handicapOfSession({ ...base, bowClass: BLOWGUN_DISCIPLINE, targetType: '40cm' })).toBeNull();
  });
});
