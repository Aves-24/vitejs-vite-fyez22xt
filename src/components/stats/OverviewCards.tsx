import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import SummaryCard from '../scoring/SummaryCard';
import { topicLabel, isKnownTopic } from '../../constants/trainingTopics';
import { getWeekLabelKW } from '../../lib/statsChart';
import { RANK_BOW_LABEL, type RankBow } from '../../utils/rankEngine';
import { monthlyRhythm, techTopics, weeklyArrowsSplit, handicapSeries } from '../../utils/overviewStats';

// [PRO PROGRESS — ÜBERBLICK 2026-10-30] Cztery karty niezależne od dystansu
// (user: „TECH nic nie mówi — policzmy chociaż treningi techniczne w miesiącu”).
// Kolory ze słownika: trening z punktacją zielony, techniczny sky, zawody ciemnozielony.

const C_SCORED = '#10b981';
const C_TECH = '#38bdf8';
const C_TOURNEY = '#0a3a2a';

function Legend({ items }: { items: { color: string; label: string }[] }) {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
      {items.map(i => (
        <span key={i.label} className="flex items-center gap-1 text-[9px] font-bold text-gray-500">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: i.color }} />{i.label}
        </span>
      ))}
    </div>
  );
}

/** 1. Rytm treningów w miesiącach — także FREE. */
export function RhythmCard({ sessions, months }: { sessions: any[]; months: number }) {
  const { t, i18n } = useTranslation();
  const rows = useMemo(() => monthlyRhythm(sessions, months), [sessions, months]);
  const max = Math.max(1, ...rows.map(r => r.scored + r.tech + r.tourney));
  const now = rows[rows.length - 1];
  const total = now.scored + now.tech + now.tourney;
  const monthName = (r: { year: number; month: number }, long = false) =>
    new Date(r.year, r.month, 1).toLocaleDateString(i18n.language, { month: long ? 'long' : 'short' });
  return (
    <SummaryCard icon="calendar_month" stripe="tb-d2" kind={t('stats.overview.rhythm')} title={t('stats.overview.rhythmSub', { count: months })} storageKey="pro-rhythm">
      <div className="flex items-end justify-around gap-2 h-28 pt-4">
        {rows.map(r => {
          const sum = r.scored + r.tech + r.tourney;
          const seg = (n: number, color: string) => n > 0 ? <div style={{ height: `${(n / max) * 100}%`, backgroundColor: color }} /> : null;
          return (
            <div key={r.key} className="flex-1 max-w-[44px] h-full flex flex-col items-center justify-end">
              <span className="text-[10px] font-black text-[#0a3a2a] tabular-nums mb-0.5">{sum || ''}</span>
              <div className="w-full flex-1 flex flex-col justify-end rounded-t-md overflow-hidden">
                {seg(r.tech, C_TECH)}
                {seg(r.scored, C_SCORED)}
                {seg(r.tourney, C_TOURNEY)}
                {sum === 0 && <div className="h-1 bg-gray-200 rounded" />}
              </div>
              <span className="text-[9px] font-bold text-gray-400 mt-1 capitalize">{monthName(r)}</span>
            </div>
          );
        })}
      </div>
      <Legend items={[{ color: C_SCORED, label: t('stats.overview.legendScored') }, { color: C_TECH, label: t('stats.overview.legendTech') }, { color: C_TOURNEY, label: t('stats.overview.legendTourney') }]} />
      <p className="text-[11px] font-bold text-[#0a3a2a] mt-2 leading-snug">
        {t('stats.overview.rhythmNow', { month: monthName(now, true), total, tech: now.tech, pct: total ? Math.round((now.tech / total) * 100) : 0 })}
      </p>
    </SummaryCard>
  );
}

/** 2. Tematy treningów technicznych z ostatnich 3 miesięcy. */
export function TechTopicsCard({ sessions }: { sessions: any[] }) {
  const { t } = useTranslation();
  const since = useMemo(() => { const d = new Date(); d.setMonth(d.getMonth() - 3); return d.getTime(); }, []);
  const r = useMemo(() => techTopics(sessions, since), [sessions, since]);
  const known = r.topics.filter(x => isKnownTopic(x.id));
  return (
    <SummaryCard icon="fitness_center" iconCls="text-sky-500" stripe="tb-tech" kind={t('stats.overview.techTopics')} kindCls="text-sky-600" title={t('stats.overview.techLine', { count: r.count, arrows: r.arrows })} storageKey="pro-techtopics">
      {r.count === 0 ? (
        <p className="text-[11px] font-bold text-gray-400">{t('stats.noTechSessions')}</p>
      ) : (
        <>
          {known.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {known.map(x => (
                <span key={x.id} className="inline-flex items-center gap-1 bg-sky-50 text-sky-800 border border-sky-100 px-2 py-1 rounded-full text-[10px] font-black">
                  {topicLabel(x.id, t)}<span className="text-sky-500 tabular-nums">{x.count}×</span>
                </span>
              ))}
            </div>
          ) : (
            <p className="text-[11px] font-bold text-gray-400">{t('stats.overview.techNoTopics')}</p>
          )}
          {(r.focus > 0 || r.mirror > 0) && (
            <p className="text-[10px] font-bold text-gray-500 mt-2 flex flex-wrap gap-x-3">
              {r.focus > 0 && <span className="flex items-center gap-1"><span className="material-symbols-outlined text-[13px] text-[#b8860b]">center_focus_strong</span>{t('stats.overview.techFocus', { count: r.focus })}</span>}
              {r.mirror > 0 && <span className="flex items-center gap-1"><span className="material-symbols-outlined text-[13px] text-gray-400">videocam</span>{t('stats.overview.techMirror', { count: r.mirror })}</span>}
            </p>
          )}
        </>
      )}
    </SummaryCard>
  );
}

/** 3. Strzały na tydzień — z punktacją i techniczne razem (pełne obciążenie). */
export function WeeklyLoadCard({ sessions }: { sessions: any[] }) {
  const { t } = useTranslation();
  const weeks = useMemo(() => weeklyArrowsSplit(sessions), [sessions]);
  const max = Math.max(1, ...weeks.map(w => w.scored + w.tech));
  const total = weeks.reduce((a, w) => a + w.scored + w.tech, 0);
  return (
    <SummaryCard icon="bar_chart" stripe="tb-d1" kind={t('stats.overview.weekly')} title={t('stats.overview.weeklySub', { count: total })} storageKey="pro-weeklyall">
      <div className="flex items-end justify-between gap-1 h-28 pt-4">
        {weeks.map((w, i) => {
          const sum = w.scored + w.tech;
          return (
            <div key={i} className="flex-1 h-full flex flex-col items-center justify-end">
              <span className="text-[7px] font-black text-gray-400 tabular-nums mb-0.5">{sum || ''}</span>
              <div className="w-full max-w-[16px] flex-1 flex flex-col justify-end rounded-t-sm overflow-hidden">
                {w.tech > 0 && <div style={{ height: `${(w.tech / max) * 100}%`, backgroundColor: C_TECH }} />}
                {w.scored > 0 && <div style={{ height: `${(w.scored / max) * 100}%`, backgroundColor: C_SCORED }} />}
                {sum === 0 && <div className="h-1 bg-gray-200 rounded" />}
              </div>
              <span className="text-[6px] text-gray-300 font-bold mt-1">{getWeekLabelKW(i)}</span>
            </div>
          );
        })}
      </div>
      <Legend items={[{ color: C_SCORED, label: t('stats.overview.legendScored') }, { color: C_TECH, label: t('stats.overview.legendTech') }]} />
    </SummaryCard>
  );
}

/** 4. Przebieg handicapu — porównywalny między dystansami; niżej = lepiej. */
export function HandicapCard({ sessions, bow, fallbackBowClass }: { sessions: any[]; bow: RankBow; fallbackBowClass?: string | null }) {
  const { t } = useTranslation();
  const pts = useMemo(() => handicapSeries(sessions, bow, fallbackBowClass).slice(-15), [sessions, bow, fallbackBowClass]);
  if (pts.length === 0) return null;
  const last = pts[pts.length - 1];
  const first = pts[0];
  const delta = first.current - last.current; // dodatni = handicap spadł = lepiej
  const W = 300, H = 90, pad = 10;
  const vals = pts.flatMap(p => [p.hc, p.current]);
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const range = hi - lo || 1;
  const x = (i: number) => pad + (i / Math.max(pts.length - 1, 1)) * (W - pad * 2);
  // Niżej = lepiej, więc lepszy handicap rysujemy wyżej.
  const y = (v: number) => pad + ((v - lo) / range) * (H - pad * 2);
  const trendTxt = delta > 0 ? t('stats.overview.hcBetter', { n: delta }) : delta < 0 ? t('stats.overview.hcWorse', { n: -delta }) : t('stats.overview.hcStable');
  return (
    <SummaryCard
      icon={delta >= 0 ? 'trending_up' : 'trending_down'}
      stripe="tb-d4"
      kind={t('stats.overview.handicap')}
      title={<>HCP {last.current} <span className={`text-[11px] ${delta > 0 ? 'text-emerald-600' : delta < 0 ? 'text-red-500' : 'text-gray-400'}`}>· {trendTxt}</span></>}
      storageKey="pro-handicap"
    >
      {pts.length < 2 ? (
        <p className="text-[11px] font-bold text-gray-400">{t('stats.overview.hcTooFew')}</p>
      ) : (
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full mt-1" style={{ overflow: 'visible' }}>
          {pts.map((p, i) => <circle key={`h${i}`} cx={x(i)} cy={y(p.hc)} r={2.5} fill="#9ca3af" opacity={0.45} />)}
          <polyline points={pts.map((p, i) => `${x(i)},${y(p.current)}`).join(' ')} fill="none" stroke="#0a3a2a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx={x(pts.length - 1)} cy={y(last.current)} r={4} fill="#fed33e" stroke="#0a3a2a" strokeWidth="1.5" />
        </svg>
      )}
      <p className="text-[9px] font-bold text-gray-400 mt-2 leading-snug">
        {t(RANK_BOW_LABEL[bow])} · {t('stats.overview.handicapSub', { count: pts.length })} · {t('stats.overview.hcHint')}
      </p>
    </SummaryCard>
  );
}

export default function OverviewSection({ sessions, isPremium, months, bow, fallbackBowClass, lock, sectionLabel }: {
  sessions: any[];
  isPremium: boolean;
  months: number;
  bow: RankBow;
  fallbackBowClass?: string | null;
  lock: React.ReactNode;        // karta PRO dla FREE
  sectionLabel: React.ReactNode;
}) {
  return (
    <>
      {sectionLabel}
      <RhythmCard sessions={sessions} months={months} />
      {isPremium ? (
        <>
          <HandicapCard sessions={sessions} bow={bow} fallbackBowClass={fallbackBowClass} />
          <WeeklyLoadCard sessions={sessions} />
          <TechTopicsCard sessions={sessions} />
        </>
      ) : lock}
    </>
  );
}
