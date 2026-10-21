import { describe, it, expect } from 'vitest';
import { distanceRangeFor, formatRange, targetFitsDistance } from './targetDistanceRanges';

describe('targetFitsDistance — tarcza ↔ dystans (DSB, decyzja usera 2026-10-21)', () => {
  it('122 cm: 30–90 m', () => {
    expect(targetFitsDistance('122cm', '30m')).toBe(true);
    expect(targetFitsDistance('122cm', '70m')).toBe(true);
    expect(targetFitsDistance('122cm', '90m')).toBe(true);
    expect(targetFitsDistance('122cm', '18m')).toBe(false);
    expect(targetFitsDistance('122cm', '25m')).toBe(false);
  });
  it('stary alias „Full” to też 122 cm', () => {
    expect(targetFitsDistance('Full', '18m')).toBe(false);
    expect(targetFitsDistance('Full', '70m')).toBe(true);
  });
  it('hala: 40 cm i 3-Spot tylko 18 m', () => {
    expect(targetFitsDistance('40cm', '18m')).toBe(true);
    expect(targetFitsDistance('3-Spot', '18m')).toBe(true);
    expect(targetFitsDistance('3-Spot', '30m')).toBe(false);
  });
  it('60 cm 18–25 m, 80 cm 20–50 m', () => {
    expect(targetFitsDistance('60cm', '25m')).toBe(true);
    expect(targetFitsDistance('60cm', '30m')).toBe(false);
    expect(targetFitsDistance('80cm', '50m')).toBe(true);
    expect(targetFitsDistance('80cm (6-Ring)', '60m')).toBe(false);
  });
  it('dystans z etykietą liczy się po metrach', () => {
    expect(targetFitsDistance('122cm', '70m barebow')).toBe(true);
  });
  it('bez ograniczeń: nieznana tarcza, dmuchawka, dystans bez liczby', () => {
    expect(targetFitsDistance('cos-nowego', '18m')).toBe(true);
    expect(distanceRangeFor('Blowgun 20cm')).toBeNull();
    expect(targetFitsDistance('122cm', 'Feld')).toBe(true);
  });
});

describe('formatRange — podpowiedź w UI', () => {
  it('zakres i pojedynczy dystans', () => {
    expect(formatRange('122cm')).toBe('30–90 m');
    expect(formatRange('40cm')).toBe('18 m');
    expect(formatRange('nieznana')).toBe('');
  });
});
