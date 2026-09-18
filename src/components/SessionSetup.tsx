import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { collection, query, onSnapshot, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, increment, serverTimestamp, Timestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { useTranslation } from 'react-i18next';
import TopicPicker from './TopicPicker';
import { topicLabel } from '../constants/trainingTopics';
import { getSetupStamp, invalidateSetupStamp } from '../utils/setupStamp';
import { useActiveFocus } from '../utils/focus';
import { FocusDots, FocusProgressText, FocusStrip, focusTitle } from './tagebuch/FocusCard';
import { selectableTargetIdsFor } from '../config/targetFaces';
import { TargetThumbnail } from './targets/TargetThumbnail';
import { EquipmentSetup, asBowType, resolveSetupColors, setupColorHex } from '../config/equipmentSetups';
import { UserDistance, displayDistance, distancesForSetup } from '../config/distances';
import ViewHeader from './ViewHeader';

interface SessionSetupProps {
  userId: string;
  activeDistances: UserDistance[];
  onStartSession: (distance: string, targetType: string, forceClear: boolean, battleId: string | null, practiceArrows?: number, distanceId?: string, distanceLabel?: string) => void;
  onUpdateDistances?: (newDistances: UserDistance[]) => void;
  onNavigate?: (view: string, tab?: string) => void;
  onGoToBattle?: (distance: string, targetType: string, distanceId?: string, distanceLabel?: string) => void;
  hasActiveSession?: boolean;
}

const ADMIN_IDS = ['Lglbqv96HlO2LoN98yxrIeaQS172', 'b55wNdZf17gH5wxziuzG9bkaQKo2'];


export default function SessionSetup({ userId, activeDistances, onStartSession, onUpdateDistances, onNavigate, onGoToBattle, hasActiveSession }: SessionSetupProps) {
  const { t } = useTranslation();
  // [C25] Wyborem rządzi `id`, nie napis — dwa wpisy mogą mieć te same metry
  // ("18m recurve" i "18m barebow"), więc napis przestał być tożsamością.
  // `selectedDistance` zostaje jako METRY, bo tak leci do sesji i do handicapu.
  const [selectedId, setSelectedId] = useState<string>('');
  const [selectedDistance, setSelectedDistance] = useState<string>('');
  const selectedEntry = activeDistances.find(d => d.id === selectedId);
  const [selectedTarget, setSelectedTarget] = useState<string>('122cm');
  
  const [sightExtension, setSightExtension] = useState<string>('');
  const [sightHeight, setSightHeight] = useState<string>('');
  const [sightSide, setSightSide] = useState<string>('');
  
  const [hasUnsaved, setHasUnsaved] = useState(false);
  const [showWarning, setShowWarning] = useState(false);
  const [isPremium, setIsPremium] = useState(false);
  // [KOLORY] Zestawy i aktywny zestaw — kropki nad listą dystansów przełączają
  // zestaw bez wchodzenia w Ustawienia (pomysł usera 2026-09-10).
  const [setups, setSetups] = useState<EquipmentSetup[]>([]);
  const [activeSetupId, setActiveSetupId] = useState<string | null>(null);
  const [setupSwitchError, setSetupSwitchError] = useState(false);
  // Płaskie `bowType` — dyscyplina kont sprzed zestawów.
  const [legacyBowType, setLegacyBowType] = useState<string | null>(null);
  const activeSetup = setups.find(s => s.id === activeSetupId) ?? setups[0];
  const setupColors = useMemo(() => resolveSetupColors(setups), [setups]);
  // [DMUCHAWKA] Dyscyplina aktywnego zestawu — decyduje, które tarcze w ogóle
  // pokazujemy. Bez tego łucznik mógł wybrać tarczę dmuchawki i jego sesja
  // po cichu wypadała z handicapu i rangi.
  const discipline: string | null = activeSetup?.discipline ?? legacyBowType;
  
  const [showSightEditor, setShowSightEditor] = useState(false);
  const [editExt, setEditExt] = useState('');
  const [editHeight, setEditHeight] = useState('');
  const [editSide, setEditSide] = useState('');
  const [editTarget, setEditTarget] = useState('');
  const [isSavingSight, setIsSavingSight] = useState(false);

  // Stany dla treningu technicznego
  const [showTechModal, setShowTechModal] = useState(false);
  const [techArrows, setTechArrows] = useState<string>(() => localStorage.getItem(`grotX_techCounter_${userId}`) || '0');
  const [techNote, setTechNote] = useState('');
  const [isSavingTech, setIsSavingTech] = useState(false);
  const [counterSaved, setCounterSaved] = useState(false);
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);
  // [FOKUS] Aktualny fokus widać w oknie treningu technicznego, a jego temat
  // jest zaznaczony z góry — dla każdego, kto ma fokus; można go odznaczyć.
  const focusState = useActiveFocus(userId, true);
  const activeFocus = focusState?.focus ?? null;
  const focusTopic = activeFocus?.topic || '';

  const [isSavingCounter, setIsSavingCounter] = useState(false);

  const updateCounter = (newVal: string) => {
    setTechArrows(newVal);
    localStorage.setItem(`grotX_techCounter_${userId}`, newVal);
    setCounterSaved(true);
    setTimeout(() => setCounterSaved(false), 1200);
  };

  const invalidateStatsCache = () => {
    localStorage.removeItem(`grotX_stats_v13_${userId}`);
    localStorage.removeItem(`grotX_lastSession_${userId}`);
    window.dispatchEvent(new CustomEvent('grotx-stats-updated'));
  };

  const handleSaveCounter = async () => {
    const count = parseInt(techArrows || '0');
    if (count <= 0) { updateCounter('0'); return; }
    setIsSavingCounter(true);
    try {
      const now = new Date();
      const dayKey = `${now.getFullYear()}_${String(now.getMonth() + 1).padStart(2, '0')}_${String(now.getDate()).padStart(2, '0')}`;
      await updateDoc(doc(db, 'users', userId), {
        [`pfeilzaehler.${dayKey}`]: increment(count),
      });
      setTechArrows('0');
      localStorage.removeItem(`grotX_techCounter_${userId}`);
      invalidateStatsCache();
      setCounterSaved(true);
      setTimeout(() => setCounterSaved(false), 1800);
    } catch (e) {
      console.error('Error saving counter:', e);
    } finally {
      setIsSavingCounter(false);
    }
  };

  // [KATALOG TARCZ] Lista pochodzi z config/targetFaces — nie da się już
  // wybrać tarczy, której aplikacja nie potrafi narysować ani policzyć.
  const targetOptions = useMemo(() => selectableTargetIdsFor(discipline), [discipline]);

  // [KOLORY] Dystanse aktywnego zestawu: te w jego kolorze plus wspólne jego
  // dyscypliny — patrz `distancesForSetup`. Łucznik dalej nie przewija 5 i 7 m
  // z rury. Dopóki profil się ładuje, lista jest pełna — filtr ma zawężać
  // wybór, a nie migać pustką przy każdym wejściu.
  const distanceOptions = useMemo(
    () => distancesForSetup(activeDistances, setups, activeSetupId, legacyBowType),
    [activeDistances, setups, activeSetupId, legacyBowType],
  );

  /**
   * [KOLORY] Przełączenie zestawu kropką. Zapisujemy `activeSetupId` od razu,
   * bo z niego stempel (`getSetupStamp`) bierze zestaw i klasę sprzętu sesji —
   * inaczej trening na dystansie „zielonym" zapisałby się pod „czerwony" zestaw.
   * Płaskie `bowType` idzie w parze, dokładnie jak przy zapisie Ustawień.
   */
  const switchSetup = async (id: string) => {
    if (id === activeSetup?.id) return;
    const prevId = activeSetupId;
    setActiveSetupId(id);
    setSetupSwitchError(false);
    const bow = asBowType(setups.find(s => s.id === id)?.discipline);
    try {
      await setDoc(doc(db, 'users', userId), { activeSetupId: id, ...(bow ? { bowType: bow } : {}) }, { merge: true });
      invalidateSetupStamp(userId);
    } catch (e) {
      console.error('Setup switch failed:', e);
      setActiveSetupId(prevId);
      setSetupSwitchError(true);
    }
  };

  useEffect(() => {
    if (hasActiveSession) {
      setHasUnsaved(true);
      setShowWarning(true);
    }
  }, [hasActiveSession]);

  useEffect(() => {
    const checkData = async () => {
      try {
        const profileSnap = await getDoc(doc(db, 'users', userId));
        if (profileSnap.exists()) {
          const data = profileSnap.data();
          let userIsPro = data.isPremium === true || data.isPremiumPromo === true;
          if (data.trialEndsAt) {
            const trialEnd = new Date(data.trialEndsAt);
            if (trialEnd > new Date()) userIsPro = true;
          }
          if (ADMIN_IDS.includes(userId)) userIsPro = true;
          setIsPremium(userIsPro);
          // Zestawy są źródłem prawdy; stare, płaskie `bowType` to fallback
          // dla kont sprzed zestawów — dokładnie jak w `getSetupStamp`.
          setSetups(Array.isArray(data.setups) ? data.setups as EquipmentSetup[] : []);
          setActiveSetupId(data.activeSetupId ?? null);
          setLegacyBowType(data.bowType ?? null);
        }
      } catch (e) { console.error(e); }
    };
    if (userId) checkData();
  }, [userId]);

  useEffect(() => {
    if (distanceOptions.length > 0 && !selectedId) {
      const saved = localStorage.getItem(`grotX_lastSetup_${userId}`);
      if (saved) {
        try {
          const { distanceId, distance } = JSON.parse(saved);
          // Cache sprzed C25 nie zna id — wtedy dopasowujemy po metrach.
          const stillActive = distanceOptions.find(d => d.id === distanceId)
            || (!distanceId ? distanceOptions.find(d => d.m === distance) : undefined);
          if (stillActive) {
            updateSelection(stillActive.id);
            return;
          }
        } catch (_) { /* ignore malformed cache */ }
      }
      updateSelection(distanceOptions[0].id);
    }
  }, [distanceOptions, selectedId]);

  // [DYSCYPLINY] Dyscyplina dojeżdża z profilu PO pierwszym renderze, więc
  // wybór mógł już paść na dystans, który po zawężeniu listy znika (albo user
  // przełączył zestaw w Ustawieniach i wrócił). Wtedy przestawiamy na pierwszy
  // dozwolony — dokładnie tak, jak niżej z tarczą spoza listy.
  useEffect(() => {
    if (distanceOptions.length > 0 && selectedId && !distanceOptions.some(d => d.id === selectedId)) {
      updateSelection(distanceOptions[0].id);
    }
  }, [distanceOptions, selectedId]);

  const updateSelection = (id: string) => {
    const profileDist = activeDistances.find(d => d.id === id);
    if (!profileDist) return;
    setSelectedId(id);
    setSelectedDistance(profileDist.m);
  };

  // Tarcza i celownik zawsze z zapisanego dystansu. Pierwszy snapshot bywa z lokalnego
  // cache Firestore, więc bez tego świeższe dane z serwera nie dochodziły do ekranu.
  useEffect(() => {
    if (!selectedEntry) return;
    setSelectedTarget(selectedEntry.targetType || '122cm');
    setSightExtension(selectedEntry.sightExtension || '');
    setSightHeight(selectedEntry.sightHeight || '');
    setSightSide(selectedEntry.sightSide || '');
  }, [selectedEntry?.id, selectedEntry?.targetType, selectedEntry?.sightExtension, selectedEntry?.sightHeight, selectedEntry?.sightSide]);

  // [DMUCHAWKA] Tarcza zapisana przy dystansie może nie pasować do dyscypliny
  // aktywnego zestawu — np. dystans pamięta „122cm", a user przesiadł się na
  // rurę. Wtedy podmieniamy na pierwszą dozwoloną, żeby sesja nie ruszyła
  // z tarczą, której nie ma nawet na liście wyboru.
  useEffect(() => {
    if (targetOptions.length > 0 && selectedTarget && !targetOptions.includes(selectedTarget)) {
      setSelectedTarget(targetOptions[0]);
    }
  }, [targetOptions, selectedTarget]);

  const saveLastSetup = () => {
    localStorage.setItem(`grotX_lastSetup_${userId}`, JSON.stringify({ distanceId: selectedId, distance: selectedDistance, targetType: selectedTarget }));
  };

  /** Stempel dystansu przekazywany dalej: id zawsze, etykieta tylko gdy jest. */
  const startArgs = (): [string, string | undefined] =>
    [selectedId, selectedEntry?.label ? displayDistance(selectedEntry) : undefined];

  const handleStartClick = () => {
    if (hasUnsaved) setShowWarning(true);
    else { saveLastSetup(); onStartSession(selectedDistance, selectedTarget, true, null, parseInt(techArrows || '0') || undefined, ...startArgs()); }
  };

  const openSightEditor = () => {
    setEditExt(sightExtension); setEditHeight(sightHeight); setEditSide(sightSide);
    setEditTarget(selectedTarget);
    setShowSightEditor(true);
  };

  const handleSaveTechnical = async () => {
    setIsSavingTech(true);
    const count = techArrows ? parseInt(techArrows) : 0;
    try {
      // [ZESTAWY] Trening techniczny też stemplujemy — te strzały liczą się
      // do zużycia cięciwy i strzał danego zestawu.
      const setupStamp = await getSetupStamp(userId);

      await addDoc(collection(db, `users/${userId}/sessions`), {
        ...setupStamp,
        userId,
        distance: 'TECH',
        targetType: 'TECHNICAL',
        arrows: count,
        totalArrows: count,
        note: techNote,
        topics: selectedTopics,
        createdAt: serverTimestamp(),
        type: 'TECHNICAL',
        timestamp: Timestamp.fromDate(new Date()),
        date: new Date().toLocaleDateString('pl-PL'),
      });
      setShowTechModal(false);
      setTechArrows('0');
      setTechNote('');
      setSelectedTopics([]);
      localStorage.removeItem(`grotX_techCounter_${userId}`);
      invalidateStatsCache();
      if (onNavigate) onNavigate('STATS');
    } catch (e) {
      console.error("Error saving technical session:", e);
    } finally {
      setIsSavingTech(false);
    }
  };

  const saveSightSettings = async () => {
    setIsSavingSight(true);
    try {
      const profileSnap = await getDoc(doc(db, 'users', userId));
      if (profileSnap.exists()) {
        const userDistances = profileSnap.data().userDistances || [];
        const idx = userDistances.findIndex((d: any) => d.id === selectedId);
        if (idx !== -1) {
          // Tarcza jest darmowa, nastawy celownika tylko w PRO — reguły tego nie pilnują, pilnuje UI.
          userDistances[idx].targetType = editTarget;
          if (isPremium) {
            userDistances[idx].sightExtension = editExt;
            userDistances[idx].sightHeight = editHeight;
            userDistances[idx].sightMark = editHeight;
            userDistances[idx].sightSide = editSide;
          }
          await setDoc(doc(db, 'users', userId), { userDistances }, { merge: true });
          setSelectedTarget(editTarget);
          if (isPremium) { setSightExtension(editExt); setSightHeight(editHeight); setSightSide(editSide); }
          if (onUpdateDistances) onUpdateDistances(userDistances);
        }
      }
      setShowSightEditor(false);
    } catch (error) { console.error(error); } 
    finally { setIsSavingSight(false); }
  };

  return (
    <div className={`flex flex-col h-full bg-[#fcfdfe] px-3 ${hasUnsaved ? 'pb-28' : 'pb-16'} animate-fade-in max-w-md mx-auto relative`}>
      <ViewHeader className="-mx-3 mb-3" onBack={() => onNavigate?.('HOME')} title={t('setup.title')} />

      <div className="space-y-2">
        {/* [FOKUS] Przypomnienie przed treningiem (user 2026-09-18) — ten sam pasek
            co na Home; klik prowadzi do dziennika. Liczenie: przełącznik przy zapisie. */}
        {activeFocus && focusState && (
          <FocusStrip
            focus={activeFocus}
            dots={focusState.dots}
            goal={focusState.goal}
            count={focusState.count}
            onOpen={() => onNavigate?.('MY_COACH')}
          />
        )}
        <div className="bg-white px-3 py-2.5 rounded-[20px] border border-gray-100 shadow-sm">
          {/* [KOLORY] Kropki zestawów — klik pokazuje dystanse tego zestawu
              i od razu robi go aktywnym (sesja dostanie jego stempel). */}
          {setups.length > 1 && (
            <div className="flex gap-1.5 justify-center flex-wrap mb-1.5 pb-1.5 border-b border-gray-50">
              {setups.map(s => {
                const on = s.id === activeSetup?.id;
                return (
                  <button
                    key={s.id}
                    onClick={() => switchSetup(s.id)}
                    aria-pressed={on}
                    className={`px-2.5 py-1.5 rounded-full text-[10px] font-black border flex items-center gap-1.5 transition-all active:scale-95 max-w-[48%] ${on ? 'bg-[#0a3a2a] text-white border-[#0a3a2a] shadow-sm' : 'bg-white text-gray-400 border-gray-100'}`}
                  >
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: setupColorHex(setupColors.get(s.id)) }} />
                    <span className="truncate">{s.name}</span>
                  </button>
                );
              })}
            </div>
          )}
          {setupSwitchError && (
            <p className="text-[10px] text-red-500 font-black text-center mb-2">{t('setup.setupSwitchFailed')}</p>
          )}
          <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-1.5 text-center">{t('setup.selectDistance')}</span>
          {/* [DYSCYPLINY] Pustka jest możliwa tylko wtedy, gdy user odznaczył
              WSZYSTKIE dystanse swojej dyscypliny — lista standardowa ma je
              obie. Zamiast pustego pola mówimy, gdzie je z powrotem włączyć. */}
          {distanceOptions.length === 0 && (
            <button
              onClick={() => onNavigate?.('SETTINGS', 'VISIER')}
              className="w-full py-3 rounded-xl border-2 border-dashed border-gray-200 text-[10px] font-black text-gray-400 uppercase tracking-widest active:scale-95"
            >
              {t('setup.noDistances')}
            </button>
          )}
          <div className="flex flex-wrap gap-1.5 justify-center">
            {distanceOptions.map((d) => (
              <button
                key={d.id}
                onClick={() => updateSelection(d.id)}
                className={`flex-1 min-w-[30%] py-2 rounded-xl font-black transition-all active:scale-95 border-2 ${
                  selectedId === d.id
                    ? 'bg-[#0a3a2a] border-[#0a3a2a] text-white shadow-md'
                    : 'bg-white border-gray-100 text-gray-400 hover:border-gray-200'
                }`}
              >
                {/* [C25] Etykieta idzie DRUGĄ linijką — "18m barebow" w jednym
                    wierszu nie mieści się w kafelku szerokim na 30%. */}
                <span className="block text-sm leading-none">{d.m}</span>
                {d.label && <span className="block text-[9px] font-bold uppercase tracking-wide opacity-70 mt-0.5 truncate px-1">{d.label}</span>}
              </button>
            ))}
          </div>
        </div>

        {/* Wybrany dystans: tarcza + celownik w jednej karcie, edycja w jednym oknie. */}
        {selectedId && (
        <div className="bg-[#1f6e53] px-3 py-2.5 rounded-[20px] shadow-lg border border-[#2a7d61]">
          <div className="flex items-center gap-3">
            <TargetThumbnail targetType={selectedTarget} className="w-10 h-10 shrink-0" />
            <div className="flex-1 min-w-0">
              <span className="text-[9px] font-black text-emerald-200 uppercase tracking-widest block leading-none">{t('setup.targetTitle')}</span>
              <span className="text-lg font-black text-white uppercase tracking-tight leading-tight block truncate">{selectedTarget}</span>
            </div>
            <button
              onClick={openSightEditor}
              className="shrink-0 h-9 px-3 rounded-xl bg-white/15 border border-white/15 text-white flex items-center gap-1.5 active:scale-95 transition-all"
            >
              <span className="material-symbols-outlined text-[16px]">edit</span>
              <span className="text-[10px] font-black uppercase tracking-widest">{t('setup.change')}</span>
            </button>
          </div>
          <div className="mt-2 pt-2 border-t border-white/10">
            {isPremium ? (
              <div className="grid grid-cols-3 gap-1.5">
                {[
                  { label: t('setup.editorExt'), value: sightExtension },
                  { label: t('setup.editorHeight'), value: sightHeight },
                  { label: t('setup.editorSide'), value: sightSide },
                ].map(f => (
                  <div key={f.label} className="bg-black/20 rounded-lg px-1 py-1 text-center min-w-0">
                    <span className="block text-[8px] font-bold text-emerald-100/70 uppercase tracking-tight truncate leading-tight">{f.label}</span>
                    <span className="block text-base font-black text-[#fed33e] leading-tight truncate">{f.value || '-'}</span>
                  </div>
                ))}
              </div>
            ) : (
              <button onClick={() => onNavigate?.('SETTINGS', 'PRO')} className="w-full flex items-center justify-center gap-1.5 py-0.5 active:scale-95">
                <span className="material-symbols-outlined text-[#F2C94C] text-[16px]">diamond</span>
                <span className="text-[9px] font-black text-[#F2C94C] uppercase tracking-widest">{t('setup.sightPro')}</span>
              </button>
            )}
          </div>
        </div>
        )}
      </div>

      <div className="mt-2">

        {/* PFEILZÄHLER */}
        <div className="bg-white rounded-[20px] border-2 border-[#0a3a2a] shadow-sm px-3 pt-1.5 pb-2">
          <div className="flex items-center justify-center gap-2 mb-1">
            <span className="text-[10px] font-black text-[#0a3a2a] uppercase tracking-widest">{t('sessionSetup.arrowCounter')}</span>
            <span className={`text-[9px] font-black uppercase tracking-widest transition-all duration-300 ${counterSaved ? 'text-blue-400 opacity-100' : 'opacity-0'}`}>
              ✓ {parseInt(techArrows || '0')}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => updateCounter(String(Math.max(0, parseInt(techArrows || '0') + 6)))}
              className="flex-1 h-10 bg-blue-500 text-white rounded-xl font-black text-base active:scale-95 transition-all"
            >+6</button>
            <button
              onClick={() => updateCounter(String(Math.max(0, parseInt(techArrows || '0') + 1)))}
              className="flex-1 h-10 bg-blue-100 text-blue-700 rounded-xl font-black text-base active:scale-95 transition-all"
            >+1</button>
            <button
              onClick={() => updateCounter(String(Math.max(0, parseInt(techArrows || '0') - 1)))}
              className="flex-1 h-10 bg-red-50 text-red-500 rounded-xl font-black text-base active:scale-95 transition-all border border-red-100"
            >−1</button>
            <div className="flex-1 h-10 bg-[#0a3a2a] text-white rounded-xl font-black text-xl flex items-center justify-center">
              {techArrows || '0'}
            </div>
            <button
              onClick={handleSaveCounter}
              disabled={isSavingCounter}
              className="px-3 h-10 bg-emerald-500 text-white rounded-xl active:scale-95 transition-all disabled:opacity-50 shadow-sm font-black text-[11px] uppercase tracking-wide"
            >
              {isSavingCounter
                ? <span className="material-symbols-outlined text-[20px] animate-spin">progress_activity</span>
                : t('sessionSetup.saveCounter')
              }
            </button>
          </div>
        </div>

      </div>

      {/* Stały pasek startu — ten sam kształt i kółko co dolna nawigacja w App.tsx.
          Portal, bo <main> ma transform, a pod nim 96 px pustego pb. */}
      {createPortal(
        <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md z-[90]">
          <div className="absolute bottom-full inset-x-0 mb-10 px-3 flex flex-col items-center gap-1.5 pointer-events-none">
            {hasUnsaved && (
              <button
                onClick={() => onStartSession(selectedDistance, selectedTarget, false, null, parseInt(techArrows || '0') || undefined, ...startArgs())}
                className="pointer-events-auto w-full py-2 rounded-xl font-black text-[10px] uppercase tracking-widest border-2 border-red-500 text-red-500 bg-red-50 active:scale-95 transition-all flex items-center justify-center gap-2"
              >
                <span className="material-symbols-outlined text-sm">history</span>
                {t('setup.continueBtn')}
              </button>
            )}
            {selectedId && (
              <p className="max-w-full flex items-center gap-1.5 text-[11px] font-black text-gray-500 uppercase tracking-wide bg-white border border-gray-100 shadow-sm rounded-full px-3 py-1">
                {setups.length > 0 && activeSetup && (
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: setupColorHex(setupColors.get(activeSetup.id)) }} />
                )}
                <span className="truncate">
                  {[selectedEntry ? displayDistance(selectedEntry) : selectedDistance, selectedTarget, setups.length > 0 ? activeSetup?.name : null].filter(Boolean).join(' · ')}
                </span>
              </p>
            )}
          </div>

          <div className="relative h-20 w-full px-2">
            <svg viewBox="0 0 390 80" preserveAspectRatio="none" className="absolute inset-0 w-full h-full pointer-events-none" style={{ filter: 'drop-shadow(0 -6px 16px rgba(0,0,0,0.08))' }}>
              <path d="M0,0 H148 C158,0 165,36 195,36 C225,36 232,0 242,0 H390 V80 H0 Z" fill="white" />
            </svg>
            <div className="flex justify-between items-center h-full w-full relative">
              <div className="flex flex-1 justify-center items-center h-full px-1">
                <button
                  onClick={() => {
                    if (focusTopic) setSelectedTopics(prev => prev.length ? prev : [focusTopic]);
                    setShowTechModal(true);
                  }}
                  disabled={!selectedDistance}
                  className="h-12 w-full max-w-[128px] rounded-2xl bg-emerald-600 text-white flex items-center gap-1.5 px-2 font-black active:scale-95 shadow-md transition-all disabled:opacity-50"
                >
                  <span className="material-symbols-outlined text-[20px] shrink-0">psychology</span>
                  <span className="text-[9px] uppercase tracking-wide text-left leading-tight whitespace-pre-line">{t('setup.techBtn')}</span>
                </button>
              </div>

              <div className="relative -top-7 w-20 shrink-0 flex flex-col items-center z-50">
                <button
                  onClick={handleStartClick}
                  disabled={!selectedDistance}
                  aria-label={t('nav.training')}
                  className="w-16 h-16 bg-[#F2C94C] shadow-[#F2C94C]/30 rounded-full shadow-lg border-4 border-white flex items-center justify-center active:scale-90 transition-all relative overflow-hidden disabled:opacity-50"
                >
                  <div className="absolute inset-0 pointer-events-none">
                    <div className="absolute w-8 h-8 bg-white/20 rounded-full top-[-10%] left-[-10%] animate-pulse"></div>
                    <div className="absolute w-6 h-6 bg-white/10 rounded-full bottom-0 right-0 animate-bounce" style={{ animationDuration: '3s' }}></div>
                  </div>
                  <span className="material-symbols-outlined text-white text-3xl font-black relative z-10">target</span>
                </button>
                <span className="text-[9px] font-black text-[#8B6508] uppercase tracking-widest mt-1.5 bg-white/80 px-2 rounded-full shadow-sm">
                  {t('nav.training')}
                </span>
              </div>

              <div className="flex flex-1 justify-center items-center h-full px-1">
                <button
                  onClick={() => {
                    if (onGoToBattle) {
                      onGoToBattle(selectedDistance, selectedTarget, ...startArgs());
                    } else {
                      onNavigate?.('BATTLE_LOBBY');
                    }
                  }}
                  disabled={!selectedDistance}
                  className="h-12 w-full max-w-[128px] rounded-2xl bg-indigo-600 text-white flex items-center gap-1.5 px-2 font-black active:scale-95 shadow-md transition-all disabled:opacity-50"
                >
                  <span className="material-symbols-outlined text-[20px] shrink-0">swords</span>
                  <span className="text-[9px] uppercase tracking-wide text-left leading-tight whitespace-pre-line">{t('setup.battleBtn')}</span>
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* MODAL TRENINGU TECHNICZNEGO */}
      {showTechModal && createPortal(
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100001] flex items-start justify-center p-3 pt-[calc(env(safe-area-inset-top)+56px)]">
          <div className="bg-white w-full max-w-md rounded-[28px] p-5 pb-6 animate-fade-in-up shadow-2xl border-t-4 border-emerald-600">

            {/* HEADER */}
            <div className="flex justify-between items-center mb-4">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-emerald-600 text-lg">psychology</span>
                <h2 className="text-base font-black text-[#0a3a2a] uppercase">{t('stats.techSessionTitle')}</h2>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black text-emerald-600 bg-emerald-50 px-2 py-1 rounded-lg uppercase tracking-widest">{t('sessionSetup.techSubtitle')}</span>
                <button onClick={() => setShowTechModal(false)} className="text-gray-400 p-1 active:scale-90 transition-all"><span className="material-symbols-outlined text-lg">close</span></button>
              </div>
            </div>

            {/* LICZNIK STRZAŁ */}
            <div className="bg-[#0a3a2a]/5 rounded-[20px] border-2 border-[#0a3a2a]/10 px-3 py-2 mb-3">
              <span className="text-[10px] font-black text-[#0a3a2a] uppercase tracking-widest block mb-1.5 text-center">{t('sessionSetup.arrowCounter')}</span>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setTechArrows(v => String(Math.max(0, parseInt(v || '0') + 6)))}
                  className="flex-1 py-2 bg-emerald-500 text-white rounded-xl font-black text-sm active:scale-95 transition-all"
                >+6</button>
                <button
                  onClick={() => setTechArrows(v => String(Math.max(0, parseInt(v || '0') + 1)))}
                  className="flex-1 py-2 bg-emerald-100 text-emerald-700 rounded-xl font-black text-sm active:scale-95 transition-all"
                >+1</button>
                <button
                  onClick={() => setTechArrows(v => String(Math.max(0, parseInt(v || '0') - 1)))}
                  className="flex-1 py-2 bg-red-50 text-red-500 rounded-xl font-black text-sm active:scale-95 transition-all border border-red-100"
                >−1</button>
                <div className="flex-1 py-2 bg-[#0a3a2a] text-white rounded-xl font-black text-xl flex items-center justify-center">
                  {techArrows || '0'}
                </div>
              </div>
            </div>

            {/* TWÓJ FOKUS — przypomnienie; temat już zaznaczony niżej */}
            {activeFocus && (
              <div className="bg-[#0a3a2a] rounded-2xl px-3 py-2 mb-3 flex items-center gap-2.5">
                <span className="material-symbols-outlined text-[20px] text-[#fed33e] shrink-0">track_changes</span>
                <div className="flex-1 min-w-0">
                  <p className="text-[9px] font-black uppercase tracking-widest text-[#fed33e] truncate">
                    {t('tagebuch.focusLabel')}
                    {activeFocus.fromCoach && ` · ${t('tagebuch.focusFromCoach')}`}
                  </p>
                  <p className="text-[13px] font-black text-white leading-snug truncate">{focusTitle(activeFocus, t)}</p>
                  {activeFocus.text && activeFocus.topic && (
                    <p className="text-[10px] font-bold text-white/60 truncate">{topicLabel(activeFocus.topic, t)}</p>
                  )}
                  {focusState?.dots && (
                    <div className="flex items-center gap-2 mt-1">
                      <FocusDots count={focusState.count} goal={focusState.goal} small />
                      <FocusProgressText count={focusState.count} goal={focusState.goal} />
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TEMATY */}
            <div className="mb-3">
              <TopicPicker selectedTopics={selectedTopics} onChange={setSelectedTopics} markedTopic={focusTopic} />
            </div>

            {/* NOTATKI */}
            <div className="mb-5">
              <div className="flex justify-between items-center mb-1.5">
                <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">{t('sessionSetup.techNotes')}</span>
                <span className={`text-[9px] font-bold ${techNote.length >= 400 ? 'text-red-500' : 'text-gray-300'}`}>{techNote.length}/400</span>
              </div>
              <textarea
                value={techNote}
                onChange={e => setTechNote(e.target.value)}
                maxLength={400}
                placeholder={t('sessionSetup.notePlaceholder')}
                className="w-full bg-gray-50 border-2 border-gray-100 p-3 rounded-xl font-bold text-sm text-[#0a3a2a] focus:border-emerald-500 outline-none transition-all h-24 resize-none"
              />
            </div>

            <button
              onClick={handleSaveTechnical}
              disabled={isSavingTech}
              className={`w-full py-4 rounded-2xl font-black uppercase tracking-widest transition-all active:scale-95 flex items-center justify-center gap-2 ${
                isSavingTech ? 'bg-gray-100 text-gray-400' : 'bg-emerald-600 text-white shadow-xl shadow-emerald-100'
              }`}
            >
              {isSavingTech ? t('common.saving') : t('sessionSetup.saveBtn')}
            </button>
          </div>
        </div>,
        document.body
      )}

      {/* Portal: <main> w App.tsx ma transform, przy którym `fixed` kotwiczy się do strony, nie do okna. */}
      {showSightEditor && createPortal(
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100000] flex items-start justify-center p-3 pt-[calc(env(safe-area-inset-top)+56px)]"
          onClick={() => setShowSightEditor(false)}
        >
          <div className="bg-white w-full max-w-md rounded-[28px] p-5 pb-5 animate-fade-in-up shadow-2xl max-h-[calc(100dvh-80px)] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3 mb-4">
              <div className="min-w-0">
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{t('setup.distSettings')}</p>
                <h2 className="text-2xl font-black text-[#0a3a2a] leading-tight truncate">{selectedEntry ? displayDistance(selectedEntry) : selectedDistance}</h2>
              </div>
              <button onClick={() => setShowSightEditor(false)} className="w-9 h-9 shrink-0 rounded-full bg-gray-100 text-gray-500 flex items-center justify-center active:scale-90 transition-all">
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1.5">{t('setup.targetTitle')}</p>
            <div className="w-full py-2 px-3 rounded-xl mb-2 flex items-center gap-3 bg-[#1f6e53]">
              <TargetThumbnail targetType={editTarget} className="w-9 h-9 shrink-0" />
              <span className="text-lg font-black text-white uppercase tracking-tight truncate">{editTarget}</span>
            </div>
            <div className="grid grid-cols-3 gap-1.5 mb-4">
              {targetOptions.filter(o => o !== editTarget).map(o => (
                <button
                  key={o}
                  onClick={() => setEditTarget(o)}
                  className="h-10 flex items-center justify-center rounded-lg border bg-white text-gray-500 border-gray-200 active:scale-95 transition-all"
                >
                  <span className="text-[10px] font-black uppercase tracking-tight text-center leading-none px-1 truncate w-full">{o}</span>
                </button>
              ))}
            </div>

            <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1.5">{t('setup.sightTitle')}</p>
            {isPremium ? (
              <div className="grid grid-cols-3 gap-1.5 mb-5">
                {[
                  { label: t('setup.editorExt'), value: editExt, set: setEditExt },
                  { label: t('setup.editorHeight'), value: editHeight, set: setEditHeight },
                  { label: t('setup.editorSide'), value: editSide, set: setEditSide },
                ].map(f => (
                  <label key={f.label} className="min-w-0">
                    <span className="block text-[8px] font-black text-gray-400 uppercase tracking-tight truncate mb-0.5 text-center">{f.label}</span>
                    <input
                      type="text" maxLength={8}
                      value={f.value}
                      onChange={e => f.set(e.target.value)}
                      className="w-full h-11 bg-gray-50 border border-gray-200 rounded-xl font-black text-center text-base text-[#0a3a2a] outline-none focus:border-emerald-500"
                    />
                  </label>
                ))}
              </div>
            ) : (
              <button onClick={() => { setShowSightEditor(false); onNavigate?.('SETTINGS', 'PRO'); }} className="w-full mb-5 py-2.5 rounded-xl bg-[#0a3a2a] flex items-center justify-center gap-1.5 active:scale-95">
                <span className="material-symbols-outlined text-[#F2C94C] text-[16px]">diamond</span>
                <span className="text-[10px] font-black text-[#F2C94C] uppercase tracking-widest">{t('setup.sightPro')}</span>
              </button>
            )}

            <button onClick={saveSightSettings} disabled={isSavingSight} className="w-full py-4 bg-[#0a3a2a] text-white rounded-xl font-black uppercase disabled:opacity-50">{t('setup.editorSave')}</button>
            <button
              onClick={() => { setShowSightEditor(false); onNavigate?.('SETTINGS', 'VISIER'); }}
              className="w-full mt-2 py-2 text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center justify-center gap-1 active:scale-95"
            >
              {t('setup.allDistances')}
              <span className="material-symbols-outlined text-[14px]">chevron_right</span>
            </button>
          </div>
        </div>,
        document.body
      )}

      {showWarning && createPortal(
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[99999] flex items-center justify-center p-6">
          <div className="bg-white rounded-[32px] p-8 w-full shadow-2xl text-center">
            <h2 className="text-xl font-black text-[#0a3a2a] mb-2">{t('setup.warningTitle')}</h2>
            <button onClick={() => { saveLastSetup(); onStartSession(selectedDistance, selectedTarget, true, null, parseInt(techArrows || '0') || undefined, ...startArgs()); }} className="w-full py-4 bg-red-500 text-white rounded-xl font-black uppercase mb-3">{t('setup.warningConfirm')}</button>
            <button onClick={() => setShowWarning(false)} className="w-full py-4 bg-gray-100 text-gray-500 rounded-xl font-black uppercase">{t('setup.warningCancel')}</button>
          </div>
        </div>,
        document.body
      )}

      <style>{`
        .animate-fade-in-up { animation: fadeInUp 0.3s ease-out forwards; } 
        @keyframes fadeInUp { from { opacity: 0; transform: translateY(15px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
}