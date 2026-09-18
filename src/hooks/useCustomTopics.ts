import { useState, useEffect, useCallback } from 'react';
import { doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import {
  CustomTopic, CUSTOM_TOPICS_MAX, customTopicId, isCustomTopic, normalizeTopicName, parseCustomTopics,
} from '../constants/trainingTopics';

export interface CustomTopicsApi {
  topics: CustomTopic[];
  /** Tylko trener dopisuje/usuwa własne tematy. */
  canEdit: boolean;
  /** Zwraca ID dodanego (albo już istniejącego) tematu; null przy pustej nazwie / limicie. */
  add: (name: string, cat: string) => Promise<string | null>;
  remove: (id: string) => Promise<void>;
}

/**
 * [C39] Własne tematy zalogowanego użytkownika z `users/{uid}.customTopics`.
 * Nasłuch na własny dokument — SDK współdzieli go z nasłuchem w App.tsx, więc
 * nie dokłada odczytów, a dodanie tematu w jednym pickerze od razu widać w innych.
 * Zapis przechodzi przez Path B reguł (pole spoza chronionych).
 */
export function useCustomTopics(): CustomTopicsApi {
  const uid = auth.currentUser?.uid || '';
  const [topics, setTopics] = useState<CustomTopic[]>([]);
  const [canEdit, setCanEdit] = useState(false);

  useEffect(() => {
    if (!uid) return;
    return onSnapshot(
      doc(db, 'users', uid),
      snap => {
        const data = snap.data();
        setTopics(parseCustomTopics(data?.customTopics));
        setCanEdit(data?.isCoach === true);
      },
      () => { /* offline / brak dostępu — picker działa na wbudowanych */ },
    );
  }, [uid]);

  const add = useCallback(async (name: string, cat: string) => {
    if (!uid || !normalizeTopicName(name)) return null;
    const id = customTopicId(name);
    if (topics.some(x => x.id === id)) return id;
    if (topics.length >= CUSTOM_TOPICS_MAX) return null;
    const next = [...topics, { id, cat }];
    setTopics(next);
    await updateDoc(doc(db, 'users', uid), { customTopics: next });
    return id;
  }, [uid, topics]);

  const remove = useCallback(async (id: string) => {
    if (!uid || !isCustomTopic(id)) return;
    const next = topics.filter(x => x.id !== id);
    setTopics(next);
    await updateDoc(doc(db, 'users', uid), { customTopics: next });
  }, [uid, topics]);

  return { topics, canEdit, add, remove };
}
