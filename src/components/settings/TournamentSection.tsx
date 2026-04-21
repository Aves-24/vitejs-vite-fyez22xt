import React from 'react';
import { useTranslation } from 'react-i18next';

const TournamentSection: React.FC = () => {
  const { t } = useTranslation();

  return (
    <div className="bg-gradient-to-br from-fuchsia-900 to-pink-900 border-fuchsia-700 rounded-3xl p-5 space-y-3 shadow-xl text-center border animate-fade-in-up relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-full bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10 pointer-events-none"></div>
      <div className="w-16 h-16 mx-auto bg-fuchsia-500/20 text-fuchsia-400 rounded-full flex items-center justify-center">
        <span className="material-symbols-outlined text-4xl">emoji_events</span>
      </div>
      <h2 className="text-xl font-black text-white">{t('settings.tournament.title')}</h2>
      <div className="text-[9px] uppercase font-black py-1 px-3 rounded-full inline-block border bg-fuchsia-500/20 text-fuchsia-300 border-fuchsia-500/30">{t('settings.tournament.wip')}</div>
      <p className="text-xs text-white text-left opacity-90">{t('settings.tournament.desc')}</p>
      <button disabled className="w-full py-3.5 rounded-xl font-black text-[10px] uppercase border bg-fuchsia-500/10 text-fuchsia-400 border-fuchsia-500/30">{t('settings.tournament.btn')}</button>
    </div>
  );
};

export default TournamentSection;