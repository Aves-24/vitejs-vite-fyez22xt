import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { doc, getDoc } from 'firebase/firestore';
import { useTranslation } from 'react-i18next';
import CoachLogPanel from '../components/CoachLogPanel';

interface MyCoachViewProps {
  userId: string;
  onBack: () => void;
}

interface CoachInfo {
  id: string;
  firstName: string;
  lastName: string;
  clubName?: string;
}

export default function MyCoachView({ userId, onBack }: MyCoachViewProps) {
  const { t } = useTranslation();
  const [coaches, setCoaches] = useState<CoachInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'diary' | 'coaches'>('diary');

  useEffect(() => {
    const fetchCoaches = async () => {
      if (!userId) return;
      setIsLoading(true);
      try {
        const userDoc = await getDoc(doc(db, 'users', userId));
        if (!userDoc.exists()) { setIsLoading(false); return; }

        const coachIds: string[] = userDoc.data().coaches || [];
        if (coachIds.length === 0) { setCoaches([]); setIsLoading(false); return; }

        const list: CoachInfo[] = [];
        await Promise.all(coachIds.map(async cid => {
          try {
            const cDoc = await getDoc(doc(db, 'users', cid));
            if (cDoc.exists()) {
              const d = cDoc.data();
              list.push({
                id: cid,
                firstName: d.firstName || '',
                lastName: d.lastName || '',
                clubName: d.clubName || '',
              });
            }
          } catch { /* ignore */ }
        }));
        setCoaches(list);
      } catch (e) {
        console.error('MyCoachView: błąd pobierania trenerów', e);
      }
      setIsLoading(false);
    };
    fetchCoaches();
  }, [userId]);

  return (
    <div className="flex flex-col min-h-screen bg-[#fcfdfe] relative overflow-x-hidden">

      {/* HEADER */}
      <div className="bg-gradient-to-b from-[#0a3a2a] to-[#0d4a36] pt-[calc(env(safe-area-inset-top)+1rem)] pb-5 px-5 rounded-b-[36px] shadow-xl shadow-[#0a3a2a]/20 relative z-20 shrink-0">
        <div className="flex items-center gap-4 mb-2">
          <button onClick={onBack} className="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center text-white hover:bg-white/20 transition-all active:scale-90 shrink-0">
            <span className="material-symbols-outlined">arrow_back</span>
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">{t('myCoach.headerLabel', { defaultValue: 'Schüler-Bereich' })}</p>
            <h1 className="text-2xl font-black text-white leading-tight truncate">{t('myCoach.title', { defaultValue: 'Mein Trainer' })}</h1>
          </div>
          <div className="w-12 h-12 bg-[#fed33e] rounded-2xl flex items-center justify-center text-[#0a3a2a] shadow-sm shrink-0">
            <span className="material-symbols-outlined text-2xl">sports</span>
          </div>
        </div>

        {/* INFO O TRENERACH */}
        <div className="mt-3 bg-white/[0.07] backdrop-blur-sm rounded-2xl px-3.5 py-2.5">
          <span className="text-[8px] font-bold text-emerald-300/80 uppercase tracking-widest block mb-1">
            {t('myCoach.coachesCount', { defaultValue: 'Trainer' })} · {coaches.length}
          </span>
          {coaches.length === 0 ? (
            <p className="text-[11px] font-bold text-white/60">{t('myCoach.noCoach', { defaultValue: 'Du hast noch keinen Trainer' })}</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {coaches.map(c => (
                <span key={c.id} className="text-[10px] font-black text-white bg-white/10 rounded-lg px-2 py-1">
                  {c.firstName} {c.lastName}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* TAB BAR */}
      <div className="bg-white shrink-0 z-10 px-3 pt-3 pb-2">
        <div className="bg-gray-50 rounded-2xl p-1 flex">
          {[
            { key: 'diary',    icon: 'edit_note',       label: t('myCoach.tabDiary',    { defaultValue: 'Tagebuch' }) },
            { key: 'coaches',  icon: 'group',           label: t('myCoach.tabCoaches',  { defaultValue: 'Trainer' }) },
          ].map(tab => {
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key as any)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl transition-all duration-200 ${
                  isActive ? 'bg-[#0a3a2a] text-[#fed33e] shadow-md' : 'text-gray-500 active:scale-95'
                }`}
              >
                <span className={`material-symbols-outlined text-[18px] ${isActive ? 'text-[#fed33e]' : 'text-gray-400'}`}>
                  {tab.icon}
                </span>
                <span className="text-[10px] font-black uppercase tracking-wider">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* TAB CONTENT */}
      <div className="flex-1 overflow-y-auto pb-32 px-5 pt-3">

        {isLoading && (
          <div className="text-center py-10">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{t('myCoach.loading', { defaultValue: 'Lädt…' })}</span>
          </div>
        )}

        {!isLoading && activeTab === 'diary' && (
          coaches.length > 0 ? (
            <CoachLogPanel studentId={userId} currentUserId={userId} mode="student" />
          ) : (
            <div className="bg-gray-50 rounded-[20px] p-8 text-center border border-dashed border-gray-200">
              <span className="material-symbols-outlined text-gray-200 text-4xl mb-2 block">menu_book</span>
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{t('myCoach.noDiary', { defaultValue: 'Noch keine Einträge' })}</p>
            </div>
          )
        )}

        {!isLoading && activeTab === 'coaches' && (
          coaches.length === 0 ? (
            <div className="bg-gray-50 rounded-[20px] p-8 text-center border border-dashed border-gray-200">
              <span className="material-symbols-outlined text-gray-200 text-4xl mb-2 block">person_off</span>
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{t('myCoach.noCoaches', { defaultValue: 'Keine Trainer' })}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {coaches.map(c => {
                const initials = `${c.firstName[0] || ''}${c.lastName[0] || ''}`.toUpperCase();
                return (
                  <div key={c.id} className="bg-white rounded-2xl p-3 shadow-sm border border-gray-100 flex items-center gap-3">
                    <div className="w-12 h-12 bg-[#0a3a2a] text-[#fed33e] rounded-full flex items-center justify-center shrink-0">
                      <span className="font-black text-[14px]">{initials || <span className="material-symbols-outlined">sports</span>}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-black text-[#0a3a2a] text-[14px] leading-tight truncate">{c.firstName} {c.lastName}</h3>
                      {c.clubName && (
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-0.5 truncate">{c.clubName}</p>
                      )}
                    </div>
                    <span className="material-symbols-outlined text-gray-300 text-[20px]">sports</span>
                  </div>
                );
              })}
            </div>
          )
        )}

      </div>
    </div>
  );
}
