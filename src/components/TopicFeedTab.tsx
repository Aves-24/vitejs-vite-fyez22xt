import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import { TRAINING_TOPICS } from '../constants/trainingTopics';

interface FeedEntry {
  id: string;
  source: 'technical' | 'coachNote' | 'privateNote' | 'coachLog' | 'calendar';
  text: string;
  date: string;
  ts: number;
  extra?: string; // author name or session distance
}

interface TopicFeedTabProps {
  userId: string;
}

const SOURCE_CONFIG = {
  technical:   { color: 'bg-emerald-50 text-emerald-700 border-emerald-100', icon: 'fitness_center',  labelKey: 'topicFeed.sourceTechnical' },
  coachNote:   { color: 'bg-blue-50 text-blue-700 border-blue-100',          icon: 'sports',          labelKey: 'topicFeed.sourceCoachNote' },
  privateNote: { color: 'bg-indigo-50 text-indigo-700 border-indigo-100',    icon: 'lock',            labelKey: 'topicFeed.sourcePrivateNote' },
  coachLog:    { color: 'bg-amber-50 text-amber-700 border-amber-100',        icon: 'menu_book',       labelKey: 'topicFeed.sourceCoachLog' },
  calendar:    { color: 'bg-purple-50 text-purple-700 border-purple-100',     icon: 'event',           labelKey: 'topicFeed.sourceCalendar' },
};

export default function TopicFeedTab({ userId }: TopicFeedTabProps) {
  const { t } = useTranslation();
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [selectedTopic, setSelectedTopic] = useState<{ id: string; term: string } | null>(null);
  const [entries, setEntries] = useState<FeedEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const formatTs = (ts: number) =>
    ts ? new Date(ts).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }) : '';

  const loadTopic = async (topicId: string, term: string) => {
    setSelectedTopic({ id: topicId, term });
    setIsLoading(true);
    setEntries([]);

    try {
      const [techSnap, coachNoteSnap, privateSnap, logSnap, calSnap] = await Promise.all([
        // Treningi techniczne
        getDocs(query(
          collection(db, `users/${userId}/sessions`),
          where('topics', 'array-contains', topicId)
        )),
        // Notatki trenera do sesji
        getDocs(query(
          collection(db, `users/${userId}/sessions`),
          where('coachTopics', 'array-contains', topicId)
        )),
        // Prywatne notatki
        getDocs(query(
          collection(db, `users/${userId}/privateNotes`),
          where('topics', 'array-contains', topicId)
        )),
        // Dziennik trenera
        getDocs(query(
          collection(db, `users/${userId}/coachLog`),
          where('topics', 'array-contains', topicId)
        )),
        // Kalendarz trenera
        getDocs(query(
          collection(db, `users/${userId}/tournaments`),
          where('topics', 'array-contains', topicId)
        )),
      ]);

      const result: FeedEntry[] = [];

      techSnap.docs.forEach(d => {
        const data = d.data();
        const ts = data.timestamp?.toMillis?.() || data.createdAt?.toMillis?.() || 0;
        result.push({
          id: `tech_${d.id}`,
          source: 'technical',
          text: data.note || '',
          date: data.date || formatTs(ts),
          ts,
          extra: `${data.totalArrows || 0} ${t('common.arrows')}`,
        });
      });

      coachNoteSnap.docs.forEach(d => {
        const data = d.data();
        const ts = data.timestamp?.toMillis?.() || data.createdAt?.toMillis?.() || 0;
        if (data.coachNote) {
          result.push({
            id: `cnote_${d.id}`,
            source: 'coachNote',
            text: data.coachNote,
            date: data.date || formatTs(ts),
            ts,
            extra: data.distance,
          });
        }
      });

      privateSnap.docs.forEach(d => {
        const data = d.data();
        const ts = data.createdAt?.toMillis?.() || data.createdAt?.seconds * 1000 || 0;
        result.push({
          id: `priv_${d.id}`,
          source: 'privateNote',
          text: data.text || '',
          date: formatTs(ts),
          ts,
        });
      });

      logSnap.docs.forEach(d => {
        const data = d.data();
        const ts = data.createdAt?.toMillis?.() || data.createdAt?.seconds * 1000 || 0;
        result.push({
          id: `log_${d.id}`,
          source: 'coachLog',
          text: data.text || '',
          date: formatTs(ts),
          ts,
          extra: data.authorName,
        });
      });

      calSnap.docs.forEach(d => {
        const data = d.data();
        result.push({
          id: `cal_${d.id}`,
          source: 'calendar',
          text: data.title || '',
          date: data.date || '',
          ts: data.date ? new Date(data.date).getTime() : 0,
          extra: data.note,
        });
      });

      result.sort((a, b) => b.ts - a.ts);
      setEntries(result);
    } catch (e) {
      console.error('TopicFeed: błąd pobierania', e);
    }
    setIsLoading(false);
  };

  // --- WIDOK FEEDU ---
  if (selectedTopic) {
    return (
      <div>
        {/* Nagłówek tematu */}
        <div className="flex items-center gap-2 mb-4">
          <button
            onClick={() => { setSelectedTopic(null); setEntries([]); }}
            className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center active:scale-90 transition-all shrink-0"
          >
            <span className="material-symbols-outlined text-[18px] text-gray-500">arrow_back</span>
          </button>
          <div>
            <h3 className="text-sm font-black text-[#0a3a2a]">{t(`sessionSetup.topic_${selectedTopic.id}`)}</h3>
            <p className="text-[8px] font-bold text-gray-400">{selectedTopic.term}</p>
          </div>
        </div>

        {isLoading && (
          <div className="text-center py-10">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{t('myCoach.loading')}</span>
          </div>
        )}

        {!isLoading && entries.length === 0 && (
          <div className="bg-gray-50 rounded-[20px] p-8 text-center border border-dashed border-gray-200">
            <span className="material-symbols-outlined text-gray-200 text-4xl mb-2 block">search_off</span>
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{t('topicFeed.noEntries')}</p>
          </div>
        )}

        {!isLoading && entries.length > 0 && (
          <div className="space-y-2">
            <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-3">
              {entries.length} {t('topicFeed.entriesCount')}
            </p>
            {entries.map(entry => {
              const cfg = SOURCE_CONFIG[entry.source];
              return (
                <div key={entry.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[8px] font-black border ${cfg.color}`}>
                      <span className="material-symbols-outlined text-[10px]">{cfg.icon}</span>
                      {t(cfg.labelKey)}
                    </span>
                    <span className="text-[8px] font-bold text-gray-400 ml-auto">{entry.date}</span>
                  </div>
                  {entry.text ? (
                    <p className="text-[11px] font-medium text-gray-700 leading-snug">{entry.text}</p>
                  ) : (
                    <p className="text-[11px] font-medium text-gray-400 italic">{t('topicFeed.noText')}</p>
                  )}
                  {entry.extra && (
                    <p className="text-[9px] font-bold text-gray-400 mt-1">{entry.extra}</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // --- WIDOK WYBORU TEMATU ---
  return (
    <div>
      <p className="text-[10px] font-semibold text-gray-500 leading-snug mb-4">
        {t('topicFeed.desc')}
      </p>

      {/* Kategorie */}
      <div className="space-y-2">
        {TRAINING_TOPICS.map(cat => (
          <div key={cat.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <button
              onClick={() => setExpandedCategory(v => v === cat.id ? null : cat.id)}
              className="w-full flex items-center gap-3 px-4 py-3 text-left active:scale-[0.99] transition-all"
            >
              <span className="w-7 h-7 bg-[#0a3a2a] rounded-lg flex items-center justify-center text-[#fed33e] font-black text-sm shrink-0">
                {cat.num}
              </span>
              <span className="flex-1 text-[12px] font-black text-[#0a3a2a]">
                {t(`sessionSetup.topicCat_${cat.id}`)}
              </span>
              <span className={`material-symbols-outlined text-gray-400 text-[18px] transition-transform ${expandedCategory === cat.id ? 'rotate-180' : ''}`}>
                expand_more
              </span>
            </button>

            {expandedCategory === cat.id && (
              <div className="border-t border-gray-50 divide-y divide-gray-50">
                {cat.subtopics.map(sub => (
                  <button
                    key={sub.id}
                    onClick={() => loadTopic(sub.id, sub.term)}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-left active:bg-gray-50 transition-colors"
                  >
                    <span className="material-symbols-outlined text-[16px] text-gray-300">chevron_right</span>
                    <div className="flex-1 min-w-0">
                      <span className="text-[11px] font-black text-[#0a3a2a] block">
                        {t(`sessionSetup.topic_${sub.id}`)}
                      </span>
                      {t(`sessionSetup.topic_${sub.id}`) !== sub.term && (
                        <span className="text-[9px] text-gray-400 font-bold">{sub.term}</span>
                      )}
                    </div>
                    <span className="material-symbols-outlined text-[16px] text-gray-200">arrow_forward</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
