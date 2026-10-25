import { describe, it, expect } from 'vitest';
import {
  HANDICAP_MAX, HANDICAP_MIN, calculateCurrentHandicap, expectedArrowScore, faceSpecFor, sessionHandicap, sigmaR,
} from './handicapEngine';
import {
  HANDICAP_WINDOW, MIN_SESSIONS_FOR_RANK, RANK_VERSION, TARGET_RANKS, applySessionsToRank, handicapOfSession,
  levelForHandicap, levelThreshold, progressToNext, rankBowOf, rankFromStored, type RankBow, type RankSession,
} from './rankEngine';
import { BLOWGUN_FACE_ID } from '../config/targets/blowgun';

// Uzupełnienie rankEngine.test.ts: przypadki brzegowe handicapu i rangi.
const s = (avg: number, distance = '70m', targetType = '122cm', bowClass = 'Klasyczny (Recurve)'): RankSession =>
  ({ score: Math.round(avg * 60), scoreArrows: 60, distance, targetType, bowClass });
const BOWS: RankBow[] = ['RECURVE', 'COMPOUND', 'BAREBOW', 'TRADITIONAL'];

describe('handicapEngine — model', () => {
  it('rozrzut rośnie z handicapem i z dystansem', () => {
    expect(sigmaR(40, 70)).toBeGreaterThan(sigmaR(30, 70));
    expect(sigmaR(30, 70)).toBeGreaterThan(sigmaR(30, 18));
  });

  it('wyższy handicap = niższa oczekiwana średnia (na każdej tarczy)', () => {
    ['40cm', '3-Spot', '122cm', '80cm (6-Ring)'].forEach(t => {
      const spec = faceSpecFor(t)!;
      for (let h = 0; h < 150; h += 10) {
        expect(expectedArrowScore(h + 10, 30, spec)).toBeLessThan(expectedArrowScore(h, 30, spec));
      }
    });
  });

  it('oczekiwana średnia mieści się między 0 a 10', () => {
    const spot = faceSpecFor('3-Spot')!;
    expect(expectedArrowScore(0, 18, spot)).toBeLessThanOrEqual(10);
    // Na spocie wyjście poza 6 to 0 — przy ogromnym rozrzucie średnia spada pod 6.
    expect(expectedArrowScore(150, 18, spot)).toBeGreaterThanOrEqual(0);
  });

  it('geometria tarcz z katalogu', () => {
    expect(faceSpecFor('40cm')).toEqual({ diameterM: 0.4, minRing: 1 });
    expect(faceSpecFor('3-Spot')).toEqual({ diameterM: 0.4, minRing: 6 });
    expect(faceSpecFor('122cm')).toEqual({ diameterM: 1.22, minRing: 1 });
    expect(faceSpecFor('60cm')).toEqual({ diameterM: 0.6, minRing: 1 });
  });

  it('dmuchawka i trening techniczny poza modelem', () => {
    expect(faceSpecFor(BLOWGUN_FACE_ID)).toBeNull();
    expect(faceSpecFor('TECHNICAL')).toBeNull();
  });
});

describe('sessionHandicap — granice', () => {
  it('same dziesiątki = 0, same pudła = 150', () => {
    expect(sessionHandicap(10, 18, '40cm')).toBe(HANDICAP_MIN);
    expect(sessionHandicap(10, 70, '122cm')).toBe(HANDICAP_MIN);
    expect(sessionHandicap(0, 18, '40cm')).toBe(HANDICAP_MAX);
  });

  it('błędne dane → null', () => {
    expect(sessionHandicap(8, 0, '122cm')).toBeNull();
    expect(sessionHandicap(-1, 70, '122cm')).toBeNull();
    expect(sessionHandicap(NaN, 70, '122cm')).toBeNull();
  });

  it('zaokrąglenie w górę: model przy h nie przekracza średniej, przy h−1 już tak', () => {
    const spec = faceSpecFor('122cm')!;
    [6.5, 7.3, 8.0, 8.8, 9.4].forEach(avg => {
      const h = sessionHandicap(avg, 70, '122cm')!;
      expect(expectedArrowScore(h, 70, spec)).toBeLessThanOrEqual(avg + 1e-9);
      expect(expectedArrowScore(h - 1, 70, spec)).toBeGreaterThan(avg);
    });
  });

  it('lepsza średnia = niższy handicap', () => {
    const hs = [6, 7, 8, 9].map(a => sessionHandicap(a, 18, '40cm')!);
    expect(hs).toEqual([...hs].sort((a, b) => b - a));
  });

  it('ta sama średnia z dalszego dystansu = lepszy handicap', () => {
    expect(sessionHandicap(8, 50, '122cm')!).toBeLessThan(sessionHandicap(8, 30, '122cm')!);
  });
});

describe('calculateCurrentHandicap', () => {
  it('odrzuca wartości spoza skali', () => {
    expect(calculateCurrentHandicap([NaN, -1, 200, 40])).toBe(40);
    expect(calculateCurrentHandicap([NaN])).toBeNull();
  });

  it('jedna sesja = jej handicap', () => {
    expect(calculateCurrentHandicap([42])).toBe(42);
  });

  it('z 10 sesji bierze 6 najlepszych', () => {
    expect(calculateCurrentHandicap([100, 90, 80, 70, 60, 50, 40, 30, 20, 10])).toBe(35);
  });

  it('z 2 sesji bierze lepszą', () => {
    expect(calculateCurrentHandicap([31, 30])).toBe(30);
  });

  it('nie zmienia przekazanej listy', () => {
    const list = [50, 30, 40];
    calculateCurrentHandicap(list);
    expect(list).toEqual([50, 30, 40]);
  });
});

describe('rankEngine — progi', () => {
  it('10 rang od WHITE I do GOLD II', () => {
    expect(TARGET_RANKS.map(r => r.level)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(TARGET_RANKS[0].name).toBe('WHITE I');
    expect(TARGET_RANKS[9].name).toBe('GOLD II');
  });

  it('progi recurve 16…72 co 7', () => {
    expect([10, 9, 8, 7, 6, 5, 4, 3, 2].map(l => levelThreshold(l, 'RECURVE')))
      .toEqual([16, 23, 30, 37, 44, 51, 58, 65, 72]);
  });

  it('wyższy poziom = ostrzejszy próg, dla każdego łuku', () => {
    BOWS.forEach(b => {
      for (let l = 2; l < 10; l++) expect(levelThreshold(l + 1, b)).toBeLessThan(levelThreshold(l, b));
    });
  });

  it('compound najostrzej, barebow najłagodniej; tradycyjny jak barebow', () => {
    for (let l = 2; l <= 10; l++) {
      expect(levelThreshold(l, 'COMPOUND')).toBeLessThan(levelThreshold(l, 'RECURVE'));
      expect(levelThreshold(l, 'RECURVE')).toBeLessThan(levelThreshold(l, 'BAREBOW'));
      expect(levelThreshold(l, 'TRADITIONAL')).toBe(levelThreshold(l, 'BAREBOW'));
    }
  });

  it('klasa łuku z nazwy', () => {
    expect(rankBowOf('Klasyczny (Recurve)')).toBe('RECURVE');
    expect(rankBowOf('Goły (Barebow)')).toBe('BAREBOW');
    expect(rankBowOf('Tradycyjny')).toBe('TRADITIONAL');
    expect(rankBowOf('coś innego')).toBe('RECURVE');
    expect(rankBowOf(null)).toBe('RECURVE');
  });
});

describe('levelForHandicap', () => {
  it('HC 0 = GOLD II, HC 150 = WHITE I', () => {
    BOWS.forEach(b => {
      expect(levelForHandicap(0, b)).toBe(10);
      expect(levelForHandicap(150, b)).toBe(1);
    });
  });

  it('dokładnie na progu = ten poziom, 1 wyżej = poziom niżej', () => {
    expect(levelForHandicap(30, 'RECURVE')).toBe(8);
    expect(levelForHandicap(31, 'RECURVE')).toBe(7);
  });

  it('awans działa od razu, mimo poprzedniego poziomu', () => {
    expect(levelForHandicap(16, 'RECURVE', 7)).toBe(10);
  });

  it('duże pogorszenie zrzuca rangę mimo hamulca', () => {
    expect(levelForHandicap(150, 'RECURVE', 7)).toBe(1);
  });
});

describe('progressToNext', () => {
  it('na dolnej granicy poziomu 0%, blisko następnego progu dużo', () => {
    expect(progressToNext(37, 7, 'RECURVE')).toEqual({ progress: 0, nextHandicap: 30 });
    expect(progressToNext(31, 7, 'RECURVE')).toEqual({ progress: 86, nextHandicap: 30 });
  });

  it('GOLD II: 100% i brak następnej rangi', () => {
    expect(progressToNext(5, 10, 'RECURVE')).toEqual({ progress: 100, nextHandicap: null });
  });

  it('postęp zawsze 0–100', () => {
    [0, 20, 50, 100, 150].forEach(h => {
      for (let l = 1; l <= 10; l++) {
        const p = progressToNext(h, l, 'RECURVE').progress;
        expect(p).toBeGreaterThanOrEqual(0);
        expect(p).toBeLessThanOrEqual(100);
      }
    });
  });
});

describe('ranga z sesji', () => {
  it('pusty profil: WHITE I, bez łuku i handicapu', () => {
    expect(rankFromStored(null)).toMatchObject({
      level: 1, rankName: 'WHITE I', bow: null, handicap: null, sessions: 0, bestLevel: 1,
    });
  });

  it('sesja bez strzał się nie liczy', () => {
    const empty = { score: 0, scoreArrows: 0, distance: '70m', targetType: '122cm' };
    expect(handicapOfSession(empty)).toBeNull();
    expect(applySessionsToRank(null, [empty])).toBeNull();
  });

  it(`pamięta tylko ${HANDICAP_WINDOW} ostatnich sesji na łuk, najnowsza pierwsza`, () => {
    const many = Array.from({ length: 12 }, () => s(8));
    const out = applySessionsToRank(null, [...many, s(9.5)])!;
    expect(out.hcByBow.RECURVE).toHaveLength(HANDICAP_WINDOW);
    expect(out.hcByBow.RECURVE![0]).toBe(sessionHandicap(9.5, 70, '122cm'));
  });

  it(`ranga dopiero od ${MIN_SESSIONS_FOR_RANK} sesji tego samego łuku`, () => {
    const out = applySessionsToRank(null, [s(8), s(8), s(8, '50m', '80cm (6-Ring)', 'Bloczkowy (Compound)')])!;
    expect(out.levelByBow).toEqual({});
    expect(out.currentHandicap).toBeNull();
  });

  it('najlepsza ranga nigdy nie spada', () => {
    const good = applySessionsToRank(null, [1, 2, 3].map(() => s(9.3)))!;
    const bad = applySessionsToRank(good, Array.from({ length: 10 }, () => s(5)))!;
    expect(bad.level).toBeLessThan(good.level);
    expect(bad.bestLevel).toBe(good.bestLevel);
  });

  it('zapisuje wersję pól i pola dla innych ekranów', () => {
    const out = applySessionsToRank(null, [1, 2, 3].map(() => s(8)))!;
    expect(out.rankVersion).toBe(RANK_VERSION);
    expect(out).toMatchObject({ level: 7, rankName: 'RED I', currentHandicap: 34 });
  });

  it('nie zmienia poprzedniego stanu', () => {
    const prev = applySessionsToRank(null, [s(8), s(8)])!;
    const copy = JSON.parse(JSON.stringify(prev));
    applySessionsToRank(prev, [s(9)]);
    expect(prev).toEqual(copy);
  });
});
