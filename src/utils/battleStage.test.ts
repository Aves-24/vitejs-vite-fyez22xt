import { describe, it, expect } from 'vitest';
import { arrowsShot, compareStage, scoreSeenBy, seesFullScores } from './battleStage';

// Wynik narastający po każdej serii 6 strzał, po `per` punktów na serię.
const ends = (n: number, per: number) =>
  Array.from({ length: n }, (_, i) => ({ a: (i + 1) * 6, s: (i + 1) * per, x: 0, t: 0, n: 0 }));

const club = (over: Record<string, unknown> = {}) => ({
  mode: 'CLUB',
  hostId: 'host',
  status: 'ACTIVE',
  finishedParticipants: ['rafal'],
  liveScores: {
    rafal: { score: 600, ends: ends(12, 50) },
    panx: { score: 100, ends: ends(2, 50) },
    mid: { score: 150, ends: ends(3, 50) },
    host: { score: 0, ends: [] },
  },
  ...over,
});

describe('seesFullScores — kto widzi pełne wyniki', () => {
  it('poza grą klubową każdy', () => {
    expect(seesFullScores({ ...club(), mode: 'LOCAL' }, 'panx')).toBe(true);
    expect(seesFullScores({ ...club(), mode: 'WORLD' }, 'panx')).toBe(true);
  });
  it('w klubowej: ten, kto skończył — tak; kto jeszcze strzela — nie', () => {
    expect(seesFullScores(club(), 'rafal')).toBe(true);
    expect(seesFullScores(club(), 'panx')).toBe(false);
  });
  it('gospodarz, który nie strzelał — tak; gdy zacznie strzelać — już nie', () => {
    expect(seesFullScores(club(), 'host')).toBe(true);
    const shooting = club({ liveScores: { ...club().liveScores, host: { score: 50, ends: ends(1, 50) } } });
    expect(seesFullScores(shooting, 'host')).toBe(false);
  });
  it('zamknięta gra (FINISHED) — każdy', () => {
    expect(seesFullScores(club({ status: 'FINISHED' }), 'panx')).toBe(true);
  });
  it('brak bitwy nie wywraca się', () => {
    expect(seesFullScores(undefined, 'x')).toBe(true);
  });
});

describe('scoreSeenBy — wynik przycięty do etapu patrzącego', () => {
  const b = club();
  const panxArrows = arrowsShot(b, 'panx'); // 12

  it('PanX po 2 seriach widzi Rafała po 2 seriach (100), nie 600', () => {
    expect(scoreSeenBy(b, 'rafal', 'panx', panxArrows, false)?.score).toBe(100);
  });
  it('ktoś za PanX pokazuje się ze swoim ostatnim etapem', () => {
    const seen = scoreSeenBy(club({ liveScores: { ...b.liveScores, mid: { score: 50, ends: ends(1, 50) } } }), 'mid', 'panx', panxArrows, false);
    expect(seen).toEqual({ score: 50, x: 0, t: 0, n: 0, arrows: 6 });
  });
  it('przed pierwszą serią nic nie widać', () => {
    expect(scoreSeenBy(b, 'rafal', 'panx', 0, false)).toBeNull();
  });
  it('własny wynik zawsze pełny', () => {
    expect(scoreSeenBy(b, 'panx', 'panx', 0, false)?.score).toBe(100);
  });
  it('pełny widok bierze aktualny wynik', () => {
    expect(scoreSeenBy(b, 'rafal', 'panx', panxArrows, true)?.score).toBe(600);
  });
  it('stare bitwy bez serii (sam wynik) — w trybie na ślepo nic, w pełnym wynik', () => {
    const legacy = club({ liveScores: { old: 420 } });
    expect(scoreSeenBy(legacy, 'old', 'panx', 30, false)).toBeNull();
    expect(scoreSeenBy(legacy, 'old', 'panx', 30, true)?.score).toBe(420);
  });
});

describe('compareStage — kolejność w rankingu', () => {
  const s = (score: number, x = 0, t = 0, n = 0) => ({ score, x, t, n, arrows: 6 });
  it('więcej punktów wyżej', () => {
    expect([s(50), s(55)].sort(compareStage)[0].score).toBe(55);
  });
  it('remis: decydują X, potem 10, potem 9', () => {
    expect([s(50, 1), s(50, 2)].sort(compareStage)[0].x).toBe(2);
    expect([s(50, 1, 2), s(50, 1, 3)].sort(compareStage)[0].t).toBe(3);
    expect([s(50, 1, 2, 1), s(50, 1, 2, 4)].sort(compareStage)[0].n).toBe(4);
  });
  it('brak wyniku na końcu', () => {
    expect([null, s(10)].sort(compareStage)[1]).toBeNull();
  });
});
