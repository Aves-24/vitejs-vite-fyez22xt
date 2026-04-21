import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom'; 
import { db, auth } from '../firebase'; 
import { doc, getDoc, setDoc, collection, addDoc, getDocs, updateDoc, arrayRemove, query, where } from 'firebase/firestore'; 
import { signOut } from 'firebase/auth'; 
import { getRecommendation, BowType } from '../config/archeryRules';
import { useTranslation } from 'react-i18next'; 
import ProfileWizard from '../components/ProfileWizard'; 
import { QRCodeCanvas } from 'qrcode.react';

// Importy komponentów ustawień
import ProfileSection from '../components/settings/ProfileSection';
import ProSection from '../components/settings/ProSection';
import CoachSection from '../components/settings/CoachSection';
import TournamentSection from '../components/settings/TournamentSection';
import BowSection from '../components/settings/BowSection'; 

type SettingsTab = 'PROFIL' | 'VISIER' | 'PFEILE' | 'BOGEN' | 'JEZYK' | 'PRO' | 'TRENER' | 'ZAWODY' | 'ADMIN';

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
  const [isSaving, setIsSaving] = useState(false);
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
          setFirstName(data.firstName || ''); setLastName(data.lastName || ''); setNickname(data.nickname || ''); 
          setClub(data.club || ''); setClubCity(data.clubCity || ''); setPlaceId(data.placeId || '');
          setTrialEndsAt(data.trialEndsAt || null); setGender(data.gender || 'M'); setBirthDate(data.birthDate || ''); 
          setCountry(data.country || 'Niemcy (DSB/WA)'); setHeight(data.height || ''); setHandedness(data.handedness || 'RH');
          
          // Wczytywanie danych sprzętowych
          setBowType((data.bowType as BowType) || 'Klasyczny (Recurve)'); 
          setLbs(data.lbs || 32);
          setRiser(data.riser || '');
          setLimbs(data.limbs || '');
          setStabilizers(data.stabilizers || '');
          setSight(data.sight || '');

          setIsPremium(data.isPremium || false);
          setShowFullName(data.showFullName !== undefined ? data.showFullName : true);
          setShowClub(data.showClub !== undefined ? data.showClub : true);
          setShowRegion(data.showRegion !== undefined ? data.showRegion : true);
          setIsCoach(data.isCoach || false); setCoachLimit(data.coachLimit || 0); setStudentsCount((data.students || []).length);

          if ((data.coaches || []).length > 0) {
            const coachesSnap = await getDocs(query(collection(db, 'users'), where('__name__', 'in', data.coaches)));
            setMyCoachesData(coachesSnap.docs.map(d => ({ id: d.id, ...d.data() })));
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
        finalDistances = ['18m', '20m', '25m', '30m', '35m', '40m', '50m', '60m', '70m', '90m'].map(m => {
          const existing = distances.find((d: any) => d.m === m);
          return { m, active: (m === recH.distance || m === recT.distance || m === '30m' || existing?.active), targetType: existing?.targetType || '122cm', sightExtension: existing?.sightExtension || '', sightHeight: existing?.sightHeight || '', sightSide: existing?.sightSide || '', sightMark: existing?.sightMark || '' };
        });
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

      let finalTrialEndsAt = trialEndsAt;
      if (!finalTrialEndsAt) {
        const trialDate = new Date(); trialDate.setDate(trialDate.getDate() + 30);
        finalTrialEndsAt = trialDate.toISOString(); setTrialEndsAt(finalTrialEndsAt);
      }

      // Zapisujemy nowe pola sprzętowe w bazie
      // [BEZPIECZEŃSTWO] `isPremium` NIE jest tu zapisywane — to pole chronione,
      // zmieniane tylko przez admina lub backend (po zakupie). Klient tylko je czyta.
      // `trialEndsAt` zapisujemy tylko przy pierwszej inicjalizacji (gdy było null) —
      // reguła pozwala na to jednorazowo, potem lock.
      const payload: any = {
        firstName, lastName, nickname, club, clubName: club, clubCity, placeId, countryCode: cCode,
        gender, birthDate, country, height, handedness,
        bowType, lbs, riser, limbs, stabilizers, sight,
        startYear, competitionLevel, userDistances: finalDistances,
        showFullName, showClub, showRegion
      };
      // Trial tylko przy pierwszym zapisie (gdy wcześniej null)
      if (!trialEndsAt && finalTrialEndsAt) {
        payload.trialEndsAt = finalTrialEndsAt;
      }
      await setDoc(doc(db, 'users', userId), payload, { merge: true });
      
      setIsSaving(false); if (wizardStep === 0) showToast(t('settings.successSave'));
    } catch (error) { console.error("Save error:", error); setIsSaving(false); }
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
          return ['18m', '20m', '25m', '30m', '35m', '40m', '50m', '60m', '70m', '90m'].map(m => {
            // Zachowaj istniejące dane wizjera jeśli ten dystans już był skonfigurowany
            const existing = distances.find((d: any) => d.m === m);
            return {
              m,
              active: m === recH.distance || m === recT.distance,
              targetType: m === recH.distance ? recH.targetType : m === recT.distance ? recT.targetType : (existing?.targetType || '122cm'),
              sightExtension: existing?.sightExtension || '',
              sightHeight: existing?.sightHeight || '',
              sightSide: existing?.sightSide || '',
              sightMark: existing?.sightMark || ''
            };
          });
        }} onSaveSettings={saveAllSettings} onNavigate={onNavigate} onLogout={() => setShowLogoutConfirm(true)}
      />

      <div className="px-6 mb-3 mt-6">
        <h1 className="text-xl font-black text-[#0a3a2a] tracking-tight text-center">{t('settings.mainTitle')}</h1>
      </div>

      <div className="flex px-2 gap-1 overflow-x-auto hide-scrollbar shrink-0 mb-2">
        {[
          { id: 'PROFIL', label: t('settings.tabProfile') },
          { id: 'VISIER', label: t('settings.tabSight') },
          { id: 'PFEILE', label: t('settings.tabArrows') },
          { id: 'BOGEN', label: t('settings.tabBow') },
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
          { id: 'ZAWODY', label: t('settings.tabTournament'), icon: 'emoji_events', color: 'text-fuchsia-500' }
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
          <ProfileSection 
            {...{ firstName, setFirstName, lastName, setLastName, nickname, setNickname, country, setCountry, clubCity, setClubCity, club, setClub, gender, setGender, bDay, setBDay, bMonth, setBMonth, bYear, setBYear, height, setHeight, handedness, setHandedness, startYear, setStartYear, competitionLevel, setCompetitionLevel, showFullName, setShowFullName, showClub, setShowClub, showRegion, setShowRegion }}
            countryOptions={t('settings.lists.countries', { returnObjects: true }) as string[]}
            availableCities={Array.from(new Set(globalClubs.map(c => c.city)))}
            availableClubs={Array.from(new Set(globalClubs.filter(c => c.city === clubCity).map(c => c.name)))}
            competitionLevels={t('settings.lists.compLevels', { returnObjects: true }) as string[]}
            onStartWizard={() => setWizardStep(1)}
            onLogout={() => setShowLogoutConfirm(true)}
          />
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
              <div key={d.m || i} className={`p-2.5 rounded-xl border transition-all ${d.active ? 'bg-white border-gray-100 shadow-sm' : 'bg-gray-50 border-transparent opacity-50'}`}>
                <div className="grid grid-cols-12 items-center">
                  <div className="col-span-4 flex items-center gap-2">
                    <input type="checkbox" checked={d.active} onChange={() => onToggleDistance(i)} className="w-5 h-5 rounded border-gray-300 text-[#0a3a2a] focus:ring-0" />
                    <span className="font-black text-[#333] text-sm">{d.m}</span>
                  </div>
                  <div className="col-span-8 flex gap-1 justify-end">
                    <input type="text" maxLength={8} className="flex-1 min-w-0 h-8 bg-gray-50 rounded-md text-[9px] text-center font-bold outline-none border border-gray-100" placeholder={t('settings.sight.ext')} value={d.sightExtension || ''} onChange={(e) => { const n = [...distances]; n[i].sightExtension = e.target.value; onUpdateAllDistances(n); }} />
                    <input type="text" maxLength={8} className="flex-1 min-w-0 h-8 bg-gray-50 rounded-md text-[9px] text-center font-bold outline-none border border-gray-100" placeholder={t('settings.sight.ud')} value={d.sightHeight || ''} onChange={(e) => { const n = [...distances]; n[i].sightHeight = e.target.value; n[i].sightMark = e.target.value; onUpdateAllDistances(n); }} />
                    <input type="text" maxLength={8} className="flex-1 min-w-0 h-8 bg-gray-50 rounded-md text-[9px] text-center font-bold outline-none border border-gray-100" placeholder={t('settings.sight.lr')} value={d.sightSide || ''} onChange={(e) => { const n = [...distances]; n[i].sightSide = e.target.value; onUpdateAllDistances(n); }} />
                  </div>
                </div>
                {d.active && (
                   <div className="mt-2 pt-2 border-t border-gray-50 flex items-center justify-between">
                     <span className="text-[9px] font-black text-gray-400 uppercase">{t('settings.sight.target')}</span>
                     <select value={d.targetType || '122cm'} onChange={(e) => onUpdateTargetType(i, e.target.value)} className="bg-gray-50 text-[10px] font-black text-[#0a3a2a] py-1.5 px-2 rounded-md outline-none border-none">
                       <option value="122cm">122cm</option><option value="80cm">80cm</option><option value="60cm">60cm</option><option value="40cm">40cm</option><option value="3-Spot">3-Spot</option><option value="80cm (6-Ring)">80cm (6-Ring)</option>
                     </select>
                   </div>
                )}
              </div>
            ))}
          </div>
        )}

        {activeTab === 'PFEILE' && (
          <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3 animate-fade-in-up shadow-sm">
            {['model', 'spine', 'length'].map(f => (
              <div key={f}>
                <label className="text-[10px] font-black text-gray-400 uppercase block mb-1 ml-1">{t(`settings.arrows.${f}`)}</label>
                <input type="text" className="w-full bg-gray-50 border border-gray-100 rounded-xl p-3 text-sm font-bold text-[#333] outline-none" placeholder={t(`settings.arrows.${f}Ph`)} />
              </div>
            ))}
          </div>
        )}

        {/* Tutaj podpinamy nasz nowy komponent BowSection */}
        {activeTab === 'BOGEN' && (
          <BowSection 
            bowType={bowType} setBowType={setBowType} 
            lbs={lbs} setLbs={setLbs}
            riser={riser} setRiser={setRiser}
            limbs={limbs} setLimbs={setLimbs}
            stabilizers={stabilizers} setStabilizers={setStabilizers}
            sight={sight} setSight={setSight}
          />
        )}

        {activeTab === 'JEZYK' && (
          <div className="space-y-2 animate-fade-in-up">
            {[{ id: 'pl', name: 'Polski' }, { id: 'en', name: 'English' }, { id: 'de', name: 'Deutsch' }].map(lang => (
              <button key={lang.id} onClick={() => i18n.changeLanguage(lang.id)} className={`w-full bg-white p-4 rounded-2xl border flex justify-between items-center transition-all ${i18n.language === lang.id ? 'border-emerald-200 bg-emerald-50/20' : 'border-gray-100'}`}>
                <span className="font-black text-[#333] text-sm">{lang.name}</span>
                {i18n.language === lang.id && <span className="material-symbols-outlined text-emerald-500 text-lg">check_circle</span>}
              </button>
            ))}
          </div>
        )}

        {activeTab === 'PRO' && <ProSection isPremium={isPremium} />}
        {activeTab === 'TRENER' && <CoachSection isCoach={isCoach} studentsCount={studentsCount} coachLimit={coachLimit} myCoachesData={myCoachesData} onShowQR={() => setShowMyQR(true)} onRevokeCoach={handleRevokeCoach} onNavigate={onNavigate} />}
        {activeTab === 'ZAWODY' && <TournamentSection />}
      </div>

      {['PROFIL', 'VISIER', 'PFEILE', 'BOGEN', 'JEZYK'].includes(activeTab) && (
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