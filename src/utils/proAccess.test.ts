import { describe, it, expect } from 'vitest';
import { hasActivePro, freeHistoryStart, FREE_HISTORY_DAYS } from './proAccess';

describe('hasActivePro', () => {
  const now = new Date('2026-10-28T12:00:00').getTime();
  it('stałe PRO i promocja', () => {
    expect(hasActivePro({ isPremium: true }, now)).toBe(true);
    expect(hasActivePro({ isPremiumPromo: true }, now)).toBe(true);
  });
  it('trial/prezent tylko w przyszłości i tylko jako liczba', () => {
    expect(hasActivePro({ trialEndsAt: now + 1 }, now)).toBe(true);
    expect(hasActivePro({ trialEndsAt: now - 1 }, now)).toBe(false);
    expect(hasActivePro({ trialEndsAt: new Date(0).toISOString() }, now)).toBe(false);
  });
  it('brak danych = FREE', () => {
    expect(hasActivePro(null, now)).toBe(false);
    expect(hasActivePro({}, now)).toBe(false);
  });
});

describe('freeHistoryStart', () => {
  it(`północ ${FREE_HISTORY_DAYS} dni wstecz`, () => {
    const s = freeHistoryStart(new Date('2026-10-28T15:30:00').getTime());
    expect(s.getHours()).toBe(0);
    expect(s.getFullYear()).toBe(2026);
    expect(s.getMonth()).toBe(6);   // lipiec
    expect(s.getDate()).toBe(30);
  });
});
