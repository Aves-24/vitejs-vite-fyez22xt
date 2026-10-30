import React, { useState, useEffect, useMemo } from 'react';
import { distanceKey, sessionDistanceLabel, distanceMeters } from '../config/distances';
import { db } from '../firebase';
import { collection, query, orderBy, limit, getDocs, doc, getDoc } from 'firebase/firestore';
import { useTranslation } from 'react-i18next';
import { getRecentSessions } from '../lib/recentSessions';
import ErgebniskurvePanel, { CurveSession } from './stats/ErgebniskurvePanel';
import { isPartialSession, PartialInfo } from '../utils/partialSession';

// [C31] Flaga niepełnego treningu przenoszona na punkty krzywej.
const partialOf = (s: PartialInfo): PartialInfo =>
  isPartialSession(s) ? { isPartial: true, endsShot: s.endsShot, endsPlanned: s.endsPlanned } : {};
import BiomechCard from './BiomechCard';
import ArrowStatsCard from './stats/ArrowStatsCard';
import GroupTrendCard from './stats/GroupTrendCard';
import { groupTrend } from '../utils/groupTrend';
import { computeArrowStats } from '../utils/arrowStats';
import HeatmapTarget from './HeatmapTarget';
import { calculateSpreadSessions } from '../utils/spread';
import { getScaleColor, getWeekLabelKW } from '../lib/statsChart';
import { isFullFace as isFullFaceType } from '../config/targetFaces';
import { useDistanceColors } from '../hooks/useDistanceColors';
import SummaryCard from './scoring/SummaryCard';
import OverviewSection from './stats/OverviewCards';
import { rankFromStored, rankBowOf, type RankBow } from '../utils/rankEngine';

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
  // Otwiera szczegóły sesji (zakładka DZIENNIK w StatsView)
  onOpenSession?: (sessionId: string, date: string) => void;
  // Trener w profilu ucznia FREE: zamiast przycisku zakupu sam opis (zakup należy do ucznia).
  lockedHint?: string;
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

export default function ProStatsView({ userId, isPremium, onNavigate, onOpenSession, lockedHint }: ProStatsViewProps) {
  const { t } = useTranslation();
  const [sessions, setSessions] = useState<Session[]>([]);
  // [C25] Trzyma KLUCZ kubelka (`distanceId`), nie napis z metrami.
  // Do pokazania sluzy `selectedBucket.label`.
  const [selectedDistance, setSelectedDistance] = useState<string>('');
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingAll, setIsLoadingAll] = useState(false);
  const [hasFullHistory, setHasFullHistory] = useState(false);

  // Ręczność łucznika dla wskazówek biomechaniki (lustro lewo/prawo dla LH)
  const [handedness, setHandedness] = useState<'RH' | 'LH' | null>(null);
  // [ÜBERBLICK] Łuk do krzywej handicapu — ten sam co ranga na profilu.
  const [rankBow, setRankBow] = useState<RankBow>('RECURVE');
  const [profileBowClass, setProfileBowClass] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    getDoc(doc(db, 'users', userId))
      .then(s => {
        if (!alive) return;
        setHandedness((s.data()?.handedness as 'RH' | 'LH') || null);
        const d = s.data();
        setProfileBowClass(d?.bowClass || null);
        setRankBow(rankFromStored(d).bow || rankBowOf(d?.bowClass));
      })
      .catch(() => { if (alive) setHandedness(null); });
    return () => { alive = false; };
  }, [userId]);

  useEffect(() => {
    // FREE też pobiera dane — widzi Przegląd + karty PB/720/trend. Reszta paneli
    // pod bramą PRO. Źródło współdzielone (getRecentSessions), więc 0 dodatkowych
    // odczytów Firestore względem QuickStats/StudentProfile.
    if (!userId) {
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

    // Domyślnie ładujemy tylko ostatnie 12 tygodni — wystarcza do wykresów i heatmapy.
    // Źródło współdzielone z QuickStatsModal (dedup w pamięci + cache IndexedDB).
    const fetchRecentSessions = async () => {
      try {
        const data = (await getRecentSessions(userId)) as Session[];
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
  // [C25] Kubelkiem jest `distanceId`, nie napis — dwa wpisy moga miec te same
  // metry ("18m recurve" i "18m barebow") i musza sie rozdzielic. Nazwe bierzemy
  // ze STEMPLA najnowszej sesji w kubelku, nie z listy uzytkownika: trener
  // oglada statystyki ucznia i rozwiazanie id po wlasnej liscie pokazaloby mu
  // cudze nazwy. Sesje sprzed C25 spadaja na id wyliczone z metrow.
  const distances = useMemo(() => {
    const buckets = new Map<string, { key: string; label: string; m: string; meters: number; isTech: boolean }>();
    // sessions[0] = najnowsza, wiec pierwszy wpis wygrywa i nazwa jest aktualna.
    sessions.forEach(sess => {
      const key = distanceKey(sess);
      if (buckets.has(key)) return;
      const m = sess.distance || '';
      buckets.set(key, { key, label: sessionDistanceLabel(sess), m, meters: distanceMeters(m), isTech: m === 'TECH' });
    });
    const all = Array.from(buckets.values());
    const regular = all.filter(b => !b.isTech).sort((a, b) => b.meters - a.meters);
    // [ÜBERBLICK 2026-10-30] TECH nie jest dystansem — treningi techniczne są w Überblick.
    return regular;
  }, [sessions]);

  useEffect(() => {
    if (distances.length > 0 && !selectedDistance) {
      setSelectedDistance(distances[0].key);
    }
  }, [distances, selectedDistance]);

  const selectedBucket = distances.find(b => b.key === selectedDistance);
  // [KOLORY] Kropka zestawu przy kubełku — inaczej dwa gołe „18m" są nie do odróżnienia.
  const distanceColors = useDistanceColors(userId);
  const sessionsByDistance = useMemo(() => sessions.filter(s => distanceKey(s) === selectedDistance), [sessions, selectedDistance]);

  const availableTypes = useMemo(() => {
    const types = Array.from(new Set(sessionsByDistance.map(s => s.type || 'Trening')));
    return types;
  }, [sessionsByDistance]);

  useEffect(() => { setSelectedTypes(new Set()); }, [selectedDistance]);

  const filteredSessions = useMemo(() => {
    // [C25] Filtr `isBlowgunSession` zostal STAD USUNIETY. Po wprowadzeniu
    // wlasnych dystansow byl szkodliwy: wycinal sesje z rury calkowicie, wiec
    // po wybraniu kubelka "10m dmuchawka" user widzialby pustke zamiast swoich
    // wynikow. Separacja dyscyplin idzie teraz przez DYSTANS — rura strzela na
    // 5/7/10 m i ma wlasne kubelki, wiec nic sie nie miesza ze skala lucznicza.
    // Handicap i srednia idaca w range zostaja zabezpieczone w ScoringView (b961f7e).
    if (selectedTypes.size === 0) return sessionsByDistance;
    return sessionsByDistance.filter(s => selectedTypes.has(s.type || 'Trening'));
  }, [sessionsByDistance, selectedTypes]);

  const stats = useMemo(() => {
    if (filteredSessions.length === 0) return null;
    
    let totalArrows = 0;
    let totalScoreAllTime = 0;
    let maxScore = 0;
    let maxScoreDate = '';
    let maxScoreArrows = 0;
    
    const zones = { gold: 0, red: 0, blue: 0, black: 0, white: 0, miss: 0 };
    let totalArrowsWithDetails = 0;

    const weeklyVolume = Array(12).fill(0);
    const weeklyScore = Array(12).fill(0);
    const weeklyScoreArrows = Array(12).fill(0);
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
        s.ends.forEach((end) => {
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

      const diffDays = (now - ts) / (1000 * 60 * 60 * 24);
      const weekIndex = Math.floor(diffDays / 7);
      if (weekIndex >= 0 && weekIndex < 12) {
         const idx = 11 - weekIndex;
         weeklyVolume[idx] += arrowsToCount;
         const scoreArr = (s as any).scoreArrows ?? s.arrows ?? 0;
         if (s.distance !== 'TECH' && scoreArr > 0 && (s.score || 0) > 0) {
            weeklyScore[idx] += (s.score || 0);
            weeklyScoreArrows[idx] += scoreArr;
         }
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

    // WSKAŹNIK WYTRZYMAŁOŚCI: liczony z 10 OSTATNICH sesji dystansu (z danymi
    // pasz). Każdą sesję dzielimy w połowie i porównujemy I vs II część —
    // świeższy obraz zmęczenia niż uśrednianie całej historii.
    let firstHalfScore = 0, firstHalfArrows = 0;
    let secondHalfScore = 0, secondHalfArrows = 0;
    const enduranceSessions = filteredSessions
      .filter(s => s.ends && s.ends.length > 0)
      .slice(-10);
    enduranceSessions.forEach(s => {
      const midPoint = Math.floor(s.ends!.length / 2);
      s.ends!.forEach((end: any, idx: number) => {
        const endSum = end.total_sum || 0;
        const endArrCount = end.arrows?.length || 0;
        if (idx < midPoint) { firstHalfScore += endSum; firstHalfArrows += endArrCount; }
        else { secondHalfScore += endSum; secondHalfArrows += endArrCount; }
      });
    });
    const fhAvg = firstHalfArrows > 0 ? (firstHalfScore / firstHalfArrows) : 0;
    const shAvg = secondHalfArrows > 0 ? (secondHalfScore / secondHalfArrows) : 0;
    const fatigueDrop = shAvg - fhAvg;
    const enduranceCount = enduranceSessions.length;

    const weeklyPoints = weeklyScore.map((sc, i) => weeklyScoreArrows[i] > 0 ? sc / weeklyScoreArrows[i] : 0);
    const hasVolumeData = weeklyVolume.some((v: number) => v > 0);

    return {
      totalArrows, maxScore, maxScoreDate, maxScoreArrows, chartData, allTimeAvg, recentAvg,
      formTrend, zones, totalArrowsWithDetails, fatigueDrop, fhAvg, shAvg, enduranceCount,
      weeklyVolume, weeklyPoints, hasVolumeData
    };
  }, [filteredSessions]);

  // Heatmapa: do 15 ostatnich sesji dystansu (z trafieniami), każda osobno —
  // pozwala scrubować trening po treningu lub agregować ostatnie N.
  // sessions[0] = najnowszy trening.
  const heatmapData = useMemo(() => {
    const hasDots = (s: Session) => s.ends?.some((e: any) => e.dots?.some((d: any) => d.x != null && d.y != null));
    const withDots = filteredSessions.filter(hasDots);
    const recent = withDots.slice(-15); // chronologicznie: najstarszy..najnowszy

    let targetType = 'Full';
    if (recent.length > 0) {
      const last = recent[recent.length - 1];
      targetType = selectedBucket?.meters === 18
        ? '3-Spot'
        : (last.targetType && last.targetType !== 'Full' ? last.targetType : 'Full');
    }

    // newest-first; każda sesja → jej własne kropki
    const sessions = [...recent].reverse().map(s => {
      const dots: any[] = [];
      s.ends?.forEach((e: any) => e.dots?.forEach((d: any) => { if (d.x != null && d.y != null) dots.push(d); }));
      return { id: s.id, dots, date: s.date || '', score: s.score || 0 };
    });

    return { sessions, targetType };
  }, [filteredSessions, selectedBucket]);

  // Biomechanika z 3 ostatnich treningów wybranego dystansu — stabilniejszy
  // obraz niż pojedyncza sesja. Każdą sesję centrujemy wg jej typu tarczy.
  const spread3 = useMemo(() => {
    const last3 = filteredSessions.slice(-3);
    return { result: calculateSpreadSessions(last3), count: last3.length };
  }, [filteredSessions]);

  // [KOLORY STRZAŁ] Strzały w porównaniu — tylko sesje wpisane w kolorowej kolejności.
  const arrowStats = useMemo(() => computeArrowStats(filteredSessions as any[]), [filteredSessions]);
  // [GRUPA W CZASIE] ⌀ grupy na trening (trener 2026-10-29) — utils/groupTrend.
  const groupPoints = useMemo(() => groupTrend(filteredSessions as any[]), [filteredSessions]);

  // Krzywa wyników dla wybranego dystansu (ostatnie 15 sesji z wynikiem)
  const distCurve = useMemo<CurveSession[]>(() => {
    const getTs = (s: any): number => {
      const ts = s.timestamp;
      if (!ts) return 0;
      if (typeof ts === 'number') return ts;
      if (typeof ts.toMillis === 'function') return ts.toMillis();
      if (ts.seconds) return ts.seconds * 1000;
      return 0;
    };
    return filteredSessions
      .filter(s => s.type !== 'TECHNICAL' && (s.score || 0) > 0)
      .map(s => ({
        score: s.score || 0,
        ts: getTs(s),
        date: s.date || '',
        distance: s.distance || '',
        type: s.type || 'Trening',
        title: (s as any).title || (s as any).tournamentName || '',
        ...partialOf(s as PartialInfo),
      } as CurveSession))
      .sort((a, b) => (a.ts || 0) - (b.ts || 0))
      .slice(-15);
  }, [filteredSessions]);

  // Jedna karta PRO zamiast kilku kłódek (user 2026-10-30): FREE widzi wybór
  // dystansu i sekcję „Ergebnis”; Technik, Belastung, Pfeile i Trefferbild — PRO.
  const ProLockCard = () => (
    <div className="tb-card tb-skipped border rounded-l-md rounded-r-2xl shadow-sm pl-2 pr-3 py-3 flex items-start gap-2.5">
      <span className="tb-icon w-8 h-8 rounded-lg flex items-center justify-center shrink-0">
        <span className="material-symbols-outlined text-[18px] text-[#b8860b]">diamond</span>
      </span>
      <div className="flex-1 min-w-0">
        <span className="block text-[9px] font-black uppercase tracking-widest leading-tight text-gray-500">GROT-X PRO</span>
        <p className="text-[12px] font-bold text-[#0a3a2a] leading-snug mt-0.5">{lockedHint || t('stats.pro.lockedAll')}</p>
        {!lockedHint && (
          <button onClick={() => onNavigate('SETTINGS', 'PRO')} className="mt-2 px-3 py-1.5 bg-[#0a3a2a] text-[#fed33e] rounded-lg font-black uppercase text-[9px] tracking-widest active:scale-95 transition-all inline-flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[13px]">diamond</span>
            {t('stats.pro.btnUnlock', 'Odblokuj GROT-X PRO')}
          </button>
        )}
      </div>
    </div>
  );

  // Nagłówek sekcji — jak nagłówki miesięcy w dzienniku.
  const Section = ({ icon, label }: { icon: string; label: string }) => (
    <p className="flex items-center gap-1.5 pt-2 px-1 text-[10px] font-black uppercase tracking-widest text-gray-400">
      <span className="material-symbols-outlined text-[15px] text-gray-400">{icon}</span>
      {label}
    </p>
  );

  if (isLoading) return <div className="p-10 text-center animate-pulse text-gray-400 mt-20">{t('stats.pro.loading', 'Wczytywanie...')}</div>;

  if (sessions.length === 0) return (
    <div className="flex flex-col items-center justify-center py-20 opacity-30">
      <span className="material-symbols-outlined text-6xl mb-2">auto_graph</span>
      <p className="font-black uppercase text-[10px] tracking-widest text-center">{t('stats.pro.noData', 'Brak Danych')}</p>
    </div>
  );

  return (
    <div className="animate-fade-in-up space-y-3 px-4 pb-10">

      {/* [PRO PROGRESS 2026-10-30] Jeden wybór dystansu na górze — wszystko niżej
          dotyczy tego dystansu (user: dwa poziomy filtrów myliły). Sekcje według
          pytań trenera: Technik → Ergebnis → Belastung → Pfeile → Trefferbild.
          Usunięte: przegląd wszystkich dystansów (jest w Aktuell/QuickStats),
          „Estymowany wynik 720”, druga krzywa wyników. */}
      {/* ── ÜBERBLICK (wszystkie dystanse): rytm, handicap, strzały/tydzień, tematy techniki */}
      <OverviewSection
        sessions={sessions}
        isPremium={isPremium}
        months={hasFullHistory ? 6 : 3}
        bow={rankBow}
        fallbackBowClass={profileBowClass}
        lock={null}
        sectionLabel={<Section icon="insights" label={t('stats.overview.title')} />}
      />

      {distances.length > 0 && <Section icon="filter_center_focus" label={t('stats.overview.perDistance')} />}
      {distances.length > 0 && (
        <div className="space-y-2">
          <div className="flex gap-2 overflow-x-auto hide-scrollbar pb-1">
            {distances.map(bucket => {
              const dist = bucket.key;
              const isTech = bucket.isTech;
              const on = selectedDistance === dist;
              return (
                <button key={dist} onClick={() => setSelectedDistance(dist)}
                  className={`px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest transition-all shrink-0 border flex items-center gap-1 ${
                    on ? (isTech ? 'bg-sky-500 text-white border-sky-500 shadow-md' : 'bg-[#0a3a2a] text-[#fed33e] border-[#0a3a2a] shadow-md') : 'bg-white text-gray-500 border-gray-200'
                  }`}>
                  {isTech && <span className="material-symbols-outlined text-[12px]">fitness_center</span>}
                  {distanceColors.has(dist) && <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: distanceColors.get(dist) }} />}
                  {bucket.label}
                </button>
              );
            })}
          </div>
          {availableTypes.length > 1 && (
            <div className="flex gap-1.5 overflow-x-auto hide-scrollbar pb-1">
              {availableTypes.map(type => {
                const isActive = selectedTypes.has(type);
                const typeLabel =
                  type === 'Turniej' ? t('stats.sessionInfo.tournament') :
                  type === 'Arena' ? t('stats.sessionInfo.arena') :
                  type === 'WORLD_BATTLE' ? t('stats.sessionInfo.worldBattle') :
                  type === 'TECHNICAL' ? 'TECH' :
                  t('stats.sessionInfo.typeSolo');
                return (
                  <button
                    key={type}
                    onClick={() => {
                      setSelectedTypes(prev => {
                        const next = new Set(prev);
                        if (next.has(type)) next.delete(type); else next.add(type);
                        return next;
                      });
                    }}
                    className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest transition-all shrink-0 border ${isActive ? 'bg-[#0a3a2a] text-white border-[#0a3a2a]' : 'bg-white text-gray-400 border-gray-200'}`}
                  >
                    {typeLabel}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Baner „cała historia" — tylko PRO (ładuje do 500 sesji z Firestore) */}
      {isPremium && !hasFullHistory && (
        <div className="flex items-center justify-between bg-gray-50 border border-gray-100 rounded-2xl px-3 py-2">
          <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest">{t('stats.pro.last12weeks', 'Statystyki z ostatnich 12 tyg.')}</p>
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
        (
          <>
            {/* ── TECHNIK: ⌀ grupy w czasie = główny wskaźnik postępu technicznego (trener 2026-10-29) */}
            {isPremium && (groupPoints.length > 0 || (spread3.result && spread3.count > 0)) && (
              <>
                <Section icon="adjust" label={t('stats.pro.secTechnik')} />
                <GroupTrendCard points={groupPoints} onOpenSession={onOpenSession} />
                {spread3.result && spread3.count > 0 && (
                  <BiomechCard
                    spread={spread3.result}
                    handedness={handedness}
                    onNavigate={onNavigate}
                    subtitle={t('stats.cards.bio.lastTrainings', { count: spread3.count })}
                  />
                )}
              </>
            )}

            {/* ── ERGEBNIS (też FREE): rekord, trend formy, krzywa */}
            <Section icon="trophy" label={t('stats.pro.secErgebnis')} />
            <SummaryCard icon="emoji_events" iconCls="text-[#b8860b]" stripe="tb-mark" kind={t('stats.pro.bestForm')} title={`${stats.maxScore} · ${stats.maxScoreDate}`} storageKey="pro-best">
              <div className="grid grid-cols-2 text-center pt-1">
                <div>
                  <span className="block text-[8px] font-black uppercase tracking-widest text-gray-400">{t('stats.pro.pb', 'Rekord Życiowy')}</span>
                  <span className="text-2xl font-black text-[#0a3a2a] tabular-nums leading-tight">{stats.maxScore}</span>
                  <span className="block text-[9px] font-bold text-gray-400">{stats.maxScoreArrows} {t('stats.pro.arrows', 'Strzał')} · {stats.maxScoreDate}</span>
                </div>
                <div className="border-l border-gray-100">
                  <span className="block text-[8px] font-black uppercase tracking-widest text-gray-400">{t('stats.pro.formTrend', 'Trend Formy')}</span>
                  <span className={`inline-flex items-center gap-1 text-2xl font-black tabular-nums leading-tight ${stats.formTrend >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                    <span className="material-symbols-outlined text-[18px]">{stats.formTrend >= 0 ? 'trending_up' : 'trending_down'}</span>
                    {stats.formTrend > 0 ? '+' : ''}{stats.formTrend.toFixed(2)}
                  </span>
                  <span className="block text-[9px] font-bold text-gray-400">{t('stats.pro.unitPtsArrow', 'Pkt/Strzałę')}</span>
                </div>
              </div>
            </SummaryCard>
            {distCurve.length > 0 && (
              <ErgebniskurvePanel sessions={distCurve} scopeLabel={selectedBucket?.label || ''} isPremium={isPremium} onUnlock={() => onNavigate('SETTINGS', 'PRO')} />
            )}

            {!isPremium ? <ProLockCard /> : (
            <>
              {/* ── BELASTUNG: strzały na tydzień + zmęczenie */}
              <Section icon="bar_chart" label={t('stats.pro.secBelastung')} />
              <SummaryCard icon="bar_chart" stripe="tb-d1" kind={t('stats.pro.weeklyArrowsShort', 'Strzały / tydzień (12 tyg.)')} title={t('stats.pro.totalDistArrows', 'Łącznie na tym dystansie: {{count}} strzał', { count: stats.totalArrows })} storageKey="pro-volume">
                              {stats.hasVolumeData ? (
                <div className="overflow-x-auto hide-scrollbar bg-gray-50 rounded-[28px] px-5 pb-5 pt-12 border border-gray-100">
                  <div className="flex items-end justify-between gap-1 w-full h-32 relative">
                    {stats.weeklyVolume.map((val: number, i: number) => {
                      const maxArrows = Math.max(...stats.weeklyVolume, 1);
                      const isMax = val > 0 && val === maxArrows;
                      const pts = stats.weeklyPoints[i];
                      return (
                        <div key={i} className="flex flex-col items-center justify-end gap-1 relative flex-1 h-full">
                          <div className="w-full relative flex items-end justify-center h-full">
                            {val > 0 && (
                              <span className="absolute -top-8 flex flex-col items-center leading-tight">
                                {pts > 0 && <span className="text-[8px] font-black text-emerald-600">{pts.toFixed(1)}</span>}
                                <span className={`text-[8px] font-black transition-colors ${isMax ? 'text-[#0a3a2a]' : 'text-gray-400'}`}>{val}</span>
                              </span>
                            )}
                            <div className="w-full rounded-t-sm max-w-[16px] mx-auto transition-all duration-1000" style={{ height: val > 0 ? `${(val / maxArrows) * 100}%` : '4px', backgroundColor: val > 0 ? getScaleColor(val, maxArrows) : '#e5e7eb' }}></div>
                          </div>
                          <span className="text-[6px] text-gray-300 font-bold mt-1 shrink-0">{getWeekLabelKW(i)}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="h-[120px] flex items-center justify-center opacity-40">
                   <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">{t('stats.pro.tooFewSessions', 'Zbyt mało danych. Zapisz więcej treningów.')}</span>
                </div>
              )}
              </SummaryCard>
              {stats.fhAvg > 0 && stats.shAvg > 0 && (
                <SummaryCard icon="battery_charging_full" stripe="tb-d1" kind={t('stats.pro.enduranceTitle', 'Wskaźnik Wytrzymałości')} title={t('stats.pro.enduranceSub', { count: stats.enduranceCount, defaultValue: 'Z {{count}} ostatnich sesji' })} storageKey="pro-endurance">
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
                </SummaryCard>
              )}

              {/* ── PFEILE: strzały w porównaniu (kolory) + rozkład trafień */}
              {(arrowStats || stats.totalArrowsWithDetails > 0) && <Section icon="scatter_plot" label={t('stats.pro.secPfeile')} />}
              {arrowStats && <ArrowStatsCard data={arrowStats} />}
              {stats.totalArrowsWithDetails > 0 && (
                <SummaryCard icon="track_changes" stripe="tb-d2" kind={t('stats.pro.zonesTitle', 'Rozkład Trafień')} title={`${t('stats.pro.zones.gold', 'Złote')}: ${((stats.zones.gold / stats.totalArrowsWithDetails) * 100).toFixed(0)}%`} storageKey="pro-zones">
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
                </SummaryCard>
              )}

              {/* ── TREFFERBILD: heatmapa z przewijaniem treningów */}
              {heatmapData.sessions.length > 0 && (
                <>
                  <Section icon="radar" label={t('stats.pro.secTrefferbild')} />
                  <HeatmapSection
                    sessions={heatmapData.sessions}
                    targetType={heatmapData.targetType}
                    distance={selectedBucket?.m || ''}
                    onOpenSession={onOpenSession}
                  />
                </>
              )}
            </>
            )}
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
  const isFullFace = isFullFaceType(targetType);
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

function SightTip({ tips }: { tips: ReturnType<typeof useSightTips> }) {
  const { t } = useTranslation();
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

interface HSession { id: string; dots: any[]; date: string; score: number; }

function HeatmapSection({ sessions, targetType, distance, onOpenSession }: {
  sessions: HSession[]; targetType: string; distance: string; onOpenSession?: (sessionId: string, date: string) => void;
}) {
  const { t } = useTranslation();
  const [showInfo, setShowInfo] = useState(false);
  // singleIdx !== null → pojedynczy trening; w przeciwnym razie agregat aggN.
  // sessions[0] = najnowszy → numer chipa = idx+1 (czyli "1" to najnowszy).
  const [singleIdx, setSingleIdx] = useState<number | null>(null);
  const [aggN, setAggN] = useState<number>(Math.min(10, sessions.length));
  const [playing, setPlaying] = useState(false);

  // Reset przy zmianie zbioru sesji (np. inny dystans)
  useEffect(() => {
    setSingleIdx(null);
    setAggN(Math.min(10, sessions.length));
    setPlaying(false);
  }, [sessions]);

  // PLAY: co sekundę od najstarszego (najwyższy idx) do najnowszego (idx 0).
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      setSingleIdx(prev => prev === null ? 0 : Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [playing]);

  // Zatrzymaj odtwarzanie po dojściu do najnowszego treningu (idx 0).
  useEffect(() => {
    if (playing && singleIdx === 0) setPlaying(false);
  }, [playing, singleIdx]);

  const startPlay = () => {
    if (sessions.length < 2) return;
    setSingleIdx(sessions.length - 1); // start od najstarszego
    setPlaying(true);
  };

  const activeDots = singleIdx !== null
    ? (sessions[singleIdx]?.dots ?? [])
    : sessions.slice(0, aggN).flatMap(s => s.dots);

  const tips = useSightTips(activeDots, targetType, distance);

  const subtitle = singleIdx !== null
    ? `${t('stats.pro.training', 'Trening')} #${singleIdx + 1}${sessions[singleIdx]?.date ? ` • ${sessions[singleIdx].date}` : ''} • ${sessions[singleIdx]?.dots.length ?? 0} ${t('stats.pro.arrowsCount', 'strzał')}`
    : `${Math.min(aggN, sessions.length)} ${t('stats.pro.sessions', 'sesji')} • ${activeDots.length} ${t('stats.pro.arrowsCount', 'strzał')}`;

  return (
    // Styl kart dziennika (PRO Progress 2026-10-30), zwijana.
    <SummaryCard icon="radar" iconCls="text-orange-500" stripe="tb-d3" kind={t('stats.pro.heatmapTitle', 'Heatmapa Rozrzutu')} title={subtitle} storageKey="pro-heatmap">

      {/* STEROWNIK: agregaty + play + numerowany scrubber treningów */}
      <div className="flex items-center gap-1.5 mb-2 flex-wrap">
        <div className="flex gap-1 bg-gray-50 p-1 rounded-lg border border-gray-100">
          {[3, 10].map(num => {
            const active = singleIdx === null && aggN === num;
            return (
              <button key={num} onClick={() => { setPlaying(false); setSingleIdx(null); setAggN(num); }}
                className={`px-2.5 py-1 rounded-md text-[9px] font-black uppercase transition-all ${active ? 'bg-white text-emerald-600 shadow-sm border border-gray-100' : 'text-gray-400'}`}>
                {t('stats.pro.lastN', 'Ost.')} {num}
              </button>
            );
          })}
        </div>
        {sessions.length >= 2 && (
          <button onClick={() => playing ? setPlaying(false) : startPlay()}
            className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-all active:scale-90 ${playing ? 'bg-red-500 text-white' : 'bg-[#0a3a2a] text-[#fed33e]'}`}>
            <span className="material-symbols-outlined text-[16px]">{playing ? 'pause' : 'play_arrow'}</span>
          </button>
        )}
        {/* ODNOŚNIK DO SESJI — widoczny po wybraniu pojedynczego treningu */}
        {singleIdx !== null && onOpenSession && sessions[singleIdx] && (
          <button
            onClick={() => onOpenSession(sessions[singleIdx].id, sessions[singleIdx].date)}
            className="ml-auto flex items-center gap-1.5 bg-emerald-500 text-white pl-3 pr-2.5 py-1.5 rounded-lg shadow-sm active:scale-95 transition-all shrink-0 animate-fade-in"
          >
            <span className="text-[9px] font-black uppercase tracking-widest">{t('stats.pro.openSession', 'Zobacz sesję')}</span>
            <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
          </button>
        )}
      </div>

      {/* NUMEROWANY SCRUBBER — 1 = najnowszy trening */}
      <div className="flex gap-1 overflow-x-auto hide-scrollbar mb-3 pb-1">
        {sessions.map((s, idx) => {
          const active = singleIdx === idx;
          return (
            <button key={idx} onClick={() => { setPlaying(false); setSingleIdx(idx); }}
              title={s.date}
              className={`w-6 h-6 rounded-md text-[9px] font-black shrink-0 transition-all flex items-center justify-center ${active ? 'bg-emerald-500 text-white shadow-sm scale-110' : 'bg-gray-50 text-gray-400 border border-gray-100'}`}>
              {idx + 1}
            </button>
          );
        })}
      </div>

      <div className="bg-gray-50 rounded-2xl overflow-hidden flex items-center justify-center border border-gray-100">
        <HeatmapTarget dots={activeDots} targetType={targetType} />
      </div>

      {/* SIGHT TIP + INFO BUTTON in one row */}
      <div className="mt-3 flex items-center gap-2 flex-wrap">
        <div className="flex-1"><SightTip tips={tips} /></div>
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
    </SummaryCard>
  );
}

// Full-face rings: outer radius → label


