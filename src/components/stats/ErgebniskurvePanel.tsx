import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';

// Krzywa wyników (Ergebniskurve) + lista ostatnich sesji z filtrami typ/dystans.
// Prezentacyjny — dane (lista sesji) podaje rodzic. Używany w przeglądzie ProStats.
export interface CurveSession {
  score: number;
  date?: string;
  distance?: string;
  type?: string;
  ts?: number;
  title?: string;
}

export default function ErgebniskurvePanel({ sessions, onSelectDate }: { sessions: CurveSession[]; onSelectDate?: (iso: string) => void }) {
  const { t } = useTranslation();
  const [filterType, setFilterType] = useState('');
  const [filterDist, setFilterDist] = useState('');

  const W = 300, H = 100, pad = 12;

  const availTypes = Array.from(new Set(sessions.map(s => s.type || 'Trening')));
  const availDists = Array.from(new Set(sessions.map(s => s.distance).filter(Boolean))).sort() as string[];

  const filtered = sessions.filter(s => {
    const typeOk = !filterType || (s.type || 'Trening') === filterType;
    const distOk = !filterDist || s.distance === filterDist;
    return typeOk && distOk;
  });

  const scores = filtered.map(s => s.score);
  const minS = scores.length ? Math.min(...scores) : 0;
  const maxS = scores.length ? Math.max(...scores) : 0;
  const range = maxS - minS || 1;
  const pts = scores.map((s, i) => ({
    x: pad + (i / Math.max(scores.length - 1, 1)) * (W - pad * 2),
    y: H - pad - ((s - minS) / range) * (H - pad * 2),
    s,
  }));
  const polyline = pts.map(p => `${p.x},${p.y}`).join(' ');
  const maxIdx = scores.indexOf(maxS);
  const minIdx = scores.lastIndexOf(minS);

  return (
    <div className="bg-white rounded-[32px] border border-gray-100 shadow-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <span className="text-[9px] font-black text-emerald-600 uppercase tracking-widest block leading-none mb-0.5">{t('home.trendModal.subtitle')}</span>
          <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{t('home.trendModal.title')}</h3>
        </div>
        <span className="material-symbols-outlined text-emerald-100 text-3xl">show_chart</span>
      </div>

      {availTypes.length > 1 && (
        <div className="flex gap-1.5 flex-wrap mb-2">
          <button onClick={() => setFilterType('')}
            className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border transition-all ${!filterType ? 'bg-[#0a3a2a] text-white border-[#0a3a2a]' : 'bg-white text-gray-400 border-gray-200'}`}>
            Alle
          </button>
          {availTypes.map(type => {
            const lbl = type === 'Turniej' ? t('home.trendModal.typeTournament') : type === 'Arena' ? t('home.trendModal.typeArena') : type === 'WORLD_BATTLE' ? 'World' : t('home.trendModal.typeTraining');
            const active = filterType === type;
            const col = active
              ? type === 'Turniej' ? 'bg-[#0a3a2a] text-white border-[#0a3a2a]'
              : type === 'Arena' ? 'bg-blue-500 text-white border-blue-500'
              : 'bg-[#fed33e] text-[#5d4a00] border-[#e5bd38]'
              : 'bg-white text-gray-400 border-gray-200';
            return (
              <button key={type} onClick={() => setFilterType(active ? '' : type)}
                className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border transition-all ${col}`}>
                {lbl}
              </button>
            );
          })}
        </div>
      )}

      {availDists.length > 1 && (
        <div className="flex gap-1.5 flex-wrap mb-3">
          <button onClick={() => setFilterDist('')}
            className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border transition-all ${!filterDist ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-gray-400 border-gray-200'}`}>
            Alle
          </button>
          {availDists.map(dist => (
            <button key={dist} onClick={() => setFilterDist(filterDist === dist ? '' : dist)}
              className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border transition-all ${filterDist === dist ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-gray-400 border-gray-200'}`}>
              {dist}
            </button>
          ))}
        </div>
      )}

      {scores.length >= 1 ? (
        <div className="bg-[#0a3a2a] rounded-2xl p-4 mb-4">
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ overflow: 'visible' }}>
            <defs>
              <linearGradient id="ergebnisGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#fed33e" stopOpacity="0.2" />
                <stop offset="100%" stopColor="#fed33e" stopOpacity="0" />
              </linearGradient>
            </defs>
            {scores.length >= 2 && (
              <>
                <polygon points={`${pts[0].x},${H} ${polyline} ${pts[pts.length - 1].x},${H}`} fill="url(#ergebnisGrad)" />
                <polyline points={polyline} fill="none" stroke="#fed33e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              </>
            )}
            {pts.map((p, i) => {
              const isMax = i === maxIdx;
              const isMin = i === minIdx;
              const isLast = i === pts.length - 1;
              const color = isMax ? '#22c55e' : isMin ? '#ef4444' : isLast ? '#fed33e' : 'rgba(255,255,255,0.4)';
              const r = (isMax || isMin || isLast) ? 5 : 3;
              return (
                <g key={i}>
                  <circle cx={p.x} cy={p.y} r={r} fill={color} />
                  {(isMax || isMin || isLast) && (
                    <text x={p.x} y={p.y - 9} fontSize="8" fontWeight="bold" textAnchor="middle" fill={color}>{p.s}</text>
                  )}
                </g>
              );
            })}
          </svg>
        </div>
      ) : (
        <div className="bg-[#0a3a2a] rounded-2xl p-6 mb-4 flex items-center justify-center opacity-50">
          <span className="text-white text-[10px] font-black uppercase tracking-widest">{t('home.trendModal.noData')}</span>
        </div>
      )}

      <div className="space-y-1.5">
        {[...filtered].reverse().slice(0, 15).map((sess, i) => {
          const isTurniej = sess.type === 'Turniej';
          const isArena = sess.type === 'Arena';
          const dot = isTurniej ? 'bg-[#0a3a2a]' : isArena ? 'bg-blue-500' : 'bg-[#fed33e]';
          const label = isTurniej
            ? (sess.title || t('home.trendModal.typeTournament'))
            : isArena ? t('home.trendModal.typeArena') : t('home.trendModal.typeTraining');
          const dateStr = sess.ts
            ? (() => { const d = new Date(sess.ts); return `${d.getDate().toString().padStart(2, '0')}.${(d.getMonth() + 1).toString().padStart(2, '0')}`; })()
            : '';
          const isoDate = sess.date || (sess.ts ? new Date(sess.ts).toISOString().split('T')[0] : '');
          const handleClick = (onSelectDate && isoDate) ? () => onSelectDate(isoDate) : undefined;
          return (
            <div
              key={i}
              className={`flex items-center justify-between bg-gray-50 rounded-xl px-3 py-2 border border-gray-100 transition-all ${handleClick ? 'cursor-pointer active:scale-[0.98] active:bg-gray-100' : ''}`}
              onClick={handleClick}
            >
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <span className={`w-2 h-2 rounded-full shrink-0 ${dot}`} />
                <span className="text-[9px] font-black text-gray-500 truncate">{label}</span>
                <span className="text-[9px] font-bold text-gray-300 shrink-0">{sess.distance}</span>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                {dateStr && <span className="text-[9px] font-bold text-gray-300">{dateStr}</span>}
                <span className="text-sm font-black text-[#0a3a2a]">{sess.score}</span>
                {handleClick && <span className="material-symbols-outlined text-gray-300" style={{ fontSize: 14 }}>chevron_right</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
