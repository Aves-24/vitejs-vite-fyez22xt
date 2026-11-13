import { describe, it, expect } from 'vitest';
import { buildKnowledge, matchesKnowledge, NO_TOPIC, type KnowledgeGroup } from './knowledgeBase';

const gt = (day: string, topic: string, extra: Record<string, unknown> = {}) =>
  ({ day, topic, text: `T ${day}`, setAt: 0, entryIds: { a: 'x', b: 'y' }, ...extra }) as any;

const groups: KnowledgeGroup[] = [
  { id: 'g1', name: 'Jugend', topics: {
    '2026-10-01': gt('2026-10-01', 'klicker', { links: ['https://y.t/1', 'https://s.de/k'], linkTitles: ['', 'Klicker'] }),
    '2026-11-10': gt('2026-11-10', 'klicker', { links: ['https://y.t/1'], linkTitles: ['Drill'], desc: 'Rücken!' }),
    '2026-09-01': gt('2026-09-01', ''),
  } },
  { id: 'g2', name: 'Erwachsene', topics: {
    '2026-10-20': gt('2026-10-20', 'klicker', { links: ['https://y.t/1'] }),
    '2026-10-21': gt('2026-10-21', 'anker'),
  } },
];
const catOf = (t: string) => (t === 'klicker' ? 'celowanie' : t === 'anker' ? 'naciag' : 'wlasne');

describe('buildKnowledge', () => {
  const kb = buildKnowledge(groups, catOf);
  const klicker = kb.find(k => k.topic === 'klicker')!;

  it('zbiera tematy ze wszystkich grup, najnowszy temat na górze', () => {
    expect(kb.map(k => k.topic)).toEqual(['klicker', 'anker', NO_TOPIC]);
    expect(klicker.cat).toBe('celowanie');
    expect(klicker.lastDay).toBe('2026-11-10');
  });

  it('treningi od najnowszego, z grupą, opisem i liczbą uczniów', () => {
    expect(klicker.trainings.map(t => `${t.day} ${t.groupName}`)).toEqual(['2026-11-10 Jugend', '2026-10-20 Erwachsene', '2026-10-01 Jugend']);
    expect(klicker.trainings[0].desc).toBe('Rücken!');
    expect(klicker.trainings[0].students).toBe(2);
  });

  it('ten sam link raz, z licznikiem i najnowszym tytułem', () => {
    expect(klicker.links).toEqual([
      { url: 'https://y.t/1', title: 'Drill', count: 3, lastDay: '2026-11-10' },
      { url: 'https://s.de/k', title: 'Klicker', count: 1, lastDay: '2026-10-01' },
    ]);
  });

  it('pusta lista grup = pusta baza', () => {
    expect(buildKnowledge([], catOf)).toEqual([]);
  });
});

describe('matchesKnowledge', () => {
  const k = buildKnowledge(groups, catOf).find(x => x.topic === 'klicker')!;
  it('szuka po nazwie, tytule linku, opisie i grupie', () => {
    expect(matchesKnowledge(k, 'Klickerkontrolle', '')).toBe(true);
    expect(matchesKnowledge(k, 'Klickerkontrolle', 'kontrolle')).toBe(true);
    expect(matchesKnowledge(k, 'Klickerkontrolle', 'drill')).toBe(true);
    expect(matchesKnowledge(k, 'Klickerkontrolle', 'rücken erwachsene')).toBe(true);
    expect(matchesKnowledge(k, 'Klickerkontrolle', 'anker')).toBe(false);
  });
});
