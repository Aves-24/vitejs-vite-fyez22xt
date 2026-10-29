import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { GroupTrendPoint } from '../../utils/groupTrend';

/**
 * [GRUPA W CZASIE] Karta „Gruppengröße” (PRO) — średnica grupy (80% strzał)
 * dla ostatnich treningów na wybranym dystansie. Mniejsza = lepiej, więc
 * słupki od zera (to wielkość), przerywana linia = średnia, najmniejsza
 * grupa z gwiazdką. Dotknięcie słupka pokazuje datę, przesunięcie i strzały.
 */
export default function GroupTrendCard({ points, onOpenSession }: {
  points: GroupTrendPoint[];
  onOpenSession?: (sessionId: string, date: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const [sel, setSel] = useState<number | null>(null);
  if (points.length < 2) return null;

  const cm = (v: number) => Math.round(v).toLocaleString(i18n.language);
  const vals = points.map(p => p.diameterCm);
  const top = Math.max(...vals) * 1.15;
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  const best = Math.min(...vals);
  const last = points[points.length - 1];
  const prev = points.slice(0, -1);
  const prevAvg = prev.reduce((a, p) => a + p.diameterCm, 0) / prev.length;
  const delta = Math.round(last.diameterCm - prevAvg);
  const h = (v: number) => `${Math.max(4, (v / top) * 100)}%`;
  const shortDate = (d: string) => d.split('.').slice(0, 2).join('.');
  const picked = sel !== null ? points[sel] : null;

  return (
    <div className="bg-white rounded-[24px] border border-gray-100 p-4 shadow-sm">
      <div className="flex justify-between items-start mb-1">
        <div>
          <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{t('stats.groupTrend.title')}</h3>
          <p className="text-[8px] font-bold text-gray-300 uppercase tracking-widest mt-0.5">{t('stats.groupTrend.sub', { count: points.length })}</p>
        </div>
        <span className="material-symbols-outlined text-emerald-600 text-[20px]">adjust</span>
      </div>

      {/* Wynik ostatniego treningu i porównanie ze średnią wcześniejszych. */}
      <div className="flex items-baseline gap-2 mt-2">
        <span className="text-3xl font-black text-[#0a3a2a] tracking-tighter tabular-nums">⌀ {cm(last.diameterCm)}</span>
        <span className="text-[11px] font-black text-gray-400">cm</span>
        {delta !== 0 && (
          <span className={`text-[11px] font-black ${delta < 0 ? 'text-emerald-700' : 'text-red-600'}`}>
            {delta < 0 ? '▼ ' : '▲ '}{t(delta < 0 ? 'stats.groupTrend.smaller' : 'stats.groupTrend.larger', { cm: cm(Math.abs(delta)) })}
          </span>
        )}
      </div>
      <p className="text-[10px] font-bold text-gray-400">{t('stats.groupTrend.lastHint', { avg: cm(prevAvg) })}</p>

      {/* Słupki: wspólna skala od zera, linia średniej w tym samym układzie.
          Szerokość słupka ograniczona — przy 2–3 treningach nie robią się płyty. */}
      <div className="relative mt-4 h-28">
        <div className="absolute inset-x-0 border-t border-dashed border-gray-400/70 pointer-events-none" style={{ bottom: h(avg) }} />
        <div className="absolute inset-0 flex items-end justify-around gap-1.5">
          {points.map((p, i) => {
            const isBest = p.diameterCm === best;
            const isSel = sel === i;
            const isLast = i === points.length - 1;
            return (
              <button
                key={p.id}
                onClick={() => setSel(isSel ? null : i)}
                className={`relative flex-1 max-w-[36px] h-full flex flex-col justify-end items-center active:scale-95 transition-all ${sel !== null && !isSel ? 'opacity-45' : ''}`}
                aria-label={`${p.date}: ⌀ ${cm(p.diameterCm)} cm`}
                aria-pressed={isSel}
              >
                {(isBest || isLast || isSel) && (
                  <span className={`text-[9px] font-black tabular-nums leading-none mb-0.5 ${isBest ? 'text-[#8a6d00]' : 'text-gray-500'}`}>
                    {isBest ? '★' : ''}{cm(p.diameterCm)}
                  </span>
                )}
                <div
                  className="w-full rounded-t-[4px] transition-all duration-300"
                  style={{ height: h(p.diameterCm), backgroundColor: isSel ? '#0a3a2a' : isBest ? '#fed33e' : '#34d399' }}
                />
              </button>
            );
          })}
        </div>
      </div>
      <div className="flex justify-around gap-1.5 mt-1 border-t border-gray-100 pt-1">
        {points.map((p, i) => (
          <span key={p.id} className={`flex-1 max-w-[36px] text-center text-[8px] font-bold tabular-nums ${sel === i ? 'text-[#0a3a2a] font-black' : 'text-gray-400'}`}>{shortDate(p.date)}</span>
        ))}
      </div>

      {picked && (
        <div className="mt-3 pt-2.5 border-t border-gray-100 flex items-center justify-between gap-2 tb-fade-in">
          <span className="text-[11px] font-bold text-gray-500 min-w-0">
            <span className="font-black text-[#0a3a2a]">{picked.date}</span>
            {' · ⌀ '}{cm(picked.diameterCm)} cm · {t('stats.groupTrend.offset', { cm: cm(picked.offsetCm) })} · {picked.n} {t('common.arrows')}
          </span>
          {onOpenSession && (
            <button onClick={() => onOpenSession(picked.id, picked.date)} className="shrink-0 text-[10px] font-black uppercase tracking-widest text-emerald-700 active:scale-95">
              {t('stats.groupTrend.open')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
