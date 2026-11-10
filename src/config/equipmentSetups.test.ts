import { describe, it, expect } from 'vitest';
import { visibleSetups, canHideSetup, resolveActiveSetup } from './equipmentSetups';

// [UKRYJ ZESTAW 2026-11-10] Ukryty zestaw nie jest widoczny ani aktywny,
// ale zostaje w danych; ostatniego widocznego ukryć nie można.
describe('ukrywanie zestawów', () => {
  const a = { id: 'default', name: 'A', discipline: 'Klasyczny (Recurve)' } as any;
  const b = { id: 'b', name: 'B', discipline: 'Klasyczny (Recurve)', hidden: true } as any;
  const c = { id: 'c', name: 'C', discipline: 'Klasyczny (Recurve)' } as any;

  it('visibleSetups pomija ukryte; gdy wszystkie ukryte — zwraca wszystkie', () => {
    expect(visibleSetups([a, b, c]).map(s => s.id)).toEqual(['default', 'c']);
    expect(visibleSetups([{ ...a, hidden: true }, b]).map(s => s.id)).toEqual(['default', 'b']);
    expect(visibleSetups(undefined)).toEqual([]);
  });

  it('nie można ukryć ostatniego widocznego', () => {
    expect(canHideSetup([a, b, c], 'c')).toBe(true);
    expect(canHideSetup([a, b], 'default')).toBe(false);
    expect(canHideSetup([a], 'default')).toBe(false);
  });

  it('aktywny wskazujący na ukryty → pierwszy widoczny', () => {
    expect(resolveActiveSetup({ setups: [a, b, c], activeSetupId: 'b' } as any)?.id).toBe('default');
    expect(resolveActiveSetup({ setups: [a, b, c], activeSetupId: 'c' } as any)?.id).toBe('c');
    expect(resolveActiveSetup({ setups: [], activeSetupId: 'x' } as any)).toBeNull();
  });
});
