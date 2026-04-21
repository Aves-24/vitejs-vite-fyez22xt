import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { db } from '../firebase';
import { collection, query, getDocs, orderBy, where, Timestamp } from 'firebase/firestore';

interface QuickStatsModalProps {
  isOpen: boolean;
  onClose: () => void;
  isPremium: boolean;
  onNavigate: (view: any, tab?: string) => void;
  userId: string; 
  initialTab?: 'ARROWS' | 'POINTS'; // Nowy opcjonalny prop
  stats: {
    daily: number;
    monthly: number;
    yearly: number;
    avg14: string;
  };
}

// Cache ważny do końca bieżącego dnia (północ)
const CACHE_KEY = (uid: string) => `grotX_quickStats_${uid}`;

function quickStatsCacheGet(uid: string): { arrows: number[]; points: number[] } | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY(uid));
    if (!raw) return null;
    const { data, expiresAt } = JSON.parse(raw);
    if (Date.now() > expiresAt) { localStorage.removeItem(CACHE_KEY(uid)); return null; }
    return data;
  } catch { return null; }
}

function quickStatsCacheSet(uid: string, arrows: number[], points: number[]): void {
  try {
    const midnight = new Date();
    midnight.setHours(24, 0, 0, 0);
    localStorage.setItem(CACHE_KEY(uid), JSON.stringify({ data: { arrows, points }, expiresAt: midnight.getTime() }));
  } catch { /* ignore */ }
}

export default function QuickStatsModal({ isOpen, onClose, isPremium, onNavigate, userId, initialTab = 'ARROWS', stats }: QuickStatsModalProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<'ARROWS' | 'POINTS'>(initialTab);
  const [weeklyArrows, setWeeklyArrows] = useState<number[]>(Array(12).fill(0));
  const [weeklyPoints, setWeeklyPoints] = useState<number[]>(Array(12).fill(0));
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  // Zmiana: Aktualizuj zakładkę, gdy modal się otwiera z nowym initialTab
  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab]);

  useEffect(() => {
    if (!isOpen || !isPremium || !userId) return;

    // Sprawdź cache — odśwież tylko jeśli brak lub nowy dzień
    const cached = quickStatsCacheGet(userId);
    if (cached) {
      setWeeklyArrows(cached.arrows);
      setWeeklyPoints(cached.points);
      return;
    }

    const fetchHistory = async () => {
      setIsLoadingHistory(true);
      try {
        // Pobieramy tylko ostatnie 12 tygodni — chart pokazuje max 12 tygodni wstecz
        const twelveWeeksAgo = new Date(Date.now() - 84 * 24 * 60 * 60 * 1000);
        const tsFilter = Timestamp.fromDate(twelveWeeksAgo);

        const [sessSnap, techSnap] = await Promise.all([
          getDocs(query(collection(db, `users/${userId}/sessions`), where('timestamp', '>=', tsFilter), orderBy('timestamp', 'desc'))),
          getDocs(query(collection(db, `users/${userId}/techShots`), where('timestamp', '>=', tsFilter), orderBy('timestamp', 'desc')))
        ]);

        const now = new Date();
        const arrowsByWeek = Array(12).fill(0);
        const scoresByWeek = Array(12).fill(0);
        const countByWeek = Array(12).fill(0);

        sessSnap.forEach(doc => {
          const data = doc.data();
          const ts = typeof data.timestamp === 'number' ? data.timestamp : data.timestamp?.toMillis ? data.timestamp.toMillis() : Date.now();
          const diffTime = Math.max(0, now.getTime() - ts);
          const diffWeeks = Math.floor(diffTime / (1000 * 60 * 60 * 24 * 7));

          if (diffWeeks < 12) {
            const idx = 11 - diffWeeks;
            const arr = data.arrows || data.totalArrows || 0;
            arrowsByWeek[idx] += arr;
            if (data.arrows > 0) {
              scoresByWeek[idx] += (data.score || 0);
              countByWeek[idx] += (data.arrows || 0);
            }
          }
        });

        techSnap.forEach(doc => {
          const data = doc.data();
          const ts = typeof data.timestamp === 'number' ? data.timestamp : data.timestamp?.toMillis ? data.timestamp.toMillis() : Date.now();
          const diffTime = Math.max(0, now.getTime() - ts);
          const diffWeeks = Math.floor(diffTime / (1000 * 60 * 60 * 24 * 7));

          if (diffWeeks < 12) {
            const idx = 11 - diffWeeks;
            arrowsByWeek[idx] += (data.count || 0);
          }
        });

        const avgPointsByWeek = scoresByWeek.map((score, idx) =>
          countByWeek[idx] > 0 ? score / countByWeek[idx] : 0
        );

        setWeeklyArrows(arrowsByWeek);
        setWeeklyPoints(avgPointsByWeek);
        quickStatsCacheSet(userId, arrowsByWeek, avgPointsByWeek);
      } catch (error) {
        console.error("Błąd pobierania historii dla QuickStats:", error);
      } finally {
        setIsLoadingHistory(false);
      }
    };

    fetchHistory();
  }, [isOpen, isPremium, userId]);

  if (!isOpen) return null;

  const handleGoToPro = () => {
    onClose();
    onNavigate('SETTINGS', 'PRO');
  };

  const getScaleColor = (value: number, max: number) => {
    const ratio = value / max;
    if (ratio <= 0.1) return '#dc2626';
    if (ratio <= 0.3) return '#f97316';
    if (ratio <= 0.5) return '#facc15';
    if (ratio <= 0.7) return '#84cc16';
    if (ratio <= 0.9) return '#22c55e';
    return '#065f46';
  };

  const maxArrows = Math.max(...weeklyArrows, 1);
  const maxPoints = Math.max(...weeklyPoints, 10);

  const ProPaywall = () => (
    <div className="absolute inset-0 flex flex-col items-center justify-center z-30 bg-[#fcfdfe]/10 backdrop-blur-[2px]">
      <button
        onClick={handleGoToPro}
        className="bg-[#0a3a2a] text-[#fed33e] px-8 py-3 rounded-full font-black uppercase text-[10px] tracking-widest shadow-2xl active:scale-95 transition-all flex items-center gap-2 border border-emerald-900/50"
      >
        <span className="material-symbols-outlined text-[14px]">diamond</span>
        <span>{t('home.quickStats.buyPro', { defaultValue: 'ODBLOKUJ GROT-X PRO' })}</span>
      </button>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[2000] flex items-start justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-[#0a3a2a]/70 backdrop-blur-md" onClick={onClose}></div>

      <div className="bg-[#fcfdfe] w-full max-w-md rounded-t-[40px] relative z-10 shadow-2xl animate-slide-up mt-12 max-h-[85vh] overflow-hidden flex flex-col border-x border-t border-white/20">
        
        <div className="p-6 pb-2 flex justify-between items-center">
          <h2 className="text-xl font-black text-[#0a3a2a] tracking-tighter uppercase">{t('home.quickStats.title', { defaultValue: 'QUICK STATS' })}</h2>
          <button onClick={onClose} className="w-9 h-9 bg-gray-100 rounded-full flex items-center justify-center text-gray-400 active:scale-90 transition-all">
            <span className="material-symbols-outlined font-bold">close</span>
          </button>
        </div>

        <div className="flex px-4 gap-1 border-b border-gray-100 bg-white">
          <button 
            onClick={() => setActiveTab('ARROWS')}
            className={`flex-1 pt-4 pb-3 text-[10px] font-black uppercase tracking-widest transition-all relative ${
              activeTab === 'ARROWS' ? 'text-[#0a3a2a]' : 'text-gray-300'
            }`}
          >
            {t('home.quickStats.tabArrows', { defaultValue: 'PFEILE' })}
            {activeTab === 'ARROWS' && <div className="absolute bottom-0 left-0 w-full h-1 bg-[#fed33e] rounded-t-full"></div>}
          </button>
          <button 
            onClick={() => setActiveTab('POINTS')}
            className={`flex-1 pt-4 pb-3 text-[10px] font-black uppercase tracking-widest transition-all relative ${
              activeTab === 'POINTS' ? 'text-[#0a3a2a]' : 'text-gray-300'
            }`}
          >
            {t('home.quickStats.tabPoints', { defaultValue: 'PUNKTE & PRÄZISION' })}
            {activeTab === 'POINTS' && <div className="absolute bottom-0 left-0 w-full h-1 bg-[#fed33e] rounded-t-full"></div>}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
          
          {activeTab === 'ARROWS' && (
            <div className="space-y-6 animate-fade-in">
              <div className="bg-[#0a3a2a] p-5 rounded-[32px] text-white flex justify-between items-center shadow-lg relative overflow-hidden">
                <div className="absolute top-[-10%] right-[-5%] opacity-10"><span className="material-symbols-outlined text-7xl">target</span></div>
                <div className="text-center flex-1 relative z-10">
                  <span className="text-[8px] font-black text-emerald-400 uppercase tracking-widest block mb-1">{t('home.day')}</span>
                  <p className="text-2xl font-black">{stats.daily}</p>
                </div>
                <div className="w-[1px] h-8 bg-white/10"></div>
                <div className="text-center flex-1 relative z-10">
                  <span className="text-[8px] font-black text-emerald-400 uppercase tracking-widest block mb-1">{t('home.month')}</span>
                  <p className="text-2xl font-black">{stats.monthly}</p>
                </div>
                <div className="w-[1px] h-8 bg-white/10"></div>
                <div className="text-center flex-1 relative z-10">
                  <span className="text-[8px] font-black text-[#fed33e] uppercase tracking-widest block mb-1">{t('home.yearly')}</span>
                  <p className="text-2xl font-black">{stats.yearly}</p>
                </div>
              </div>

              <div className="relative">
                <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-4 ml-1">TREND (12 WO.)</h3>
                <div className={`relative transition-all duration-500 ${!isPremium ? 'blur-lg opacity-30 pointer-events-none' : ''}`}>
                  <div className="overflow-x-auto hide-scrollbar bg-gray-50 rounded-[28px] p-5 border border-gray-100">
                    <div className="flex items-end justify-between gap-1 w-full h-32 relative">
                      {isLoadingHistory ? (
                        <div className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-gray-400 uppercase">Ładowanie...</div>
                      ) : (
                        weeklyArrows.map((val, i) => {
                          const isMax = val > 0 && val === maxArrows;
                          return (
                            <div key={i} className="flex flex-col items-center justify-end gap-1 relative flex-1 h-full">
                              <div className="w-full relative flex items-end justify-center h-full">
                                {/* [ZMIANA] Wyświetlamy wartość dla KAŻDEGO słupka > 0 */}
                                {val > 0 && (
                                  <span className={`absolute -top-5 text-[8px] font-black transition-colors ${isMax ? 'text-[#0a3a2a]' : 'text-gray-400'}`}>
                                    {val}
                                  </span>
                                )}
                                <div className="w-full rounded-t-sm max-w-[16px] mx-auto transition-all duration-1000" style={{ height: val > 0 ? `${(val / maxArrows) * 100}%` : '4px', backgroundColor: val > 0 ? getScaleColor(val, maxArrows) : '#e5e7eb' }}></div>
                              </div>
                              <span className="text-[6px] text-gray-300 font-bold mt-1 shrink-0">T{12 - i}</span>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>
                {!isPremium && <ProPaywall />}
              </div>
            </div>
          )}

          {activeTab === 'POINTS' && (
            <div className="space-y-6 animate-fade-in">
              <div className="bg-white border-2 border-emerald-50 p-6 rounded-[32px] flex flex-col items-center justify-center shadow-sm">
                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">{t('home.avg14d')}</span>
                <p className="text-5xl font-black text-emerald-600 leading-none">{stats.avg14}</p>
                <span className="text-[9px] font-bold text-emerald-400 mt-2 uppercase tracking-tighter">{t('home.quickStats.avgPoints', { defaultValue: 'SCHNITT 14 TAGE' })}</span>
              </div>

              <div className="relative">
                <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-4 ml-1">TREND (12 WO.)</h3>
                <div className={`relative transition-all duration-500 ${!isPremium ? 'blur-lg opacity-30 pointer-events-none' : ''}`}>
                  <div className="overflow-x-auto hide-scrollbar bg-gray-50 rounded-[28px] p-5 border border-gray-100">
                    <div className="flex items-end justify-between gap-1 w-full h-32 relative">
                      {isLoadingHistory ? (
                        <div className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-gray-400 uppercase">Ładowanie...</div>
                      ) : (
                        weeklyPoints.map((val, i) => {
                          const isMax = val > 0 && val === maxPoints;
                          return (
                            <div key={i} className="flex flex-col items-center justify-end gap-1 relative flex-1 h-full">
                              <div className="w-full relative flex items-end justify-center h-full">
                                {/* [ZMIANA] Wyświetlamy wartość dla KAŻDEGO słupka > 0 */}
                                {val > 0 && (
                                  <span className={`absolute -top-5 text-[8px] font-black transition-colors ${isMax ? 'text-[#0a3a2a]' : 'text-gray-400'}`}>
                                    {val.toFixed(1)}
                                  </span>
                                )}
                                <div className="w-full rounded-t-sm max-w-[16px] mx-auto transition-all duration-1000" style={{ height: val > 0 ? `${(val / maxPoints) * 100}%` : '4px', backgroundColor: val > 0 ? getScaleColor(val, maxPoints) : '#e5e7eb' }}></div>
                              </div>
                              <span className="text-[6px] text-gray-300 font-bold mt-1 shrink-0">T{12 - i}</span>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>
                {!isPremium && <ProPaywall />}
              </div>
            </div>
          )}

        </div>
        
        <div className="p-4 bg-gray-50 border-t border-gray-100 text-center shrink-0">
           <p className="text-[8px] font-bold text-gray-400 uppercase tracking-[0.2em]">Grot-X</p>
        </div>
      </div>

      <style>{`
        .hide-scrollbar::-webkit-scrollbar { display: none; }
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #f3f4f6; border-radius: 10px; }
        .animate-slide-up { animation: slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        .animate-fade-in { animation: fadeIn 0.3s ease-out forwards; }
        @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
}