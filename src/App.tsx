import React, { useState, useEffect, useRef, Suspense } from 'react';
import { db, auth } from './firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, onSnapshot, collection, query, getDocs, deleteDoc, setDoc, serverTimestamp, updateDoc, increment, getDoc } from 'firebase/firestore';
import { getRecommendation, BowType } from './config/archeryRules';
import { useTranslation } from 'react-i18next';

// EAGER: widoki potrzebne przy pierwszym renderze (HOME / AUTH) oraz
// komponenty-helpery, które muszą być dostępne od razu.
import HomeView from './views/HomeView';
import SessionSetup from './components/SessionSetup';
import SmartSeasonUpdater from './components/SmartSeasonUpdater';
import ParentalConsentGate from './components/ParentalConsentGate';
import AuthView from './views/AuthView';
import CoachInvitePopup from './components/CoachInvitePopup';
import BattleInvitePopup from './components/BattleInvitePopup';
import ViewErrorBoundary from './components/ViewErrorBoundary';
import { lazyWithRetry } from './utils/lazyWithRetry';
import { migrateArrowModel } from './utils/migrateArrowModel';
import { syncPublicProfile } from './utils/publicProfile';
import { loadPrivateProfile, migrateSensitiveFields } from './utils/privateProfile';

// LAZY: ciężkie widoki ładowane dopiero przy nawigacji.
// Każdy widok = osobny chunk JS pobierany w tle (code splitting).
// lazyWithRetry: jeśli chunk failuje (np. po deploy z nowymi hashami), robi
// hard reload zamiast pokazywać biały ekran.
const ScoringView         = lazyWithRetry(() => import('./views/ScoringView'));
const SettingsView        = lazyWithRetry(() => import('./views/SettingsView'));
const CalendarView        = lazyWithRetry(() => import('./views/CalendarView'));
const BattleLobbyView     = lazyWithRetry(() => import('./views/BattleLobbyView'));
const BattleHistoryView   = lazyWithRetry(() => import('./views/BattleHistoryView'));
const WorldLeaderboardView = lazyWithRetry(() => import('./views/WorldLeaderboardView'));
const AnnouncementsView   = lazyWithRetry(() => import('./views/AnnouncementsView'));
const StatsView           = lazyWithRetry(() => import('./views/StatsView'));
const AdminDashboardView  = lazyWithRetry(() => import('./views/AdminDashboardView'));
const CoachDashboardView  = lazyWithRetry(() => import('./views/CoachDashboardView'));
const StudentProfileView  = lazyWithRetry(() => import('./views/StudentProfileView'));
const MyCoachView         = lazyWithRetry(() => import('./views/MyCoachView'));
const DelayMirrorView     = lazyWithRetry(() => import('./views/DelayMirrorView'));

// Fallback pokazywany podczas ładowania chunka (zwykle <100ms).
const ViewFallback = () => (
  <div className="flex items-center justify-center min-h-[60vh]">
    <div className="w-10 h-10 border-4 border-[#0a3a2a] border-t-transparent rounded-full animate-spin" />
  </div>
);

type AppView = 'HOME' | 'SETUP' | 'SCORING' | 'SETTINGS' | 'CALENDAR' | 'STATS' | 'BATTLE_LOBBY' | 'BATTLE_HISTORY' | 'ANNOUNCEMENTS' | 'ADMIN' | 'COACH' | 'STUDENT_PROFILE' | 'WORLD_LEADERBOARD' | 'DELAY_MIRROR' | 'MY_COACH';

export default function App() {
  const { t } = useTranslation();
  const [user, setUser] = useState<User | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [showSplash, setShowSplash] = useState(true); 
  const [isDataReady, setIsDataReady] = useState(false);
  const [fadeOutSplash, setFadeOutSplash] = useState(false);

  const [currentView, setCurrentView] = useState<AppView>('HOME');
  const [settingsTab, setSettingsTab] = useState<'PROFIL' | 'VISIER' | 'PFEILE' | 'BOGEN' | 'JEZYK' | 'PRO' | 'TRENER' | 'ZAWODY'>('PROFIL');
  const [sessionDistance, setSessionDistance] = useState<string>('70m');
  const [sessionTargetType, setSessionTargetType] = useState<string>('Full');
  const [sessionPracticeArrows, setSessionPracticeArrows] = useState<number>(0);
  
  const [focusedEventId, setFocusedEventId] = useState<string | null>(null);
  const [focusedDate, setFocusedDate] = useState<string | null>(null);
  const [focusedSessionId, setFocusedSessionId] = useState<string | null>(null);
  
  const [viewingStudentId, setViewingStudentId] = useState<string | null>(null);
  
  const [userDistances, setUserDistances] = useState<any[]>([]);
  const [isCoach, setIsCoach] = useState<boolean>(false);
  const [hasCoach, setHasCoach] = useState<boolean>(false);
  const [userLevel, setUserLevel] = useState<number>(1);

  // NOWE: trzymamy userClub w App.tsx żeby przekazać do AnnouncementsView
  const [userClub, setUserClub] = useState<string>('');

  const [activeBattleId, setActiveBattleId] = useState<string | null>(null);
  const [pendingMessageSenderId, setPendingMessageSenderId] = useState<string | null>(null);
  const [pendingMyCoachTab, setPendingMyCoachTab] = useState<string | null>(null);
  const [autoStartWizard, setAutoStartWizard] = useState<boolean>(false);
  const [hasActiveSession, setHasActiveSession] = useState<boolean>(false);

  // Pętla ochronna dla jednorazowego fallback-write trialEndsAt:
  // próbujemy MAX raz na sesję, niezależnie od wyniku. Bez tego optimistic
  // update / server reject Firestore'a tworzy pętlę 50+ błędów.
  const trialFallbackAttemptedRef = useRef(false);
  const privateMigrationAttemptedRef = useRef(false);

  // --- WAKE LOCK (Globalna blokada gaszenia ekranu) ---
  useEffect(() => {
    let wakeLock: any = null;

    const requestWakeLock = async () => {
      try {
        if ('wakeLock' in navigator) {
          wakeLock = await (navigator as any).wakeLock.request('screen');
          console.log('Wake Lock aktywny - ekran nie zgaśnie.');
        }
      } catch (err: any) {
        console.warn(`Błąd Wake Lock: ${err.message}`);
      }
    };

    const handleVisibilityChange = async () => {
      if (wakeLock !== null && document.visibilityState === 'visible') {
        await requestWakeLock();
      }
    };

    requestWakeLock();
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (wakeLock) {
        wakeLock.release();
      }
    };
  }, []);
  // ----------------------------------------------------

  useEffect(() => {
    const timer = setTimeout(() => {
      setShowSplash(false);
    }, 900);
    return () => clearTimeout(timer);
  }, []);

  // [C14] Historia przeglądarki: systemowy przycisk "wstecz" (Android/PWA)
  // cofa widok zamiast zamykać aplikację. handleNavigate/handleStartSession
  // pushują stan; popstate przywraca poprzedni widok. Google odrzuca w review
  // TWA, w których back natychmiast zabija appkę.
  useEffect(() => {
    window.history.replaceState({ view: 'HOME' }, '');
    const onPopState = (e: PopStateEvent) => {
      const v: AppView = (e.state && e.state.view) || 'HOME';
      setCurrentView(v);
      if (v !== 'STATS' && v !== 'STUDENT_PROFILE') setViewingStudentId(null);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setIsAuthLoading(false);
      if (!currentUser) { setIsDataReady(true); setCurrentView('HOME'); }
      if (currentUser) migrateArrowModel(currentUser.uid).catch(() => {});
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const checkActiveSession = () => {
      const session = localStorage.getItem('grotX_activeSession');
      setHasActiveSession(!!session);
    };

    checkActiveSession();
    window.addEventListener('session_state_changed', checkActiveSession);
    
    return () => {
      window.removeEventListener('session_state_changed', checkActiveSession);
    };
  }, []);

  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(doc(db, 'users', user.uid), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();

        // [RODO C6] Lustro publicznego profilu — users/{uid} nie jest już
        // czytelny dla obcych; popupy zaproszeń i lobby czytają profiles_public.
        // Zapis tylko przy realnej zmianie treści (cache w syncPublicProfile).
        syncPublicProfile(user.uid, data).catch(() => {});
        if (data.userDistances && data.userDistances.length > 0) {
          setUserDistances(data.userDistances);
        } else {
          // Brak dystansów — generujemy na podstawie danych profilu (wiek, płeć, łuk).
          // [RODO C21] birthDate/gender żyją w users/{uid}/private/profile;
          // data.birthDate to fallback dla kont sprzed migracji.
          const allDists = ['18m', '20m', '25m', '30m', '35m', '40m', '50m', '60m', '70m', '90m'];
          const applyRecommended = (birthDate: string, gender: 'M' | 'K') => {
            const birthYear = new Date(birthDate).getFullYear();
            const bow = data.bowType as BowType;
            const recH = getRecommendation(bow, birthYear, 'Hala (Indoor)', gender);
            const recT = getRecommendation(bow, birthYear, 'Tory (Outdoor)', gender);
            setUserDistances(allDists.map(m => ({
              m,
              active: m === recH.distance || m === recT.distance,
              targetType: m === recH.distance ? recH.targetType : m === recT.distance ? recT.targetType : '122cm',
              sightExtension: '', sightHeight: '', sightSide: '', sightMark: ''
            })));
          };
          const applyMinimal = () => {
            // Brak danych profilu (nowy użytkownik przed wizardem) — minimalne defaults
            setUserDistances(allDists.map(m => ({
              m, active: m === '18m' || m === '70m',
              targetType: '122cm', sightExtension: '', sightHeight: '', sightSide: '', sightMark: ''
            })));
          };
          if (data.birthDate && data.bowType) {
            applyRecommended(data.birthDate, data.gender || 'M');
          } else if (data.bowType) {
            loadPrivateProfile(user.uid).then(priv => {
              if (priv?.birthDate) applyRecommended(priv.birthDate, priv.gender || 'M');
              else applyMinimal();
            }).catch(applyMinimal);
          } else {
            applyMinimal();
          }
        }
        
        setIsCoach(!!data.isCoach);
        setHasCoach(Array.isArray(data.coaches) && data.coaches.length > 0);
        setUserLevel(data.level || 1);

        // NOWE: zapisujemy klub użytkownika żeby AnnouncementsView mógł filtrować ogłoszenia klubowe
        const cName = data.clubName || '';
        const cCity = data.clubCity || '';
        const parts = [];
        if (data.showClub !== false && cName) parts.push(cName);
        if (data.showRegion !== false && cCity) parts.push(cCity);
        setUserClub(parts.length > 0 ? parts.join(' - ') : '');

        // Jednorazowy fallback dla starych kont bez trialEndsAt.
        // Reguła Firestore (Path B) pozwala na jednorazowy zapis gdy pole
        // nie istnieje w dokumencie. Ref chroni przed pętlą optimistic-revert.
        if (!data.trialEndsAt && !trialFallbackAttemptedRef.current) {
          trialFallbackAttemptedRef.current = true;
          setDoc(doc(db, 'users', user.uid), {
            trialEndsAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
          }, { merge: true }).catch(e => console.error('trialEndsAt fallback failed:', e));
        }

        // [RODO C21] Jednorazowa migracja pól wrażliwych (email/birthDate/gender)
        // do users/{uid}/private/profile — od tej pory reguły blokują ich obecność
        // w głównym dokumencie (czytelnym dla relacji trener↔uczeń).
        if (!privateMigrationAttemptedRef.current
            && (data.email !== undefined || data.birthDate !== undefined || data.gender !== undefined)) {
          privateMigrationAttemptedRef.current = true;
          migrateSensitiveFields(user.uid, data)
            .catch(e => console.error('Migracja pól prywatnych nieudana:', e));
        }

        if (!data.firstName) {
          setAutoStartWizard(true);
          setCurrentView('SETTINGS');
        } else {
          setAutoStartWizard(false);

          setCurrentView(prev => {
            const protectedViews: AppView[] = [
              'SCORING',
              'SETUP',
              'BATTLE_LOBBY',
              'BATTLE_HISTORY',
              'CALENDAR',
              'STATS',
              'ADMIN',
              'COACH',
              'MY_COACH',
              'STUDENT_PROFILE',
              'ANNOUNCEMENTS',
              'DELAY_MIRROR',
            ];
            if (protectedViews.includes(prev)) return prev;
            if (prev === 'SETTINGS') return prev;
            return 'HOME';
          });
        }
      } else {
        // Dokument nie istnieje — tworzymy go natychmiast z minimalnym rekordem
        // żeby użytkownik zawsze miał konto w Firebase nawet jeśli przerwie wizard
        setDoc(doc(db, 'users', user.uid), {
          uid: user.uid,
          createdAt: serverTimestamp(),
          trialEndsAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
        }, { merge: true }).catch(e => console.error('Błąd tworzenia profilu:', e));

        setAutoStartWizard(true);
        setCurrentView('SETTINGS');
      }
      setIsDataReady(true);
    }, (error) => {
      console.error("Błąd pobierania profilu:", error);
      setIsDataReady(true);
    });
    return () => unsub();
  }, [user]);

  useEffect(() => {
    if (isDataReady && !showSplash && !isAuthLoading) {
      setTimeout(() => {
        setFadeOutSplash(true);
      }, 100);
    }
  }, [isDataReady, showSplash, isAuthLoading]);

  const handleNavigate = (view: AppView, tab?: string, extraData?: string, optionalStudentId?: string) => {
    // [C14] Wpis w historii per zmiana widoku — patrz popstate-effect wyżej.
    if (view !== currentView) window.history.pushState({ view }, '');
    setCurrentView(view);
    
    if (view !== 'STATS' && view !== 'STUDENT_PROFILE') {
      setViewingStudentId(null);
    }

    if (view === 'SETTINGS') {
      if (tab) {
        setSettingsTab(tab as any);
      } else {
        setSettingsTab('PROFIL'); 
      }
    } else if (view === 'STATS' || view === 'STUDENT_PROFILE') {
      setFocusedDate(extraData || null);
      if (optionalStudentId) {
        setViewingStudentId(optionalStudentId);
      }
    } else if (view === 'CALENDAR') {
      setFocusedEventId(extraData || null);
    } else if (view === 'MY_COACH' || view === 'COACH') {
      setPendingMessageSenderId(extraData || null);
      if (view === 'MY_COACH') {
        setPendingMyCoachTab(tab || null);
      }
    }
  };

  const handleStartSession = async (distance: string, targetType: string, forceClear: boolean = true, battleId: string | null = null, practiceArrows: number = 0) => {
    if (!user) return;
    try {
      if (forceClear) {
        localStorage.removeItem('grotX_activeSession');
        window.dispatchEvent(new Event('session_state_changed'));

        const q = query(collection(db, `users/${user.uid}/scores`));
        const s = await getDocs(q);
        const deletePromises = s.docs.map(d => deleteDoc(doc(db, `users/${user.uid}/scores`, d.id)));
        await Promise.all(deletePromises);
      }
      
      setSessionDistance(distance);
      setSessionTargetType(targetType);
      setSessionPracticeArrows(practiceArrows);
      setActiveBattleId(battleId);
      // [C14] SCORING omija handleNavigate — wpis do historii ręcznie
      if (currentView !== 'SCORING') window.history.pushState({ view: 'SCORING' }, '');
      setCurrentView('SCORING');

      // Odejmij strzały próbne z profilu pfeilzaehler — są już zapisane w sesji,
      // żeby nie liczyć ich podwójnie w statystykach miesięcznych
      if (practiceArrows > 0) {
        const today = new Date();
        const dayKey = `${today.getFullYear()}_${String(today.getMonth() + 1).padStart(2, '0')}_${String(today.getDate()).padStart(2, '0')}`;
        const monthKey = `${today.getFullYear()}_${String(today.getMonth() + 1).padStart(2, '0')}`;
        const userRef = doc(db, 'users', user.uid);
        const snap = await getDoc(userRef);
        if (snap.exists()) {
          const pz = snap.data().pfeilzaehler || {};
          const updates: Record<string, any> = {};
          // Odejmij od klucza dziennego (nowy format)
          if ((pz[dayKey] || 0) > 0) {
            const newVal = Math.max(0, (pz[dayKey] || 0) - practiceArrows);
            updates[`pfeilzaehler.${dayKey}`] = newVal > 0 ? newVal : null;
          }
          // Odejmij od klucza miesięcznego (stary format) jeśli istnieje
          if ((pz[monthKey] || 0) > 0) {
            const newVal = Math.max(0, (pz[monthKey] || 0) - practiceArrows);
            updates[`pfeilzaehler.${monthKey}`] = newVal > 0 ? newVal : null;
          }
          if (Object.keys(updates).length > 0) {
            updateDoc(userRef, updates).catch(() => {});
          }
        }
      }
    } catch (error) {
      console.error("Błąd startu sesji:", error);
    }
  };

  const handleGoToBattle = (distance: string, targetType: string) => {
    setSessionDistance(distance);
    setSessionTargetType(targetType);
    handleNavigate('BATTLE_LOBBY');
  };

  const renderBottomNav = () => {
    const hiddenViews: AppView[] = ['SETUP', 'BATTLE_LOBBY', 'BATTLE_HISTORY', 'SCORING', 'ANNOUNCEMENTS', 'ADMIN', 'STUDENT_PROFILE', 'WORLD_LEADERBOARD', 'DELAY_MIRROR'];
    if (hiddenViews.includes(currentView)) return null;

    return (
      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md z-[100]">
        <div className="relative h-20 w-full px-2">
          <svg viewBox="0 0 390 80" preserveAspectRatio="none" className="absolute inset-0 w-full h-full pointer-events-none" style={{filter:'drop-shadow(0 -6px 16px rgba(0,0,0,0.08))'}}>
            <path d="M0,0 H148 C158,0 165,36 195,36 C225,36 232,0 242,0 H390 V80 H0 Z" fill="white"/>
          </svg>
        <div className="flex justify-between items-center h-full w-full relative">
          
          <div className="flex flex-1 justify-evenly items-center h-full">
            <button onClick={() => handleNavigate('HOME')} className={`flex flex-col items-center ${currentView === 'HOME' ? 'text-[#0a3a2a]' : 'text-gray-400'}`}>
              <span className="material-symbols-outlined text-[26px] font-bold">home</span>
              {currentView === 'HOME' && <span className="text-[8px] font-black uppercase mt-0.5">{t('nav.home')}</span>}
            </button>
            <button onClick={() => { setFocusedEventId(null); handleNavigate('CALENDAR'); }} className={`flex flex-col items-center ${currentView === 'CALENDAR' ? 'text-[#0a3a2a]' : 'text-gray-400'}`}>
              <span className="material-symbols-outlined text-[26px] font-bold">event_note</span>
              {currentView === 'CALENDAR' && <span className="text-[8px] font-black uppercase mt-0.5">{t('nav.calendar')}</span>}
            </button>
            <button onClick={() => handleNavigate('MY_COACH')} className={`flex flex-col items-center ${currentView === 'MY_COACH' ? 'text-[#0a3a2a]' : 'text-gray-400'}`}>
              <span className="material-symbols-outlined text-[26px] font-bold">school</span>
              {currentView === 'MY_COACH' && <span className="text-[8px] font-black uppercase mt-0.5">{t('nav.myCoach')}</span>}
            </button>
          </div>
          
          <div className="relative -top-7 w-20 shrink-0 flex flex-col items-center z-50">
            {hasActiveSession && (
              <div className="absolute top-0 right-1 w-4 h-4 bg-red-500 rounded-full border-2 border-white z-20 animate-pulse shadow-sm"></div>
            )}
            <button 
              onClick={() => hasActiveSession ? handleNavigate('SCORING') : handleNavigate('SETUP')} 
              className={`w-16 h-16 ${hasActiveSession ? 'bg-red-500 shadow-red-500/30' : 'bg-[#F2C94C] shadow-[#F2C94C]/30'} rounded-full shadow-lg border-4 border-white flex items-center justify-center active:scale-90 transition-all relative overflow-hidden`}
            >
                <div className="absolute inset-0 pointer-events-none">
                    <div className="absolute w-8 h-8 bg-white/20 rounded-full top-[-10%] left-[-10%] animate-pulse"></div>
                    <div className="absolute w-6 h-6 bg-white/10 rounded-full bottom-0 right-0 animate-bounce" style={{animationDuration: '3s'}}></div>
                </div>
                <span className="material-symbols-outlined text-white text-3xl font-black relative z-10">
                  {hasActiveSession ? 'play_arrow' : 'target'}
                </span>
            </button>
            <span className={`text-[9px] font-black ${hasActiveSession ? 'text-red-500' : 'text-[#8B6508]'} uppercase tracking-widest mt-1.5 bg-white/80 px-2 rounded-full shadow-sm`}>
              {hasActiveSession ? 'W TOKU' : 'Trening'}
            </span>
          </div>

          <div className="flex flex-1 justify-evenly items-center h-full">
            <button onClick={() => handleNavigate('STATS')} className={`flex flex-col items-center ${currentView === 'STATS' ? 'text-[#0a3a2a]' : 'text-gray-400'}`}>
              <span className="material-symbols-outlined text-[26px] font-bold">analytics</span>
              {currentView === 'STATS' && <span className="text-[8px] font-black uppercase mt-0.5">{t('nav.stats')}</span>}
            </button>

            {isCoach && (
              <button onClick={() => handleNavigate('COACH')} className={`flex flex-col items-center ${currentView === 'COACH' ? 'text-[#0a3a2a]' : 'text-gray-400'}`}>
                <span className="material-symbols-outlined text-[26px] font-bold">sports</span>
                {currentView === 'COACH' && <span className="text-[8px] font-black uppercase mt-0.5">{t('nav.coach')}</span>}
              </button>
            )}

            <button onClick={() => handleNavigate('SETTINGS')} className={`flex flex-col items-center ${currentView === 'SETTINGS' ? 'text-[#0a3a2a]' : 'text-gray-400'}`}>
              <span className="material-symbols-outlined text-[26px] font-bold">tune</span>
              {currentView === 'SETTINGS' && <span className="text-[8px] font-black uppercase mt-0.5">{t('nav.settings')}</span>}
            </button>
          </div>

        </div>
        </div>
        <div className="bg-white" style={{height:'env(safe-area-inset-bottom)'}}/>
      </div>
    );
  };

  if (!isAuthLoading && !user) return <AuthView />;

  return (
    <div className="min-h-screen bg-[#fcfdfe] text-[#333] font-sans relative overflow-x-hidden max-w-md mx-auto shadow-2xl">
      
      {(!isDataReady || !fadeOutSplash) && (
        <div className={`fixed inset-0 z-[100000] bg-[#fcfdfe] flex flex-col items-center justify-center transition-opacity duration-700 ${fadeOutSplash ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
           <div className="flex items-baseline relative h-20">
              <div className="animate-grot-train flex items-baseline">
                <span className="text-5xl font-black text-[#0a3a2a] tracking-tighter leading-none">GROT-</span>
              </div>
              <div className="animate-x-train flex items-baseline">
                <span className="text-5xl font-black text-[#0a3a2a] tracking-tighter leading-none">X</span>
                <div className="w-3 h-3 bg-[#fed33e] rounded-full ml-1.5 relative bottom-[0.48em] shadow-sm"></div>
              </div>
           </div>
           <style>{`
              @keyframes trainMove {
                0% { transform: translateX(-150vw); opacity: 0; }
                20% { opacity: 1; }
                70% { transform: translateX(10px); }
                100% { transform: translateX(0); opacity: 1; }
              }
              .animate-x-train { animation: trainMove 0.6s cubic-bezier(0.2, 0.9, 0.3, 1) forwards; }
              .animate-grot-train { animation: trainMove 0.6s cubic-bezier(0.2, 0.9, 0.3, 1) forwards; animation-delay: 0.2s; }
              @keyframes pulse-slow { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.08); } }
              .animate-pulse-slow { animation: pulse-slow 2.5s infinite ease-in-out; }
           `}</style>
        </div>
      )}

      <SmartSeasonUpdater userId={user?.uid || ''} />

      {/* [RODO art. 8] Bramka zgody opiekuna dla użytkowników < 16 lat.
          Blokuje aplikację małoletniemu bez potwierdzonej zgody rodzica. */}
      {user?.uid && <ParentalConsentGate userId={user.uid} />}

      {/* [BEZPIECZEŃSTWO] Globalny listener zaproszeń trenerskich — pokazuje
          popup "Trener X chce Cię obserwować" zanim coach dostanie dostęp.
          Zamontowany na poziomie App, więc widoczny na każdym ekranie. */}
      {user?.uid && <CoachInvitePopup userId={user.uid} />}
      {user?.uid && <BattleInvitePopup userId={user.uid} onJoinBattle={(battleId, dist, target) => handleStartSession(dist, target, true, battleId)} />}

      {(currentView !== 'HOME' && currentView !== 'SCORING' && currentView !== 'ANNOUNCEMENTS' && currentView !== 'COACH' && currentView !== 'STUDENT_PROFILE' && currentView !== 'ADMIN' && currentView !== 'BATTLE_LOBBY' && currentView !== 'DELAY_MIRROR' && currentView !== 'MY_COACH') && (
        <button 
          onClick={() => handleNavigate('HOME')} 
          className="absolute top-5 left-4 z-[110] px-3 py-2 bg-white/90 backdrop-blur-md rounded-2xl shadow-sm border border-gray-100 text-gray-600 active:scale-95 transition-all flex items-center gap-1.5 hover:bg-gray-50"
        >
          <span className="material-symbols-outlined text-[16px] font-black">arrow_back_ios_new</span>
          <span className="material-symbols-outlined text-[20px]">home</span>
        </button>
      )}
      
      <main className={`w-full min-h-screen pb-24 transition-all duration-500 ${fadeOutSplash ? 'blur-0 scale-100' : 'blur-md scale-95'}`}>
      <ViewErrorBoundary>
      <Suspense fallback={<ViewFallback />}>
        {currentView === 'HOME' && <HomeView userId={user?.uid || ''} isCoach={isCoach} onNewSession={() => handleNavigate('SETUP')} onGoToCalendar={(id?: string) => handleNavigate('CALENDAR', undefined, id)} onGoToStats={(date?: string) => handleNavigate('STATS', undefined, date)} onGoToBattles={() => handleNavigate('BATTLE_HISTORY')} onJoinBattle={(battleId, dist, target) => handleStartSession(dist, target, true, battleId)} onNavigate={(view, tab, extraData) => handleNavigate(view as AppView, tab, extraData)} />}
        
        {currentView === 'SETUP' && <SessionSetup userId={user?.uid || ''} activeDistances={userDistances.filter(d => d.active)} onStartSession={handleStartSession} onNavigate={(view, tab) => handleNavigate(view as any, tab)} onGoToBattle={handleGoToBattle} hasActiveSession={hasActiveSession as any} />}
        
        {currentView === 'SCORING' && <ScoringView userId={user?.uid || ''} distance={sessionDistance} targetType={sessionTargetType} battleId={activeBattleId} practiceArrows={sessionPracticeArrows} onNavigate={handleNavigate} />}
        {currentView === 'SETTINGS' && <SettingsView userId={user?.uid || ''} userEmail={user?.email || ''} distances={userDistances} initialTab={settingsTab} autoStartWizard={autoStartWizard} onToggleDistance={(idx: number) => {const n=[...userDistances]; n[idx].active=!n[idx].active; setUserDistances(n);}} onUpdateTargetType={(idx:number, t:string)=>{const n=[...userDistances]; n[idx].targetType=t; setUserDistances(n);}} onUpdateAllDistances={setUserDistances} onNavigate={handleNavigate as any} />}
        
        {currentView === 'BATTLE_LOBBY' && (
          <BattleLobbyView
            userId={user?.uid || ''}
            distance={sessionDistance}
            targetType={sessionTargetType}
            onStartBattle={(battleId) => handleStartSession(sessionDistance, sessionTargetType, true, battleId)}
            onBack={() => handleNavigate('HOME')}
          />
        )}
        
        {currentView === 'BATTLE_HISTORY' && <BattleHistoryView userId={user?.uid || ''} onBack={() => handleNavigate('HOME')} />}
        {currentView === 'WORLD_LEADERBOARD' && <WorldLeaderboardView userLevel={userLevel} onBack={() => handleNavigate('HOME')} />}
        {currentView === 'CALENDAR' && <CalendarView userId={user?.uid || ''} focusedEventId={focusedEventId} clearFocusedEvent={() => setFocusedEventId(null)} onNavigate={(view, tab, extraData) => handleNavigate(view as AppView, tab, extraData)} />}
        
        {currentView === 'STATS' && (
          <StatsView
            userId={user?.uid || ''}
            viewingStudentId={viewingStudentId}
            onNavigate={(view: string, tab?: string) => handleNavigate(view as AppView, tab)}
            initialDate={focusedDate || undefined}
            initialSessionId={focusedSessionId || undefined}
          />
        )}

        {currentView === 'STUDENT_PROFILE' && (
           <StudentProfileView 
             coachId={user?.uid || ''} 
             studentId={viewingStudentId || ''} 
             onNavigate={(view, tab, extraData, studentId) => handleNavigate(view as AppView, tab, extraData, studentId)} 
           />
        )}

        {/* POPRAWKA: dodano userId i userClub – bez nich AnnouncementsView
            nie wiedział czyje ogłoszenia pobrać ani nie mógł skasować czerwonej kropki */}
        {currentView === 'ANNOUNCEMENTS' && (
          <AnnouncementsView
            userId={user?.uid || ''}
            userClub={userClub}
            onNavigate={(view) => handleNavigate(view as AppView)}
          />
        )}

        {currentView === 'ADMIN' && ['info@aves-24.de', 'rafal.woropaj@googlemail.com'].includes(user?.email || '') && (
          <AdminDashboardView onNavigate={(view) => handleNavigate(view as AppView)} />
        )}
        {currentView === 'COACH' && <CoachDashboardView userId={user?.uid || ''} onNavigate={(view, tab, extraData, studentId) => handleNavigate(view as AppView, tab, extraData, studentId)} pendingOpenStudentId={pendingMessageSenderId} onClearPending={() => setPendingMessageSenderId(null)} />}
        {currentView === 'DELAY_MIRROR' && <DelayMirrorView onBack={() => handleNavigate('HOME')} />}
        {currentView === 'MY_COACH' && <MyCoachView userId={user?.uid || ''} onBack={() => handleNavigate('HOME')} onNavigateToSettings={() => handleNavigate('SETTINGS')} onNavigateToStats={(date, sessionId) => { handleNavigate('STATS', undefined, date); setFocusedSessionId(sessionId || null); }} pendingOpenCoachId={pendingMessageSenderId} onClearPending={() => setPendingMessageSenderId(null)} pendingInitialTab={pendingMyCoachTab} onClearPendingTab={() => setPendingMyCoachTab(null)} />}
      </Suspense>
      </ViewErrorBoundary>
      </main>
      
      {renderBottomNav()}
    </div>
  );
}