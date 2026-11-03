import { describe, it, expect } from 'vitest';
import { calculateSpotScore, scoreSingleFace } from './targetScoring';
import { getStats } from './endStats';
import {
  TARGET_FACES, findTargetFace, friendlyTargetName, resolveTargetFace, selectableTargetIds, selectableTargetIdsFor,
  isSpotFace, isDoubleSpotFace, isVerticalSpotFace, isFullFace, getTargetDiameterCm,
} from '../config/targetFaces';
import { BLOWGUN_FACE_ID, isBlowgunSession } from '../config/targets/blowgun';
import { BLOWGUN357_FACE_ID } from '../config/targets/blowgun357';
import { BLOWGUN40_FACE_ID } from '../config/targets/blowgun40';
import { BLOWGUN_DISCIPLINE } from '../config/equipmentSetups';

// Pełna tarcza: środek (150, 150), strzał w odległości d na prawo od środka.
const at = (faceId: string, d: number) => scoreSingleFace(resolveTargetFace(faceId), 150 + d, 150).val;
// Spot: lewa kolumna x = 75, prawa 225, pion x = 150; środki y = 66 / 200 / 333.
const spot = (x: number, y: number, isVertical = false, isTarget2 = false) => calculateSpotScore(x, y, isVertical, isTarget2);

describe('pełna tarcza 1–10 (122 / 80 / 60 / 40 cm)', () => {
  const FULL = ['122cm', '80cm', '60cm', '40cm'];

  it('środek i promień do 7,5 = X', () => {
    FULL.forEach(f => {
      expect(at(f, 0)).toBe('X');
      expect(at(f, 7.5)).toBe('X');
    });
  });

  it('każdy pierścień co 15: 10, 9, … 1', () => {
    FULL.forEach(f => {
      expect(at(f, 8)).toBe('10');
      for (let ring = 9; ring >= 1; ring--) {
        expect(at(f, (10 - ring) * 15 + 1)).toBe(String(ring));
      }
    });
  });

  it('tuż przed granicą pierścienia — jeszcze wyższa wartość', () => {
    expect(at('122cm', 14.9)).toBe('10');
    expect(at('122cm', 29.9)).toBe('9');
    expect(at('122cm', 149.9)).toBe('1');
  });

  it('poza tarczą = M', () => {
    expect(at('122cm', 151)).toBe('M');
    expect(at('40cm', 200)).toBe('M');
  });

  it('kierunek nie ma znaczenia, liczy się odległość', () => {
    const f = resolveTargetFace('122cm');
    expect(scoreSingleFace(f, 150, 150 - 50).val).toBe('7');
    expect(scoreSingleFace(f, 150 - 30, 150 + 40).val).toBe('7'); // 3-4-5 → d = 50
  });

  it('pełna tarcza nie zwraca id spotu', () => {
    expect(scoreSingleFace(resolveTargetFace('122cm'), 150, 150).sId).toBe('');
  });
});

describe('80 cm 6-Ring (compound)', () => {
  it('punktuje 10..5, X w środku', () => {
    expect(at('80cm (6-Ring)', 0)).toBe('X');
    expect(at('80cm (6-Ring)', 10)).toBe('10');
    expect(at('80cm (6-Ring)', 61)).toBe('6');
    expect(at('80cm (6-Ring)', 89)).toBe('5');
  });

  it('dawne pierścienie 4..1 to pudło', () => {
    expect(at('80cm (6-Ring)', 91)).toBe('M');
    expect(at('80cm (6-Ring)', 140)).toBe('M');
  });

  it('stary alias z Firestore działa', () => {
    expect(scoreSingleFace(resolveTargetFace('WA 80cm (6-Ring)'), 150 + 91, 150).val).toBe('M');
  });
});

describe('3-Spot (dwie kolumny)', () => {
  it('środek spotu = X z id spotu', () => {
    expect(spot(75, 66)).toEqual({ val: 'X', sId: 'L0' });
    expect(spot(75, 200)).toEqual({ val: 'X', sId: 'L1' });
    expect(spot(75, 333)).toEqual({ val: 'X', sId: 'L2' });
  });

  it('pierścienie co 12,5: X do 6,25, potem 10..6', () => {
    expect(spot(75 + 6.25, 66).val).toBe('X');
    expect(spot(75 + 7, 66).val).toBe('10');
    expect(spot(75 + 13, 66).val).toBe('9');
    expect(spot(75 + 26, 66).val).toBe('8');
    expect(spot(75 + 38, 66).val).toBe('7');
    expect(spot(75 + 51, 66).val).toBe('6');
  });

  it('poza spotem = M bez id (spot zostaje wolny)', () => {
    expect(spot(75 + 63, 66)).toEqual({ val: 'M', sId: '' });
    expect(spot(75, 133)).toEqual({ val: 'M', sId: '' }); // między spotami
  });

  it('strzały 1–3 tylko w lewej kolumnie, 4–6 tylko w prawej', () => {
    expect(spot(225, 66, false, false)).toEqual({ val: 'M', sId: '' });
    expect(spot(225, 200, false, true)).toEqual({ val: 'X', sId: 'R1' });
    expect(spot(75, 200, false, true)).toEqual({ val: 'M', sId: '' });
  });
});

describe('Vertical 3-Spot (jedna kolumna)', () => {
  it('spoty w osi x = 150, id V0..V2', () => {
    expect(spot(150, 66, true)).toEqual({ val: 'X', sId: 'V0' });
    expect(spot(150, 333 + 30, true)).toEqual({ val: '8', sId: 'V2' });
  });

  it('numer strzały nie blokuje kolumny', () => {
    expect(spot(150, 200, true, true)).toEqual({ val: 'X', sId: 'V1' });
  });
});

describe('dmuchawka', () => {
  it('spot 20 cm: układ jak 3-Spot 18 m, punktacja 6–10 + X', () => {
    const f = resolveTargetFace(BLOWGUN_FACE_ID);
    expect(f.layout).toBe('spot3-double');
    expect(f.minScoringRing).toBe(6);
    expect(isDoubleSpotFace(BLOWGUN_FACE_ID)).toBe(true);
  });

  it('X z dmuchawki liczy się jako 10 i osobno jako X', () => {
    const shots = [spot(75, 66), spot(75 + 7, 200), spot(75 + 51, 333)].map(s => s.val);
    expect(shots).toEqual(['X', '10', '6']);
    expect(getStats([{ arrows: shots }])).toMatchObject({ x: 1, t: 2, score: 26 });
  });

  it('pełna 40 cm do dmuchawki punktuje jak łucznicza 40 cm', () => {
    [0, 8, 20, 50, 100, 149, 151].forEach(d => expect(at(BLOWGUN40_FACE_ID, d)).toBe(at('40cm', d)));
  });

  it('3-5-7: strefy 7 / 5 / 3, poza = M, bez X', () => {
    expect(at(BLOWGUN357_FACE_ID, 0)).toBe('7');
    expect(at(BLOWGUN357_FACE_ID, 30)).toBe('7');
    expect(at(BLOWGUN357_FACE_ID, 31)).toBe('5');
    expect(at(BLOWGUN357_FACE_ID, 90)).toBe('5');
    expect(at(BLOWGUN357_FACE_ID, 91)).toBe('3');
    expect(at(BLOWGUN357_FACE_ID, 150)).toBe('3');
    expect(at(BLOWGUN357_FACE_ID, 151)).toBe('M');
  });

  it('rozpoznanie sesji z dmuchawki: zestaw rozstrzyga, tarcza tylko bez zestawu', () => {
    expect(isBlowgunSession({ bowClass: BLOWGUN_DISCIPLINE, targetType: '122cm' })).toBe(true);
    expect(isBlowgunSession({ bowClass: 'Klasyczny (Recurve)', targetType: BLOWGUN_FACE_ID })).toBe(false);
    expect(isBlowgunSession({ targetType: BLOWGUN_FACE_ID })).toBe(true);
    expect(isBlowgunSession({ targetType: 'Blasrohr 40cm' })).toBe(true);
    expect(isBlowgunSession({ targetType: '40cm' })).toBe(false);
    expect(isBlowgunSession(null)).toBe(false);
  });
});

describe('katalog tarcz — spójność', () => {
  it('rysunek zgadza się z punktacją: zewnętrzny pierścień = krok × liczba pierścieni', () => {
    TARGET_FACES.filter(f => f.scorable && !f.zones && f.layout === 'single').forEach(f => {
      expect(f.rings[0].r).toBe(f.scoringRingStep * (11 - f.minScoringRing));
    });
  });

  it('strefy 3-5-7 zgadzają się z rysunkiem', () => {
    const f = resolveTargetFace(BLOWGUN357_FACE_ID);
    expect(f.zones!.map(z => z.r)).toEqual([...f.rings].map(r => r.r).reverse());
  });

  it('id i aliasy są unikalne', () => {
    const keys = TARGET_FACES.flatMap(f => [f.id, ...f.aliases]);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('aliasy i nieznane nazwy', () => {
    expect(findTargetFace('Full')?.id).toBe('122cm');
    expect(findTargetFace('3-Spot (Vertical)')?.id).toBe('Vertical 3-Spot');
    expect(findTargetFace('coś')).toBeNull();
    expect(resolveTargetFace('coś').id).toBe('122cm');
    expect(friendlyTargetName('WA 80cm')).toBe('80cm');
    expect(friendlyTargetName('własna')).toBe('własna');
    expect(friendlyTargetName('', '—')).toBe('—');
  });

  it('rodzaje układu', () => {
    expect(isFullFace('122cm')).toBe(true);
    expect(isSpotFace('3-Spot')).toBe(true);
    expect(isVerticalSpotFace('Vertical 3-Spot')).toBe(true);
    expect(isSpotFace('40cm')).toBe(false);
  });

  it('średnica: trening techniczny nie daje zera', () => {
    expect(getTargetDiameterCm('40cm')).toBe(40);
    expect(getTargetDiameterCm('TECHNICAL')).toBe(122);
  });

  it('lista wyboru: łucznik nie widzi tarcz dmuchawki i odwrotnie', () => {
    const archery = selectableTargetIdsFor('Klasyczny (Recurve)');
    const blowgun = selectableTargetIdsFor(BLOWGUN_DISCIPLINE);
    expect(archery).toEqual(['3-Spot', '40cm', '60cm', '80cm (6-Ring)', '80cm', '122cm']);
    expect(blowgun).toEqual([BLOWGUN_FACE_ID, BLOWGUN40_FACE_ID]);
    expect(selectableTargetIdsFor(null)).toEqual(selectableTargetIds());
  });

  it('3-5-7 i Vertical 3-Spot obsługiwane, ale nieproponowane', () => {
    const all = selectableTargetIds();
    expect(all).not.toContain(BLOWGUN357_FACE_ID);
    expect(all).not.toContain('Vertical 3-Spot');
    expect(all).not.toContain('TECHNICAL');
  });
});
