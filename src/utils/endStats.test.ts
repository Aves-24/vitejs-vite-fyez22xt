import { describe, it, expect } from 'vitest';
import { getStats } from './endStats';

const end = (...arrows: string[]) => ({ arrows });

describe('getStats — sumy serii', () => {
  it('bez strzał: same zera i średnia 0.00', () => {
    expect(getStats([])).toEqual({ x: 0, t: 0, n: 0, score: 0, count: 0, avg: '0.00' });
  });

  it('pełna seria 6 × X = 60, X liczy się też jako dziesiątka', () => {
    const s = getStats([end('X', 'X', 'X', 'X', 'X', 'X')]);
    expect(s).toMatchObject({ x: 6, t: 6, n: 0, score: 60, count: 6, avg: '10.00' });
  });

  it('10 to dziesiątka, ale nie X', () => {
    expect(getStats([end('10', '10')])).toMatchObject({ x: 0, t: 2, score: 20 });
  });

  it('9 liczy się do dziewiątek', () => {
    expect(getStats([end('9', '9', '9')])).toMatchObject({ n: 3, t: 0, score: 27 });
  });

  it('pozostałe pierścienie tylko do punktów', () => {
    expect(getStats([end('8', '7', '6', '5', '4', '3', '2', '1')]))
      .toMatchObject({ x: 0, t: 0, n: 0, score: 36, count: 8 });
  });

  it('M = 0 pkt, ale to strzała i obniża średnią', () => {
    const s = getStats([end('10', 'M')]);
    expect(s).toMatchObject({ score: 10, count: 2, avg: '5.00' });
  });

  it('pusta wartość nie jest strzałą', () => {
    expect(getStats([end('10', '', '9')])).toMatchObject({ score: 19, count: 2 });
  });

  it('seria bez pola arrows jest pomijana', () => {
    expect(getStats([{}, end('9')])).toMatchObject({ score: 9, count: 1 });
  });

  it('typowa seria mieszana', () => {
    const s = getStats([end('X', '10', '9', '9', '8', 'M')]);
    expect(s).toEqual({ x: 1, t: 2, n: 2, score: 46, count: 6, avg: '7.67' });
  });

  it('sumuje wiele serii', () => {
    const s = getStats([end('X', '10', '9', '8', '7', '6'), end('10', '10', '10', '9', '9', '9')]);
    expect(s).toMatchObject({ x: 1, t: 5, n: 4, score: 107, count: 12 });
  });

  it('dolicza strzały bieżącej, niezatwierdzonej serii', () => {
    const s = getStats([end('10', '10', '10', '10', '10', '10')], ['X', '9']);
    expect(s).toMatchObject({ x: 1, t: 7, n: 1, score: 79, count: 8 });
  });

  it('same strzały bieżącej serii, bez zatwierdzonych', () => {
    expect(getStats([], ['8', 'M'])).toMatchObject({ score: 8, count: 2, avg: '4.00' });
  });

  it('średnia zaokrąglona do 2 miejsc', () => {
    expect(getStats([end('10', '9', '9')]).avg).toBe('9.33');
    expect(getStats([end('10', '10', '9')]).avg).toBe('9.67');
  });

  it('dmuchawka 6–10: X liczony jako 10', () => {
    const s = getStats([end('X', '10', '8', '7', '6', '6')]);
    expect(s).toMatchObject({ x: 1, t: 2, score: 47, count: 6 });
  });

  it('pełny trening 12 × 6 × 10 = 720', () => {
    const ends = Array.from({ length: 12 }, () => end('10', '10', '10', '10', '10', '10'));
    expect(getStats(ends)).toMatchObject({ score: 720, count: 72, t: 72, avg: '10.00' });
  });

  it('nie zmienia przekazanych serii', () => {
    const ends = [end('X', '9')];
    const copy = JSON.parse(JSON.stringify(ends));
    getStats(ends, ['10']);
    expect(ends).toEqual(copy);
  });
});
