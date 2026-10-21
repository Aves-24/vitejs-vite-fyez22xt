import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { getPublicProfile } from '../utils/publicProfile';
import { friendlyTargetName } from '../config/targetFaces';
import { arrowsShot, compareStage, scoreSeenBy, seesFullScores } from '../utils/battleStage';
import { renderRankingImage, shareOrDownloadImage } from '../utils/rankingShareImage';
import { battleDistanceLabel } from './BattleCard';

interface BattleRankingModalProps {
  battle: any;
  userId: string;
  onClose: () => void;
}

const getCountryData = (code: string) => {
  const c = code?.toUpperCase() || '';
  if (c.includes('PL') || c.includes('POL')) return 'pl';
  if (c.includes('DE') || c.includes('GER') || c.includes('NIEMCY')) return 'de';
  if (c.includes('US') || c.includes('USA')) return 'us';
  if (c.includes('GB') || c.includes('UK')) return 'gb';
  if (c.includes('FR') || c.includes('FRA')) return 'fr';
  return 'globe';
};

/**
 * [ARENA] Okno rankingu jednej bitwy — w historii bitew i w oknie Multiplayer
 * Arena (klik w „Letztes Spiel” pokazuje ranking na miejscu, user 2026-10-21).
 * Ranking na ślepo, logo GROT-X i udostępnianie JPG jak dotąd w historii.
 */
export default function BattleRankingModal({ battle, userId, onClose }: BattleRankingModalProps) {
  const { t, i18n } = useTranslation();
  const [battleParticipants, setBattleParticipants] = useState<any[]>([]);
  const [shareState, setShareState] = useState<'idle' | 'busy' | 'saved'>('idle');

  const getFriendlyTargetName = (type: string) => friendlyTargetName(type, t('battleHistory.unknown'));

  useEffect(() => {
    let alive = true;
    const fetchParticipants = async () => {
      if (!battle?.participants) { setBattleParticipants([]); return; }
      if (battle.participantsData) {
        // Dane denormalizowane — zero dodatkowych reads
        setBattleParticipants(battle.participants.map((pId: string) => {
          const pd = battle.participantsData[pId] || {};
          return { id: pId, name: pd.name || t('battleLobby.archer'), countryCode: pd.country || 'DE' };
        }));
      } else {
        // Fallback dla starych bitew bez pola participantsData.
        // [RODO C6] profiles_public zamiast users/{uid} (brak relacji z przeciwnikiem).
        const pDetails = await Promise.all(battle.participants.map(async (pId: string) => {
          const pub = await getPublicProfile(pId);
          return { id: pId, name: pub?.displayName || t('battleLobby.archer'), countryCode: pub?.country || 'DE' };
        }));
        if (alive) setBattleParticipants(pDetails);
      }
    };
    fetchParticipants();
    return () => { alive = false; };
  }, [battle, t]);

  // [VEREIN] Kto jeszcze nie skończył gry klubowej, widzi innych tylko do
  // swojego etapu — także tutaj, inaczej podejrzałby wynik bokiem.
  const seeAll = seesFullScores(battle, userId);
  const myArrows = arrowsShot(battle, userId);
  const seenScore = (id: string) => scoreSeenBy(battle, id, userId, myArrows, seeAll);
  const rankedParticipants = [...battleParticipants].sort((a, b) => compareStage(seenScore(a.id), seenScore(b.id)));

  // [ARENA] Grafika rankingu do udostępnienia (utils/rankingShareImage.ts).
  // W grze klubowej dopiero przy pełnych wynikach — inaczej ranking na ślepo
  // wyciekłby do tych, którzy jeszcze nie strzelali.
  const shareRanking = async () => {
    if (!battle || !seeAll || shareState === 'busy') return;
    setShareState('busy');
    try {
      const b = battle;
      const modeLabel = b.mode === 'CLUB' ? t('battleHistory.modalClub') : b.mode === 'WORLD' ? t('battleHistory.modalWorld') : t('battleHistory.modalPrivate');
      const dist = battleDistanceLabel(b);
      const locale = i18n.language === 'pl' ? 'pl-PL' : i18n.language === 'de' ? 'de-DE' : 'en-GB';
      const blob = await renderRankingImage({
        title: t('battleHistory.modalRanking'),
        subtitle: dist ? `${modeLabel} • ${dist}` : modeLabel,
        club: b.mode === 'CLUB' ? b.hostClub : undefined,
        meta: [new Date(b.createdAt).toLocaleDateString(locale), getFriendlyTargetName(b.targetType)].filter(Boolean).join(' • '),
        accent: b.mode === 'CLUB' ? '#c026d3' : b.mode === 'WORLD' ? '#059669' : '#4f46e5',
        meLabel: t('battleHistory.me'),
        rows: rankedParticipants.map(p => {
          const sc = seenScore(p.id);
          return {
            name: p.name, country: p.countryCode, distance: b.distances?.[p.id],
            score: sc?.score ?? 0, x: sc?.x ?? 0, t: sc?.t ?? 0, n: sc?.n ?? 0,
            isMe: p.id === userId,
          };
        }),
      });
      const day = new Date(b.createdAt).toISOString().slice(0, 10);
      const res = await shareOrDownloadImage(blob, `GROTX_Ranking_${day}.jpg`, 'GROT-X Arena Ranking');
      setShareState(res === 'saved' ? 'saved' : 'idle');
      if (res === 'saved') setTimeout(() => setShareState('idle'), 2500);
    } catch (e) {
      console.error('Ranking share failed:', e);
      setShareState('idle');
    }
  };

  if (typeof document === 'undefined' || !battle) return null;

  return createPortal(
    <div className="fixed inset-0 bg-[#0a0f1a]/95 backdrop-blur-md z-[150000] flex items-start justify-center p-6 pt-20 ranking-fade-in-up">
      <style>{`
        .ranking-fade-in-up { animation: rankingFadeInUp 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards; opacity: 0; }
        @keyframes rankingFadeInUp { from { opacity: 0; transform: translateY(15px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
      {/* Ciemny styl Battle Arena (jak lista i lobby); akcent w kolorze trybu. */}
      <div className="bg-[#111827] rounded-[32px] w-full max-w-sm overflow-hidden shadow-2xl relative flex flex-col border border-white/10 max-h-[85vh]">
        <button onClick={onClose} className="absolute top-4 right-4 p-2 bg-white/10 text-white rounded-full active:scale-90 transition-all z-10">
          <span className="material-symbols-outlined font-bold">close</span>
        </button>

        <div className={`p-6 text-center text-white border-b border-white/10 bg-gradient-to-b ${battle.mode === 'CLUB' ? 'from-fuchsia-600/30' : battle.mode === 'WORLD' ? 'from-emerald-600/30' : 'from-indigo-600/30'} to-transparent`}>
          <span className={`material-symbols-outlined text-4xl mb-2 ${battle.mode === 'CLUB' ? 'text-fuchsia-400' : battle.mode === 'WORLD' ? 'text-emerald-400' : 'text-indigo-400'}`}>trophy</span>
          <h2 className="text-2xl font-black tracking-tighter">{t('battleHistory.modalRanking')}</h2>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">
            {battle.mode === 'CLUB' ? t('battleHistory.modalClub') : battle.mode === 'WORLD' ? t('battleHistory.modalWorld') : t('battleHistory.modalPrivate')}{battleDistanceLabel(battle) ? ` • ${battleDistanceLabel(battle)}` : ''}
          </p>
          {/* Numer kontrolny gry — do porównania między telefonami (user 2026-10-21). */}
          {battle.id && <p className="text-[9px] font-mono font-bold text-gray-500 tracking-widest mt-1">ID {battle.id}</p>}
          {!seeAll && (
            <p className="text-[9px] font-bold text-indigo-300 mt-2">
              {myArrows > 0 ? t('scoringView.blindRankingHint', { n: myArrows }) : t('battleHistory.blindNotStarted')}
            </p>
          )}
        </div>

        <div className="arena-scroll p-4 space-y-2 flex-1 overflow-y-auto">
          {rankedParticipants.map((p, idx) => {
            const pData = battle.liveScores?.[p.id];
            const seen = seenScore(p.id);
            const score = seen?.score ?? 0;
            const xCount = seen?.x ?? 0;
            const tCount = seen?.t ?? 0;
            const nCount = seen?.n ?? 0;
            const behind = !seeAll && seen && p.id !== userId && seen.arrows < myArrows;
            const iso = getCountryData(p.countryCode);
            const isMe = p.id === userId;

            return (
              <div key={p.id} className={`flex items-center justify-between p-4 rounded-2xl border transition-all ${isMe ? 'bg-indigo-600/20 border-indigo-400/60' : 'bg-white/5 border-white/10'}`}>
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center font-black text-sm ${idx === 0 && score > 0 ? 'bg-[#F2C94C] text-[#8B6508]' : idx === 1 && score > 0 ? 'bg-gray-300 text-gray-700' : idx === 2 && score > 0 ? 'bg-[#CD7F32] text-white' : 'bg-white/10 text-gray-400'}`}>
                    {idx + 1}
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="font-black text-white text-sm leading-none">{p.name}</span>
                      {isMe && <span className="text-[8px] bg-indigo-600 text-white px-1.5 py-0.5 rounded uppercase font-bold tracking-widest">{t('battleHistory.me')}</span>}
                    </div>
                    <div className="flex items-center gap-1 mt-1">
                      {/* Flaga jako emoji, jak w rankingu liczenia — obrazki z flagcdn.com
                          blokuje CSP (img-src 'self'), a każdy podgląd wysyłałby im IP gracza. */}
                      {iso !== 'globe' ? (
                        <span className="text-[11px] leading-none">{String.fromCodePoint(...iso.toUpperCase().split('').map(ch => 127397 + ch.charCodeAt(0)))}</span>
                      ) : (
                        <span className="text-[8px] leading-none">🌍</span>
                      )}
                      <span className="text-[9px] font-bold text-gray-400 uppercase leading-none">{p.countryCode}</span>
                      {battle.distances?.[p.id] && (
                        <span className="text-[9px] font-black text-indigo-300 leading-none ml-1">{battle.distances[p.id]}</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex flex-col items-end justify-center">
                  {seen ? (
                    <span className="text-2xl font-black text-white leading-none">{score}</span>
                  ) : (
                    <span className="text-2xl font-black text-gray-600 leading-none">—</span>
                  )}
                  {seen && typeof pData === 'object' && (
                    <span className="text-[8px] font-black text-gray-500 uppercase tracking-widest mt-1">
                      {behind ? t('scoringView.afterArrows', { n: seen.arrows }) : `X:${xCount} 10:${tCount} 9:${nCount}`}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="p-4 border-t border-white/10">
          {/* Logo na każdym zrzucie ekranu (user 2026-10-21). */}
          <div className="flex items-center justify-center gap-2 mb-3">
            <span className="flex items-baseline">
              <span className="text-[15px] font-black text-white tracking-tighter leading-none">GROT-X</span>
              <span className="w-1.5 h-1.5 bg-[#fed33e] rounded-full ml-0.5 relative bottom-[2.5px]"></span>
            </span>
            <span className="text-[9px] font-bold text-gray-500 tracking-wide">grot-x.web.app</span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={shareRanking}
              disabled={!seeAll || shareState === 'busy'}
              className="flex-1 py-4 bg-white/10 text-white rounded-xl font-black uppercase text-[11px] tracking-widest active:scale-95 transition-all flex items-center justify-center gap-1.5 disabled:opacity-40"
            >
              <span className="material-symbols-outlined text-[16px]">{shareState === 'saved' ? 'check' : 'share'}</span>
              {shareState === 'saved' ? t('battleHistory.shareSaved') : t('battleHistory.share')}
            </button>
            <button onClick={onClose} className="flex-1 py-4 bg-indigo-600 text-white rounded-xl font-black uppercase text-[11px] tracking-widest active:scale-95 transition-all">
              {t('battleHistory.closeBtn')}
            </button>
          </div>
          {!seeAll && (
            <p className="text-[9px] font-bold text-gray-500 text-center mt-2">{t('battleHistory.shareAfterFinish')}</p>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
