import { describe, it, expect } from 'vitest';
import { distanceMeters, distanceUnit, formatDistanceIn, compareDistances } from './distances';
import { sessionHandicap } from '../utils/handicapEngine';
import { ifaaFaceForMeters } from './targets/ifaa';

// [JARDY 2026-11-09] IFAA: dystanse w jardach i stopach.
describe('jednostki dystansu', () => {
  it('przeliczenie na metry; metry bez zmian', () => {
    expect(distanceMeters('18m')).toBe(18);
    expect(distanceMeters('70m')).toBe(70);
    expect(distanceMeters('18m barebow')).toBe(18);
    expect(distanceMeters('50yd')).toBe(45.72);
    expect(distanceMeters('80yd')).toBe(73.15);
    expect(distanceMeters('20ft')).toBe(6.1);
    expect(distanceMeters('35ft')).toBe(10.67);
    expect(distanceMeters('')).toBe(0);
    expect(distanceMeters(null)).toBe(0);
  });
  it('jednostka i zapis', () => {
    expect(distanceUnit('50yd')).toBe('yd');
    expect(distanceUnit('30ft')).toBe('ft');
    expect(distanceUnit('18m')).toBe('m');
    expect(distanceUnit('70')).toBe('m');
    expect(formatDistanceIn(50, 'yd')).toBe('50yd');
  });
  it('sortowanie po metrach, nie po liczbie', () => {
    const list = [{ m: '50yd' }, { m: '40m' }, { m: '30ft' }, { m: '50m' }] as any[];
    expect([...list].sort(compareDistances).map(d => d.m)).toEqual(['30ft', '40m', '50yd', '50m']);
  });
  it('handicap i dobór tarczy liczą z metrów (50 yd = 45,72 m)', () => {
    expect(sessionHandicap(4.2, distanceMeters('50yd'), 'IFAA Field 50cm')).toBe(sessionHandicap(4.2, 45.72, 'IFAA Field 50cm'));
    expect(ifaaFaceForMeters(distanceMeters('35ft'))).toBe('IFAA Field 20cm 4-Spot');
    expect(ifaaFaceForMeters(distanceMeters('25yd'))).toBe('IFAA Field 35cm');
    expect(ifaaFaceForMeters(distanceMeters('80yd'))).toBe('IFAA Field 65cm');
  });
});
