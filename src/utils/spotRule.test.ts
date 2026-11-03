import { describe, it, expect } from 'vitest';
import { addSpotArrow, EndCoord } from './spotRule';

const c = (spotId: string | null, x = 1, y = 1): EndCoord => ({ x, y, spotId });

describe('3-Spot: jedna strzała na spot', () => {
  it('poza spotem = M', () => {
    expect(addSpotArrow([], [], '9', c('')).arrows).toEqual(['M']);
  });

  it('druga strzała w tym samym spocie: liczy się niższa', () => {
    const first = addSpotArrow([], [], '9', c('L0'));
    expect(addSpotArrow(first.arrows, first.coords, '10', c('L0')).arrows).toEqual(['9', 'M']);
    expect(addSpotArrow(first.arrows, first.coords, '7', c('L0')).arrows).toEqual(['M', '7']);
    expect(addSpotArrow(first.arrows, first.coords, '9', c('L0')).arrows).toEqual(['9', 'M']);
  });

  it('wejście nie jest zmieniane', () => {
    const arrows = ['9']; const coords = [c('L0')];
    addSpotArrow(arrows, coords, '7', c('L0'));
    expect(arrows).toEqual(['9']);
  });
});
