import React from 'react';
import { useTranslation } from 'react-i18next';
import SummaryCard from './SummaryCard';
import { animalSummary, stationResult, animalFormatOf } from '../../config/animalRound';
import { fmtNum } from '../../utils/formatNumber';

// [ANIMAL ROUND 2026-11-10] „Trefferquote” zamiast Trefferbild — przy zwierzętach
// liczy się, KTÓRĄ strzałą padło trafienie i czy w Kill, a nie miejsce na rysunku.
// Wspólna dla ekranu po treningu, Statystyk i profilu ucznia.
export default function AnimalCard({ ends, targetType, storageKey = 'sum-animal' }: { ends: any[]; targetType?: string | null; storageKey?: string }) {
  const { t } = useTranslation();
  // Format z tarczy sesji (IFAA / DBSV Wald / DBSV Jagd) — strefa z numeru strzały.
  const f = animalFormatOf(targetType);
  const s = animalSummary(ends, f);
  const pct = (n: number) => (s.stations ? Math.round((n / s.stations) * 100) : 0);
  const bars: { label: string; n: number; cls: string }[] = [
    // Jagdrunde (1 strzała) — tylko „1. strzałą” i „bez trafienia”.
    ...['bg-[#0a3a2a]', 'bg-emerald-600', 'bg-emerald-400'].slice(0, f.maxArrows).map((cls, i) => ({ label: t('animal.byArrow', { n: i + 1 }), n: s.byArrow[i], cls })),
    { label: t('animal.misses'), n: s.misses, cls: 'bg-indigo-900' },
  ];
  return (
    <SummaryCard icon="eco" kind={t('animal.summary')} title={t('animal.stations', { n: s.stations })} storageKey={storageKey}>
      <div className="space-y-1.5" data-testid="animal-card">
        {bars.map(b => (
          <div key={b.label} className="flex items-center gap-2 text-[11px] font-bold text-gray-600">
            <span className="w-28 shrink-0 truncate">{b.label}</span>
            <span className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden">
              <span className={`block h-full rounded-full ${b.cls}`} style={{ width: `${pct(b.n)}%` }} />
            </span>
            <span className="w-14 text-right font-black text-[#0a3a2a]">{b.n} · {pct(b.n)}%</span>
          </div>
        ))}
        <div className="grid grid-cols-3 gap-1.5 pt-2">
          <Stat label={t('animal.kills')} value={String(s.kills)} cls="bg-[#F2C94C] text-[#333]" />
          <Stat label={t(f.woundKey)} value={String(s.wounds)} cls="bg-white border border-gray-200 text-[#333]" />
          <Stat label={t('animal.perStation')} value={fmtNum(s.perStation, 1)} cls="bg-[#cce6dc] text-[#0a3a2a]" />
        </div>
        {/* Lista stanowisk z nazwami — które zwierzę sprawiło kłopot. */}
        <div className="pt-2 grid grid-cols-2 gap-x-3 gap-y-0.5">
          {ends.map((e, i) => {
            const r = stationResult(e.rawArrows || e.arrows, f);
            return (
              <div key={i} className="flex items-center gap-1.5 text-[10px] font-bold text-gray-500 min-w-0">
                <span className="w-5 shrink-0 text-gray-400">{i + 1}</span>
                <span className="flex-1 truncate text-[#0a3a2a]">{e.animal || '–'}</span>
                <span className={`shrink-0 w-7 text-center rounded ${r ? (r.hit === 'K' ? 'bg-[#F2C94C] text-[#333]' : 'bg-white border border-gray-200') : 'bg-indigo-900 text-white'}`}>{r ? r.points : 0}</span>
              </div>
            );
          })}
        </div>
      </div>
    </SummaryCard>
  );
}

function Stat({ label, value, cls }: { label: string; value: string; cls: string }) {
  return (
    <div className={`rounded-xl px-2 py-1.5 text-center ${cls}`}>
      <span className="block text-[9px] font-black uppercase tracking-widest opacity-70">{label}</span>
      <span className="block text-[16px] font-black leading-tight">{value}</span>
    </div>
  );
}
