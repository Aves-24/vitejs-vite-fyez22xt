import React from 'react';
import { useTranslation } from 'react-i18next'; // <--- DODANE

export default function SessionTrend({ submittedEnds, onPointClick }: { submittedEnds: any[], onPointClick?: (idx: number) => void }) {
  const { t } = useTranslation(); // <--- DODANE
  if (!submittedEnds || submittedEnds.length === 0) return null;

  const maxScore = 60; // Maksymalny wynik z 6 strzał

  // --- 12-STOPNIOWA SKALA KOLORÓW (Zmienia się co 5 punktów) ---
  const getBarColor = (score: number) => {
    if (score >= 56) return '#10b981'; // 56-60: Ciemny Szmaragd (Wybitnie)
    if (score >= 51) return '#34d399'; // 51-55: Jasny Szmaragd
    if (score >= 46) return '#22c55e'; // 46-50: Zielony (Bardzo dobrze)
    if (score >= 41) return '#4ade80'; // 41-45: Jasny Zielony
    if (score >= 36) return '#84cc16'; // 36-40: Limonkowy (Dobrze)
    if (score >= 31) return '#a3e635'; // 31-35: Jasny Limonkowy
    if (score >= 26) return '#facc15'; // 26-30: Żółty
    if (score >= 21) return '#fbbf24'; // 21-25: Miodowy
    if (score >= 16) return '#f59e0b'; // 16-20: Ciemno Żółty / Jasny Pomarańcz (Średnio)
    if (score >= 11) return '#f97316'; // 11-15: Pomarańczowy
    if (score >= 6)  return '#ef4444'; // 6-10:  Czerwony (Słabo)
    return '#dc2626';                  // 0-5:   Ciemny Czerwony (Źle)
  };

  return (
    <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-200 w-full mt-2">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{t('scoring.trendTitle')}</h3>
        <span className="text-[9px] font-bold text-emerald-500 bg-emerald-50 px-2 py-0.5 rounded animate-pulse">
          {t('scoring.trendHint')}
        </span>
      </div>
      
      <div className="flex items-end justify-between h-24 gap-1">
        {submittedEnds.map((end, idx) => {
          // Minimalna wysokość to 10%, żeby słupek zawsze był widoczny
          const heightPct = Math.max(10, (end.total_sum / maxScore) * 100);
          
          return (
            <div 
              key={idx} 
              onClick={() => onPointClick && onPointClick(idx)}
              className="relative h-full flex-1 flex flex-col justify-end group cursor-pointer active:scale-95 transition-all"
            >
              {/* SŁUPEK Z DYNAMICZNYM KOLOREM I WYSOKOŚCIĄ */}
              <div 
                className="w-full rounded-t-sm opacity-90 transition-all duration-300 group-hover:opacity-100 group-active:brightness-110 shadow-sm" 
                style={{ 
                  height: `${heightPct}%`, 
                  backgroundColor: getBarColor(end.total_sum) 
                }}
              ></div>
              <span className="text-[8px] font-bold text-gray-400 text-center mt-1">P{idx + 1}</span>
            </div>
          );
        })}
        
        {/* Puste słupki wypełniające resztę z 12 rund */}
        {Array.from({ length: Math.max(0, 12 - submittedEnds.length) }).map((_, i) => (
          <div key={`empty-${i}`} className="relative h-full flex-1 flex flex-col justify-end">
            <div className="w-full bg-gray-50 rounded-t-sm" style={{ height: '10%' }}></div>
            <span className="text-[8px] font-bold text-gray-200 text-center mt-1">-</span>
          </div>
        ))}
      </div>
    </div>
  );
}