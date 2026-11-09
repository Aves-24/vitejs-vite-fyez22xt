import React, { useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import SummaryCard from '../scoring/SummaryCard';
import { sessionDistanceLabel, distanceKey, distanceMeters } from '../../config/distances';
import { zonesOf, addZones, countsForZones, ZONE_COLORS, ZONE_KEYS, type Zones } from '../../utils/zones';
import type { StatsGroup } from '../../config/statsGroups';

// [STREFY 2026-11-06] To samo, co pierścień na Home — 6 ostatnich treningów
// z punktami (bez technicznych i dmuchawki) — tylko dokładnie: razem i osobno
// dla każdego dystansu, z procentami i liczbą strzał. Klik w pierścień na Home
// przewija tutaj (scrollIntoView).

const toMs = (ts: any): number =>
  typeof ts?.toMillis === 'function' ? ts.toMillis() : ts?.seconds ? ts.seconds * 1000 : typeof ts === 'number' ? ts : 0;

function ZoneRow({ label, sub, zones }: { label: string; sub: string; zones: Zones }) {
  const { t } = useTranslation();
  const total = zones.reduce((a, b) => a + b, 0);
  const pct = (n: number) => (total ? (n / total) * 100 : 0);
  const names = ZONE_KEYS.map(k => (k === 'miss' ? 'M' : t(`stats.pro.zones.${k}`)));
  return (
    <div className="py-2.5 first:pt-0 last:pb-0">
      <div className="flex items-baseline justify-between gap-2 mb-1.5">
        <span className="text-[13px] font-black text-[#0a3a2a] truncate">{label}</span>
        <span className="text-[11px] font-bold text-gray-400 shrink-0">{sub}</span>
      </div>
      <div className="w-full h-3 flex rounded-full overflow-hidden bg-gray-100 zones-track-bg">
        {zones.map((n, i) => n > 0 && ZONE_COLORS[i]
          ? <div key={i} style={{ width: `${pct(n)}%`, backgroundColor: ZONE_COLORS[i] }} className="h-full" />
          : null)}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1.5">
        {zones.map((n, i) => n > 0 ? (
          <span key={i} className="flex items-center gap-1 text-[11px] font-bold text-gray-600">
            <span className="w-2 h-2 rounded-full shrink-0 border border-gray-200" style={{ backgroundColor: ZONE_COLORS[i] || 'transparent' }} />
            {names[i]} {pct(n).toLocaleString(undefined, { maximumFractionDigits: 1 })} % <span className="text-gray-400">({n})</span>
          </span>
        ) : null)}
      </div>
    </div>
  );
}

export default function RecentZonesCard({ sessions, scrollIntoView = false, group = 'target' }: { sessions: any[]; scrollIntoView?: boolean; group?: StatsGroup }) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);

  const data = useMemo(() => {
    const recent = [...sessions]
      .filter(s => countsForZones(s, group) && Array.isArray(s.ends) && s.ends.length > 0)
      .sort((a, b) => toMs(b.timestamp) - toMs(a.timestamp))
      .slice(0, 6);
    const empty: Zones = [0, 0, 0, 0, 0, 0];
    let all = empty;
    const byDist = new Map<string, { label: string; meters: number; zones: Zones; count: number }>();
    for (const s of recent) {
      const z = zonesOf(s.ends, group);
      all = addZones(all, z);
      const key = distanceKey(s);
      const cur = byDist.get(key) || { label: sessionDistanceLabel(s), meters: distanceMeters(s.distance || ''), zones: empty, count: 0 };
      byDist.set(key, { ...cur, zones: addZones(cur.zones, z), count: cur.count + 1 });
    }
    return { recent, all, rows: [...byDist.values()].sort((a, b) => a.meters - b.meters) };
  }, [sessions, group]);

  useEffect(() => {
    if (scrollIntoView && data.recent.length > 0) {
      ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [scrollIntoView, data.recent.length]);

  if (data.recent.length === 0) return null;
  const arrows = (z: Zones) => z.reduce((a, b) => a + b, 0);
  const goldPct = Math.round((data.all[0] / Math.max(1, arrows(data.all))) * 100);

  return (
    <div ref={ref} className="scroll-mt-4" data-testid="recent-zones">
      <SummaryCard
        icon="donut_large"
        stripe="tb-d2"
        kind={t('stats.pro.recentZonesTitle', { count: data.recent.length })}
        title={`${t('stats.pro.zones.gold')}: ${goldPct} %`}
        storageKey="pro-recent-zones"
      >
        <div className="divide-y divide-gray-100">
          <ZoneRow
            label={t('stats.pro.recentZonesAll')}
            sub={t('stats.pro.recentZonesSub', { count: data.recent.length, arrows: arrows(data.all) })}
            zones={data.all}
          />
          {data.rows.length > 1 && data.rows.map(r => (
            <ZoneRow
              key={r.label}
              label={r.label}
              sub={t('stats.pro.recentZonesSub', { count: r.count, arrows: arrows(r.zones) })}
              zones={r.zones}
            />
          ))}
        </div>
      </SummaryCard>
    </div>
  );
}
