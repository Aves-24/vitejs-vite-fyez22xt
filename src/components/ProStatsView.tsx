import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../firebase';
import { collection, query, orderBy, limit, getDocs, where, Timestamp } from 'firebase/firestore';
import { useTranslation } from 'react-i18next';
import TechProHistory from './TechProHistory'; // <--- DODANY IMPORT

interface Session {
  id: string;
  score: number;
  arrows: number;
  distance: string;
  date: string;
  timestamp: any;
  type?: string;
  targetType?: string;
  ends?: any[];
  note?: string;
  coachNote?: string;
  totalArrows?: number;
}

interface ProStatsViewProps {
  userId: string;
  isPremium: boolean;
  onNavigate: (view: string, tab?: string) => void;
}

const PRO_STATS_CACHE_KEY = (uid: string) => `grotX_proStats_${uid}`;

function proStatsCacheGet(uid: string): { sessions: Session[]; full: boolean } | null {
  try {
    const raw = localStorage.getItem(PRO_STATS_CACHE_KEY(uid));
    if (!raw) return null;
    const { data, expiresAt } = JSON.parse(raw);
    if (Date.now() > expiresAt) { localStorage.removeItem(PRO_STATS_CACHE_KEY(uid)); return null; }
    return data;
  } catch { return null; }
}

function proStatsCacheSet(uid: string, sessions: Session[], full: boolean): void {
  try {
    const midnight = new Date();
    midnight.setHours(24, 0, 0, 0);
    localStorage.setItem(PRO_STATS_CACHE_KEY(uid), JSON.stringify({ data: { sessions, full }, expiresAt: midnight.getTime() }));
  } catch { /* ignore quota errors */ }
}

const TWELVE_WEEKS_MS = 84 * 24 * 60 * 60 * 1000;

export default function ProStatsView({ userId, isPremium, onNavigate }: ProStatsViewProps) {
  const { t } = useTranslation();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selectedDistance, setSelectedDistance] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingAll, setIsLoadingAll] = useState(false);
  const [hasFullHistory, setHasFullHistory] = useState(false);

  const [heatmapLimit, setHeatmapLimit] = useState<number>(20);

  useEffect(() => {
    if (!userId || !isPremium) {
      setIsLoading(false);
      return;
    }

    // Sprawdź cache — dane odświeżają się raz dziennie lub po nowym treningu
    const cached = proStatsCacheGet(userId);
    if (cached) {
      setSessions(cached.sessions);
      setHasFullHistory(cached.full ?? false);
      setIsLoading(false);
      return;
    }

    // Domyślnie ładujemy tylko ostatnie 12 tygodni — wystarcza do wykresów i heatmapy
    const fetchRecentSessions = async () => {
      try {
        const twelveWeeksAgo = new Date(Date.now() - TWELVE_WEEKS_MS);
        const q = query(
          collection(db, `users/${userId}/sessions`),
          where('timestamp', '>=', Timestamp.fromDate(twelveWeeksAgo)),
          orderBy('timestamp', 'asc')
        );
        const snap = await getDocs(q);
        const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as Session));
        setSessions(data);
        setHasFullHistory(false);
        proStatsCacheSet(userId, data, false);
      } catch (e) {
        console.error("Błąd pobierania ProStats:", e);
      } finally {
        setIsLoading(false);
      }
    };

    fetchRecentSessions();
  }, [userId, isPremium]);

  const loadFullHistory = async () => {
    if (isLoadingAll) return;
    setIsLoadingAll(true);
    try {
      const q = query(
        collection(db, `users/${userId}/sessions`),
        orderBy('timestamp', 'asc'),
        limit(500)
      );
      const snap = await getDocs(q);
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as Session));
      setSessions(data);
      setHasFullHistory(true);
      proStatsCacheSet(userId, data, true);
    } catch (e) {
      console.error("Błąd pobierania pełnej historii:", e);
    } finally {
      setIsLoadingAll(false);
    }
  };

  // LOGIKA SORTOWANIA DYSTANSÓW (TECH na sam koniec)
  const distances = useMemo(() => {
    const allUnique = Array.from(new Set(sessions.map(s => s.distance)));
    const regularDistances = allUnique.filter(d => d !== 'TECH').sort((a, b) => parseInt(b) - parseInt(a));
    const hasTech = allUnique.includes('TECH');
    
    return hasTech ? [...regularDistances, 'TECH'] : regularDistances;
  }, [sessions]);

  useEffect(() => {
    if (distances.length > 0 && !selectedDistance) {
      setSelectedDistance(distances[0]);
    }
  }, [distances, selectedDistance]);

  const filteredSessions = useMemo(() => sessions.filter(s => s.distance === selectedDistance), [sessions, selectedDistance]);

  const stats = useMemo(() => {
    if (filteredSessions.length === 0) return null;
    
    let totalArrows = 0;
    let totalScoreAllTime = 0;
    let maxScore = 0;
    let maxScoreDate = '';
    let maxScoreArrows = 0;
    
    const zones = { gold: 0, red: 0, blue: 0, black: 0, white: 0, miss: 0 };
    let totalArrowsWithDetails = 0;

    let firstHalfScore = 0, firstHalfArrows = 0;
    let secondHalfScore = 0, secondHalfArrows = 0;

    const weeklyVolume = Array(12).fill(0);
    const now = Date.now();

    const chartData = filteredSessions.map(s => {
      // Dla TECH sumujemy totalArrows, dla zwykłych arrows
      const arrowsToCount = s.distance === 'TECH' ? (s.totalArrows || 0) : (s.arrows || 0);
      totalArrows += arrowsToCount;
      totalScoreAllTime += (s.score || 0);
      
      if ((s.score || 0) > maxScore && (s.arrows || 0) > 0) {
        maxScore = s.score;
        maxScoreDate = s.date;
        maxScoreArrows = s.arrows;
      }

      if (s.ends && s.ends.length > 0) {
        const midPoint = Math.floor(s.ends.length / 2);
        
        s.ends.forEach((end, idx) => {
          const endSum = end.total_sum || 0;
          const endArrCount = end.arrows?.length || 0;
          
          if (idx < midPoint) {
            firstHalfScore += endSum;
            firstHalfArrows += endArrCount;
          } else {
            secondHalfScore += endSum;
            secondHalfArrows += endArrCount;
          }

          end.arrows?.forEach((arrow: string) => {
            totalArrowsWithDetails++;
            if (['X', '10', '9'].includes(arrow)) zones.gold++;
            else if (['8', '7'].includes(arrow)) zones.red++;
            else if (['6', '5'].includes(arrow)) zones.blue++;
            else if (['4', '3'].includes(arrow)) zones.black++;
            else if (['2', '1'].includes(arrow)) zones.white++;
            else zones.miss++;
          });
        });
      }

      let ts = Date.now();
      if (s.timestamp) {
         if (typeof s.timestamp === 'number') {
            ts = s.timestamp;
         } else if (typeof s.timestamp.toMillis === 'function') {
            ts = s.timestamp.toMillis();
         } else if (s.timestamp.seconds) {
            ts = s.timestamp.seconds * 1000;
         }
      }

      const diffTime = now - ts;
      const diffDays = diffTime / (1000 * 60 * 60 * 24);
      const weekIndex = Math.floor(diffDays / 7);
      if (weekIndex >= 0 && weekIndex < 12) {
         weeklyVolume[11 - weekIndex] += arrowsToCount;
      }

      return {
        date: s.date,
        avg: s.arrows > 0 ? (s.score / s.arrows) : 0,
        score: s.score || 0
      };
    });

    const allTimeAvg = totalArrows > 0 ? (totalScoreAllTime / totalArrows) : 0;
    const recentSessions = filteredSessions.slice(-3);
    const recentArrows = recentSessions.reduce((acc, s) => acc + (s.arrows || 0), 0);
    const recentScore = recentSessions.reduce((acc, s) => acc + (s.score || 0), 0);
    const recentAvg = recentArrows > 0 ? (recentScore / recentArrows) : 0;
    const formTrend = recentAvg - allTimeAvg;

    const fhAvg = firstHalfArrows > 0 ? (firstHalfScore / firstHalfArrows) : 0;
    const shAvg = secondHalfArrows > 0 ? (secondHalfScore / secondHalfArrows) : 0;
    const fatigueDrop = shAvg - fhAvg;

    const volumeChartData = weeklyVolume.map((val, idx) => {
       let label = `T-${11 - idx}`;
       if (idx === 11) label = t('stats.pro.sight.now');
       return { label, value: val };
    });

    const hasVolumeData = volumeChartData.some(d => d.value > 0);

    const recentForHeatmap = filteredSessions.slice(-heatmapLimit);
    const heatmapDots: any[] = [];
    let heatmapTargetType = 'Full';
    
    if (recentForHeatmap.length > 0) {
       const lastSession = recentForHeatmap[recentForHeatmap.length - 1];
       heatmapTargetType = selectedDistance.includes('18') 
         ? '3-Spot' 
         : (lastSession.targetType && lastSession.targetType !== 'Full' ? lastSession.targetType : 'Full');

       recentForHeatmap.forEach(session => {
          session.ends?.forEach((end: any) => {
             end.dots?.forEach((dot: any) => {
                if (dot.x !== null && dot.y !== null) {
                   heatmapDots.push(dot);
                }
             });
          });
       });
    }

    return { 
      totalArrows, maxScore, maxScoreDate, maxScoreArrows, chartData, allTimeAvg, recentAvg,
      formTrend, zones, totalArrowsWithDetails, fatigueDrop, fhAvg, shAvg, volumeChartData,
      hasVolumeData, heatmapDots, heatmapTargetType, heatmapSessionsCount: recentForHeatmap.length
    };
  }, [filteredSessions, heatmapLimit, selectedDistance, t]);

  if (!isPremium) {
    return (
      <div className="flex flex-col items-center justify-center pt-10 px-6 animate-fade-in-up">
        <div className="w-20 h-20 bg-gradient-to-br from-amber-300 to-amber-500 rounded-full flex items-center justify-center shadow-lg mb-6">
          <span className="material-symbols-outlined text-white text-4xl">diamond</span>
        </div>
        <h2 className="text-2xl font-black text-[#0a3a2a] text-center tracking-tighter uppercase leading-tight mb-2">GROT-X PRO</h2>
        <p className="text-xs text-gray-500 font-bold text-center mb-8 px-4">{t('stats.pro.unlockDesc', 'Odblokuj mapę rozrzutu, wykresy formy, wskaźnik zmęczenia i pełne dane.')}</p>
        <button onClick={() => onNavigate('SETTINGS', 'PRO')} className="w-full py-4 bg-[#0a3a2a] text-[#fed33e] rounded-2xl font-black uppercase tracking-widest active:scale-95 transition-all shadow-xl flex items-center justify-center gap-2">
          <span className="material-symbols-outlined text-[16px]">diamond</span>
          {t('stats.pro.btnUnlock', 'Odblokuj GROT-X PRO')}
        </button>
      </div>
    );
  }

  if (isLoading) return <div className="p-10 text-center animate-pulse text-gray-400 mt-20">{t('stats.pro.loading', 'Wczytywanie...')}</div>;

  if (sessions.length === 0) return (
    <div className="flex flex-col items-center justify-center py-20 opacity-30">
      <span className="material-symbols-outlined text-6xl mb-2">auto_graph</span>
      <p className="font-black uppercase text-[10px] tracking-widest text-center">{t('stats.pro.noData', 'Brak Danych')}</p>
    </div>
  );

  return (
    <div className="animate-fade-in-up space-y-4 px-4 pb-10">
      
      {distances.length > 0 && (
        <div className="flex gap-2 overflow-x-auto hide-scrollbar pb-2">
          {distances.map(dist => {
            const isTech = dist === 'TECH';
            return (
              <button key={dist} onClick={() => setSelectedDistance(dist)}
                className={`px-5 py-2 rounded-full text-[10px] font-black uppercase tracking-widest transition-all shrink-0 border-2 flex items-center gap-1 ${
                  selectedDistance === dist 
                  ? (isTech ? 'bg-emerald-500 text-white border-emerald-500 shadow-md' : 'bg-[#0a3a2a] text-[#fed33e] border-[#0a3a2a] shadow-md') 
                  : 'bg-white text-gray-400 border-gray-100'
                }`}>
                {isTech && <span className="material-symbols-outlined text-[12px]">fitness_center</span>}
                {dist}
              </button>
            )
          })}
        </div>
      )}

      {/* Baner informujący o zakresie danych + opcja załadowania pełnej historii */}
      {!hasFullHistory && (
        <div className="flex items-center justify-between bg-amber-50 border border-amber-100 rounded-2xl px-4 py-3">
          <p className="text-[9px] font-black text-amber-700 uppercase tracking-widest">{t('stats.pro.last12weeks', 'Statystyki z ostatnich 12 tyg.')}</p>
          <button
            onClick={loadFullHistory}
            disabled={isLoadingAll}
            className="text-[9px] font-black text-[#0a3a2a] bg-white border border-gray-200 px-3 py-1.5 rounded-xl active:scale-95 transition-all disabled:opacity-50 shrink-0 ml-3"
          >
            {isLoadingAll ? t('stats.pro.loading', 'Ładuję...') : t('stats.pro.allHistory', 'Cała historia')}
          </button>
        </div>
      )}

      {stats ? (
        selectedDistance === 'TECH' ? (
          // OTO NASZ NOWY WIDOK DLA TRENINGU TECHNICZNEGO
          <TechProHistory sessions={filteredSessions} />
        ) : (
          // KLASYCZNY WIDOK PRO DLA NORMALNYCH DYSTANSÓW
          <>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-gradient-to-br from-amber-400 to-amber-500 rounded-[24px] p-5 text-white shadow-md relative overflow-hidden flex flex-col justify-center">
                <span className="material-symbols-outlined absolute -right-4 -bottom-4 text-[80px] text-white/20 rotate-12">trophy</span>
                <span className="block text-[9px] font-black uppercase tracking-widest text-amber-900 mb-1 relative z-10">{t('stats.pro.pb', 'Rekord Życiowy')}</span>
                <span className="text-4xl font-black leading-none tracking-tighter relative z-10">{stats.maxScore}</span>
                <div className="relative z-10 mt-1">
                  <span className="block text-[8px] font-bold text-amber-900/80 uppercase">{stats.maxScoreArrows} {t('stats.pro.arrows', 'Strzał')}</span>
                  <span className="block text-[8px] font-bold text-amber-900/80 uppercase">{stats.maxScoreDate}</span>
                </div>
              </div>

              <div className="space-y-3">
                <div className="bg-white rounded-[20px] p-4 border border-gray-100 shadow-sm flex flex-col justify-center">
                  <span className="block text-[8px] font-black uppercase tracking-widest text-gray-400 mb-0.5">{t('stats.pro.estScore720', 'Estymowany Wynik (720)')}</span>
                  <span className="text-2xl font-black text-[#0a3a2a] leading-none tracking-tighter">
                    {Math.round(stats.allTimeAvg * 72)} <span className="text-[10px] text-gray-400">/ 720</span>
                  </span>
                </div>
                <div className={`rounded-[20px] p-4 border shadow-sm flex flex-col justify-center ${stats.formTrend >= 0 ? 'bg-emerald-50 border-emerald-100' : 'bg-red-50 border-red-100'}`}>
                  <span className={`block text-[8px] font-black uppercase tracking-widest mb-0.5 ${stats.formTrend >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>{t('stats.pro.formTrend', 'Trend Formy')}</span>
                  <div className="flex items-center gap-1">
                    <span className="material-symbols-outlined text-[16px] font-bold" style={{ color: stats.formTrend >= 0 ? '#059669' : '#dc2626' }}>
                      {stats.formTrend >= 0 ? 'trending_up' : 'trending_down'}
                    </span>
                    <span className={`text-xl font-black leading-none tracking-tighter ${stats.formTrend >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                      {stats.formTrend > 0 ? '+' : ''}{stats.formTrend.toFixed(2)}
                    </span>
                    <span className="text-[8px] font-bold opacity-60">{t('stats.pro.unitPtsArrow', 'Pkt/Strzałę')}</span>
                  </div>
                </div>
              </div>
            </div>

            {stats.heatmapDots.length > 0 && (
              <HeatmapSection
                dots={stats.heatmapDots}
                targetType={stats.heatmapTargetType}
                sessionCount={stats.heatmapSessionsCount}
                heatmapLimit={heatmapLimit}
                setHeatmapLimit={setHeatmapLimit}
                distance={selectedDistance}
              />
            )}

            {stats.fhAvg > 0 && stats.shAvg > 0 && (
              <div className="bg-white rounded-[24px] border border-gray-100 p-4 shadow-sm">
                <div className="flex justify-between items-center mb-3">
                  <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{t('stats.pro.enduranceTitle', 'Wskaźnik Wytrzymałości')}</h3>
                  <span className="material-symbols-outlined text-gray-300 text-sm">battery_charging_full</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="text-center flex-1">
                     <span className="text-[8px] font-bold text-gray-400 uppercase block mb-1">{t('stats.pro.firstHalf', 'I Połowa (Śr.)')}</span>
                     <span className="text-lg font-black text-[#0a3a2a]">{stats.fhAvg.toFixed(2)}</span>
                  </div>
                  <div className="w-[1px] h-8 bg-gray-100"></div>
                  <div className="text-center flex-1">
                     <span className="text-[8px] font-bold text-gray-400 uppercase block mb-1">{t('stats.pro.secondHalf', 'II Połowa (Śr.)')}</span>
                     <span className="text-lg font-black text-[#0a3a2a]">{stats.shAvg.toFixed(2)}</span>
                  </div>
                  <div className="w-[1px] h-8 bg-gray-100"></div>
                  <div className="text-center flex-1">
                     <span className="text-[8px] font-bold text-gray-400 uppercase block mb-1">{t('stats.pro.decline', 'Spadek')}</span>
                     <span className={`text-lg font-black ${stats.fatigueDrop < -0.3 ? 'text-red-500' : stats.fatigueDrop > 0 ? 'text-emerald-500' : 'text-gray-500'}`}>
                       {stats.fatigueDrop > 0 ? '+' : ''}{stats.fatigueDrop.toFixed(2)}
                     </span>
                  </div>
                </div>
              </div>
            )}

            {stats.totalArrowsWithDetails > 0 && (
              <div className="bg-white rounded-[32px] border border-gray-100 shadow-sm p-5 relative overflow-hidden">
                <div className="flex justify-between items-center mb-4">
                  <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{t('stats.pro.zonesTitle', 'Rozkład Trafień')}</span>
                  <div className="flex items-center gap-1.5 bg-[#fed33e]/20 px-2 py-1 rounded-md border border-[#fed33e]/50">
                    <span className="material-symbols-outlined text-[#725b00] text-[10px]">diamond</span>
                    <span className="text-[9px] font-black text-[#725b00] uppercase tracking-widest">
                      Golden Ratio: {((stats.zones.gold / stats.totalArrowsWithDetails) * 100).toFixed(0)}%
                    </span>
                  </div>
                </div>
                
                <div className="w-full h-8 flex rounded-full overflow-hidden mb-2 shadow-inner">
                  {stats.zones.gold > 0 && <div style={{ width: `${(stats.zones.gold / stats.totalArrowsWithDetails) * 100}%` }} className="bg-[#F2C94C] h-full transition-all"></div>}
                  {stats.zones.red > 0 && <div style={{ width: `${(stats.zones.red / stats.totalArrowsWithDetails) * 100}%` }} className="bg-[#EB5757] h-full transition-all"></div>}
                  {stats.zones.blue > 0 && <div style={{ width: `${(stats.zones.blue / stats.totalArrowsWithDetails) * 100}%` }} className="bg-[#2F80ED] h-full transition-all"></div>}
                  {stats.zones.black > 0 && <div style={{ width: `${(stats.zones.black / stats.totalArrowsWithDetails) * 100}%` }} className="bg-[#333333] h-full transition-all"></div>}
                  {stats.zones.white > 0 && <div style={{ width: `${(stats.zones.white / stats.totalArrowsWithDetails) * 100}%` }} className="bg-gray-200 h-full transition-all"></div>}
                  {stats.zones.miss > 0 && <div style={{ width: `${(stats.zones.miss / stats.totalArrowsWithDetails) * 100}%` }} className="bg-purple-900 h-full transition-all"></div>}
                </div>
                
                <div className="grid grid-cols-3 gap-y-2 mt-3">
                  <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-[#F2C94C]"></div><span className="text-[9px] font-bold text-gray-500">{t('stats.pro.zones.gold', 'Złote')} ({((stats.zones.gold / stats.totalArrowsWithDetails) * 100).toFixed(1)}%)</span></div>
                  <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-[#EB5757]"></div><span className="text-[9px] font-bold text-gray-500">{t('stats.pro.zones.red', 'Czerw.')} ({((stats.zones.red / stats.totalArrowsWithDetails) * 100).toFixed(1)}%)</span></div>
                  <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-[#2F80ED]"></div><span className="text-[9px] font-bold text-gray-500">{t('stats.pro.zones.blue', 'Nieb.')} ({((stats.zones.blue / stats.totalArrowsWithDetails) * 100).toFixed(1)}%)</span></div>
                  <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-[#333333]"></div><span className="text-[9px] font-bold text-gray-500">{t('stats.pro.zones.black', 'Czarne')} ({((stats.zones.black / stats.totalArrowsWithDetails) * 100).toFixed(1)}%)</span></div>
                  <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-gray-200"></div><span className="text-[9px] font-bold text-gray-500">{t('stats.pro.zones.white', 'Białe')} ({((stats.zones.white / stats.totalArrowsWithDetails) * 100).toFixed(1)}%)</span></div>
                  <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-purple-900"></div><span className="text-[9px] font-bold text-gray-500">{t('stats.pro.zones.miss', 'Pudła')} ({((stats.zones.miss / stats.totalArrowsWithDetails) * 100).toFixed(1)}%)</span></div>
                </div>
              </div>
            )}

            {/* WYKRES OBJĘTOŚCI (Z 12 TYGODNI I NAPRAWIONYM WZROSTEM) */}
            <div className="bg-white rounded-[32px] border border-gray-100 shadow-sm p-5">
              <div className="flex justify-between items-center mb-4">
                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{t('stats.pro.weeklyArrows', 'Liczba Strzał (Tygodniowo)')}</span>
                <span className="material-symbols-outlined text-gray-300 text-sm">bar_chart</span>
              </div>
              
              {stats.hasVolumeData ? (
                <div className="h-[120px]">
                   <VolumeBarChart data={stats.volumeChartData} />
                </div>
              ) : (
                <div className="h-[120px] flex items-center justify-center opacity-40">
                   <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">{t('stats.pro.tooFewSessions', 'Zbyt mało danych. Zapisz więcej treningów.')}</span>
                </div>
              )}
            </div>

            <div className="bg-[#0a3a2a] rounded-[32px] shadow-sm p-5">
              <div className="flex justify-between items-center mb-6">
                <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">{t('stats.pro.progressCurve')}</span>
                <span className="bg-emerald-50/10 text-emerald-300 px-3 py-1 rounded-full text-[9px] font-black uppercase">{t('stats.pro.trainingsCount', '{{count}} TRENINGÓW', { count: stats.chartData.length })}</span>
              </div>
              
              <div className="relative w-full h-[180px] mt-4">
                <ProgressChart data={stats.chartData} />
              </div>
            </div>

            <div className="text-center">
              <span className="text-[10px] font-black text-gray-300 uppercase tracking-widest">{t('stats.pro.totalDistArrows', 'Łącznie na tym dystansie: {{count}} strzał', { count: stats.totalArrows })}</span>
            </div>
          </>
        )
      ) : (
        <div className="text-center p-10 opacity-40 text-gray-500 font-bold text-sm">{t('stats.pro.noDistanceData', 'Brak danych dla wybranego dystansu.')}</div>
      )}
    </div>
  );
}

// ─── DISPERSION PATH HELPER ─────────────────────────────────────────────────
// Builds an irregular polar contour around a set of dots.
// Works for any subset (full face or single spot).
function buildDispersionPath(dots: any[]): { mx: number; my: number; path: string } | null {
  if (dots.length < 2) return null;
  const mx = dots.reduce((s, d) => s + d.x, 0) / dots.length;
  const my = dots.reduce((s, d) => s + d.y, 0) / dots.length;
  const globalAvg = dots.reduce((s, d) => s + Math.sqrt((d.x - mx) ** 2 + (d.y - my) ** 2), 0) / dots.length;

  const N = 32;
  const sums = Array(N).fill(0);
  const counts = Array(N).fill(0);
  for (const dot of dots) {
    let ang = Math.atan2(dot.y - my, dot.x - mx);
    if (ang < 0) ang += 2 * Math.PI;
    const idx = Math.min(Math.floor((ang / (2 * Math.PI)) * N), N - 1);
    sums[idx] += Math.sqrt((dot.x - mx) ** 2 + (dot.y - my) ** 2);
    counts[idx]++;
  }

  const radii = sums.map((s, i) => counts[i] > 0 ? s / counts[i] : 0);
  for (let i = 0; i < N; i++) {
    if (radii[i] === 0) {
      let pi = -1, ni = -1;
      for (let j = 1; j <= N; j++) {
        if (pi < 0 && radii[(i - j + N) % N] > 0) pi = (i - j + N) % N;
        if (ni < 0 && radii[(i + j) % N] > 0) ni = (i + j) % N;
        if (pi >= 0 && ni >= 0) break;
      }
      if (pi >= 0 && ni >= 0) {
        const pd = (i - pi + N) % N, nd = (ni - i + N) % N, tot = pd + nd;
        radii[i] = (radii[pi] * nd + radii[ni] * pd) / tot;
      } else {
        radii[i] = globalAvg;
      }
    }
  }

  let sm = [...radii];
  for (let p = 0; p < 3; p++) {
    sm = sm.map((r, i) =>
      sm[(i - 2 + N) % N] * 0.1 + sm[(i - 1 + N) % N] * 0.2 + r * 0.4 +
      sm[(i + 1) % N] * 0.2 + sm[(i + 2) % N] * 0.1
    );
  }

  const pts = sm.map((r, i) => {
    const a = (i / N) * 2 * Math.PI - Math.PI / 2;
    return { x: mx + r * Math.cos(a), y: my + r * Math.sin(a) };
  });

  const mid = (a: { x: number; y: number }, b: { x: number; y: number }) =>
    ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const s0 = mid(pts[N - 1], pts[0]);
  let path = `M ${s0.x.toFixed(2)} ${s0.y.toFixed(2)}`;
  for (let i = 0; i < N; i++) {
    const e = mid(pts[i], pts[(i + 1) % N]);
    path += ` Q ${pts[i].x.toFixed(2)} ${pts[i].y.toFixed(2)} ${e.x.toFixed(2)} ${e.y.toFixed(2)}`;
  }
  path += ' Z';
  return { mx, my, path };
}

function DispersionContour({ mx, my, path }: { mx: number; my: number; path: string }) {
  return (
    <g>
      <path d={path} fill="none" stroke="#0a3a2a" strokeWidth="3.5" strokeDasharray="6 3" opacity="0.6" />
      <path d={path} fill="none" stroke="#16a34a" strokeWidth="1.8" strokeDasharray="6 3" opacity="0.95" />
      <circle cx={mx} cy={my} r="7" fill="white" opacity="0.35" />
      <circle cx={mx} cy={my} r="5" fill="#0a3a2a" opacity="0.9" />
      <circle cx={mx} cy={my} r="3" fill="#16a34a" />
      <circle cx={mx} cy={my} r="1.2" fill="white" />
    </g>
  );
}

// LOGIKA KOMPONENTU HEATMAPY — THERMAL CAMERA EFFECT

// Thermal palette — all alpha=255, black=no effect with screen blend mode
function thermalColor(t: number): [number, number, number] {
  if (t <= 0) return [0, 0, 0];
  const stops: [number, number, number, number][] = [
    [0.00,   0,   0,   0],
    [0.10,  30,   0,  80],
    [0.25,  80,   0, 180],
    [0.40,   0,  80, 255],
    [0.55,   0, 210, 230],
    [0.67,   0, 230,  50],
    [0.78, 230, 230,   0],
    [0.88, 255, 120,   0],
    [0.94, 255,  30,   0],
    [1.00, 255, 255, 255],
  ];
  let lo = stops[0], hi = stops[stops.length - 1];
  for (let i = 0; i < stops.length - 1; i++) {
    if (t >= stops[i][0] && t <= stops[i + 1][0]) { lo = stops[i]; hi = stops[i + 1]; break; }
  }
  const f = (hi[0] - lo[0]) > 0 ? (t - lo[0]) / (hi[0] - lo[0]) : 0;
  return [
    Math.round(lo[1] + f * (hi[1] - lo[1])),
    Math.round(lo[2] + f * (hi[2] - lo[2])),
    Math.round(lo[3] + f * (hi[3] - lo[3])),
  ];
}

function useHeatmapDataURL(dots: any[], vbW: number, vbH: number): string {
  const [dataURL, setDataURL] = useState('');
  useEffect(() => {
    if (!dots.length) { setDataURL(''); return; }
    const SCALE = 0.5;
    const W = Math.round(vbW * SCALE);
    const H = Math.round(vbH * SCALE);
    // Tight kernel — only areas actually hit get coloured
    const sigma = 8 * SCALE;
    const twoSigmaSq = 2 * sigma * sigma;
    const range = Math.ceil(3 * sigma);
    const density = new Float32Array(W * H);
    for (const dot of dots) {
      const cx = Math.round(dot.x * SCALE);
      const cy = Math.round(dot.y * SCALE);
      for (let dy = -range; dy <= range; dy++) {
        for (let dx = -range; dx <= range; dx++) {
          const px = cx + dx, py = cy + dy;
          if (px >= 0 && px < W && py >= 0 && py < H) {
            density[py * W + px] += Math.exp(-(dx * dx + dy * dy) / twoSigmaSq);
          }
        }
      }
    }
    let maxD = 0;
    for (let i = 0; i < W * H; i++) if (density[i] > maxD) maxD = density[i];
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d')!;
    const imgData = ctx.createImageData(W, H);
    const d = imgData.data;
    // Power curve: suppresses low-density areas, amplifies hot spots
    for (let i = 0; i < W * H; i++) {
      const raw = maxD > 0 ? density[i] / maxD : 0;
      const t = Math.min(Math.pow(raw, 0.55), 1);  // gamma < 1 → sharper hot/cold contrast
      const [r, g, b] = thermalColor(t);
      d[i * 4] = r; d[i * 4 + 1] = g; d[i * 4 + 2] = b;
      // Alpha: transparent where cold, opaque where hot — target always peeks through cold areas
      d[i * 4 + 3] = t < 0.05 ? 0 : Math.min(Math.round(t * 195), 195);
    }
    ctx.putImageData(imgData, 0, 0);
    setDataURL(canvas.toDataURL('image/png'));
  }, [dots, vbW, vbH]);
  return dataURL;
}

// SIGHT ADJUSTMENT HELPERS
function calcSightMm(dxSvg: number, dySvg: number, targetType: string, distance: string) {
  // Target diameter in mm from targetType label
  const d = targetType;
  const targetMm =
    d.includes('122') ? 1220 :
    d.includes('80')  ? 800  :
    d.includes('60')  ? 600  :
    d.includes('40')  ? 400  : 1220;
  const mmPerUnit = targetMm / 300;                // SVG units → mm on target
  const distM = parseFloat(distance) || 18;
  const SIGHT_RADIUS_MM = 800;                     // typical recurve sight radius
  const ratio = SIGHT_RADIUS_MM / (distM * 1000);  // parallax factor
  return {
    xTarget: dxSvg * mmPerUnit,
    yTarget: dySvg * mmPerUnit,
    xSight:  Math.abs(dxSvg * mmPerUnit * ratio),
    ySight:  Math.abs(dySvg * mmPerUnit * ratio),
  };
}

function useSightTips(dots: any[], targetType: string, distance: string) {
  const { t } = useTranslation();
  const isFullFace = ['Full', 'WA 80cm', '122cm', '80cm', '60cm', '40cm'].includes(targetType);
  if (!isFullFace || dots.length < 5) return null;

  const mx = dots.reduce((s, d) => s + d.x, 0) / dots.length;
  const my = dots.reduce((s, d) => s + d.y, 0) / dots.length;
  const dx = mx - 150;
  const dy = my - 150;
  const THRESHOLD = 5;

  const mm = calcSightMm(dx, dy, targetType, distance);

  const mag = (v: number) => {
    const a = Math.abs(v);
    if (a < 12) return t('stats.pro.sight.slightly', 'lekko');
    if (a < 25) return t('stats.pro.sight.clearly', 'wyraźnie');
    return t('stats.pro.sight.significantly', 'znacznie');
  };

  if (Math.abs(dx) <= THRESHOLD && Math.abs(dy) <= THRESHOLD) {
    return { ok: true, pills: [] as { icon: string; label: string; mag: string; sightMm: string }[], mm };
  }

  const pills: { icon: string; label: string; mag: string; sightMm: string }[] = [];
  if (Math.abs(dx) > THRESHOLD)
    pills.push({
      icon: dx > 0 ? 'arrow_forward' : 'arrow_back',
      label: dx > 0 ? t('stats.pro.sight.adjustRight') : t('stats.pro.sight.adjustLeft'),
      mag: mag(dx),
      sightMm: `${(mm.xSight * 0.8).toFixed(1)}–${(mm.xSight * 1.2).toFixed(1)} mm`,
    });
  if (Math.abs(dy) > THRESHOLD)
    pills.push({
      icon: dy > 0 ? 'arrow_downward' : 'arrow_upward',
      label: dy > 0 ? t('stats.pro.sight.adjustDown') : t('stats.pro.sight.adjustUp'),
      mag: mag(dy),
      sightMm: `${(mm.ySight * 0.8).toFixed(1)}–${(mm.ySight * 1.2).toFixed(1)} mm`,
    });

  return { ok: false, pills, mm };
}

function SightTip({ dots, targetType, distance }: { dots: any[], targetType: string, distance: string }) {
  const { t } = useTranslation();
  const tips = useSightTips(dots, targetType, distance);
  if (!tips) return null;

  if (tips.ok) {
    return (
      <div className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-100 rounded-full px-3 py-1.5 w-max">
        <span className="material-symbols-outlined text-emerald-500 text-[13px]">check_circle</span>
        <span className="text-[9px] font-black text-emerald-700 uppercase tracking-wide">{t('stats.pro.sight.ok')}</span>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {tips.pills.map((p, i) => (
        <div key={i} className="flex items-center gap-1.5 bg-[#0a3a2a]/8 border border-[#0a3a2a]/15 rounded-full px-3 py-1.5">
          <span className="material-symbols-outlined text-[#0a3a2a] text-[13px]">{p.icon}</span>
          <span className="text-[9px] font-black text-[#0a3a2a] uppercase tracking-wide">{p.label}</span>
          <span className="text-[9px] font-bold text-gray-400">· {p.sightMm}</span>
        </div>
      ))}
    </div>
  );
}

function HeatmapSection({ dots, targetType, sessionCount, heatmapLimit, setHeatmapLimit, distance }: {
  dots: any[]; targetType: string; sessionCount: number; heatmapLimit: number; setHeatmapLimit: (n: number) => void; distance: string;
}) {
  const { t } = useTranslation();
  const [showInfo, setShowInfo] = useState(false);
  const tips = useSightTips(dots, targetType, distance);

  return (
    <div className="bg-white rounded-[32px] border border-gray-100 shadow-sm p-5 relative overflow-hidden">
      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">{t('stats.pro.heatmapTitle', 'Heatmapa Rozrzutu')}</h3>
          <p className="text-[8px] font-bold text-gray-400 uppercase mt-0.5">{t('stats.pro.heatmapFrom', 'Wizualizacja z')} {sessionCount} {t('stats.pro.sessions', 'sesji')} ({dots.length} {t('stats.pro.arrowsCount', 'strzał')})</p>
          <div className="flex gap-1 mt-2.5 bg-gray-50 p-1 rounded-lg w-max border border-gray-100">
            {[5, 10, 20].map(num => (
              <button key={num} onClick={() => setHeatmapLimit(num)}
                className={`px-3 py-1 rounded-md text-[9px] font-black uppercase transition-all ${heatmapLimit === num ? 'bg-white text-emerald-600 shadow-sm border border-gray-100' : 'text-gray-400'}`}>
                {t('stats.pro.lastN', 'Ost.')} {num}
              </button>
            ))}
          </div>
        </div>
        <span className="material-symbols-outlined text-emerald-100 text-3xl">radar</span>
      </div>

      <div className="bg-gray-50 rounded-2xl overflow-hidden flex items-center justify-center border border-gray-100">
        <HeatmapTarget dots={dots} targetType={targetType} />
      </div>

      {/* SIGHT TIP + INFO BUTTON in one row */}
      <div className="mt-3 flex items-center gap-2 flex-wrap">
        <div className="flex-1"><SightTip dots={dots} targetType={targetType} distance={distance} /></div>
        <button onClick={() => setShowInfo(true)}
          className="w-7 h-7 rounded-full bg-blue-500 flex items-center justify-center active:scale-95 transition-all shrink-0 shadow-sm">
          <span className="material-symbols-outlined text-white text-[14px]">info</span>
        </button>
      </div>

      {/* INFO MODAL */}
      {showInfo && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 bg-black/40 backdrop-blur-sm"
          onClick={() => setShowInfo(false)}>
          <div className="bg-white rounded-[32px] w-full max-w-md mx-4 p-6 shadow-2xl"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-[#0a3a2a] flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-[#fed33e] text-[18px]">adjust</span>
              </div>
              <h2 className="text-[13px] font-black text-[#0a3a2a] uppercase tracking-widest">{t('stats.pro.sight.infoTitle')}</h2>
            </div>
            <p className="text-[12px] font-bold text-gray-500 leading-relaxed mb-4">{t('stats.pro.sight.infoBody')}</p>
            <div className="bg-[#0a3a2a]/5 border border-[#0a3a2a]/10 rounded-2xl p-4 mb-4">
              <p className="text-[11px] font-black text-[#0a3a2a] leading-relaxed">{t('stats.pro.sight.infoRule')}</p>
            </div>
            {tips && !tips.ok && tips.pills.length > 0 && (
              <div className="space-y-2 mb-4">
                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-2">{t('stats.pro.sight.yourCorrection')}</p>
                {tips.pills.map((p, i) => (
                  <div key={i} className="flex items-center gap-3 bg-[#0a3a2a] rounded-2xl px-4 py-3">
                    <span className="material-symbols-outlined text-[#fed33e] text-[22px]">{p.icon}</span>
                    <div className="flex-1">
                      <p className="text-[11px] font-black text-white uppercase tracking-wide">{p.label}</p>
                      <p className="text-[10px] font-bold text-white/60">{p.mag}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[18px] font-black text-[#fed33e] leading-none">{p.sightMm}</p>
                      <p className="text-[8px] font-bold text-white/40 uppercase">{t('stats.pro.sight.onSight')}</p>
                    </div>
                  </div>
                ))}
                <p className="text-[8px] font-bold text-gray-300 px-1">{t('stats.pro.sight.approxNote')}</p>
              </div>
            )}
            {tips?.ok && (
              <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-100 rounded-2xl px-4 py-3 mb-4">
                <span className="material-symbols-outlined text-emerald-500 text-[18px]">check_circle</span>
                <p className="text-[11px] font-black text-emerald-700">{t('stats.pro.sight.ok')}</p>
              </div>
            )}
            <p className="text-[9px] font-bold text-gray-300 text-center">* {t('stats.pro.sight.infoNote')}</p>
            <button onClick={() => setShowInfo(false)}
              className="w-full mt-4 py-3 bg-[#0a3a2a] text-white rounded-2xl text-[11px] font-black uppercase tracking-widest active:scale-95 transition-all">
              OK
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Full-face rings: outer radius → label
const FF_RINGS = [
  { r: 150, label: '1'  }, { r: 135, label: '2'  },
  { r: 120, label: '3'  }, { r: 105, label: '4'  },
  { r: 90,  label: '5'  }, { r: 75,  label: '6'  },
  { r: 60,  label: '7'  }, { r: 45,  label: '8'  },
  { r: 30,  label: '9'  }, { r: 15,  label: '10' },
  { r: 7.5, label: 'X'  },
];
// 3-spot rings
const SPOT_RINGS = [
  { r: 62.5, label: '6'  }, { r: 50,   label: '7'  },
  { r: 37.5, label: '8'  }, { r: 25,   label: '9'  },
  { r: 12.5, label: '10' }, { r: 6.25, label: 'X'  },
];

function MonochromeFullFace() {
  return (
    <g>
      {FF_RINGS.map((ring, i) => {
        const innerR = i + 1 < FF_RINGS.length ? FF_RINGS[i + 1].r : 0;
        const midR = (ring.r + innerR) / 2;
        const ringW = ring.r - innerR;
        const fs = Math.max(Math.min(ringW * 0.55, 9), 4);
        const fill = i % 2 === 0 ? '#f5f5f5' : '#e8e8e8';
        return (
          <g key={ring.label}>
            <circle cx="150" cy="150" r={ring.r} fill={fill} stroke="#aaa" strokeWidth="0.6" />
            {/* label at 3-o'clock and 9-o'clock */}
            <text x={150 + midR} y="150" fontSize={fs} fontWeight="bold" fill="#555" textAnchor="middle" dominantBaseline="middle">{ring.label}</text>
            <text x={150 - midR} y="150" fontSize={fs} fontWeight="bold" fill="#555" textAnchor="middle" dominantBaseline="middle">{ring.label}</text>
          </g>
        );
      })}
    </g>
  );
}

function MonochromeSpot({ cx, cy }: { cx: number; cy: number }) {
  return (
    <g>
      {SPOT_RINGS.map((ring, i) => {
        const innerR = i + 1 < SPOT_RINGS.length ? SPOT_RINGS[i + 1].r : 0;
        const midR = (ring.r + innerR) / 2;
        const ringW = ring.r - innerR;
        const fs = Math.max(Math.min(ringW * 0.55, 8), 3.5);
        const fill = i % 2 === 0 ? '#f5f5f5' : '#e8e8e8';
        return (
          <g key={`${cx}-${cy}-${ring.label}`}>
            <circle cx={cx} cy={cy} r={ring.r} fill={fill} stroke="#aaa" strokeWidth="0.5" />
            <text x={cx + midR} y={cy} fontSize={fs} fontWeight="bold" fill="#555" textAnchor="middle" dominantBaseline="middle">{ring.label}</text>
            <text x={cx - midR} y={cy} fontSize={fs} fontWeight="bold" fill="#555" textAnchor="middle" dominantBaseline="middle">{ring.label}</text>
          </g>
        );
      })}
    </g>
  );
}

function HeatmapTarget({ dots, targetType }: { dots: any[], targetType: string }) {
  const isFullFace = ['Full', 'WA 80cm', '122cm', '80cm', '60cm', '40cm'].includes(targetType);
  const is3Spot = targetType === '3-Spot' || targetType === 'Vertical 3-Spot' || targetType === '3-Spot (Vertical)';
  const vbW = 300, vbH = isFullFace ? 300 : 400;
  const heatURL = useHeatmapDataURL(dots, vbW, vbH);

  // Dispersion contour — single for full face, per-spot for spot targets
  const dispersion = useMemo(() => {
    if (dots.length < 2) return null;

    if (!isFullFace) {
      // Spot targets: group dots by nearest spot centre, build one contour per spot
      const spotCenters: [number, number][] = targetType === '3-Spot'
        ? [[75,66],[75,200],[75,333],[225,66],[225,200],[225,333]]
        : [[150,66],[150,200],[150,333]]; // Vertical 3-Spot / other single-column spot

      const groups: any[][] = spotCenters.map(() => []);
      dots.forEach(dot => {
        let minDist = Infinity, nearest = 0;
        spotCenters.forEach(([cx, cy], i) => {
          const d = (dot.x - cx) ** 2 + (dot.y - cy) ** 2;
          if (d < minDist) { minDist = d; nearest = i; }
        });
        groups[nearest].push(dot);
      });

      const spots = groups
        .map(grp => buildDispersionPath(grp))
        .filter((r): r is { mx: number; my: number; path: string } => r !== null);

      return spots.length > 0 ? { type: 'spots' as const, spots } : null;
    }

    // Full-face single contour — unchanged logic
    const single = buildDispersionPath(dots);
    return single ? { type: 'single' as const, ...single } : null;
  }, [dots, isFullFace, targetType]);

  return (
    <svg viewBox={`0 0 ${vbW} ${vbH}`} className="w-full h-auto max-h-[340px]">
      {/* MONOCHROME TARGET WITH NUMBERS */}
      {isFullFace ? (
        <MonochromeFullFace />
      ) : is3Spot && targetType === '3-Spot' ? (
        <g>
          <rect x="5"   y="0" width="140" height="400" fill="#f0f0f0" rx="8" stroke="#bbb" strokeWidth="1" />
          <rect x="155" y="0" width="140" height="400" fill="#f0f0f0" rx="8" stroke="#bbb" strokeWidth="1" />
          {[66, 200, 333].map(cy => <MonochromeSpot key={`l${cy}`} cx={75}  cy={cy} />)}
          {[66, 200, 333].map(cy => <MonochromeSpot key={`r${cy}`} cx={225} cy={cy} />)}
        </g>
      ) : (
        <g>
          <rect x="75" y="0" width="150" height="400" fill="#f0f0f0" rx="8" stroke="#bbb" strokeWidth="1" />
          {[66, 200, 333].map(cy => <MonochromeSpot key={cy} cx={150} cy={cy} />)}
        </g>
      )}

      {/* THERMAL HEATMAP — normal compositing, alpha=0 where cold so target shows through */}
      {heatURL && (
        <image href={heatURL} x="0" y="0" width={vbW} height={vbH}
          style={{ imageRendering: 'auto' }} />
      )}

      {/* DISPERSION CONTOUR — single for full face, per-spot for spot targets */}
      {dispersion?.type === 'single' && (
        <DispersionContour mx={dispersion.mx} my={dispersion.my} path={dispersion.path} />
      )}
      {dispersion?.type === 'spots' && dispersion.spots.map((s, i) => (
        <DispersionContour key={i} mx={s.mx} my={s.my} path={s.path} />
      ))}
    </svg>
  );
}

// LOGIKA WYKRESU LINIOWEGO (PROGRES)
function ProgressChart({ data }: { data: { date: string, avg: number, score: number }[] }) {
  const { t } = useTranslation();
  if (data.length < 2) return <div className="h-full flex items-center justify-center text-[10px] font-bold text-emerald-600/50 uppercase text-center px-10">{t('stats.pro.chart.tooFewData', 'Zbyt mało danych do wygenerowania krzywej')}</div>;

  const minAvg = Math.min(...data.map(d => d.avg));
  const maxAvg = Math.max(...data.map(d => d.avg));
  const padding = (maxAvg - minAvg) * 0.2 || 0.5; 
  
  const w = 300, h = 140;
  
  const points = data.map((d, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((d.avg - (minAvg - padding)) / ((maxAvg + padding) - (minAvg - padding))) * h;
    return { x, y, avg: d.avg, date: d.date, score: d.score };
  });

  const pathD = `M ${points.map(p => `${p.x},${p.y}`).join(' L ')}`;
  const areaD = `${pathD} L ${w},${h} L 0,${h} Z`;

  return (
    <svg viewBox={`-15 -15 ${w + 30} ${h + 30}`} className="w-full h-full overflow-visible">
      {[0, 0.5, 1].map(ratio => {
        const y = h * ratio;
        const val = (maxAvg + padding) - (((maxAvg + padding) - (minAvg - padding)) * ratio);
        return (
          <g key={ratio}>
            <line x1="0" y1={y} x2={w} y2={y} stroke="#ffffff" strokeOpacity="0.1" strokeWidth="1" strokeDasharray="4 4" />
            <text x="-5" y={y + 3} fontSize="8" fontWeight="bold" fill="#34d399" textAnchor="end">{val.toFixed(1)}</text>
          </g>
        );
      })}
      
      <defs>
        <linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#10b981" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaD} fill="url(#chartFill)" className="animate-fade-in" />
      
      <path d={pathD} fill="none" stroke="#10b981" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="animate-draw-line" />
      
      {points.map((p, i) => (
        <g key={i} className="group cursor-pointer relative z-10">
          <circle cx={p.x} cy={p.y} r="4" fill="#0a3a2a" stroke="#10b981" strokeWidth="2.5" className="transition-all duration-300 group-hover:r-[6px]" />
          <g className="opacity-0 group-hover:opacity-100 transition-opacity duration-200">
            <rect x={p.x - 25} y={p.y - 30} width="50" height="20" rx="4" fill="#ffffff" />
            <text x={p.x} y={p.y - 17} fontSize="8" fontWeight="black" fill="#0a3a2a" textAnchor="middle">{p.score} {t('scoringView.pts', 'pkt')}</text>
            <text x={p.x} y={p.y + 15} fontSize="7" fontWeight="bold" fill="#10b981" textAnchor="middle">{p.date}</text>
          </g>
        </g>
      ))}
      <style>{`.animate-draw-line { stroke-dasharray: 1000; stroke-dashoffset: 1000; animation: draw 1.5s ease-out forwards; } @keyframes draw { to { stroke-dashoffset: 0; } }`}</style>
    </svg>
  );
}

// LOGIKA WYKRESU SŁUPKOWEGO (Z 12 TYGODNI I NAPRAWIONYM WZROSTEM)
function VolumeBarChart({ data }: { data: { label: string, value: number }[] }) {
  if (data.length === 0) return null;
  
  const maxVal = Math.max(...data.map(d => d.value));
  const heightPercent = 70; 
  
  return (
    <div className="w-full h-full flex items-end justify-between gap-1 pb-2">
      {data.map((item, idx) => {
        const barHeight = maxVal > 0 ? (item.value / maxVal) * heightPercent : 0;
        return (
          <div key={idx} className="flex-1 flex flex-col items-center justify-end group h-full">
            <span className="text-[8px] font-black text-indigo-500 mb-1 opacity-0 group-hover:opacity-100 transition-opacity">{item.value}</span>
            <div 
              className="w-full bg-indigo-100 rounded-t-sm relative overflow-hidden transition-all duration-500 group-hover:bg-indigo-200"
              style={{ height: `${Math.max(barHeight, 2)}%` }}
            >
               <div className="absolute bottom-0 w-full h-full bg-indigo-500 opacity-80"></div>
            </div>
            <span className="text-[7px] font-bold text-gray-400 mt-1 truncate w-full text-center">{item.label}</span>
          </div>
        );
      })}
    </div>
  );
}