import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom'; 
import { db } from '../firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { useTranslation } from 'react-i18next';
import { getPublicProfile } from '../utils/publicProfile';
import { friendlyTargetName } from '../config/targetFaces';
import { arrowsShot, compareStage, scoreSeenBy, seesFullScores } from '../utils/battleStage';
import { renderRankingImage, shareOrDownloadImage } from '../utils/rankingShareImage';

interface BattleHistoryViewProps {
  userId: string;
  onBack: () => void;
}

export default function BattleHistoryView({ userId, onBack }: BattleHistoryViewProps) {
  const { t, i18n } = useTranslation(); 
  const [battles, setBattles] = useState<any[]>([]);
  const [selectedBattleId, setSelectedBattleId] = useState<string | null>(null);
  const [battleParticipants, setBattleParticipants] = useState<any[]>([]);
  const [shareState, setShareState] = useState<'idle' | 'busy' | 'saved'>('idle');

  const getFriendlyTargetName = (type: string) =>
    friendlyTargetName(type, t('battleHistory.unknown'));

  useEffect(() => {
    if (!userId) return;
    
    const q = query(
      collection(db, 'battles'),
      where('participants', 'array-contains', userId),
      where('status', 'in', ['START', 'ACTIVE'])
    );

    const unsub = onSnapshot(q, (snap) => {
      const fetchedBattles: any[] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      fetchedBattles.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setBattles(fetchedBattles);
    });
    return () => unsub();
  }, [userId]);

  // Każdy strzela ze swojego dystansu (wspólna jest tarcza). Starsze bitwy
  // bez `distances` pokazują dystans hosta jak dotąd.
  const battleDistanceLabel = (b: any): string | null => {
    const vals = Object.values(b.distances || {}) as string[];
    if (vals.length === 0) return b.distance || null;
    return new Set(vals).size === 1 ? vals[0] : null;
  };

  useEffect(() => {
    const fetchParticipants = async () => {
      if (!selectedBattleId) {
        setBattleParticipants([]);
        return;
      }
      const battle = battles.find(b => b.id === selectedBattleId);
      if (!battle || !battle.participants) return;

      if (battle.participantsData) {
        // Dane denormalizowane — zero dodatkowych reads
        const pDetails = battle.participants.map((pId: string) => {
          const pd = battle.participantsData[pId] || {};
          return {
            id: pId,
            name: pd.name || t('battleLobby.archer'),
            countryCode: pd.country || 'DE'
          };
        });
        setBattleParticipants(pDetails);
      } else {
        // Fallback dla starych bitew bez pola participantsData.
        // [RODO C6] profiles_public zamiast users/{uid} (brak relacji z przeciwnikiem).
        const pDetails = await Promise.all(battle.participants.map(async (pId: string) => {
          const pub = await getPublicProfile(pId);
          return {
            id: pId,
            name: pub?.displayName || t('battleLobby.archer'),
            countryCode: pub?.country || 'DE'
          };
        }));
        setBattleParticipants(pDetails);
      }
    };
    fetchParticipants();
  }, [selectedBattleId, battles, t]);

  const getCountryData = (code: string) => {
    const c = code?.toUpperCase() || '';
    if (c.includes('PL') || c.includes('POL')) return 'pl';
    if (c.includes('DE') || c.includes('GER') || c.includes('NIEMCY')) return 'de';
    if (c.includes('US') || c.includes('USA')) return 'us';
    if (c.includes('GB') || c.includes('UK')) return 'gb';
    if (c.includes('FR') || c.includes('FRA')) return 'fr';
    return 'globe'; 
  };

  const selectedBattleData = battles.find(b => b.id === selectedBattleId);
  
  // [VEREIN] Kto jeszcze nie skończył gry klubowej, widzi innych tylko do
  // swojego etapu — także tutaj, inaczej podejrzałby wynik bokiem.
  const seeAll = seesFullScores(selectedBattleData, userId);
  const myArrows = arrowsShot(selectedBattleData, userId);
  const seenScore = (id: string) => scoreSeenBy(selectedBattleData, id, userId, myArrows, seeAll);

  const rankedParticipants = [...battleParticipants].sort((a, b) => compareStage(seenScore(a.id), seenScore(b.id)));

  // [ARENA] Grafika rankingu do udostępnienia (utils/rankingShareImage.ts).
  // W grze klubowej dopiero przy pełnych wynikach — inaczej ranking na ślepo
  // wyciekłby do tych, którzy jeszcze nie strzelali.
  const shareRanking = async () => {
    if (!selectedBattleData || !seeAll || shareState === 'busy') return;
    setShareState('busy');
    try {
      const b = selectedBattleData;
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

  return (
    <div className="min-h-screen bg-[#0a0f1a] text-white p-6 pt-[calc(env(safe-area-inset-top)+1rem)] flex flex-col animate-fade-in overflow-y-auto pb-24">
      <button onClick={onBack} className="w-12 h-12 bg-white/10 rounded-full flex items-center justify-center active:scale-90 transition-all mb-6">
        <span className="material-symbols-outlined text-white">arrow_back</span>
      </button>

      <div className="mb-6">
        <h1 className="text-3xl font-black text-white tracking-tighter">
          {t('battleHistory.title')} <span className="text-indigo-500">{t('battleHistory.titleGold')}</span>
        </h1>
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">
          {t('battleHistory.subtitle')}
        </p>
      </div>

      {battles.length === 0 ? (
        <div className="text-center py-20 opacity-30">
          <span className="material-symbols-outlined text-6xl mb-4">search_off</span>
          <p className="font-black uppercase text-xs tracking-widest">{t('battleHistory.empty')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {battles.map((b, i) => {
            // Lista od najnowszej — pierwsza karta to ostatnia gra, wyróżniona.
            const isLatest = i === 0;
            const dateObj = new Date(b.createdAt);
            const isClub = b.mode === 'CLUB';
            const isWorld = b.mode === 'WORLD';
            
            const myData = b.liveScores?.[userId];
            const myScore = typeof myData === 'object' ? (myData?.score || 0) : (myData || 0);

            return (
              <div 
                key={b.id} 
                onClick={() => setSelectedBattleId(b.id)}
                className={`p-5 rounded-[24px] flex items-center justify-between active:scale-[0.98] transition-all cursor-pointer relative overflow-hidden ${
                  isLatest
                    ? 'bg-gradient-to-r from-indigo-600/40 to-fuchsia-600/30 border-2 border-indigo-400 shadow-lg shadow-indigo-500/20'
                    : 'bg-gradient-to-r from-white/5 to-white/10 border border-white/10'
                }`}
              >
                <div className={`absolute top-0 left-0 w-2 h-full ${isClub ? 'bg-fuchsia-500' : isWorld ? 'bg-emerald-500' : 'bg-indigo-500'}`}></div>

                <div className="pl-2">
                  {isLatest && (
                    <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-amber-300 mb-1.5">
                      <span className="material-symbols-outlined text-[12px]">bolt</span>{t('battleHistory.latest')}
                    </span>
                  )}
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md ${isClub ? 'bg-fuchsia-500/20 text-fuchsia-400' : isWorld ? 'bg-emerald-500/20 text-emerald-400' : 'bg-indigo-500/20 text-indigo-400'}`}>
                      {isClub ? t('battleHistory.modeClub') : isWorld ? t('battleHistory.modeWorld') : t('battleHistory.modePrivate')}
                    </span>
                    <span className="text-[10px] font-bold text-gray-400">
                      {dateObj.toLocaleDateString(i18n.language === 'pl' ? 'pl-PL' : i18n.language === 'de' ? 'de-DE' : 'en-GB')}
                    </span>
                  </div>
                  
                  <p className="text-base font-black leading-none mt-2 text-white">
                    {[battleDistanceLabel(b), getFriendlyTargetName(b.targetType)].filter(Boolean).join(' • ')}
                  </p>
                  
                  <p className="text-[10px] font-bold text-gray-400 mt-1.5 flex items-center gap-1">
                    <span className="material-symbols-outlined text-[11px] text-gray-500">person</span> 
                    {t('battleHistory.host')} {b.hostName || t('battleHistory.unknown')}
                  </p>
                </div>

                <div className="text-right">
                  <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest mb-0.5">{t('battleHistory.yourScore')}</p>
                  <p className="text-2xl font-black text-white">{myScore}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* [ZMIANA]: MODAL RANKINGU - Pozycjonowany od góry (items-start, pt-20) */}
      {selectedBattleId && selectedBattleData && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 bg-[#0a0f1a]/95 backdrop-blur-md z-[100000] flex items-start justify-center p-6 pt-20 animate-fade-in-up">
          {/* Ciemny styl Battle Arena (jak lista i lobby); akcent w kolorze trybu. */}
          <div className="bg-[#111827] rounded-[32px] w-full max-w-sm overflow-hidden shadow-2xl relative flex flex-col border border-white/10 max-h-[85vh]">
            <button onClick={() => setSelectedBattleId(null)} className="absolute top-4 right-4 p-2 bg-white/10 text-white rounded-full active:scale-90 transition-all z-10">
              <span className="material-symbols-outlined font-bold">close</span>
            </button>

            <div className={`p-6 text-center text-white border-b border-white/10 bg-gradient-to-b ${selectedBattleData.mode === 'CLUB' ? 'from-fuchsia-600/30' : selectedBattleData.mode === 'WORLD' ? 'from-emerald-600/30' : 'from-indigo-600/30'} to-transparent`}>
              <span className={`material-symbols-outlined text-4xl mb-2 ${selectedBattleData.mode === 'CLUB' ? 'text-fuchsia-400' : selectedBattleData.mode === 'WORLD' ? 'text-emerald-400' : 'text-indigo-400'}`}>trophy</span>
              <h2 className="text-2xl font-black tracking-tighter">{t('battleHistory.modalRanking')}</h2>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">
                 {selectedBattleData.mode === 'CLUB' ? t('battleHistory.modalClub') : selectedBattleData.mode === 'WORLD' ? t('battleHistory.modalWorld') : t('battleHistory.modalPrivate')}{battleDistanceLabel(selectedBattleData) ? ` • ${battleDistanceLabel(selectedBattleData)}` : ''}
              </p>
              {!seeAll && (
                <p className="text-[9px] font-bold text-indigo-300 mt-2">
                  {myArrows > 0 ? t('scoringView.blindRankingHint', { n: myArrows }) : t('battleHistory.blindNotStarted')}
                </p>
              )}
            </div>
            
            <div className="p-4 space-y-2 flex-1 overflow-y-auto">
              {rankedParticipants.map((p, idx) => {
                const pData = selectedBattleData.liveScores?.[p.id];
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
                          {selectedBattleData.distances?.[p.id] && (
                            <span className="text-[9px] font-black text-indigo-300 leading-none ml-1">{selectedBattleData.distances[p.id]}</span>
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
                <button onClick={() => setSelectedBattleId(null)} className="flex-1 py-4 bg-indigo-600 text-white rounded-xl font-black uppercase text-[11px] tracking-widest active:scale-95 transition-all">
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
      )}

      <style>{`
        .animate-fade-in-up { animation: fadeInUp 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards; opacity: 0; }
        .animate-fade-in { animation: fadeIn 0.3s ease-out forwards; }
        @keyframes fadeInUp { from { opacity: 0; transform: translateY(15px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
      `}</style>
    </div>
  );
}