import { describe, it, expect } from 'vitest';
import { keypadValuesFor } from './targetFaces';

describe('keypadValuesFor — klawiatura tylko z możliwymi wartościami', () => {
  it('3-Spot: X, 10–6', () => {
    expect(keypadValuesFor('3-Spot')).toEqual(['X', '10', '9', '8', '7', '6']);
    expect(keypadValuesFor('Vertical 3-Spot')).toEqual(['X', '10', '9', '8', '7', '6']);
  });
  it('80cm 6-Ring: X, 10–5', () => {
    expect(keypadValuesFor('80cm (6-Ring)')).toEqual(['X', '10', '9', '8', '7', '6', '5']);
  });
  it('pełna tarcza: X, 10–1', () => {
    expect(keypadValuesFor('122cm')).toHaveLength(11);
    expect(keypadValuesFor('Full').at(-1)).toBe('1');
  });
  it('dmuchawka 20 cm: X, 10–6; dmuchawka 3-5-7: tylko strefy', () => {
    expect(keypadValuesFor('Blowgun 20cm')).toEqual(['X', '10', '9', '8', '7', '6']);
    expect(keypadValuesFor('Blowgun 3-5-7')).toEqual(['7', '5', '3']);
  });
});
