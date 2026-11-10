import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { query, onSnapshot, doc, getDoc, getDocs, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useTranslation } from 'react-i18next';
import TopicPicker from './TopicPicker';
import { invalidateSetupStamp } from '../utils/setupStamp';
import { useCurrentFocus, useFocusChoice, displayPair, displayProgress, swapFocus, shownTopics, pickTopics } from '../utils/focus';
import { saveTechnicalSession, addToDailyArrowCounter } from '../utils/techSession';
import { settleWrite, userDocCacheFirst } from '../utils/offlineWrite';
import { FocusStrip, FocusChoiceChips, focusTitle } from './tagebuch/FocusCard';
import { selectableTargetIdsFor, resolveTargetFace } from '../config/targetFaces';
import { TargetThumbnail } from './targets/TargetThumbnail';
import { EquipmentSetup, asBowType, resolveSetupColors, setupColorHex, styleOfSetup, visibleSetups } from '../config/equipmentSetups';
import { UserDistance, displayDistance, distancesForSetup, fallbackTargetFor, distanceMeters } from '../config/distances';
import { fieldFaceForMeters } from '../config/targets/waField';
import { ifaaFaceForMeters } from '../config/targets/ifaa';
import { PARCOURS_DISTANCE, PARCOURS_DISTANCE_ID } from '../config/parcours';
import { ANIMAL_DISTANCE, ANIMAL_DISTANCE_ID, ANIMAL_STATIONS, ANIMAL_FORMATS, animalFormatById, formatLabel } from '../config/animalRound';
import { listCourses, selectedCourseKey, type Course } from '../utils/courses';
import { PLANNED_ENDS, SHORT_END_OPTIONS } from '../utils/partialSession';
import ViewHeader from './ViewHeader';
import { hasActivePro } from '../utils/proAccess';

interface SessionSetupProps {
  userId: string;
  activeDistances: UserDistance[];
  onStartSession: (distance: string, targetType: string, forceClear: boolean, battleId: string | null, practiceArrows?: number, distanceId?: string, distanceLabel?: string, plannedEnds?: number) => void;
  onUpdateDistances?: (newDistances: UserDistance[]) => void;
  onNavigate?: (view: string, tab?: string, extraData?: string) => void;
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
  // Liczba serii: standard 12, krotszy trening to mala opcja przy starcie.
  const [plannedEnds, setPlannedEnds] = useState<number>(PLANNED_ENDS);
  const [showEndsPicker, setShowEndsPicker] = useState(false);
  const [showEndsInfo, setShowEndsInfo] = useState(false);
  
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
  // Dopóki profil (zestawy = dyscyplina) się ładuje, lista dystansów jest pełna
  // — razem z 10 m dmuchawki. Automatyczny wybór czeka na profil, inaczej
  // szybkie „Training” zapisywało łucznikowi trening na 10 m z tarczą
  // Blowgun 20cm (wykryte testem e2e 2026-11-05). Przyciski startu i tak
  // są zablokowane bez wybranego dystansu.
  const [profileLoaded, setProfileLoaded] = useState(false);
  // [UKRYJ] Ukryty zestaw nie bywa aktywny ani nie pokazuje się w wyborze (Ustawienia).
  const shownSetups = visibleSetups(setups);
  const activeSetup = shownSetups.find(s => s.id === activeSetupId) ?? shownSetups[0];
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
  const focusState = useCurrentFocus(userId);
  const activeFocus = focusState?.focus ?? null;
  const focusPair = displayPair(focusState);
  const [focusChoice, setFocusChoice] = useFocusChoice(focusState, userId);
  const focusTopic = activeFocus?.topic || '';

  const [isSavingCounter, setIsSavingCounter] = useState(false);

  const updateCounter = (newVal: string) => {
    setTechArrows(newVal);
    localStorage.setItem(`grotX_techCounter_${userId}`, newVal);
    setCounterSaved(true);
    setTimeout(() => setCounterSaved(false), 1200);
  };

  const handleSaveCounter = async () => {
    const count = parseInt(techArrows || '0');
    if (count <= 0) { updateCounter('0'); return; }
    setIsSavingCounter(true);
    try {
      // [C41] Bez zasiegu licznik czeka w telefonie — przycisk nie kreci sie w nieskonczonosc.
      await settleWrite(addToDailyArrowCounter(userId, count));
      setTechArrows('0');
      localStorage.removeItem(`grotX_techCounter_${userId}`);
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
  // [FELD] Zestaw „Feld” dostaje wyłącznie tarcze terenowe (i tylko on je widzi).
  const style = styleOfSetup(activeSetup);
  const targetOptions = useMemo(() => selectableTargetIdsFor(discipline, style), [discipline, style]);
  // [IFAA] Tarcza z własnym formatem zawodów (4 × 28, 5 × 12) — bez skracania serii.
  const faceRound = resolveTargetFace(selectedTarget).round;

  // [KOLORY] Dystanse aktywnego zestawu: te w jego kolorze plus wspólne jego
  // dyscypliny — patrz `distancesForSetup`. Łucznik dalej nie przewija 5 i 7 m
  // z rury. Dopóki profil się ładuje, lista jest pełna — filtr ma zawężać
  // wybór, a nie migać pustką przy każdym wejściu.
  const distanceOptions = useMemo(
    () => distancesForSetup(activeDistances, setups, activeSetup?.id ?? activeSetupId, legacyBowType),
    [activeDistances, setups, activeSetup?.id, activeSetupId, legacyBowType],
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
    // [C41] Przed zapisem: bez zasiegu `await` wisi do powrotu sieci, a stempel
    // z pamieci podpisalby trening starym zestawem. Cache Firestore ma juz nowy.
    invalidateSetupStamp(userId);
    try {
      await setDoc(doc(db, 'users', userId), { activeSetupId: id, ...(bow ? { bowType: bow } : {}) }, { merge: true });
    } catch (e) {
      invalidateSetupStamp(userId);
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
          let userIsPro = hasActivePro(data);
          if (ADMIN_IDS.includes(userId)) userIsPro = true;
          setIsPremium(userIsPro);
          // Zestawy są źródłem prawdy; stare, płaskie `bowType` to fallback
          // dla kont sprzed zestawów — dokładnie jak w `getSetupStamp`.
          setSetups(Array.isArray(data.setups) ? data.setups as EquipmentSetup[] : []);
          setActiveSetupId(data.activeSetupId ?? null);
          setLegacyBowType(data.bowType ?? null);
        }
      } catch (e) { console.error(e); }
      setProfileLoaded(true);
    };
    if (userId) checkData();
  }, [userId]);

  useEffect(() => {
    if (profileLoaded && distanceOptions.length > 0 && !selectedId) {
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
  }, [distanceOptions, selectedId, profileLoaded]);

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
    setSelectedTarget(selectedEntry.targetType || fallbackTargetFor(selectedEntry.m));
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
      setSelectedTarget(style === 'field' ? fieldFaceForMeters(distanceMeters(selectedDistance)) : style === 'ifaa' ? ifaaFaceForMeters(distanceMeters(selectedDistance)) : targetOptions[0]);
    }
  }, [targetOptions, selectedTarget, style, selectedDistance]);

  const saveLastSetup = () => {
    localStorage.setItem(`grotX_lastSetup_${userId}`, JSON.stringify({ distanceId: selectedId, distance: selectedDistance, targetType: selectedTarget }));
  };

  /** Stempel dystansu przekazywany dalej: id zawsze, etykieta tylko gdy jest. */
  // [PARCOURS] Runda terenowa IFAA: każda tarcza z własną wielkością i dystansem
  // (wybierane na ekranie treningu). Sesja ma wtedy stały „dystans” Parcours.
  const canParcours = resolveTargetFace(selectedTarget).statsGroup === 'ifaa';
  // [ANIMAL ROUND 2026-11-10] Druga runda trasy IFAA — zwierzęta, Kill/Wound/Miss.
  // Parcours i Animal wykluczają się (jeden przełącznik zdejmuje drugi).
  // [ANIMAL ROUND] Zwierzęta wybiera się kafelkiem obok dystansów (user 2026-11-10:
  // „jako dystans wybrać parcours”) — bez ustawionego dystansu. 'animal' = nowa
  // trasa, inaczej id zapisanej trasy (Ustawienia → Distanzen → Strecken).
  const isIfaaSetup = style === 'ifaa';
  const [animalPick, setAnimalPick] = useState<string | null>(null);
  const animalActive = isIfaaSetup && animalPick !== null;
  const [parcoursOn, setParcoursOn] = useState(false);
  const parcoursActive = canParcours && parcoursOn && !animalActive;
  const startDistance = () => (animalActive ? ANIMAL_DISTANCE : parcoursActive ? PARCOURS_DISTANCE : selectedDistance);
  // [DBSV] Format rundy zwierzęcej (IFAA / DBSV Wald / DBSV Jagd) — zapamiętany na urządzeniu.
  const [animalFmtId, setAnimalFmtId] = useState<string>(() => { try { return localStorage.getItem(`grotX_animalFormat_${userId}`) || 'ifaa'; } catch { return 'ifaa'; } });
  const animalFmt = animalFormatById(animalFmtId);
  const pickAnimalFmt = (id: string) => { setAnimalFmtId(id); try { localStorage.setItem(`grotX_animalFormat_${userId}`, id); } catch { /* prywatne okno */ } };
  const startTarget = () => (animalActive ? animalFmt.faceId : selectedTarget);
  // [ANIMAL ROUND] Zapisane trasy: wybrana wypełnia nazwy zwierząt i liczbę stanowisk.
  const [courses, setCourses] = useState<Course[]>([]);
  useEffect(() => {
    if (!isIfaaSetup || !userId) return;
    let alive = true;
    listCourses(userId).then(cs => { if (alive) setCourses(cs); }).catch(() => {});
    return () => { alive = false; };
  }, [isIfaaSetup, userId]);
  const course = courses.find(c => c.id === animalPick) || null;
  const rememberCourse = () => {
    try {
      if (animalActive && course) localStorage.setItem(selectedCourseKey(userId), JSON.stringify(course));
      else localStorage.removeItem(selectedCourseKey(userId));
    } catch { /* prywatne okno — runda bez trasy */ }
  };
  const startArgs = (): [string, string | undefined, number] =>
    animalActive
      ? [ANIMAL_DISTANCE_ID, undefined, course ? course.stations.length : (resolveTargetFace(animalFmt.faceId).round?.ends ?? ANIMAL_STATIONS)]
      : parcoursActive
      ? [PARCOURS_DISTANCE_ID, undefined, faceRound?.ends ?? 28]
      : [selectedId, selectedEntry?.label ? displayDistance(selectedEntry) : undefined, faceRound ? faceRound.ends : plannedEnds];

  const handleStartClick = () => {
    if (hasUnsaved) setShowWarning(true);
    else { saveLastSetup(); rememberCourse(); onStartSession(startDistance(), startTarget(), true, null, parseInt(techArrows || '0') || undefined, ...startArgs()); }
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
      await saveTechnicalSession(userId, { arrows: count, note: techNote, topics: selectedTopics, focusState, focusChoice });
      setShowTechModal(false);
      setTechArrows('0');
      setTechNote('');
      setSelectedTopics([]);
      localStorage.removeItem(`grotX_techCounter_${userId}`);
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
      const profileSnap = await userDocCacheFirst(userId);
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
          await settleWrite(setDoc(doc(db, 'users', userId), { userDistances }, { merge: true }));
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
    <div className="flex flex-col h-full bg-[#fcfdfe] px-3 pb-24 animate-fade-in max-w-md mx-auto relative">
      <ViewHeader className="-mx-3 mb-3" onBack={() => onNavigate?.('HOME')} title={t('setup.title')} />

      {/* [VORBEREITUNG 2026-11-06] Układ jak nowa strona startowa (memory:
          project_home_redesign_plan): białe karty, kolor tylko na pasku/akcencie,
          dystans + tarcza + Passen w jednej karcie, żółty Training jedyny wypełniony. */}
      <div className="space-y-2.5">
        {/* Niezapisany trening — na górze, nie pływa nad paskiem. */}
        {hasUnsaved && (
          <button
            onClick={() => onStartSession(startDistance(), startTarget(), false, null, parseInt(techArrows || '0') || undefined, ...startArgs())}
            className="w-full bg-white rounded-2xl border border-gray-100 border-l-4 border-l-red-500 shadow-sm pl-3 pr-3 py-2.5 flex items-center gap-2 text-left active:scale-[0.99] transition-all"
          >
            <span className="material-symbols-outlined text-[18px] text-red-500">history</span>
            <span className="flex-1 text-[14px] font-black text-[#0a3a2a]">{t('setup.continueBtn')}</span>
            <span className="material-symbols-outlined text-[18px] text-gray-300">chevron_right</span>
          </button>
        )}

        {/* [FOKUS] Ten sam subtelny pasek co na Home (user 2026-11-06: „identycznie”)
            + plakietka „zählt / zählt nicht” dla pokazanego toru; kropka zamienia tory. */}
        {focusPair.main && focusState && (() => {
          const key: 'own' | 'coach' | 'topic' = focusPair.main.topicId ? 'topic' : focusPair.main.fromCoach ? 'coach' : 'own';
          const on = focusChoice[key];
          return (
            <FocusStrip
              variant="subtle"
              focus={focusPair.main}
              {...displayProgress(focusState, focusPair.main)}
              onOpen={() => onNavigate?.('MY_COACH', undefined, focusPair.main?.topicId)}
              other={focusPair.other}
              onSwap={() => swapFocus(userId, focusState)}
              extra={(
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={on}
                  aria-label={`${key === 'topic' ? t('tagebuch.topicChoice') : t('tagebuch.focusChoiceFocus')}: ${focusTitle(focusPair.main, t)}`}
                  onClick={() => setFocusChoice({ ...focusChoice, [key]: !on })}
                  className={`shrink-0 text-[11px] font-black rounded-md px-2 py-0.5 border active:scale-95 transition-all ${on ? 'bg-[#0a3a2a] text-[#fed33e] border-[#0a3a2a]' : 'bg-white text-gray-400 border-gray-200'}`}
                >
                  {on ? t('tagebuch.focusCounts') : t('tagebuch.focusNotCounts')}
                </button>
              )}
            />
          );
        })()}

        {/* Co strzelam: zestaw → dystans → tarcza z nastawami → Passen. */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden" data-testid="setup-card">
          <div className="px-3 pt-2.5 pb-2.5">
            {/* [KOLORY] Zestawy — klik pokazuje dystanse zestawu i robi go aktywnym.
                Także przy jednym zestawie: widać, z czego się strzela (dawniej pigułka nad paskiem). */}
            {shownSetups.length > 0 && (
              <div className="flex gap-1.5 flex-wrap mb-2">
                {shownSetups.map(s => {
                  const on = s.id === activeSetup?.id;
                  return (
                    <button
                      key={s.id}
                      onClick={() => switchSetup(s.id)}
                      aria-pressed={on}
                      className={`px-2.5 py-1 rounded-full text-[12px] font-bold border flex items-center gap-1.5 transition-all active:scale-95 max-w-[48%] ${on ? 'bg-[#0a3a2a] text-white border-[#0a3a2a]' : 'bg-white text-gray-500 border-gray-200'}`}
                    >
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: setupColorHex(setupColors.get(s.id)) }} />
                      <span className="truncate">{s.name}</span>
                    </button>
                  );
                })}
              </div>
            )}
            {setupSwitchError && (
              <p className="text-[11px] text-red-500 font-bold mb-2">{t('setup.setupSwitchFailed')}</p>
            )}
            {/* [DYSCYPLINY] Pustka tylko gdy user odznaczył wszystkie dystanse dyscypliny. */}
            {distanceOptions.length === 0 && (
              <button
                onClick={() => onNavigate?.('SETTINGS', 'VISIER')}
                className="w-full py-3 rounded-xl border border-dashed border-gray-300 text-[12px] font-bold text-gray-500 active:scale-95"
              >
                {t('setup.noDistances')}
              </button>
            )}
            <div className="grid grid-cols-3 gap-1.5" aria-label={t('setup.selectDistance')}>
              {distanceOptions.map((d) => {
                const on = selectedId === d.id && !animalActive;
                return (
                  <button
                    key={d.id}
                    onClick={() => { updateSelection(d.id); setAnimalPick(null); }}
                    aria-pressed={on && !animalActive}
                    className={`py-2 rounded-xl transition-all active:scale-95 border min-w-0 ${on ? 'bg-[#0a3a2a] border-[#0a3a2a] text-white' : 'bg-white border-gray-200 text-gray-500'}`}
                  >
                    {/* [C25] Etykieta drugą linijką — „18m barebow” nie mieści się w jednej. */}
                    <span className={`block text-[14px] leading-none ${on ? 'font-black' : 'font-bold'}`}>{d.m}</span>
                    {d.label && <span className="block text-[10px] font-bold opacity-70 mt-0.5 truncate px-1">{d.label}</span>}
                  </button>
                );
              })}
              {/* [ANIMAL ROUND] Zwierzęta i zapisane trasy jako „dystanse”. */}
              {isIfaaSetup && [{ id: 'animal', icon: 'eco', title: t('animal.tile'), sub: t('animal.tileSub') }, ...courses.map(c => ({ id: c.id, icon: 'distance', title: c.name, sub: t('animal.stations', { n: c.stations.length }) }))].map(x => {
                const on = animalPick === x.id;
                return (
                  <button
                    key={x.id}
                    onClick={() => setAnimalPick(x.id)}
                    aria-pressed={on}
                    data-testid={x.id === 'animal' ? 'animal-tile' : 'course-tile'}
                    className={`py-2 rounded-xl transition-all active:scale-95 border min-w-0 ${on ? 'bg-[#0a3a2a] border-[#0a3a2a] text-white' : 'bg-emerald-50 border-emerald-200 text-emerald-800'}`}
                  >
                    <span className={`flex items-center justify-center gap-1 text-[13px] leading-none truncate px-1 ${on ? 'font-black' : 'font-bold'}`}>
                      <span className="material-symbols-outlined text-[14px]">{x.icon}</span>
                      <span className="truncate">{x.title}</span>
                    </span>
                    <span className="block text-[10px] font-bold opacity-70 mt-0.5 truncate px-1">{x.sub}</span>
                  </button>
                );
              })}
              {isIfaaSetup && (
                <button
                  onClick={() => onNavigate?.('SETTINGS', 'VISIER')}
                  className="py-2 rounded-xl border border-dashed border-emerald-300 text-emerald-700 active:scale-95 min-w-0"
                  data-testid="course-new-tile"
                >
                  <span className="block text-[13px] font-black leading-none">+</span>
                  <span className="block text-[10px] font-bold mt-0.5 truncate px-1">{t('animal.tileNew')}</span>
                </button>
              )}
            </div>
            {animalActive && (
              <div className="mt-2" data-testid="animal-format">
                {/* [ANIMAL ROUND] Nazwa z punktów i liczby strzał (user 2026-11-10),
                    związek tylko małym podpisem — każdy rozpozna swój format po karcie wyników. */}
                <div className="grid grid-cols-1 gap-1" role="radiogroup" aria-label={t('animal.format')}>
                  {ANIMAL_FORMATS.map(f => {
                    const on = animalFmt.id === f.id;
                    return (
                      <button
                        key={f.id}
                        role="radio"
                        aria-checked={on}
                        onClick={() => pickAnimalFmt(f.id)}
                        className={`min-w-0 py-1.5 px-2.5 rounded-lg border flex items-baseline gap-2 text-left transition-all ${on ? 'bg-[#0a3a2a] text-white border-[#0a3a2a]' : 'bg-white text-gray-600 border-gray-200'}`}
                      >
                        <span className="flex-1 min-w-0 text-[12px] font-black truncate">{formatLabel(f, t)}</span>
                        <span className={`shrink-0 text-[10px] font-bold ${on ? 'text-white/70' : 'text-gray-400'}`}>{t(`animal.fmt.${f.id}`)}</span>
                      </button>
                    );
                  })}
                </div>
                <p className="text-[10px] font-bold text-gray-400 mt-1.5">{t(`animal.fmtHint.${animalFmt.id}`)}</p>
              </div>
            )}
          </div>

          {/* Tarcza + nastawy celownika w jednej linii; ołówek otwiera ten sam edytor. */}
          {selectedId && !animalActive && (
            <button onClick={openSightEditor} className="w-full border-t border-t-gray-100 px-3 py-2 flex items-center gap-2.5 text-left active:bg-gray-50 transition-colors">
              <TargetThumbnail targetType={selectedTarget} className="w-8 h-8 shrink-0" />
              <span className="flex-1 min-w-0">
                <span className="block text-[14px] font-black text-[#0a3a2a] truncate">{selectedTarget}</span>
                {isPremium ? (
                  <span className="block text-[11px] font-bold text-gray-500 truncate">
                    {t('setup.editorExt')} {sightExtension || '–'} · {t('setup.editorHeight')} {sightHeight || '–'} · {t('setup.editorSide')} {sightSide || '–'}
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-[11px] font-bold text-amber-700">
                    <span className="material-symbols-outlined text-[13px]">diamond</span>{t('setup.sightPro')}
                  </span>
                )}
              </span>
              <span className="material-symbols-outlined text-[18px] text-gray-400" aria-label={t('setup.change')}>edit</span>
            </button>
          )}

          {/* [IFAA] Format z tarczy jak na zawodach — bez skracania. */}
          {selectedId && faceRound && !animalActive && (
            <div className="border-t border-t-gray-100 px-3 py-2 flex items-center gap-2" data-testid="face-round">
              <span className="flex-1 text-[13px] font-bold text-gray-500">{t('setup.endsLabel')}</span>
              <span className="text-[14px] font-black text-[#0a3a2a]">{faceRound.ends} × {faceRound.arrowsPerEnd} {t('common.arrows')}</span>
            </div>
          )}
          {/* [PARCOURS] Przełącznik rundy terenowej (każda tarcza inny dystans). */}
          {selectedId && canParcours && !animalActive && (
            <div className="border-t border-t-gray-100 px-3 py-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={parcoursOn} onChange={e => setParcoursOn(e.target.checked)} className="w-5 h-5 rounded border-gray-300 text-[#0a3a2a] focus:ring-0" data-testid="parcours-toggle" />
                <span className="flex-1 text-[13px] font-black text-[#0a3a2a]">{t('parcours.toggle')}</span>
              </label>
              {parcoursOn && <p className="text-[10px] font-bold text-gray-400 mt-1 ml-7">{t('parcours.toggleHint')}</p>}
            </div>
          )}
          {/* Passen — zawsze widoczne, zwinięte; rozwija 6/8/10/12. */}
          {selectedId && !faceRound && !animalActive && (
            <div className="border-t border-t-gray-100 px-3 py-2">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowEndsPicker(v => !v)}
                  aria-expanded={showEndsPicker}
                  className="flex-1 flex items-center gap-2 text-left active:opacity-70"
                >
                  <span className="flex-1 text-[13px] font-bold text-gray-500">{t('setup.endsLabel')}</span>
                  <span className={`text-[14px] font-black ${plannedEnds !== PLANNED_ENDS ? 'text-amber-700' : 'text-[#0a3a2a]'}`}>{plannedEnds}</span>
                  <span className="material-symbols-outlined text-[18px] text-gray-400">{showEndsPicker ? 'expand_less' : 'expand_more'}</span>
                </button>
                {plannedEnds !== PLANNED_ENDS && (
                  <button
                    onClick={() => setShowEndsInfo(v => !v)}
                    aria-label={t('sessionSetup.shortInfoAria')}
                    className="w-5 h-5 rounded-full bg-blue-500 text-white flex items-center justify-center active:scale-90 transition-all"
                  >
                    <span className="material-symbols-outlined text-[14px]">info</span>
                  </button>
                )}
              </div>
              {showEndsPicker && (
                <div className="grid grid-cols-4 gap-1.5 mt-2">
                  {[...SHORT_END_OPTIONS, PLANNED_ENDS].map(n => (
                    <button
                      key={n}
                      onClick={() => { setPlannedEnds(n); setShowEndsPicker(false); if (n === PLANNED_ENDS) setShowEndsInfo(false); }}
                      aria-pressed={n === plannedEnds}
                      className={`py-1.5 rounded-lg text-[13px] font-black border active:scale-95 transition-all ${n === plannedEnds ? 'bg-[#0a3a2a] text-white border-[#0a3a2a]' : 'bg-white text-gray-500 border-gray-200'}`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              )}
              {showEndsInfo && plannedEnds !== PLANNED_ENDS && (
                <div className="mt-2 bg-blue-50 border border-blue-100 rounded-xl px-3 py-2 text-[11px] leading-snug text-blue-900">
                  <p className="font-black mb-1">{t('sessionSetup.shortInfoTitle', { count: plannedEnds, half: Math.ceil(plannedEnds / 2) })}</p>
                  <p className="mb-1">{t('sessionSetup.shortInfoCounts')}</p>
                  <p>{t('sessionSetup.shortInfoSkips')}</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* PFEILZÄHLER — jeden płaski wiersz; „Speichern” dopiero przy liczbie > 0. */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-3 py-2 flex items-center gap-1.5">
          <span className="flex-1 min-w-0 text-[13px] font-black text-[#0a3a2a] truncate">
            {t('sessionSetup.arrowCounter')}
            {counterSaved && <span className="ml-1.5 text-[11px] font-bold text-emerald-600">✓</span>}
          </span>
          <button
            onClick={() => updateCounter(String(Math.max(0, parseInt(techArrows || '0') - 1)))}
            aria-label="−1"
            className="w-8 h-8 rounded-lg border border-gray-200 text-[#0a3a2a] flex items-center justify-center active:scale-90 transition-all"
          >
            <span className="material-symbols-outlined text-[18px]">remove</span>
          </button>
          <span className="min-w-[30px] text-center text-[18px] font-black text-[#0a3a2a]">{techArrows || '0'}</span>
          <button
            onClick={() => updateCounter(String(Math.max(0, parseInt(techArrows || '0') + 1)))}
            aria-label="+1"
            className="w-8 h-8 rounded-lg border border-gray-200 text-[#0a3a2a] flex items-center justify-center active:scale-90 transition-all"
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
          </button>
          <button
            onClick={() => updateCounter(String(Math.max(0, parseInt(techArrows || '0') + 6)))}
            className="h-8 px-2 rounded-lg border border-gray-200 text-[13px] font-black text-[#0a3a2a] active:scale-90 transition-all"
          >+6</button>
          {parseInt(techArrows || '0') > 0 && (
            <button
              onClick={handleSaveCounter}
              disabled={isSavingCounter}
              className="h-8 px-2.5 rounded-lg bg-[#0a3a2a] text-white text-[12px] font-black active:scale-95 transition-all disabled:opacity-50"
            >
              {isSavingCounter
                ? <span className="material-symbols-outlined text-[16px] animate-spin align-middle">progress_activity</span>
                : t('sessionSetup.saveCounter')}
            </button>
          )}
        </div>

        {/* Delay Mirror — mała pigułka (najczęściej otwierany przed treningiem). */}
        <div className="flex justify-end">
          <button
            onClick={() => onNavigate?.('DELAY_MIRROR')}
            className="inline-flex items-center gap-1.5 bg-white border border-gray-200 rounded-full pl-2 pr-3 py-1 text-[12px] font-bold text-[#0a3a2a] active:scale-95 transition-all"
          >
            <span className="material-symbols-outlined text-[16px]">slow_motion_video</span>
            {t('delayMirror.title')}
          </button>
        </div>
      </div>

      {/* Stały pasek startu — ten sam kształt i kółko co dolna nawigacja w App.tsx.
          Portal, bo <main> ma transform. Boczne przyciski białe z kolorową ikoną. */}
      {createPortal(
        <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md z-[90]">
          <div className="relative h-20 w-full px-2">
            <svg viewBox="0 0 390 80" preserveAspectRatio="none" className="absolute inset-0 w-full h-full pointer-events-none" style={{ filter: 'drop-shadow(0 -6px 16px rgba(0,0,0,0.08))' }}>
              <path d="M0,0 H148 C158,0 165,36 195,36 C225,36 232,0 242,0 H390 V80 H0 Z" className="nav-bg" />
            </svg>
            <div className="flex justify-between items-center h-full w-full relative">
              <div className="flex flex-1 justify-center items-center h-full px-1">
                <button
                  onClick={() => {
                    if (focusTopic) setSelectedTopics(prev => prev.length ? prev : [focusTopic]);
                    setShowTechModal(true);
                  }}
                  disabled={!selectedDistance}
                  className="h-12 w-full max-w-[132px] rounded-2xl bg-white border border-gray-200 text-[#0a3a2a] flex items-center gap-1.5 px-2 font-black active:scale-95 transition-all disabled:opacity-50"
                >
                  <span className="material-symbols-outlined text-[20px] shrink-0 text-sky-600">psychology</span>
                  <span className="text-[10px] tracking-wide text-left leading-tight whitespace-pre-line">{t('setup.techBtn')}</span>
                </button>
              </div>

              <div className="relative -top-7 w-20 shrink-0 flex flex-col items-center z-50">
                <button
                  onClick={handleStartClick}
                  disabled={!selectedDistance && !animalActive}
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
                      onGoToBattle(selectedDistance, selectedTarget, selectedId, selectedEntry?.label ? displayDistance(selectedEntry) : undefined);
                    } else {
                      onNavigate?.('BATTLE_LOBBY');
                    }
                  }}
                  disabled={!selectedDistance}
                  className="h-12 w-full max-w-[132px] rounded-2xl bg-white border border-gray-200 text-[#0a3a2a] flex items-center gap-1.5 px-2 font-black active:scale-95 transition-all disabled:opacity-50"
                >
                  <span className="material-symbols-outlined text-[20px] shrink-0 text-indigo-500">swords</span>
                  <span className="text-[10px] tracking-wide text-left leading-tight whitespace-pre-line">{t('setup.battleBtn')}</span>
                </button>
              </div>
            </div>
          </div>
          <div className="bg-white" style={{ height: 'env(safe-area-inset-bottom)' }} />
        </div>,
        document.body
      )}

      {/* MODAL TRENINGU TECHNICZNEGO */}
      {showTechModal && createPortal(
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100001] flex items-start justify-center p-3 pt-[calc(env(safe-area-inset-top)+56px)]">
          <div className="bg-white w-full max-w-md rounded-[28px] p-5 pb-6 animate-fade-in-up shadow-2xl border-t-4 border-sky-600">

            {/* HEADER */}
            <div className="flex justify-between items-center mb-4">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-sky-600 text-lg">psychology</span>
                <h2 className="text-base font-black text-[#0a3a2a] uppercase">{t('stats.techSessionTitle')}</h2>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black text-sky-700 bg-sky-50 px-2 py-1 rounded-lg uppercase tracking-widest">{t('sessionSetup.techSubtitle')}</span>
                <button onClick={() => setShowTechModal(false)} className="text-gray-400 p-1 active:scale-90 transition-all"><span className="material-symbols-outlined text-lg">close</span></button>
              </div>
            </div>

            {/* LICZNIK STRZAŁ */}
            <div className="bg-[#0a3a2a]/5 rounded-[20px] border-2 border-[#0a3a2a]/10 px-3 py-2 mb-3">
              <span className="text-[10px] font-black text-[#0a3a2a] uppercase tracking-widest block mb-1.5 text-center">{t('sessionSetup.arrowCounter')}</span>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setTechArrows(v => String(Math.max(0, parseInt(v || '0') + 6)))}
                  className="flex-1 py-2 bg-sky-500 text-white rounded-xl font-black text-sm active:scale-95 transition-all"
                >+6</button>
                <button
                  onClick={() => setTechArrows(v => String(Math.max(0, parseInt(v || '0') + 1)))}
                  className="flex-1 py-2 bg-sky-100 text-sky-700 rounded-xl font-black text-sm active:scale-95 transition-all"
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
            {focusPair.main && focusState && (
              <div className="mb-3 space-y-2">
                {/* Klik → Tagebuch, jak na Home (user 2026-10-23). Licznik strzał zostaje w telefonie. */}
                <FocusStrip focus={focusPair.main} {...displayProgress(focusState, focusPair.main)}
                  onOpen={() => { setShowTechModal(false); onNavigate?.('MY_COACH', undefined, focusPair.main?.topicId); }}
                  other={focusPair.other} onSwap={() => swapFocus(userId, focusState)} />
                <FocusChoiceChips state={focusState} choice={focusChoice} onChange={setFocusChoice} />
              </div>
            )}

            {/* TEMATY */}
            <div className="mb-3">
              {/* Tematy z „Dieses Training zählt für” są tu zaznaczone; odznaczenie gasi chip. */}
              <TopicPicker
                selectedTopics={shownTopics(focusState, focusChoice, selectedTopics)}
                onChange={next => {
                  const r = pickTopics(focusState, focusChoice, next);
                  setSelectedTopics(r.picked);
                  if (r.choice !== focusChoice) setFocusChoice(r.choice);
                }}
                markedTopic={focusTopic}
                trainingTopic={focusChoice.topic ? focusState?.trainingTopic?.topic : undefined}
              />
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
                className="w-full bg-gray-50 border-2 border-gray-100 p-3 rounded-xl font-bold text-sm text-[#0a3a2a] focus:border-sky-500 outline-none transition-all h-24 resize-none"
              />
            </div>

            <button
              onClick={handleSaveTechnical}
              disabled={isSavingTech}
              className={`w-full py-4 rounded-2xl font-black uppercase tracking-widest transition-all active:scale-95 flex items-center justify-center gap-2 ${
                isSavingTech ? 'bg-gray-100 text-gray-400' : 'bg-sky-600 text-white shadow-xl shadow-sky-100'
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
          // [FIX 2026-11-09] Mniej odstępu u góry i przewijanie w granicach ekranu —
          // przy wielu tarczach (IFAA) dół okienka uciekał poza mniejszy telefon.
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100000] flex items-start justify-center p-3 pt-[calc(env(safe-area-inset-top)+12px)]"
          onClick={() => setShowSightEditor(false)}
        >
          <div className="bg-white w-full max-w-md rounded-[28px] p-5 pb-5 animate-fade-in-up shadow-2xl max-h-[calc(100dvh-env(safe-area-inset-top)-24px)] overflow-y-auto overscroll-contain" onClick={e => e.stopPropagation()} data-testid="sight-editor">
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
            {/* [FIX 2026-11-09] Pełne nazwy z obrazkiem tarczy — ucięte „IFAA FIELD 20CM 4…”
                nie odróżniało zwykłej tarczy od Expert. */}
            <div className="grid grid-cols-3 gap-1.5 mb-4">
              {targetOptions.filter(o => o !== editTarget).map(o => (
                <button
                  key={o}
                  onClick={() => setEditTarget(o)}
                  aria-label={o}
                  className="min-h-[44px] flex flex-col items-center justify-center gap-1 rounded-lg border bg-white text-gray-500 border-gray-200 px-1 py-1.5 active:scale-95 transition-all"
                >
                  <TargetThumbnail targetType={o} className="w-6 h-6 shrink-0" />
                  <span className="text-[9px] font-black uppercase tracking-tight text-center leading-tight break-words w-full">{o}</span>
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
            <button onClick={() => { saveLastSetup(); rememberCourse(); onStartSession(startDistance(), startTarget(), true, null, parseInt(techArrows || '0') || undefined, ...startArgs()); }} className="w-full py-4 bg-red-500 text-white rounded-xl font-black uppercase mb-3">{t('setup.warningConfirm')}</button>
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