import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { useTranslation } from 'react-i18next';
import BattleCard from '../components/BattleCard';
import BattleRankingModal from '../components/BattleRankingModal';

interface BattleHistoryViewProps {
  userId: string;
  onBack: () => void;
}

export default function BattleHistoryView({ userId, onBack }: BattleHistoryViewProps) {
  const { t } = useTranslation();
  const [battles, setBattles] = useState<any[]>([]);
  const [selectedBattleId, setSelectedBattleId] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;

    const q = query(
      collection(db, 'battles'),
      where('participants', 'array-contains', userId),
      // FINISHED — gry zamknięte (wszyscy skończyli albo minął termin) zostają w historii.
      where('status', 'in', ['START', 'ACTIVE', 'FINISHED'])
    );

    const unsub = onSnapshot(q, (snap) => {
      const fetchedBattles: any[] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      fetchedBattles.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setBattles(fetchedBattles);
    });
    return () => unsub();
  }, [userId]);

  const selectedBattleData = battles.find(b => b.id === selectedBattleId);

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
          {/* Lista od najnowszej — pierwsza karta to ostatnia gra, wyróżniona. */}
          {battles.map((b, i) => (
            <BattleCard key={b.id} battle={b} userId={userId} highlight={i === 0} onClick={() => setSelectedBattleId(b.id)} />
          ))}
        </div>
      )}

      {/* Ranking bitwy — wspólne okno z oknem Multiplayer Arena (components/BattleRankingModal). */}
      {selectedBattleData && (
        <BattleRankingModal battle={selectedBattleData} userId={userId} onClose={() => setSelectedBattleId(null)} />
      )}

      <style>{`
        .animate-fade-in { animation: fadeIn 0.3s ease-out forwards; }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
      `}</style>
    </div>
  );
}
