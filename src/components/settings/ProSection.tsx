import React from 'react';
import { useTranslation } from 'react-i18next';

interface ProSectionProps {
  isPremium: boolean;
  trialEndsAt?: any; // number (ms) or ISO string from Firestore
}

const ProSection: React.FC<ProSectionProps> = ({ isPremium, trialEndsAt }) => {
  const { t } = useTranslation();

  const trialTimestamp = trialEndsAt ? new Date(trialEndsAt).getTime() : null;
  const daysLeft = trialTimestamp ? Math.ceil((trialTimestamp - Date.now()) / (1000 * 3600 * 24)) : null;
  const isTrialActive = !isPremium && daysLeft !== null && daysLeft > 0;
  // Progress bar: 30-day baseline
  const trialProgress = daysLeft !== null ? Math.max(0, Math.min(100, (daysLeft / 30) * 100)) : 0;

  return (
    <div className="bg-gradient-to-br from-gray-900 to-[#0a3a2a] rounded-3xl p-5 space-y-4 shadow-xl border border-gray-700 animate-fade-in-up relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-full bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10 pointer-events-none"></div>

      <div className="text-center relative z-10">
        <div className="w-16 h-16 mx-auto bg-[#F2C94C]/20 rounded-full flex items-center justify-center mb-1">
          <span className="material-symbols-outlined text-4xl text-[#F2C94C]">diamond</span>
        </div>
        <h2 className="text-lg font-black text-white">{t('settings.pro.title')}</h2>
      </div>

      {/* Trial countdown banner */}
      {isTrialActive && daysLeft !== null && (
        <div className="relative z-10 bg-[#F2C94C]/10 border border-[#F2C94C]/30 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="material-symbols-outlined text-[#F2C94C] text-[18px]">workspace_premium</span>
            <span className="text-[10px] font-black text-[#F2C94C] uppercase tracking-widest">
              {t('settings.pro.trialActive')}
            </span>
          </div>
          <div className="flex items-end gap-2 mb-2">
            <span className="text-4xl font-black text-white leading-none">{daysLeft}</span>
            <span className="text-[11px] font-bold text-gray-300 mb-1">{t('settings.pro.trialDaysLeft')}</span>
          </div>
          <div className="h-1.5 bg-gray-700/60 rounded-full overflow-hidden">
            <div
              className="h-full bg-[#F2C94C] rounded-full transition-all duration-700"
              style={{ width: `${trialProgress}%` }}
            />
          </div>
        </div>
      )}

      <div className="text-left space-y-3 mt-4 relative z-10 bg-black/20 p-4 rounded-xl border border-gray-700/50">
        <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-700/50 pb-2 mb-2">Basic vs PRO</h3>
        <ul className="space-y-3">
          <li className="flex items-start gap-2">
            <span className="material-symbols-outlined text-[#F2C94C] text-base mt-0.5">check_circle</span>
            <div>
              <span className="block text-[11px] font-black text-white">{t('settings.pro.benefit1Title')}</span>
              <span className="block text-[9px] text-gray-400 mt-0.5">{t('settings.pro.benefit1Desc')}</span>
            </div>
          </li>
          <li className="flex items-start gap-2">
            <span className="material-symbols-outlined text-[#F2C94C] text-base mt-0.5">query_stats</span>
            <div>
              <span className="block text-[11px] font-black text-white">{t('settings.pro.benefit2Title')}</span>
              <span className="block text-[9px] text-gray-400 mt-0.5">{t('settings.pro.benefit2Desc')}</span>
            </div>
          </li>
          <li className="flex items-start gap-2">
            <span className="material-symbols-outlined text-[#F2C94C] text-base mt-0.5">psychology</span>
            <div>
              <span className="block text-[11px] font-black text-white">{t('settings.pro.benefit3Title')}</span>
              <span className="block text-[9px] text-gray-400 mt-0.5">{t('settings.pro.benefit3Desc')}</span>
            </div>
          </li>
          <li className="flex items-start gap-2">
            <span className="material-symbols-outlined text-[#F2C94C] text-base mt-0.5">emoji_events</span>
            <div>
              <span className="block text-[11px] font-black text-white">{t('settings.pro.benefit4Title')}</span>
              <span className="block text-[9px] text-gray-400 mt-0.5">{t('settings.pro.benefit4Desc')}</span>
            </div>
          </li>
        </ul>
      </div>

      <div className="pt-2 relative z-10">
        {isPremium ? (
          <div className="w-full py-4 rounded-xl font-black text-[11px] uppercase tracking-widest shadow-inner flex justify-center items-center gap-1.5 bg-emerald-500/20 text-emerald-400 border border-emerald-500/50">
            <span className="material-symbols-outlined text-sm">verified</span>
            {t('settings.pro.active')}
          </div>
        ) : isTrialActive ? (
          <div className="w-full py-4 rounded-xl font-black text-[11px] uppercase tracking-widest shadow-inner flex justify-center items-center gap-1.5 bg-[#F2C94C]/15 text-[#F2C94C] border border-[#F2C94C]/40">
            <span className="material-symbols-outlined text-sm">hourglass_top</span>
            {t('settings.pro.trialStatus')}
          </div>
        ) : (
          <div className="w-full py-4 rounded-xl font-black text-[11px] uppercase tracking-widest shadow-inner flex justify-center items-center gap-1.5 bg-white/5 text-gray-400 border border-gray-700">
            <span className="material-symbols-outlined text-sm">lock</span>
            {t('settings.pro.inactive')}
          </div>
        )}
      </div>
    </div>
  );
};

export default ProSection;
