import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { doc, getDoc } from 'firebase/firestore';
import { useTranslation } from 'react-i18next';
import CoachLogPanel from '../components/CoachLogPanel';
import CoachPlanBanner from '../components/CoachPlanBanner';

interface MyCoachViewProps {
  userId: string;
  onBack: () => void;
  onNavigateToSettings?: () => void;
}

interface CoachInfo {
  id: string;
  firstName: string;
  lastName: string;
  clubName?: string;
}

export default function MyCoachView({ userId, onBack, onNavigateToSettings }: MyCoachViewProps) {
  const { t } = useTranslation();
  const [coaches, setCoaches] = useState<CoachInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'plan' | 'diary' | 'coaches'>('plan');
  const [planCount, setPlanCount] = useState(0);
  const [diaryCount, setDiaryCount] = useState(0);

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
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center text-white hover:bg-white/20 transition-all active:scale-90 shrink-0">
            <span className="material-symbols-outlined">arrow_back</span>
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-black text-white leading-tight truncate">{t('myCoach.headerLabel', { defaultValue: 'Schützen-Bereich' })}</h1>
          </div>
          <div className="flex items-baseline shrink-0">
            <span className="text-2xl font-black text-white tracking-tighter leading-none">GROT-X</span>
            <div className="bg-[#fed33e] w-2 h-2 rounded-full animate-pulse ml-1 relative bottom-[0.3em]" />
          </div>
        </div>
      </div>

      {/* TAB BAR */}
      <div className="bg-white shrink-0 z-10 px-3 pt-3 pb-2">
        <div className="bg-gray-50 rounded-2xl p-1 flex">
          {[
            { key: 'plan',    icon: 'event',      label: t('myCoach.tabPlan',    { defaultValue: 'Plan' }),    badge: planCount },
            { key: 'diary',   icon: 'edit_note',  label: t('myCoach.tabDiary',   { defaultValue: 'Tagebuch' }), badge: diaryCount },
            { key: 'coaches', icon: 'group',      label: t('myCoach.tabCoaches', { defaultValue: 'Trainer' }),  badge: 0 },
          ].map(tab => {
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key as any)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl transition-all duration-200 relative ${
                  isActive ? 'bg-[#0a3a2a] text-[#fed33e] shadow-md' : 'text-gray-500 active:scale-95'
                }`}
              >
                <span className={`material-symbols-outlined text-[18px] ${isActive ? 'text-[#fed33e]' : 'text-gray-400'}`}>
                  {tab.icon}
                </span>
                <span className="text-[10px] font-black uppercase tracking-wider">{tab.label}</span>
                {tab.badge > 0 && (
                  <span className={`absolute top-1.5 right-2 min-w-[16px] h-4 px-1 rounded-full text-[8px] font-black flex items-center justify-center ${
                    isActive ? 'bg-[#fed33e] text-[#0a3a2a]' : 'bg-emerald-600 text-white'
                  }`}>
                    {tab.badge}
                  </span>
                )}
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

        {/* Plan — zawsze zamontowany, ukrywany gdy nieaktywny */}
        <div className={activeTab === 'plan' ? '' : 'hidden'}>
          {!isLoading && (
            coaches.length > 0 ? (
              <>
                <CoachPlanBanner userId={userId} compact={false} onCountChange={setPlanCount} />
                <div className="text-center mt-4">
                  <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">
                    {t('myCoach.planNote', { defaultValue: 'Heute & Morgen — vom Trainer geplant' })}
                  </p>
                </div>
              </>
            ) : (
              <div className="bg-gray-50 rounded-[20px] p-8 text-center border border-dashed border-gray-200">
                <span className="material-symbols-outlined text-gray-200 text-4xl mb-2 block">event_busy</span>
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{t('myCoach.noPlan', { defaultValue: 'Kein Plan' })}</p>
              </div>
            )
          )}
        </div>

        {/* Diary — zawsze zamontowany, ukrywany gdy nieaktywny */}
        <div className={activeTab === 'diary' ? '' : 'hidden'}>
          {!isLoading && (
            coaches.length > 0 ? (
              <CoachLogPanel studentId={userId} currentUserId={userId} mode="student" onCountChange={setDiaryCount} />
            ) : (
              <div className="bg-gray-50 rounded-[20px] p-8 text-center border border-dashed border-gray-200">
                <span className="material-symbols-outlined text-gray-200 text-4xl mb-2 block">menu_book</span>
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{t('myCoach.noDiary', { defaultValue: 'Noch keine Einträge' })}</p>
              </div>
            )
          )}
        </div>

        {/* Coaches — zawsze zamontowany, ukrywany gdy nieaktywny */}
        <div className={activeTab === 'coaches' ? '' : 'hidden'}>
          {!isLoading && (
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
                      {onNavigateToSettings && (
                        <button
                          onClick={onNavigateToSettings}
                          className="shrink-0 text-[8px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-0.5 hover:text-[#0a3a2a] transition-colors active:scale-95"
                        >
                          <span className="material-symbols-outlined text-[14px]">manage_accounts</span>
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )
          )}
        </div>

      </div>
    </div>
  );
}
