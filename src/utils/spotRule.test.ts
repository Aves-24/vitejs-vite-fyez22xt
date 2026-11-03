import { describe, it, expect } from 'vitest';
import { addSpotArrow, rescoreEnd, EndCoord } from './spotRule';

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

describe('przeliczenie serii po przesunięciu strzały', () => {
  it('pełna tarcza: nowe wartości z punktu, klawiatura bez zmian', () => {
    const coords: EndCoord[] = [c(null, 10, 10), { x: null, y: null, spotId: null }, c(null, 20, 20)];
    const out = rescoreEnd(['5', '8', '6'], coords, false, (p) => (p.x === 10 ? '9' : '6'));
    expect(out).toEqual(['9', '8', '6']);
  });

  it('3-Spot: zdjęcie strzały z zajętego spotu przywraca drugiej wartość', () => {
    // Obie w L0 → druga była M. Druga przesunięta do L1 → obie się liczą.
    const coords = [c('L0', 75, 66), c('L1', 75, 200)];
    const out = rescoreEnd(['9', 'M'], coords, true, (p) => (p.y === 66 ? '9' : '10'));
    expect(out).toEqual(['9', '10']);
  });

  it('3-Spot: przesunięcie do zajętego spotu stosuje zasadę', () => {
    const coords = [c('L0', 75, 66), c('L0', 75, 70)];
    const out = rescoreEnd(['9', '8'], coords, true, (p) => (p.y === 66 ? '10' : '8'));
    expect(out).toEqual(['M', '8']);
  });
});
