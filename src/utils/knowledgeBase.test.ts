import { describe, it, expect } from 'vitest';
import { buildKnowledge, matchesKnowledge, NO_TOPIC, type KnowledgeGroup, type SavedLink } from './knowledgeBase';

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
    '2026-10-21': gt('2026-10-21', 'anker', { links: ['https://s.de/k'] }),
  } },
];
const catOf = (t: string) => (t === 'klicker' ? 'celowanie' : t === 'anker' ? 'naciag' : t === 'atem' ? 'celowanie' : 'wlasne');

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

  it('ten sam link raz, z najnowszym tytułem i datami użyć ze wszystkich tematów', () => {
    expect(klicker.links.map(l => [l.url, l.title, l.count, l.lastDay])).toEqual([
      ['https://y.t/1', 'Drill', 3, '2026-11-10'],
      // użyty też pod tematem „anker” — liczą się wszystkie treningi
      ['https://s.de/k', 'Klicker', 2, '2026-10-21'],
    ]);
    expect(klicker.links[1].uses).toEqual([{ day: '2026-10-21', groupName: 'Erwachsene' }, { day: '2026-10-01', groupName: 'Jugend' }]);
  });

  it('pusta lista grup = pusta baza', () => {
    expect(buildKnowledge([], catOf)).toEqual([]);
  });
});

describe('buildKnowledge — zapisane linki', () => {
  const saved: SavedLink[] = [
    { id: 's1', topic: 'atem', url: 'https://breath.io', title: 'Atmen', createdAt: 5 },
    { id: 's2', topic: 'klicker', url: 'https://y.t/1', title: 'Mój tytuł', createdAt: 6 },
    { id: 's3', topic: 'klicker', url: 'https://new.io', title: '', createdAt: 7 },
  ];
  const kb = buildKnowledge(groups, catOf, saved);

  it('temat tylko z zapisanym linkiem też jest na liście (bez treningów, na końcu)', () => {
    const atem = kb.find(k => k.topic === 'atem')!;
    expect(atem.cat).toBe('celowanie');
    expect(atem.trainings).toEqual([]);
    expect(atem.lastDay).toBe('');
    expect(atem.links).toEqual([{ url: 'https://breath.io', title: 'Atmen', count: 0, lastDay: '', uses: [], savedId: 's1' }]);
    expect(kb[kb.length - 1].topic).toBe('atem');
  });

  it('zapisany link: własny tytuł, licznik z treningów, nieużyte na górze, bez duplikatu', () => {
    const k = kb.find(x => x.topic === 'klicker')!;
    expect(k.links.map(l => [l.url, l.title, l.count, l.savedId])).toEqual([
      ['https://new.io', '', 0, 's3'],
      ['https://y.t/1', 'Mój tytuł', 3, 's2'],
      ['https://s.de/k', 'Klicker', 2, undefined],
    ]);
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
