import React from 'react';
import { useTranslation } from 'react-i18next';

const TournamentSection: React.FC = () => {
  const { t } = useTranslation();

  return (
    <div className="tb-card tb-tourney border rounded-l-md rounded-r-2xl shadow-sm p-4 space-y-3 animate-fade-in-up">
      <div className="flex items-center gap-3">
        <span className="tb-tourney-icon w-10 h-10 rounded-lg flex items-center justify-center shrink-0">
          <span className="material-symbols-outlined text-[22px] tb-tourney-accent">emoji_events</span>
        </span>
        <div className="flex-1 min-w-0">
          <h2 className="text-[15px] font-black text-[#0a3a2a] leading-tight">{t('settings.tournament.title')}</h2>
          <span className="inline-block mt-1 text-[9px] uppercase font-black py-0.5 px-2 rounded-full bg-gray-100 text-gray-500">{t('settings.tournament.wip')}</span>
        </div>
      </div>
      <p className="text-[12px] font-bold text-gray-500 leading-snug">{t('settings.tournament.desc')}</p>
      <button disabled className="w-full py-3 rounded-xl font-black text-[10px] uppercase tracking-widest bg-gray-100 text-gray-400">{t('settings.tournament.btn')}</button>
    </div>
  );
};

export default TournamentSection;