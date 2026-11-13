// [WISSEN] (user 2026-11-13) Baza wiedzy trenera: wszystko, co trener wpisał
// w plan grup (temat, tytuł, opis, linki), ułożone po temacie treningu.
// Z planów nic nowego nie zapisujemy — to inny widok na groups/{id}.topics,
// które panel trenera i tak już słucha. Do tego własne linki trenera
// (users/{uid}/knowledgeLinks) — dodane „na zapas”, bez treningu.

import type { GroupTopic, GroupTopicsByDay } from '../components/GroupTopicPanel';

/** Klucz „bez tematu” — trening z samym tytułem. */
export const NO_TOPIC = '';

/** Jedno użycie linku: trening (dzień + grupa). */
export interface LinkUse { day: string; groupName: string }

export interface KnowledgeLink {
  url: string;
  /** Własny tytuł zapisanego linku, inaczej najnowszy niepusty z treningów ('' = brak). */
  title: string;
  /** Na ilu treningach był użyty (we wszystkich tematach). */
  count: number;
  /** Ostatnie użycie ('' = jeszcze nigdy). */
  lastDay: string;
  /** Użycia od najnowszego. */
  uses: LinkUse[];
  /** Id zapisanego linku (users/{uid}/knowledgeLinks) — tylko taki da się usunąć. */
  savedId?: string;
}

export interface KnowledgeTraining {
  day: string;
  groupId: string;
  groupName: string;
  text: string;
  desc: string;
  links: { url: string; title: string }[];
  /** Ilu uczniów dostało temat. */
  students: number;
}

export interface KnowledgeTopic {
  topic: string;
  cat: string;
  links: KnowledgeLink[];
  /** Najnowsze na górze. */
  trainings: KnowledgeTraining[];
  /** Ostatni trening z tym tematem ('' = tylko zapisane linki). */
  lastDay: string;
}

export interface KnowledgeGroup { id: string; name: string; topics: GroupTopicsByDay }

/** Link zapisany przez trenera do tematu. */
export interface SavedLink { id: string; topic: string; url: string; title: string; createdAt: number }

function linksOf(gt: GroupTopic): { url: string; title: string }[] {
  const links = Array.isArray(gt.links) ? gt.links : [];
  return links
    .filter((u): u is string => typeof u === 'string' && !!u)
    .map((url, i) => ({ url, title: typeof gt.linkTitles?.[i] === 'string' ? gt.linkTitles[i].trim() : '' }));
}

/**
 * Tematy ze wszystkich grup trenera + zapisane linki. `catOf` daje kategorię
 * tematu (wbudowana z katalogu, własna z customTopics). Zaplanowane (przyszłe)
 * treningi też się liczą — trener już je przygotował.
 */
export function buildKnowledge(groups: KnowledgeGroup[], catOf: (topic: string) => string, saved: SavedLink[] = []): KnowledgeTopic[] {
  const byTopic = new Map<string, KnowledgeTopic>();
  const topicOf = (topic: string) => {
    let k = byTopic.get(topic);
    if (!k) {
      k = { topic, cat: catOf(topic), links: [], trainings: [], lastDay: '' };
      byTopic.set(topic, k);
    }
    return k;
  };
  for (const g of groups) {
    for (const [dayKey, gt] of Object.entries(g.topics || {})) {
      if (!gt || typeof gt !== 'object') continue;
      const day = typeof gt.day === 'string' && gt.day ? gt.day : dayKey;
      topicOf(typeof gt.topic === 'string' ? gt.topic : NO_TOPIC).trainings.push({
        day, groupId: g.id, groupName: g.name,
        text: typeof gt.text === 'string' ? gt.text : '',
        desc: typeof gt.desc === 'string' ? gt.desc : '',
        links: linksOf(gt),
        students: gt.entryIds && typeof gt.entryIds === 'object' ? Object.keys(gt.entryIds).length : 0,
      });
    }
  }
  for (const s of saved) topicOf(s.topic);

  // Użycia linku liczymy we wszystkich treningach (link mógł trafić też pod inny temat).
  const uses = new Map<string, LinkUse[]>();
  const trainingTitle = new Map<string, string>();
  const all = [...byTopic.values()].flatMap(k => k.trainings).sort((a, b) => b.day.localeCompare(a.day) || a.groupName.localeCompare(b.groupName));
  for (const tr of all) {
    for (const l of tr.links) {
      uses.set(l.url, [...(uses.get(l.url) || []), { day: tr.day, groupName: tr.groupName }]);
      if (l.title && !trainingTitle.has(l.url)) trainingTitle.set(l.url, l.title);
    }
  }
  const linkOf = (url: string, title: string, savedId?: string): KnowledgeLink => {
    const u = uses.get(url) || [];
    return { url, title: title || trainingTitle.get(url) || '', count: u.length, lastDay: u[0]?.day || '', uses: u, ...(savedId ? { savedId } : {}) };
  };

  const out = [...byTopic.values()];
  for (const k of out) {
    k.trainings.sort((a, b) => b.day.localeCompare(a.day) || a.groupName.localeCompare(b.groupName));
    k.lastDay = k.trainings[0]?.day || '';
    const links = new Map<string, KnowledgeLink>();
    for (const s of saved.filter(x => x.topic === k.topic).sort((a, b) => b.createdAt - a.createdAt)) {
      if (!links.has(s.url)) links.set(s.url, linkOf(s.url, s.title, s.id));
    }
    for (const tr of k.trainings) for (const l of tr.links) if (!links.has(l.url)) links.set(l.url, linkOf(l.url, ''));
    // Najpierw jeszcze nieużyte (świeżo zapisane), potem od ostatnio użytego.
    k.links = [...links.values()].sort((a, b) =>
      (a.lastDay ? 1 : 0) - (b.lastDay ? 1 : 0) || b.lastDay.localeCompare(a.lastDay) || b.count - a.count);
  }
  return out.sort((a, b) => b.lastDay.localeCompare(a.lastDay) || a.topic.localeCompare(b.topic));
}

/** Szukajka: nazwa tematu (podana z zewnątrz, bo zależy od języka), tytuły, opisy, linki. */
export function matchesKnowledge(k: KnowledgeTopic, label: string, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const hay = [
    label,
    ...k.links.map(l => `${l.title} ${l.url}`),
    ...k.trainings.map(tr => `${tr.text} ${tr.desc} ${tr.groupName}`),
  ].join('\n').toLowerCase();
  return q.split(/\s+/).every(w => hay.includes(w));
}
