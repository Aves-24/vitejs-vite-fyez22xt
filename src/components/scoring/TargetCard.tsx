import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import SummaryCard from './SummaryCard';
import ArrowColorFilter from './ArrowColorFilter';
import RoundTargetSummary from '../RoundTargetSummary';
import HeatmapTarget from '../HeatmapTarget';

// [PODSUMOWANIE TRENINGU] Karta „Trefferbild” — wspólna dla ekranu po treningu
// i Statystyk (user 2026-10-29). Jedna duża tarcza z Gesamt / R1 / R2 w nagłówku,
// po prawej kolumna: heatmapa (tylko Stats, w miejscu tarczy — bez okienka),
// „wszystkie żółte” i miniatury strzał (filtr) przy kolorach strzał.

type View = 'all' | 1 | 2;

export default function TargetCard({ ends, roundSize, targetType, arrowColors, highlightedEnd, sightHint, heatmap = false, storageKey = 'sum-target' }: {
  ends: any[];
  roundSize: number;
  targetType: string;
  arrowColors?: boolean;
  highlightedEnd: number | null;
  sightHint?: boolean;
  heatmap?: boolean;   // przełącznik heatmapy w kolumnie (Statystyki)
  storageKey?: string;
}) {
  const { t } = useTranslation();
  const [view, setView] = useState<View>('all');
  const [colorFilter, setColorFilter] = useState<number | null>(null);
  const [plainDots, setPlainDots] = useState(false);
  const [heat, setHeat] = useState(false);

  const r1 = ends.slice(0, roundSize);
  const r2 = ends.slice(roundSize);
  const hasR2 = r2.length > 0;

  // Wybór serii z innej rundy przełącza tarczę na tę rundę — inaczej
  // podświetlenie trafiałoby w pustkę.
  useEffect(() => {
    if (highlightedEnd === null || view === 'all') return;
    const inView = view === 1 ? highlightedEnd < roundSize : highlightedEnd >= roundSize;
    if (!inView) setView(highlightedEnd < roundSize ? 1 : 2);
  }, [highlightedEnd, view, roundSize]);

  const viewEnds = view === 1 ? r1 : view === 2 ? r2 : ends;
  const viewStart = view === 2 ? roundSize : 0;
  const viewArrows = viewEnds.reduce((acc: number, e: any) => acc + (e.arrows?.length || 0), 0);
  const viewLabel = view === 'all' ? t('scoring.viewAll') : `${t('scoringView.round', 'Runda')} ${view}`;

  // Heatmapa: wszystkie strzały widoku z pozycją, bez złych strzałów, z filtrem koloru.
  const heatDots = useMemo(() => viewEnds.flatMap((e: any) => (e.dots || [])
    .map((d: any, i: number) => ({ d, i }))
    .filter(({ d, i }: any) => d?.x != null && d?.y != null && !d.bad && (colorFilter === null || !arrowColors || i === colorFilter))
    .map(({ d }: any) => d)), [viewEnds, colorFilter, arrowColors]);

  const roundBtn = (on: boolean) => `w-9 h-9 mb-1 rounded-full flex items-center justify-center border shadow-sm transition-colors ${on ? 'bg-[#fed33e] border-[#e5bd38] text-[#0a3a2a]' : 'bg-white border-gray-200 text-gray-500'}`;
  const heatBtn = heatmap ? (
    <button onClick={() => setHeat(v => !v)} className={`w-9 h-9 mb-1 rounded-full flex items-center justify-center border shadow-sm transition-colors ${heat ? 'bg-orange-500 border-orange-600 text-white' : 'bg-white border-gray-200 text-orange-500'}`} aria-pressed={heat} aria-label={t('stats.zoom.heatmap', 'Heatmap')} title={t('stats.zoom.heatmap', 'Heatmap')}>
      <span className="material-symbols-outlined text-[18px]">local_fire_department</span>
    </button>
  ) : null;
  const yellowBtn = arrowColors && !heat ? (
    // Włącz/wyłącz (user 2026-10-29: zamiast przytrzymania) — wszystkie kropki żółte.
    <button onClick={() => setPlainDots(v => !v)} className={roundBtn(plainDots)} aria-pressed={plainDots} aria-label={t('scoring.holdPlain')} title={t('scoring.holdPlain')}>
      <span className="material-symbols-outlined text-[18px]">contrast</span>
    </button>
  ) : null;
  const aside = arrowColors ? (
    <ArrowColorFilter value={colorFilter} onChange={setColorFilter} vertical top={<>{heatBtn}{yellowBtn}</>} />
  ) : heatBtn ? <div className="flex flex-col items-center">{heatBtn}</div> : undefined;

  return (
    <SummaryCard
      icon="adjust"
      kind={t('scoring.targetCard')}
      title={hasR2 ? `${viewArrows} ${t('common.arrows')}` : `${viewLabel} · ${viewArrows} ${t('common.arrows')}`}
      storageKey={storageKey}
      // Przełącznik rund w wierszu nagłówka (user 2026-10-29: kompaktowo).
      control={hasR2 ? (
        <div className="flex bg-gray-50 rounded-xl p-0.5 shrink-0">
          {(['all', 1, 2] as const).map(v => (
            <button
              key={String(v)}
              onClick={() => setView(v)}
              className={`px-2 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wide transition-all ${view === v ? 'bg-white text-[#0a3a2a] shadow-sm' : 'text-gray-400'}`}
              aria-pressed={view === v}
            >
              {v === 'all' ? t('scoring.viewAll') : `R${v}`}
            </button>
          ))}
        </div>
      ) : undefined}
    >
      {heat ? (
        <div className="w-full flex items-center gap-1.5 tb-fade-in">
          <div className="flex-1 min-w-0"><HeatmapTarget dots={heatDots} targetType={targetType} /></div>
          {aside && <div className="shrink-0">{aside}</div>}
        </div>
      ) : (
        <RoundTargetSummary
          bare
          ends={viewEnds}
          highlightedEnd={highlightedEnd}
          startIndex={viewStart}
          targetType={targetType}
          arrowColors={arrowColors}
          colorFilter={colorFilter}
          showGroup
          sightHint={sightHint}
          plainDots={plainDots}
          aside={aside}
        />
      )}
    </SummaryCard>
  );
}
