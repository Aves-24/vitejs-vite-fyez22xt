import { describe, it, expect } from 'vitest';
import { expectedArrowScore, faceSpecFor, sessionHandicap } from './handicapEngine';
import { applySessionsToRank, rankFromStored, storedForWorld, rankWorldOf, MIN_SESSIONS_FOR_RANK } from './rankEngine';

// [RANGA TERENOWA 2026-11-09] Handicap ze stref tarczy i osobna ranga dla
// terenu (WA Field) i IFAA — decyzja usera „A: osobna ranga”.

describe('model Atkinsona po strefach', () => {
  it('dla tarcz WA wzór po strefach daje DOKŁADNIE to samo co dotychczasowa pętla pierścieni', () => {
    for (const [id, minRing] of [['122cm', 1], ['80cm (6-Ring)', 5], ['3-Spot', 6]] as const) {
      const spec = faceSpecFor(id)!;
      const ring = spec.diameterM / 20;
      // Te same pierścienie zapisane jako strefy: 10 → r = 1·ring, 9 → 2·ring, …
      const zones = Array.from({ length: 11 - minRing }, (_, k) => ({ rM: (k + 1) * ring, value: 10 - k }));
      for (const hc of [0, 20, 45, 80, 120]) for (const d of [18, 30, 70]) {
        expect(expectedArrowScore(hc, d, { ...spec, zones })).toBeCloseTo(expectedArrowScore(hc, d, spec), 12);
      }
    }
  });

  it('WA Field / IFAA: strefy w metrach z regulaminu', () => {
    const f80 = faceSpecFor('Field 80cm')!;
    expect(f80.zones!.map(z => [Math.round(z.rM * 1000) / 10, z.value])).toEqual([[4, 6], [8, 5], [16, 4], [24, 3], [32, 2], [40, 1]]); // promienie w cm
    const i50 = faceSpecFor('IFAA Field 50cm')!;
    expect(i50.zones!.map(z => [Math.round(z.rM * 1000) / 10, z.value])).toEqual([[5, 5], [15, 4], [25, 3]]);
    const q20 = faceSpecFor('IFAA Hunter 20cm 4-Spot')!;
    expect(q20.zones!.map(z => [Math.round(z.rM * 1000) / 10, z.value])).toEqual([[2, 5], [6, 4], [10, 3]]);
    const five = faceSpecFor('IFAA Indoor 5-Spot')!;
    expect(five.zones!.map(z => [Math.round(z.rM * 1000) / 10, z.value])).toEqual([[4, 5], [8, 4]]);
  });

  it('lepsza średnia = niższy handicap; maksimum skali = handicap 0', () => {
    expect(sessionHandicap(5.5, 30, 'Field 60cm')!).toBeLessThan(sessionHandicap(4.0, 30, 'Field 60cm')!);
    expect(sessionHandicap(4.6, 20, 'IFAA Field 35cm')!).toBeLessThan(sessionHandicap(3.8, 20, 'IFAA Field 35cm')!);
    expect(sessionHandicap(6, 20, 'Field 40cm')).toBe(0);
    expect(sessionHandicap(5, 18, 'IFAA Indoor 40cm')).toBe(0);
  });

  it('ten sam strzelec (handicap) daje spójne wyniki na różnych tarczach', () => {
    // Handicap 40 na 30 m: oczekiwana średnia na WA 80 cm i na terenowej 80 cm
    // przelicza się z powrotem na ten sam handicap.
    const avgField = expectedArrowScore(40, 30, faceSpecFor('Field 80cm')!);
    const avgIfaa = expectedArrowScore(40, 30, faceSpecFor('IFAA Field 50cm')!);
    expect(sessionHandicap(avgField, 30, 'Field 80cm')).toBe(40);
    expect(sessionHandicap(avgIfaa, 30, 'IFAA Field 50cm')).toBe(40);
  });
});

describe('osobna ranga dla każdego świata', () => {
  const s = (avg: number, targetType: string, distance = '30m', bowClass = 'Goły (Barebow)') =>
    ({ score: avg * 24, scoreArrows: 24, distance, targetType, bowClass });

  it('świat sesji', () => {
    expect(rankWorldOf({ targetType: '122cm' })).toBe('target');
    expect(rankWorldOf({ targetType: 'Field 60cm' })).toBe('field');
    expect(rankWorldOf({ targetType: 'IFAA Hunter 50cm' })).toBe('ifaa');
    expect(rankWorldOf({ targetType: '40cm', bowClass: 'Dmuchawka (Blasrohr)' })).toBeNull();
  });

  it('strzelec tylko terenowy dostaje rangę terenową, ranga WA zostaje pusta', () => {
    const out = applySessionsToRank(null, Array.from({ length: MIN_SESSIONS_FOR_RANK }, () => s(4.5, 'Field 60cm')))!;
    expect(out.hcByBow).toBeUndefined(); // nic nie dopisane do rangi WA
    const field = rankFromStored(storedForWorld(out, 'field'));
    expect(field.handicap).not.toBeNull();
    expect(field.level).toBeGreaterThanOrEqual(1);
    expect(field.bow).toBe('BAREBOW');
    expect(rankFromStored(storedForWorld(out, 'target')).handicap).toBeNull();
    expect(rankFromStored(storedForWorld(out, 'ifaa')).handicap).toBeNull();
  });

  it('teren nie zaniża rangi WA (i odwrotnie)', () => {
    const wa = applySessionsToRank(null, [9, 9, 9].map(a => s(a, '80cm')))!;
    const waBefore = rankFromStored(storedForWorld(wa, 'target'));
    // Jak w ScoringView: zwrócone pola dopisujemy do profilu (merge).
    const mixed = { ...wa, ...applySessionsToRank(wa, [2, 2, 2].map(a => s(a, 'Field 80cm')))! };
    const waAfter = rankFromStored(storedForWorld(mixed, 'target'));
    expect(waAfter.handicap).toBe(waBefore.handicap);
    expect(waAfter.level).toBe(waBefore.level);
    expect(rankFromStored(storedForWorld(mixed, 'field')).handicap!).toBeGreaterThan(waBefore.handicap!);
  });

  it('IFAA i WA Field to osobne rangi', () => {
    const out = applySessionsToRank(null, [
      ...[1, 2, 3].map(() => s(4.8, 'IFAA Field 35cm', '20m')),
      ...[1, 2, 3].map(() => s(3.0, 'Field 40cm', '20m')),
    ])!;
    const ifaa = rankFromStored(storedForWorld(out, 'ifaa'));
    const field = rankFromStored(storedForWorld(out, 'field'));
    expect(ifaa.handicap).not.toBeNull();
    expect(field.handicap).not.toBeNull();
    expect(ifaa.handicap).not.toBe(field.handicap);
  });
});
