import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { db } from '../firebase';
import { invalidateRecentSessions } from '../lib/recentSessions';
import { collection, doc, getDoc, getDocFromCache, setDoc, updateDoc, arrayUnion, Timestamp, onSnapshot } from 'firebase/firestore';
import { settleWrite, userDocCacheFirst } from '../utils/offlineWrite';
import { sessionNoteField, writePrivateSessionNote } from '../utils/privateSessionNote';
import { getPublicProfile, buildPublicProfile } from '../utils/publicProfile';
import { StagePoint, StageScore, compareStage, scoreSeenBy } from '../utils/battleStage';
import { applySessionsToRank, RANK_UP_KEY, RANK_VERSION, rankBowOf, rankFromStored, rankUpBetween } from '../utils/rankEngine';
import { BLOWGUN_DISCIPLINE } from '../config/equipmentSetups';
import { updateWorldStatsOnly, WORLD_XP_PARTICIPATION, WORLD_XP_WIN } from '../utils/worldMatchmakingService';
import { guestExpiryFields } from '../utils/guestMode';
import SessionTrend from '../components/SessionTrend';
import SessionBilanz from '../components/scoring/SessionBilanz';
import ArrowColorFilter from '../components/scoring/ArrowColorFilter';
import SummaryCard from '../components/scoring/SummaryCard';
import RoundTargetSummary from '../components/RoundTargetSummary';
import Timer from '../components/Timer';
import CoachAIPanel from '../components/CoachAIPanel';
import { AI_ENABLED } from '../config/features';
import TargetInput, { ArrowColorBar } from '../components/targets/TargetInput';
import { arrowColorAt } from '../config/arrowColors';
import { getSetupStamp } from '../utils/setupStamp';
import { useCurrentFocus, sessionFocusFields, useFocusChoice, chosenFocusTopics, displayPair } from '../utils/focus';
import { FocusDots, focusTitle, FocusChoiceChips, focusPalette, focusIcon } from '../components/tagebuch/FocusCard';
import { TargetThumbnail } from '../components/targets/TargetThumbnail';
import { useTranslation } from 'react-i18next';
import { isSpotFace, friendlyTargetName } from '../config/targetFaces';
import { topicLabel } from '../constants/trainingTopics';
import { PLANNED_ENDS } from '../utils/partialSession';
import { getStats } from '../utils/endStats';

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

const getFriendlyTargetName = (type: string) => friendlyTargetName(type, type);

const getCountryData = (code: string) => {
  const c = code?.toUpperCase() || '';
  if (c.includes('PL') || c.includes('POL')) return 'pl';
  if (c.includes('DE') || c.includes('GER') || c.includes('NIEMCY')) return 'de';
  if (c.includes('US') || c.includes('USA')) return 'us';
  if (c.includes('GB') || c.includes('UK')) return 'gb';
  if (c.includes('FR') || c.includes('FRA')) return 'fr';
  return 'globe'; 
};

// [RODO C6] formatUserName/formatUserClub przeniesione do
// utils/publicProfile.ts (buildPublicProfile) — dane przeciwników
// czytane z profiles_public, już sformatowane.

const getFlagEmoji = (countryCode: string) => {
  const code = countryCode?.toUpperCase();
  if (!code) return '';
  const codePoints = code.split('').map((char: string) => 127397 + char.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
};

export default function ScoringView({ userId, distance = "70m", distanceId, distanceLabel, targetType = "Full", battleId = null, practiceArrows: practiceArrowsProp = 0, plannedEnds: plannedEndsProp, onRoundTwoStart, onUpdateEndIndex, onNavigate }: any) {
  const { t, i18n } = useTranslation();
  const [inputArrows, setInputArrows] = useState<string[]>([]); 
  const [inputCoordinates, setInputCoordinates] = useState<any[]>([]); 
  const [submittedEnds, setSubmittedEnds] = useState<any[]>([]); 
  
  const [activeRoundTab, setActiveRoundTab] = useState(1);
  const [activeInputTab, setActiveInputTab] = useState(0); 
  const [isTargetFullscreen, setIsTargetFullscreen] = useState(false);
  // [KOLORY STRZAŁ] Opcja z aktywnego zestawu — ten sam stempel, który
  // trafi na sesję przy zapisie, więc ekran i zapis nie mogą się rozjechać.
  const [arrowColors, setArrowColors] = useState(false);
  // [KOREKTA CELOWNIKA] Podpowiedź tylko dla łuków z celownikiem (recurve, compound).
  const [hasSight, setHasSight] = useState(false);
  useEffect(() => {
    if (!userId) return;
    getSetupStamp(userId).then(st => {
      setArrowColors(!!st.arrowColors);
      const bow = rankBowOf(st.bowClass);
      setHasSight(st.bowClass !== BLOWGUN_DISCIPLINE && (bow === 'RECURVE' || bow === 'COMPOUND'));
    });
  }, [userId]);
  const [highlightedEnd, setHighlightedEnd] = useState<number | null>(null);
  const [colorFilter, setColorFilter] = useState<number | null>(null); // [KOLORY STRZAŁ] filtr tarczy
  const [targetView, setTargetView] = useState<'all' | 1 | 2>('all'); // karta Trefferbild: obie rundy albo jedna
  const [plainDots, setPlainDots] = useState(false); // przytrzymany przycisk: kropki bez kolorów strzał
  const [isTimerExpanded, setIsTimerExpanded] = useState(false);
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [timerMode, setTimerMode] = useState<'IDLE' | 'PREP' | 'SHOOT' | 'FINISHED'>('IDLE');
  const [isSaving, setIsSaving] = useState(false);
  // Zapis w toku — wtedy własne „ukończono" w bitwie nie wyrzuca do historii.
  const isSavingRef = useRef(false);

  // Ref śledzący czy komponent jest zamontowany.
  // Zapobiega setState po odmontowaniu (np. gdy finally w saveSession
  // odpala się już po onNavigate('HOME') i komponent nie żyje).
  const isMountedRef = useRef(true);
  useEffect(() => {
    return () => { isMountedRef.current = false; };
  }, []);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  
  const [sessionNote, setSessionNote] = useState('');
  const [isNotePublic, setIsNotePublic] = useState(true); // NOWY STAN DLA CHECKBOXA TRENERA
  // [FOKUS] Przełącznik przy zapisie — domyślnie zaznaczony, żeby nikt nie
  // tracił postępu przez zapomnienie. Także bez kropek (user 2026-09-18: fokus
  // ma się liczyć przy normalnym treningu; bez kropek trening trafia do dat).
  // Fokus bez tematu liczy każdy trening sam. W Arenie się nie pokazuje.
  // `true` = z liczbą treningów — miniatura fokusu w nagłówku pokazuje kropki.
  const focusState = useCurrentFocus(battleId ? null : userId);
  // [DWA FOKUSY] Chipy „pod jaki fokus” zamiast dawnego przełącznika tematu.
  const [focusChoice, setFocusChoice] = useFocusChoice(focusState, userId);
  // [TEMAT TRENINGU] W nagłówku to, co jest na górze karty (fokus albo temat dnia).
  const headerFocus = displayPair(focusState).main;
  
  const [isStatsExpanded, setIsStatsExpanded] = useState(false);
  const [activeBattle, setActiveBattle] = useState<any>(null);
  const [battleParticipants, setBattleParticipants] = useState<any[]>([]);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  // [VEREIN] Pobranie bitwy na żądanie (gra klubowa nie jest nasłuchiwana) i wizytówki raz na grę.
  const refreshBattleRef = useRef<(() => Promise<void>) | null>(null);
  const profileCacheRef = useRef(new Map<string, any>());

  const [showAbortModal, setShowAbortModal] = useState(false);
  const [showPartialModal, setShowPartialModal] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastType, setToastType] = useState<'INFO' | 'ERROR'>('INFO');

  // Guest players state
  const [showGuestScorePanel, setShowGuestScorePanel] = useState(false);
  const [activeGuestIndex, setActiveGuestIndex] = useState(0);
  const [guestEndArrows, setGuestEndArrows] = useState<{[guestId: string]: string[]}>({});
  const [battleGuests, setBattleGuests] = useState<{guestId: string, name: string}[]>([]);
  
  const audioCtxRef = useRef<AudioContext | null>(null);
  // [C41] Id sesji nadany przy pierwszym „Zapisz" i trzymany w activeSession.
  // Gdy aplikacja zamknie sie zanim zapis dojdzie do serwera, wznowiony trening
  // wie, ze jest juz w telefonie — zamiast drugiej kopii w statystykach.
  const saveIdRef = useRef<string | null>(null);

  // Ile serii ma ten trening. Standard 12 (2 rundy po 6); krotszy wybiera sie
  // w Vorbereitung. Pojedynek zawsze 12. Wznowiony trening bierze wartosc
  // z grotX_activeSession (efekt nizej), nie z propsa.
  const [plannedEnds, setPlannedEnds] = useState<number>(
    !battleId && plannedEndsProp && plannedEndsProp > 0 && plannedEndsProp < PLANNED_ENDS ? plannedEndsProp : PLANNED_ENDS
  );
  const isShortTraining = plannedEnds < PLANNED_ENDS;
  // Seria dzieli sie po rowno na 2 Durchgange: 12 = 6+6, 8 = 4+4, 6 = 3+3.
  const roundSize = Math.ceil(plannedEnds / 2);

  const isRestingBetweenRounds = submittedEnds.length === roundSize && inputArrows.length === 0;
  const isTrainingFinished = submittedEnds.length === plannedEnds;
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
        if ((data.distanceId || null) === (distanceId || null) && data.distance === distance && data.targetType === targetType) {
          if (data.submittedEnds) setSubmittedEnds(data.submittedEnds);
          if (data.inputArrows) setInputArrows(data.inputArrows);
          if (data.inputCoordinates) setInputCoordinates(data.inputCoordinates);
          if (data.activeRoundTab) setActiveRoundTab(data.activeRoundTab);
          if (data.saveId) saveIdRef.current = data.saveId;
          if (!battleId && typeof data.plannedEnds === 'number' && data.plannedEnds > 0 && data.plannedEnds <= PLANNED_ENDS) setPlannedEnds(data.plannedEnds);
        }
      } catch (e) {
        console.error("Błąd odczytu lokalnej pamięci sesji", e);
      }
    }
  }, [distance, distanceId, targetType]);

  // [RELOAD 2026-10-29] Pierwsze uruchomienie efektu niżej widzi jeszcze pusty
  // stan (przywrócone serie wchodzą dopiero w następnym renderze) — gdyby tu
  // kasował, każdy zapis, który nie pasuje do propsów, znikałby przy samym
  // wejściu na ekran. Nowy trening czyści zapis sam (App.handleStartSession).
  const persistReadyRef = useRef(false);

  useEffect(() => {
    if (inputArrows.length > 0 || submittedEnds.length > 0) {
      persistReadyRef.current = true;
      localStorage.setItem('grotX_activeSession', JSON.stringify({
        distance,
        distanceId,
        // Etykieta, pojedynek i strzały próbne — App odtwarza z nich ekran po przeładowaniu.
        ...(distanceLabel ? { distanceLabel } : {}),
        ...(battleId ? { battleId } : {}),
        ...(practiceArrowsProp ? { practiceArrows: practiceArrowsProp } : {}),
        targetType,
        inputArrows,
        inputCoordinates,
        submittedEnds,
        activeRoundTab,
        plannedEnds,
        ...(saveIdRef.current ? { saveId: saveIdRef.current } : {}),
      }));
      window.dispatchEvent(new Event('session_state_changed'));
    } else if (persistReadyRef.current) {
      // Cofnięcie do zera strzał w tym treningu — zapis już niepotrzebny.
      localStorage.removeItem('grotX_activeSession');
      window.dispatchEvent(new Event('session_state_changed'));
    } else {
      persistReadyRef.current = true;
    }
  }, [inputArrows, inputCoordinates, submittedEnds, distance, distanceId, distanceLabel, battleId, practiceArrowsProp, targetType, activeRoundTab, plannedEnds]);

  useEffect(() => {
    if (showStats) setIsStatsExpanded(true);
    else setIsStatsExpanded(false);
  }, [showStats]);

  useEffect(() => {
    if (onUpdateEndIndex) onUpdateEndIndex(submittedEnds.length);
  }, [submittedEnds.length, onUpdateEndIndex]);

  useEffect(() => {
    if (!userId || !battleId) {
      setActiveBattle(null);
      setBattleParticipants([]);
      return;
    }
    // [VEREIN] Gra klubowa NIE jest nasłuchiwana na żywo — przy 12 graczach
    // każda seria kogokolwiek szła na 12 telefonów (rośnie z kwadratem). Bitwę
    // pobieramy przy wejściu i po każdej WŁASNEJ serii (refreshBattleRef);
    // ranking i tak pokazuje innych tylko do etapu patrzącego. LOCAL/WORLD
    // (2–4 osoby) zostają na żywo.
    const battleRef = doc(db, 'battles', battleId);
    let alive = true;
    let unsub: (() => void) | undefined;
    const apply = (snapshot: any) => {
      if (alive && snapshot.exists()) {
        const bData = snapshot.data();
        // Ukończona gra: nowe liczenie nadpisałoby wynik zerem — do historii.
        if (bData.finishedParticipants?.includes(userId) && !isSavingRef.current) {
          showToast(t('home.arenaAlreadyDone'));
          localStorage.removeItem('grotX_activeSession');
          onNavigate?.('BATTLE_HISTORY');
          return;
        }
        // Każdy strzela ze swojego dystansu — zapisujemy własny, żeby ranking go pokazał.
        const myDistance = distanceLabel || distance;
        if (myDistance && bData.participants?.includes(userId) && bData.distances?.[userId] !== myDistance) {
          updateDoc(doc(db, 'battles', battleId), { [`distances.${userId}`]: myDistance }).catch(() => {});
        }
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
          // Nazwa, klub i kraj są w samej bitwie (participantsData, zapis przy
          // dołączaniu). Wizytówkę z profiles_public [RODO C6] pobieramy tylko
          // dla gracza bez tych danych i tylko raz — wcześniej szło to przy
          // każdej zmianie bitwy dla wszystkich (~80% ruchu gry).
          const details = () => bData.participants.map((pId: string) => {
            const pd = bData.participantsData?.[pId];
            const pub = profileCacheRef.current.get(pId);
            return {
              id: pId,
              name: pd?.name || pub?.displayName || '',
              club: pd?.club || pub?.club || '',
              countryCode: pd?.country || pub?.country || 'DE'
            };
          });
          setBattleParticipants(details());
          const missing = bData.participants.filter((pId: string) => !bData.participantsData?.[pId] && !profileCacheRef.current.has(pId));
          if (missing.length) {
            Promise.all(missing.map(async (pId: string) => {
              profileCacheRef.current.set(pId, await getPublicProfile(pId));
            })).then(() => { if (alive) setBattleParticipants(details()); });
          }
        } else {
          setActiveBattle(null);
          setBattleParticipants([]);
          setBattleGuests([]);
        }
      }
    };
    refreshBattleRef.current = () => getDoc(battleRef).then(apply).catch(() => {});
    getDoc(battleRef).then(snap => {
      apply(snap);
      if (alive && snap.data()?.mode !== 'CLUB') unsub = onSnapshot(battleRef, apply);
    }).catch(() => {});
    return () => { alive = false; refreshBattleRef.current = null; unsub?.(); };
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

      if (isVisualInput && isSpotFace(targetType)) {
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
        
        if (submittedEnds.length === roundSize - 1) {
          onRoundTwoStart?.();
          setActiveRoundTab(2);
        }
      }, 600); 
    }
    return () => clearTimeout(timeoutId);
  }, [inputArrows, submittedEnds.length, onRoundTwoStart, roundSize]); 

  const r1Ends = submittedEnds.slice(0, roundSize);
  const r2Ends = submittedEnds.slice(roundSize, plannedEnds);
  const globalStats = getStats(submittedEnds, inputArrows);
  const currentRoundStats = activeRoundTab === 1 ? getStats(r1Ends, submittedEnds.length < roundSize ? inputArrows : []) : getStats(r2Ends, submittedEnds.length >= roundSize ? inputArrows : []);
  const r1TotalScore = r1Ends.reduce((sum, end) => sum + (end.total_sum || 0), 0);
  const isRound1Finished = submittedEnds.length >= roundSize;

  // Wynik na zywo idzie do pojedynku raz na serie (z zatwierdzonych serii),
  // nie przy kazdej strzale — 6x mniej zapisow i odczytow u przeciwnikow.
  // Wynik koncowy (z niedokonczona seria) dosyla saveTrainingSession.
  const endsStats = getStats(submittedEnds);
  // [VEREIN] Wynik narastający po każdej serii — z niego ranking „na ślepo"
  // przycina innych do etapu patrzącego (utils/battleStage.ts).
  const stageProgress = (active: string[] = []): StagePoint[] => {
    const out: StagePoint[] = submittedEnds.map((_, i) => {
      const s = getStats(submittedEnds.slice(0, i + 1));
      return { a: s.count, s: s.score, x: s.x, t: s.t, n: s.n };
    });
    if (active.length) {
      const s = getStats(submittedEnds, active);
      out.push({ a: s.count, s: s.score, x: s.x, t: s.t, n: s.n });
    }
    return out;
  };
  const pushLiveScore = (st: { score: number; x: number; t: number; n: number }, active: string[] = []) => {
    if (!activeBattle?.id || !userId || !activeBattle?.participants?.includes(userId)) return Promise.resolve();
    // Wynik ukończonej gry jest zamrożony (pilnuje też reguła).
    if (activeBattle.finishedParticipants?.includes(userId)) return Promise.resolve();
    return updateDoc(doc(db, 'battles', activeBattle.id), {
      [`liveScores.${userId}`]: { score: st.score, x: st.x, t: st.t, n: st.n, ends: stageProgress(active) }
    })
      // Gra klubowa: świeży ranking dopiero po własnej serii (1 odczyt zamiast nasłuchu).
      .then(() => { if (activeBattle?.mode === 'CLUB') return refreshBattleRef.current?.(); })
      .catch(e => console.error("Silent live update failed:", e));
  };

  useEffect(() => {
    pushLiveScore(endsStats);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endsStats.score, endsStats.x, endsStats.t, endsStats.n, endsStats.count, activeBattle?.id, userId]);

  const discardSession = () => {
    localStorage.removeItem('grotX_activeSession');
    window.dispatchEvent(new Event('session_state_changed'));
    onNavigate('HOME');
  };

  // [C31] Przed 12. seria pytamy, czy wynik ma trafic do sum i krzywych.
  // W Arenie/Battle nie pytamy — tam liczy sie wynik, jaki padl.
  const requestSave = () => {
    if (!battleId && submittedEnds.length > 0 && submittedEnds.length < plannedEnds) {
      setShowPartialModal(true);
      return;
    }
    saveTrainingSession(isShortTraining);
  };

  const finishSave = () => {
    saveIdRef.current = null;
    localStorage.removeItem('grotX_activeSession');
    // Unieważnienie wszystkich cache'y statystyk po nowym treningu
    localStorage.removeItem(`grotX_quickStats_${userId}`);
    localStorage.removeItem(`grotX_proStats_${userId}`);
    localStorage.removeItem(`grotX_stats_v13_${userId}`);
    localStorage.removeItem(`grotX_lastSession_${userId}`);
    invalidateRecentSessions(userId); // wyczyść dedup w pamięci wspólnego źródła sesji
    window.dispatchEvent(new Event('session_state_changed'));
    onNavigate('HOME');
  };

  const saveTrainingSession = async (markPartial: boolean) => {
    if (!userId) return;
    setShowPartialModal(false);
    
    if (submittedEnds.length === 0) {
      showToast(t('scoringView.errorNoArrows', 'Brak strzał na tarczy. Dodaj wyniki.'), 'ERROR');
      return;
    }

    setIsSaving(true);
    isSavingRef.current = true;
    try {
      // [C41] Zaden zapis ponizej nie czeka na serwer dluzej niz chwile —
      // bez zasiegu trafia do telefonu i wysle sie sam (utils/offlineWrite).
      const sessionsCol = collection(db, `users/${userId}/sessions`);
      if (!saveIdRef.current) {
        saveIdRef.current = doc(sessionsCol).id;
        try {
          const raw = localStorage.getItem('grotX_activeSession');
          if (raw) localStorage.setItem('grotX_activeSession', JSON.stringify({ ...JSON.parse(raw), saveId: saveIdRef.current }));
        } catch { /* bez localStorage: najwyzej brak ochrony przed duplikatem */ }
      }
      const sessionRef = doc(sessionsCol, saveIdRef.current);
      // Poprzednia proba zapisu (aplikacja zamknieta w trakcie) juz jest w telefonie.
      const alreadySaved = await getDocFromCache(sessionRef).then(snap => snap.exists(), () => false);
      if (alreadySaved) {
        finishSave();
        return;
      }

      // Ostatnia, niedokonczona seria nie poszla jeszcze do pojedynku.
      if (inputArrows.length > 0) pushLiveScore(globalStats, inputArrows);
      const sessionTimestamp = Timestamp.now();

      const isWorldBattle = !!activeBattle?.isWorldBattle;
      const opponentId    = isWorldBattle
        ? activeBattle.participants?.find((id: string) => id !== userId)
        : null;
      const opponentScore = opponentId ? (activeBattle.liveScores?.[opponentId]?.score ?? 0) : 0;
      const didWinWorld   = isWorldBattle && globalStats.score > opponentScore;
      const worldXp       = isWorldBattle ? WORLD_XP_PARTICIPATION + (didWinWorld ? WORLD_XP_WIN : 0) : 0;

      // globalStats.count już zawiera M (liczymy jako wystrzelone strzały)
      const sessionArrows = globalStats.count;
      const practiceCount = practiceArrowsProp || 0;

      // [ZESTAWY] Z czego padł ten wynik — bez tego rekordy różnych klas
      // sprzętu zmieszają się bezpowrotnie. Patrz utils/setupStamp.ts
      const setupStamp = await getSetupStamp(userId);
      // Profil czytany PRZED wydaniem zapisow — blad odczytu nie zostawi
      // zapisanej sesji z komunikatem „Blad zapisu" (i pokusa drugiego klikniecia).
      const userSnap = await userDocCacheFirst(userId);
      const ud = userSnap.exists() ? userSnap.data() : {};
      // [FOKUS] Migawka na stałe — widać ją później w statystykach.
      const sessionTopics = chosenFocusTopics(focusState, focusChoice);
      const focusFields = sessionFocusFields(focusState, sessionTopics, focusChoice);

      const sessionWrite = settleWrite(setDoc(sessionRef, {
        ...setupStamp,
        score: globalStats.score,
        scoreArrows: sessionArrows, // = sessionArrows, M liczone do średniej
        sessionArrows,              // fizyczne strzały treningowe
        practiceArrows: practiceCount,
        arrows: sessionArrows + practiceCount, // łączna suma do wyświetlania
        distance: distance,
        // [C25] Kubelek statystyk + nazwa z chwili strzalu. Patrz config/distances.ts.
        // `distanceLabel` przychodzi juz gotowe do pokazania ("18m barebow"),
        // wiec NIE sklejamy go tu drugi raz z metrami.
        ...(distanceId ? { distanceId } : {}),
        ...(distanceLabel ? { distanceLabel } : {}),
        targetType: targetType,
        date: new Date().toLocaleDateString('pl-PL'),
        timestamp: sessionTimestamp,
        // [RODO C36] Prywatna notatka NIE trafia do sesji (czytelnej dla
        // trenera) — tekst idzie do sessionNotes, patrz utils/privateSessionNote.ts
        note: sessionNoteField(sessionNote, isNotePublic),
        isNotePublic: isNotePublic,
        ...(sessionTopics.length ? { topics: sessionTopics } : {}),
        ...focusFields,
        ends: submittedEnds,
        // Przerwany ALBO z gory krotszy trening: suma nieporownywalna z 12 seriami.
        // Krotszy ukonczony ma endsShot === endsPlanned (patrz isShortPlanned).
        ...(markPartial ? { isPartial: true, endsShot: submittedEnds.length, endsPlanned: plannedEnds } : {}),
        ...(isWorldBattle && { sessionType: 'WORLD_BATTLE', worldResult: didWinWorld ? 'WIN' : 'LOSS' }),
        // Bitwa: typ dla statystyk + powiązanie z grą (wcześniej „Solo-Training”).
        ...(activeBattle && { type: isWorldBattle ? 'WORLD_BATTLE' : 'Arena', battleId: activeBattle.id, battleMode: activeBattle.mode || 'LOCAL' }),
        ...guestExpiryFields(), // [GOŚĆ] sesje gościa wygasają po 24h (TTL)
      }));

      // Denormalizacja + ranga z handicapu (utils/rankEngine.ts)
      const userRef = doc(db, 'users', userId);

      // [RANGA] Handicap tej sesji idzie do listy jej łuku. Dmuchawka, Field
      // i tarcze ze strefami nie liczą się (handicapOfSession → null) — inna
      // skala punktów. Profil jeszcze w systemie XP przelicza Home z historii,
      // tu dopisujemy tylko do profilu już przeliczonego.
      const rankFields = ud.rankVersion === RANK_VERSION
        ? applySessionsToRank(ud, [{
            score: globalStats.score,
            scoreArrows: globalStats.count,
            distance,
            targetType,
            bowClass: setupStamp.bowClass ?? ud.bowType,
          }])
        : null;

      // Odrzucenie sesji przez serwer rzuca tutaj — trening zostaje na ekranie,
      // a XP nie jest doliczane. Bez zasiegu: 'queued', profil idzie za sesja.
      await sessionWrite;

      // [RANGA] Awans pokazuje Home po powrocie (ten ekran zaraz znika).
      const rankUp = rankFields ? rankUpBetween(ud, rankFields) : null;
      if (rankUp) {
        try {
          localStorage.setItem(RANK_UP_KEY, JSON.stringify({ level: rankUp.level, bow: rankUp.bow, handicap: rankUp.handicap, first: rankFromStored(ud).handicap === null }));
        } catch { /* bez localStorage: awans i tak widać na kaflu */ }
      }

      if (!isNotePublic && sessionNote) {
        settleWrite(writePrivateSessionNote(userId, sessionRef.id, sessionNote, false))
          .catch(e => console.error('Błąd zapisu prywatnej notatki:', e));
      }

      // Profil osobno od sesji: jego odrzucenie nie moze zabrac zapisanego treningu.
      settleWrite(updateDoc(userRef, {
        lastSessionTimestamp: sessionTimestamp,
        lastSessionScore: globalStats.score,
        lastSessionArrows: globalStats.count,
        lastSessionDistance: distance,
        lastSessionType: 'SCORE', // 'TECHNICAL' pisze SessionSetup
        ...(rankFields || {}),
      })).catch(e => console.error('Błąd aktualizacji profilu po treningu:', e));

      if (activeBattle) {
        const battleRef = doc(db, 'battles', activeBattle.id);
        updateDoc(battleRef, {
          finishedParticipants: arrayUnion(userId)
        })
          // [ZAMYKANIE] Ostatni gracz pojedynku/World zamyka grę (status FINISHED).
          // Gra klubowa zamyka się dopiero po terminie — dochodzą do niej nowi.
          .then(() => {
            const done = new Set([...(activeBattle.finishedParticipants || []), userId]);
            const everyone = (activeBattle.participants || []).every((p: string) => done.has(p));
            if (activeBattle.mode !== 'CLUB' && everyone) {
              return updateDoc(battleRef, { status: 'FINISHED' });
            }
          })
          .catch(() => console.warn("Zignorowano błąd uprawnień przy aktualizacji statusu Areny."));
      }

      if (isWorldBattle) {
        try {
          // [PRYWATNOŚĆ] world_stats czyta każdy zalogowany — nazwa i klub
          // przechodzą przez flagi prywatności (buildPublicProfile). Dla WORLD
          // nazwisko jest ZAWSZE skrócone do inicjału (showFullName: false) —
          // flagi mogą tylko dodatkowo ograniczyć (nickname, ukrycie klubu).
          const pub = buildPublicProfile({ ...ud, showFullName: false });
          updateWorldStatsOnly(
            userId,
            pub.displayName || 'Schütze',
            pub.club,
            pub.country,
            ud.level     || 1,
            didWinWorld,
            worldXp,
          ).catch(e => console.warn('Błąd zapisu world_stats:', e));
        } catch (e) {
          console.warn('Błąd zapisu world_stats:', e);
        }
      }

      finishSave();

    } catch (error) {
      console.error("Krytyczny błąd zapisu sesji:", error);
      isSavingRef.current = false;
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

  // [VEREIN] W grze klubowej innych widać tylko do Twojego etapu (tyle strzał,
  // ile zatwierdziłeś); pełne wyniki po ostatniej serii. LOCAL/WORLD bez zmian.
  const isClubBattle = activeBattle?.mode === 'CLUB';
  const seeAllScores = !isClubBattle || submittedEnds.length >= plannedEnds;
  const seenScore = (id: string): StageScore | null =>
    scoreSeenBy(activeBattle, id, userId, endsStats.count, seeAllScores);

  const rankedParticipants = [...battleParticipants].sort((a, b) => compareStage(seenScore(a.id), seenScore(b.id)));

  const guestParticipants = battleGuests.map((g) => ({
    id: g.guestId,
    name: g.name,
    club: t('scoringView.guestMode'),
    countryCode: '',
    isGuest: true
  }));

  const getScoreForRank = (id: string) => seenScore(id)?.score ?? -1;

  const allRankedParticipants = [...rankedParticipants, ...guestParticipants].sort(
    (a, b) => getScoreForRank(b.id) - getScoreForRank(a.id)
  );

  return (
    <div className="space-y-2 pb-40 relative w-full pt-[env(safe-area-inset-top)] max-w-md mx-auto min-h-screen flex flex-col bg-[#fcfdfe]">
      
      {isTargetFullscreen && activeInputTab === 1 && submittedEnds.length < plannedEnds && (
        <TargetInput 
          onShot={addScoreFromTarget} 
          isFullscreen={true} 
          onToggleFullscreen={() => setIsTargetFullscreen(false)} 
          currentArrows={inputArrows} 
          currentCoords={inputCoordinates}
          onUndo={undo}
          targetType={targetType}
          arrowColors={arrowColors}
        />
      )}

      <div className="bg-white p-3 mx-2 mt-2 rounded-2xl shadow-sm border border-gray-100 shrink-0">
        <div className="flex items-center justify-between h-10">
          {/* [FOKUS] Miniatura fokusu w miejscu logo (user 2026-09-18) — ta sama
              wysokość paska, więc klawiatura nie zjeżdża. Klik = pełny tytuł. */}
          {headerFocus || activeBattle ? (
            <>
            {/* Mniejsze logo zostaje obok fokusu i przycisku areny (user 2026-09-18 / 2026-10-21). */}
            <div className="flex items-center shrink-0 pl-1 pr-2.5 border-r border-gray-100 h-full">
              <div className="flex items-baseline whitespace-nowrap">
                <span className="text-[15px] font-black text-[#0a3a2a] tracking-tighter leading-none">GROT-X</span>
                {/* Środek kropki na środku wysokości „X": wersalik ~11px przy 15px,
                    więc środek ~5.5px nad baseline; kropka 6px -> dół na 2.5px.
                    Stałe px, nie em — em brałoby odziedziczony font-size. */}
                <div className="w-1.5 h-1.5 bg-[#fed33e] rounded-full ml-0.5 relative bottom-[2.5px]"></div>
              </div>
            </div>
            {headerFocus && (
            <button
              onClick={() => {
                const fc = headerFocus;
                showToast(fc.text && fc.topic ? `${focusTitle(fc, t)} · ${topicLabel(fc.topic, t)}` : focusTitle(fc, t));
              }}
              className="flex items-center gap-1.5 pl-2 pr-2.5 border-r border-gray-100 h-full min-w-0 max-w-[34%] text-left active:scale-95 transition-all"
              aria-label={t('tagebuch.focusLabel')}
            >
              <span className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${focusPalette(headerFocus).icon}`}>
                <span className="material-symbols-outlined text-[16px]">{focusIcon(headerFocus)}</span>
              </span>
              <span className="min-w-0 flex flex-col gap-1">
                <span className="text-[11px] font-black text-[#0a3a2a] leading-none truncate">{focusTitle(headerFocus, t)}</span>
                {!headerFocus.topicId && focusState?.dots
                  ? <FocusDots count={focusState.count} goal={focusState.goal} small light />
                  : <span className={`text-[8px] font-black uppercase tracking-widest leading-none truncate ${focusPalette(headerFocus).sub}`}>{t(headerFocus.topicId ? 'tagebuch.topicLabel' : 'tagebuch.focusLabel')}</span>}
              </span>
            </button>
            )}
            {/* [ARENA] Ranking w górnym pasku zamiast osobnego wiersza — ten wiersz
                spychał wynik w dół na telefonie (user 2026-10-21). Kolor = tryb. */}
            {activeBattle && (() => {
              // Gra klubowa: ranking od 1. serii (pokazuje innych do Twojego etapu).
              const rankingReady = isClubBattle ? submittedEnds.length >= 1 : submittedEnds.length >= 6;
              const tone = !rankingReady ? 'text-gray-400'
                : activeBattle.mode === 'CLUB' ? 'text-fuchsia-600'
                : activeBattle.mode === 'WORLD' ? 'text-emerald-600' : 'text-indigo-600';
              return (
                <button
                  onClick={() => {
                    if (rankingReady) setShowLeaderboard(true);
                    else showToast(isClubBattle ? t('scoringView.rankingAlertEnd') : t('scoringView.rankingAlert', "Ranking dostępny po 1. rundzie."));
                  }}
                  className={`flex flex-col items-center justify-center gap-0.5 px-2.5 border-r border-gray-100 h-full shrink-0 active:scale-90 transition-all ${tone}`}
                  aria-label={t('scoringView.rankingClub')}
                >
                  <span className={`material-symbols-outlined text-[18px] leading-none ${rankingReady ? 'animate-pulse' : ''}`}>
                    {activeBattle.mode === 'CLUB' ? 'shield' : activeBattle.mode === 'WORLD' ? 'public' : 'sensors'}
                  </span>
                  <span className="text-[7px] font-black uppercase tracking-widest leading-none">{t('scoringView.rankingClub')}</span>
                </button>
              );
            })()}
            </>
          ) : (
          <div className="flex items-center pl-6 shrink-0 border-r border-gray-100 pr-4 h-full">
            <div className="flex items-baseline whitespace-nowrap">
              <span className="text-[24px] font-black text-[#0a3a2a] tracking-tighter leading-none">GROT-X</span>
              <div className="w-1.5 h-1.5 bg-[#fed33e] rounded-full ml-1 relative bottom-[0.35em]"></div>
            </div>
          </div>
          )}
          <div className="flex-1 flex flex-col items-start justify-center px-2 h-full">
            <div className="font-black text-[#0a3a2a] text-[15px] leading-none flex items-center">
              <span className="material-symbols-outlined text-[14px] text-emerald-600 mr-1">target</span>
              {distanceLabel || distance}
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
          </div>
        </div>

        {/* [TEMAT TRENINGU] Pod co idzie ten trening — u góry jak w treningu
            technicznym (user 2026-10-15); domyślnie zaznaczone fokus i temat. */}
        {focusState && (focusState.focus || focusState.trainingTopic) && (
          <div className="mt-2 pt-2 border-t border-gray-100">
            <FocusChoiceChips state={focusState} choice={focusChoice} onChange={setFocusChoice} showLabel={false} />
          </div>
        )}

      </div>

      <div className="flex gap-1 p-1 mx-auto w-5/6 bg-gray-50 rounded-2xl border border-gray-200">
        <button onClick={() => setActiveRoundTab(1)} className={`flex-1 py-2.5 rounded-xl text-[12px] font-black tracking-widest transition-all ${activeRoundTab === 1 ? 'bg-[#0a3a2a] text-white shadow-md' : 'text-gray-400'} flex items-center justify-center gap-1 uppercase`}>{String(t('scoringView.round', 'RUNDA')).toUpperCase()} 1 {isRound1Finished && <span className="opacity-80">({r1TotalScore})</span>}</button>
        <button onClick={() => { if (isRound1Finished) setActiveRoundTab(2); }} className={`flex-1 py-2.5 rounded-xl text-[12px] font-black tracking-widest transition-all ${activeRoundTab === 2 ? 'bg-[#0a3a2a] text-white shadow-md' : 'text-gray-400'} ${!isRound1Finished ? 'opacity-30 cursor-not-allowed' : ''} uppercase`}>{String(t('scoringView.round', 'RUNDA')).toUpperCase()} 2</button>
      </div>

      <Timer isExpanded={isTimerExpanded} onClose={() => setIsTimerExpanded(false)} playBeep={playBeep} currentEnd={submittedEnds.length} externalSeconds={timerSeconds} setExternalSeconds={setTimerSeconds} externalMode={timerMode} setExternalMode={setTimerMode} />

      {submittedEnds.length < plannedEnds && (
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
                arrowColors={arrowColors}
              />
            )}
          </div>
          <div onClick={() => setActiveInputTab(activeInputTab === 0 ? 1 : 0)} className="w-10 bg-emerald-50 hover:bg-emerald-100 flex flex-col items-center justify-center gap-2 border-l border-emerald-200 cursor-pointer shrink-0 transition-colors">
            <span style={{ writingMode: 'vertical-rl' }} className="rotate-180 text-[10px] font-black tracking-widest text-emerald-600 uppercase">{activeInputTab === 0 ? t('scoringView.targetTab', 'Tarcza') : t('scoringView.keyboardTab', 'Klawiatura')}</span>
            {/* Miniatura strzelanej tarczy pod „Auflage" (user 2026-09-18) — tylko na
                klawiaturze, bo wtedy przełącznik prowadzi do tarczy. */}
            {activeInputTab === 0 && <TargetThumbnail targetType={targetType} className="w-7 h-7 shrink-0" />}
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm mx-2">
        <div className="px-3 py-2 flex justify-between items-center text-[10px] font-bold text-white bg-[#0a3a2a]">
          <span>{String(t('scoringView.round', 'RUNDA')).toUpperCase()} {activeRoundTab}</span>
        </div>
        <div className="p-2 space-y-1">
          {Array.from({ length: roundSize }, (_, i) => i).map(i => {
            const idx = activeRoundTab === 1 ? i : roundSize + i;
            const end = submittedEnds[idx];
            const isCur = idx === submittedEnds.length;
            const currentPassArrows = isCur ? inputArrows : (end?.arrows || []); 
            const passSum = isCur ? inputArrows.reduce((s, v) => s + (v==='X'?10:v==='M'?0:parseInt(v)), 0) : (end?.total_sum || 0);
            const prevSum = submittedEnds.slice(activeRoundTab === 1 ? 0 : roundSize, idx).reduce((s, e) => s + (e.total_sum || 0), 0);
            const runSum = prevSum + passSum;
            return (
              <div key={idx} className={`flex items-center text-center p-1 rounded-md transition-all ${isCur ? 'border border-[#F2C94C] bg-white' : 'bg-transparent'}`}>
                <div className="w-6 text-[10px] font-bold text-gray-500">{t('scoringView.endAbbr', 'P')}{idx + 1}</div>
                <div className="flex-1 grid grid-cols-6 gap-1">
                  {/* [KOLORY STRZAŁ] Bieżąca seria idzie w kolejności wpisywania,
                      więc pasek pod polem = kolor strzały; gotowe serie zostają
                      posortowane od X do M jak zawsze. */}
                  {[0,1,2,3,4,5].map(ai => <div key={ai} className={`relative h-8 flex items-center justify-center rounded-md text-[12px] font-bold ${getArrowStyles(currentPassArrows[ai] || '')}`}>{currentPassArrows[ai] || ''}{arrowColors && isCur && <ArrowColorBar index={ai} isNext={ai === inputArrows.length} />}</div>)}
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

      {/* [PODSUMOWANIE TRENINGU] Bilanz od razu po ostatniej serii, bez rozwijania. */}
      {isTrainingFinished && (
        <div className="mx-2 mt-4 animate-fade-in-up">
          <SessionBilanz userId={userId} ends={submittedEnds} roundSize={roundSize} distance={distance} distanceId={distanceId} targetType={targetType} />
        </div>
      )}

      {/* [PODSUMOWANIE TRENINGU] Analiza w zwijanych kartach dziennika (2026-10-29).
          Między rundami i po ostatniej serii karty stoją od razu; w trakcie
          strzelania chowa je przycisk „Pokaż statystyki”. */}
      {submittedEnds.length > 0 && !showStats && (
        <div className="mx-2 mt-2">
          <button
            onClick={() => setIsStatsExpanded(!isStatsExpanded)}
            className="w-full flex items-center justify-between p-4 bg-white border border-gray-100 rounded-2xl shadow-sm active:scale-[0.98] transition-all"
          >
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-emerald-600">analytics</span>
              <span className="text-[10px] font-black uppercase tracking-widest text-[#0a3a2a]">
                {isStatsExpanded ? t('scoringView.collapse', 'Ukryj') : t('scoringView.showStats', 'Pokaż statystyki')}
              </span>
            </div>
            <span className={`material-symbols-outlined transition-transform duration-300 ${isStatsExpanded ? 'rotate-180' : ''}`}>
              keyboard_arrow_down
            </span>
          </button>
        </div>
      )}

      {submittedEnds.length > 0 && (showStats || isStatsExpanded) && (() => {
        const viewEnds = targetView === 1 ? r1Ends : targetView === 2 ? r2Ends : submittedEnds;
        const viewStart = targetView === 2 ? roundSize : 0;
        const viewArrows = viewEnds.reduce((acc: number, e: any) => acc + (e.arrows?.length || 0), 0);
        const viewLabel = targetView === 'all' ? t('scoring.viewAll') : `${t('scoringView.round', 'Runda')} ${targetView}`;
        const selected = highlightedEnd !== null ? submittedEnds[highlightedEnd] : null;
        const getArrowBg = (val: string) => {
          if (['X', '10', '9'].includes(val)) return 'bg-[#F2C94C] text-[#333] shadow-sm';
          if (['8', '7'].includes(val)) return 'bg-[#EB5757] text-white shadow-sm';
          if (['6', '5'].includes(val)) return 'bg-[#2F80ED] text-white shadow-sm';
          if (['4', '3'].includes(val)) return 'bg-[#333] text-white shadow-sm';
          if (val === 'M') return 'bg-purple-900 text-white shadow-sm';
          return 'bg-gray-100 text-gray-400';
        };
        // Wybór serii z innej rundy przełącza tarczę na tę rundę — inaczej
        // podświetlenie trafiałoby w pustkę.
        const pickEnd = (idx: number) => {
          const next = highlightedEnd === idx ? null : idx;
          setHighlightedEnd(next);
          if (next !== null && targetView !== 'all') setTargetView(next < roundSize ? 1 : 2);
        };
        return (
          <div className="mx-2 mt-4 space-y-3 animate-fade-in-up">
            {/* TREND + wybrana seria w jednej karcie */}
            <SummaryCard
              icon="bar_chart"
              kind={t('scoring.trendTitle')}
              title={t('scoring.trendAvg', { avg: (submittedEnds.reduce((a: number, e: any) => a + (e.total_sum || 0), 0) / submittedEnds.length).toLocaleString(i18n.language, { maximumFractionDigits: 1 }) })}
              right={<span className="text-[9px] font-bold text-gray-400 mr-1">{t('scoring.trendHint')}</span>}
              storageKey="sum-trend"
            >
              <SessionTrend bare submittedEnds={submittedEnds} highlighted={highlightedEnd} roundSize={roundSize} plannedEnds={plannedEnds} onPointClick={pickEnd} />
              {selected && highlightedEnd !== null && (
                <div className="mt-3 pt-2.5 border-t border-gray-100 flex items-start justify-between gap-2 animate-fade-in">
                  <div className="flex flex-col shrink-0">
                    <span className="text-[9px] font-black text-emerald-700 uppercase tracking-widest">{t('scoring.series')} {highlightedEnd + 1}</span>
                    <span className="text-lg font-black text-[#0a3a2a] leading-tight">{selected.total_sum} {t('scoringView.pts', 'pkt')}</span>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <div className="flex gap-1">
                      {selected.arrows?.map((a: string, i: number) => (
                        <div key={i} className={`w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-black ${getArrowBg(a)}`}>{a}</div>
                      ))}
                    </div>
                    {/* [KOLORY STRZAŁ] Wynik posortowany, pod nim kolejność strzelania (user 2026-10-29). */}
                    {arrowColors && (selected.rawArrows || []).length > 0 && (
                      <>
                        <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest mt-0.5">{t('scoring.colorFilter')}</span>
                        <div className="flex gap-1">
                          {(selected.rawArrows as string[]).map((a, i) => {
                            const c = arrowColorAt(i);
                            return (
                              <div key={i} className="w-7 flex flex-col items-center">
                                <span className="w-3 h-3 rounded-full border border-gray-300" style={{ backgroundColor: c?.hex || '#e5e7eb' }} />
                                <span className="text-[9px] font-black text-gray-500 tabular-nums leading-tight">{a}</span>
                              </div>
                            );
                          })}
                        </div>
                      </>
                    )}
                  </div>
                  <button onClick={() => setHighlightedEnd(null)} className="text-gray-400 active:scale-90 shrink-0" aria-label={t('common.close', 'Schließen')}>
                    <span className="material-symbols-outlined text-sm">close</span>
                  </button>
                </div>
              )}
            </SummaryCard>

            {/* TREFFERBILD — jedna duża tarcza zamiast dwóch małych (lepiej czytelna na telefonie).
                Kolory strzał: kolumna miniatur po prawej (filtr), w rogu tarczy przycisk
                „przytrzymaj = wszystkie żółte”, bo sześć kolorów naraz bywa za pstrokate. */}
            <SummaryCard
              icon="adjust"
              kind={t('scoring.targetCard')}
              title={`${viewLabel} · ${viewArrows} ${t('common.arrows')}`}
              storageKey="sum-target"
            >
              {r2Ends.length > 0 && (
                <div className="flex bg-gray-50 rounded-xl p-0.5 mb-2">
                  {(['all', 1, 2] as const).map(v => (
                    <button
                      key={String(v)}
                      onClick={() => setTargetView(v)}
                      className={`flex-1 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${targetView === v ? 'bg-white text-[#0a3a2a] shadow-sm' : 'text-gray-400'}`}
                    >
                      {v === 'all' ? t('scoring.viewAll') : `${t('scoringView.round', 'Runda')} ${v}`}
                    </button>
                  ))}
                </div>
              )}
              {arrowColors && (
                <span className="block text-right text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1">{t('scoring.colorFilter')}</span>
              )}
              <RoundTargetSummary
                bare
                ends={viewEnds}
                highlightedEnd={highlightedEnd}
                startIndex={viewStart}
                targetType={targetType}
                arrowColors={arrowColors}
                colorFilter={colorFilter}
                showGroup
                sightHint={hasSight}
                plainDots={plainDots}
                aside={arrowColors ? <ArrowColorFilter value={colorFilter} onChange={setColorFilter} vertical /> : undefined}
                overlay={arrowColors ? (
                  <button
                    onPointerDown={() => setPlainDots(true)}
                    onPointerUp={() => setPlainDots(false)}
                    onPointerLeave={() => setPlainDots(false)}
                    onPointerCancel={() => setPlainDots(false)}
                    onContextMenu={e => e.preventDefault()}
                    className={`absolute top-0 right-0 z-10 w-9 h-9 rounded-full flex items-center justify-center border shadow-sm select-none transition-colors ${plainDots ? 'bg-[#fed33e] border-[#e5bd38] text-[#0a3a2a]' : 'bg-white border-gray-200 text-gray-500'}`}
                    style={{ touchAction: 'none', WebkitTouchCallout: 'none' }}
                    aria-label={t('scoring.holdPlain')}
                    title={t('scoring.holdPlain')}
                  >
                    <span className="material-symbols-outlined text-[18px]">contrast</span>
                  </button>
                ) : undefined}
              />
            </SummaryCard>

            {AI_ENABLED && submittedEnds.length >= 6 && (
              <CoachAIPanel userId={userId} totalScore={globalStats.score} arrowCount={globalStats.count} accuracy={((globalStats.score / (globalStats.count * 10)) * 100).toFixed(1)} />
            )}
          </div>
        );
      })()}

      {/* DZIENNIK — zwinięty, ale z wyraźnym zaproszeniem do notatki; tuż nad zapisem. */}
      {submittedEnds.length > 0 && (
        <div className="mx-2 mt-3">
          <SummaryCard
            icon="edit_note"
            iconCls="text-indigo-500"
            stripe="tb-private"
            kind={t('scoringView.trainingJournal', 'Dziennik Treningowy')}
            kindCls="text-indigo-600"
            title={sessionNote
              ? <span className="font-bold text-gray-600">„{sessionNote}”</span>
              : <span className="text-indigo-700">{t('scoring.journalAdd')}</span>}
            defaultOpen={false}
          >
            <div className="relative mb-3">
              <textarea
                maxLength={100}
                value={sessionNote}
                onChange={(e) => setSessionNote(e.target.value)}
                placeholder={t('scoringView.notePlaceholder', 'Opisz swoje odczucia: wiatr, zmęczenie, zmiany w sprzęcie...')}
                className="w-full bg-gray-50 border border-gray-100 focus:border-indigo-300 focus:bg-white rounded-xl p-3 text-sm font-bold text-[#0a3a2a] placeholder:text-gray-400 outline-none h-20 resize-none transition-colors"
              />
              <div className={`absolute bottom-2 right-3 text-[9px] font-black uppercase tracking-tighter transition-colors ${sessionNote.length >= 90 ? 'text-red-500' : 'text-gray-400'}`}>
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
          </SummaryCard>
        </div>
      )}

      <div className="flex gap-2 pt-4 px-2 mb-24">
        <button onClick={requestSave} disabled={isSaving || submittedEnds.length === 0} className={`flex-1 py-4 rounded-xl font-black text-[12px] uppercase tracking-widest shadow-md transition-all flex items-center justify-center gap-2 ${isSaving || submittedEnds.length === 0 ? 'bg-gray-400 text-white cursor-not-allowed' : 'bg-[#0a3a2a] text-white active:scale-95'}`}>{isSaving ? t('scoringView.saving', 'Zapisywanie...') : t('scoringView.saveTraining', 'Zapisz trening')}</button>
        <button onClick={() => setShowAbortModal(true)} className="flex-1 py-4 bg-white text-red-500 rounded-xl font-black text-[12px] uppercase border-2 border-red-100 active:scale-95 shadow-sm">{t('scoringView.abort', 'Przerwij')}</button>
      </div>

      {showPartialModal && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[200000] flex items-center justify-center p-6 animate-fade-in-up">
          <div className="bg-white rounded-[32px] p-7 w-full max-w-sm shadow-2xl text-center border border-gray-100">
            <div className="w-14 h-14 bg-amber-50 text-amber-500 rounded-full flex items-center justify-center mx-auto mb-3">
              <span className="material-symbols-outlined text-3xl">hourglass_top</span>
            </div>
            <h2 className="text-xl font-black text-[#0a3a2a] mb-2 uppercase tracking-tighter">{t('scoringView.partialTitle')}</h2>
            <p className="text-sm text-gray-500 font-bold mb-6 leading-relaxed">
              {t('scoringView.partialDesc', { shot: submittedEnds.length, planned: plannedEnds })}
            </p>
            <div className="space-y-2.5">
              <button
                onClick={() => saveTrainingSession(true)}
                disabled={isSaving}
                className="w-full py-3.5 px-4 bg-[#0a3a2a] text-white rounded-xl active:scale-95 transition-all disabled:opacity-50"
              >
                <span className="block font-black uppercase text-[11px] tracking-widest">{t('scoringView.partialMark')}</span>
                <span className="block text-[10px] font-bold text-emerald-100/80 mt-0.5 normal-case">{t('scoringView.partialMarkHint')}</span>
              </button>
              <button
                onClick={() => { setShowPartialModal(false); discardSession(); }}
                disabled={isSaving}
                className="w-full py-3 px-4 bg-white text-red-500 rounded-xl border-2 border-red-100 active:scale-95 transition-all disabled:opacity-50"
              >
                <span className="block font-black uppercase text-[11px] tracking-widest">{t('scoringView.partialDiscard')}</span>
                <span className="block text-[10px] font-bold text-red-400/80 mt-0.5 normal-case">{t('scoringView.partialDiscardHint')}</span>
              </button>
              <button onClick={() => setShowPartialModal(false)} className="w-full py-2.5 text-gray-400 font-black uppercase text-[10px] tracking-widest active:scale-95 transition-all">
                {t('scoringView.cancelAbort', 'Wróć do strzelania')}
              </button>
            </div>
          </div>
        </div>,
        document.body
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
                onClick={() => { setShowAbortModal(false); discardSession(); }} 
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
          {/* Ciemny styl Battle Arena, jak ranking w historii (user 2026-10-21). */}
          <div className="bg-[#111827] rounded-[32px] w-full max-w-sm overflow-hidden shadow-2xl relative flex flex-col border border-white/10">
            <button onClick={() => setShowLeaderboard(false)} className="absolute top-4 right-4 p-2 bg-white/10 text-white rounded-full active:scale-90 transition-all z-10">
              <span className="material-symbols-outlined font-bold">close</span>
            </button>
            <div className={`p-6 text-center text-white border-b border-white/10 bg-gradient-to-b ${activeBattle.mode === 'CLUB' ? 'from-fuchsia-600/30' : activeBattle.mode === 'WORLD' ? 'from-emerald-600/30' : 'from-indigo-600/30'} to-transparent`}>
              <span className={`material-symbols-outlined text-4xl mb-2 ${activeBattle.mode === 'CLUB' ? 'text-fuchsia-400' : activeBattle.mode === 'WORLD' ? 'text-emerald-400' : 'text-indigo-400'}`}>trophy</span>
              <h2 className="text-2xl font-black tracking-tighter uppercase">{activeBattle.mode === 'CLUB' ? t('scoringView.arenaClub') : activeBattle.mode === 'WORLD' ? t('scoringView.arenaWorld') : t('scoringView.arenaLive')}</h2>
              <p className="text-[9px] font-mono font-bold text-gray-500 tracking-widest mt-1">ID {activeBattle.id}</p>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">
                {isClubBattle && !seeAllScores
                  ? t('scoringView.blindRankingHint', { n: endsStats.count })
                  : t('scoringView.liveRanking', 'Ranking na żywo')}
              </p>
            </div>
            <div className="arena-scroll p-4 space-y-2 flex-1 overflow-y-auto max-h-[50vh]">
              {allRankedParticipants.map((p: any, idx: number) => {
                const pData = activeBattle.liveScores?.[p.id];
                const seen = seenScore(p.id);
                const score = seen?.score ?? 0;
                const xCount = seen?.x ?? 0;
                const tCount = seen?.t ?? 0;
                const nCount = seen?.n ?? 0;
                // Gra klubowa: ktoś jeszcze przed Twoim etapem — pokazujemy, po ilu strzałach.
                const behind = isClubBattle && !seeAllScores && seen && p.id !== userId && seen.arrows < endsStats.count;

                const isMe = p.id === userId;
                const isGuest = p.isGuest === true;
                const flagEmoji = !isGuest ? getFlagEmoji(p.countryCode) : '';

                const finalDisplayName = p.name === 'Łucznik' ? t('battleLobby.archer', 'Łucznik') : p.name;
                const finalDisplayClub = p.club === 'Niezrzeszony' ? t('battleLobby.unaffiliated', 'Niezrzeszony') : p.club;

                return (
                  <div key={p.id} className={`flex items-center justify-between p-4 rounded-2xl border transition-all ${isGuest ? 'bg-violet-500/15 border-violet-400/40' : isMe ? 'bg-indigo-600/20 border-indigo-400/60' : 'bg-white/5 border-white/10'}`}>
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center font-black text-sm ${idx === 0 && score > 0 ? 'bg-[#F2C94C] text-[#8B6508]' : idx === 1 && score > 0 ? 'bg-gray-300 text-gray-700' : idx === 2 && score > 0 ? 'bg-[#CD7F32] text-white' : 'bg-white/10 text-gray-400'}`}>
                        {idx + 1}
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5">
                          {isGuest
                            ? <span className="material-symbols-outlined text-violet-300 text-[14px] leading-none">person</span>
                            : flagEmoji && <span className="text-[12px] leading-none">{flagEmoji}</span>
                          }
                          <span className="font-black text-white text-sm leading-none">{finalDisplayName}</span>
                          {isGuest && <span className="text-[8px] bg-violet-600 text-white px-1.5 py-0.5 rounded uppercase font-bold tracking-widest">👤 {t('battleLobby.guestBadge')}</span>}
                          {!isGuest && isMe && <span className="text-[8px] bg-indigo-600 text-white px-1.5 py-0.5 rounded uppercase font-bold tracking-widest">{t('battleHistory.me', 'Ty')}</span>}
                        </div>
                        <div className="flex items-center gap-1 mt-1">
                          <span className="text-[9px] font-bold text-gray-500 uppercase leading-none">{finalDisplayClub}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col items-end justify-center">
                      {seen || isGuest ? (
                        <span className={`text-2xl font-black leading-none ${isGuest ? 'text-violet-300' : 'text-white'}`}>{score}</span>
                      ) : (
                        <span className="text-2xl font-black leading-none text-gray-600">—</span>
                      )}
                      {!isGuest && seen && typeof pData === 'object' && (
                        <span className="text-[8px] font-black text-gray-500 uppercase tracking-widest mt-1">
                          {behind ? t('scoringView.afterArrows', { n: seen.arrows }) : `X:${xCount} 10:${tCount} 9:${nCount}`}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="p-4 border-t border-white/10">
              <button onClick={() => setShowLeaderboard(false)} className="w-full py-4 bg-indigo-600 text-white rounded-xl font-black uppercase text-[11px] tracking-widest active:scale-95 transition-all">
                {t('scoringView.backToTarget', 'Wróć do tarczy')}
              </button>
            </div>
          </div>
        </div>, document.body
      )}

      {toastMessage && typeof document !== 'undefined' && createPortal(
        // Centruje kontener — animacja (transform) nadpisywała -translate-x-1/2.
        <div className="fixed top-14 inset-x-0 z-[300000] flex justify-center px-4 pointer-events-none">
        <div className={`max-w-full px-6 py-3.5 rounded-[24px] font-black text-[10px] uppercase tracking-widest shadow-2xl border animate-fade-in-up flex items-center gap-2 text-center transition-all ${
          toastType === 'ERROR' ? 'bg-red-600 text-white border-red-700' : 'bg-[#0a3a2a] text-white border-emerald-900'
        }`}>
          <span className="material-symbols-outlined text-sm shrink-0">
            {toastType === 'ERROR' ? 'error' : 'info'}
          </span>
          {toastMessage}
        </div>
        </div>, document.body
      )}
    </div>
  );
}