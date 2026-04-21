// src/views/WorldLeaderboardView.tsx
// Ranking WORLD per kategoria rangowa

import React, { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchWorldLeaderboard, WorldStats } from '../utils/worldMatchmakingService';
import { TARGET_RANKS } from '../utils/rankEngine';

interface Props {
  userLevel: number;
  onBack: () => void;
}

const CACHE_TTL = 10 * 60 * 1000; // 10 min

const getCacheKey = (level: number) => `grotX_worldLeaderboard_${level}`;

const loadFromCache = (level: number): WorldStats[] | null => {
  try {
    const raw = localStorage.getItem(getCacheKey(level));
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    if (Date.now() - ts > CACHE_TTL) return null;
    return data;
  } catch { return null; }
};

const saveToCache = (level: number, data: WorldStats[]) => {
  try {
    localStorage.setItem(getCacheKey(level), JSON.stringify({ data, ts: Date.now() }));
  } catch (_e) { /* localStorage not available */ }
};

export default function WorldLeaderboardView({ userLevel, onBack }: Props) {
  const { t } = useTranslation();
  const [selectedLevel, setSelectedLevel] = useState(userLevel);
  const [rows, setRows]                   = useState<WorldStats[]>([]);
  const [loading, setLoading]             = useState(true);

  const rank = TARGET_RANKS.find(r => r.level === selectedLevel) ?? TARGET_RANKS[0];

  const load = useCallback(async (level: number) => {
    setLoading(true);
    const cached = loadFromCache(level);
    if (cached) {
      setRows(cached);
      setLoading(false);
      return;
    }
    const data = await fetchWorldLeaderboard(level);
    saveToCache(level, data);
    setRows(data);
    setLoading(false);
  }, []);

  useEffect(() => { load(selectedLevel); }, [selectedLevel, load]);

  const medalColor = (i: number) => {
    if (i === 0) return '#FFCC00';
    if (i === 1) return '#C0C0C0';
    if (i === 2) return '#CD7F32';
    return null;
  };

  return (
    <div className="min-h-screen bg-[#f8f9fa] flex flex-col max-w-md mx-auto">

      {/* Header */}
      <div
        className="flex items-center gap-3 px-4 pt-[calc(env(safe-area-inset-top)+12px)] pb-4 shadow-sm"
        style={{ background: rank.color }}
      >
        <button
          onClick={onBack}
          className="w-9 h-9 rounded-full flex items-center justify-center bg-black/10 active:scale-90 transition-all"
        >
          <span className="material-symbols-outlined text-xl" style={{ color: rank.textColor }}>
            arrow_back
          </span>
        </button>
        <div className="flex-1">
          <p className="text-xs font-bold uppercase tracking-widest opacity-60" style={{ color: rank.textColor }}>
            {t('worldLeaderboard.title')}
          </p>
          <p className="text-xl font-black" style={{ color: rank.textColor }}>
            {rank.name}
          </p>
        </div>
        <span className="material-symbols-outlined text-3xl opacity-40" style={{ color: rank.textColor }}>
          public
        </span>
      </div>

      {/* Zakładki rang */}
      <div className="flex overflow-x-auto gap-2 px-4 py-3 bg-white border-b border-gray-100 scrollbar-none">
        {TARGET_RANKS.map(r => (
          <button
            key={r.level}
            onClick={() => setSelectedLevel(r.level)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-black border-2 transition-all active:scale-95 ${
              selectedLevel === r.level ? 'shadow-md scale-105' : 'opacity-60'
            }`}
            style={{
              background:   selectedLevel === r.level ? r.color   : '#f1f5f9',
              borderColor:  selectedLevel === r.level ? r.border  : 'transparent',
              color:        selectedLevel === r.level ? r.textColor : '#64748b',
            }}
          >
            {r.name}
          </button>
        ))}
      </div>

      {/* Lista */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <div className="w-10 h-10 rounded-full border-4 border-gray-200 border-t-[#0a3a2a] animate-spin" />
            <p className="text-sm text-gray-400">{t('worldLeaderboard.loading')}</p>
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
            <span className="material-symbols-outlined text-5xl text-gray-300">emoji_events</span>
            <p className="text-gray-400 font-semibold">{t('worldLeaderboard.empty')}</p>
            <p className="text-gray-300 text-sm">{t('worldLeaderboard.emptyDesc')}</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {rows.map((row, i) => {
              const medal = medalColor(i);
              return (
                <div
                  key={row.userId}
                  className="bg-white rounded-2xl px-4 py-3 shadow-sm flex items-center gap-3"
                >
                  {/* Pozycja */}
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-black shrink-0"
                    style={medal
                      ? { background: medal, color: i === 1 ? '#555' : '#fff' }
                      : { background: '#f1f5f9', color: '#94a3b8' }
                    }
                  >
                    {i + 1}
                  </div>

                  {/* Dane gracza */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-black text-gray-800 truncate">
                      {row.displayName}
                    </p>
                    <p className="text-xs text-gray-400 truncate">
                      {[row.clubName, row.country].filter(Boolean).join(' · ')}
                    </p>
                  </div>

                  {/* Statystyki */}
                  <div className="flex flex-col items-end shrink-0">
                    <div className="flex items-center gap-1">
                      <span className="material-symbols-outlined text-[14px] text-emerald-500">
                        military_tech
                      </span>
                      <span className="text-sm font-black text-gray-800">
                        {row.worldWins}
                      </span>
                      <span className="text-xs text-gray-400">{t('worldLeaderboard.wins')}</span>
                      <span className="text-xs text-gray-300 mx-0.5">/</span>
                      <span className="text-sm font-bold text-gray-500">
                        {row.worldLosses}
                      </span>
                      <span className="text-xs text-gray-400">{t('worldLeaderboard.losses')}</span>
                    </div>
                    <div className="flex items-center gap-1 mt-0.5">
                      <span className="material-symbols-outlined text-[12px] text-[#F2C94C]">
                        bolt
                      </span>
                      <span className="text-xs font-bold text-[#8B6508]">
                        {row.worldXP} XP
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Legenda */}
      <div className="px-4 py-3 bg-white border-t border-gray-100">
        <p className="text-xs text-gray-400 text-center">
          {t('worldLeaderboard.footer')}
        </p>
      </div>
    </div>
  );
}
