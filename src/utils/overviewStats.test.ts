import { describe, it, expect } from 'vitest';
import { monthlyRhythm, techTopics, weeklyArrowsSplit, handicapSeries } from './overviewStats';

const NOW = new Date(2026, 9, 30, 12).getTime(); // 30.10.2026
const DAY = 86400000;
const at = (daysAgo: number) => NOW - daysAgo * DAY;

describe('monthlyRhythm', () => {
  it('liczy treningi z punktacją, techniczne i zawody w miesiącach kalendarzowych', () => {
    const rows = monthlyRhythm([
      { type: 'Trening', timestamp: at(1) },
      { type: 'TECHNICAL', distance: 'TECH', timestamp: at(2) },
      { type: 'Turniej', timestamp: at(3) },
      { type: 'Trening', timestamp: at(35) },   // wrzesień
      { type: 'Trening', timestamp: at(400) },  // poza oknem
    ], 3, NOW);
    expect(rows.map(r => r.key)).toEqual(['2026-08', '2026-09', '2026-10']);
    expect(rows[2]).toMatchObject({ scored: 1, tech: 1, tourney: 1 });
    expect(rows[1].scored).toBe(1);
    expect(rows[0].scored + rows[0].tech + rows[0].tourney).toBe(0);
  });
});

describe('techTopics', () => {
  it('tematy od najczęstszego, fokus i Delay Mirror, tylko od daty', () => {
    const r = techTopics([
      { type: 'TECHNICAL', timestamp: at(1), totalArrows: 40, topics: ['anker', 'zug'], focus: { text: 'Anker', since: 1 } },
      { type: 'TECHNICAL', timestamp: at(5), totalArrows: 30, topics: ['anker'], source: 'DELAY_MIRROR' },
      { type: 'TECHNICAL', timestamp: at(200), totalArrows: 99, topics: ['zug'] },
      { type: 'Trening', timestamp: at(1), arrows: 72, topics: ['zug'] },
    ], at(90));
    expect(r).toMatchObject({ count: 2, arrows: 70, focus: 1, mirror: 1 });
    expect(r.topics).toEqual([{ id: 'anker', count: 2 }, { id: 'zug', count: 1 }]);
  });
});

describe('weeklyArrowsSplit', () => {
  it('rozdziela strzały z punktacją i techniczne, bieżący tydzień na końcu', () => {
    const w = weeklyArrowsSplit([
      { type: 'Trening', arrows: 72, timestamp: at(1) },
      { type: 'TECHNICAL', distance: 'TECH', totalArrows: 50, timestamp: at(2) },
      { type: 'Trening', arrows: 36, timestamp: at(8) },
      { type: 'Trening', arrows: 99, timestamp: at(100) },
    ], NOW);
    expect(w).toHaveLength(12);
    expect(w[11]).toEqual({ scored: 72, tech: 50 });
    expect(w[10]).toEqual({ scored: 36, tech: 0 });
  });
});

describe('handicapSeries', () => {
  it('tylko wybrany łuk, bez techniki; aktualny handicap to średnia lepszych z okna', () => {
    const s = (daysAgo: number, score: number, bowClass = 'RECURVE') => ({ type: 'Trening', distance: '70m', targetType: 'Full', score, arrows: 72, scoreArrows: 72, bowClass, timestamp: at(daysAgo), date: 'd' });
    const pts = handicapSeries([
      s(10, 550), s(5, 600), s(1, 640),
      s(3, 650, 'Compound'),
      { type: 'TECHNICAL', distance: 'TECH', totalArrows: 40, timestamp: at(2) },
    ], 'RECURVE');
    expect(pts).toHaveLength(3);
    // lepszy wynik = niższy handicap
    expect(pts[2].hc).toBeLessThan(pts[0].hc);
    expect(pts[2].current).toBeLessThanOrEqual(pts[0].current);
    expect(pts.map(p => p.ts)).toEqual([...pts.map(p => p.ts)].sort((a, b) => a - b));
  });
});
