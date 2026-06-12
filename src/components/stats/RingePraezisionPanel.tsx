import React from 'react';
import { useTranslation } from 'react-i18next';
import { getScaleColor, getWeekLabelKW } from '../../lib/statsChart';

// Panel "Ringe & Präzision": karty średnich (3 ostatnie / miesiąc) + słupki
// tygodniowe (strzały, ze średnią punktów nad słupkiem). Prezentacyjny —
// dane liczy rodzic. Używany w QuickStatsModal oraz w przeglądzie ProStats.
interface Props {
  avgArrows3: number;
  avgPoints3: number;
  avgArrowsMonth: number;
  avgPointsMonth: number;
  weeklyArrows: number[];
  weeklyPoints: number[];
  locked?: boolean;      // rozmycie słupków + przycisk odblokowania (gdy nie premium)
  onUnlock?: () => void;
}

export default function RingePraezisionPanel({
  avgArrows3, avgPoints3, avgArrowsMonth, avgPointsMonth, weeklyArrows, weeklyPoints, locked = false, onUnlock,
}: Props) {
  const { t } = useTranslation();
  const maxArrows = Math.max(...weeklyArrows, 1);
  // Średnia na strzał = Ø punktów na sesję / Ø strzał na sesję = Σpkt/Σstrzał (dokładna).
  const perArrow3 = avgArrows3 > 0 ? avgPoints3 / avgArrows3 : 0;
  const perArrowMonth = avgArrowsMonth > 0 ? avgPointsMonth / avgArrowsMonth : 0;

  return (
    <div className="space-y-6">
      {/* KARTY ŚREDNICH: Ostatnie 3 / Miesiąc — każda: punkty + strzały na sesję */}
      <div className="bg-white border-2 border-emerald-50 p-6 rounded-[32px] flex items-stretch justify-center shadow-sm divide-x divide-gray-100">
        <div className="flex flex-col items-center justify-center flex-1 px-2 gap-3">
          <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">{t('home.quickStats.avgLast3Label', { defaultValue: 'Ø Letzte 3' })}</span>
          <div className="text-center">
            <p className="text-3xl font-black text-emerald-600 leading-none">{avgPoints3 ? avgPoints3 : '–'}</p>
            <span className="text-[8px] font-bold text-emerald-400 mt-1 block uppercase tracking-tighter">{t('home.quickStats.ringeLabel', { defaultValue: 'Ringe' })}</span>
          </div>
          <div className="text-center">
            <p className="text-xl font-black text-[#0a3a2a] leading-none">{perArrow3 ? perArrow3.toFixed(1) : '–'}</p>
            <span className="text-[8px] font-bold text-gray-400 mt-1 block uppercase tracking-tighter">{t('stats.pro.unitPtsArrow', { defaultValue: 'Ringe/Pfeil' })}</span>
          </div>
        </div>
        <div className="flex flex-col items-center justify-center flex-1 px-2 gap-3">
          <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">{t('home.quickStats.avgMonthLabel', { defaultValue: 'Schnitt Monat' })}</span>
          <div className="text-center">
            <p className="text-3xl font-black text-emerald-600 leading-none">{avgPointsMonth ? avgPointsMonth : '–'}</p>
            <span className="text-[8px] font-bold text-emerald-400 mt-1 block uppercase tracking-tighter">{t('home.quickStats.ringeLabel', { defaultValue: 'Ringe' })}</span>
          </div>
          <div className="text-center">
            <p className="text-xl font-black text-[#0a3a2a] leading-none">{perArrowMonth ? perArrowMonth.toFixed(1) : '–'}</p>
            <span className="text-[8px] font-bold text-gray-400 mt-1 block uppercase tracking-tighter">{t('stats.pro.unitPtsArrow', { defaultValue: 'Ringe/Pfeil' })}</span>
          </div>
        </div>
      </div>

      {/* SŁUPKI TYGODNIOWE: wysokość = strzały, nad słupkiem średnia punktów */}
      <div className="relative">
        <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-4 ml-1">TREND (12 WO.)</h3>
        <div className={`relative transition-all duration-500 ${locked ? 'blur-lg opacity-30 pointer-events-none' : ''}`}>
          <div className="overflow-x-auto hide-scrollbar bg-gray-50 rounded-[28px] p-5 border border-gray-100">
            <div className="flex items-end justify-between gap-1 w-full h-32 relative">
              {weeklyArrows.map((val, i) => {
                const isMax = val > 0 && val === maxArrows;
                const pts = weeklyPoints[i];
                return (
                  <div key={i} className="flex flex-col items-center justify-end gap-1 relative flex-1 h-full">
                    <div className="w-full relative flex items-end justify-center h-full">
                      {val > 0 && (
                        <span className="absolute -top-8 flex flex-col items-center leading-tight">
                          {pts > 0 && <span className="text-[8px] font-black text-emerald-600">{pts.toFixed(1)}</span>}
                          <span className={`text-[8px] font-black transition-colors ${isMax ? 'text-[#0a3a2a]' : 'text-gray-400'}`}>{val}</span>
                        </span>
                      )}
                      <div className="w-full rounded-t-sm max-w-[16px] mx-auto transition-all duration-1000" style={{ height: val > 0 ? `${(val / maxArrows) * 100}%` : '4px', backgroundColor: val > 0 ? getScaleColor(val, maxArrows) : '#e5e7eb' }}></div>
                    </div>
                    <span className="text-[6px] text-gray-300 font-bold mt-1 shrink-0">{getWeekLabelKW(i)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        {locked && onUnlock && (
          <div className="absolute inset-0 flex flex-col items-center justify-center z-30 bg-[#fcfdfe]/10 backdrop-blur-[2px]">
            <button onClick={onUnlock} className="bg-[#0a3a2a] text-[#fed33e] px-8 py-3 rounded-full font-black uppercase text-[10px] tracking-widest shadow-2xl active:scale-95 transition-all flex items-center gap-2 border border-emerald-900/50">
              <span className="material-symbols-outlined text-[14px]">diamond</span>
              <span>{t('home.quickStats.buyPro', { defaultValue: 'GROT-X PRO' })}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
