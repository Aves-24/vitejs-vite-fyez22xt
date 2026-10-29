import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getRecentSessions } from '../../lib/recentSessions';
import { distanceKey } from '../../config/distances';
import { getStats } from '../../utils/endStats';

// [PODSUMOWANIE TRENINGU] Karta „Bilanz” nad przyciskiem zapisu (2026-10-29):
// wynik, porównanie z ostatnimi treningami na tym dystansie i tarczy, rundy
// obok siebie, równość serii i rozkład trafień. Wygląd kart dziennika.
//
// Historia z getRecentSessions (12 tygodni, najpierw cache) — ten sam odczyt,
// co w statystykach PRO, więc zwykle zero dodatkowych odczytów z Firestore.
// Punkty porównujemy tylko z treningami o tej samej liczbie strzał (jak
// dziennik), inaczej porównujemy średnią na strzałę.

const COMPARE_LAST = 5;
const MIN_PRIOR_BEST = 3; // „Bestes von N” dopiero przy 3 wcześniejszych

const VALUE_ORDER = ['X', '10', '9', '8', '7', '6', '5', '4', '3', '2', '1', 'M'];
// Kolor pierścienia; wewnętrzny pierścień koloru ciemniej, zewnętrzny jaśniej —
// inaczej X, 10 i 9 zlewają się na pasku w jeden złoty blok.
const valueColor = (v: string): { bg: string; ring?: boolean } => {
  const map: Record<string, string> = {
    X: '#D9A400', '10': '#F2C94C', '9': '#F8E08E',
    '8': '#D83A3A', '7': '#F28B8B',
    '6': '#1F6FD6', '5': '#7FB0F2',
    '4': '#222222', '3': '#666666',
    M: '#581c87',
  };
  return map[v] ? { bg: map[v] } : { bg: '#ffffff', ring: true };
};

interface Prior { score: number; arrows: number; ts: number }

export default function SessionBilanz({ userId, ends, roundSize, distance, distanceId, targetType }: {
  userId: string;
  ends: any[];
  roundSize: number;
  distance: string;
  distanceId?: string | null;
  targetType: string;
}) {
  const { t, i18n } = useTranslation();
  const [prior, setPrior] = useState<Prior[] | null>(null);

  useEffect(() => {
    if (!userId) return;
    let alive = true;
    const key = distanceKey({ distanceId, distance });
    getRecentSessions(userId)
      .then(list => {
        if (!alive) return;
        setPrior(list
          .filter(s => s.type !== 'TECHNICAL' && !s.isPartial && (s.score || 0) > 0
            && distanceKey({ distanceId: s.distanceId, distance: s.distance }) === key && (s.targetType || 'Full') === (targetType || 'Full'))
          .map(s => ({ score: s.score, arrows: s.scoreArrows || s.sessionArrows || s.arrows || 0, ts: s.timestamp?.toMillis?.() || 0 }))
          .filter(s => s.arrows > 0)
          .sort((a, b) => a.ts - b.ts));
      })
      .catch(() => alive && setPrior([]));
    return () => { alive = false; };
  }, [userId, distance, distanceId, targetType]);

  const num = (v: number, digits: number) =>
    v.toLocaleString(i18n.language, { minimumFractionDigits: digits, maximumFractionDigits: digits });

  const all = getStats(ends);
  if (all.count === 0) return null;
  const avg = all.score / all.count;

  // --- Porównanie z historią ---
  let compare: React.ReactNode = null;
  let badge: string | null = null;
  if (prior && prior.length > 0) {
    const same = prior.filter(p => p.arrows === all.count);
    if (same.length > 0) {
      const last = same.slice(-COMPARE_LAST);
      const ref = last.reduce((s, p) => s + p.score, 0) / last.length;
      const d = Math.round(all.score - ref);
      compare = <Delta value={d} text={t('scoring.bilanz.vsAvgPts', { pts: num(Math.abs(d), 0), count: last.length })} />;
      if (same.length >= MIN_PRIOR_BEST && same.every(p => all.score > p.score)) {
        badge = t('tagebuch.bestOfLast', { count: same.length + 1 });
      }
    } else {
      const last = prior.slice(-COMPARE_LAST);
      const ref = last.reduce((s, p) => s + p.score / p.arrows, 0) / last.length;
      const d = Math.round((avg - ref) * 100) / 100;
      compare = <Delta value={d} text={t('scoring.bilanz.vsAvgAvg', { avg: num(Math.abs(d), 2), count: last.length })} />;
    }
  } else if (prior) {
    compare = <span className="text-gray-400">{t('scoring.bilanz.firstHere')}</span>;
  }

  // --- Rundy ---
  const r1 = getStats(ends.slice(0, roundSize));
  const r2 = getStats(ends.slice(roundSize));
  const roundDelta = r2.count > 0 && r1.count === r2.count ? r2.score - r1.score : null;

  // --- Równość serii (odchylenie standardowe sum serii) ---
  const sums = ends.map(e => e.total_sum || 0);
  const mean = sums.reduce((a, b) => a + b, 0) / sums.length;
  const sd = Math.sqrt(sums.reduce((a, b) => a + (b - mean) ** 2, 0) / sums.length);
  const steadyKey = sd <= 2 ? 'steadyHigh' : sd <= 4 ? 'steadyMid' : 'steadyLow';

  // --- Rozkład trafień ---
  const counts = new Map<string, number>();
  ends.forEach(e => e.arrows?.forEach((v: string) => { if (v) counts.set(v, (counts.get(v) || 0) + 1); }));
  const hits = VALUE_ORDER.filter(v => counts.get(v)).map(v => ({ v, n: counts.get(v)! }));

  return (
    <div className="tb-card tb-d3 border rounded-l-md rounded-r-2xl shadow-sm pl-2 pr-3 py-2.5 w-full">
      <div className="flex items-start gap-2.5">
        <span className="tb-icon w-8 h-8 rounded-lg flex items-center justify-center shrink-0">
          <span className="material-symbols-outlined text-[18px] text-emerald-600">insights</span>
        </span>
        <div className="flex-1 min-w-0">
          <span className="flex items-start gap-1.5">
            <span className="block min-w-0 flex-1">
              <span className="block text-[9px] font-black uppercase tracking-widest leading-tight text-emerald-700">{t('scoring.bilanz.title')}</span>
              <span className="block text-[13px] font-black leading-snug text-[#0a3a2a]">
                {all.score} {t('tagebuch.rings')} · {t('tagebuch.avgShort', { avg: num(avg, 2) })}
              </span>
            </span>
            {badge && (
              <span className="shrink-0 flex items-center gap-0.5 bg-[#fed33e] text-[#0a3a2a] text-[9px] font-black px-1.5 py-0.5 rounded-md">
                <span className="material-symbols-outlined text-[11px]">trophy</span>{badge}
              </span>
            )}
          </span>
          <span className="block text-[10px] font-bold text-gray-500 mt-0.5 min-h-[14px]">{compare}</span>

          <div className="mt-2 border-t border-gray-100">
            {/* Rundy obok siebie */}
            <Row label={t('scoring.bilanz.rounds')}>
              <span className="flex items-center gap-3 tabular-nums">
                <span><span className="text-gray-400">R1 </span><span className="font-black text-[#0a3a2a]">{r1.score}</span></span>
                {r2.count > 0 && <span><span className="text-gray-400">R2 </span><span className="font-black text-[#0a3a2a]">{r2.score}</span></span>}
                {roundDelta !== null && roundDelta !== 0 && (
                  <span className={`text-[10px] font-black ${roundDelta > 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                    {roundDelta > 0 ? '▲ +' : '▼ −'}{Math.abs(roundDelta)}
                  </span>
                )}
              </span>
            </Row>
            {sums.length >= 3 && (
              <Row label={t('scoring.bilanz.ends')}>
                <span className="tabular-nums">
                  <span className="font-black text-[#0a3a2a]">{Math.min(...sums)}–{Math.max(...sums)}</span>
                  <span className="text-gray-400"> · {t(`scoring.bilanz.${steadyKey}`)}</span>
                </span>
              </Row>
            )}
          </div>

          {/* Rozkład trafień: pasek + legenda */}
          <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mt-2 mb-1">{t('scoring.bilanz.hits')}</p>
          <div className="flex h-3 rounded-full overflow-hidden border border-gray-200">
            {hits.map(h => {
              const c = valueColor(h.v);
              return <div key={h.v} style={{ width: `${(h.n / all.count) * 100}%`, backgroundColor: c.bg }} className={c.ring ? 'border-r border-gray-200' : ''} />;
            })}
          </div>
          <div className="flex flex-wrap gap-x-2.5 gap-y-0.5 mt-1.5">
            {hits.map(h => {
              const c = valueColor(h.v);
              return (
                <span key={h.v} className="flex items-center gap-1 text-[10px] font-bold text-gray-500 tabular-nums">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: c.bg, boxShadow: c.ring ? 'inset 0 0 0 1px #d1d5db' : undefined }} />
                  <span className="font-black text-[#0a3a2a]">{h.v}</span>×{h.n}
                </span>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 py-1.5 border-b border-gray-100 text-[12px] font-bold">
      <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">{label}</span>
      {children}
    </div>
  );
}

function Delta({ value, text }: { value: number; text: string }) {
  if (value === 0) return <span className="text-gray-400">= {text}</span>;
  return <span className={value > 0 ? 'text-emerald-700' : 'text-red-600'}>{value > 0 ? '▲ +' : '▼ −'}{text}</span>;
}
