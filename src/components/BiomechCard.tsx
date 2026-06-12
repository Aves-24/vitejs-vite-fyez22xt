import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { SpreadResult } from '../utils/spread';

interface Props {
  spread: SpreadResult;
  handedness: 'RH' | 'LH' | null;
  onNavigate: (view: string, tab?: string) => void;
  // Podtytuł karty, np. „ostatnie 3 treningi" — gdy brak, sama nazwa sekcji.
  subtitle?: string;
}

// Karta biomechaniki: kierunek grupowania + dominujący błąd, z modalami (i)
// zawierającymi wskazówki coachingowe dopasowane do ręki łucznika.
// Współdzielona przez pojedynczą sesję (StatsView) i agregat 3 treningów (ProStats).
export default function BiomechCard({ spread, handedness, onNavigate, subtitle }: Props) {
  const { t } = useTranslation();
  const [bioInfo, setBioInfo] = useState<null | 'tendency' | 'error'>(null);

  return (
    <div className="bg-white dark:bg-[#1a201d] rounded-2xl border border-gray-100 p-4 shadow-sm mt-4">
      <div className="flex justify-between items-center mb-3">
        <div className="min-w-0">
          <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{t('stats.cards.biomechanics')}</h3>
          {subtitle && <span className="text-[9px] font-bold text-gray-300 dark:text-gray-500">{subtitle}</span>}
        </div>
        <span className="material-symbols-outlined text-gray-300 text-sm">troubleshoot</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="relative bg-indigo-50 rounded-xl p-3 pr-8 border border-indigo-100">
          <button onClick={() => setBioInfo('tendency')} aria-label="info"
            className="absolute top-2 right-2 w-6 h-6 rounded-full bg-indigo-500 flex items-center justify-center active:scale-90 transition-all shadow-sm">
            <span className="material-symbols-outlined text-white text-[13px]">info</span>
          </button>
          <span className="text-[8px] font-black text-indigo-500 dark:text-indigo-300 uppercase block mb-1 tracking-wide">{t('stats.cards.tendency')}</span>
          <span className="text-sm font-black text-[#0a3a2a] dark:text-white block leading-tight">
            {t(spread.hKey)} / {t(spread.vKey)}
          </span>
        </div>
        <div className="relative bg-orange-50 rounded-xl p-3 pr-8 border border-orange-100">
          <button onClick={() => setBioInfo('error')} aria-label="info"
            className="absolute top-2 right-2 w-6 h-6 rounded-full bg-orange-500 flex items-center justify-center active:scale-90 transition-all shadow-sm">
            <span className="material-symbols-outlined text-white text-[13px]">info</span>
          </button>
          <span className="text-[8px] font-black text-orange-500 dark:text-orange-300 uppercase block mb-1 tracking-wide">{t('stats.cards.error')}</span>
          <span className="text-sm font-black text-[#0a3a2a] dark:text-white block leading-tight">{t(spread.errorKey)}</span>
        </div>
      </div>

      {bioInfo && typeof document !== 'undefined' && createPortal(
        (() => {
          const suffix = (k: string) => k.split('.').pop() || '';
          const isLH = handedness === 'LH';
          const tendMap: Record<string, string> = {
            left: isLH ? 'tendLeftLH' : 'tendLeft',
            right: isLH ? 'tendRightLH' : 'tendRight',
            up: 'tendUp', down: 'tendDown', center: 'tendCenter',
          };
          const errMap: Record<string, string> = { symm: 'errSymm', horiz: 'errHoriz', vert: 'errVert' };
          const isTend = bioInfo === 'tendency';
          const tips: string[] = [];
          if (isTend) {
            const h = suffix(spread.hKey), v = suffix(spread.vKey);
            if (h !== 'center') tips.push(tendMap[h]);
            if (v !== 'center') tips.push(tendMap[v]);
            if (tips.length === 0) tips.push('tendCenter');
          } else {
            tips.push(errMap[suffix(spread.errorKey)]);
          }
          const accent = isTend ? 'bg-indigo-500' : 'bg-orange-500';
          return (
            <div className="fixed inset-0 z-[100000] flex items-start justify-center pt-12 px-4 bg-black/50 backdrop-blur-sm animate-fade-in overflow-y-auto" onClick={() => setBioInfo(null)}>
              <div className="bg-white dark:bg-[#1a201d] rounded-[32px] w-full max-w-md p-6 shadow-2xl my-8" onClick={e => e.stopPropagation()}>
                <div className="flex items-center gap-3 mb-4">
                  <div className={`w-10 h-10 rounded-full ${accent} flex items-center justify-center shrink-0`}>
                    <span className="material-symbols-outlined text-white text-[18px]">{isTend ? 'my_location' : 'scatter_plot'}</span>
                  </div>
                  <h2 className="text-[13px] font-black text-[#0a3a2a] dark:text-white uppercase tracking-widest">{t(isTend ? 'stats.cards.bio.tendencyTitle' : 'stats.cards.bio.errorTitle')}</h2>
                </div>

                <div className="text-sm font-black text-[#0a3a2a] dark:text-white mb-3">
                  {isTend ? `${t(spread.hKey)} / ${t(spread.vKey)}` : t(spread.errorKey)}
                </div>

                <div className="bg-[#0a3a2a]/5 dark:bg-white/5 border border-[#0a3a2a]/10 dark:border-white/10 rounded-2xl p-3 mb-4">
                  <p className="text-[11px] font-bold text-[#0a3a2a] dark:text-[#9adbc0] leading-relaxed">{t('stats.cards.bio.coachFirst')}</p>
                </div>

                <p className="text-[12px] font-bold text-gray-500 dark:text-gray-300 leading-relaxed mb-4">{t(isTend ? 'stats.cards.bio.tendencyAbout' : 'stats.cards.bio.errorAbout')}</p>

                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-2">{t('stats.cards.bio.whatToDo')}</p>
                <div className="space-y-2 mb-4">
                  {tips.map((tipKey, i) => (
                    <div key={i} className="bg-gray-50 dark:bg-white/5 border border-gray-100 dark:border-white/10 rounded-2xl p-3">
                      <p className="text-[11px] font-bold text-[#0a3a2a] dark:text-gray-200 leading-relaxed">{t(`stats.cards.bio.${tipKey}`)}</p>
                    </div>
                  ))}
                </div>

                {handedness === null ? (
                  <div className="bg-amber-50 border border-amber-100 rounded-2xl p-3 mb-4">
                    <p className="text-[10px] font-black text-amber-700 uppercase tracking-wide mb-1">{t('stats.cards.bio.handPromptTitle')}</p>
                    <p className="text-[11px] font-bold text-gray-500 dark:text-gray-300 leading-relaxed mb-3">{t('stats.cards.bio.handPrompt')}</p>
                    <button onClick={() => { setBioInfo(null); onNavigate('SETTINGS', 'PROFIL'); }}
                      className="w-full py-2.5 bg-[#0a3a2a] text-[#fed33e] rounded-xl text-[10px] font-black uppercase tracking-widest active:scale-95 transition-all flex items-center justify-center gap-1.5">
                      <span className="material-symbols-outlined text-[14px]">person</span>
                      {t('stats.cards.bio.handCta')}
                    </button>
                  </div>
                ) : (
                  <button onClick={() => { setBioInfo(null); onNavigate('SETTINGS', 'PROFIL'); }}
                    className="w-full flex items-center justify-center gap-1.5 text-[9px] font-bold text-gray-400 dark:text-gray-500 mb-4 active:scale-95 transition-all">
                    <span className="material-symbols-outlined text-[12px]">{isLH ? 'back_hand' : 'front_hand'}</span>
                    {t(isLH ? 'stats.cards.bio.adjustedLH' : 'stats.cards.bio.adjustedRH')}
                    <span className="material-symbols-outlined text-[12px]">chevron_right</span>
                  </button>
                )}

                <button onClick={() => setBioInfo(null)} className="w-full py-3 bg-[#0a3a2a] text-white rounded-2xl text-[11px] font-black uppercase tracking-widest active:scale-95 transition-all">
                  OK
                </button>
              </div>
            </div>
          );
        })(),
        document.body
      )}
    </div>
  );
}
