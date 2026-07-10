import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom'; 
import { db } from '../firebase';
import { collection, query, where, orderBy, limit, onSnapshot, doc, getDoc, getDocs, Timestamp, updateDoc, arrayUnion, deleteDoc } from 'firebase/firestore';
import { QRCodeCanvas } from 'qrcode.react';
import { useTranslation } from 'react-i18next';
import QuickStatsModal from '../components/QuickStatsModal';
import NotificationBell from '../components/NotificationBell';
import { calculateRank, TARGET_RANKS } from '../utils/rankEngine';
import { getHandicapBand, HANDICAP_BANDS } from '../utils/handicapEngine';
import { createNotification } from '../services/notificationService';
import { buildAnnouncementNotification } from '../utils/notificationTypes';

// ─────────────────────────────────────────────────────────────────────────────
// CACHE HELPER
// ─────────────────────────────────────────────────────────────────────────────
const CACHE_TTL = {
  PROFILE:       120 * 60 * 1000, // 2h — profil zmienia się rzadko
  STATS:         120 * 60 * 1000, // 2h — i tak czyszczone po nowym treningu
  TOURNAMENTS:    10 * 60 * 1000, // 10 min
  LAST_SESSION:   60 * 60 * 1000, // 1h — i tak czyszczone po nowym treningu
  ANNOUNCEMENTS:  30 * 60 * 1000, // 30 min
  TODOS:        24 * 60 * 60 * 1000, // 24h — inwalidowane ręcznie z CalendarView
};

function cacheGet<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const { data, expiresAt } = JSON.parse(raw);
    if (Date.now() > expiresAt) { localStorage.removeItem(key); return null; }
    return data as T;
  } catch { return null; }
}

function cacheSet(key: string, data: unknown, ttl: number): void {
  try {
    localStorage.setItem(key, JSON.stringify({ data, expiresAt: Date.now() + ttl }));
  } catch { /* ignore */ }
}
// ─────────────────────────────────────────────────────────────────────────────

interface HomeViewProps {
  userId: string;
  isCoach: boolean;
  onNewSession: () => void;
  onGoToCalendar: (eventId?: string) => void; 
  onGoToStats?: (date?: string) => void; 
  onGoToBattles?: () => void;
  onJoinBattle?: (battleId: string, distance: string, targetType: string) => void; 
  onNavigate?: (view: string, tab?: string, extraData?: string) => void;
}

export default function HomeView({ userId, isCoach, onGoToCalendar, onGoToStats, onGoToBattles, onJoinBattle, onNavigate, onNewSession }: HomeViewProps) {
  const { t, i18n } = useTranslation();
  const [nextTournament, setNextTournament] = useState<any | null>(null);
  const [nextOtherEvent, setNextOtherEvent] = useState<any | null>(null);
  const [nextTrainerSent, setNextTrainerSent] = useState<any | null>(null);
  const [nextTrainerReceived, setNextTrainerReceived] = useState<any | null>(null);
  const [todoItems, setTodoItems] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [realLastSession, setRealLastSession] = useState<any | null>(null);
  
  const [dailyTotal, setDailyTotal] = useState<number>(0);
  const [monthlyTotal, setMonthlyTotal] = useState<number>(0);
  const [prevMonthlyTotal, setPrevMonthlyTotal] = useState<number>(0);
  const [yearlyTotal, setYearlyTotal] = useState<number>(0);
  const [avg14Days, setAvg14Days] = useState<string>('0.0');
  // Średnie strzałów i punktów (na sesję) — z 3 ostatnich sesji oraz z miesiąca.
  // Liczone z sesji z wynikiem (trening/turniej), bez technicznych.
  const [avgArrows3, setAvgArrows3] = useState<number>(0);
  const [avgPoints3, setAvgPoints3] = useState<number>(0);
  const [avgArrowsMonth, setAvgArrowsMonth] = useState<number>(0);
  const [avgPointsMonth, setAvgPointsMonth] = useState<number>(0);
  const [recentScores, setRecentScores] = useState<number[]>([]);
  const [recentSessions, setRecentSessions] = useState<{ score: number; date: string; distance: string; type: string; ts: number }[]>([]);
  // Słupki 12-tygodniowe dla QuickStats — liczone z tego samego rocznego
  // snapshotu co liczniki, dzięki czemu modal nie robi już osobnego odczytu.
  const [weeklyArrows, setWeeklyArrows] = useState<number[]>(Array(12).fill(0));
  const [weeklyPoints, setWeeklyPoints] = useState<number[]>(Array(12).fill(0));
  const [weeklyPointsByDist, setWeeklyPointsByDist] = useState<Record<string, number[]>>({});
  const [avgByDist, setAvgByDist] = useState<Record<string, { avgArrows3: number; avgPoints3: number; avgArrowsMonth: number; avgPointsMonth: number }>>({});
  const [weeklySessionAvg, setWeeklySessionAvg] = useState<number[]>(Array(12).fill(0));
  const [weeklySessionAvgByDist, setWeeklySessionAvgByDist] = useState<Record<string, number[]>>({});
  const [showTrendModal, setShowTrendModal] = useState(false);
  const [trendFilterType, setTrendFilterType] = useState('');
  const [trendFilterDist, setTrendFilterDist] = useState('');
  const [weekStreak, setWeekStreak] = useState<number>(0);
  
  const [firstName, setFirstName] = useState('');
  const [userClub, setUserClub] = useState(''); 
  const [aiAdvice, setAiAdvice] = useState('');
  const [showQR, setShowQR] = useState(false);
  
  const [isQuickStatsOpen, setIsQuickStatsOpen] = useState(false);
  const [quickStatsInitialTab, setQuickStatsInitialTab] = useState<'ARROWS' | 'POINTS'>('ARROWS');
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const MAX_DAILY_REFRESHES = 2;
  const getRefreshData = () => {
    try {
      const raw = localStorage.getItem(`grotX_refreshLimit_${userId}`);
      if (!raw) return { count: 0, date: '' };
      return JSON.parse(raw) as { count: number; date: string };
    } catch { return { count: 0, date: '' }; }
  };
  const todayStr = new Date().toISOString().slice(0, 10);
  const refreshData = getRefreshData();
  const refreshesLeft = refreshData.date === todayStr
    ? Math.max(0, MAX_DAILY_REFRESHES - refreshData.count)
    : MAX_DAILY_REFRESHES;
  
  const [activeInvite, setActiveInvite] = useState<any | null>(null);
  const [activeClubBattles, setActiveClubBattles] = useState<any[]>([]); 
  const [isClubBattlesModalOpen, setIsClubBattlesModalOpen] = useState(false); 
  
  const [manualBattleCode, setManualBattleCode] = useState('');
  const [isJoiningByCode, setIsJoiningByCode] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const [battleToDelete, setBattleToDelete] = useState<string | null>(null);

  const [currentTime, setCurrentTime] = useState(Date.now());

  const [isPremium, setIsPremium] = useState(false);
  const [rawIsPremium, setRawIsPremium] = useState(false);
  const [trialEndsAt, setTrialEndsAt] = useState<number | null>(null);

  // THE TARGET SERIES — ranga użytkownika
  const [userLevel, setUserLevel] = useState(1);
  const [userRankName, setUserRankName] = useState('WHITE I');
  const [userRankColor, setUserRankColor] = useState('#F0F0F0');
  const [userRankBorder, setUserRankBorder] = useState('#cccccc');
  const [userRankTextColor, setUserRankTextColor] = useState('#555555');
  const [userXp, setUserXp] = useState(0);
  const [userRollingAvg, setUserRollingAvg] = useState(0);
  const [userLast10Avgs, setUserLast10Avgs] = useState<number[]>([]);
  const [rankProgress, setRankProgress] = useState(0);
  const [xpToNext, setXpToNext] = useState(0);
  const [nextRankName, setNextRankName] = useState<string | null>(null);
  const [nextRankMinAvg, setNextRankMinAvg] = useState<number | null>(null);
  const [isRankInfoOpen, setIsRankInfoOpen] = useState(false);
  const [userHandicap, setUserHandicap] = useState<number | null>(null);

  // [FIX] Ref do śledzenia mount state + timera toast, żeby nie robić setState
  // na odmontowanym komponencie (React 17 ostrzega, React 18 cicho ignoruje).
  const isMountedRef = useRef(true);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => {
      if (isMountedRef.current) setToastMessage(null);
    }, 3500);
  };

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);

  const getDaysUntil = (dateStr: string) => {
    const target = new Date(dateStr);
    const now = new Date();
    const diff = target.getTime() - now.getTime();
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
    if (days <= 0) return t('home.today');
    if (days === 1) return t('home.tomorrow');
    return t('home.inDays', { count: days });
  };

  const getSafeTime = (val: any) => {
    if (!val) return 0;
    if (typeof val.toMillis === 'function') return val.toMillis();
    if (val.seconds) return val.seconds * 1000;
    return new Date(val).getTime() || 0;
  };

  const getRemainingTime = (expiresAtStr?: any, createdAtStr?: any) => {
    const now = Date.now();
    let diff = 0;
    
    if (expiresAtStr) {
      diff = getSafeTime(expiresAtStr) - now;
    } else if (createdAtStr) {
      const expiresAt = getSafeTime(createdAtStr) + (30 * 60 * 1000); 
      diff = expiresAt - now;
    }

    if (diff <= 0) return t('home.arenaFinished');
    
    const h = Math.floor(diff / (1000 * 60 * 60));
    const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    if (h > 0) return `${h}h ${m}m`;
    return `${m} min`;
  };

  const getFriendlyTargetName = (type: string) => {
    if (type === 'Full') return '122cm';
    if (type === 'WA 80cm') return '80cm';
    if (type === '40cm') return '40cm'; 
    if (type === '3-Spot') return '3-Spot';
    return type || '';
  };

  const initiateDeleteBattle = (e: React.MouseEvent, battleId: string) => {
    e.stopPropagation(); 
    setBattleToDelete(battleId);
  };

  const confirmDeleteBattle = async () => {
    if (!battleToDelete) return;
    try {
      await deleteDoc(doc(db, 'battles', battleToDelete));
      showToast(t('home.arenaDeleted', 'Arena została usunięta.'));
    } catch (error) {
      console.error("Błąd podczas usuwania areny:", error);
      showToast(t('home.arenaDeleteError', 'Błąd podczas usuwania.'));
    } finally {
      setBattleToDelete(null);
    }
  };

  useEffect(() => {
    // [FIX memory leak] Flaga `cancelled` ustawiana przez cleanup function.
    // Gdy komponent się rozmontuje (np. po wylogowaniu, re-auth, nav)
    // przed zakończeniem asynchronicznego getDoc — nie wołamy setState.
    let cancelled = false;

    const fetchProfile = async () => {
      if (!userId) return;

      const cacheKey = `grotX_profile_${userId}`;

      // isPremium NIE jest cachowane — zawsze świeże z Firestore SDK (IndexedDB)
      const snap = await getDoc(doc(db, 'users', userId));
      if (cancelled) return;

      if (snap.exists()) {
        const d = snap.data();
        const cName = d.clubName || '';
        const cCity = d.clubCity || '';
        const parts = [];
        if (d.showClub !== false && cName) parts.push(cName);
        if (d.showRegion !== false && cCity) parts.push(cCity);
        const fullClubName = parts.length > 0 ? parts.join(' - ') : t('battleLobby.unaffiliated');

        const boughtPro = d.isPremium || false;
        const promoPro = d.isPremiumPromo || false;
        let trialEndTimestamp: number | null = null;
        if (d.trialEndsAt) {
          trialEndTimestamp = new Date(d.trialEndsAt).getTime();
          setTrialEndsAt(trialEndTimestamp);
        }
        const isTrialActive = trialEndTimestamp ? trialEndTimestamp > Date.now() : false;
        const computedIsPremium = boughtPro || promoPro || isTrialActive;

        setFirstName(d.firstName || '');
        setUserClub(fullClubName);
        setAiAdvice(d.lastCoachAdvice || t('home.aiPlaceholder'));
        setRawIsPremium(boughtPro);
        setIsPremium(computedIsPremium);

        // THE TARGET SERIES — wczytaj dane rangi
        const storedXp = d.xp || 0;
        const storedLast10: number[] = d.last10Avgs || [];
        const rankResult = calculateRank(storedXp, storedLast10);
        setUserXp(storedXp);
        setUserLevel(rankResult.level);
        setUserRankName(rankResult.rankName);
        setUserRankColor(rankResult.color);
        setUserRankBorder(rankResult.border);
        setUserRankTextColor(rankResult.textColor);
        setUserRollingAvg(rankResult.rollingAvg);
        setUserLast10Avgs(storedLast10);
        setRankProgress(rankResult.progress);
        setXpToNext(rankResult.xpToNext);
        setNextRankName(rankResult.nextRankName);
        setNextRankMinAvg(rankResult.nextRankMinAvg);

        // HANDICAP
        if (typeof d.currentHandicap === 'number') {
          setUserHandicap(d.currentHandicap);
        }

        // Cachujemy TYLKO dane kosmetyczne (imię, klub, porada AI) — BEZ statusu PRO
        cacheSet(cacheKey, {
          firstName: d.firstName || '',
          userClub: fullClubName,
          aiAdvice: d.lastCoachAdvice || '',
        }, CACHE_TTL.PROFILE);
      }
    };
    fetchProfile();

    return () => {
      cancelled = true;
    };
  }, [userId, t]);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    const fetchTournaments = async () => {
      const cacheKey = `grotX_tournaments_${userId}`;
      const cached = cacheGet<any[]>(cacheKey);

      if (cached) {
        if (cancelled) return;
        setNextTournament(cached.find((e: any) => e.category === 'Turniej' || !e.category) || null);
        setNextOtherEvent(cached.find((e: any) => e.category === 'Inne') || null);
        setNextTrainerSent(cached.find((e: any) => e.category === 'Trener' && !e.isMirrored) || null);
        setNextTrainerReceived(cached.find((e: any) => e.category === 'Trener' && e.isMirrored) || null);
        setIsLoading(false);
        return;
      }

      const today = new Date().toISOString().split('T')[0];
      const q = query(
        collection(db, `users/${userId}/tournaments`),
        where('date', '>=', today),
        orderBy('date', 'asc')
      );
      const snap = await getDocs(q);
      if (cancelled) return;
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));

      setNextTournament(all.find((e: any) => e.category === 'Turniej' || !e.category) || null);
      setNextOtherEvent(all.find((e: any) => e.category === 'Inne') || null);
      setNextTrainerSent(all.find((e: any) => e.category === 'Trener' && !e.isMirrored) || null);
      setNextTrainerReceived(all.find((e: any) => e.category === 'Trener' && e.isMirrored) || null);
      setIsLoading(false);

      cacheSet(cacheKey, all, CACHE_TTL.TOURNAMENTS);
    };

    fetchTournaments();
    return () => { cancelled = true; };
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    const cacheKey = `grotX_todos_${userId}`;
    const cached = cacheGet<any[]>(cacheKey);
    if (cached) { setTodoItems(cached); return; }
    getDocs(query(collection(db, `users/${userId}/tournaments`), where('todo', '==', true)))
      .then(snap => {
        if (cancelled) return;
        const todos = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setTodoItems(todos);
        cacheSet(cacheKey, todos, CACHE_TTL.TODOS);
      });
    return () => { cancelled = true; };
  }, [userId]);


  useEffect(() => {
    if (!userId) return;
    const qBattle = query(
      collection(db, 'battles'),
      where('participants', 'array-contains', userId),
      where('status', 'in', ['LOBBY', 'ACTIVE', 'START']) 
    );
    const unsubscribeBattle = onSnapshot(qBattle, (snap) => {
      const now = Date.now();
      if (!snap.empty) {
        const docFound = snap.docs.find(d => {
          const data = d.data();
          if (data.mode === 'CLUB' && data.hostId === userId) return false; 
          
          const isExpired = data.expiresAt 
            ? getSafeTime(data.expiresAt) < now 
            : (now - getSafeTime(data.createdAt)) > 30 * 60 * 1000;

          return !isExpired;
        });

        if (docFound) {
          const bData = docFound.data();
          const bId = docFound.id;
          setActiveInvite({ id: bId, ...bData });
          setShowQR(false); 
        } else {
          setActiveInvite(null);
        }
      } else {
        setActiveInvite(null);
      }
    });
    return () => unsubscribeBattle();
  }, [userId]);

  useEffect(() => {
    if (!userClub) return;
    const qClub = query(collection(db, 'battles'), where('hostClub', '==', userClub), where('status', 'in', ['LOBBY', 'ACTIVE', 'START']));
    const unsubscribeClub = onSnapshot(qClub, (snap) => {
      const now = Date.now();
      const clubBattles = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter((b: any) => {
          if (b.mode !== 'CLUB') return false;
          
          const isExpired = b.expiresAt 
            ? getSafeTime(b.expiresAt) < now
            : (now - getSafeTime(b.createdAt)) > 3 * 60 * 60 * 1000;
            
          return !isExpired;
        });
      
      setActiveClubBattles(clubBattles);
    });
    return () => unsubscribeClub();
  }, [userClub]);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    const fetchLastSession = async () => {
      const cacheKey = `grotX_lastSession_${userId}`;
      const cached = cacheGet<any>(cacheKey);
      if (cached) {
        if (!cancelled) setRealLastSession(cached);
      } else {
        try {
          const snap = await getDocs(
            query(collection(db, `users/${userId}/sessions`), orderBy('timestamp', 'desc'), limit(1))
          );
          if (cancelled) return;
          if (!snap.empty) {
            const sessionData = snap.docs[0].data();
            setRealLastSession(sessionData);
            cacheSet(cacheKey, sessionData, CACHE_TTL.LAST_SESSION);
          }
        } catch (e) {
          console.error("Błąd przy pobieraniu ostatniej sesji: ", e);
        }
      }
    };
    fetchLastSession();
    return () => { cancelled = true; };
  }, [userId, refreshNonce]);

  // ─── STABILNE STATYSTYKI Z CACHE'EM (JEDNO ZAPYTANIE) ──────────────────
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    const fetchAggr = async () => {
      const cacheKey = `grotX_stats_v12_${userId}`;
      const cached = cacheGet<any>(cacheKey);

      if (cached) {
        if (cached.daily != null) setDailyTotal(cached.daily);
        setMonthlyTotal(cached.monthly);
        if (cached.prevMonthly != null) setPrevMonthlyTotal(cached.prevMonthly);
        setYearlyTotal(cached.yearly);
        setAvg14Days(cached.avg14);
        if (cached.avgArrows3 != null) setAvgArrows3(cached.avgArrows3);
        if (cached.avgPoints3 != null) setAvgPoints3(cached.avgPoints3);
        if (cached.avgArrowsMonth != null) setAvgArrowsMonth(cached.avgArrowsMonth);
        if (cached.avgPointsMonth != null) setAvgPointsMonth(cached.avgPointsMonth);
        if (cached.recentScores) setRecentScores(cached.recentScores);
        if (cached.recentSessions) setRecentSessions(cached.recentSessions);
        if (cached.weeklyArrows) setWeeklyArrows(cached.weeklyArrows);
        if (cached.weeklyPoints) setWeeklyPoints(cached.weeklyPoints);
        if (cached.weeklyPointsByDist) setWeeklyPointsByDist(cached.weeklyPointsByDist);
        if (cached.avgByDist) setAvgByDist(cached.avgByDist);
        if (cached.weeklySessionAvg) setWeeklySessionAvg(cached.weeklySessionAvg);
        if (cached.weeklySessionAvgByDist) setWeeklySessionAvgByDist(cached.weeklySessionAvgByDist);
        if (cached.weekStreak !== undefined) setWeekStreak(cached.weekStreak);
        return;
      }

      const now = new Date();
      const startOfDay   = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
      const startOfPrevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime();
      const startOfYear  = new Date(now.getFullYear(), 0, 1);
      const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

      const sessionsRef = collection(db, `users/${userId}/sessions`);

      try {
        // Jedno zapytanie — cache 30 min, działa też offline. Pobieramy od
        // wcześniejszej z dwóch granic: początek roku (liczniki) lub 12 tyg.
        // wstecz (słupki QuickStats), by w styczniu nie zgubić grudnia.
        const startOfYearMs = startOfYear.getTime();
        const twelveWeeksAgoMs = now.getTime() - 84 * 24 * 60 * 60 * 1000;
        const fetchFromMs = Math.min(startOfYearMs, twelveWeeksAgoMs);
        const snapYear = await getDocs(query(sessionsRef, where('timestamp', '>=', Timestamp.fromDate(new Date(fetchFromMs)))));
        if (cancelled) return;

        let d = 0, m = 0, pm = 0, y = 0, s14 = 0, a14 = 0;
        // Miesiąc — sumy na sesję (tylko sesje z wynikiem, bez technicznych)
        let monthCount = 0, monthArrows = 0, monthScore = 0;

        // Słupki 12-tygodniowe (rolling) — to samo okno co dawniej w QuickStats.
        const weekArrows = Array(12).fill(0);
        const weekScore = Array(12).fill(0);
        const weekScoreArrows = Array(12).fill(0);
        const weekSessions = Array(12).fill(0);
        // Per dystans (chipy w zakładce Ringe & Präzision)
        const weekScoreByDist: Record<string, number[]> = {};
        const weekScoreArrowsByDist: Record<string, number[]> = {};
        const weekSessionsByDist: Record<string, number[]> = {};

        snapYear.forEach(docSnap => {
          const data = docSnap.data();
          const arr = data.arrows || data.totalArrows || 0; // total (session + practice) — do liczników
          const scoreArr = data.scoreArrows || data.arrows || 0; // tylko strzały z punktacją — do średniej
          const sc  = data.score  || 0;
          const ts  = getSafeTime(data.timestamp);
          const isTechnical = data.type === 'TECHNICAL';

          // Strażnik: snapshot może sięgać poprzedniego roku (rolling 12 tyg.),
          // więc roczny licznik liczymy tylko od początku bieżącego roku.
          if (ts >= startOfYearMs) y += arr;
          // Nowy model: arrows = sessionArrows + practiceArrows (już zsumowane)
          // Stary model: arrows = non-M, practiceArrows osobno
          const sessionTotal = data.scoreArrows !== undefined
            ? arr
            : arr + (data.practiceArrows || 0);
          if (ts >= startOfDay) d += sessionTotal;
          if (ts >= startOfMonth) m += arr;
          else if (ts >= startOfPrevMonth) pm += arr;
          if (ts >= fourteenDaysAgo.getTime() && !isTechnical) { a14 += scoreArr; s14 += sc; }
          if (ts >= startOfMonth && !isTechnical && sc > 0) { monthCount++; monthArrows += arr; monthScore += sc; }

          const diffWeeks = Math.floor(Math.max(0, now.getTime() - ts) / (1000 * 60 * 60 * 24 * 7));
          if (diffWeeks < 12) {
            const idx = 11 - diffWeeks;
            weekArrows[idx] += arr;
            if (!isTechnical && scoreArr > 0 && sc > 0) {
              weekScore[idx] += sc; weekScoreArrows[idx] += scoreArr; weekSessions[idx]++;
              const dist = data.distance || '';
              if (dist && dist !== 'TECH') {
                if (!weekScoreByDist[dist]) { weekScoreByDist[dist] = Array(12).fill(0); weekScoreArrowsByDist[dist] = Array(12).fill(0); weekSessionsByDist[dist] = Array(12).fill(0); }
                weekScoreByDist[dist][idx] += sc; weekScoreArrowsByDist[dist][idx] += scoreArr; weekSessionsByDist[dist][idx]++;
              }
            }
          }
        });

        const weekPoints = weekScore.map((sc, i) => weekScoreArrows[i] > 0 ? sc / weekScoreArrows[i] : 0);
        // Ø ringów na trening w tygodniu (druga linia nad słupkiem)
        const weekSessionAvg = weekScore.map((sc, i) => weekSessions[i] > 0 ? Math.round(sc / weekSessions[i]) : 0);
        const weekPointsByDist: Record<string, number[]> = {};
        const weekSessionAvgByDist: Record<string, number[]> = {};
        Object.keys(weekScoreByDist).forEach(dist => {
          weekPointsByDist[dist] = weekScoreByDist[dist].map((sc, i) => weekScoreArrowsByDist[dist][i] > 0 ? sc / weekScoreArrowsByDist[dist][i] : 0);
          weekSessionAvgByDist[dist] = weekScoreByDist[dist].map((sc, i) => weekSessionsByDist[dist][i] > 0 ? Math.round(sc / weekSessionsByDist[dist][i]) : 0);
        });

        // Pfeilzähler: strzały zapisane na profilu (nie tworzą sesji)
        const profileSnap = await getDoc(doc(db, 'users', userId));
        if (!cancelled && profileSnap.exists()) {
          const pz = profileSnap.data().pfeilzaehler || {};
          const yearStr = String(now.getFullYear());
          const monthPrefix = `${yearStr}_${String(now.getMonth() + 1).padStart(2, '0')}`;
          const dayKey = `${monthPrefix}_${String(now.getDate()).padStart(2, '0')}`;
          const prevMonthNum = now.getMonth() === 0 ? 12 : now.getMonth();
          const prevYearStr = now.getMonth() === 0 ? String(now.getFullYear() - 1) : yearStr;
          const prevMonthPrefix = `${prevYearStr}_${String(prevMonthNum).padStart(2, '0')}`;
          Object.entries(pz).forEach(([key, val]) => {
            if (key.startsWith(yearStr)) {
              y += (val as number);
              if (key.startsWith(monthPrefix)) m += (val as number);
              if (key === dayKey) d += (val as number);
            }
            if (key.startsWith(prevMonthPrefix)) pm += (val as number);
            // Klucze dzienne (YYYY_MM_DD) doliczamy też do słupków 12-tyg.,
            // żeby wykres zgadzał się z licznikami Tag/Monat/Jahr powyżej.
            const parts = key.split('_');
            if (parts.length === 3) {
              const pzTs = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])).getTime();
              const pzWeeks = Math.floor(Math.max(0, now.getTime() - pzTs) / (1000 * 60 * 60 * 24 * 7));
              if (pzWeeks < 12) weekArrows[11 - pzWeeks] += (Number(val) || 0);
            }
          });
        }

        const avg14 = a14 > 0 ? (s14 / a14).toFixed(1) : '0.0';
        const avgArrowsM = monthCount > 0 ? Math.round(monthArrows / monthCount) : 0;
        const avgPointsM = monthCount > 0 ? Math.round(monthScore / monthCount) : 0;

        // ─── SPARKLINE: ostatnie 6 sesji z wynikiem > 0 ──────────────────────
        const sessionList = snapYear.docs
          .map(d => {
            const dd = d.data();
            return { score: dd.score || 0, arrows: dd.arrows || dd.totalArrows || 0, ts: getSafeTime(dd.timestamp), date: dd.date || '', distance: dd.distance || '', type: dd.type || 'Trening', title: dd.title || dd.tournamentName || '' };
          })
          .filter(s => s.score > 0)
          .sort((a, b) => a.ts - b.ts);
        const recent = sessionList.slice(-6).map(s => s.score);
        const recentFull = sessionList.slice(-10);

        // ─── ŚREDNIE z 3 ostatnich sesji (trening/turniej, bez TECH) ──
        const last3NonTech = sessionList.filter(s => s.type !== 'TECHNICAL').slice(-3);
        const avgArrows3v = last3NonTech.length
          ? Math.round(last3NonTech.reduce((acc, s) => acc + s.arrows, 0) / last3NonTech.length)
          : 0;
        const avgPoints3v = last3NonTech.length
          ? Math.round(last3NonTech.reduce((acc, s) => acc + s.score, 0) / last3NonTech.length)
          : 0;

        // ─── ŚREDNIE PER DYSTANS (karty w zakładce Ringe & Präzision) ──
        // Ta sama logika co globalna, ale grupowana po dystansie.
        const avgByDist: Record<string, { avgArrows3: number; avgPoints3: number; avgArrowsMonth: number; avgPointsMonth: number }> = {};
        const nonTechScored = sessionList.filter(s => s.type !== 'TECHNICAL' && s.distance && s.distance !== 'TECH');
        const meanRound = (arr: typeof nonTechScored, key: 'arrows' | 'score') =>
          arr.length ? Math.round(arr.reduce((acc, s) => acc + (s[key] || 0), 0) / arr.length) : 0;
        Array.from(new Set(nonTechScored.map(s => s.distance))).forEach(dist => {
          const ds = nonTechScored.filter(s => s.distance === dist);
          const l3 = ds.slice(-3);
          const mo = ds.filter(s => s.ts >= startOfMonth);
          avgByDist[dist] = {
            avgArrows3: meanRound(l3, 'arrows'),
            avgPoints3: meanRound(l3, 'score'),
            avgArrowsMonth: meanRound(mo, 'arrows'),
            avgPointsMonth: meanRound(mo, 'score'),
          };
        });

        // ─── STREAK TYGODNIOWY: ile tygodni z rzędu (min. 1 sesja/tydzień) ──
        const getWeekStart = (ts: number) => {
          const d = new Date(ts);
          const day = d.getDay() || 7;
          const mon = new Date(d);
          mon.setDate(d.getDate() - day + 1);
          mon.setHours(0, 0, 0, 0);
          return mon.getTime();
        };
        const weekSet = new Set<number>();
        snapYear.docs.forEach(docSnap => weekSet.add(getWeekStart(getSafeTime(docSnap.data().timestamp))));

        const nowWeek = getWeekStart(Date.now());
        // Jeśli w tym tygodniu jeszcze nie trenował, zaczynamy od poprzedniego (grace period)
        const startWeek = weekSet.has(nowWeek) ? nowWeek : nowWeek - 7 * 24 * 60 * 60 * 1000;
        let streak = 0;
        let checkWeek = startWeek;
        while (weekSet.has(checkWeek)) {
          streak++;
          checkWeek -= 7 * 24 * 60 * 60 * 1000;
        }

        setDailyTotal(d);
        setMonthlyTotal(m);
        setPrevMonthlyTotal(pm);
        setYearlyTotal(y);
        setAvg14Days(avg14);
        setAvgArrows3(avgArrows3v);
        setAvgPoints3(avgPoints3v);
        setAvgArrowsMonth(avgArrowsM);
        setAvgPointsMonth(avgPointsM);
        setRecentScores(recent);
        setRecentSessions(recentFull);
        setWeeklyArrows(weekArrows);
        setWeeklyPoints(weekPoints);
        setWeeklyPointsByDist(weekPointsByDist);
        setAvgByDist(avgByDist);
        setWeeklySessionAvg(weekSessionAvg);
        setWeeklySessionAvgByDist(weekSessionAvgByDist);
        setWeekStreak(streak);

        cacheSet(cacheKey, { daily: d, monthly: m, prevMonthly: pm, yearly: y, avg14, avgArrows3: avgArrows3v, avgPoints3: avgPoints3v, avgArrowsMonth: avgArrowsM, avgPointsMonth: avgPointsM, recentScores: recent, recentSessions: recentFull, weeklyArrows: weekArrows, weeklyPoints: weekPoints, weeklyPointsByDist: weekPointsByDist, avgByDist, weeklySessionAvg: weekSessionAvg, weeklySessionAvgByDist: weekSessionAvgByDist, weekStreak: streak }, CACHE_TTL.STATS);
      } catch (error) {
        console.error("Błąd pobierania statystyk:", error);
      }
    };
    
    fetchAggr();

    // Odświeżaj statystyki gdy Pfeilzähler lub Trening Techniczny doda strzały
    const onStatsUpdated = () => {
      localStorage.removeItem(`grotX_stats_v12_${userId}`);
      fetchAggr();
    };
    window.addEventListener('grotx-stats-updated', onStatsUpdated);
    return () => {
      cancelled = true;
      window.removeEventListener('grotx-stats-updated', onStatsUpdated);
    };
  }, [userId, refreshNonce]);

  const handleRefresh = () => {
    if (isRefreshing || !userId || refreshesLeft <= 0) return;
    const current = getRefreshData();
    const newCount = current.date === todayStr ? current.count + 1 : 1;
    localStorage.setItem(`grotX_refreshLimit_${userId}`, JSON.stringify({ count: newCount, date: todayStr }));
    setIsRefreshing(true);
    localStorage.removeItem(`grotX_stats_v12_${userId}`);
    localStorage.removeItem(`grotX_quickStats_${userId}`);
    localStorage.removeItem(`grotX_lastSession_${userId}`);
    localStorage.removeItem(`grotX_tournaments_${userId}`);
    localStorage.removeItem(`grotX_todos_${userId}`);
    localStorage.removeItem(`grotX_announcements_${userId}_${i18n.language}`);
    setRefreshNonce(n => n + 1);
    setTimeout(() => setIsRefreshing(false), 2500);
  };

  const handleSafeJoin = async (battleId: string, distance: string, targetType: string, currentParticipants: string[], battleMode?: string, hostLevel?: number) => {
    // WORLD matchmaking — filtr rang: abs(userLevel - hostLevel) <= 1
    if (battleMode === 'WORLD' && !currentParticipants.includes(userId)) {
      const bHostLevel = hostLevel || 1;
      if (Math.abs(userLevel - bHostLevel) > 1) {
        showToast(t('home.rankTooFar', 'Ranga zbyt odległa (Ty: {{myLevel}}, Host: {{hostLevel}}). Różnica max ±1 poziom.', { myLevel: userLevel, hostLevel: bHostLevel }));
        return;
      }
    }

    if (!currentParticipants.includes(userId)) {
      const userSnap = await getDoc(doc(db, 'users', userId));
      const ud = userSnap.exists() ? userSnap.data() : {};
      const fName = ud.firstName || '';
      const lName = ud.lastName || '';
      const nick = ud.nickname || '';
      const showFull = ud.showFullName !== false;
      const showNick = ud.showNickname !== false;
      let displayName = showFull ? `${fName} ${lName}`.trim() : `${fName} ${lName ? lName.charAt(0) + '.' : ''}`.trim();
      if (showNick && nick) displayName = fName ? `${fName} "${nick}" ${showFull ? lName : (lName ? lName.charAt(0) + '.' : '')}`.trim() : nick;
      if (!displayName) displayName = nick || t('battleLobby.archer');

      const cName = ud.clubName || '';
      const cCity = ud.clubCity || '';
      const clubParts: string[] = [];
      if (ud.showClub !== false && cName) clubParts.push(cName);
      if (ud.showRegion !== false && cCity) clubParts.push(cCity);

      await updateDoc(doc(db, 'battles', battleId), {
        participants: arrayUnion(userId),
        [`liveScores.${userId}`]: 0,
        [`participantsData.${userId}`]: {
          name: displayName,
          club: clubParts.join(' - ') || t('battleLobby.unaffiliated'),
          country: ud.countryCode || 'PL'
        }
      });
    }
    onJoinBattle?.(battleId, distance, targetType);
  };

  const handleJoinByCode = async () => {
    const code = manualBattleCode.trim().toUpperCase();
    if (!code) return;
    
    setIsJoiningByCode(true);
    try {
      const battleRef = doc(db, 'battles', code);
      const battleSnap = await getDoc(battleRef);
      
      if (battleSnap.exists()) {
        const bData = battleSnap.data();
        if (['LOBBY', 'ACTIVE', 'START'].includes(bData.status)) {
          setShowQR(false); 
          setManualBattleCode(''); 
          handleSafeJoin(code, bData.distance, bData.targetType, bData.participants || [], bData.mode, bData.hostLevel);
        } else {
          showToast(t('home.arenaFinished'));
        }
      } else {
        showToast(t('home.arenaInvalidCode'));
      }
    } catch (e) {
      console.error(e);
      showToast(t('auth.errorGeneral'));
    } finally {
      setIsJoiningByCode(false);
    }
  };

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    const fetchAnnouncements = async () => {
      const cacheKey = `grotX_announcements_${userId}_${i18n.language}`;
      const cached = cacheGet<any[]>(cacheKey);

      let allAnn: any[];

      if (cached) {
        allAnn = cached;
      } else {
        const qAnnouncements = query(
          collection(db, 'announcements'),
          orderBy('timestamp', 'desc'),
          limit(10)
        );
        const snap = await getDocs(qAnnouncements);
        allAnn = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        cacheSet(cacheKey, allAnn, CACHE_TTL.ANNOUNCEMENTS);
      }

      const myAnnouncements = allAnn.filter((a: any) => {
        const langMatch = a.lang === 'all' || a.lang === i18n.language;
        if (!langMatch) return false;
        const targetMatch =
          a.target === 'ALL' ||
          (a.target === 'CLUB' && a.targetId === userClub) ||
          (a.target === 'USER' && a.targetId === userId);
        return targetMatch;
      });

      if (trialEndsAt && !rawIsPremium) {
        const daysLeft = Math.ceil((trialEndsAt - Date.now()) / (1000 * 3600 * 24));
        if (daysLeft >= 28) {
          myAnnouncements.unshift({
            id: 'sys_trial_welcome',
            title: t('home.trialWelcomeTitle'),
            content: t('home.trialWelcomeContent'),
            target: 'USER',
            lang: i18n.language,
            isSystemGenerated: true
          });
        } else if (daysLeft === 7 || daysLeft === 1) {
          const trialMsg = {
            id: `sys_trial_warning_${daysLeft}`,
            title: t('home.trialWarningTitle', { days: daysLeft, unit: daysLeft === 1 ? t('home.trialWarningDay') : t('home.trialWarningDays') }),
            content: t('home.trialWarningContent'),
            target: 'USER',
            lang: i18n.language,
            isSystemGenerated: true
          };
          myAnnouncements.unshift(trialMsg);
        }
      }

      const dismissedRaw = localStorage.getItem(`dismissed_ann_${userId}`);
      const dismissedIds: string[] = dismissedRaw ? JSON.parse(dismissedRaw) : [];
      const visibleAnnouncements = myAnnouncements.filter((a: any) => !dismissedIds.includes(a.id));

      if (cancelled) return;

      // Self-sync ALL/CLUB announcements to bell inbox.
      // USER-targeted announcements are created by the admin's write path; this
      // catches the broadcast cases the admin can't enumerate at write time.
      // Skip dismissed and system-generated (trial) entries.
      for (const ann of visibleAnnouncements) {
        if (ann.isSystemGenerated) continue;
        if (ann.target === 'USER') continue;
        const { id, payload } = buildAnnouncementNotification({
          announcementId: ann.id,
          title: ann.title || '',
          fromCoach: !!ann.senderId,
          senderId: ann.senderId,
        });
        // Idempotent — no-op if already present.
        createNotification(userId, id, payload).catch(() => { /* best effort */ });
      }
    };

    fetchAnnouncements();
    return () => { cancelled = true; };
  }, [userId, userClub, i18n.language, trialEndsAt, rawIsPremium]);


  const validClubBattles = activeClubBattles.filter(b => {
    const isExpired = b.expiresAt 
      ? getSafeTime(b.expiresAt) < currentTime 
      : (currentTime - getSafeTime(b.createdAt)) > 3 * 60 * 60 * 1000;
    return !isExpired;
  });

  const allActiveBattles = [...validClubBattles];
  
  if (activeInvite && !allActiveBattles.some(b => b.id === activeInvite.id)) {
    const isInviteExpired = activeInvite.expiresAt
      ? getSafeTime(activeInvite.expiresAt) < currentTime
      : (currentTime - getSafeTime(activeInvite.createdAt)) > 30 * 60 * 1000;
      
    if (!isInviteExpired) {
      allActiveBattles.unshift(activeInvite);
    }
  }

  const hasAnyBattle = allActiveBattles.length > 0;
  const isSingleBattle = allActiveBattles.length === 1;
  const singleBattleToJoin = isSingleBattle ? allActiveBattles[0] : null;
  const hasFinishedSingleBattle = isSingleBattle && singleBattleToJoin?.finishedParticipants?.includes(userId);

  // Opacity logic: aktywne = 100%, ostatnio ukończone = 100%, reszta = 70%
  const finishedByUser = allActiveBattles.filter(b => b.finishedParticipants?.includes(userId));
  const lastFinishedId = finishedByUser.length > 0 ? finishedByUser[finishedByUser.length - 1]?.id : null;
  const getBattleOpacity = (battle: any) => {
    const isActive = !battle.finishedParticipants?.includes(userId);
    const isLastFinished = battle.id === lastFinishedId;
    return (isActive || isLastFinished) ? 1 : 0.7;
  };

  return (
    <div className="flex flex-col h-full bg-[#fcfdfe] px-5 pb-24 pt-[max(calc(env(safe-area-inset-top)+0.5rem),2.5rem)]">
      
      {/* HEADER */}
      <div className="mb-4 flex items-center justify-between">
        <div>
          <div className="flex items-baseline">
            <h1 className="text-4xl font-black text-[#0a3a2a] tracking-tighter leading-none">GROT-X</h1>
            <div className="bg-[#fed33e] w-2.5 h-2.5 rounded-full animate-pulse ml-1.5 relative bottom-[0.35em]"></div>
          </div>
          <p className="text-sm font-bold text-gray-400 uppercase tracking-[0.2em] mt-1">{t('home.commander')}</p>
        </div>
        <div className="flex items-center gap-2">

          <button
            onClick={() => onNavigate?.('DELAY_MIRROR')}
            className="w-12 h-12 bg-white rounded-2xl border border-gray-100 flex items-center justify-center transition-all shadow-sm active:scale-90 opacity-70"
          >
            <span className="material-symbols-outlined text-[#0a3a2a] text-[24px] font-bold">slow_motion_video</span>
          </button>

          <NotificationBell userId={userId} onNavigate={onNavigate ?? (() => {})} />
          
          <button onClick={() => setShowQR(true)} className="w-12 h-12 bg-white rounded-2xl shadow-sm border border-gray-100 flex items-center justify-center active:scale-90 transition-all">
             <span className="material-symbols-outlined text-indigo-600 text-3xl font-bold">qr_code_2</span>
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-2">

        {/* NASTĘPNY CEL */}
        {!isLoading && nextTournament && (
          <div onClick={() => onGoToCalendar(nextTournament.id)} className="relative bg-[#0a3a2a] rounded-[28px] p-4 mt-1 shadow-lg text-white active:scale-[0.98] transition-all flex items-center justify-between cursor-pointer border border-[#0a3a2a]">
            <div className="absolute inset-0 rounded-[28px] overflow-hidden pointer-events-none">
              <div className="absolute right-[-40px] top-1/2 -translate-y-1/2 opacity-5">
                <svg width="240" height="240" viewBox="0 0 100 100">
                  <circle cx="50" cy="50" r="45" stroke="white" strokeWidth="2" fill="none"/>
                  <circle cx="50" cy="50" r="35" stroke="white" strokeWidth="2" fill="none"/>
                  <circle cx="50" cy="50" r="25" stroke="white" strokeWidth="2" fill="none"/>
                  <circle cx="50" cy="50" r="15" stroke="white" strokeWidth="2" fill="none"/>
                  <circle cx="50" cy="50" r="5" fill="white"/>
                </svg>
              </div>
            </div>
            
            <span className="absolute -top-2.5 left-6 bg-[#fed33e] text-[#0a3a2a] px-3 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest shadow-sm z-20 border border-[#0a3a2a]">
              {t('home.nextGoal')}
            </span>
            <span className="absolute -top-2.5 right-6 bg-emerald-500 text-white px-3 py-0.5 rounded-full text-[9px] font-black uppercase shadow-sm z-20 border border-[#0a3a2a]">
              {getDaysUntil(nextTournament.date)}
            </span>

            <div className="flex items-center gap-3 relative z-10 w-full pt-1">
              <div className="bg-[#fed33e] text-[#0a3a2a] p-2 rounded-2xl text-center min-w-[60px] shadow-inner shrink-0">
                <span className="block text-[9px] font-black uppercase leading-none mb-0.5">{new Date(nextTournament.date).toLocaleDateString(i18n.language, { month: 'short' })}</span>
                <span className="block text-xl font-black">{new Date(nextTournament.date).getDate()}</span>
              </div>
              <div className="flex-1 min-w-0 pr-2">
                <h3 className="font-black text-[17px] leading-tight mb-1">{nextTournament.title}</h3>
                <span className="text-[9px] font-bold text-emerald-300 uppercase tracking-widest block leading-none mb-1">{nextTournament.type}</span>
                <span className="text-[9px] font-bold text-emerald-500 uppercase tracking-widest flex items-center gap-0.5">
                  <span className="material-symbols-outlined text-[11px] shrink-0">location_on</span>
                  <span>{nextTournament.address || t('home.noLocation')}</span>
                </span>
              </div>
              <span className="material-symbols-outlined text-white/40 font-bold text-[32px] shrink-0">arrow_circle_right</span>
            </div>
          </div>
        )}

        {/* KALENDARZ PRYWATNY / TO-DO */}
        {!isLoading && (todoItems.length > 0 || nextOtherEvent) && (
          todoItems.length > 0 ? (
            <div className="relative bg-emerald-50 border border-emerald-200 rounded-[24px] shadow-sm mt-2 pt-3">
              <span className="absolute -top-2.5 left-6 bg-emerald-200 text-emerald-800 px-3 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest shadow-sm z-20 border border-emerald-800">
                {t('calendar.todoSection')}
              </span>
              <div className="pt-1 px-3 pb-2 space-y-1.5">
                {todoItems.map(item => (
                  <div key={item.id} onClick={() => onGoToCalendar(item.id)} className="rounded-[18px] px-3 py-2.5 flex items-center gap-3 active:scale-[0.98] transition-all cursor-pointer">
                    <span className="material-symbols-outlined text-emerald-300 text-[20px] shrink-0">radio_button_unchecked</span>
                    <p className="flex-1 font-black text-[14px] text-[#0a3a2a] leading-tight truncate">{item.title}</p>
                    <span className="material-symbols-outlined text-emerald-300 text-[18px] shrink-0">arrow_forward_ios</span>
                  </div>
                ))}
              </div>
              {nextOtherEvent && (
                <div
                  onClick={() => onGoToCalendar(nextOtherEvent.id)}
                  className="flex items-center gap-2 px-4 py-2 border-t border-emerald-200 cursor-pointer active:bg-emerald-100 transition-colors"
                >
                  <span className="material-symbols-outlined text-emerald-400 text-[13px] shrink-0">calendar_month</span>
                  <span className="text-[9px] font-black text-emerald-600 shrink-0">
                    {new Date(nextOtherEvent.date).toLocaleDateString(i18n.language, { day: 'numeric', month: 'short' })}
                  </span>
                  <span className="text-[9px] font-bold text-[#0a3a2a] truncate flex-1">{nextOtherEvent.title}</span>
                  <span className="material-symbols-outlined text-emerald-400 text-[13px] shrink-0">arrow_forward</span>
                </div>
              )}
            </div>
          ) : (
            <div onClick={() => onGoToCalendar(nextOtherEvent!.id)} className="relative bg-emerald-50 border border-emerald-200 rounded-[22px] px-3.5 py-2 flex items-center justify-between active:scale-[0.98] transition-all cursor-pointer shadow-sm mt-2">
              <div className="absolute inset-0 rounded-[22px] overflow-hidden pointer-events-none">
                <div className="absolute right-[20px] top-1/2 -translate-y-1/2 opacity-5">
                  <span className="material-symbols-outlined text-[110px]">calendar_month</span>
                </div>
              </div>
              <span className="absolute -top-2 left-5 bg-emerald-200 text-emerald-800 px-2.5 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest shadow-sm z-20 border border-emerald-800">
                {t('home.calendar')}
              </span>
              <div className="flex items-center gap-2.5 relative z-10 w-full pt-0.5">
                <div className="bg-[#fed33e]/80 text-[#0a3a2a] px-2 py-1.5 rounded-xl text-center min-w-[46px] shadow-sm shrink-0">
                  <span className="block text-[8px] font-black uppercase leading-none mb-0.5">{new Date(nextOtherEvent!.date).toLocaleDateString(i18n.language, { month: 'short' })}</span>
                  <span className="block text-lg font-black leading-none">{new Date(nextOtherEvent!.date).getDate()}</span>
                </div>
                <div className="flex-1 min-w-0 pr-1">
                  <h4 className="font-black text-[#0a3a2a] text-[15px] leading-tight mb-0.5">{nextOtherEvent!.title}</h4>
                  <span className="text-[9px] font-bold text-emerald-600 uppercase tracking-widest flex items-center gap-0.5">
                    <span className="material-symbols-outlined text-[11px] shrink-0">location_on</span>
                    <span className="truncate">{nextOtherEvent!.address || t('home.noLocation')}</span>
                  </span>
                </div>
                <span className="material-symbols-outlined text-emerald-700/30 font-bold text-[26px] shrink-0">arrow_circle_right</span>
              </div>
            </div>
          )
        )}

        {/* TERMINY TRENERSKIE — jako trener / od trenera */}
        {!isLoading && (nextTrainerSent || nextTrainerReceived) && (() => {
          const both = !!(nextTrainerSent && nextTrainerReceived);
          const renderCard = (event: any, isMirrored: boolean, half: boolean) => {
            const palette = isMirrored
              ? { bg: 'bg-sky-50', border: 'border-sky-200', label: 'text-sky-600', tag: 'bg-sky-200 text-sky-800 border-sky-800', accent: 'text-sky-700/40', dateBg: 'bg-sky-100' }
              : { bg: 'bg-indigo-50', border: 'border-indigo-200', label: 'text-indigo-600', tag: 'bg-indigo-200 text-indigo-800 border-indigo-800', accent: 'text-indigo-700/40', dateBg: 'bg-indigo-100' };
            const labelKey = isMirrored ? 'calendar.legendTrainerReceived' : 'calendar.legendTrainerSent';
            return (
              <div
                key={event.id}
                onClick={() => onGoToCalendar(event.id)}
                className={`relative ${palette.bg} border ${palette.border} rounded-[20px] ${half ? 'px-2.5 py-2' : 'px-3.5 py-2'} active:scale-[0.98] transition-all cursor-pointer shadow-sm mt-2`}
              >
                <span className={`absolute -top-2 left-4 ${palette.tag} px-2.5 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest shadow-sm z-20 border`}>
                  {t(labelKey)}
                </span>
                <div className="flex items-center gap-2.5 pt-0.5 w-full">
                  <div className={`${palette.dateBg} text-[#0a3a2a] px-2 py-1.5 rounded-xl text-center min-w-[43px] shadow-sm shrink-0`}>
                    <span className="block text-[8px] font-black uppercase leading-none mb-0.5">{new Date(event.date).toLocaleDateString(i18n.language, { month: 'short' })}</span>
                    <span className="block text-lg font-black leading-none">{new Date(event.date).getDate()}</span>
                  </div>
                  <div className="flex-1 min-w-0 pr-0.5">
                    <h4 className="font-black text-[#0a3a2a] text-[14px] leading-tight truncate">{event.title}</h4>
                    <span className={`text-[9px] font-bold ${palette.label} uppercase tracking-widest flex items-center gap-0.5`}>
                      <span className="material-symbols-outlined text-[11px] shrink-0">schedule</span>
                      <span className="truncate">{event.time || t('calendar.wholeDay')}</span>
                    </span>
                  </div>
                  {!half && (
                    <span className={`material-symbols-outlined ${palette.accent} font-bold text-[26px] shrink-0`}>arrow_circle_right</span>
                  )}
                </div>
              </div>
            );
          };
          if (both) {
            return (
              <div className="grid grid-cols-2 gap-2">
                {renderCard(nextTrainerReceived, true, true)}
                {renderCard(nextTrainerSent, false, true)}
              </div>
            );
          }
          return renderCard(nextTrainerReceived || nextTrainerSent, !!nextTrainerReceived, false);
        })()}

        {/* ─── PASEK STATYSTYK + OSTATNI WYNIK ──────────────────────────────── */}
        <div className="flex items-stretch gap-2 mt-1">
        <div className="bg-white rounded-[24px] border border-gray-100 shadow-sm flex items-stretch flex-1 overflow-hidden">

          {/* 1. Strzały miesięczne */}
          <button
            className="flex flex-col items-center justify-center px-4 py-3 shrink-0 active:bg-gray-50 transition-all"
            onClick={() => { setQuickStatsInitialTab('ARROWS'); setIsQuickStatsOpen(true); }}
          >
            <p className="text-[28px] font-black text-[#0a3a2a] leading-none">{monthlyTotal}</p>
            <span className="text-[11px] font-bold text-gray-500 uppercase mt-1 tracking-wide whitespace-nowrap">{t('home.month')}</span>
          </button>

          <div className="w-[1px] bg-gray-100 self-stretch shrink-0" />

          {/* 2. Średnia 14 dni */}
          <button
            className="flex flex-col items-center justify-center px-3 py-3 shrink-0 active:bg-gray-50 transition-all"
            onClick={() => { setQuickStatsInitialTab('POINTS'); setIsQuickStatsOpen(true); }}
          >
            <p className="text-[22px] font-black text-[#725b00] leading-none">{avg14Days}</p>
            <span className="text-[10px] font-bold text-[#725b00]/70 mt-1 tracking-wide">x̄₁₄</span>
          </button>

          <div className="w-[1px] bg-gray-100 self-stretch shrink-0" />

          {/* 3. Wykres + etykiety */}
          <button onClick={() => recentScores.length >= 2 && setShowTrendModal(true)} className="flex-1 flex items-center justify-center px-2 py-2 min-w-0 overflow-hidden active:opacity-70 transition-opacity">
            {recentScores.length >= 2 ? (() => {
              const W = 100, H = 40, pad = 6;
              const minS = Math.min(...recentScores);
              const maxS = Math.max(...recentScores);
              const lastS = recentScores[recentScores.length - 1];
              const maxIdx = recentScores.indexOf(maxS);
              const minIdx = recentScores.lastIndexOf(minS);
              const range = maxS - minS || 1;
              const pts = recentScores.map((s, i) => ({
                x: pad + (i / (recentScores.length - 1)) * (W - pad * 2),
                y: H - pad - ((s - minS) / range) * (H - pad * 2),
              }));
              const polyline = pts.map(p => `${p.x},${p.y}`).join(' ');
              return (
                <div className="flex items-center gap-1.5 w-full min-w-0">
                  <svg viewBox={`0 0 ${W} ${H}`} className="gx-trend flex-1 min-w-0" style={{ overflow: 'visible' }}>
                    <polyline points={polyline} fill="none" stroke="#0a3a2a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.3" />
                    {pts.map((p, i) => {
                      const isMax = i === maxIdx;
                      const isMin = i === minIdx;
                      const isLast = i === pts.length - 1;
                      const color = isMax ? '#22c55e' : isMin ? '#ef4444' : isLast ? '#fed33e' : '#0a3a2a';
                      const r = (isMax || isMin) ? 4 : isLast ? 3 : 2;
                      const opacity = (isMax || isMin || isLast) ? 1 : 0.2;
                      return <circle key={i} cx={p.x} cy={p.y} r={r} fill={color} opacity={opacity} />;
                    })}
                  </svg>
                  <div className="flex flex-col gap-[5px] shrink-0">
                    <span className="flex items-center gap-1 text-[9px] font-black text-emerald-500 leading-none">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0 inline-block" />{maxS}
                    </span>
                    <span className="flex items-center gap-1 text-[9px] font-black text-red-400 leading-none">
                      <span className="w-2 h-2 rounded-full bg-red-400 shrink-0 inline-block" />{minS}
                    </span>
                    <span className="flex items-center gap-1 text-[9px] font-black text-[#725b00] leading-none">
                      <span className="w-2 h-2 rounded-full bg-[#fed33e] shrink-0 inline-block" />{lastS}
                    </span>
                  </div>
                </div>
              );
            })() : (
              <span className="material-symbols-outlined text-gray-200 text-2xl">monitoring</span>
            )}
          </button>

        </div>

        {/* 4. Ostatni wynik — osobna karta */}
        <button
          className="flex flex-col items-center justify-center px-4 py-3 shrink-0 bg-[#fed33e] rounded-[24px] shadow-sm active:bg-[#ffc800] transition-all text-center"
          onClick={() => {
            if (realLastSession) {
              const tsRaw = realLastSession.timestamp;
              let isoDate = '';
              if (tsRaw) {
                const ms = typeof tsRaw === 'number'
                  ? tsRaw
                  : tsRaw.toMillis
                    ? tsRaw.toMillis()
                    : tsRaw.seconds
                      ? tsRaw.seconds * 1000
                      : 0;
                if (ms) {
                  const d = new Date(ms);
                  isoDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                }
              }
              if (!isoDate && realLastSession.date) {
                const p = realLastSession.date.split('.');
                if (p.length === 3) isoDate = `${p[2]}-${p[1].padStart(2,'0')}-${p[0].padStart(2,'0')}`;
              }
              onGoToStats?.(isoDate || undefined);
            } else {
              onGoToStats?.();
            }
          }}
        >
          <p className="text-[28px] font-black text-[#725b00] leading-none">{realLastSession ? realLastSession.score : '--'}</p>
          <span className="text-[9px] font-bold text-[#725b00]/70 leading-none mt-1 whitespace-nowrap block">{realLastSession ? realLastSession.distance : '--'}</span>
          <span className="text-[9px] font-bold text-[#725b00]/60 leading-none mt-0.5 whitespace-nowrap block">
            {realLastSession
              ? (realLastSession.date || (() => {
                  const tsRaw = realLastSession.timestamp;
                  const ms = typeof tsRaw === 'number' ? tsRaw : tsRaw?.toMillis ? tsRaw.toMillis() : tsRaw?.seconds ? tsRaw.seconds * 1000 : 0;
                  if (!ms) return '--';
                  const d = new Date(ms);
                  return `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}.${d.getFullYear()}`;
                })())
              : '--'}
          </span>
        </button>
        </div>


        {/* ─── MULTIPLAYER ARENA + RANKING — obok siebie ───────────────────── */}
        <div className="mt-2 grid grid-cols-2 gap-2">

          {/* Lewa — Multiplayer Arena */}
          <div
            onClick={() => setIsClubBattlesModalOpen(true)}
            className={`rounded-[24px] border flex flex-col justify-between p-4 cursor-pointer active:scale-[0.98] transition-all relative overflow-hidden ${
              hasAnyBattle
                ? 'bg-gradient-to-br from-fuchsia-700 to-fuchsia-900 border-fuchsia-500 min-h-[96px]'
                : 'bg-gradient-to-br from-indigo-600 to-blue-700 border-indigo-500 min-h-[80px]'
            }`}
          >
            <div className="absolute right-0 bottom-0 opacity-[0.08] pointer-events-none">
              <span className="material-symbols-outlined text-[60px] text-white">{hasAnyBattle ? 'shield' : 'public'}</span>
            </div>
            <span className={`text-[9px] font-black uppercase tracking-widest leading-none ${hasAnyBattle ? 'text-fuchsia-200' : 'text-indigo-200'}`}>
              Multiplayer Arena
            </span>
            <div className="relative z-10 mt-2">
              <p className="text-[15px] font-black text-white leading-tight">
                {hasAnyBattle
                  ? allActiveBattles.filter(b => !b.finishedParticipants?.includes(userId)).length > 0
                      ? `${allActiveBattles.filter(b => !b.finishedParticipants?.includes(userId)).length} ${t('home.active')}`
                      : t('home.done', 'Ukończono')
                  : t('home.noActiveBattles')}
              </p>
              {hasAnyBattle && (
                <div className="flex items-center gap-1 mt-1">
                  <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse shrink-0"></span>
                  <span className="text-[9px] font-bold text-white/60 truncate">
                    {allActiveBattles.filter(b => b.mode === 'CLUB').length > 0 && `${allActiveBattles.filter(b => b.mode === 'CLUB').length}kl`}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Prawa — Ranking Łucznika */}
          <button
            onClick={() => setIsRankInfoOpen(true)}
            className="rounded-[24px] border border-gray-100 bg-white shadow-sm flex flex-col justify-between p-4 active:scale-[0.98] transition-all min-h-[80px] text-left"
          >
            <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest leading-none">{t('home.archerRanking')}</span>
            <div className="flex items-center gap-2 mt-2">
              <div
                className="w-11 h-11 rounded-full flex items-center justify-center shrink-0 shadow-sm"
                style={{ background: userRankColor, border: `2px solid ${userRankBorder}` }}
              >
                <span className="text-base font-black" style={{ color: userRankTextColor }}>{userLevel}</span>
              </div>
              <div className="flex-1 min-w-0">
                <span
                  className="text-[10px] font-black px-2 py-[3px] rounded inline-block mb-1.5"
                  style={{ background: userRankColor, color: userRankTextColor, border: `1px solid ${userRankBorder}` }}
                >
                  {userRankName}
                </span>
                <div className="flex gap-[1px] w-full">
                  {Array.from({ length: 24 }, (_, i) => {
                    const filled = rankProgress >= (i + 1) * (100 / 24);
                    const color = i < 6 ? '#ef4444' : i < 12 ? '#f97316' : i < 18 ? '#facc15' : '#22c55e';
                    return (
                      <div
                        key={i}
                        className="flex-1 h-2 rounded-sm transition-all duration-300"
                        style={{ background: filled ? color : '#e5e7eb' }}
                      />
                    );
                  })}
                </div>
              </div>
            </div>
            <p className="text-[9px] font-bold text-gray-400 leading-none mt-1.5">
              {userXp.toLocaleString()} XP{nextRankName ? ` → ${nextRankName}` : ' ✦ MAX'}
            </p>
          </button>

        </div>

        {/* AI COACH — tymczasowo ukryte */}

        {/* BUILD TIMESTAMP + CURRENT TIME + REFRESH */}
        <div className="flex flex-col items-center gap-2 mt-2">
          <button
            onClick={handleRefresh}
            disabled={isRefreshing || refreshesLeft <= 0}
            className={`flex items-center gap-2 px-4 py-2 rounded-full transition-all shadow-sm relative ${
              refreshesLeft <= 0
                ? 'bg-gray-100 opacity-40 cursor-not-allowed'
                : 'bg-gray-100 active:bg-gray-200'
            }`}
          >
            <span className={`material-symbols-outlined text-[16px] text-[#0a3a2a] ${isRefreshing ? 'animate-spin' : ''}`}>sync</span>
            <span className="text-[10px] font-black text-[#0a3a2a] uppercase tracking-widest">
              {isRefreshing
                ? t('home.refreshing', { defaultValue: 'Aktualisiere…' })
                : t('home.refresh', { defaultValue: 'Aktualisieren' })}
            </span>
            {!isRefreshing && (
              <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-black leading-none ${
                refreshesLeft > 0 ? 'bg-[#0a3a2a] text-white' : 'bg-gray-300 text-gray-500'
              }`}>
                {refreshesLeft}
              </span>
            )}
          </button>
          <div className="flex items-center gap-2">
            <span className="text-[8px] text-gray-300 tracking-wide">build: {__BUILD_TIME__}</span>
            <span className="text-gray-200">·</span>
            <span className="text-[8px] text-[#fed33e]/60 font-bold tracking-wide">{new Date().toLocaleTimeString('pl-PL')}</span>
          </div>
        </div>

      </div>

      {/* MODAL ZE STATYSTYKAMI */}
      <QuickStatsModal
        isOpen={isQuickStatsOpen}
        onClose={() => setIsQuickStatsOpen(false)}
        isPremium={isPremium}
        userId={userId}
        onNavigate={onNavigate as any}
        initialTab={quickStatsInitialTab}
        weeklyArrows={weeklyArrows}
        weeklyPoints={weeklyPoints}
        weeklyPointsByDistance={weeklyPointsByDist}
        avgByDistance={avgByDist}
        weeklySessionAvg={weeklySessionAvg}
        weeklySessionAvgByDistance={weeklySessionAvgByDist}
        stats={{
          daily: dailyTotal,
          monthly: monthlyTotal,
          prevMonthly: prevMonthlyTotal,
          yearly: yearlyTotal,
          avg14: avg14Days,
          avgArrows3: avgArrows3,
          avgPoints3: avgPoints3,
          avgArrowsMonth: avgArrowsMonth,
          avgPointsMonth: avgPointsMonth
        }}
      />

      {/* MODAL CENTRUM ARENY */}
      {isClubBattlesModalOpen && (
        <div className="fixed inset-0 z-[100000] flex items-start justify-center">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setIsClubBattlesModalOpen(false)}></div>

          <style>{`.animate-slide-down { animation: slideDown 0.4s cubic-bezier(0.16,1,0.3,1) forwards; } @keyframes slideDown { from { transform: translateY(-100%); opacity: 0; } to { transform: translateY(0); opacity: 1; } }`}</style>
          <div className="bg-[#fcfdfe] w-full max-w-md rounded-b-[32px] relative z-10 shadow-2xl animate-slide-down flex flex-col max-h-[90vh]">

            {/* HEADER */}
            <div className="px-6 pt-5 pb-4 shrink-0">
              <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-4"></div>
              <div className="flex justify-between items-start">
                <div>
                  <h2 className="text-2xl font-black text-[#0a3a2a] tracking-tight leading-none">Multiplayer Arena</h2>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">{t('home.battleSubtitle')}</p>
                </div>
                <button onClick={() => setIsClubBattlesModalOpen(false)} className="w-9 h-9 bg-gray-100 rounded-full flex items-center justify-center text-gray-500 active:scale-90 shrink-0">
                  <span className="material-symbols-outlined text-[18px]">close</span>
                </button>
              </div>
            </div>

            <div className="overflow-y-auto flex-1 px-6 pb-4 space-y-5">

              {/* ── AKTYWNE WYZWANIA ─────────────────────────────── */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">{t('home.activeChallenges')}</span>
                  {hasAnyBattle && (
                    <span className="flex items-center gap-1 text-[9px] font-black text-fuchsia-500">
                      <span className="w-1.5 h-1.5 bg-fuchsia-500 rounded-full animate-pulse"></span>
                      {allActiveBattles.filter(b => !b.finishedParticipants?.includes(userId)).length} {t('home.active')}
                    </span>
                  )}
                </div>

                <div className="space-y-2">
                  {allActiveBattles.length > 0 ? allActiveBattles.map(battle => {
                    const hasFinishedThis = battle.finishedParticipants?.includes(userId);
                    const isHost = battle.hostId === userId;
                    const opacity = getBattleOpacity(battle);
                    const isLastDone = battle.id === lastFinishedId;

                    return (
                      <div
                        key={battle.id}
                        onClick={() => {
                          setIsClubBattlesModalOpen(false);
                          if (hasFinishedThis) {
                            onGoToBattles?.();
                          } else {
                            handleSafeJoin(battle.id, battle.distance, battle.targetType, battle.participants || [], battle.mode, battle.hostLevel);
                          }
                        }}
                        style={{ opacity }}
                        className={`border p-4 rounded-2xl flex items-center justify-between active:scale-[0.98] transition-all cursor-pointer relative overflow-hidden ${
                          hasFinishedThis
                            ? isLastDone ? 'bg-emerald-50 border-emerald-200' : 'bg-gray-50 border-gray-100'
                            : 'bg-fuchsia-50 border-fuchsia-200'
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 mb-1.5">
                            {hasFinishedThis ? (
                              <span className={`text-[8px] font-black px-2 py-0.5 rounded-md uppercase tracking-widest ${isLastDone ? 'bg-emerald-500 text-white' : 'bg-gray-300 text-gray-600'}`}>
                                {isLastDone ? '✓ ' + t('home.done', 'Ukończono') : t('home.arenaFinished')}
                              </span>
                            ) : (
                              <span className="text-[8px] font-black bg-fuchsia-600 text-white px-2 py-0.5 rounded-md uppercase tracking-widest">
                                {battle.mode === 'CLUB' ? `🏛 ${t('battleLobby.club')}` : '🌐 World'}
                              </span>
                            )}
                            {battle.mode === 'WORLD' && battle.hostLevel && (() => {
                              const ok = Math.abs(userLevel - (battle.hostLevel || 1)) <= 1;
                              return <span className={`text-[8px] font-black px-1.5 py-0.5 rounded-md ${ok ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'}`}>Lvl {battle.hostLevel}</span>;
                            })()}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`material-symbols-outlined text-lg ${hasFinishedThis ? (isLastDone ? 'text-emerald-500' : 'text-gray-400') : 'text-fuchsia-500'}`}>target</span>
                            <p className={`font-black text-sm ${hasFinishedThis ? (isLastDone ? 'text-emerald-700' : 'text-gray-500') : 'text-[#0a3a2a]'}`}>
                              {getFriendlyTargetName(battle.targetType)} · {battle.distance}
                            </p>
                          </div>
                          {battle.expiresAt && !hasFinishedThis && (
                            <span className="text-[9px] font-bold text-fuchsia-400 flex items-center gap-0.5 mt-1">
                              <span className="material-symbols-outlined text-[11px]">schedule</span>
                              {getRemainingTime(battle.expiresAt, battle.createdAt)}
                            </span>
                          )}
                          <p className="text-[9px] font-bold text-gray-400 mt-0.5 truncate italic">{battle.hostName}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 ml-2">
                          {isHost && (
                            <button onClick={(e) => initiateDeleteBattle(e, battle.id)} className="w-8 h-8 bg-red-50 rounded-xl flex items-center justify-center text-red-400 z-20 active:scale-90">
                              <span className="material-symbols-outlined text-[16px]">delete</span>
                            </button>
                          )}
                          <span className={`material-symbols-outlined text-2xl ${hasFinishedThis ? (isLastDone ? 'text-emerald-400' : 'text-gray-300') : 'text-fuchsia-500'}`}>
                            {hasFinishedThis ? 'trophy' : 'chevron_right'}
                          </span>
                        </div>
                      </div>
                    );
                  }) : (
                    <div className="text-center py-6 bg-gray-50 rounded-2xl border border-dashed border-gray-200">
                      <span className="material-symbols-outlined text-3xl text-gray-300 block mb-1">search_off</span>
                      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{t('home.arenaNoClubGames')}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* ── STATYSTYKI ───────────────────────────────────── */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">{t('home.battleStats')}</span>
                </div>
                <div className="grid grid-cols-1 gap-2">
                  <div className="bg-white rounded-2xl border border-gray-100 p-3 shadow-sm">
                    <span className="material-symbols-outlined text-indigo-400 text-[20px] block mb-1">corporate_fare</span>
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none mb-1">{t('home.arenaClubLabel')}</p>
                    <p className="text-xl font-black text-[#0a3a2a]">{allActiveBattles.filter(b => b.mode === 'CLUB').length}</p>
                    <span className="text-[8px] font-bold text-gray-300">{t('home.active')}</span>
                  </div>
                </div>
                <button
                  onClick={() => { setIsClubBattlesModalOpen(false); onGoToBattles?.(); }}
                  className="w-full mt-2 py-2.5 bg-gray-50 border border-gray-100 rounded-2xl text-[10px] font-black text-gray-500 uppercase tracking-widest flex items-center justify-center gap-1.5 active:scale-95 transition-all"
                >
                  <span className="material-symbols-outlined text-[14px]">history</span>
                  {t('home.battleHistory', 'Pełna historia bitew')}
                </button>
              </div>

              {/* ── TWÓJ RANKING ─────────────────────────────────── */}
              <div>
                <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-2">{t('home.yourRanking', 'Twój ranking')}</span>
                <button
                  onClick={() => { setIsClubBattlesModalOpen(false); setIsRankInfoOpen(true); }}
                  className="w-full bg-white rounded-2xl border border-gray-100 p-3 shadow-sm flex items-center gap-3 active:scale-[0.98] transition-all"
                >
                  <div className="w-12 h-12 rounded-full flex items-center justify-center shrink-0 shadow-sm"
                    style={{ background: userRankColor, border: `2.5px solid ${userRankBorder}` }}>
                    <span className="text-base font-black" style={{ color: userRankTextColor }}>{userLevel}</span>
                  </div>
                  <div className="flex-1 min-w-0 text-left">
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="text-[8px] font-black text-gray-400 uppercase tracking-wide">GROT-X</span>
                      <span className="text-[9px] font-black px-1.5 py-[2px] rounded" style={{ background: userRankColor, color: userRankTextColor, border: `1px solid ${userRankBorder}` }}>
                        {userRankName}
                      </span>
                    </div>
                    <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden mb-1">
                      <div className="h-full rounded-full transition-all duration-700"
                        style={{ width: `${rankProgress}%`, background: userLevel >= 9 ? `linear-gradient(90deg, ${userRankColor}, #fff5a0)` : userRankColor }} />
                    </div>
                    <p className="text-[7px] font-bold text-gray-400 leading-none">{userXp.toLocaleString()} XP{nextRankName ? ` → ${nextRankName}` : ' ✦ MAX'}</p>
                  </div>
                  <span className="material-symbols-outlined text-gray-300 text-[18px] shrink-0">chevron_right</span>
                </button>
              </div>

            </div>

            {/* FOOTER — utwórz arenę */}
            <div className="px-6 pt-3 pb-8 border-t border-gray-100 shrink-0 space-y-2">
              <button
                onClick={() => { setIsClubBattlesModalOpen(false); onNewSession(); }}
                className="w-full py-4 bg-[#0a3a2a] text-white rounded-2xl font-black uppercase text-[11px] tracking-widest active:scale-95 transition-all flex items-center justify-center gap-2 shadow-lg"
              >
                <span className="material-symbols-outlined text-[16px]">add_circle</span>
                {t('home.arenaCreateBtn')}
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Modal QR + PIN */}
      {showQR && (
        <div className="fixed inset-0 z-[10000] flex items-start justify-center p-6 pt-20">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setShowQR(false)}></div>
          <div className="bg-white w-full max-w-sm rounded-[40px] p-6 relative z-10 shadow-2xl text-center animate-fade-in-up">
            
            <h2 className="text-2xl font-black text-[#0a3a2a] mb-2 tracking-tighter">{t('home.connectTitle')}</h2>
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-6">{t('home.connectSub')}</p>
            
            <div className="bg-gray-50 p-4 rounded-[24px] inline-block border-4 border-indigo-50 mb-3">
              <QRCodeCanvas value={userId} size={150} />
            </div>
            
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">{t('home.yourStudentId')}</p>
            <div className="bg-gray-100 rounded-xl p-3 mb-6 flex items-center justify-between border border-gray-200">
              <code className="text-[11px] font-black text-[#0a3a2a] tracking-wider truncate select-all w-full text-left">{userId}</code>
              <button onClick={() => { navigator.clipboard.writeText(userId); showToast(t('home.copiedId')); }} className="ml-3 text-indigo-600 active:scale-90 transition-transform flex-shrink-0">
                <span className="material-symbols-outlined text-lg">content_copy</span>
              </button>
            </div>
            
            <div className="mb-6 p-4 bg-indigo-50/50 rounded-[20px] border border-indigo-100 text-left">
              <label className="text-[10px] font-black text-indigo-800 uppercase tracking-widest block mb-2 text-center">{t('home.arenaJoinCode')}</label>
              <div className="flex gap-2 w-full">
                <input
                  type="text"
                  placeholder="NP. AB12CD"
                  maxLength={6}
                  value={manualBattleCode}
                  onChange={(e) => setManualBattleCode(e.target.value.toUpperCase())}
                  className="flex-1 min-w-0 bg-white border border-indigo-200 rounded-xl p-3 text-sm font-black text-center tracking-[0.2em] uppercase focus:outline-none focus:border-indigo-500"
                />
                <button
                  onClick={handleJoinByCode}
                  disabled={isJoiningByCode || manualBattleCode.length < 3}
                  className="px-4 shrink-0 bg-indigo-600 text-white rounded-xl font-black uppercase text-[10px] tracking-widest active:scale-95 transition-all disabled:opacity-50 whitespace-nowrap"
                >
                  {isJoiningByCode ? '...' : t('home.arenaJoinBtn')}
                </button>
              </div>
            </div>

            <button onClick={() => setShowQR(false)} className="w-full py-4 bg-gray-100 text-gray-500 rounded-[20px] font-black uppercase tracking-widest active:scale-95 transition-all">{t('home.close')}</button>
          </div>
        </div>
      )}

      {/* Modal potwierdzenia usunięcia Areny */}
      {battleToDelete && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[400000] bg-black/80 backdrop-blur-sm flex items-center justify-center p-6 animate-fade-in">
          <div className="bg-white rounded-[32px] p-6 w-full max-w-sm shadow-2xl text-center">
            <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="material-symbols-outlined text-3xl">warning</span>
            </div>
            <h2 className="text-xl font-black text-[#0a3a2a] mb-2">{t('calendar.modalDelete')}</h2>
            <p className="text-sm font-bold text-gray-500 mb-6">{t('home.arenaDeleteConfirm', 'Na pewno chcesz usunąć tę Arenę? Zniknie ona u wszystkich graczy z Twojego klubu.')}</p>
            <div className="flex gap-2">
              <button onClick={() => setBattleToDelete(null)} className="flex-1 py-4 bg-gray-100 text-gray-500 rounded-xl font-black uppercase text-[11px] tracking-widest active:scale-95 transition-all">{t('setup.warningCancel')}</button>
              <button onClick={confirmDeleteBattle} className="flex-1 py-4 bg-red-500 text-white rounded-xl font-black uppercase text-[11px] tracking-widest active:scale-95 transition-all shadow-md shadow-red-500/30">{t('calendar.modalDelete')}</button>
            </div>
          </div>
        </div>, document.body
      )}

      {/* Toast */}
      {toastMessage && typeof document !== 'undefined' && createPortal(
        <div className="fixed top-14 left-1/2 -translate-x-1/2 z-[300000] bg-[#0a3a2a] text-white px-6 py-3.5 rounded-full font-black text-[10px] uppercase tracking-widest shadow-2xl border border-emerald-900 animate-fade-in-up flex items-center gap-2 whitespace-nowrap">
          <span className="material-symbols-outlined text-emerald-400 text-sm">info</span>
          {toastMessage}
        </div>, document.body
      )}

      {/* ─── MODAL: THE TARGET SERIES — Tabela Rang ────────────────────────── */}
      {isRankInfoOpen && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-[200000] bg-black/60 backdrop-blur-sm flex items-end justify-center p-4 pb-[max(1rem,env(safe-area-inset-bottom))] animate-fade-in-up"
          onClick={() => setIsRankInfoOpen(false)}
        >
          <div
            className="bg-[#fcfdfe] w-full max-w-md rounded-[32px] shadow-2xl flex flex-col"
            style={{ maxHeight: 'calc(90vh - env(safe-area-inset-top, 0px))' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Nagłówek — przyklejony na górze, nie scrolluje */}
            <div className="bg-[#0a3a2a] px-6 pt-6 pb-5 relative overflow-hidden shrink-0">
              <div className="absolute right-4 top-4 opacity-[0.07]">
                <span className="material-symbols-outlined text-[80px] text-white">military_tech</span>
              </div>
              <div className="flex items-start justify-between relative z-10">
                <div>
                  <p className="text-[9px] font-black text-emerald-400 uppercase tracking-widest mb-1">Grot-X</p>
                  <h2 className="text-xl font-black text-white tracking-tighter leading-none">GROT-X System</h2>
                  <p className="text-[11px] font-black text-[#fed33e] leading-none mt-0.5">{t('home.motivational')}</p>
                  <p className="text-[9px] font-bold text-white/50 mt-1">{t('home.xpAndHandicap')}</p>
                </div>
                <button
                  onClick={() => setIsRankInfoOpen(false)}
                  className="w-9 h-9 bg-white/10 rounded-full flex items-center justify-center text-white/60 active:scale-90 transition-all shrink-0 mt-0.5"
                >
                  <span className="material-symbols-outlined text-[18px]">close</span>
                </button>
              </div>

              {/* Twoja ranga */}
              <div className="mt-4 bg-white/10 border border-white/10 rounded-2xl px-4 py-3 flex items-center gap-3 relative z-10">
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 shadow-md"
                  style={{ background: userRankColor, border: `2.5px solid ${userRankBorder}` }}
                >
                  <span className="text-sm font-black" style={{ color: userRankTextColor }}>{userLevel}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[9px] font-black text-white/50 uppercase tracking-widest leading-none mb-0.5">{t('home.yourRank')}</p>
                  <p className="text-base font-black text-white leading-none">{userRankName}</p>
                  <div className="flex items-center gap-2 mt-1.5">
                    <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${rankProgress}%`, background: userRankColor, opacity: 0.9 }}
                      />
                    </div>
                    <span className="text-[8px] font-black text-white/50 shrink-0">{rankProgress}%</span>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-lg font-black text-[#fed33e] leading-none">{userXp.toLocaleString()}</p>
                  <p className="text-[8px] font-bold text-white/40 uppercase mt-0.5">XP</p>
                </div>
              </div>
            </div>

            {/* Przewijalna treść — lista rang + sekcje + przycisk */}
            <div className="overflow-y-auto flex-1 overscroll-contain">

            {/* Lista rang */}
            <div className="px-4 py-3 space-y-1.5">
              {TARGET_RANKS.map((rank) => {
                const isCurrentRank = rank.level === userLevel;
                const isUnlocked = userXp >= rank.xpThreshold;
                return (
                  <div
                    key={rank.level}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-2xl border transition-all ${
                      isCurrentRank
                        ? 'border-[#0a3a2a] bg-[#0a3a2a]/5 shadow-sm'
                        : isUnlocked
                          ? 'border-gray-100 bg-white'
                          : 'border-gray-100 bg-gray-50 opacity-50'
                    }`}
                  >
                    {/* Odznaka */}
                    <div
                      className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 shadow-sm"
                      style={{ background: rank.color, border: `2px solid ${rank.border}` }}
                    >
                      <span className="text-xs font-black" style={{ color: rank.textColor }}>{rank.level}</span>
                    </div>

                    {/* Nazwa + warunki */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[12px] font-black text-[#0a3a2a] leading-none">{rank.name}</span>
                        {isCurrentRank && (
                          <span className="text-[7px] font-black bg-[#0a3a2a] text-[#fed33e] px-1.5 py-0.5 rounded-md uppercase tracking-wide">{t('home.yours')}</span>
                        )}
                        {isUnlocked && !isCurrentRank && (
                          <span className="material-symbols-outlined text-emerald-500 text-[13px]">check_circle</span>
                        )}
                      </div>
                      {rank.minAvg !== null && (
                        <p className="text-[8px] font-bold text-orange-500 mt-0.5 leading-none">
                          x̄ min. {rank.minAvg} · rolling avg (10 {t('stats.pro.sessions')})
                        </p>
                      )}
                    </div>

                    {/* XP */}
                    <div className="text-right shrink-0">
                      <p className={`text-[11px] font-black leading-none ${isUnlocked ? 'text-[#0a3a2a]' : 'text-gray-400'}`}>
                        {rank.xpThreshold === 0 ? 'Start' : rank.xpThreshold.toLocaleString()}
                      </p>
                      {rank.xpThreshold > 0 && (
                        <p className="text-[7px] font-bold text-gray-400 uppercase mt-0.5">XP</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>{/* koniec listy rang */}

            {/* Handicap Łuczniczy */}
            <div className="px-4 pt-2">
              <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
                <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[14px]">gps_fixed</span>
                  {t('home.handicapTitle')}
                </p>

                {userHandicap !== null ? (() => {
                  const band = getHandicapBand(userHandicap);
                  return (
                    <>
                      <div className="flex items-center gap-3 mb-3">
                        <div
                          className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 shadow-sm"
                          style={{ background: band.bg }}
                        >
                          <span className="text-2xl font-black" style={{ color: band.color }}>{userHandicap}</span>
                        </div>
                        <div>
                          <p className="text-base font-black text-[#0a3a2a] leading-tight">{t(band.labelKey)}</p>
                          <p className="text-[9px] font-bold text-gray-500 mt-0.5 leading-snug">{t(band.descKey)}</p>
                        </div>
                      </div>
                      <div className="space-y-1">
                        {HANDICAP_BANDS.map((b, i) => {
                          const isActive = userHandicap <= b.max && (i === 0 || userHandicap > HANDICAP_BANDS[i-1].max);
                          return (
                            <div key={b.labelKey} className={`flex items-center gap-2 px-2 py-1.5 rounded-xl transition-all ${isActive ? 'bg-gray-50 border border-gray-200' : 'opacity-40'}`}>
                              <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: b.bg }} />
                              <span className="text-[9px] font-black text-[#0a3a2a] w-6 shrink-0">{i === 0 ? '≤10' : `≤${b.max}`}</span>
                              <span className="text-[9px] font-bold text-gray-500 flex-1">{t(b.labelKey)}</span>
                              {isActive && <span className="material-symbols-outlined text-[12px] text-emerald-500">arrow_back</span>}
                            </div>
                          );
                        })}
                      </div>
                      <p className="text-[8px] font-bold text-gray-400 mt-3 leading-snug">
                        {t('home.handicapDesc', 'Normalizacja do referencji olimpijskiej (70m / 122cm). Im niższy — tym lepiej.')}
                      </p>
                    </>
                  );
                })() : (
                  <>
                    <div className="space-y-1 mb-3">
                      {HANDICAP_BANDS.map((b, i) => (
                        <div key={b.labelKey} className="flex items-center gap-2 px-2 py-1.5 rounded-xl opacity-50">
                          <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: b.bg }} />
                          <span className="text-[9px] font-black text-[#0a3a2a] w-6 shrink-0">{i === 0 ? '≤10' : `≤${b.max}`}</span>
                          <span className="text-[9px] font-bold text-gray-500 flex-1">{t(b.labelKey)}</span>
                        </div>
                      ))}
                    </div>
                    <div className="bg-[#0a3a2a]/5 border border-[#0a3a2a]/10 rounded-xl px-3 py-2.5 flex items-center gap-2">
                      <span className="material-symbols-outlined text-[#0a3a2a] text-[16px] shrink-0">info</span>
                      <p className="text-[9px] font-bold text-[#0a3a2a] leading-snug">
                        {t('home.handicapEmpty', 'Twój handicap zostanie obliczony automatycznie po pierwszej zapisanej sesji treningowej.')}
                      </p>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Jak zdobywać XP */}
            <div className="px-4 pb-4 pt-2">
              <div className="bg-[#0a3a2a]/5 border border-[#0a3a2a]/10 rounded-2xl p-4">
                <p className="text-[9px] font-black text-[#0a3a2a] uppercase tracking-widest mb-3 flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[14px]">bolt</span>
                  {t('home.xpHowTitle', 'Jak zdobywać XP?')}
                </p>
                <div className="space-y-2">
                  <div className="flex items-start gap-2">
                    <span className="w-5 h-5 bg-[#0a3a2a] rounded-full flex items-center justify-center shrink-0 mt-0.5">
                      <span className="text-[9px] font-black text-[#fed33e]">1</span>
                    </span>
                    <div>
                      <p className="text-[10px] font-black text-[#0a3a2a] leading-tight">{t('home.xpPerSession', 'Za każdą sesję treningową:')}</p>
                      <p className="text-[9px] font-bold text-gray-500 mt-0.5 leading-snug">
                        <span className="font-black text-[#0a3a2a]">{t('home.xpFormula')}</span>
                      </p>
                    </div>
                  </div>
                  <div className="bg-white rounded-xl px-3 py-2 border border-gray-100">
                    <p className="text-[8px] font-black text-gray-400 uppercase tracking-wide mb-1">{t('home.xpExample', 'Przykład')}</p>
                    <p className="text-[9px] font-bold text-gray-600 leading-snug">
                      {t('home.xpExampleText', '60 strzałów, wynik 510 pkt → średnia 8,5')}<br/>
                      <span className="font-black text-[#0a3a2a]">60 × 1 + 8,5 × 10 = <span className="text-emerald-600">145 XP</span></span>
                    </p>
                  </div>
                  <div className="flex items-start gap-2 pt-1">
                    <span className="w-5 h-5 bg-orange-500 rounded-full flex items-center justify-center shrink-0 mt-0.5">
                      <span className="text-[9px] font-black text-white">!</span>
                    </span>
                    <p className="text-[9px] font-bold text-gray-500 leading-snug">
                      {t('home.xpHighRankNote', 'Rangi 7–10 (RED / GOLD) wymagają dodatkowo minimalnej średniej z ostatnich 10 sesji.')}
                    </p>
                  </div>
                </div>
              </div>

              <button
                onClick={() => setIsRankInfoOpen(false)}
                className="w-full mt-3 py-3.5 bg-[#0a3a2a] text-white rounded-2xl font-black uppercase text-[10px] tracking-widest active:scale-95 transition-all"
              >
                {t('home.close')}
              </button>
            </div>{/* koniec px-4 pb-4 */}

            </div>{/* koniec overflow-y-auto */}
          </div>
        </div>,
        document.body
      )}

      {/* ─── MODAL: Krzywa ostatnich 10 treningów ─────────────────────────── */}
      {showTrendModal && recentScores.length >= 2 && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-[200000] bg-black/70 backdrop-blur-sm flex items-start justify-center p-4 pt-[max(1.5rem,env(safe-area-inset-top))] animate-fade-in-up overflow-y-auto"
          onClick={() => setShowTrendModal(false)}
        >
          <div
            className="bg-[#fcfdfe] w-full max-w-md rounded-[32px] shadow-2xl p-6"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-5">
              <div>
                <span className="text-[9px] font-black text-emerald-600 uppercase tracking-widest block leading-none mb-0.5">{t('home.trendModal.subtitle')}</span>
                <h2 className="text-xl font-black text-[#0a3a2a] leading-tight">{t('home.trendModal.title')}</h2>
              </div>
              <button onClick={() => setShowTrendModal(false)} className="w-9 h-9 bg-gray-100 rounded-full flex items-center justify-center text-gray-500 active:scale-90 transition-all">
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>

            {(() => {
              const W = 300, H = 100, pad = 12;
              const allSessions = recentSessions.length >= 2
                ? recentSessions
                : recentScores.map(s => ({ score: s, date: '', distance: '', type: 'Trening', ts: 0 }));

              const availTypes = Array.from(new Set(allSessions.map(s => s.type || 'Trening')));
              const availDists = Array.from(new Set(allSessions.map(s => s.distance).filter(Boolean))).sort();

              const sessionsForModal = allSessions.filter(s => {
                const typeOk = !trendFilterType || (s.type || 'Trening') === trendFilterType;
                const distOk = !trendFilterDist || s.distance === trendFilterDist;
                return typeOk && distOk;
              });

              const scores = sessionsForModal.map(s => s.score);
              const minS = scores.length ? Math.min(...scores) : 0;
              const maxS = scores.length ? Math.max(...scores) : 0;
              const range = maxS - minS || 1;
              const pts = scores.map((s, i) => ({
                x: pad + (i / Math.max(scores.length - 1, 1)) * (W - pad * 2),
                y: H - pad - ((s - minS) / range) * (H - pad * 2),
                s,
              }));
              const polyline = pts.map(p => `${p.x},${p.y}`).join(' ');
              const maxIdx = scores.indexOf(maxS);
              const minIdx = scores.lastIndexOf(minS);
              return (
                <>
                  {availTypes.length > 1 && (
                    <div className="flex gap-1.5 flex-wrap mb-2">
                      <button onClick={() => setTrendFilterType('')}
                        className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border transition-all ${!trendFilterType ? 'bg-[#0a3a2a] text-white border-[#0a3a2a]' : 'bg-white text-gray-400 border-gray-200'}`}>
                        Alle
                      </button>
                      {availTypes.map(type => {
                        const lbl = type === 'Turniej' ? t('home.trendModal.typeTournament') : type === 'Arena' ? t('home.trendModal.typeArena') : type === 'WORLD_BATTLE' ? 'World' : t('home.trendModal.typeTraining');
                        const active = trendFilterType === type;
                        const col = active
                          ? type === 'Turniej' ? 'bg-[#0a3a2a] text-white border-[#0a3a2a]'
                          : type === 'Arena' ? 'bg-blue-500 text-white border-blue-500'
                          : 'bg-[#fed33e] text-[#5d4a00] border-[#e5bd38]'
                          : 'bg-white text-gray-400 border-gray-200';
                        return (
                          <button key={type} onClick={() => setTrendFilterType(active ? '' : type)}
                            className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border transition-all ${col}`}>
                            {lbl}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {availDists.length > 1 && (
                    <div className="flex gap-1.5 flex-wrap mb-3">
                      <button onClick={() => setTrendFilterDist('')}
                        className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border transition-all ${!trendFilterDist ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-gray-400 border-gray-200'}`}>
                        Alle
                      </button>
                      {(availDists as string[]).map((dist: string) => (
                        <button key={dist} onClick={() => setTrendFilterDist(trendFilterDist === dist ? '' : dist)}
                          className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border transition-all ${trendFilterDist === dist ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-gray-400 border-gray-200'}`}>
                          {dist}
                        </button>
                      ))}
                    </div>
                  )}

                  {scores.length >= 1 ? (
                    <div className="bg-[#0a3a2a] rounded-2xl p-4 mb-4">
                      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ overflow: 'visible' }}>
                        <defs>
                          <linearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#fed33e" stopOpacity="0.2" />
                            <stop offset="100%" stopColor="#fed33e" stopOpacity="0" />
                          </linearGradient>
                        </defs>
                        {scores.length >= 2 && (
                          <>
                            <polygon points={`${pts[0].x},${H} ${polyline} ${pts[pts.length-1].x},${H}`} fill="url(#trendGrad)" />
                            <polyline points={polyline} fill="none" stroke="#fed33e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                          </>
                        )}
                        {pts.map((p, i) => {
                          const isMax = i === maxIdx;
                          const isMin = i === minIdx;
                          const isLast = i === pts.length - 1;
                          const color = isMax ? '#22c55e' : isMin ? '#ef4444' : isLast ? '#fed33e' : 'rgba(255,255,255,0.4)';
                          const r = (isMax || isMin || isLast) ? 5 : 3;
                          return (
                            <g key={i}>
                              <circle cx={p.x} cy={p.y} r={r} fill={color} />
                              {(isMax || isMin || isLast) && (
                                <text x={p.x} y={p.y - 9} fontSize="8" fontWeight="bold" textAnchor="middle" fill={color}>{p.s}</text>
                              )}
                            </g>
                          );
                        })}
                      </svg>
                    </div>
                  ) : (
                    <div className="bg-[#0a3a2a] rounded-2xl p-6 mb-4 flex items-center justify-center opacity-50">
                      <span className="text-white text-[10px] font-black uppercase tracking-widest">{t('home.trendModal.noData')}</span>
                    </div>
                  )}

                  <div className="space-y-1.5">
                    {[...sessionsForModal].reverse().map((sess, i) => {
                      const isTurniej = sess.type === 'Turniej';
                      const isArena = sess.type === 'Arena';
                      const dot = isTurniej ? 'bg-[#0a3a2a]' : isArena ? 'bg-blue-500' : 'bg-[#fed33e]';
                      const label = isTurniej
                        ? ((sess as any).title || t('home.trendModal.typeTournament'))
                        : isArena ? t('home.trendModal.typeArena') : t('home.trendModal.typeTraining');
                      const dateStr = sess.ts
                        ? (() => { const d = new Date(sess.ts); return `${d.getDate().toString().padStart(2,'0')}.${(d.getMonth()+1).toString().padStart(2,'0')}`; })()
                        : '';
                      const isoDate = sess.date || (sess.ts ? new Date(sess.ts).toISOString().split('T')[0] : '');
                      const handleSessionClick = isoDate ? () => {
                        setShowTrendModal(false);
                        onNavigate?.('STATS', undefined, isoDate);
                      } : undefined;
                      return (
                        <div
                          key={i}
                          className={`flex items-center justify-between bg-gray-50 rounded-xl px-3 py-2 border border-gray-100 transition-all ${handleSessionClick ? 'cursor-pointer active:scale-[0.98] active:bg-gray-100' : ''}`}
                          onClick={handleSessionClick}
                        >
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <span className={`w-2 h-2 rounded-full shrink-0 ${dot}`} />
                            <span className="text-[9px] font-black text-gray-500 truncate">{label}</span>
                            <span className="text-[9px] font-bold text-gray-300 shrink-0">{sess.distance}</span>
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            {dateStr && <span className="text-[9px] font-bold text-gray-300">{dateStr}</span>}
                            <span className="text-sm font-black text-[#0a3a2a]">{sess.score}</span>
                            {handleSessionClick && <span className="material-symbols-outlined text-gray-300" style={{ fontSize: 14 }}>chevron_right</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              );
            })()}
          </div>
        </div>,
        document.body
      )}

      <style>{`
        .animate-fade-in-up { animation: fadeInUp 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        .animate-bounce-slow { animation: bounceSlow 4s infinite ease-in-out; }
        @keyframes fadeInUp { from { opacity: 0; translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes bounceSlow { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-8px); } }
      `}</style>
    </div>
  );
}