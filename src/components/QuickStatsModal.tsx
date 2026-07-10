import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { getScaleColor } from '../lib/statsChart';
import RingePraezisionPanel from './stats/RingePraezisionPanel';

interface QuickStatsModalProps {
  isOpen: boolean;
  onClose: () => void;
  isPremium: boolean;
  onNavigate: (view: any, tab?: string) => void;
  userId: string;
  initialTab?: 'ARROWS' | 'POINTS'; // Nowy opcjonalny prop
  // Słupki 12-tygodniowe liczone przez rodzica (HomeView z rocznego snapshotu,
  // StudentProfileView leniwie) — modal nie robi już własnego odczytu z Firestore.
  weeklyArrows?: number[];
  weeklyPoints?: number[];
  // Średnie tygodniowe per dystans — włącza chipy dystansów w zakładce Ringe & Präzision
  weeklyPointsByDistance?: Record<string, number[]>;
  // Średnie kart per dystans — karty u góry zmieniają się po wybraniu chipa
  avgByDistance?: Record<string, { avgArrows3: number; avgPoints3: number; avgArrowsMonth: number; avgPointsMonth: number }>;
  stats: {
    daily: number;
    monthly: number;
    prevMonthly?: number;
    yearly: number;
    avg14: string;
    // Średnie na sesję (bez technicznych): 3 ostatnie sesje oraz bieżący miesiąc
    avgArrows3?: number;
    avgPoints3?: number;
    avgArrowsMonth?: number;
    avgPointsMonth?: number;
  };
}

const EMPTY_WEEKS: number[] = Array(12).fill(0);

export default function QuickStatsModal({ isOpen, onClose, isPremium, onNavigate, initialTab = 'ARROWS', weeklyArrows = EMPTY_WEEKS, weeklyPoints = EMPTY_WEEKS, weeklyPointsByDistance, avgByDistance, stats }: QuickStatsModalProps) {
  const { t, i18n } = useTranslation();
  const [activeTab, setActiveTab] = useState<'ARROWS' | 'POINTS'>(initialTab);

  // Zmiana: Aktualizuj zakładkę, gdy modal się otwiera z nowym initialTab
  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab]);

  if (!isOpen) return null;

  const handleGoToPro = () => {
    onClose();
    onNavigate('SETTINGS', 'PRO');
  };

  const maxArrows = Math.max(...weeklyArrows, 1);

  const now = new Date();
  const currentMonthName = now.toLocaleString(i18n.language, { month: 'long' }).toUpperCase();
  const prevMonthName = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    .toLocaleString(i18n.language, { month: 'short' }).toUpperCase();

  // Etykieta tygodnia jako numer tygodnia kalendarzowego (ISO-8601), np. "KW 23"
  const getWeekLabel = (i: number): string => {
    const weeksAgo = 11 - i;
    const d = new Date();
    d.setDate(d.getDate() - weeksAgo * 7);
    const day = d.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff); // poniedziałek danego tygodnia
    // Numer tygodnia ISO: czwartek tego tygodnia decyduje o roku
    const target = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const dayNum = target.getUTCDay() || 7;
    target.setUTCDate(target.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
    const week = Math.ceil((((target.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
    return `KW ${week}`;
  };

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
                  <span className="text-[8px] font-black text-emerald-400 uppercase tracking-widest block mb-1">{currentMonthName}</span>
                  <p className="text-2xl font-black">{stats.monthly}</p>
                  {(stats.prevMonthly ?? 0) > 0 && (
                    <span className="text-[7px] font-bold text-white/40 block mt-0.5">{prevMonthName}: {stats.prevMonthly}</span>
                  )}
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
                      {weeklyArrows.map((val, i) => {
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
                              <span className="text-[6px] text-gray-300 font-bold mt-1 shrink-0">{getWeekLabel(i)}</span>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                </div>
                {!isPremium && <ProPaywall />}
              </div>
            </div>
          )}

          {activeTab === 'POINTS' && (
            <div className="animate-fade-in">
              <RingePraezisionPanel
                avgArrows3={stats.avgArrows3 || 0}
                avgPoints3={stats.avgPoints3 || 0}
                avgArrowsMonth={stats.avgArrowsMonth || 0}
                avgPointsMonth={stats.avgPointsMonth || 0}
                weeklyArrows={weeklyArrows}
                weeklyPoints={weeklyPoints}
                weeklyPointsByDistance={weeklyPointsByDistance}
                avgByDistance={avgByDistance}
                locked={!isPremium}
                onUnlock={handleGoToPro}
              />
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