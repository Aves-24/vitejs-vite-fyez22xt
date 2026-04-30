import React, { useState, useEffect, Suspense } from 'react';
import { db, auth } from './firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, onSnapshot, collection, query, getDocs, deleteDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { getRecommendation, BowType } from './config/archeryRules';
import { useTranslation } from 'react-i18next';

// EAGER: widoki potrzebne przy pierwszym renderze (HOME / AUTH) oraz
// komponenty-helpery, które muszą być dostępne od razu.
import HomeView from './views/HomeView';
import SessionSetup from './components/SessionSetup';
import SmartSeasonUpdater from './components/SmartSeasonUpdater';
import AuthView from './views/AuthView';
import CoachInvitePopup from './components/CoachInvitePopup';
import BattleInvitePopup from './components/BattleInvitePopup';

// LAZY: ciężkie widoki ładowane dopiero przy nawigacji.
// Każdy widok = osobny chunk JS pobierany w tle (code splitting).
const ScoringView         = React.lazy(() => import('./views/ScoringView'));
const SettingsView        = React.lazy(() => import('./views/SettingsView'));
const CalendarView        = React.lazy(() => import('./views/CalendarView'));
const BattleLobbyView     = React.lazy(() => import('./views/BattleLobbyView'));
const BattleHistoryView   = React.lazy(() => import('./views/BattleHistoryView'));
const WorldLeaderboardView = React.lazy(() => import('./views/WorldLeaderboardView'));
const AnnouncementsView   = React.lazy(() => import('./views/AnnouncementsView'));
const StatsView           = React.lazy(() => import('./views/StatsView'));
const AdminDashboardView  = React.lazy(() => import('./views/AdminDashboardView'));
const CoachDashboardView  = React.lazy(() => import('./views/CoachDashboardView'));
const StudentProfileView  = React.lazy(() => import('./views/StudentProfileView'));
const DelayMirrorView     = React.lazy(() => import('./views/DelayMirrorView'));

// Fallback pokazywany podczas ładowania chunka (zwykle <100ms).
const ViewFallback = () => (
  <div className="flex items-center justify-center min-h-[60vh]">
    <div className="w-10 h-10 border-4 border-[#0a3a2a] border-t-transparent rounded-full animate-spin" />
  </div>
);

type AppView = 'HOME' | 'SETUP' | 'SCORING' | 'SETTINGS' | 'CALENDAR' | 'STATS' | 'BATTLE_LOBBY' | 'BATTLE_HISTORY' | 'ANNOUNCEMENTS' | 'ADMIN' | 'COACH' | 'STUDENT_PROFILE' | 'WORLD_LEADERBOARD' | 'DELAY_MIRROR';

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
  
  const [focusedEventId, setFocusedEventId] = useState<string | null>(null);
  const [focusedDate, setFocusedDate] = useState<string | null>(null); 
  
  const [viewingStudentId, setViewingStudentId] = useState<string | null>(null);
  
  const [userDistances, setUserDistances] = useState<any[]>([]);
  const [isCoach, setIsCoach] = useState<boolean>(false);
  const [userLevel, setUserLevel] = useState<number>(1);

  // NOWE: trzymamy userClub w App.tsx żeby przekazać do AnnouncementsView
  const [userClub, setUserClub] = useState<string>('');

  const [activeBattleId, setActiveBattleId] = useState<string | null>(null); 
  const [autoStartWizard, setAutoStartWizard] = useState<boolean>(false);
  const [hasActiveSession, setHasActiveSession] = useState<boolean>(false);

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
    }, 1800); 
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setIsAuthLoading(false);
      if (!currentUser) setIsDataReady(true);
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
        if (data.userDistances && data.userDistances.length > 0) {
          setUserDistances(data.userDistances);
        } else {
          // Brak dystansów — generujemy na podstawie danych profilu (wiek, płeć, łuk)
          const allDists = ['18m', '20m', '25m', '30m', '35m', '40m', '50m', '60m', '70m', '90m'];
          if (data.birthDate && data.bowType) {
            const birthYear = new Date(data.birthDate).getFullYear();
            const gender: 'M' | 'K' = data.gender || 'M';
            const bow = data.bowType as BowType;
            const recH = getRecommendation(bow, birthYear, 'Hala (Indoor)', gender);
            const recT = getRecommendation(bow, birthYear, 'Tory (Outdoor)', gender);
            setUserDistances(allDists.map(m => ({
              m,
              active: m === recH.distance || m === recT.distance,
              targetType: m === recH.distance ? recH.targetType : m === recT.distance ? recT.targetType : '122cm',
              sightExtension: '', sightHeight: '', sightSide: '', sightMark: ''
            })));
          } else {
            // Brak danych profilu (nowy użytkownik przed wizardem) — minimalne defaults
            setUserDistances(allDists.map(m => ({
              m, active: m === '18m' || m === '70m',
              targetType: '122cm', sightExtension: '', sightHeight: '', sightSide: '', sightMark: ''
            })));
          }
        }
        
        setIsCoach(!!data.isCoach);
        setUserLevel(data.level || 1);

        // NOWE: zapisujemy klub użytkownika żeby AnnouncementsView mógł filtrować ogłoszenia klubowe
        const cName = data.clubName || '';
        const cCity = data.clubCity || '';
        const parts = [];
        if (data.showClub !== false && cName) parts.push(cName);
        if (data.showRegion !== false && cCity) parts.push(cCity);
        setUserClub(parts.length > 0 ? parts.join(' - ') : '');

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
    }
  };

  const handleStartSession = async (distance: string, targetType: string, forceClear: boolean = true, battleId: string | null = null) => {
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
      setActiveBattleId(battleId); 
      setCurrentView('SCORING');
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
    const hiddenViews: AppView[] = ['SETUP', 'BATTLE_LOBBY', 'BATTLE_HISTORY', 'SCORING', 'ANNOUNCEMENTS', 'ADMIN', 'COACH', 'STUDENT_PROFILE', 'WORLD_LEADERBOARD', 'DELAY_MIRROR'];
    if (hiddenViews.includes(currentView)) return null;

    return (
      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-white border-t border-gray-100 h-20 shadow-[0_-15px_40px_rgba(0,0,0,0.08)] z-[100] px-2 pb-[env(safe-area-inset-bottom)]">
        <div className="flex justify-between items-center h-full w-full relative">
          
          <div className="flex flex-1 justify-evenly items-center h-full">
            <button onClick={() => handleNavigate('HOME')} className={`flex flex-col items-center ${currentView === 'HOME' ? 'text-[#0a3a2a]' : 'text-gray-400'}`}>
              <span className="material-symbols-outlined text-[26px] font-bold">home</span>
              <span className="text-[8px] font-black uppercase mt-0.5">{t('nav.home')}</span>
            </button>
            <button onClick={() => { setFocusedEventId(null); handleNavigate('CALENDAR'); }} className={`flex flex-col items-center ${currentView === 'CALENDAR' ? 'text-[#0a3a2a]' : 'text-gray-400'}`}>
              <span className="material-symbols-outlined text-[26px] font-bold">event_note</span>
              <span className="text-[8px] font-black uppercase mt-0.5">{t('nav.calendar')}</span>
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
              <span className="text-[8px] font-black uppercase mt-0.5">{t('nav.stats')}</span>
            </button>

            {isCoach && (
              <button onClick={() => handleNavigate('COACH')} className={`flex flex-col items-center ${currentView === 'COACH' ? 'text-[#0a3a2a]' : 'text-gray-400'}`}>
                <span className="material-symbols-outlined text-[26px] font-bold">sports</span>
                <span className="text-[8px] font-black uppercase mt-0.5">Trener</span>
              </button>
            )}

            <button onClick={() => handleNavigate('SETTINGS')} className={`flex flex-col items-center ${currentView === 'SETTINGS' ? 'text-[#0a3a2a]' : 'text-gray-400'}`}>
              <span className="material-symbols-outlined text-[26px] font-bold">tune</span>
              <span className="text-[8px] font-black uppercase mt-0.5">{t('nav.settings')}</span>
            </button>
          </div>

        </div>
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

      <SmartSeasonUpdater />

      {/* [BEZPIECZEŃSTWO] Globalny listener zaproszeń trenerskich — pokazuje
          popup "Trener X chce Cię obserwować" zanim coach dostanie dostęp.
          Zamontowany na poziomie App, więc widoczny na każdym ekranie. */}
      {user?.uid && <CoachInvitePopup userId={user.uid} />}
      {user?.uid && <BattleInvitePopup userId={user.uid} onJoinBattle={(battleId, dist, target) => handleStartSession(dist, target, true, battleId)} />}

      {(currentView !== 'HOME' && currentView !== 'SCORING' && currentView !== 'ANNOUNCEMENTS' && currentView !== 'COACH' && currentView !== 'STUDENT_PROFILE' && currentView !== 'ADMIN' && currentView !== 'BATTLE_LOBBY' && currentView !== 'DELAY_MIRROR') && (
        <button 
          onClick={() => handleNavigate('HOME')} 
          className="absolute top-5 left-4 z-[110] px-3 py-2 bg-white/90 backdrop-blur-md rounded-2xl shadow-sm border border-gray-100 text-gray-600 active:scale-95 transition-all flex items-center gap-1.5 hover:bg-gray-50"
        >
          <span className="material-symbols-outlined text-[16px] font-black">arrow_back_ios_new</span>
          <span className="material-symbols-outlined text-[20px]">home</span>
        </button>
      )}
      
      <main className={`w-full min-h-screen pb-24 transition-all duration-500 ${fadeOutSplash ? 'blur-0 scale-100' : 'blur-md scale-95'}`}>
      <Suspense fallback={<ViewFallback />}>
        {currentView === 'HOME' && <HomeView userId={user?.uid || ''} isCoach={isCoach} onNewSession={() => handleNavigate('SETUP')} onGoToCalendar={(id?: string) => handleNavigate('CALENDAR', undefined, id)} onGoToStats={(date?: string) => handleNavigate('STATS', undefined, date)} onGoToBattles={() => handleNavigate('BATTLE_HISTORY')} onJoinBattle={(battleId, dist, target) => handleStartSession(dist, target, true, battleId)} onNavigate={(view, tab) => handleNavigate(view as AppView, tab)} />}
        
        {currentView === 'SETUP' && <SessionSetup userId={user?.uid || ''} activeDistances={userDistances.filter(d => d.active)} onStartSession={handleStartSession} onNavigate={(view, tab) => handleNavigate(view as any, tab)} onGoToBattle={handleGoToBattle} hasActiveSession={hasActiveSession as any} />}
        
        {currentView === 'SCORING' && <ScoringView userId={user?.uid || ''} distance={sessionDistance} targetType={sessionTargetType} battleId={activeBattleId} onNavigate={handleNavigate} />}
        {currentView === 'SETTINGS' && <SettingsView userId={user?.uid || ''} userEmail={user?.email || ''} distances={userDistances} initialTab={settingsTab} autoStartWizard={autoStartWizard} onToggleDistance={(idx: number) => {const n=[...userDistances]; n[idx].active=!n[idx].active; setUserDistances(n);}} onUpdateTargetType={(idx:number, t:string)=>{const n=[...userDistances]; n[idx].targetType=t; setUserDistances(n);}} onUpdateAllDistances={setUserDistances} onNavigate={handleNavigate} />}
        
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
        {currentView === 'CALENDAR' && <CalendarView userId={user?.uid || ''} focusedEventId={focusedEventId} clearFocusedEvent={() => setFocusedEventId(null)} onNavigate={(view, tab) => handleNavigate(view as AppView, tab)} />}
        
        {currentView === 'STATS' && (
          <StatsView 
            userId={user?.uid || ''} 
            viewingStudentId={viewingStudentId}
            onNavigate={(view, tab) => handleNavigate(view as AppView, tab)} 
            initialDate={focusedDate || undefined}
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
        {currentView === 'COACH' && <CoachDashboardView userId={user?.uid || ''} onNavigate={(view, tab, extraData, studentId) => handleNavigate(view as AppView, tab, extraData, studentId)} />}
        {currentView === 'DELAY_MIRROR' && <DelayMirrorView onBack={() => handleNavigate('HOME')} />}
      </Suspense>
      </main>
      
      {renderBottomNav()}
    </div>
  );
}