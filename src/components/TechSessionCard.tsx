import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { TRAINING_TOPICS } from '../constants/trainingTopics';

interface TechSessionCardProps {
  session: any;
  noteComponent: React.ReactNode;
  onDelete: () => void;
  canDelete: boolean;
  userId?: string;
}

export default function TechSessionCard({ session, noteComponent, onDelete, canDelete, userId }: TechSessionCardProps) {
  const { t } = useTranslation();

  const [isEditingTopics, setIsEditingTopics] = useState(false);
  const [selectedTopics, setSelectedTopics] = useState<string[]>(session.topics || []);
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const toggleTopic = (id: string) => {
    setSelectedTopics(prev => prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id]);
  };

  const handleSaveTopics = async () => {
    if (!userId || !session.id) return;
    setIsSaving(true);
    try {
      await updateDoc(doc(db, `users/${userId}/sessions`, session.id), {
        topics: selectedTopics,
      });
      setIsEditingTopics(false);
      setExpandedCategory(null);
    } catch (e) {
      console.error('Error saving topics:', e);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancelEdit = () => {
    setSelectedTopics(session.topics || []);
    setExpandedCategory(null);
    setIsEditingTopics(false);
  };

  const displayTopics: string[] = isEditingTopics ? selectedTopics : (session.topics || []);

  return (
    <div className="bg-white rounded-[32px] border border-gray-100 shadow-sm p-5 relative overflow-hidden">

      {/* NAGŁÓWEK */}
      <div className="flex justify-between items-start mb-3">
        <div>
          <div className="flex items-center gap-1.5 mb-0.5">
            <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
            <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">
              {t('stats.techSessionType')}
            </span>
          </div>
          <h2 className="text-xl font-black text-[#0a3a2a] leading-tight truncate max-w-[200px]">
            {t('stats.techSessionTitle')}
          </h2>
          <p className="text-[10px] text-gray-300 font-bold uppercase">{session.date}</p>
        </div>

        <div className="bg-emerald-50 text-emerald-700 px-3 py-1.5 rounded-full text-[10px] font-black uppercase flex items-center gap-1 border border-emerald-100/50">
          <span className="material-symbols-outlined text-[14px]">fitness_center</span>
          {session.totalArrows || 0} {t('common.arrows')}
        </div>
      </div>

      {/* TEMATY */}
      <div className="mb-3">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">
            {t('sessionSetup.trainingTopics')}
          </span>
          {userId && canDelete && !isEditingTopics && (
            <button
              onClick={() => setIsEditingTopics(true)}
              className="flex items-center gap-0.5 text-[9px] font-black text-emerald-600 active:scale-95 transition-all"
            >
              <span className="material-symbols-outlined text-[12px]">edit</span>
              {t('common.edit')}
            </button>
          )}
        </div>

        {/* Wyświetl chipy tematów */}
        {displayTopics.length > 0 ? (
          <div className="flex flex-wrap gap-1 mb-2">
            {displayTopics.map(id => {
              const sub = TRAINING_TOPICS.flatMap(c => c.subtopics).find(s => s.id === id);
              if (!sub) return null;
              return (
                <span key={id}
                  onClick={isEditingTopics ? () => toggleTopic(id) : undefined}
                  className={`flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[9px] font-black border transition-all ${
                    isEditingTopics
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200 cursor-pointer active:scale-95'
                      : 'bg-gray-50 text-gray-600 border-gray-100'
                  }`}>
                  {t(`sessionSetup.topic_${sub.id}`)}
                  {isEditingTopics && <span className="material-symbols-outlined text-[10px] ml-0.5">close</span>}
                </span>
              );
            })}
          </div>
        ) : (
          !isEditingTopics && (
            <p className="text-[10px] text-gray-300 font-bold mb-2">—</p>
          )
        )}

        {/* PICKER TEMATÓW (tryb edycji) */}
        {isEditingTopics && (
          <div className="mt-1">
            {/* Przyciski kategorii */}
            <div className="grid grid-cols-5 gap-1 mb-1">
              {TRAINING_TOPICS.map(cat => {
                const hasSelected = cat.subtopics.some(s => selectedTopics.includes(s.id));
                return (
                  <button key={cat.id}
                    onClick={() => setExpandedCategory(v => v === cat.id ? null : cat.id)}
                    className={`py-1.5 rounded-xl text-[9px] font-black text-center leading-tight transition-all relative ${
                      expandedCategory === cat.id
                        ? 'bg-emerald-600 text-white'
                        : hasSelected
                        ? 'bg-emerald-50 text-emerald-700 border-2 border-emerald-200'
                        : 'bg-gray-50 text-gray-500 border border-gray-100'
                    }`}>
                    {cat.num}
                    {hasSelected && expandedCategory !== cat.id && (
                      <span className="absolute -top-1 -right-1 w-2 h-2 bg-emerald-500 rounded-full" />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Rozwinięte podtematy */}
            {expandedCategory && (
              <div className="bg-gray-50 rounded-xl p-2 space-y-0.5 border border-gray-100 mb-2">
                <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1.5 px-1">
                  {t(`sessionSetup.topicCat_${expandedCategory}`)}
                </p>
                {TRAINING_TOPICS.find(c => c.id === expandedCategory)?.subtopics.map(sub => {
                  const checked = selectedTopics.includes(sub.id);
                  return (
                    <button key={sub.id} onClick={() => toggleTopic(sub.id)}
                      className={`w-full flex items-center gap-2 py-1.5 px-2 rounded-lg text-left transition-all active:scale-[0.98] ${
                        checked ? 'bg-emerald-100' : 'hover:bg-gray-100'
                      }`}>
                      <span className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                        checked ? 'bg-emerald-500 border-emerald-500' : 'border-gray-300 bg-white'
                      }`}>
                        {checked && <span className="material-symbols-outlined text-white text-[11px]">check</span>}
                      </span>
                      <div className="min-w-0">
                        <span className="text-[11px] font-black text-[#0a3a2a] block">{t(`sessionSetup.topic_${sub.id}`)}</span>
                        {t(`sessionSetup.topic_${sub.id}`) !== sub.term && (
                          <span className="text-[8px] text-gray-400 font-bold">{sub.term}</span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Przyciski zapisz / anuluj */}
            <div className="flex gap-2 mt-2">
              <button
                onClick={handleCancelEdit}
                className="flex-1 py-2 rounded-xl bg-gray-100 text-gray-500 font-black text-[10px] uppercase tracking-widest active:scale-95 transition-all"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={handleSaveTopics}
                disabled={isSaving}
                className="flex-1 py-2 rounded-xl bg-emerald-600 text-white font-black text-[10px] uppercase tracking-widest active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-1"
              >
                {isSaving
                  ? <span className="material-symbols-outlined text-[16px] animate-spin">progress_activity</span>
                  : t('common.save')
                }
              </button>
            </div>
          </div>
        )}
      </div>

      {/* NOTATKA */}
      <div className="mt-2">
        {noteComponent}
      </div>

      {/* PRZYCISK USUWANIA */}
      {canDelete && (
        <button
          onClick={onDelete}
          className="mt-4 w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-red-50 text-red-500 font-black text-[10px] uppercase tracking-widest active:scale-95 transition-all border border-red-100"
        >
          <span className="material-symbols-outlined text-[16px]">delete</span>
          {t('stats.deleteSession')}
        </button>
      )}
    </div>
  );
}
