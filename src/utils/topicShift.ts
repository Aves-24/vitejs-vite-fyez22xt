// [PRZESUNIĘCIE TEMATÓW] (user 2026-10-27: „game changer”) Odwołany trening
// z tematem: temat idzie na następny trening z planu grupy, a jeśli tam już
// jest temat — ten przesuwa się dalej, i tak łańcuchem do pierwszego wolnego
// treningu. Tematy za luką w planie zostają na swoich dniach.
// Czysta logika (testy w topicShift.test.ts); zapis: applyTopicShift w coachGroups.ts.
import { nextOccurrence } from './groupSchedule';
import type { GroupTopicsByDay } from '../components/GroupTopicPanel';

export interface TopicMove { from: string; to: string }

const dayAfter = (dayKey: string) => {
  const d = new Date(`${dayKey}T12:00:00`);
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/**
 * Przesunięcia dla odwołanego dnia `fromDay`. `schedule` musi już mieć ten
 * trening odwołany. Pusta lista = w tym dniu nie ma tematu (albo jest
 * zakończony); null = brak kolejnego treningu w planie (np. długa przerwa).
 */
export function planTopicShift(schedule: unknown, topics: GroupTopicsByDay, fromDay: string, maxDays = 120): TopicMove[] | null {
  if (!topics[fromDay] || topics[fromDay].closedAt) return [];
  const moves: TopicMove[] = [];
  let cur = fromDay;
  // Bezpiecznik: tematów nie ma więcej niż kilkadziesiąt.
  for (let i = 0; i < 100; i++) {
    const next = nextOccurrence(schedule, dayAfter(cur), maxDays);
    if (!next) return null;
    moves.push({ from: cur, to: next });
    if (!topics[next] || topics[next].closedAt) return moves;
    cur = next;
  }
  return null;
}

/** Nowa mapa tematów po przesunięciach (dzień w temacie też się zmienia). */
export function shiftedTopics(topics: GroupTopicsByDay, moves: TopicMove[]): GroupTopicsByDay {
  const next: GroupTopicsByDay = { ...topics };
  for (const m of moves) delete next[m.from];
  for (const m of moves) next[m.to] = { ...topics[m.from], day: m.to };
  return next;
}
