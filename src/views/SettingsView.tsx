import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom'; 
import { db, auth } from '../firebase'; 
import { doc, getDoc, setDoc, collection, addDoc, getDocs, updateDoc, arrayRemove, query, where } from 'firebase/firestore'; 
import { signOut } from 'firebase/auth'; 
import { getRecommendation, BowType } from '../config/archeryRules';
import { useTranslation } from 'react-i18next'; 
import { switchLanguage } from '../i18n';
import ProfileWizard from '../components/ProfileWizard'; 
import { QRCodeCanvas } from 'qrcode.react';

// Importy komponentów ustawień
import ProfileSection from '../components/settings/ProfileSection';
import ProSection from '../components/settings/ProSection';
import CoachSection from '../components/settings/CoachSection';
import TournamentSection from '../components/settings/TournamentSection';
// [ZESTAWY] BowSection nie jest już importowany — zastąpił go EquipmentSection.
// Plik zostaje na dysku (jak TargetZoom/FullFaceTarget/ProfileView) — patrz T6.
import PrivacySection from '../components/settings/PrivacySection';
import { getThemePreference, setThemePreference, ThemePreference } from '../utils/theme';
import { loadPrivateProfile, savePrivateProfile, getAgeCategory, getAgeCategoryPL } from '../utils/privateProfile';
import { guestExpiryFields } from '../utils/guestMode';
import { invalidateSetupStamp } from '../utils/setupStamp';
import {
  UserDistance, buildDistanceEntry, rebuildMasterList, newDistanceId, normalizeLabel,
  formatDistance, isCustomDistance, isDuplicateDistance, compareDistances,
  countCustomDistances, customDistanceLimitFor,
  DISTANCE_LABEL_MAX, MIN_CUSTOM_METERS, MAX_CUSTOM_METERS,
} from '../config/distances';
import { selectableTargetIdsFor } from '../config/targetFaces';
import EquipmentSection from '../components/settings/EquipmentSection';
import { EquipmentSetup, buildMigrationPayload, sanitizeSetups, asBowType, DEFAULT_SETUP_ID } from '../config/equipmentSetups';

// [ZESTAWY] 'PFEILE' i 'BOGEN' zastąpione jedną zakładką 'SPRZET' z podzakładkami.
// 'VISIER' zostaje osobno — to nastawy celownika per dystans, nie sprzęt.
type SettingsTab = 'PROFIL' | 'VISIER' | 'SPRZET' | 'JEZYK' | 'PRO' | 'TRENER' | 'ZAWODY' | 'SHARE' | 'ADMIN';

interface SettingsViewProps {
  userId: string;
  userEmail?: string;
  distances: any[];
  onToggleDistance: (i: number) => void;
  onUpdateTargetType: (i: number, type: string) => void;
  onUpdateAllDistances: (newDistances: any[]) => void;
  initialTab?: string;
  autoStartWizard?: boolean;
  onNavigate?: (view: string, tab?: string) => void;
}

const ADMIN_EMAILS = ['info@aves-24.de', 'rafal.woropaj@googlemail.com'];

export default function SettingsView({
  userId, userEmail = '', distances, onToggleDistance, onUpdateTargetType, onUpdateAllDistances, initialTab = 'PROFIL', autoStartWizard = false, onNavigate
}: SettingsViewProps) {
  
  const { t, i18n } = useTranslation();
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab as SettingsTab);
  // [C20] Motyw (jasny/ciemny/system) — źródło prawdy w localStorage (utils/theme)
  const [themePref, setThemePref] = useState<ThemePreference>(getThemePreference());
  const [isSaving, setIsSaving] = useState(false);

  // [C25] Własne dystanse: metry są NIEZMIENNE po dodaniu (karmią handicap),
  // etykieta jest dowolna i można ją zmieniać bez końca — tożsamość trzyma `id`,
  // więc zmiana nazwy nie rusza historii. Patrz config/distances.ts.
  const [showAddDistance, setShowAddDistance] = useState(false);
  const [newMeters, setNewMeters] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [distanceError, setDistanceError] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const addCustomDistance = () => {
    const list = distances as UserDistance[];
    const meters = parseInt(newMeters, 10);
    if (!Number.isFinite(meters) || meters < MIN_CUSTOM_METERS || meters > MAX_CUSTOM_METERS) {
      setDistanceError(t('settings.sight.errRange', { min: MIN_CUSTOM_METERS, max: MAX_CUSTOM_METERS }));
      return;
    }
    // Limit dotyczy TYLKO wpisów własnych — dziesięć standardowych zostaje
    // każdemu, niezależnie od planu.
    if (countCustomDistances(list) >= customLimit) {
      setDistanceError(t('settings.sight.errLimit', { max: customLimit }));
      return;
    }
    const m = formatDistance(meters);
    const label = normalizeLabel(newLabel);
    if (isDuplicateDistance(list, m, label)) {
      setDistanceError(t('settings.sight.errDuplicate'));
      return;
    }
    // Zawsze id z zegara, także gdy metry pokrywają się ze standardowymi —
    // drugi wpis „18m" ma dostać WŁASNY kubełek, a nie przejąć historię pierwszego.
    const entry: UserDistance = {
      ...buildDistanceEntry(m, { active: true }),
      id: newDistanceId(),
      ...(label ? { label } : {}),
    };
    onUpdateAllDistances([...list, entry].sort(compareDistances));
    setShowAddDistance(false);
    setNewMeters('');
    setNewLabel('');
    setDistanceError(null);
  };

  const updateDistanceLabel = (id: string, raw: string) => {
    onUpdateAllDistances((distances as UserDistance[]).map(d => {
      if (d.id !== id) return d;
      const label = normalizeLabel(raw);
      const { label: _drop, ...rest } = d;
      return label ? { ...rest, label } : rest;
    }));
  };

  const removeDistance = (id: string) => {
    onUpdateAllDistances((distances as UserDistance[]).filter(d => d.id !== id));
    setPendingDeleteId(null);
  };
  const [placeId, setPlaceId] = useState<string>('');
  const [trialEndsAt, setTrialEndsAt] = useState<string | null>(null);

  // Dane Profilowe
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [nickname, setNickname] = useState(''); 
  const [club, setClub] = useState('');
  const [clubCity, setClubCity] = useState(''); 
  const [gender, setGender] = useState<'M' | 'K'>('M'); 
  const [birthDate, setBirthDate] = useState<string>('');
  const [bDay, setBDay] = useState('');
  const [bMonth, setBMonth] = useState('');
  const [bYear, setBYear] = useState('');
  const [country, setCountry] = useState<string>('Niemcy (DSB/WA)');
  const [height, setHeight] = useState<number | ''>('');
  const [handedness, setHandedness] = useState<'RH' | 'LH'>('RH'); 
  const [startYear, setStartYear] = useState<number>(new Date().getFullYear() - 3); 
  const [competitionLevel, setCompetitionLevel] = useState<string>('Tylko treningi (Rekreacja)');
  const [isPremium, setIsPremium] = useState<boolean>(false);

  // [C25] Limit WŁASNYCH dystansów — 2 FREE / 15 PRO (decyzja usera 2026-09-04).
  // Dziesięć standardowych ma każdy, niezależnie od planu. Ten sam kształt co
  // limit zestawów: `isPremium` jest polem chronionym w regułach Firestore,
  // więc klient nie podniesie go sobie, żeby dodać więcej wpisów.
  const customLimit = customDistanceLimitFor(isPremium);
  const customUsed = countCustomDistances(distances as UserDistance[]);

  const [wizardStep, setWizardStep] = useState<number>(0); 
  const [showFullName, setShowFullName] = useState<boolean>(true);
  const [showClub, setShowClub] = useState<boolean>(true);
  const [showRegion, setShowRegion] = useState<boolean>(true);

  // Dane Sprzętowe (BOGEN) - Dodane nowe stany
  const [bowType, setBowType] = useState<BowType>('Klasyczny (Recurve)'); 
  const [lbs, setLbs] = useState(32); 
  const [riser, setRiser] = useState('');
  const [limbs, setLimbs] = useState('');
  const [stabilizers, setStabilizers] = useState('');
  const [sight, setSight] = useState('');

  // [ZESTAWY] Sprzęt należy teraz do zestawu. Stare płaskie pola wyżej zostają
  // nietknięte — nic ich jeszcze nie kasuje, więc powrót jest bezkosztowy.
  const [setups, setSetups] = useState<EquipmentSetup[]>([]);
  const [activeSetupId, setActiveSetupId] = useState<string>(DEFAULT_SETUP_ID);

  // [DMUCHAWKA] Tarcze do wyboru przy dystansie — zawężone dyscypliną
  // aktywnego zestawu, tak samo jak przy starcie treningu.
  const targetOptions = selectableTargetIdsFor(
    (setups.find(s => s.id === activeSetupId) ?? setups[0])?.discipline ?? bowType
  );

  // Dane Trenera
  const [isCoach, setIsCoach] = useState<boolean>(false);
  const [coachLimit, setCoachLimit] = useState<number>(0);
  const [studentsCount, setStudentsCount] = useState<number>(0);
  const [myCoachesData, setMyCoachesData] = useState<any[]>([]);
  const [showMyQR, setShowMyQR] = useState(false);

  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [confirmRevokeCoachId, setConfirmRevokeCoachId] = useState<string | null>(null);
  const [globalClubs, setGlobalClubs] = useState<any[]>([]);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // [FIX memory leak] Trzymamy referencję do timeoutu toasta i czyścimy ją
  // przy unmount — inaczej setTimeout odpala setToastMessage(null) po
  // opuszczeniu widoku Ustawień → React warning o setState on unmounted component.
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    };
  }, []);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = setTimeout(() => setToastMessage(null), 3000);
  };

  useEffect(() => { if (initialTab) setActiveTab(initialTab as SettingsTab); }, [initialTab]);
  // Functional update: start wizard only from step 0. Prevents Firestore's
  // optimistic-then-rejected onSnapshot cycle from resetting wizardStep to 1
  // while the user is already mid-wizard (e.g. on step 7 clicking Finish).
  useEffect(() => { if (autoStartWizard) setWizardStep(s => s === 0 ? 1 : s); }, [autoStartWizard]);

  // Rozpakowanie birthDate → bDay/bMonth/bYear JEDNORAZOWO (przy pierwszym
  // przyjściu daty z Firestore). Potem synchronizacja idzie tylko w drugą
  // stronę (input → birthDate) — zapobiega pętli wynikającej z różnicy
  // formatów ('1' vs '01' po padStart).
  const didInitBirthDateRef = useRef(false);
  useEffect(() => {
    if (!didInitBirthDateRef.current && birthDate) {
      const parts = birthDate.split('-');
      if (parts.length === 3) {
        setBYear(parts[0]);
        setBMonth(parts[1]);
        setBDay(parts[2]);
        didInitBirthDateRef.current = true;
      }
    }
  }, [birthDate]);

  // Synchronizacja bDay/bMonth/bYear → birthDate (składanie inputów w ISO).
  // Po inicjalizacji (powyżej) to JEDYNE miejsce zmieniające birthDate.
  useEffect(() => {
    if (bDay && bMonth && bYear && bYear.length === 4) {
      const newDate = `${bYear}-${String(bMonth).padStart(2,'0')}-${String(bDay).padStart(2,'0')}`;
      if (newDate !== birthDate) {
        setBirthDate(newDate);
      }
    }
     
  }, [bDay, bMonth, bYear, birthDate]);

  useEffect(() => {
    const fetchProfileAndClubs = async () => {
      try {
        const docSnap = await getDoc(doc(db, 'users', userId)); 
        if (docSnap.exists()) {
          const data = docSnap.data();
          // Guard: only overwrite state when Firestore has an actual value.
          // Without this, an async getDoc that resolves mid-wizard would reset
          // every field the user just typed back to '' (new-user doc has no
          // profile fields yet, so `data.firstName || ''` === '').
          if (data.firstName) setFirstName(data.firstName);
          if (data.lastName) setLastName(data.lastName);
          if (data.nickname) setNickname(data.nickname);
          if (data.club) setClub(data.club);
          if (data.clubCity) setClubCity(data.clubCity);
          if (data.placeId) setPlaceId(data.placeId);
          if (data.trialEndsAt !== undefined) setTrialEndsAt(data.trialEndsAt || null);
          // [RODO C21] birthDate/gender → users/{uid}/private/profile.
          // Legacy fallback (data.gender/birthDate) dla kont sprzed migracji.
          if (data.gender) setGender(data.gender || 'M');
          if (data.birthDate) setBirthDate(data.birthDate);
          const priv = await loadPrivateProfile(userId);
          if (priv?.gender) setGender(priv.gender);
          if (priv?.birthDate) setBirthDate(priv.birthDate);
          if (data.country) setCountry(data.country);
          if (data.height) setHeight(data.height);
          if (data.handedness) setHandedness(data.handedness || 'RH');

          // Wczytywanie danych sprzętowych
          if (data.bowType) setBowType(data.bowType as BowType);
          if (data.lbs) setLbs(data.lbs);
          if (data.riser) setRiser(data.riser);
          if (data.limbs) setLimbs(data.limbs);
          if (data.stabilizers) setStabilizers(data.stabilizers);
          if (data.sight) setSight(data.sight);

          // [ZESTAWY] Migracja płaskich pól → zestaw #1. Idempotentna: gdy
          // `setups` już jest, `buildMigrationPayload` zwraca null. Zapisu tu
          // NIE robimy — nowe zestawy lecą do bazy razem z pierwszym „Zapisz",
          // żeby samo wejście w Ustawienia nie pisało po dokumencie.
          const migrated = buildMigrationPayload(data, t('settings.equipment.defaultSetupName'));
          if (migrated) {
            setSetups(migrated.setups);
            setActiveSetupId(migrated.activeSetupId);
          } else {
            setSetups(data.setups as EquipmentSetup[]);
            setActiveSetupId(data.activeSetupId || DEFAULT_SETUP_ID);
          }

          setIsPremium(data.isPremium || false);
          setShowFullName(data.showFullName !== undefined ? data.showFullName : true);
          setShowClub(data.showClub !== undefined ? data.showClub : true);
          setShowRegion(data.showRegion !== undefined ? data.showRegion : true);
          setIsCoach(data.isCoach || false); setCoachLimit(data.coachLimit || 0); setStudentsCount((data.students || []).length);

          if ((data.coaches || []).length > 0) {
            // [RODO C6] Pojedyncze getDoc zamiast zapytania `in`: reguła
            // relacyjna (uczeń w students[] trenera) działa per-dokument,
            // ale zapytania listowe po users odrzuca w całości.
            const coachDocs = await Promise.all(
              (data.coaches as string[]).map(cid => getDoc(doc(db, 'users', cid)).catch(() => null))
            );
            setMyCoachesData(
              coachDocs
                .filter((d): d is NonNullable<typeof d> => !!d && d.exists())
                .map(d => ({ id: d.id, ...d.data() }))
            );
          }
          if (data.startYear !== undefined) setStartYear(data.startYear);
          if (data.competitionLevel) setCompetitionLevel(data.competitionLevel);
        }
        const clubsSnap = await getDocs(collection(db, 'clubs'));
        setGlobalClubs(clubsSnap.docs.map(d => d.data()));
      } catch (error) { console.error("Error fetching profile:", error); }
    };
    fetchProfileAndClubs();
  }, [userId]);

  const saveAllSettings = async (wizardDistancesParam?: any[]) => {
    setIsSaving(true);
    try {
      let finalDistances = [...distances];
      if (wizardDistancesParam) {
        finalDistances = wizardDistancesParam; onUpdateAllDistances(finalDistances); 
      } else if (activeTab === 'PROFIL') {
        const birthYear = new Date(birthDate).getFullYear() || 1990;
        const recH = getRecommendation(bowType, birthYear, 'Hala (Indoor)', gender);
        const recT = getRecommendation(bowType, birthYear, 'Tory (Outdoor)', gender);
        // [C25] Wpisy własne usera przechodzą przez regenerację nietknięte.
        finalDistances = rebuildMasterList(distances as UserDistance[], (m, prev) =>
          buildDistanceEntry(m, {
            ...prev,
            active: (m === recH.distance || m === recT.distance || m === '30m' || prev?.active),
          }));
        onUpdateAllDistances(finalDistances); 
      }

      const cCode = country.includes('Polska') ? 'PL' : country.includes('USA') ? 'US' : 'DE';
      if (club.trim() && clubCity.trim()) {
        const clubExists = globalClubs.some(c => c.country === cCode && c.city === clubCity.trim() && c.name === club.trim());
        if (!clubExists) {
          // Dodawanie klubu do globalnej listy nie może blokować zapisu profilu —
          // własny try/catch, błąd tylko logujemy.
          try {
            await addDoc(collection(db, 'clubs'), { name: club.trim(), city: clubCity.trim(), country: cCode, placeId });
          } catch (e) {
            console.warn('Club addDoc failed (profile save continues):', e);
          }
        }
      }

      // [BEZPIECZEŃSTWO] `isPremium` NIE jest tu zapisywane — to pole chronione.
      // `trialEndsAt` NIE jest tu zapisywane — ustawiane jednorazowo przez App.tsx
      // przy tworzeniu konta; reguła Firestore blokuje jakąkolwiek zmianę tego pola
      // gdy jest już obecne w dokumencie. Stare konta bez trialEndsAt obsługuje
      // osobny fallback w App.tsx (onSnapshot handler).
      // [RODO C21] gender/birthDate NIE trafiają do users/{uid} (czytelnego dla
      // relacji trener↔uczeń) — idą do users/{uid}/private/profile. Trener
      // dostaje wyliczoną kategorię wiekową (ageCategory) zamiast daty urodzenia.
      // [ZESTAWY] Dyscyplina aktywnego zestawu jest źródłem prawdy. Stare,
      // płaskie `bowType` zapisujemy dalej — czyta je jeszcze rekomendacja
      // dystansów i kreator profilu. Rozjazd tych dwóch pól byłby gorszy niż
      // duplikat, więc trzymamy je zgodne aż do sprzątnięcia starego modelu.
      // [DMUCHAWKA] `asBowType` zwraca null dla dmuchawki, więc stare `bowType`
      // zostaje wtedy bez zmian. Wpisanie tam „Dmuchawka (Blasrohr)" wywróciłoby
      // `getRecommendation` i kreator profilu, które znają tylko klasy łuków.
      // Sesje i tak dostają prawdziwą dyscyplinę — stempel czyta ją z zestawu.
      const activeSetup = setups.find(s => s.id === activeSetupId) ?? setups[0];
      const effectiveBowType = asBowType(activeSetup?.discipline) ?? bowType;

      const payload: any = {
        firstName, lastName, nickname, club, clubName: club, clubCity, placeId, countryCode: cCode,
        country, height, handedness,
        bowType: effectiveBowType, lbs, riser, limbs, stabilizers, sight,
        // `sanitizeSetups` jest OBOWIĄZKOWE — wyczyszczone pole liczbowe albo
        // pusta podsekcja dają klucz `undefined`, a taki payload wywraca
        // cały setDoc błędem `invalid-argument` (nie tylko zestawy).
        setups: sanitizeSetups(setups), activeSetupId,
        startYear, competitionLevel, userDistances: finalDistances,
        showFullName, showClub, showRegion,
        // [GOŚĆ] Odświeża expiresAt na dokumencie gościa (no-op dla kont pełnych)
        ...guestExpiryFields()
      };
      if (birthDate) {
        payload.ageCategory = getAgeCategory(birthDate, gender);
        payload.ageCategoryPL = getAgeCategoryPL(birthDate, gender);
      }
      await setDoc(doc(db, 'users', userId), payload, { merge: true });
      await savePrivateProfile(userId, { birthDate, gender });
      // [ZESTAWY] bowType mógł się właśnie zmienić — kolejna sesja ma dostać
      // nową klasę, a nie tę z cache.
      invalidateSetupStamp(userId);
      // [RODO art. 8] Data urodzenia mogła się zmienić — bramka zgody opiekuna
      // (ParentalConsentGate) przelicza się na to zdarzenie.
      window.dispatchEvent(new Event('profile_saved'));
      if (wizardStep === 0) showToast(t('settings.successSave'));
    } catch (error) {
      console.error("Save error:", error);
      throw error; // propagate so finishWizard knows the save failed
    } finally {
      setIsSaving(false);
    }
  };

  const handleRevokeCoach = (coachId: string) => {
    setConfirmRevokeCoachId(coachId);
  };

  const executeRevokeCoach = async (coachId: string) => {
    // Dwa niezależne writes:
    //  1) Usuwamy trenera z naszego `coaches` (zawsze się powinno udać — to nasz doc).
    //  2) Usuwamy siebie z `students` trenera (wymaga specjalnej reguły Firestore
    //     zezwalającej userowi na self-removal z cudzego `students[]`).
    // Jeśli #2 padnie (np. user offline albo reguły nie wdrożone) — logujemy
    // i informujemy, ale i tak zaktualizujemy UI, bo #1 już rozerwało relację.
    try {
      await updateDoc(doc(db, 'users', userId), { coaches: arrayRemove(coachId) });
    } catch (e) {
      console.error("Revoke step 1 (own coaches) failed:", e);
      showToast(t('settings.coach.revokeError'));
      return;
    }
    try {
      await updateDoc(doc(db, 'users', coachId), { students: arrayRemove(userId) });
    } catch (e) {
      // Trener dalej widzi nas na liście — nie krytyczne, ale warto zalogować
      console.warn("Revoke step 2 (coach students) failed — coach may see stale entry:", e);
    }
    setMyCoachesData(prev => prev.filter(c => c.id !== coachId));
    showToast(t('settings.coach.revokeDone'));
  };

  return (
    <div className="flex flex-col h-full bg-[#fcfdfe] pt-[env(safe-area-inset-top)] pb-24 max-w-md mx-auto relative">
      
      <ProfileWizard 
        userId={userId} wizardStep={wizardStep} setWizardStep={setWizardStep} autoStartWizard={autoStartWizard}
        firstName={firstName} setFirstName={setFirstName} lastName={lastName} setLastName={setLastName} nickname={nickname} setNickname={setNickname}
        country={country} setCountry={setCountry} clubCity={clubCity} setClubCity={setClubCity} club={club} setClub={setClub}
        placeId={placeId} setPlaceId={setPlaceId} gender={gender} setGender={setGender} birthDate={birthDate} setBirthDate={setBirthDate}
        bDay={bDay} setBDay={setBDay} bMonth={bMonth} setBMonth={setBMonth} bYear={bYear} setBYear={setBYear}
        height={height} setHeight={setHeight} handedness={handedness} setHandedness={setHandedness} bowType={bowType} setBowType={setBowType}
        startYear={startYear} setStartYear={setStartYear} competitionLevel={competitionLevel} setCompetitionLevel={setCompetitionLevel}
        showFullName={showFullName} setShowFullName={setShowFullName} showClub={showClub} setShowClub={setShowClub} showRegion={showRegion} setShowRegion={setShowRegion}
        countryOptions={t('settings.lists.countries', { returnObjects: true }) as string[]}
        availableCities={Array.from(new Set(globalClubs.filter(c => c.country === (country.includes('Polska') ? 'PL' : 'DE')).map(c => c.city)))}
        availableClubs={Array.from(new Set(globalClubs.filter(c => c.city === clubCity).map(c => c.name)))}
        bowOptions={[{ id: 'Klasyczny (Recurve)', label: t('rules.bow_recurve') }, { id: 'Bloczkowy (Compound)', label: t('rules.bow_compound') }, { id: 'Goły (Barebow)', label: t('rules.bow_barebow') }, { id: 'Tradycyjny', label: t('rules.bow_trad') }]}
        competitionLevels={t('settings.lists.compLevels', { returnObjects: true }) as string[]}
        eventTypes={t('settings.lists.eventTypes', { returnObjects: true }) as string[]}
        generateSmartList={(bow, birth, gen) => {
          const birthYear = new Date(birth).getFullYear() || 1990;
          const recH = getRecommendation(bow, birthYear, 'Hala (Indoor)', gen);
          const recT = getRecommendation(bow, birthYear, 'Tory (Outdoor)', gen);
          // [C25] Kreator też nie kasuje własnych dystansów — zachowaj istniejące
          // dane wizjera, jeśli ten dystans już był skonfigurowany.
          return rebuildMasterList(distances as UserDistance[], (m, prev) =>
            buildDistanceEntry(m, {
              ...prev,
              active: m === recH.distance || m === recT.distance,
              targetType: m === recH.distance ? recH.targetType : m === recT.distance ? recT.targetType : (prev?.targetType || '122cm'),
            }));
        }} onSaveSettings={saveAllSettings} onNavigate={onNavigate} onLogout={() => setShowLogoutConfirm(true)}
      />

      <div className="px-6 mb-3 mt-6">
        <h1 className="text-xl font-black text-[#0a3a2a] tracking-tight text-center">{t('settings.mainTitle')}</h1>
      </div>

      <div className="flex px-2 gap-1 overflow-x-auto hide-scrollbar shrink-0 mb-2">
        {[
          { id: 'PROFIL', label: t('settings.tabProfile') },
          { id: 'SPRZET', label: t('settings.tabEquipment') },
          { id: 'VISIER', label: t('settings.tabSight') },
          { id: 'JEZYK', label: t('settings.tabLanguage') }
        ].map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id as SettingsTab)} className={`px-2.5 py-2.5 rounded-xl text-[9px] font-black tracking-widest transition-all whitespace-nowrap ${activeTab === tab.id ? 'bg-white border border-gray-100 text-[#0a3a2a] shadow-sm z-10' : 'text-gray-400 bg-transparent'}`}>
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex px-2 border-b border-gray-100 gap-1 overflow-x-auto hide-scrollbar shrink-0 pb-1">
        {[
          { id: 'PRO', label: t('settings.tabPro'), icon: 'diamond', color: 'text-[#F2C94C]' },
          { id: 'TRENER', label: t('settings.tabCoach'), icon: 'qr_code_scanner', color: 'text-blue-500' },
          { id: 'ZAWODY', label: t('settings.tabTournament'), icon: 'emoji_events', color: 'text-fuchsia-500' },
          { id: 'SHARE', label: t('settings.tabShare'), icon: 'qr_code_2', color: 'text-[#0a3a2a]' }
        ].map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id as SettingsTab)} className={`px-2.5 py-2.5 rounded-xl text-[9px] font-black tracking-widest transition-all whitespace-nowrap flex items-center gap-1 ${activeTab === tab.id ? 'bg-white border border-gray-100 text-[#0a3a2a] shadow-sm z-10' : 'text-gray-400 bg-transparent'}`}>
            {tab.label} <span className={`material-symbols-outlined text-[13px] ${tab.color}`}>{tab.icon}</span>
          </button>
        ))}
        {ADMIN_EMAILS.includes(userEmail) && (
          <button onClick={() => onNavigate?.('ADMIN')} className="px-2.5 py-2.5 rounded-xl text-[9px] font-black tracking-widest transition-all text-red-500 bg-red-50 border border-red-100 shadow-sm">ADMIN</button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {activeTab === 'PROFIL' && (
          <>
            <ProfileSection
              {...{ firstName, setFirstName, lastName, setLastName, nickname, setNickname, country, setCountry, clubCity, setClubCity, club, setClub, gender, setGender, bDay, setBDay, bMonth, setBMonth, bYear, setBYear, height, setHeight, handedness, setHandedness, startYear, setStartYear, competitionLevel, setCompetitionLevel, showFullName, setShowFullName, showClub, setShowClub, showRegion, setShowRegion }}
              countryOptions={t('settings.lists.countries', { returnObjects: true }) as string[]}
              availableCities={Array.from(new Set(globalClubs.map(c => c.city)))}
              availableClubs={Array.from(new Set(globalClubs.filter(c => c.city === clubCity).map(c => c.name)))}
              competitionLevels={t('settings.lists.compLevels', { returnObjects: true }) as string[]}
              onStartWizard={() => setWizardStep(1)}
              onLogout={() => setShowLogoutConfirm(true)}
            />
            {/* [RODO] Eksport danych (art. 20), usunięcie konta (art. 17),
                linki do polityki prywatności i Impressum */}
            <PrivacySection userId={userId} />
          </>
        )}

        {/* Zaktualizowana sekcja VISIER dla iOS */}
        {activeTab === 'VISIER' && (
          <div className="space-y-2 animate-fade-in-up">
            <div className="grid grid-cols-12 px-1 text-[8px] font-bold text-gray-400 uppercase text-center mb-1">
              <div className="col-span-4 text-left ml-1">{t('settings.sight.distTarget')}</div>
              <div className="col-span-8 flex justify-around pl-1">
                <span className="w-1/3 text-center">{t('settings.sight.ext')}</span>
                <span className="w-1/3 text-center">{t('settings.sight.ud')}</span>
                <span className="w-1/3 text-center">{t('settings.sight.lr')}</span>
              </div>
            </div>
            
            {distances && Array.isArray(distances) && distances.map((d, i) => (
              <div key={d.id || d.m || i} className={`p-2.5 rounded-xl border transition-all ${d.active ? 'bg-white border-gray-100 shadow-sm' : 'bg-gray-50 border-transparent opacity-50'}`}>
                <div className="grid grid-cols-12 items-center">
                  <div className="col-span-4 flex items-center gap-2 min-w-0">
                    <input type="checkbox" checked={d.active} onChange={() => onToggleDistance(i)} className="w-5 h-5 rounded border-gray-300 text-[#0a3a2a] focus:ring-0 shrink-0" />
                    <div className="min-w-0">
                      <span className="font-black text-[#333] text-sm block leading-none">{d.m}</span>
                      {d.label && <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wide block truncate mt-0.5">{d.label}</span>}
                    </div>
                  </div>
                  <div className="col-span-8 flex gap-1 justify-end">
                    <input type="text" maxLength={8} className="flex-1 min-w-0 h-8 bg-gray-50 rounded-md text-[9px] text-center font-bold outline-none border border-gray-100" placeholder={t('settings.sight.ext')} value={d.sightExtension || ''} onChange={(e) => { const n = [...distances]; n[i].sightExtension = e.target.value; onUpdateAllDistances(n); }} />
                    <input type="text" maxLength={8} className="flex-1 min-w-0 h-8 bg-gray-50 rounded-md text-[9px] text-center font-bold outline-none border border-gray-100" placeholder={t('settings.sight.ud')} value={d.sightHeight || ''} onChange={(e) => { const n = [...distances]; n[i].sightHeight = e.target.value; n[i].sightMark = e.target.value; onUpdateAllDistances(n); }} />
                    <input type="text" maxLength={8} className="flex-1 min-w-0 h-8 bg-gray-50 rounded-md text-[9px] text-center font-bold outline-none border border-gray-100" placeholder={t('settings.sight.lr')} value={d.sightSide || ''} onChange={(e) => { const n = [...distances]; n[i].sightSide = e.target.value; onUpdateAllDistances(n); }} />
                  </div>
                </div>
                {d.active && (
                   <>
                   <div className="mt-2 pt-2 border-t border-gray-50 flex items-center justify-between">
                     <span className="text-[9px] font-black text-gray-400 uppercase">{t('settings.sight.target')}</span>
                     <select value={d.targetType || '122cm'} onChange={(e) => onUpdateTargetType(i, e.target.value)} className="bg-gray-50 text-[10px] font-black text-[#0a3a2a] py-1.5 px-2 rounded-md outline-none border-none">
                       {/* [DMUCHAWKA] Lista zawężona dyscypliną aktywnego zestawu.
                           Zapisana wcześniej tarcza spoza listy zostaje dopisana,
                           żeby select nie pokazał pustki i nie podmienił jej po cichu. */}
                       {Array.from(new Set([...targetOptions, d.targetType || '122cm']))
                         .map(id => <option key={id} value={id}>{id}</option>)}
                     </select>
                   </div>
                   {/* [C25] Opis wolno zmieniać kiedykolwiek — tożsamością jest `id`,
                       więc zmiana nazwy nie rusza zapisanych treningów. */}
                   <div className="mt-2 flex items-center gap-2">
                     <input
                       type="text"
                       maxLength={DISTANCE_LABEL_MAX}
                       value={d.label || ''}
                       onChange={(e) => updateDistanceLabel(d.id, e.target.value)}
                       placeholder={t('settings.sight.labelPh')}
                       className="flex-1 min-w-0 h-8 bg-gray-50 rounded-md text-[10px] px-2 font-bold outline-none border border-gray-100"
                     />
                     {isCustomDistance(d) && (
                       <button
                         onClick={() => setPendingDeleteId(d.id)}
                         className="shrink-0 w-8 h-8 rounded-md bg-red-50 text-red-500 flex items-center justify-center active:scale-95"
                         aria-label={t('settings.sight.deleteAsk')}
                       >
                         <span className="material-symbols-outlined text-[16px]">delete</span>
                       </button>
                     )}
                   </div>
                   </>
                )}
              </div>
            ))}

            {/* [C25] Własny dystans — pierwszym prawdziwym przypadkiem jest
                dmuchawka (5/7/10 m), której lista standardowa nie zna. */}
            {showAddDistance ? (
              <div className="p-3 rounded-xl border border-[#0a3a2a]/20 bg-white shadow-sm space-y-2">
                <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">{t('settings.sight.addTitle')}</span>
                <div className="flex gap-2">
                  <input
                    type="number" inputMode="numeric"
                    min={MIN_CUSTOM_METERS} max={MAX_CUSTOM_METERS}
                    value={newMeters}
                    onChange={(e) => { setNewMeters(e.target.value); setDistanceError(null); }}
                    placeholder={t('settings.sight.meters')}
                    className="w-24 h-9 bg-gray-50 rounded-md text-[11px] px-2 font-black text-center outline-none border border-gray-100"
                  />
                  <input
                    type="text" maxLength={DISTANCE_LABEL_MAX}
                    value={newLabel}
                    onChange={(e) => { setNewLabel(e.target.value); setDistanceError(null); }}
                    placeholder={t('settings.sight.labelPh')}
                    className="flex-1 min-w-0 h-9 bg-gray-50 rounded-md text-[11px] px-2 font-bold outline-none border border-gray-100"
                  />
                </div>
                <p className="text-[9px] text-gray-400 font-bold">{t('settings.sight.labelHint')}</p>
                {distanceError && <p className="text-[10px] text-red-500 font-black">{distanceError}</p>}
                <div className="flex gap-2 pt-1">
                  <button onClick={addCustomDistance} className="flex-1 py-2.5 bg-[#0a3a2a] text-white rounded-lg font-black text-[10px] uppercase tracking-widest active:scale-95">{t('settings.sight.add')}</button>
                  <button onClick={() => { setShowAddDistance(false); setDistanceError(null); }} className="px-4 py-2.5 bg-gray-100 text-gray-500 rounded-lg font-black text-[10px] uppercase tracking-widest active:scale-95">{t('settings.sight.cancel')}</button>
                </div>
              </div>
            ) : (
              <div className="pt-1">
                <div className="flex items-center justify-between mb-2 px-1">
                  <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">
                    {t('settings.sight.ownDistances')} {customUsed}/{customLimit}
                  </span>
                  {customUsed >= customLimit && !isPremium && (
                    <span className="text-[9px] font-black text-[#F2C94C] uppercase flex items-center gap-1">
                      <span className="material-symbols-outlined text-[13px]">diamond</span>
                      {t('settings.sight.proForMore')}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => setShowAddDistance(true)}
                  disabled={customUsed >= customLimit}
                  className="w-full py-3 rounded-xl border-2 border-dashed border-gray-200 text-gray-400 font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-1.5 active:scale-95 transition-all disabled:opacity-40 disabled:active:scale-100"
                >
                  <span className="material-symbols-outlined text-[16px]">add</span>
                  {t('settings.sight.addTitle')}
                </button>
              </div>
            )}
          </div>
        )}

        {/* [ZESTAWY] SPRZĘT zastępuje dawne STRZAŁY i ŁUK.
            Dawna zakładka STRZAŁY miała inputy BEZ `value` i `onChange` —
            nic z niej nigdy nie trafiało do bazy. Teraz strzały realnie się
            zapisują, jako podzakładka zestawu. */}
        {activeTab === 'SPRZET' && (
          <EquipmentSection
            setups={setups}
            activeSetupId={activeSetupId}
            isPremium={isPremium}
            onSetupsChange={setSetups}
            onActiveSetupChange={setActiveSetupId}
          />
        )}

        {activeTab === 'JEZYK' && (
          <div className="space-y-2 animate-fade-in-up">
            {[{ id: 'pl', name: 'Polski' }, { id: 'en', name: 'English' }, { id: 'de', name: 'Deutsch' }].map(lang => (
              <button key={lang.id} onClick={() => switchLanguage(lang.id)} className={`w-full bg-white p-4 rounded-2xl border flex justify-between items-center transition-all ${i18n.language === lang.id ? 'border-emerald-200 bg-emerald-50/20' : 'border-gray-100'}`}>
                <span className="font-black text-[#333] text-sm">{lang.name}</span>
                {i18n.language === lang.id && <span className="material-symbols-outlined text-emerald-500 text-lg">check_circle</span>}
              </button>
            ))}

            {/* [C20] Motyw — jasny / ciemny / systemowy */}
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest pt-4 pb-1 px-1">{t('settings.themeTitle')}</p>
            {([
              { id: 'light', icon: 'light_mode', label: t('settings.themeLight') },
              { id: 'dark', icon: 'dark_mode', label: t('settings.themeDark') },
              { id: 'system', icon: 'contrast', label: t('settings.themeSystem') },
            ] as { id: ThemePreference; icon: string; label: string }[]).map(opt => (
              <button key={opt.id} onClick={() => { setThemePreference(opt.id); setThemePref(opt.id); }} className={`w-full bg-white p-4 rounded-2xl border flex justify-between items-center transition-all ${themePref === opt.id ? 'border-emerald-200 bg-emerald-50/20' : 'border-gray-100'}`}>
                <span className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-gray-500 text-xl">{opt.icon}</span>
                  <span className="font-black text-[#333] text-sm">{opt.label}</span>
                </span>
                {themePref === opt.id && <span className="material-symbols-outlined text-emerald-500 text-lg">check_circle</span>}
              </button>
            ))}
          </div>
        )}

        {activeTab === 'PRO' && <ProSection isPremium={isPremium} trialEndsAt={trialEndsAt} />}
        {activeTab === 'TRENER' && <CoachSection isCoach={isCoach} studentsCount={studentsCount} coachLimit={coachLimit} myCoachesData={myCoachesData} onShowQR={() => setShowMyQR(true)} onRevokeCoach={handleRevokeCoach} onNavigate={onNavigate} userId={userId} userName={`${firstName} ${lastName}`.trim()} userEmail={userEmail} />}
        {activeTab === 'ZAWODY' && <TournamentSection />}
        {activeTab === 'SHARE' && (
          <div className="flex flex-col items-center justify-center py-6">
            <h2 className="text-lg font-black text-[#0a3a2a] mb-1">{t('settings.shareTitle')}</h2>
            <p className="text-xs text-gray-500 text-center mb-5 px-4">
              {t('settings.shareSubtitle')}
            </p>
            <div className="bg-white p-5 rounded-3xl border border-gray-100 shadow-sm">
              <QRCodeCanvas
                value="https://vitejs-vite-fyez22xt.vercel.app/"
                size={240}
                bgColor="#ffffff"
                fgColor="#0a3a2a"
                level="M"
                includeMargin={false}
              />
            </div>
            <a
              href="https://vitejs-vite-fyez22xt.vercel.app/"
              className="mt-5 text-xs text-gray-500 break-all text-center px-6"
              target="_blank"
              rel="noopener noreferrer"
            >
              vitejs-vite-fyez22xt.vercel.app
            </a>
          </div>
        )}
      </div>

      {['PROFIL', 'VISIER', 'SPRZET', 'JEZYK'].includes(activeTab) && (
        <div className="px-4 py-3 bg-white/50 backdrop-blur-sm border-t border-gray-100 shrink-0">
          <button onClick={() => saveAllSettings()} disabled={isSaving} className="w-full py-3.5 rounded-xl font-black text-[11px] uppercase tracking-widest transition-all flex justify-center items-center gap-1.5 bg-[#0a3a2a] text-white shadow-lg active:scale-95">
            {isSaving ? <span className="material-symbols-outlined animate-spin text-sm">sync</span> : <span className="material-symbols-outlined text-sm">verified_user</span>} {t('settings.saveAll')}
          </button>
        </div>
      )}

      {showMyQR && createPortal(
        <div className="fixed inset-0 z-[400000] bg-black/80 backdrop-blur-sm flex items-center justify-center p-6">
          <div className="bg-white rounded-[32px] p-6 w-full max-w-sm text-center">
            <h2 className="text-lg font-black text-[#0a3a2a] mb-4">{t('settings.shareProfile')}</h2>
            <div className="bg-blue-50 p-4 rounded-[24px] inline-block border-4 border-blue-100 mb-6"><QRCodeCanvas value={userId} size={150} /></div>
            <div className="bg-gray-50 rounded-xl p-3 flex items-center justify-between border border-gray-200 mb-6">
              <code className="text-[10px] font-black text-[#0a3a2a] truncate pr-2">{userId}</code>
              <button onClick={() => { navigator.clipboard.writeText(userId); showToast(t('settings.copied')); }} className="bg-blue-100 text-blue-600 p-1.5 rounded-lg shrink-0"><span className="material-symbols-outlined text-[16px]">content_copy</span></button>
            </div>
            <button onClick={() => setShowMyQR(false)} className="w-full py-4 bg-gray-100 text-gray-600 rounded-xl font-black uppercase text-[11px]">{t('home.close')}</button>
          </div>
        </div>, document.body
      )}

      {confirmRevokeCoachId && createPortal(
        <div className="fixed inset-0 z-[400000] bg-black/80 backdrop-blur-sm flex items-center justify-center p-6 animate-fade-in">
          <div className="bg-white rounded-[32px] p-6 w-full max-w-sm text-center shadow-2xl">
            <div className="w-14 h-14 bg-orange-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="material-symbols-outlined text-orange-500 text-2xl">warning</span>
            </div>
            <h2 className="text-lg font-black text-[#0a3a2a] mb-2">{t('settings.coach.confirmRevoke')}</h2>
            <p className="text-sm font-bold text-gray-500 mb-6">{t('settings.coach.confirmRevokeDesc', 'Ta operacja jest nieodwracalna.')}</p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmRevokeCoachId(null)} className="flex-1 py-3.5 bg-gray-100 text-gray-500 rounded-xl font-black uppercase text-[11px]">{t('setup.warningCancel')}</button>
              <button onClick={() => { const id = confirmRevokeCoachId; setConfirmRevokeCoachId(null); executeRevokeCoach(id); }} className="flex-1 py-3.5 bg-[#0a3a2a] text-white rounded-xl font-black uppercase text-[11px]">{t('common.confirm')}</button>
            </div>
          </div>
        </div>, document.body
      )}

      {showLogoutConfirm && createPortal(
        <div className="fixed inset-0 z-[400000] bg-black/80 flex items-center justify-center p-6">
          <div className="bg-white rounded-[32px] p-6 w-full max-w-sm text-center">
            <h2 className="text-xl font-black text-[#0a3a2a] mb-2">{t('settings.wizard.logout')}</h2>
            <p className="text-sm font-bold text-gray-500 mb-6">{t('settings.logoutConfirm')}</p>
            <div className="flex gap-2">
              <button onClick={() => setShowLogoutConfirm(false)} className="flex-1 py-4 bg-gray-100 text-gray-500 rounded-xl font-black uppercase text-[11px]">{t('setup.warningCancel')}</button>
              <button onClick={() => signOut(auth)} className="flex-1 py-4 bg-red-50 text-white rounded-xl font-black uppercase text-[11px] shadow-md">{t('settings.wizard.logout')}</button>
            </div>
          </div>
        </div>, document.body
      )}

      {/* [C25] Kasowanie dystansu pyta — tak jak kasowanie zestawu (3612487).
          Sesje NIE znikają: niosą własny stempel, więc statystyki zostają. */}
      {pendingDeleteId && createPortal(
        <div className="fixed inset-0 z-[400000] bg-black/80 flex items-center justify-center p-6">
          <div className="bg-white rounded-[32px] p-6 w-full max-w-sm text-center">
            <h2 className="text-xl font-black text-[#0a3a2a] mb-2">{t('settings.sight.deleteAsk')}</h2>
            <p className="text-sm font-bold text-gray-500 mb-6">{t('settings.sight.deleteKeepsHistory')}</p>
            <div className="flex gap-2">
              <button onClick={() => setPendingDeleteId(null)} className="flex-1 py-4 bg-gray-100 text-gray-500 rounded-xl font-black uppercase text-[11px]">{t('setup.warningCancel')}</button>
              <button onClick={() => removeDistance(pendingDeleteId)} className="flex-1 py-4 bg-red-500 text-white rounded-xl font-black uppercase text-[11px] shadow-md">{t('common.confirm')}</button>
            </div>
          </div>
        </div>, document.body
      )}

      {toastMessage && createPortal(
        <div className="fixed top-14 left-1/2 -translate-x-1/2 z-[500000] bg-[#0a3a2a] text-white px-6 py-3.5 rounded-full font-black text-[10px] uppercase shadow-2xl animate-fade-in-up flex items-center gap-2">
          <span className="material-symbols-outlined text-emerald-400 text-sm">info</span> {toastMessage}
        </div>, document.body
      )}

      <style>{`
        .hide-scrollbar::-webkit-scrollbar { display: none; } 
        .animate-fade-in-up { animation: fadeInUp 0.3s ease-out forwards; } 
        @keyframes fadeInUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
}