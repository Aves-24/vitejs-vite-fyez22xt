// [WISSEN – WŁASNE LINKI] (user 2026-11-13) Trener trafia w internecie na coś
// do tematu i zapisuje to w bazie wiedzy, zanim użyje na treningu.
// users/{uid}/knowledgeLinks/{id}: { topic, url, title, createdAt } — tylko właściciel.
// LUSTRO: firestore.rules (validKnowledgeLink), PrivacySection (eksport/usuwanie).

import { addDoc, collection, deleteDoc, doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import type { SavedLink } from './knowledgeBase';
import { TOPIC_LINK_MAX_LEN, TOPIC_LINK_TITLE_MAX } from './focus';

/** Sufit techniczny (reguły nie liczą dokumentów — pilnuje klient). */
export const KNOWLEDGE_LINKS_MAX = 500;
/** Długość ID tematu (własny temat `c:` + 40 znaków). LUSTRO: firestore.rules. */
export const KNOWLEDGE_TOPIC_MAX = 60;

const col = (uid: string) => collection(db, 'users', uid, 'knowledgeLinks');

export function subscribeKnowledgeLinks(uid: string, cb: (links: SavedLink[]) => void): () => void {
  return onSnapshot(col(uid), snap => {
    cb(snap.docs.flatMap(d => {
      const x = d.data();
      if (typeof x.url !== 'string' || typeof x.topic !== 'string') return [];
      return [{ id: d.id, topic: x.topic, url: x.url, title: typeof x.title === 'string' ? x.title : '', createdAt: typeof x.createdAt === 'number' ? x.createdAt : 0 }];
    }));
  }, () => cb([]));
}

export async function addKnowledgeLink(uid: string, topic: string, url: string, title: string): Promise<void> {
  await addDoc(col(uid), {
    topic: topic.slice(0, KNOWLEDGE_TOPIC_MAX),
    url: url.slice(0, TOPIC_LINK_MAX_LEN),
    title: title.trim().slice(0, TOPIC_LINK_TITLE_MAX),
    createdAt: Date.now(),
  });
}

export async function removeKnowledgeLink(uid: string, id: string): Promise<void> {
  await deleteDoc(doc(db, 'users', uid, 'knowledgeLinks', id));
}
