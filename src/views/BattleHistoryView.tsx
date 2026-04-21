import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom'; 
import { db } from '../firebase';
import { collection, query, where, onSnapshot, doc, getDoc } from 'firebase/firestore';
import { useTranslation } from 'react-i18next'; 

interface BattleHistoryViewProps {
  userId: string;
  onBack: () => void;
}

export default function BattleHistoryView({ userId, onBack }: BattleHistoryViewProps) {
  const { t, i18n } = useTranslation(); 
  const [battles, setBattles] = useState<any[]>([]);
  const [selectedBattleId, setSelectedBattleId] = useState<string | null>(null);
  const [battleParticipants, setBattleParticipants] = useState<any[]>([]);

  const getFriendlyTargetName = (type: string) => {
    if (type === 'Full') return '122cm';
    if (type === 'WA 80cm') return '80cm';
    if (type === '40cm') return '40cm'; 
    if (type === '3-Spot') return '3-Spot';
    if (type === 'Vertical 3-Spot') return 'Vertical 3-Spot';
    if (type === 'WA 80cm (6-Ring)') return '80cm (6-Ring)';
    return type || t('battleHistory.unknown'); 
  };

  useEffect(() => {
    if (!userId) return;
    
    const q = query(
      collection(db, 'battles'),
      where('participants', 'array-contains', userId),
      where('status', 'in', ['START', 'ACTIVE'])
    );

    const unsub = onSnapshot(q, (snap) => {
      const fetchedBattles = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      fetchedBattles.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setBattles(fetchedBattles);
    });
    return () => unsub();
  }, [userId]);

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
        // Fallback dla starych bitew bez pola participantsData
        const pDetails = await Promise.all(battle.participants.map(async (pId: string) => {
          const uSnap = await getDoc(doc(db, 'users', pId));
          const ud = uSnap.exists() ? uSnap.data() : {};
          return {
            id: pId,
            name: ud.firstName || t('battleLobby.archer'),
            countryCode: ud.countryCode || 'DE'
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
  
  const rankedParticipants = [...battleParticipants].sort((a, b) => {
    const dataA = selectedBattleData?.liveScores?.[a.id];
    const dataB = selectedBattleData?.liveScores?.[b.id];
    
    const scoreA = typeof dataA === 'object' ? (dataA?.score || 0) : (dataA || 0);
    const scoreB = typeof dataB === 'object' ? (dataB?.score || 0) : (dataB || 0);
    
    if (scoreB === scoreA) {
      const xA = typeof dataA === 'object' ? (dataA?.x || 0) : 0;
      const xB = typeof dataB === 'object' ? (dataB?.x || 0) : 0;
      if (xB !== xA) return xB - xA;
      
      const tA = typeof dataA === 'object' ? (dataA?.t || 0) : 0;
      const tB = typeof dataB === 'object' ? (dataB?.t || 0) : 0;
      if (tB !== tA) return tB - tA;
      
      const nA = typeof dataA === 'object' ? (dataA?.n || 0) : 0;
      const nB = typeof dataB === 'object' ? (dataB?.n || 0) : 0;
      return nB - nA;
    }
    return scoreB - scoreA;
  });

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
          {battles.map(b => {
            const dateObj = new Date(b.createdAt);
            const isClub = b.mode === 'CLUB';
            const isWorld = b.mode === 'WORLD';
            
            const myData = b.liveScores?.[userId];
            const myScore = typeof myData === 'object' ? (myData?.score || 0) : (myData || 0);

            return (
              <div 
                key={b.id} 
                onClick={() => setSelectedBattleId(b.id)}
                className="bg-gradient-to-r from-white/5 to-white/10 border border-white/10 p-5 rounded-[24px] flex items-center justify-between active:scale-[0.98] transition-all cursor-pointer relative overflow-hidden"
              >
                <div className={`absolute top-0 left-0 w-2 h-full ${isClub ? 'bg-fuchsia-500' : isWorld ? 'bg-emerald-500' : 'bg-indigo-500'}`}></div>

                <div className="pl-2">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md ${isClub ? 'bg-fuchsia-500/20 text-fuchsia-400' : isWorld ? 'bg-emerald-500/20 text-emerald-400' : 'bg-indigo-500/20 text-indigo-400'}`}>
                      {isClub ? t('battleHistory.modeClub') : isWorld ? t('battleHistory.modeWorld') : t('battleHistory.modePrivate')}
                    </span>
                    <span className="text-[10px] font-bold text-gray-400">
                      {dateObj.toLocaleDateString(i18n.language === 'pl' ? 'pl-PL' : i18n.language === 'de' ? 'de-DE' : 'en-GB')}
                    </span>
                  </div>
                  
                  <p className="text-base font-black leading-none mt-2 text-white">
                    {b.distance} • {getFriendlyTargetName(b.targetType)}
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
          <div className="bg-white rounded-[32px] w-full max-w-sm overflow-hidden shadow-2xl relative flex flex-col border border-indigo-100 max-h-[85vh]">
            <button onClick={() => setSelectedBattleId(null)} className="absolute top-4 right-4 p-2 bg-indigo-50 text-indigo-600 rounded-full active:scale-90 transition-all z-10">
              <span className="material-symbols-outlined font-bold">close</span>
            </button>
            
            <div className="bg-indigo-600 p-6 text-center text-white">
              <span className="material-symbols-outlined text-4xl mb-2 text-indigo-300">trophy</span>
              <h2 className="text-2xl font-black tracking-tighter">{t('battleHistory.modalRanking')}</h2>
              <p className="text-[10px] font-bold text-indigo-200 uppercase tracking-widest mt-1">
                 {selectedBattleData.mode === 'CLUB' ? t('battleHistory.modalClub') : selectedBattleData.mode === 'WORLD' ? t('battleHistory.modalWorld') : t('battleHistory.modalPrivate')} • {selectedBattleData.distance}
              </p>
            </div>
            
            <div className="p-4 space-y-2 flex-1 overflow-y-auto">
              {rankedParticipants.map((p, idx) => {
                const pData = selectedBattleData.liveScores?.[p.id];
                const score = typeof pData === 'object' ? (pData?.score || 0) : (pData || 0);
                const xCount = typeof pData === 'object' ? (pData?.x || 0) : 0;
                const tCount = typeof pData === 'object' ? (pData?.t || 0) : 0;
                const nCount = typeof pData === 'object' ? (pData?.n || 0) : 0;

                const iso = getCountryData(p.countryCode);
                const isMe = p.id === userId;

                return (
                  <div key={p.id} className={`flex items-center justify-between p-4 rounded-2xl border transition-all ${isMe ? 'bg-indigo-50 border-indigo-200 shadow-sm' : 'bg-gray-50 border-gray-100'}`}>
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center font-black text-sm ${idx === 0 && score > 0 ? 'bg-[#F2C94C] text-[#8B6508]' : idx === 1 && score > 0 ? 'bg-gray-300 text-gray-700' : idx === 2 && score > 0 ? 'bg-[#CD7F32] text-white' : 'bg-white text-gray-400 border'}`}>
                        {idx + 1}
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-black text-[#0a3a2a] text-sm leading-none">{p.name}</span>
                          {isMe && <span className="text-[8px] bg-indigo-600 text-white px-1.5 py-0.5 rounded uppercase font-bold tracking-widest">{t('battleHistory.me')}</span>}
                        </div>
                        <div className="flex items-center gap-1 mt-1">
                          {iso !== 'globe' ? (
                            <img src={`https://flagcdn.com/w20/${iso}.png`} alt="flag" className="w-3.5 h-2.5 object-cover rounded-[2px]" />
                          ) : (
                            <span className="text-[8px] leading-none">🌍</span>
                          )}
                          <span className="text-[9px] font-bold text-gray-400 uppercase leading-none">{p.countryCode}</span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex flex-col items-end justify-center">
                      <span className="text-2xl font-black text-indigo-600 leading-none">{score}</span>
                      {typeof pData === 'object' && (
                        <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest mt-1">
                          X:{xCount} 10:{tCount} 9:{nCount}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            
            <div className="p-4 border-t border-gray-100 bg-gray-50">
              <button onClick={() => setSelectedBattleId(null)} className="w-full py-4 bg-[#0a3a2a] text-white rounded-xl font-black uppercase text-[11px] tracking-widest active:scale-95 transition-all">
                {t('battleHistory.closeBtn')}
              </button>
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