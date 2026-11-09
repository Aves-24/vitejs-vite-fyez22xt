import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
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
  // Ø ringów na trening per tydzień (druga linia nad słupkiem) — globalnie i per dystans
  weeklySessionAvg?: number[];
  weeklySessionAvgByDistance?: Record<string, number[]>;
  /** [FELD] Najwyższa wartość strzały w świecie statystyk (teren: 6). */
  scaleMax?: number;
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
    // [QUICK STATS 2026-11-06] Ringe/Pfeil także z krótszych treningów (Home liczy).
    perArrow3?: number;
    perArrowMonth?: number;
  };
}

const EMPTY_WEEKS: number[] = Array(12).fill(0);

export default function QuickStatsModal({ isOpen, onClose, isPremium, onNavigate, initialTab = 'ARROWS', weeklyArrows = EMPTY_WEEKS, weeklyPoints = EMPTY_WEEKS, weeklyPointsByDistance, avgByDistance, weeklySessionAvg, weeklySessionAvgByDistance, scaleMax = 10, stats }: QuickStatsModalProps) {
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

  // Wykres tygodni w stylu kart: słupki ciemnej zieleni, bieżący tydzień pełny.
  const WeekBars = ({ values, max, fmt }: { values: number[]; max: number; fmt: (v: number) => string }) => (
    <div className="flex items-end justify-between gap-1 w-full h-28">
      {values.map((val, i) => {
        const last = i === values.length - 1;
        return (
          <div key={i} className="flex flex-col items-center justify-end gap-1 flex-1 h-full min-w-0">
            <div className="w-full relative flex items-end justify-center h-full">
              {val > 0 && (
                <span className={`absolute -top-4 text-[9px] font-black ${last ? 'text-[#0a3a2a]' : 'text-gray-400'}`}>{fmt(val)}</span>
              )}
              <div
                className={`w-full max-w-[16px] mx-auto rounded-t ${val > 0 ? (last ? 'bg-emerald-600' : 'bg-emerald-600/25') : 'bg-gray-200'}`}
                style={{ height: val > 0 ? `${Math.max(6, (val / max) * 100)}%` : '3px' }}
              />
            </div>
            {/* Stała wysokość podpisu — puste etykiety nie przesuwają słupków. */}
            <span className={`h-3 leading-3 text-[8px] font-bold shrink-0 whitespace-nowrap ${last ? 'text-[#0a3a2a]' : 'text-gray-300'}`}>{(i % 3 === 0 || last) ? getWeekLabel(i).replace('KW ', '') : ''}</span>
          </div>
        );
      })}
    </div>
  );

  // [QUICK STATS 2026-11-06] Wygląd kart (jak okna kalendarza): nagłówek z ikonką,
  // przełącznik w szarej ramce, białe karty bez wypełnień, bez stopki „GROT-X”.
  return (
    <div className="fixed inset-0 z-[2000] flex items-start justify-center px-4 pt-14">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose}></div>

      <div role="dialog" aria-label={t('home.quickStats.title')} className="bg-white w-full max-w-sm rounded-[32px] relative z-10 shadow-2xl animate-fade-in max-h-[85vh] overflow-hidden flex flex-col p-5">
        <div className="flex items-center gap-2.5 mb-3 shrink-0">
          <span className="w-9 h-9 rounded-xl tb-icon flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-[20px] text-[#0a3a2a]">bar_chart</span>
          </span>
          <h2 className="flex-1 min-w-0 text-[15px] font-black text-[#0a3a2a] leading-tight">{t('home.quickStats.title', { defaultValue: 'Schnellstatistik' })}</h2>
          <button onClick={onClose} aria-label={t('common.cancel')} className="w-9 h-9 rounded-full bg-gray-100 text-gray-500 flex items-center justify-center active:scale-90 transition-all">
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        <div className="flex p-1 bg-gray-100 rounded-xl mb-3 shrink-0">
          {([['ARROWS', t('home.quickStats.tabArrows', { defaultValue: 'Pfeile' })], ['POINTS', t('home.quickStats.tabPointsShort', { defaultValue: 'Ringe' })]] as const).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              aria-pressed={activeTab === id}
              className={`flex-1 py-1.5 rounded-lg text-[12px] font-black transition-all ${activeTab === id ? 'bg-[#0a3a2a] text-white shadow-sm' : 'text-gray-500'}`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto space-y-3 custom-scrollbar">
          {activeTab === 'ARROWS' && (
            <div className="space-y-3 animate-fade-in">
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm grid grid-cols-3 divide-x divide-gray-100">
                <div className="px-3 py-2.5">
                  <p className="text-[20px] font-black text-[#0a3a2a] leading-none">{stats.daily}</p>
                  <p className="text-[11px] font-bold text-gray-500 mt-1 truncate">{t('home.day')}</p>
                </div>
                <div className="px-3 py-2.5">
                  <p className="text-[20px] font-black text-[#0a3a2a] leading-none">{stats.monthly}</p>
                  <p className="text-[11px] font-bold text-gray-500 mt-1 truncate capitalize">{currentMonthName.toLowerCase()}</p>
                  {(stats.prevMonthly ?? 0) > 0 && (
                    <p className="text-[10px] font-bold text-gray-400 truncate capitalize">{prevMonthName.toLowerCase()}: {stats.prevMonthly}</p>
                  )}
                </div>
                <div className="px-3 py-2.5">
                  <p className="text-[20px] font-black text-[#0a3a2a] leading-none">{stats.yearly.toLocaleString(i18n.language)}</p>
                  <p className="text-[11px] font-bold text-gray-500 mt-1 truncate">{t('home.yearly')}</p>
                </div>
              </div>

              <div>
                <p className="text-[12px] font-bold text-gray-500 mb-1.5 px-1">{t('home.quickStats.arrowsPerWeek', { defaultValue: 'Pfeile pro Woche · 12 Wochen' })}</p>
                <div className="relative">
                  <div className={`bg-white rounded-2xl border border-gray-100 shadow-sm px-3 pt-6 pb-2 transition-all duration-500 ${!isPremium ? 'blur-lg opacity-20 pointer-events-none select-none' : ''}`}>
                    <WeekBars values={weeklyArrows} max={maxArrows} fmt={v => String(v)} />
                  </div>
                  {!isPremium && <ProPaywall />}
                </div>
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
                perArrow3={stats.perArrow3}
                perArrowMonth={stats.perArrowMonth}
                weeklyArrows={weeklyArrows}
                weeklyPoints={weeklyPoints}
                weeklyPointsByDistance={weeklyPointsByDistance}
                avgByDistance={avgByDistance}
                weeklySessionAvg={weeklySessionAvg}
                weeklySessionAvgByDistance={weeklySessionAvgByDistance}
                locked={!isPremium}
                onUnlock={handleGoToPro}
                scaleMax={scaleMax}
              />
            </div>
          )}
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