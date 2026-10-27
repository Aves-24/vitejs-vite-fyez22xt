import { describe, it, expect } from 'vitest';
import { planTopicShift, shiftedTopics } from './topicShift';
import type { GroupSchedule } from './groupSchedule';

// Środa 18:00 i sobota 12:00; 2026-10-28 = środa. Środa 28.10. już odwołana.
const plan: GroupSchedule = {
  slots: [{ day: 3, time: '18:00' }, { day: 6, time: '12:00' }], every: 1, anchor: '2026-10-28',
  cancelled: { '2026-10-28 18:00': '' },
};
const topic = (day: string, text: string, extra = {}) => ({ day, text, topic: '', setAt: 1, entryIds: {}, ...extra }) as any;

describe('planTopicShift', () => {
  it('bez tematu w odwołanym dniu — nic do przesunięcia', () => {
    expect(planTopicShift(plan, { '2026-10-31': topic('2026-10-31', 'B') }, '2026-10-28')).toEqual([]);
  });

  it('temat idzie na najbliższy wolny trening', () => {
    expect(planTopicShift(plan, { '2026-10-28': topic('2026-10-28', 'A') }, '2026-10-28'))
      .toEqual([{ from: '2026-10-28', to: '2026-10-31' }]);
  });

  it('łańcuch: kolejne tematy przesuwają się o jeden trening', () => {
    const topics = {
      '2026-10-28': topic('2026-10-28', 'A'),
      '2026-10-31': topic('2026-10-31', 'B'),
      '2026-11-04': topic('2026-11-04', 'C'),
    };
    expect(planTopicShift(plan, topics, '2026-10-28')).toEqual([
      { from: '2026-10-28', to: '2026-10-31' },
      { from: '2026-10-31', to: '2026-11-04' },
      { from: '2026-11-04', to: '2026-11-07' },
    ]);
  });

  it('łańcuch kończy się na luce — temat za luką zostaje', () => {
    const topics = {
      '2026-10-28': topic('2026-10-28', 'A'),
      '2026-11-07': topic('2026-11-07', 'D'),
    };
    expect(planTopicShift(plan, topics, '2026-10-28')).toEqual([{ from: '2026-10-28', to: '2026-10-31' }]);
  });

  it('przerwa w planie jest pomijana', () => {
    const withBreak: GroupSchedule = { ...plan, breaks: [{ from: '2026-10-29', to: '2026-11-05' }] };
    expect(planTopicShift(withBreak, { '2026-10-28': topic('2026-10-28', 'A') }, '2026-10-28'))
      .toEqual([{ from: '2026-10-28', to: '2026-11-07' }]);
  });

  it('zakończony temat się nie przesuwa', () => {
    expect(planTopicShift(plan, { '2026-10-28': topic('2026-10-28', 'A', { closedAt: 5 }) }, '2026-10-28')).toEqual([]);
  });

  it('brak kolejnego treningu w zasięgu — null', () => {
    const longBreak: GroupSchedule = { ...plan, breaks: [{ from: '2026-10-29', to: '2027-12-31' }] };
    expect(planTopicShift(longBreak, { '2026-10-28': topic('2026-10-28', 'A') }, '2026-10-28')).toBeNull();
  });
});

describe('shiftedTopics', () => {
  it('przenosi tematy łańcuchem i zmienia ich dzień', () => {
    const topics = {
      '2026-10-28': topic('2026-10-28', 'A'),
      '2026-10-31': topic('2026-10-31', 'B'),
      '2026-11-14': topic('2026-11-14', 'Z'),
    };
    const out = shiftedTopics(topics, [
      { from: '2026-10-28', to: '2026-10-31' },
      { from: '2026-10-31', to: '2026-11-04' },
    ]);
    expect(Object.keys(out).sort()).toEqual(['2026-10-31', '2026-11-04', '2026-11-14']);
    expect(out['2026-10-31'].text).toBe('A');
    expect(out['2026-10-31'].day).toBe('2026-10-31');
    expect(out['2026-11-04'].text).toBe('B');
    expect(out['2026-11-14'].text).toBe('Z');
  });
});
