import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { db } from '../firebase';
import { collection, addDoc, doc, getDoc, updateDoc, arrayUnion, Timestamp, onSnapshot } from 'firebase/firestore';
import { calculateSessionXp, calculateRank } from '../utils/rankEngine';
import { updateWorldStatsOnly, WORLD_XP_PARTICIPATION, WORLD_XP_WIN } from '../utils/worldMatchmakingService';
import { calculateSessionHandicap, calculateCurrentHandicap } from '../utils/handicapEngine';
import SessionTrend from '../components/SessionTrend'; 
import RoundTargetSummary from '../components/RoundTargetSummary';
import Timer from '../components/Timer';
import Weather from '../components/Weather';
import CoachAIPanel from '../components/CoachAIPanel';
import TargetInput from '../components/targets/TargetInput';
import { useTranslation } from 'react-i18next';

const getArrowStyles = (val: string) => {
  if (['X', '10', '9'].includes(val)) return 'bg-[#F2C94C] text-[#333] border-none shadow-sm';
  if (['8', '7'].includes(val)) return 'bg-[#EB5757] text-white border-none shadow-sm';
  if (['6', '5'].includes(val)) return 'bg-[#2F80ED] text-white border-none shadow-sm';
  if (['4', '3'].includes(val)) return 'bg-[#333333] text-white border-none shadow-sm';
  if (['2', '1'].includes(val)) return 'bg-white border border-gray-200 text-[#333] shadow-sm';
  if (val === 'M') return 'bg-indigo-900 text-white border-none shadow-sm'; 
  return 'bg-[#F9F9F9] border border-gray-100 text-transparent'; 
};

const sortArrows = (arrows: string[]) => {
  const weights: Record<string, number> = { 'X': 11, '10': 10, '9': 9, '8': 8, '7': 7, '6': 6, '5': 5, '4': 4, '3': 3, '2': 2, '1': 1, 'M': 0 };
  return [...arrows].sort((a, b) => (weights[b] || 0) - (weights[a] || 0));
};

const getFriendlyTargetName = (type: string) => {
  if (type === 'Full') return '122cm';
  if (type === 'WA 80cm') return '80cm';
  if (type === '40cm') return '40cm'; 
  if (type === '3-Spot') return '3-Spot';
  if (type === 'Vertical 3-Spot') return 'Vertical 3-Spot'; 
  if (type === 'WA 80cm (6-Ring)') return '80cm (6-Ring)';
  return type; 
};

const getCountryData = (code: string) => {
  const c = code?.toUpperCase() || '';
  if (c.includes('PL') || c.includes('POL')) return 'pl';
  if (c.includes('DE') || c.includes('GER') || c.includes('NIEMCY')) return 'de';
  if (c.includes('US') || c.includes('USA')) return 'us';
  if (c.includes('GB') || c.includes('UK')) return 'gb';
  if (c.includes('FR') || c.includes('FRA')) return 'fr';
  return 'globe'; 
};

function LargeTargetSVG({ ends, targetType, activeEnd }: { ends: any[], targetType: string, activeEnd: number | null }) {
  const isFullFace = ['Full', 'WA 80cm', '122cm', '80cm', '60cm', '40cm'].includes(targetType);
  const is3Spot = targetType === '3-Spot' || targetType === 'Vertical 3-Spot';

  const renderSpot = (cx: number, cy: number) => (
    <g key={`${cx}-${cy}`}>
      <circle cx={cx} cy={cy} r="62.5" fill="#2F80ED" stroke="#333" strokeWidth="0.5" />
      <circle cx={cx} cy={cy} r="50" fill="#2F80ED" stroke="#333" strokeWidth="0.5" />
      <circle cx={cx} cy={cy} r="37.5" fill="#EB5757" stroke="#333" strokeWidth="0.5" />
      <circle cx={cx} cy={cy} r="25" fill="#EB5757" stroke="#333" strokeWidth="0.5" />
      <circle cx={cx} cy={cy} r="12.5" fill="#F2C94C" stroke="#333" strokeWidth="0.5" />
      <circle cx={cx} cy={cy} r="6.25" fill="#F2C94C" stroke="#333" strokeWidth="0.5" />
    </g>
  );

  const renderDots = (end: any, localIdx: number, isHighlighted: boolean) => {
    const opacity = isHighlighted ? 1 : 0.15;
    const radius = isHighlighted ? "7" : "4"; 
    const strokeWidth = isHighlighted ? "1.5" : "0.5";
    const fillColor = isHighlighted ? "#fed33e" : "white";
    return end.dots?.map((dot: any, dotIdx: number) => {
      if (dot.x == null || dot.y == null) return null;
      const arrowNumber = dot.order || dotIdx + 1;
      return (
        <g key={`${localIdx}-${dotIdx}`} style={{ opacity, transition: 'all 0.3s ease' }}>
          <circle cx={dot.x} cy={dot.y} r={radius} fill={fillColor} stroke="#0a3a2a" strokeWidth={strokeWidth} />
          {isHighlighted && (
            <text x={dot.x} y={dot.y} fontSize="8" fontWeight="black" textAnchor="middle" dominantBaseline="central" fill="#0a3a2a" style={{ pointerEvents: 'none' }}>{arrowNumber}</text>
          )}
        </g>
      );
    });
  };

  return (
    <svg viewBox={!isFullFace ? "0 0 300 400" : "0 0 300 300"} className="w-full h-auto max-h-[55vh]">
      {isFullFace ? (
        <g>
          <circle cx="150" cy="150" r="150" fill="white" stroke="#333" strokeWidth="1" /><circle cx="150" cy="150" r="135" fill="white" stroke="#333" strokeWidth="1" /><circle cx="150" cy="150" r="120" fill="#333" stroke="#fff" strokeWidth="1" /><circle cx="150" cy="150" r="105" fill="#333" stroke="#fff" strokeWidth="1" /><circle cx="150" cy="150" r="90" fill="#2F80ED" stroke="#333" strokeWidth="1" /><circle cx="150" cy="150" r="75" fill="#2F80ED" stroke="#333" strokeWidth="1" /><circle cx="150" cy="150" r="60" fill="#EB5757" stroke="#333" strokeWidth="1" /><circle cx="150" cy="150" r="45" fill="#EB5757" stroke="#333" strokeWidth="1" /><circle cx="150" cy="150" r="30" fill="#F2C94C" stroke="#333" strokeWidth="1" /><circle cx="150" cy="150" r="15" fill="#F2C94C" stroke="#333" strokeWidth="1" /><circle cx="150" cy="150" r="7.5" fill="#F2C94C" stroke="#333" strokeWidth="1" />
        </g>
      ) : is3Spot && targetType === '3-Spot' ? (
        <g>
          <rect x="5" y="0" width="140" height="400" fill="#e8eaed" rx="8" stroke="#d1d5db" strokeWidth="2" />
          <rect x="155" y="0" width="140" height="400" fill="#e8eaed" rx="8" stroke="#d1d5db" strokeWidth="2" />
          {[66, 200, 333].map(cy => renderSpot(75, cy))}
          {[66, 200, 333].map(cy => renderSpot(225, cy))}
        </g>
      ) : (
        <g>
          <rect x="75" y="0" width="150" height="400" fill="#e8eaed" rx="8" stroke="#d1d5db" strokeWidth="2" />
          {[66, 200, 333].map(cy => renderSpot(150, cy))}
        </g>
      )}
      {ends.map((end: any, localIdx: number) => (activeEnd === null || activeEnd === localIdx ? null : renderDots(end, localIdx, false)))}
      {ends.map((end: any, localIdx: number) => (activeEnd !== null && activeEnd !== localIdx ? null : renderDots(end, localIdx, true)))}
    </svg>
  );
}

function TargetZoomModal({ roundTitle, ends, targetType, startIndex, onClose, t }: any) {
  const [activeEnd, setActiveEnd] = useState<number | null>(null);
  useEffect(() => { document.body.style.overflow = 'hidden'; return () => { document.body.style.overflow = 'auto'; }; }, []);
  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100000] flex items-center justify-center p-4 transition-opacity duration-300" onClick={onClose}>
      <div className="bg-white rounded-[32px] p-6 w-full max-w-[500px] h-[85vh] shadow-2xl relative flex flex-col items-center border border-gray-100" onClick={e => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-5 right-5 p-2 bg-gray-100 text-gray-500 rounded-full active:scale-90 transition-all z-10">
          <span className="material-symbols-outlined font-bold text-xl">close</span>
        </button>
        <div className="text-center mb-6 w-full px-8 mt-2">
          <h3 className="text-[10px] font-black text-emerald-600 uppercase tracking-[0.2em] mb-1">{t('scoringView.previewTitle', 'Podgląd Rozrzutu')}</h3>
          <span className="text-xl font-black text-[#0a3a2a] leading-tight block">{roundTitle}</span>
        </div>
        <div className="flex gap-1.5 mb-6 justify-center w-full overflow-x-auto hide-scrollbar px-2 shrink-0">
          <button onClick={() => setActiveEnd(null)} className={`px-3 py-2 rounded-xl text-[10px] font-black transition-all ${activeEnd === null ? 'bg-[#0a3a2a] text-white shadow-md' : 'bg-gray-100 text-gray-500 active:bg-gray-200'}`}>{t('scoringView.allEnds', 'WSZYSTKIE')}</button>
          {ends.map((_: any, i: number) => (
            <button key={i} onClick={() => setActiveEnd(i)} className={`w-10 py-2 rounded-xl text-[10px] font-black transition-all flex items-center justify-center ${activeEnd === i ? 'bg-[#fed33e] text-[#0a3a2a] shadow-md border border-[#e5bd38]' : 'bg-gray-100 text-gray-500 active:bg-gray-200 border border-transparent'}`}>{t('scoringView.endAbbr', 'P')}{startIndex + i + 1}</button>
          ))}
        </div>
        <div className="flex-1 w-full flex flex-col items-center justify-start bg-gray-50 rounded-2xl border border-gray-100 p-2 overflow-hidden">
          <div className="w-full pt-4">
            <LargeTargetSVG ends={ends} targetType={targetType} activeEnd={activeEnd} />
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

const formatUserName = (userData: any) => {
  if (!userData) return '';
  const showFull = userData.showFullName !== false;
  const showNick = userData.showNickname !== false;
  const fName = userData.firstName || '';
  const lName = userData.lastName || '';
  const nick = userData.nickname || '';

  const baseName = showFull
    ? `${fName} ${lName}`.trim()
    : `${fName} ${lName ? lName.charAt(0) + '.' : ''}`.trim();

  if (showNick && nick) {
     if (baseName) {
        return `${fName} "${nick}" ${showFull ? lName : (lName ? lName.charAt(0) + '.' : '')}`.trim();
     }
     return nick; 
  }
  if (!baseName && nick && !showNick) return 'Łucznik';
  return baseName || nick; 
};

const formatUserClub = (userData: any) => {
  if (!userData) return '';
  const showCl = userData.showClub !== false;
  const showReg = userData.showRegion !== false;
  const cName = userData.clubName || '';
  const cCity = userData.clubCity || '';
  
  const parts = [];
  if (showCl && cName) parts.push(cName);
  if (showReg && cCity) parts.push(cCity);
  
  if (parts.length === 0) return 'Niezrzeszony';
  return parts.join(' - ');
};

const getFlagEmoji = (countryCode: string) => {
  const code = countryCode?.toUpperCase();
  if (!code) return '';
  const codePoints = code.split('').map((char: string) => 127397 + char.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
};

export default function ScoringView({ userId, distance = "70m", targetType = "Full", battleId = null, onRoundTwoStart, onUpdateEndIndex, onNavigate }: any) {
  const { t } = useTranslation();
  const [inputArrows, setInputArrows] = useState<string[]>([]); 
  const [inputCoordinates, setInputCoordinates] = useState<any[]>([]); 
  const [submittedEnds, setSubmittedEnds] = useState<any[]>([]); 
  
  const [activeRoundTab, setActiveRoundTab] = useState(1);
  const [activeInputTab, setActiveInputTab] = useState(0); 
  const [isTargetFullscreen, setIsTargetFullscreen] = useState(false);
  const [highlightedEnd, setHighlightedEnd] = useState<number | null>(null);
  const [isTimerExpanded, setIsTimerExpanded] = useState(false);
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [timerMode, setTimerMode] = useState<'IDLE' | 'PREP' | 'SHOOT' | 'FINISHED'>('IDLE');
  const [isSaving, setIsSaving] = useState(false);

  // Ref śledzący czy komponent jest zamontowany.
  // Zapobiega setState po odmontowaniu (np. gdy finally w saveSession
  // odpala się już po onNavigate('HOME') i komponent nie żyje).
  const isMountedRef = useRef(true);
  useEffect(() => {
    return () => { isMountedRef.current = false; };
  }, []);
  const [zoomedRoundData, setZoomedRoundData] = useState<{title: string, ends: any[], startIndex: number} | null>(null);
  const [isPremium, setIsPremium] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  
  const [sessionNote, setSessionNote] = useState('');
  const [isNotePublic, setIsNotePublic] = useState(true); // NOWY STAN DLA CHECKBOXA TRENERA
  const [currentWeather, setCurrentWeather] = useState<any>(null);
  
  const [isStatsExpanded, setIsStatsExpanded] = useState(false);
  const [activeBattle, setActiveBattle] = useState<any>(null);
  const [battleParticipants, setBattleParticipants] = useState<any[]>([]);
  const [showLeaderboard, setShowLeaderboard] = useState(false);

  const [showAbortModal, setShowAbortModal] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastType, setToastType] = useState<'INFO' | 'ERROR'>('INFO');

  // Guest players state
  const [showGuestScorePanel, setShowGuestScorePanel] = useState(false);
  const [activeGuestIndex, setActiveGuestIndex] = useState(0);
  const [guestEndArrows, setGuestEndArrows] = useState<{[guestId: string]: string[]}>({});
  const [battleGuests, setBattleGuests] = useState<{guestId: string, name: string}[]>([]);
  
  const audioCtxRef = useRef<AudioContext | null>(null);

  const isRestingBetweenRounds = submittedEnds.length === 6 && inputArrows.length === 0;
  const isTrainingFinished = submittedEnds.length === 12;
  const showStats = isRestingBetweenRounds || isTrainingFinished;

  const showToast = (msg: string, type: 'INFO' | 'ERROR' = 'INFO') => {
    setToastType(type);
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  useEffect(() => {
    const savedSession = localStorage.getItem('grotX_activeSession');
    if (savedSession) {
      try {
        const data = JSON.parse(savedSession);
        if (data.distance === distance && data.targetType === targetType) {
          if (data.submittedEnds) setSubmittedEnds(data.submittedEnds);
          if (data.inputArrows) setInputArrows(data.inputArrows);
          if (data.inputCoordinates) setInputCoordinates(data.inputCoordinates);
          if (data.activeRoundTab) setActiveRoundTab(data.activeRoundTab);
        }
      } catch (e) {
        console.error("Błąd odczytu lokalnej pamięci sesji", e);
      }
    }
  }, [distance, targetType]);

  useEffect(() => {
    if (inputArrows.length > 0 || submittedEnds.length > 0) {
      localStorage.setItem('grotX_activeSession', JSON.stringify({
        distance,
        targetType,
        inputArrows,
        inputCoordinates,
        submittedEnds,
        activeRoundTab
      }));
      window.dispatchEvent(new Event('session_state_changed'));
    } else if (inputArrows.length === 0 && submittedEnds.length === 0) {
      localStorage.removeItem('grotX_activeSession');
      window.dispatchEvent(new Event('session_state_changed'));
    }
  }, [inputArrows, inputCoordinates, submittedEnds, distance, targetType, activeRoundTab]);

  useEffect(() => {
    if (showStats) setIsStatsExpanded(true);
    else setIsStatsExpanded(false);
  }, [showStats]);

  useEffect(() => {
    if (onUpdateEndIndex) onUpdateEndIndex(submittedEnds.length);
  }, [submittedEnds.length, onUpdateEndIndex]);

  useEffect(() => {
    if (!userId) return;
    const fetchPremium = async () => {
      const pSnap = await getDoc(doc(db, 'users', userId));
      if (pSnap.exists()) setIsPremium(pSnap.data().isPremium || false);
    }
    fetchPremium();
  }, [userId]);

  useEffect(() => {
    if (!userId || !battleId) {
      setActiveBattle(null);
      setBattleParticipants([]);
      return;
    }
    const unsub = onSnapshot(doc(db, 'battles', battleId), async (snapshot) => {
      if (snapshot.exists()) {
        const bData = snapshot.data();
        const hasGuests = bData.guests && bData.guests.length > 0;
        const shouldShowArena = bData.mode === 'CLUB' || bData.mode === 'WORLD' || (bData.participants && bData.participants.length > 1) || hasGuests;
        if (shouldShowArena) {
          setActiveBattle({ id: snapshot.id, ...bData });
          // Extract guests
          if (hasGuests) {
            setBattleGuests(bData.guests);
          } else {
            setBattleGuests([]);
          }
          const pDetails = await Promise.all(bData.participants.map(async (pId: string) => {
            const uSnap = await getDoc(doc(db, 'users', pId));
            const ud = uSnap.exists() ? uSnap.data() : {};
            return {
              id: pId,
              name: formatUserName(ud),
              club: formatUserClub(ud),
              countryCode: ud.countryCode || 'DE'
            };
          }));
          setBattleParticipants(pDetails);
        } else {
          setActiveBattle(null);
          setBattleParticipants([]);
          setBattleGuests([]);
        }
      }
    });
    return () => unsub();
  }, [userId, battleId]);

  const playBeep = (f: number, d: number, delay = 0) => {
    try {
      if (!audioCtxRef.current) audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') ctx.resume(); 
      const osc = ctx.createOscillator(); const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = 'square'; osc.frequency.value = f; 
      const startTime = ctx.currentTime + delay;
      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(1, startTime + 0.02);
      osc.start(startTime); osc.stop(startTime + d);
    } catch(_e) { /* audio not supported */ }
  };

  const addScoreFromKeyboard = (v: string) => {
    if (inputArrows.length < 6) {
      setInputArrows([...inputArrows, v]);
      setInputCoordinates([...inputCoordinates, { x: null, y: null, spotId: null }]);
    }
  };

  const addScoreFromTarget = (v: string, x: number, y: number, spotId: string | null) => { 
    if (inputArrows.length < 6) { 
      let finalVal = v;
      const newArrows = [...inputArrows];
      const newCoords = [...inputCoordinates];

      const isVisualInput = x !== null && y !== null;

      if (isVisualInput && (targetType === '3-Spot' || targetType === 'Vertical 3-Spot')) {
        if (!spotId) {
          finalVal = 'M';
        } else {
          const weight = (val: string): number => {
            if (val === 'X') return 11;
            if (val === 'M' || !val) return 0;
            return parseInt(val) || 0;
          };
          const existingIdx = newCoords.findIndex(
            (c, i) => c.spotId === spotId && newArrows[i] !== 'M'
          );
          if (existingIdx !== -1) {
            const currentW = weight(v);
            const existingW = weight(newArrows[existingIdx]);
            if (currentW > existingW) {
              finalVal = 'M';
            } else if (currentW < existingW) {
              newArrows[existingIdx] = 'M';
            } else {
              finalVal = 'M';
            }
          }
        }
      }

      setInputArrows([...newArrows, finalVal]); 
      setInputCoordinates([...newCoords, { x: x ?? null, y: y ?? null, spotId: spotId ?? null }]); 
    }
  };

  const undo = () => {
    if (inputArrows.length > 0) {
      setInputArrows(p => p.slice(0, -1));
      setInputCoordinates(p => p.slice(0, -1));
    } else if (submittedEnds.length > 0) {
      const lastEnd = submittedEnds[submittedEnds.length - 1];
      const raw = lastEnd.rawArrows || lastEnd.arrows || [];
      setInputArrows(raw.slice(0, -1));
      setInputCoordinates(lastEnd.dots ? lastEnd.dots.slice(0, -1) : []);
      setSubmittedEnds(p => p.slice(0, -1));
    }
  };

  useEffect(() => {
    let timeoutId: any;
    if (inputArrows.length === 6) {
      timeoutId = setTimeout(() => {
        const sorted = sortArrows(inputArrows);
        const sum = inputArrows.reduce((s, v) => s + (v==='X'?10:v==='M'?0:parseInt(v)), 0);
        
        const safeCoordinates = inputCoordinates.map(coord => ({
          x: coord?.x ?? null,
          y: coord?.y ?? null,
          spotId: coord?.spotId ?? null
        }));

        const newEnd = {
          arrows: sorted,
          rawArrows: [...inputArrows],
          dots: safeCoordinates,
          total_sum: sum,
          createdAt: Date.now()
        };

        setSubmittedEnds(prev => [...prev, newEnd]);
        setInputArrows([]); 
        setInputCoordinates([]);
        
        if (submittedEnds.length === 5) {
          onRoundTwoStart?.();
          setActiveRoundTab(2);
        }
      }, 600); 
    }
    return () => clearTimeout(timeoutId);
  }, [inputArrows, submittedEnds.length, onRoundTwoStart]); 

  const getStats = (ends: any[], active: string[] = []) => {
    let x=0, t=0, n=0, score=0, count=0;
    const proc = (v: string) => { if (!v) return; count++; if (v === 'X') { x++; t++; score += 10; } else if (v === '10') { t++; score += 10; } else if (v === '9') { n++; score += 9; } else if (v !== 'M') { score += parseInt(v); } };
    ends.forEach(e => e.arrows?.forEach(proc)); active.forEach(proc);
    const avg = count > 0 ? (score / count).toFixed(2) : '0.00';
    return { x, t, n, score, count, avg };
  };

  const r1Ends = submittedEnds.slice(0, 6);
  const r2Ends = submittedEnds.slice(6, 12);
  const globalStats = getStats(submittedEnds, inputArrows);
  const currentRoundStats = activeRoundTab === 1 ? getStats(r1Ends, submittedEnds.length < 6 ? inputArrows : []) : getStats(r2Ends, submittedEnds.length >= 6 ? inputArrows : []);
  const r1TotalScore = r1Ends.reduce((sum, end) => sum + (end.total_sum || 0), 0);
  const isRound1Finished = submittedEnds.length >= 6;

  useEffect(() => {
    if (activeBattle?.id && userId && activeBattle?.participants?.includes(userId)) {
      updateDoc(doc(db, 'battles', activeBattle.id), {
        [`liveScores.${userId}`]: {
          score: globalStats.score,
          x: globalStats.x,
          t: globalStats.t,
          n: globalStats.n
        }
      }).catch(e => console.error("Silent live update failed:", e));
    }
  }, [globalStats.score, globalStats.x, globalStats.t, globalStats.n, activeBattle?.id, userId]);

  const saveTrainingSession = async () => {
    if (!userId) return;
    
    if (submittedEnds.length === 0) {
      showToast(t('scoringView.errorNoArrows', 'Brak strzał na tarczy. Dodaj wyniki.'), 'ERROR');
      return;
    }

    setIsSaving(true);
    try {
      const sessionTimestamp = Timestamp.now();

      const isWorldBattle = !!activeBattle?.isWorldBattle;
      const opponentId    = isWorldBattle
        ? activeBattle.participants?.find((id: string) => id !== userId)
        : null;
      const opponentScore = opponentId ? (activeBattle.liveScores?.[opponentId]?.score ?? 0) : 0;
      const didWinWorld   = isWorldBattle && globalStats.score > opponentScore;
      const worldXp       = isWorldBattle ? WORLD_XP_PARTICIPATION + (didWinWorld ? WORLD_XP_WIN : 0) : 0;

      await addDoc(collection(db, `users/${userId}/sessions`), {
        score: globalStats.score,
        arrows: globalStats.count,
        distance: distance,
        targetType: targetType,
        date: new Date().toLocaleDateString('pl-PL'),
        timestamp: sessionTimestamp,
        note: sessionNote,
        isNotePublic: isNotePublic,
        weather: currentWeather,
        ends: submittedEnds,
        ...(isWorldBattle && { sessionType: 'WORLD_BATTLE', worldResult: didWinWorld ? 'WIN' : 'LOSS' }),
      });

      // Denormalizacja + aktualizacja XP i rangi
      const userRef = doc(db, 'users', userId);
      const userSnap = await getDoc(userRef);
      const ud = userSnap.exists() ? userSnap.data() : {};

      const sessionXp  = calculateSessionXp(globalStats.count, globalStats.score);
      const newTotalXp = (ud.xp || 0) + sessionXp + worldXp;

      const sessionAvg = globalStats.count > 0 ? globalStats.score / globalStats.count : 0;
      const prevLast10: number[] = ud.last10Avgs || [];
      const newLast10 = [sessionAvg, ...prevLast10].slice(0, 10);

      const rankResult = calculateRank(newTotalXp, newLast10);

      // HANDICAP ŁUCZNICZY
      const distanceNum = parseInt(distance) || 18;
      const sessionHandicap = calculateSessionHandicap(sessionAvg, distanceNum, targetType);
      const prevLast10Handicaps: number[] = ud.last10Handicaps || [];
      const newLast10Handicaps = [sessionHandicap, ...prevLast10Handicaps].slice(0, 10);
      const currentHandicap = calculateCurrentHandicap(newLast10Handicaps);

      await updateDoc(userRef, {
        lastSessionTimestamp: sessionTimestamp,
        lastSessionScore: globalStats.score,
        lastSessionArrows: globalStats.count,
        lastSessionDistance: distance,
        // THE TARGET SERIES
        xp: newTotalXp,
        last10Avgs: newLast10,
        level: rankResult.level,
        rankName: rankResult.rankName,
        rankColor: rankResult.color,
        rankBorder: rankResult.border,
        rankTextColor: rankResult.textColor,
        rollingAvg: rankResult.rollingAvg,
        // HANDICAP
        last10Handicaps: newLast10Handicaps,
        currentHandicap,
      });

      if (activeBattle) {
         try {
           await updateDoc(doc(db, 'battles', activeBattle.id), {
               finishedParticipants: arrayUnion(userId)
           });
         } catch (error) {
           console.warn("Zignorowano błąd uprawnień przy aktualizacji statusu Areny.");
         }
      }

      if (isWorldBattle) {
        try {
          const worldDisplayName = `${ud.firstName || ''} ${ud.lastName ? ud.lastName[0] + '.' : ''}`.trim();
          await updateWorldStatsOnly(
            userId,
            worldDisplayName,
            ud.clubName  || '',
            ud.countryCode || '',
            ud.level     || 1,
            didWinWorld,
            worldXp,
          );
        } catch (e) {
          console.warn('Błąd zapisu world_stats:', e);
        }
      }

      localStorage.removeItem('grotX_activeSession');
      // Unieważnienie wszystkich cache'y statystyk po nowym treningu
      localStorage.removeItem(`grotX_quickStats_${userId}`);
      localStorage.removeItem(`grotX_proStats_${userId}`);
      localStorage.removeItem(`grotX_stats_v3_${userId}`);
      localStorage.removeItem(`grotX_stats_v4_${userId}`);
      localStorage.removeItem(`grotX_lastSession_${userId}`);
      window.dispatchEvent(new Event('session_state_changed'));

      onNavigate('HOME');

    } catch (error) {
      console.error("Krytyczny błąd zapisu sesji:", error);
      if (isMountedRef.current) {
        showToast(t('auth.errorGeneral', 'Błąd zapisu! Sprawdź połączenie z siecią.'), 'ERROR');
      }
    } finally {
      // Po onNavigate('HOME') komponent już nie istnieje — sprawdzamy
      // ref zanim zrobimy setState, żeby nie dostać memory-leak warning.
      if (isMountedRef.current) {
        setIsSaving(false);
      }
    }
  };

  const rankedParticipants = [...battleParticipants].sort((a, b) => {
    const dataA = activeBattle?.liveScores?.[a.id];
    const dataB = activeBattle?.liveScores?.[b.id];

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

  const guestParticipants = battleGuests.map((g) => ({
    id: g.guestId,
    name: g.name,
    club: t('scoringView.guestMode'),
    countryCode: '',
    isGuest: true
  }));

  const getScoreForRank = (id: string) => {
    const d = activeBattle?.liveScores?.[id];
    return typeof d === 'object' ? (d?.score || 0) : (d || 0);
  };

  const allRankedParticipants = [...rankedParticipants, ...guestParticipants].sort(
    (a, b) => getScoreForRank(b.id) - getScoreForRank(a.id)
  );

  return (
    <div className="space-y-2 pb-40 relative w-full pt-[env(safe-area-inset-top)] max-w-md mx-auto min-h-screen flex flex-col bg-[#fcfdfe]">
      
      {isTargetFullscreen && activeInputTab === 1 && submittedEnds.length < 12 && (
        <TargetInput 
          onShot={addScoreFromTarget} 
          isFullscreen={true} 
          onToggleFullscreen={() => setIsTargetFullscreen(false)} 
          currentArrows={inputArrows} 
          currentCoords={inputCoordinates} 
          onUndo={undo} 
          targetType={targetType} 
        />
      )}

      <div className="bg-white p-3 mx-2 mt-2 rounded-2xl shadow-sm border border-gray-100 shrink-0">
        <div className="flex items-center justify-between h-10">
          <div className="flex items-center pl-6 shrink-0 border-r border-gray-100 pr-4 h-full">
            <div className="flex items-baseline whitespace-nowrap">
              <span className="text-[24px] font-black text-[#0a3a2a] tracking-tighter leading-none">GROT-X</span>
              <div className="w-1.5 h-1.5 bg-[#fed33e] rounded-full ml-1 relative bottom-[0.35em]"></div>
            </div>
          </div>
          <div className="flex-1 flex flex-col items-start justify-center px-2 h-full">
            <div className="font-black text-[#0a3a2a] text-[15px] leading-none flex items-center">
              <span className="material-symbols-outlined text-[14px] text-emerald-600 mr-1">target</span>
              {distance}
            </div>
            <div className="text-[8px] font-black text-gray-400 uppercase tracking-widest mt-1">
              &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;{getFriendlyTargetName(targetType)}
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0 h-full">
            <div onClick={() => setIsTimerExpanded(true)} className="flex items-center gap-1 cursor-pointer active:scale-90 transition-all">
              <div className="relative flex items-center justify-center">
                 <svg width="22" height="22" viewBox="0 0 24 24" fill="none" className={timerMode === 'SHOOT' ? 'text-emerald-500 animate-pulse' : 'text-[#0a3a2a]'}>
                   <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2.5" />
                   <path d="M12 6V12L16 14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                 </svg>
                 {timerMode !== 'IDLE' && (
                   <span className="absolute -right-6 text-[11px] font-mono font-black text-[#0a3a2a] bg-white px-1 rounded shadow-sm border border-gray-100">
                     {timerSeconds}s
                   </span>
                 )}
              </div>
            </div>
            <div className="border-l border-gray-100 pl-3 flex flex-col justify-center h-full">
               <Weather variant="compact-vertical" userId={userId} onUpdateData={setCurrentWeather} />
            </div>
          </div>
        </div>

        {activeBattle && (
          <div className="mt-2 pt-2 border-t border-gray-100 flex items-center justify-between animate-fade-in-up">
            <div className={`flex items-center gap-1 px-2 py-1 rounded-md ${
              activeBattle.mode === 'CLUB' ? 'bg-fuchsia-50 text-fuchsia-600' : 
              activeBattle.mode === 'WORLD' ? 'bg-emerald-50 text-emerald-600' : 'bg-indigo-50 text-indigo-600'
            }`}>
              <span className="material-symbols-outlined text-[12px] animate-pulse">
                {activeBattle.mode === 'CLUB' ? 'shield' : activeBattle.mode === 'WORLD' ? 'public' : 'sensors'}
              </span>
              <span className="text-[8px] font-black uppercase tracking-widest">
                Arena {activeBattle.mode === 'CLUB' ? t('scoringView.arenaClub', 'Klubowa') : activeBattle.mode === 'WORLD' ? t('scoringView.arenaWorld', 'World') : t('scoringView.arenaLive', 'Pojedynek')}
              </span>
            </div>
            
            <button 
              onClick={() => {
                if (submittedEnds.length >= 6) setShowLeaderboard(true);
                else showToast(t('scoringView.rankingAlert', "Ranking dostępny po 1. rundzie.")); 
              }}
              className={`text-[9px] font-black uppercase tracking-widest px-3 py-1.5 rounded-md transition-all ${
                submittedEnds.length >= 6 
                  ? 'bg-indigo-600 text-white shadow-md active:scale-95' 
                  : 'bg-gray-100 text-gray-400'
              }`}
            >
              {submittedEnds.length >= 6 ? t('scoringView.liveRanking', 'Ranking Live') : t('scoringView.rankingAfterR1', 'Ranking po 1.R')}
            </button>
          </div>
        )}
      </div>

      <div className="flex gap-1 p-1 mx-auto w-5/6 bg-gray-50 rounded-2xl border border-gray-200">
        <button onClick={() => setActiveRoundTab(1)} className={`flex-1 py-2.5 rounded-xl text-[12px] font-black tracking-widest transition-all ${activeRoundTab === 1 ? 'bg-[#0a3a2a] text-white shadow-md' : 'text-gray-400'} flex items-center justify-center gap-1 uppercase`}>{String(t('scoringView.round', 'RUNDA')).toUpperCase()} 1 {isRound1Finished && <span className="opacity-80">({r1TotalScore})</span>}</button>
        <button onClick={() => { if (isRound1Finished) setActiveRoundTab(2); }} className={`flex-1 py-2.5 rounded-xl text-[12px] font-black tracking-widest transition-all ${activeRoundTab === 2 ? 'bg-[#0a3a2a] text-white shadow-md' : 'text-gray-400'} ${!isRound1Finished ? 'opacity-30 cursor-not-allowed' : ''} uppercase`}>{String(t('scoringView.round', 'RUNDA')).toUpperCase()} 2</button>
      </div>

      <Timer isExpanded={isTimerExpanded} onClose={() => setIsTimerExpanded(false)} playBeep={playBeep} currentEnd={submittedEnds.length} externalSeconds={timerSeconds} setExternalSeconds={setTimerSeconds} externalMode={timerMode} setExternalMode={setTimerMode} />

      {submittedEnds.length < 12 && (
        <div className={`flex bg-white mx-2 rounded-2xl border border-gray-200 shadow-sm overflow-hidden h-[240px] shrink-0 ${isTargetFullscreen && activeInputTab === 1 ? 'hidden' : ''}`}>
          <div className={`flex-1 ${activeInputTab === 0 ? 'p-2' : 'p-1'} h-full flex items-center justify-center`}>
            {activeInputTab === 0 ? (
              <div className="flex flex-col gap-1.5 h-full w-full">
                <div className="grid grid-cols-3 gap-1.5 flex-1">
                  {['X','10','9'].map(v => <button key={v} onClick={() => addScoreFromKeyboard(v)} className={`rounded-xl font-bold text-lg active:scale-95 transition-all ${getArrowStyles(v)}`}>{v}</button>)}
                </div>
                <div className="grid grid-cols-3 gap-1.5 flex-1">
                  {['8','7','6'].map(v => <button key={v} onClick={() => addScoreFromKeyboard(v)} className={`rounded-xl font-bold text-lg active:scale-95 transition-all ${getArrowStyles(v)}`}>{v}</button>)}
                </div>
                <div className="grid grid-cols-3 gap-1.5 flex-1">
                  {['5','4','3'].map(v => <button key={v} onClick={() => addScoreFromKeyboard(v)} className={`rounded-xl font-bold text-lg active:scale-95 transition-all ${getArrowStyles(v)}`}>{v}</button>)}
                </div>
                <div className="grid grid-cols-3 gap-1.5 flex-1">
                  <button onClick={() => addScoreFromKeyboard('2')} className={`rounded-xl font-bold text-lg active:scale-95 transition-all ${getArrowStyles('2')}`}>2</button>
                  <button onClick={() => addScoreFromKeyboard('1')} className={`rounded-xl font-bold text-lg active:scale-95 transition-all ${getArrowStyles('1')}`}>1</button>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button onClick={() => addScoreFromKeyboard('M')} className={`rounded-xl font-bold text-lg active:scale-95 transition-all ${getArrowStyles('M')}`}>M</button>
                    <button onClick={undo} className="rounded-xl bg-white border border-red-100 text-red-500 shadow-sm flex items-center justify-center active:scale-95 transition-all"><span className="material-symbols-outlined text-lg font-black">undo</span></button>
                  </div>
                </div>
              </div>
            ) : (
              <TargetInput 
                onShot={addScoreFromTarget} 
                isFullscreen={false} 
                onToggleFullscreen={() => setIsTargetFullscreen(true)} 
                currentArrows={inputArrows} 
                currentCoords={inputCoordinates} 
                onUndo={undo} 
                targetType={targetType} 
              />
            )}
          </div>
          <div onClick={() => setActiveInputTab(activeInputTab === 0 ? 1 : 0)} className="w-10 bg-emerald-50 hover:bg-emerald-100 flex items-center justify-center border-l border-emerald-200 cursor-pointer shrink-0 transition-colors">
            <span style={{ writingMode: 'vertical-rl' }} className="rotate-180 text-[10px] font-black tracking-widest text-emerald-600 uppercase">{activeInputTab === 0 ? t('scoringView.targetTab', 'Tarcza') : t('scoringView.keyboardTab', 'Klawiatura')}</span>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm mx-2">
        <div className="px-3 py-2 flex justify-between items-center text-[10px] font-bold text-white bg-[#0a3a2a]">
          <span>{String(t('scoringView.round', 'RUNDA')).toUpperCase()} {activeRoundTab}</span>
        </div>
        <div className="p-2 space-y-1">
          {[0, 1, 2, 3, 4, 5].map(i => {
            const idx = activeRoundTab === 1 ? i : 6 + i;
            const end = submittedEnds[idx];
            const isCur = idx === submittedEnds.length;
            const currentPassArrows = isCur ? inputArrows : (end?.arrows || []); 
            const passSum = isCur ? inputArrows.reduce((s, v) => s + (v==='X'?10:v==='M'?0:parseInt(v)), 0) : (end?.total_sum || 0);
            const prevSum = submittedEnds.slice(activeRoundTab === 1 ? 0 : 6, idx).reduce((s, e) => s + (e.total_sum || 0), 0);
            const runSum = prevSum + passSum;
            return (
              <div key={idx} className={`flex items-center text-center p-1 rounded-md transition-all ${isCur ? 'border border-[#F2C94C] bg-white' : 'bg-transparent'}`}>
                <div className="w-6 text-[10px] font-bold text-gray-500">{t('scoringView.endAbbr', 'P')}{idx + 1}</div>
                <div className="flex-1 grid grid-cols-6 gap-1">
                  {[0,1,2,3,4,5].map(ai => <div key={ai} className={`h-8 flex items-center justify-center rounded-md text-[12px] font-bold ${getArrowStyles(currentPassArrows[ai] || '')}`}>{currentPassArrows[ai] || ''}</div>)}
                </div>
                <div className={`w-10 h-8 flex items-center justify-center text-[11px] font-bold rounded-md ml-1 ${end || isCur ? 'bg-[#cce6dc] text-[#0a3a2a]' : 'bg-[#F9F9F9] text-transparent'}`}>{passSum || ''}</div>
                <div className={`w-10 h-8 flex items-center justify-center text-[11px] font-bold rounded-md ml-1 ${end || isCur ? 'bg-[#0a3a2a] text-white' : 'bg-[#F9F9F9] text-transparent'}`}>{isCur ? '...' : (runSum || '')}</div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2 py-3 border-t border-gray-200 text-center bg-white rounded-xl shadow-sm border mx-2 px-2 items-center">
         <div><span className="text-[9px] block text-gray-400 font-bold uppercase">X/10/9</span><span className="text-sm font-black text-[#333]">{currentRoundStats.x}/{currentRoundStats.t}/{currentRoundStats.n}</span></div>
         <div><span className="text-[9px] block text-gray-400 font-bold uppercase">{t('scoringView.avg', 'ŚREDNIA')}</span><span className="text-sm font-black text-[#333]">{currentRoundStats.avg}</span></div>
         <div><span className="text-[9px] block text-gray-400 font-bold uppercase">{t('scoringView.arrows', 'STRZAŁY')}</span><span className="text-sm font-black text-[#333]">{currentRoundStats.count}</span></div>
         <div className="bg-emerald-50 rounded-lg py-1 border border-emerald-100"><span className="text-[9px] block text-emerald-600 font-black uppercase">{t('scoringView.result', 'WYNIK')}</span><span className="text-base font-black text-[#0a3a2a] leading-none">{currentRoundStats.score}</span></div>
      </div>

      <div className="bg-[#fed33e] p-4 mx-2 rounded-2xl shadow-md border-2 border-[#e5bd38] flex justify-between items-center relative">
        <div className="flex flex-col gap-2">
          <span className="font-black uppercase text-xs tracking-widest text-[#725b00]">{t('scoringView.totalSum', 'Suma Całkowita')}</span>
          <div className="flex gap-4 text-[#725b00]">
            <div><span className="text-[8px] block font-black opacity-60 uppercase tracking-widest">X/10/9</span><span className="text-sm font-black">{globalStats.x}/{globalStats.t}/{globalStats.n}</span></div>
            <div><span className="text-[8px] block font-black opacity-60 uppercase tracking-widest">{t('scoringView.avg', 'ŚREDNIA')}</span><span className="text-sm font-black">{globalStats.avg}</span></div>
            <div><span className="text-[8px] block font-black opacity-60 uppercase tracking-widest">{t('scoringView.arrows', 'STRZAŁY')}</span><span className="text-sm font-black">{globalStats.count}</span></div>
          </div>
        </div>
        <span className="text-5xl font-black text-[#725b00]">{globalStats.score}</span>
      </div>

      {/* NOWA SEKCJA NOTATEK - DZIENNIK TRENINGOWY */}
      {submittedEnds.length > 0 && (
        <div className="mx-2 mt-4 mb-2">
          <div className="bg-gradient-to-br from-emerald-50 to-white border border-emerald-100 rounded-2xl p-4 shadow-sm">
            <label className="flex items-center gap-1.5 text-[11px] font-black text-emerald-800 uppercase tracking-widest mb-3">
              <span className="material-symbols-outlined text-[18px] text-emerald-600">edit_note</span>
              {t('scoringView.trainingJournal', 'Dziennik Treningowy')}
            </label>
            <div className="relative mb-3">
              <textarea
                maxLength={100}
                value={sessionNote}
                onChange={(e) => setSessionNote(e.target.value)}
                placeholder={t('scoringView.notePlaceholder', 'Opisz swoje odczucia: wiatr, zmęczenie, zmiany w sprzęcie... Trener AI to uwzględni!')}
                className="w-full bg-white/60 backdrop-blur-sm border border-emerald-200/50 rounded-xl p-3 text-sm font-bold text-[#0a3a2a] placeholder:text-emerald-700/40 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 h-20 resize-none transition-all"
              />
              <div className={`absolute bottom-2 right-3 text-[9px] font-black uppercase tracking-tighter transition-colors ${sessionNote.length >= 90 ? 'text-red-500' : 'text-emerald-600/50'}`}>
                {sessionNote.length}/100
              </div>
            </div>
            
            <label className="flex items-center gap-2 cursor-pointer group w-max">
              <div className={`w-5 h-5 rounded-md flex items-center justify-center border transition-all ${isNotePublic ? 'bg-emerald-500 border-emerald-600 text-white' : 'bg-white border-gray-300 text-transparent'}`}>
                <span className="material-symbols-outlined text-[14px] font-bold">check</span>
              </div>
              <input 
                type="checkbox" 
                className="hidden" 
                checked={isNotePublic} 
                onChange={(e) => setIsNotePublic(e.target.checked)} 
              />
              <span className="text-[10px] font-black uppercase tracking-widest text-emerald-800 group-hover:text-emerald-600 transition-colors">
                {t('scoringView.shareWithCoach', 'Udostępnij notatkę trenerowi')}
              </span>
            </label>
          </div>
        </div>
      )}

      {/* ROZWIJANY PANEL STATYSTYK / AI COACH */}
      {submittedEnds.length > 0 && (
        <div className="mx-2 mt-2">
          <button 
            onClick={() => setIsStatsExpanded(!isStatsExpanded)}
            className="w-full flex items-center justify-between p-4 bg-white border border-gray-100 rounded-2xl shadow-sm active:scale-[0.98] transition-all"
          >
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-emerald-600">analytics</span>
              <span className="text-[10px] font-black uppercase tracking-widest text-[#0a3a2a]">
                {isStatsExpanded ? t('scoringView.collapse', 'Ukryj') : t('scoringView.showStats', 'Pokaż statystyki i AI')}
              </span>
            </div>
            <span className={`material-symbols-outlined transition-transform duration-300 ${isStatsExpanded ? 'rotate-180' : ''}`}>
              keyboard_arrow_down
            </span>
          </button>

          <div className={`transition-all duration-500 overflow-hidden ${isStatsExpanded ? 'max-h-[2000px] opacity-100 mt-2' : 'max-h-0 opacity-0 pointer-events-none'}`}>
            <div className="space-y-4">
              <div className="animate-fade-in-up">
                <SessionTrend submittedEnds={submittedEnds} onPointClick={(idx: number) => isPremium ? setHighlightedEnd(highlightedEnd === idx ? null : idx) : null} />
              </div>

              <div className="flex gap-2 w-full animate-fade-in-up">
                {r1Ends.length > 0 && <div className="flex-1"><RoundTargetSummary title={`${t('scoringView.round', 'Runda')} 1`} ends={r1Ends} highlightedEnd={highlightedEnd} startIndex={0} targetType={targetType} onZoomClick={() => setZoomedRoundData({title: `${t('scoringView.round', 'Runda')} 1`, ends:r1Ends, startIndex:0})} /></div>}
                {r2Ends.length > 0 && <div className="flex-1"><RoundTargetSummary title={`${t('scoringView.round', 'Runda')} 2`} ends={r2Ends} highlightedEnd={highlightedEnd} startIndex={6} targetType={targetType} onZoomClick={() => setZoomedRoundData({title: `${t('scoringView.round', 'Runda')} 2`, ends:r2Ends, startIndex:6})} /></div>}
              </div>
              
              {submittedEnds.length >= 6 && (
                <div className="animate-fade-in-up">
                  <CoachAIPanel userId={userId} totalScore={globalStats.score} arrowCount={globalStats.count} accuracy={((globalStats.score / (globalStats.count * 10)) * 100).toFixed(1)} />
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="flex gap-2 pt-4 px-2 mb-24">
        <button onClick={saveTrainingSession} disabled={isSaving || submittedEnds.length === 0} className={`flex-1 py-4 rounded-xl font-black text-[12px] uppercase tracking-widest shadow-md transition-all flex items-center justify-center gap-2 ${isSaving || submittedEnds.length === 0 ? 'bg-gray-400 text-white cursor-not-allowed' : 'bg-[#0a3a2a] text-white active:scale-95'}`}>{isSaving ? t('scoringView.saving', 'Zapisywanie...') : t('scoringView.saveTraining', 'Zapisz trening')}</button>
        <button onClick={() => setShowAbortModal(true)} className="flex-1 py-4 bg-white text-red-500 rounded-xl font-black text-[12px] uppercase border-2 border-red-100 active:scale-95 shadow-sm">{t('scoringView.abort', 'Przerwij')}</button>
      </div>

      {zoomedRoundData && (
        <TargetZoomModal 
          roundTitle={zoomedRoundData.title} 
          ends={zoomedRoundData.ends} 
          targetType={targetType} 
          startIndex={zoomedRoundData.startIndex} 
          onClose={() => setZoomedRoundData(null)} 
          t={t}
        />
      )}

      {showAbortModal && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[200000] flex items-center justify-center p-6 animate-fade-in-up">
          <div className="bg-white rounded-[32px] p-8 w-full max-w-sm shadow-2xl text-center border border-gray-100">
            <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="material-symbols-outlined text-3xl">warning</span>
            </div>
            <h2 className="text-xl font-black text-[#0a3a2a] mb-2 uppercase tracking-tighter">{t('scoringView.abortConfirmTitle', 'Przerwać trening?')}</h2>
            <p className="text-xs text-gray-500 font-bold mb-8 leading-relaxed uppercase tracking-widest opacity-70">{t('scoringView.abortConfirmDesc', 'Wszystkie nie zapisane wyniki zostaną utracone bezpowrotnie.')}</p>
            <div className="space-y-3">
              <button 
                onClick={() => {
                  localStorage.removeItem('grotX_activeSession');
                  window.dispatchEvent(new Event('session_state_changed'));
                  setShowAbortModal(false);
                  onNavigate('HOME');
                }} 
                className="w-full py-4 bg-red-500 text-white rounded-xl font-black uppercase text-[11px] tracking-widest shadow-lg shadow-red-500/20 active:scale-95 transition-all"
              >
                {t('scoringView.confirmAbort', 'Tak, przerwij')}
              </button>
              <button onClick={() => setShowAbortModal(false)} className="w-full py-4 bg-gray-100 text-gray-500 rounded-xl font-black uppercase text-[11px] tracking-widest active:scale-95 transition-all">
                {t('scoringView.cancelAbort', 'Wróć do strzelania')}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {typeof document !== 'undefined' && createPortal(
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100000] flex flex-col items-center pointer-events-none w-full max-w-md">
          <div className={`flex items-center bg-[#0a3a2a]/95 backdrop-blur-md rounded-2xl shadow-2xl border border-white/10 transition-all duration-300 overflow-hidden mb-3 pointer-events-auto ${isMenuOpen ? 'max-h-24 opacity-100 px-2 py-2' : 'max-h-0 opacity-0'}`}>
            <button onClick={() => { setIsMenuOpen(false); onNavigate('HOME'); }} className="flex flex-col items-center gap-1 text-white/80 hover:text-white px-4 py-2 cursor-pointer">
              <span className="material-symbols-outlined text-xl">home</span>
              <span className="text-[8px] font-black uppercase">{t('scoringView.menuHome', 'Home')}</span>
            </button>
            <div className="w-[1px] h-6 bg-white/10"></div>
            <button onClick={() => { setIsMenuOpen(false); onNavigate('CALENDAR'); }} className="flex flex-col items-center gap-1 text-white/80 hover:text-white px-4 py-2 cursor-pointer">
              <span className="material-symbols-outlined text-xl">calendar_month</span>
              <span className="text-[8px] font-black uppercase">{t('scoringView.menuCalendar', 'Kalendarz')}</span>
            </button>
            <div className="w-[1px] h-6 bg-white/10"></div>
            <button onClick={() => { setIsMenuOpen(false); onNavigate('SETTINGS'); }} className="flex flex-col items-center gap-1 text-white/80 hover:text-white px-4 py-2 cursor-pointer">
              <span className="material-symbols-outlined text-xl">settings</span>
              <span className="text-[8px] font-black uppercase">{t('scoringView.menuSettings', 'Ustawienia')}</span>
            </button>
          </div>
          <div className="flex items-center gap-3 pointer-events-auto">
            {activeBattle?.hostId === userId && activeBattle?.guests?.length > 0 && (
              <button
                onClick={() => {
                  setActiveGuestIndex(0);
                  setShowGuestScorePanel(true);
                }}
                className="w-14 h-14 flex items-center justify-center rounded-full shadow-2xl bg-violet-600 text-white border border-violet-400/30 active:scale-90 transition-all flex-col gap-0.5"
              >
                <span className="material-symbols-outlined text-xl">group</span>
                <span className="text-[7px] font-black uppercase leading-none">{t('scoringView.guestsBtn', 'Gości')}</span>
              </button>
            )}
            <button onClick={() => setIsMenuOpen(!isMenuOpen)} className={`w-14 h-14 flex items-center justify-center rounded-full shadow-2xl transition-all duration-300 border border-white/20 ${isMenuOpen ? 'bg-[#fed33e] text-[#0a3a2a] rotate-90 opacity-100' : 'bg-[#0a3a2a] text-white opacity-60 hover:opacity-100'}`}>
              <span className="material-symbols-outlined text-2xl">{isMenuOpen ? 'close' : 'menu'}</span>
            </button>
          </div>
        </div>,
        document.body
      )}

      {showGuestScorePanel && activeBattle?.guests?.length > 0 && typeof document !== 'undefined' && createPortal(
        (() => {
          const guests: any[] = activeBattle.guests;
          const guest = guests[Math.min(activeGuestIndex, guests.length - 1)];
          if (!guest) return null;

          const arrowScore = (v: string) => v === 'X' ? 10 : v === 'M' ? 0 : parseInt(v) || 0;
          const endArrows: string[] = guestEndArrows[guest.guestId] || [];
          const endSum = endArrows.reduce((s, v) => s + arrowScore(v), 0);
          const savedScore: number = (() => {
            const d = activeBattle.liveScores?.[guest.guestId];
            return typeof d === 'object' ? (d?.score || 0) : (d || 0);
          })();

          const addArrow = (v: string) => {
            if (endArrows.length >= 6) return;
            setGuestEndArrows(prev => ({ ...prev, [guest.guestId]: [...(prev[guest.guestId] || []), v] }));
          };
          const removeArrow = () => {
            setGuestEndArrows(prev => {
              const cur = prev[guest.guestId] || [];
              return { ...prev, [guest.guestId]: cur.slice(0, -1) };
            });
          };
          const confirmEnd = async () => {
            if (!activeBattle?.id || endArrows.length === 0) return;
            const newTotal = savedScore + endSum;
            await updateDoc(doc(db, 'battles', activeBattle.id), {
              [`liveScores.${guest.guestId}`]: { score: newTotal, isGuest: true }
            });
            setGuestEndArrows(prev => ({ ...prev, [guest.guestId]: [] }));
          };

          const keys = ['X', '10', '9', '8', '7', '6', '5', '4', '3', '2', '1', 'M'];
          const keyColor = (v: string) => {
            if (v === 'X') return 'bg-yellow-400 text-yellow-900';
            if (v === 'M') return 'bg-gray-700 text-gray-200';
            const n = parseInt(v);
            if (n >= 9) return 'bg-[#fed33e] text-[#5d4a00]';
            if (n >= 7) return 'bg-red-500 text-white';
            if (n >= 5) return 'bg-blue-500 text-white';
            if (n >= 3) return 'bg-[#0a0f1a] text-white';
            return 'bg-gray-600 text-white';
          };

          return (
            <div className="fixed inset-0 z-[150000] bg-[#0a0f1a] flex flex-col">
              {/* HEADER */}
              <div className="flex items-center justify-between px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-3 border-b border-white/10">
                <button onClick={() => setShowGuestScorePanel(false)} className="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center active:scale-90">
                  <span className="material-symbols-outlined text-white text-[20px]">close</span>
                </button>
                <div className="text-center">
                  <p className="text-[8px] font-black text-violet-400 uppercase tracking-widest">{t('scoringView.guestMode', 'Tryb gościa')}</p>
                  <p className="text-sm font-black text-white">{guest.name}</p>
                </div>
                {/* Nawigacja między gośćmi */}
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setActiveGuestIndex(i => Math.max(0, i - 1))}
                    disabled={activeGuestIndex === 0}
                    className="w-8 h-8 bg-white/10 rounded-full flex items-center justify-center active:scale-90 disabled:opacity-30"
                  >
                    <span className="material-symbols-outlined text-white text-[16px]">chevron_left</span>
                  </button>
                  <span className="text-[10px] font-black text-gray-400">{activeGuestIndex + 1}/{guests.length}</span>
                  <button
                    onClick={() => setActiveGuestIndex(i => Math.min(guests.length - 1, i + 1))}
                    disabled={activeGuestIndex === guests.length - 1}
                    className="w-8 h-8 bg-white/10 rounded-full flex items-center justify-center active:scale-90 disabled:opacity-30"
                  >
                    <span className="material-symbols-outlined text-white text-[16px]">chevron_right</span>
                  </button>
                </div>
              </div>

              {/* WYNIK */}
              <div className="flex items-center justify-center gap-6 py-4 px-5">
                <div className="text-center">
                  <p className="text-[8px] font-black text-gray-500 uppercase tracking-widest">{t('scoringView.guestTotal', 'Łączny')}</p>
                  <p className="text-4xl font-black text-white leading-none">{savedScore}</p>
                </div>
                {endArrows.length > 0 && (
                  <>
                    <span className="text-gray-600 text-xl font-black">+</span>
                    <div className="text-center">
                      <p className="text-[8px] font-black text-violet-400 uppercase tracking-widest">{t('scoringView.thisSeries')}</p>
                      <p className="text-4xl font-black text-violet-400 leading-none">{endSum}</p>
                    </div>
                  </>
                )}
              </div>

              {/* STRZAŁY BIEŻĄCEJ SERII */}
              <div className="flex items-center justify-center gap-2 px-5 pb-3 min-h-[44px]">
                {endArrows.length === 0 ? (
                  <p className="text-[10px] font-black text-gray-600 uppercase tracking-widest">{t('scoringView.guestEnterEnd', 'Wpisz strzały serii')}</p>
                ) : endArrows.map((v, i) => (
                  <div
                    key={i}
                    className={`w-9 h-9 rounded-full flex items-center justify-center font-black text-sm shadow-md ${keyColor(v)}`}
                  >
                    {v}
                  </div>
                ))}
                {/* Puste sloty */}
                {Array.from({ length: 6 - endArrows.length }).map((_, i) => (
                  <div key={`empty-${i}`} className="w-9 h-9 rounded-full border border-dashed border-white/10" />
                ))}
              </div>

              {/* KLAWIATURA */}
              <div className="flex-1 px-4 pb-2 grid grid-cols-4 gap-2 content-center">
                {keys.map(k => (
                  <button
                    key={k}
                    onClick={() => addArrow(k)}
                    disabled={endArrows.length >= 6}
                    className={`h-14 rounded-2xl font-black text-lg shadow-md active:scale-95 transition-all disabled:opacity-30 ${keyColor(k)}`}
                  >
                    {k}
                  </button>
                ))}
                {/* Backspace — zajmuje 4. kolumnę ostatniego wiersza (3 pełne wiersze = 12 klawiszy = 3 wiersze po 4, backspace jako osobny wiersz) */}
                <button
                  onClick={removeArrow}
                  disabled={endArrows.length === 0}
                  className="col-span-4 h-12 bg-white/10 border border-white/10 rounded-2xl flex items-center justify-center gap-2 font-black text-white active:scale-95 transition-all disabled:opacity-30"
                >
                  <span className="material-symbols-outlined text-[22px]">backspace</span>
                  <span className="text-[11px] uppercase tracking-widest">{t('scoringView.backspace')}</span>
                </button>
              </div>

              {/* PRZYCISK ZATWIERDŹ SERIĘ */}
              <div className="px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-2 border-t border-white/10">
                <button
                  onClick={confirmEnd}
                  disabled={endArrows.length === 0}
                  className="w-full py-4 bg-violet-600 text-white rounded-2xl font-black uppercase text-[12px] tracking-widest active:scale-95 transition-all disabled:opacity-40 shadow-lg shadow-violet-900/50"
                >
                  {t('scoringView.guestConfirmEnd', 'Zatwierdź serię')} (+{endSum} {t('scoringView.pts', 'pkt')})
                </button>
              </div>
            </div>
          );
        })()
      , document.body)}

      {showLeaderboard && activeBattle && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 bg-[#0a0f1a]/95 backdrop-blur-md z-[100000] flex items-center justify-center p-6 animate-fade-in-up">
          <div className="bg-white rounded-[32px] w-full max-w-sm overflow-hidden shadow-2xl relative flex flex-col border border-indigo-100">
            <button onClick={() => setShowLeaderboard(false)} className="absolute top-4 right-4 p-2 bg-indigo-50 text-indigo-600 rounded-full active:scale-90 transition-all z-10">
              <span className="material-symbols-outlined font-bold">close</span>
            </button>
            <div className={`p-6 text-center text-white ${activeBattle.mode === 'CLUB' ? 'bg-fuchsia-600' : activeBattle.mode === 'WORLD' ? 'bg-emerald-600' : 'bg-indigo-600'}`}>
              <span className="material-symbols-outlined text-4xl mb-2 text-white/50">trophy</span>
              <h2 className="text-2xl font-black tracking-tighter uppercase">Arena {activeBattle.mode === 'CLUB' ? t('scoringView.arenaClub', 'Klubowa') : activeBattle.mode === 'WORLD' ? t('scoringView.arenaWorld', 'World') : t('scoringView.arenaLive', 'Live')}</h2>
              <p className="text-[10px] font-bold text-white/70 uppercase tracking-widest mt-1">{t('scoringView.liveRanking', 'Ranking na żywo')}</p>
            </div>
            <div className="p-4 space-y-2 flex-1 overflow-y-auto max-h-[50vh]">
              {allRankedParticipants.map((p: any, idx: number) => {
                const pData = activeBattle.liveScores?.[p.id];
                const score = typeof pData === 'object' ? (pData?.score || 0) : (pData || 0);
                const xCount = typeof pData === 'object' ? (pData?.x || 0) : 0;
                const tCount = typeof pData === 'object' ? (pData?.t || 0) : 0;
                const nCount = typeof pData === 'object' ? (pData?.n || 0) : 0;

                const isMe = p.id === userId;
                const isGuest = p.isGuest === true;
                const flagEmoji = !isGuest ? getFlagEmoji(p.countryCode) : '';

                const finalDisplayName = p.name === 'Łucznik' ? t('battleLobby.archer', 'Łucznik') : p.name;
                const finalDisplayClub = p.club === 'Niezrzeszony' ? t('battleLobby.unaffiliated', 'Niezrzeszony') : p.club;

                return (
                  <div key={p.id} className={`flex items-center justify-between p-4 rounded-2xl border transition-all ${isGuest ? 'bg-violet-50 border-violet-200' : isMe ? 'bg-indigo-50 border-indigo-200 shadow-sm' : 'bg-gray-50 border-gray-100'}`}>
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center font-black text-sm ${idx === 0 && score > 0 ? 'bg-[#F2C94C] text-[#8B6508]' : idx === 1 && score > 0 ? 'bg-gray-300 text-gray-700' : idx === 2 && score > 0 ? 'bg-[#CD7F32] text-white' : 'bg-white text-gray-400 border'}`}>
                        {idx + 1}
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5">
                          {isGuest
                            ? <span className="material-symbols-outlined text-violet-500 text-[14px] leading-none">person</span>
                            : flagEmoji && <span className="text-[12px] leading-none">{flagEmoji}</span>
                          }
                          <span className="font-black text-[#0a3a2a] text-sm leading-none">{finalDisplayName}</span>
                          {isGuest && <span className="text-[8px] bg-violet-600 text-white px-1.5 py-0.5 rounded uppercase font-bold tracking-widest">👤 GOŚĆ</span>}
                          {!isGuest && isMe && <span className="text-[8px] bg-indigo-600 text-white px-1.5 py-0.5 rounded uppercase font-bold tracking-widest">{t('battleHistory.me', 'Ty')}</span>}
                        </div>
                        <div className="flex items-center gap-1 mt-1">
                          <span className="text-[9px] font-bold text-gray-400 uppercase leading-none">{finalDisplayClub}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col items-end justify-center">
                      <span className={`text-2xl font-black leading-none ${isGuest ? 'text-violet-600' : 'text-indigo-600'}`}>{score}</span>
                      {!isGuest && typeof pData === 'object' && (
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
              <button onClick={() => setShowLeaderboard(false)} className="w-full py-4 bg-[#0a3a2a] text-white rounded-xl font-black uppercase text-[11px] tracking-widest active:scale-95 transition-all">
                {t('scoringView.backToTarget', 'Wróć do tarczy')}
              </button>
            </div>
          </div>
        </div>, document.body
      )}

      {toastMessage && typeof document !== 'undefined' && createPortal(
        <div className={`fixed top-14 left-1/2 -translate-x-1/2 z-[300000] px-6 py-3.5 rounded-full font-black text-[10px] uppercase tracking-widest shadow-2xl border animate-fade-in-up flex items-center gap-2 whitespace-nowrap transition-all ${
          toastType === 'ERROR' ? 'bg-red-600 text-white border-red-700' : 'bg-[#0a3a2a] text-white border-emerald-900'
        }`}>
          <span className="material-symbols-outlined text-sm">
            {toastType === 'ERROR' ? 'error' : 'info'}
          </span>
          {toastMessage}
        </div>, document.body
      )}
    </div>
  );
}