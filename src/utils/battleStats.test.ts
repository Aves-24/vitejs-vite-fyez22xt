import { describe, it, expect, vi, beforeEach } from 'vitest';

// Atrapa Firestore: profil z zapisanym podsumowaniem i lista bitew zwracana
// stronami (jak zapytanie participants + createdAt > znacznik, rosnąco).
const fake = vi.hoisted(() => ({
  user: {} as Record<string, unknown>,
  battles: [] as any[],
  updates: [] as any[],
}));

vi.mock('../firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  collection: () => ({}),
  doc: () => ({}),
  limit: (n: number) => ({ kind: 'limit', n }),
  orderBy: () => ({ kind: 'orderBy' }),
  where: (field: string, op: string, value: unknown) => ({ kind: 'where', field, op, value }),
  query: (_c: unknown, ...cs: any[]) => cs,
  getDoc: async () => ({ data: () => fake.user }),
  getDocs: async (cs: any[]) => {
    const after = cs.find(c => c.kind === 'where' && c.field === 'createdAt')?.value ?? '';
    const lim = cs.find(c => c.kind === 'limit')?.n ?? Infinity;
    const docs = fake.battles
      .filter(b => b.createdAt > after)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .slice(0, lim)
      .map(b => ({ data: () => b }));
    return { docs };
  },
  updateDoc: async (_ref: unknown, data: unknown) => { fake.updates.push(data); },
}));

import { computeBattleStats, isFinalBattle, loadBattleStats, placeInBattle, splitFinal } from './battleStats';

const NOW = Date.parse('2026-10-21T12:00:00.000Z');
const H = 3600e3;
const battle = (id: string, ageH: number, status: string, scores: Record<string, number>, finished = Object.keys(scores)) => ({
  id,
  createdAt: new Date(NOW - ageH * H).toISOString(),
  status,
  participants: Object.keys(scores),
  finishedParticipants: finished,
  liveScores: Object.fromEntries(Object.entries(scores).map(([k, v]) => [k, { score: v, x: 0, t: 0, n: 0 }])),
});

describe('computeBattleStats — zasady liczenia', () => {
  it('wygrana, podium, porażka, gra solo i nieukończona', () => {
    const list = [
      battle('w', 5, 'FINISHED', { me: 600, a: 550, c: 500 }),          // 1. miejsce + podium
      battle('p3', 5, 'FINISHED', { me: 400, a: 550, c: 500, d: 300 }),  // 3. miejsce = podium
      battle('l', 5, 'FINISHED', { me: 300, a: 550 }),                  // przegrana, 2 graczy = bez podium
      battle('solo', 5, 'FINISHED', { me: 999 }),                       // rozegrana, bez wygranej
      battle('open', 5, 'ACTIVE', { me: 700, a: 100 }, ['a']),          // nieukończona przez me
    ];
    expect(computeBattleStats(list, 'me')).toMatchObject({ played: 4, wins: 1, podiums: 2, best: 999 });
  });
  it('bestAt = data gry z najlepszym wynikiem (Bestwert → STATS tego dnia)', () => {
    const a = battle('a', 30, 'FINISHED', { me: 500 });
    const b = battle('b', 20, 'FINISHED', { me: 700 });
    const c = battle('c', 10, 'FINISHED', { me: 600 });
    expect(computeBattleStats([a, b, c], 'me').bestAt).toBe(b.createdAt);
  });
  it('remis punktów rozstrzyga X', () => {
    const b = battle('x', 5, 'FINISHED', { me: 500, a: 500 });
    (b.liveScores as any).me.x = 3;
    expect(computeBattleStats([b], 'me').wins).toBe(1);
  });
});

describe('placeInBattle — miejsce w dzienniku i na kaflu', () => {
  it('miejsce i liczba graczy', () => {
    const b = battle('p', 5, 'FINISHED', { a: 500, me: 450, c: 300 });
    expect(placeInBattle(b, 'me')).toEqual({ place: 2, players: 3, score: 450 });
  });
  it('nie grał — miejsce 0', () => {
    expect(placeInBattle(battle('p', 5, 'FINISHED', { a: 1 }), 'me').place).toBe(0);
  });
});

describe('isFinalBattle / splitFinal — co wolno zapisać na stałe', () => {
  it('po terminie i gdy wszyscy skończyli — ostateczna od razu (dziennik nie czeka doby)', () => {
    const b: any = battle('e', 4, 'ACTIVE', { me: 1, a: 2 });
    b.expiresAtMs = NOW - 60e3;
    expect(isFinalBattle(b, NOW)).toBe(true);
    b.finishedParticipants = ['me'];
    expect(isFinalBattle(b, NOW)).toBe(false);
  });
  it('zamknięta albo starsza niż doba = ostateczna', () => {
    expect(isFinalBattle(battle('f', 1, 'FINISHED', { me: 1 }), NOW)).toBe(true);
    expect(isFinalBattle(battle('o', 25, 'ACTIVE', { me: 1 }), NOW)).toBe(true);
    expect(isFinalBattle(battle('n', 2, 'ACTIVE', { me: 1 }), NOW)).toBe(false);
  });
  it('pierwsza trwająca gra zatrzymuje znacznik — nowsze czekają', () => {
    const list = [battle('a', 72, 'ACTIVE', { me: 1 }), battle('b', 10, 'FINISHED', { me: 1 }), battle('c', 2, 'ACTIVE', { me: 1 }), battle('d', 1, 'FINISHED', { me: 1 })];
    const { final, pending } = splitFinal(list, NOW);
    expect(final.map(b => b.id)).toEqual(['a', 'b']);
    expect(pending.map(b => b.id)).toEqual(['c', 'd']);
  });
});

describe('loadBattleStats — przyrostowo, bez limitu', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    fake.user = {};
    fake.battles = [];
    fake.updates = [];
  });

  it('pierwsze liczenie: wszystko, zapis podsumowania ze znacznikiem', async () => {
    fake.battles = [battle('a', 72, 'FINISHED', { me: 500, x: 400 }), battle('b', 48, 'FINISHED', { me: 300, x: 400 })];
    const st = await loadBattleStats('me');
    expect(st).toMatchObject({ played: 2, wins: 1, podiums: 0, best: 500, bestAt: fake.battles[0].createdAt });
    expect(fake.updates[0].battleStats).toMatchObject({ played: 2, wins: 1, cursor: fake.battles[1].createdAt });
  });

  it('kolejne otwarcie: tylko bitwy nowsze od znacznika, doliczone do zapisanych', async () => {
    const old = battle('old', 72, 'FINISHED', { me: 999 });
    fake.user = { battleStats: { played: 10, wins: 4, podiums: 6, best: 650, bestAt: '2026-01-01T10:00:00.000Z', cursor: old.createdAt } };
    fake.battles = [old, battle('new', 30, 'FINISHED', { me: 600, x: 500 })];
    const st = await loadBattleStats('me');
    // „old” (999) jest już w podsumowaniu — nie liczy się drugi raz.
    expect(st).toMatchObject({ played: 11, wins: 5, podiums: 6, best: 650, bestAt: '2026-01-01T10:00:00.000Z' });
  });

  it('stare podsumowanie bez bestAt — przeliczone raz od nowa, bez dublowania', async () => {
    const a = battle('a', 72, 'FINISHED', { me: 400 });
    const b = battle('b', 48, 'FINISHED', { me: 450 });
    fake.user = { battleStats: { played: 2, wins: 0, podiums: 0, best: 450, cursor: b.createdAt } };
    fake.battles = [a, b];
    const st = await loadBattleStats('me');
    expect(st).toMatchObject({ played: 2, best: 450, bestAt: b.createdAt });
  });

  it('trwająca gra: widać ją od razu, ale nie trafia do zapisu', async () => {
    fake.battles = [battle('done', 48, 'FINISHED', { me: 300 }), battle('live', 1, 'ACTIVE', { me: 700, x: 100 })];
    const st = await loadBattleStats('me');
    expect(st.played).toBe(2);
    expect(st.best).toBe(700);
    expect(fake.updates[0].battleStats).toMatchObject({ played: 1, best: 300 });
  });

  it('nic nowego — bez zapisu', async () => {
    const old = battle('old', 72, 'FINISHED', { me: 100 });
    fake.user = { battleStats: { played: 1, wins: 0, podiums: 0, best: 100, bestAt: old.createdAt, cursor: old.createdAt } };
    fake.battles = [old];
    await loadBattleStats('me');
    expect(fake.updates).toHaveLength(0);
  });

  it('ponad 200 bitew (strony) — liczy wszystkie', async () => {
    fake.battles = Array.from({ length: 450 }, (_, i) => battle(`b${i}`, 1000 - i, 'FINISHED', { me: i }));
    const st = await loadBattleStats('me');
    expect(st.played).toBe(450);
    expect(st.best).toBe(449);
  });
});
