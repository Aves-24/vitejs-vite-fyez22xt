import React from 'react';
import { useTranslation } from 'react-i18next';

// Trend serii (przebudowa 2026-10-29). Wcześniej skala szła od 0 do 60 i serie
// 48–55 wyglądały jak równy płot — teraz skala biegnie od najsłabszej do
// najlepszej serii TEGO treningu, nad słupkiem jest wynik, przerywana linia to
// średnia, a między rundami jest przerwa. Wygląd jak karty dziennika (tb-card).
export default function SessionTrend({ submittedEnds, onPointClick, highlighted = null, roundSize, plannedEnds = 12, bare = false }: {
  submittedEnds: any[];
  onPointClick?: (idx: number) => void;
  highlighted?: number | null;
  roundSize?: number;   // przerwa przed pierwszą serią drugiej rundy
  plannedEnds?: number; // puste miejsca do końca treningu
  bare?: boolean;       // same słupki — nagłówek daje zwijana karta (SummaryCard)
}) {
  const { t, i18n } = useTranslation();
  if (!submittedEnds || submittedEnds.length === 0) return null;

  const sums: number[] = submittedEnds.map(e => e.total_sum || 0);
  const best = Math.max(...sums);
  const worst = Math.min(...sums);
  const avg = sums.reduce((a, b) => a + b, 0) / sums.length;
  // Dół skali trochę pod najsłabszą serią, żeby i ona miała widoczny słupek.
  const span = Math.max(4, best - worst);
  const lo = Math.max(0, worst - span * 0.35);
  const pct = (v: number) => 12 + 88 * ((v - lo) / (best - lo || 1));
  const showMarks = sums.length >= 3 && best !== worst;
  const slots = Math.max(plannedEnds, sums.length);
  const fmt = (v: number) => v.toLocaleString(i18n.language, { maximumFractionDigits: 1 });

  return (
    <div className={bare ? 'w-full' : 'tb-card tb-d2 border rounded-l-md rounded-r-2xl shadow-sm pl-3 pr-3 py-3 w-full'}>
      {!bare && <div className="flex items-start justify-between gap-2 mb-1">
        <span className="block min-w-0">
          <span className="block text-[9px] font-black uppercase tracking-widest leading-tight text-emerald-700">{t('scoring.trendTitle')}</span>
          <span className="block text-[13px] font-black leading-snug text-[#0a3a2a]">{t('scoring.trendAvg', { avg: fmt(avg) })}</span>
        </span>
        <span className="shrink-0 text-[9px] font-bold text-gray-400 text-right leading-tight mt-0.5">{t('scoring.trendHint')}</span>
      </div>}

      <div className="relative">
        {/* Linia średniej — w tym samym układzie co słupki (h-28, bez podpisów). */}
        <div className="absolute inset-x-0 top-4 h-24 pointer-events-none">
          <div className="absolute inset-x-0 border-t border-dashed border-gray-400/70" style={{ bottom: `${pct(avg)}%` }} />
        </div>
        <div className="flex items-end h-28 pt-4">
          {Array.from({ length: slots }).map((_, idx) => {
            const v = sums[idx];
            const gap = roundSize && idx === roundSize ? 'ml-2' : idx > 0 ? 'ml-1' : '';
            if (v === undefined) {
              return (
                <div key={idx} className={`flex-1 h-full flex flex-col justify-end ${gap}`}>
                  <div className="w-full rounded-t-sm bg-gray-100" style={{ height: '8%' }} />
                </div>
              );
            }
            const isBest = showMarks && v === best;
            const isWorst = showMarks && v === worst;
            const isSel = highlighted === idx;
            const dim = highlighted !== null && !isSel;
            const fill = isSel ? '#0a3a2a' : isBest ? '#fed33e' : '#34d399';
            return (
              <button
                key={idx}
                onClick={() => onPointClick?.(idx)}
                className={`flex-1 h-full flex flex-col justify-end items-center active:scale-95 transition-all ${gap} ${dim ? 'opacity-40' : ''}`}
                aria-label={`${t('scoring.series')} ${idx + 1}: ${v}`}
              >
                <span className={`text-[9px] font-black tabular-nums leading-none mb-0.5 ${isWorst ? 'text-red-500' : isBest ? 'text-[#8a6d00]' : 'text-gray-500'}`}>
                  {isBest ? '★' : isWorst ? '▼' : ''}{v}
                </span>
                <div className="w-full rounded-t-sm transition-all duration-300" style={{ height: `${pct(v)}%`, backgroundColor: fill }} />
              </button>
            );
          })}
        </div>
        <div className="flex mt-1">
          {Array.from({ length: slots }).map((_, idx) => (
            <span
              key={idx}
              className={`flex-1 text-center text-[8px] font-bold ${roundSize && idx === roundSize ? 'ml-2' : idx > 0 ? 'ml-1' : ''} ${highlighted === idx ? 'text-[#0a3a2a] font-black' : sums[idx] === undefined ? 'text-gray-200' : 'text-gray-400'}`}
            >
              {idx + 1}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
