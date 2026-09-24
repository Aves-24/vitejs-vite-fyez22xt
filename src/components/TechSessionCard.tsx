import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { isKnownTopic, topicLabel } from '../constants/trainingTopics';
import TopicPicker from './TopicPicker';
import { SessionFocusCard } from './tagebuch/FocusCard';

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
  const [isSaving, setIsSaving] = useState(false);

  const handleSaveTopics = async () => {
    if (!userId || !session.id) return;
    setIsSaving(true);
    try {
      await updateDoc(doc(db, `users/${userId}/sessions`, session.id), {
        topics: selectedTopics,
      });
      setIsEditingTopics(false);
    } catch (e) {
      console.error('Error saving topics:', e);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancelEdit = () => {
    setSelectedTopics(session.topics || []);
    setIsEditingTopics(false);
  };

  const displayTopics: string[] = isEditingTopics ? selectedTopics : (session.topics || []);

  return (
    <div className="bg-white rounded-[32px] border border-gray-100 shadow-sm p-5 relative overflow-hidden">

      {/* NAGŁÓWEK */}
      <div className="flex justify-between items-start mb-3">
        <div>
          <div className="flex items-center gap-1.5 mb-0.5">
            <div className="w-2 h-2 rounded-full bg-sky-500"></div>
            <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">
              {t('stats.techSessionType')}
            </span>
          </div>
          <h2 className="text-xl font-black text-[#0a3a2a] leading-tight truncate max-w-[200px]">
            {t('stats.techSessionTitle')}
          </h2>
          <p className="text-[10px] text-gray-300 font-bold uppercase flex items-center gap-1.5">
            {session.date}
            {session.source === 'DELAY_MIRROR' && (
              <span className="flex items-center gap-0.5 text-sky-600 normal-case">
                <span className="material-symbols-outlined text-[12px]">slow_motion_video</span>
                {t('delayMirror.title')}
              </span>
            )}
          </p>
        </div>

        <div className="bg-sky-50 text-sky-700 px-3 py-1.5 rounded-full text-[10px] font-black uppercase flex items-center gap-1 border border-sky-100/50">
          <span className="material-symbols-outlined text-[14px]">fitness_center</span>
          {session.totalArrows || 0} {t('common.arrows')}
        </div>
      </div>

      {/* FOKUS z chwili treningu */}
      <div className="mb-3 empty:hidden"><SessionFocusCard session={session} /></div>

      {/* TEMATY */}
      <div className="mb-3">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">
            {t('sessionSetup.trainingTopics')}
          </span>
          {userId && canDelete && !isEditingTopics && (
            <button
              onClick={() => setIsEditingTopics(true)}
              className="flex items-center gap-0.5 text-[9px] font-black text-sky-600 active:scale-95 transition-all"
            >
              <span className="material-symbols-outlined text-[12px]">edit</span>
              {t('common.edit')}
            </button>
          )}
        </div>

        {/* Wyświetl chipy tematów */}
        {!isEditingTopics && (
          displayTopics.some(isKnownTopic) ? (
            <div className="flex flex-wrap gap-1 mb-2">
              {displayTopics.filter(isKnownTopic).map(id => (
                <span key={id} className="flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[9px] font-black border bg-gray-50 text-gray-600 border-gray-100">
                  {topicLabel(id, t)}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-[10px] text-gray-300 font-bold mb-2">—</p>
          )
        )}

        {/* PICKER TEMATÓW (tryb edycji) */}
        {isEditingTopics && (
          <div className="mt-1">
            <TopicPicker selectedTopics={selectedTopics} onChange={setSelectedTopics} hideCaption />

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
                className="flex-1 py-2 rounded-xl bg-sky-600 text-white font-black text-[10px] uppercase tracking-widest active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-1"
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
