import React from 'react';
import { useTranslation } from 'react-i18next';

interface TechSessionCardProps {
  session: any;
  noteComponent: React.ReactNode;
  onDelete: () => void;
  canDelete: boolean;
}

export default function TechSessionCard({ session, noteComponent, onDelete, canDelete }: TechSessionCardProps) {
  const { t } = useTranslation();
  return (
    <div className="bg-white rounded-[32px] border border-gray-100 shadow-sm p-5 relative overflow-hidden">
      {/* NAGŁÓWEK */}
      <div className="flex justify-between items-start mb-2">
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
        
        {/* STRZAŁY JAKO ZGRABNA PIGUŁKA */}
        <div className="bg-emerald-50 text-emerald-700 px-3 py-1.5 rounded-full text-[10px] font-black uppercase flex items-center gap-1 border border-emerald-100/50">
          <span className="material-symbols-outlined text-[14px]">fitness_center</span>
          {session.totalArrows || 0} {t('common.arrows')}
        </div>
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