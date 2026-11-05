// Strefa z przestawianiem zegara — CI chodzi w UTC, gdzie błąd się nie pokazuje.
process.env.TZ = 'Europe/Berlin';

import { describe, it, expect } from 'vitest';
import { buildSnapshot, addDays, SNAPSHOT_DAYS } from './studentSnapshot';

describe('buildSnapshot — zmiana czasu (25.10.2026)', () => {
  // 5.11.2026: okno 14 dni (23.10.–5.11.) obejmuje dobę 25-godzinną.
  const now = new Date(2026, 10, 5, 12).getTime();

  it('kolejne dni okna to kolejne daty kalendarza, ostatni = dziś', () => {
    const snap = buildSnapshot([], undefined, now);
    const labels = Array.from({ length: SNAPSHOT_DAYS }, (_, i) => new Date(addDays(snap.fromTs, i)).getDate());
    expect(labels).toEqual([23, 24, 25, 26, 27, 28, 29, 30, 31, 1, 2, 3, 4, 5]);
  });

  it('trening tuż po północy trafia do swojego dnia także przed zmianą czasu', () => {
    const ts = new Date(2026, 9, 24, 0, 30).getTime(); // 24.10. 0:30 (jeszcze czas letni)
    const snap = buildSnapshot([{ id: 'a', ts, distance: '18m', score: 50, scoreArrows: 6, arrows: 6, ends: [] } as any], undefined, now);
    expect(snap.dayCounts[1]).toBe(1); // indeks 1 = 24.10.
    expect(snap.dayCounts[0]).toBe(0);
  });
});
