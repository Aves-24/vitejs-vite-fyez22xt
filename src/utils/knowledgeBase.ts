// [WISSEN] (user 2026-11-13) Baza wiedzy trenera: wszystko, co trener wpisał
// w plan grup (temat, tytuł, opis, linki), ułożone po temacie treningu.
// Nic nowego nie zapisujemy — to inny widok na groups/{id}.topics, które
// panel trenera i tak już słucha. Zero dodatkowych odczytów, zero reguł.

import type { GroupTopic, GroupTopicsByDay } from '../components/GroupTopicPanel';

/** Klucz „bez tematu” — trening z samym tytułem. */
export const NO_TOPIC = '';

export interface KnowledgeLink {
  url: string;
  /** Najnowszy niepusty tytuł tego linku ('' = bez tytułu). */
  title: string;
  /** Na ilu treningach był użyty. */
  count: number;
  lastDay: string;
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
  lastDay: string;
}

export interface KnowledgeGroup { id: string; name: string; topics: GroupTopicsByDay }

function linksOf(gt: GroupTopic): { url: string; title: string }[] {
  const links = Array.isArray(gt.links) ? gt.links : [];
  return links
    .filter((u): u is string => typeof u === 'string' && !!u)
    .map((url, i) => ({ url, title: typeof gt.linkTitles?.[i] === 'string' ? gt.linkTitles[i].trim() : '' }));
}

/**
 * Tematy ze wszystkich grup trenera. `catOf` daje kategorię tematu (wbudowana
 * z katalogu, własna z customTopics). Zaplanowane (przyszłe) treningi też się
 * liczą — trener już je przygotował.
 */
export function buildKnowledge(groups: KnowledgeGroup[], catOf: (topic: string) => string): KnowledgeTopic[] {
  const byTopic = new Map<string, KnowledgeTopic>();
  for (const g of groups) {
    for (const [dayKey, gt] of Object.entries(g.topics || {})) {
      if (!gt || typeof gt !== 'object') continue;
      const day = typeof gt.day === 'string' && gt.day ? gt.day : dayKey;
      const topic = typeof gt.topic === 'string' ? gt.topic : NO_TOPIC;
      let k = byTopic.get(topic);
      if (!k) {
        k = { topic, cat: catOf(topic), links: [], trainings: [], lastDay: '' };
        byTopic.set(topic, k);
      }
      k.trainings.push({
        day, groupId: g.id, groupName: g.name,
        text: typeof gt.text === 'string' ? gt.text : '',
        desc: typeof gt.desc === 'string' ? gt.desc : '',
        links: linksOf(gt),
        students: gt.entryIds && typeof gt.entryIds === 'object' ? Object.keys(gt.entryIds).length : 0,
      });
    }
  }
  const out = [...byTopic.values()];
  for (const k of out) {
    k.trainings.sort((a, b) => b.day.localeCompare(a.day) || a.groupName.localeCompare(b.groupName));
    k.lastDay = k.trainings[0]?.day || '';
    const links = new Map<string, KnowledgeLink>();
    // Od najnowszego: tytuł bierzemy z najnowszego treningu, który go ma.
    for (const tr of k.trainings) {
      for (const l of tr.links) {
        const cur = links.get(l.url);
        if (!cur) links.set(l.url, { url: l.url, title: l.title, count: 1, lastDay: tr.day });
        else { cur.count++; if (!cur.title && l.title) cur.title = l.title; }
      }
    }
    k.links = [...links.values()].sort((a, b) => b.lastDay.localeCompare(a.lastDay) || b.count - a.count);
  }
  return out.sort((a, b) => b.lastDay.localeCompare(a.lastDay));
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
