import React from 'react';
import { useTranslation } from 'react-i18next';
import { friendlyTargetName } from '../config/targetFaces';

/**
 * Każdy strzela ze swojego dystansu (wspólna jest tarcza). Wspólny dystans
 * tylko wtedy, gdy wszyscy mieli ten sam; starsze bitwy bez `distances`
 * pokazują dystans hosta.
 */
export const battleDistanceLabel = (b: any): string | null => {
  const vals = Object.values(b?.distances || {}) as string[];
  if (vals.length === 0) return b?.distance || null;
  return new Set(vals).size === 1 ? vals[0] : null;
};

interface BattleCardProps {
  battle: any;
  userId: string;
  /** Wyróżniona karta (ostatnia gra) — gradient, ramka i znaczek „Letztes Spiel”. */
  highlight?: boolean;
  onClick: () => void;
}

/**
 * [ARENA] Karta bitwy w ciemnym stylu — ta sama w historii bitew i w oknie
 * Multiplayer Arena (user 2026-10-21: „dokładnie to, co w Battle Scores”).
 */
export default function BattleCard({ battle: b, userId, highlight, onClick }: BattleCardProps) {
  const { t, i18n } = useTranslation();
  const isClub = b.mode === 'CLUB';
  const isWorld = b.mode === 'WORLD';
  const myData = b.liveScores?.[userId];
  const myScore = typeof myData === 'object' ? (myData?.score || 0) : (myData || 0);
  const locale = i18n.language === 'pl' ? 'pl-PL' : i18n.language === 'de' ? 'de-DE' : 'en-GB';

  return (
    <div
      onClick={onClick}
      className={`p-5 rounded-[24px] flex items-center justify-between active:scale-[0.98] transition-all cursor-pointer relative overflow-hidden ${
        highlight
          ? 'bg-gradient-to-r from-indigo-600/40 to-fuchsia-600/30 border-2 border-indigo-400 shadow-lg shadow-indigo-500/20'
          : 'bg-gradient-to-r from-white/5 to-white/10 border border-white/10'
      }`}
    >
      <div className={`absolute top-0 left-0 w-2 h-full ${isClub ? 'bg-fuchsia-500' : isWorld ? 'bg-emerald-500' : 'bg-indigo-500'}`}></div>

      <div className="pl-2 min-w-0">
        {highlight && (
          <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-amber-300 mb-1.5">
            <span className="material-symbols-outlined text-[12px]">bolt</span>{t('battleHistory.latest')}
          </span>
        )}
        <div className="flex items-center gap-2 mb-1">
          <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md ${isClub ? 'bg-fuchsia-500/20 text-fuchsia-400' : isWorld ? 'bg-emerald-500/20 text-emerald-400' : 'bg-indigo-500/20 text-indigo-400'}`}>
            {isClub ? t('battleHistory.modeClub') : isWorld ? t('battleHistory.modeWorld') : t('battleHistory.modePrivate')}
          </span>
          <span className="text-[10px] font-bold text-gray-400">
            {new Date(b.createdAt).toLocaleDateString(locale)}
          </span>
        </div>

        <p className="text-base font-black leading-none mt-2 text-white">
          {[battleDistanceLabel(b), friendlyTargetName(b.targetType, t('battleHistory.unknown'))].filter(Boolean).join(' • ')}
        </p>

        <p className="text-[10px] font-bold text-gray-400 mt-1.5 flex items-center gap-1 truncate">
          <span className="material-symbols-outlined text-[11px] text-gray-500">person</span>
          {t('battleHistory.host')} {b.hostName || t('battleHistory.unknown')}
        </p>
      </div>

      <div className="text-right shrink-0 ml-2">
        <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest mb-0.5">{t('battleHistory.yourScore')}</p>
        <p className="text-2xl font-black text-white">{myScore}</p>
      </div>
    </div>
  );
}
