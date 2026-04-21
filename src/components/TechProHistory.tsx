import React from 'react';
import { useTranslation } from 'react-i18next';

interface TechProHistoryProps {
  sessions: any[];
}

export default function TechProHistory({ sessions }: TechProHistoryProps) {
  const { t } = useTranslation();
  // Sortujemy sesje od najnowszych i bierzemy tylko 3 ostatnie
  const recentSessions = [...sessions].sort((a, b) => b.timestamp - a.timestamp).slice(0, 3);

  if (recentSessions.length === 0) {
    return <div className="text-center p-10 opacity-40 text-gray-500 font-bold text-sm">{t('stats.noTechSessions')}</div>;
  }

  return (
    <div className="space-y-3 animate-fade-in-up">
      <div className="bg-emerald-50 rounded-[32px] p-5 border border-emerald-100 mb-4 flex items-center gap-4 shadow-sm">
         <div className="w-12 h-12 bg-emerald-500 rounded-full flex items-center justify-center shrink-0 shadow-inner">
           <span className="material-symbols-outlined text-white text-xl">fitness_center</span>
         </div>
         <div>
           <h3 className="text-sm font-black text-[#0a3a2a] uppercase tracking-widest leading-none mb-1">{t('stats.techHistory')}</h3>
           <p className="text-[9px] font-bold text-emerald-600/70 uppercase tracking-widest">{t('stats.techHistoryDesc')}</p>
         </div>
      </div>

      {recentSessions.map((session, idx) => (
        <div key={session.id || idx} className="bg-white rounded-[24px] border border-gray-100 shadow-sm p-5 relative overflow-hidden">
           <div className="flex justify-between items-start mb-4">
              <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{session.date}</span>
              <div className="bg-emerald-50 text-emerald-700 px-3 py-1.5 rounded-full text-[10px] font-black uppercase flex items-center gap-1 border border-emerald-100/50">
                <span className="material-symbols-outlined text-[12px]">keyboard_double_arrow_up</span>
                {session.totalArrows || 0} {t('common.arrows')}
              </div>
           </div>

           <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100">
              <span className="block text-[8px] font-black text-gray-400 uppercase mb-1.5 tracking-widest">{t('stats.yourNotes')}</span>
              <p className="text-xs text-[#0a3a2a] font-bold italic leading-snug">
                 {session.note ? `"${session.note}"` : <span className="text-gray-400 font-medium">{t('stats.noSessionNotes')}</span>}
              </p>
           </div>

           {session.coachNote && (
             <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 mt-2 shadow-sm">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <span className="material-symbols-outlined text-[14px] text-blue-500">sports</span>
                  <span className="text-[9px] font-black text-blue-700 uppercase tracking-widest">{t('stats.coachTip')}</span>
                </div>
                <p className="text-xs text-[#0a3a2a] font-bold italic leading-snug">"{session.coachNote}"</p>
             </div>
           )}
        </div>
      ))}
    </div>
  );
}