import React from 'react';
import { useTranslation } from 'react-i18next';
import SummaryCard from './SummaryCard';
import SessionTrend from '../SessionTrend';
import { arrowColorAt } from '../../config/arrowColors';

// [PODSUMOWANIE TRENINGU] Karta „Trainings-Trend” z wybraną serią — wspólna
// dla ekranu po treningu i Statystyk (user 2026-10-29: Stats ma wyglądać tak samo).

const arrowBg = (val: string) => {
  if (['X', '10', '9'].includes(val)) return 'bg-[#F2C94C] text-[#333] shadow-sm';
  if (['8', '7'].includes(val)) return 'bg-[#EB5757] text-white shadow-sm';
  if (['6', '5'].includes(val)) return 'bg-[#2F80ED] text-white shadow-sm';
  if (['4', '3'].includes(val)) return 'bg-[#333] text-white shadow-sm';
  if (val === 'M') return 'bg-purple-900 text-white shadow-sm';
  return 'bg-gray-100 text-gray-400';
};

export default function TrendCard({ ends, highlighted, onPick, roundSize, plannedEnds, arrowColors, storageKey = 'sum-trend' }: {
  ends: any[];
  highlighted: number | null;
  onPick: (idx: number | null) => void;  // null = odznacz
  roundSize: number;
  plannedEnds?: number;
  arrowColors?: boolean;
  storageKey?: string;
}) {
  const { t, i18n } = useTranslation();
  if (!ends.length) return null;
  const selected = highlighted !== null ? ends[highlighted] : null;
  const avg = ends.reduce((a, e) => a + (e.total_sum || 0), 0) / ends.length;

  return (
    <SummaryCard
      icon="bar_chart"
      kind={t('scoring.trendTitle')}
      title={t('scoring.trendAvg', { avg: avg.toLocaleString(i18n.language, { maximumFractionDigits: 1 }) })}
      right={<span className="text-[9px] font-bold text-gray-400 mr-1">{t('scoring.trendHint')}</span>}
      storageKey={storageKey}
    >
      <SessionTrend bare submittedEnds={ends} highlighted={highlighted} roundSize={roundSize} plannedEnds={plannedEnds ?? ends.length} onPointClick={idx => onPick(highlighted === idx ? null : idx)} />
      {selected && highlighted !== null && (
        // Siatka: wynik | strzały | ✕, a pod spodem „Schussreihenfolge” | kolory —
        // podpis po lewej w tej samej linii co kolory (user 2026-10-29: mniej miejsca).
        <div key={highlighted} className="mt-3 pt-2.5 border-t border-gray-100 grid grid-cols-[auto_1fr_auto] items-center gap-x-2 gap-y-1 tb-fade-in">
          <div className="flex flex-col">
            <span className="text-[9px] font-black text-emerald-700 uppercase tracking-widest">{t('scoring.series')} {highlighted + 1}</span>
            <span className="text-lg font-black text-[#0a3a2a] leading-tight">{selected.total_sum} {t('scoringView.pts', 'pkt')}</span>
          </div>
          <div className="flex gap-1 justify-end">
            {selected.arrows?.map((a: string, i: number) => (
              <div key={i} className={`w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-black ${arrowBg(a)}`}>{a}</div>
            ))}
          </div>
          <button onClick={() => onPick(null)} className="text-gray-400 active:scale-90" aria-label={t('common.close', 'Schließen')}>
            <span className="material-symbols-outlined text-sm">close</span>
          </button>
          {/* [KOLORY STRZAŁ] Wynik posortowany, pod nim kolejność strzelania (user 2026-10-29). */}
          {arrowColors && (selected.rawArrows || []).length > 0 && (
            <>
              <span className="text-[8px] font-black text-gray-400 uppercase tracking-wider leading-tight">{t('scoring.colorFilter')}</span>
              <div className="flex gap-1 justify-end">
                {(selected.rawArrows as string[]).map((a, i) => {
                  const c = arrowColorAt(i);
                  return (
                    <div key={i} className="w-7 flex flex-col items-center">
                      <span className="w-3 h-3 rounded-full border border-gray-300" style={{ backgroundColor: c?.hex || '#e5e7eb' }} />
                      <span className="text-[9px] font-black text-gray-500 tabular-nums leading-tight">{a}</span>
                    </div>
                  );
                })}
              </div>
              <span />
            </>
          )}
        </div>
      )}
    </SummaryCard>
  );
}
