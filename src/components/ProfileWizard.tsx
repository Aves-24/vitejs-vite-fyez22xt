import React, { useState, useEffect } from 'react';
import ClubPicker from './ClubPicker';
import { createPortal } from 'react-dom';
import { db } from '../firebase'; 
import { collection, addDoc } from 'firebase/firestore'; 
import { useTranslation } from 'react-i18next';
import { BowType } from '../config/archeryRules';

interface ProfileWizardProps {
  userId: string;
  wizardStep: number;
  setWizardStep: React.Dispatch<React.SetStateAction<number>>;
  autoStartWizard: boolean;
  
  // Stany z SettingsView
  firstName: string; setFirstName: (v: string) => void;
  lastName: string; setLastName: (v: string) => void;
  // [NOWOŚĆ] Nickname
  nickname?: string; setNickname?: (v: string) => void;
  
  country: string; setCountry: (v: string) => void;
  clubCity: string; setClubCity: (v: string) => void;
  club: string; setClub: (v: string) => void;
  placeId: string; setPlaceId: (v: string) => void;
  gender: 'M' | 'K'; setGender: (v: 'M' | 'K') => void;
  birthDate: string; setBirthDate: (v: string) => void;
  // [POPRAWKA PĘTLI] bDay/bMonth/bYear przychodzą z SettingsView — jedno źródło prawdy
  bDay: string; setBDay: (v: string) => void;
  bMonth: string; setBMonth: (v: string) => void;
  bYear: string; setBYear: (v: string) => void;
  height: number | ''; setHeight: (v: number | '') => void;
  handedness: 'RH' | 'LH'; setHandedness: (v: 'RH' | 'LH') => void;
  bowType: BowType; setBowType: (v: BowType) => void;
  startYear: number; setStartYear: (v: number) => void;
  competitionLevel: string; setCompetitionLevel: (v: string) => void;
  
  // [NOWOŚĆ] Stany RODO przekazane z SettingsView
  showFullName?: boolean; setShowFullName?: (v: boolean) => void;
  showClub?: boolean; setShowClub?: (v: boolean) => void;
  showRegion?: boolean; setShowRegion?: (v: boolean) => void;

  availableCities: string[];
  availableClubs: string[];
  bowOptions: { id: BowType, label: string }[];

  // Funkcje z SettingsView
  generateSmartList: (bow: BowType, birth: string, gender: 'M' | 'K') => any[];
  onSaveSettings: (wizardDistances: any[]) => Promise<void>;
  onNavigate?: (view: string, tab?: string) => void;
  onLogout: () => void;
}

export default function ProfileWizard(props: ProfileWizardProps) {
  const { t } = useTranslation();
  
  const [showWelcome, setShowWelcome] = useState(false);
  const prevWizardStepRef = React.useRef(0);
  useEffect(() => {
    const prev = prevWizardStepRef.current;
    prevWizardStepRef.current = props.wizardStep;
    if (props.wizardStep === 1 && prev === 0) {
      setShowWelcome(true);
    }
  }, [props.wizardStep]);

  const [isSavingLocal, setIsSavingLocal] = useState(false);
  const [wizardDistances, setWizardDistances] = useState<any[]>([]);
  const tDateRef = React.useRef<HTMLInputElement>(null);
  const pDateRef = React.useRef<HTMLInputElement>(null);

  const countryOptions = t('settings.lists.countries', { returnObjects: true }) as string[];
  const competitionLevels = t('settings.lists.compLevels', { returnObjects: true }) as string[];
  
  // [ZMIANA] Dystanse turniejowe zgodne z nowym designem
  const tournamentDistances = ['18m', '20m', '25m', '30m', '40m', '50m', '60m', '70m', '90m'];

  // [POPRAWKA PĘTLI] bDay/bMonth/bYear są teraz w propsach (źródło: SettingsView)
  // Lokalny stan i oba useEffect synchronizujące zostały usunięte — walczyły
  // z identycznymi effectami w SettingsView generując nieskończoną pętlę
  // "Maximum update depth exceeded".
  const { bDay, setBDay, bMonth, setBMonth, bYear, setBYear } = props;

  // [ZMIANA] Rozbite daty dla Turnieju
  const [tournamentTitle, setTournamentTitle] = useState('');
  const [tDay, setTDay] = useState('');
  const [tMonth, setTMonth] = useState('');
  const [tYear, setTYear] = useState(new Date().getFullYear().toString());
  const [tournamentTime, setTournamentTime] = useState('');
  const [tournamentLocation, setTournamentLocation] = useState('');
  const [tournamentNote, setTournamentNote] = useState('');
  
  // [POPRAWKA] Stan dla nowego wyboru dystansu
  const [selectedTDist, setSelectedTDist] = useState('70m'); 
  
  // [ZMIANA] Rozbite daty dla Wydarzenia
  const [privateEventTitle, setPrivateEventTitle] = useState('');
  const [pDay, setPDay] = useState('');
  const [pMonth, setPMonth] = useState('');
  const [pYear, setPYear] = useState(new Date().getFullYear().toString());
  const [privateEventTime, setPrivateEventTime] = useState('');
  const [privateEventAddress, setPrivateEventAddress] = useState('');
  const [privateEventNote, setPrivateEventNote] = useState('');

  // [USUNIĘTE] Dwa useEffecty synchronizujące birthDate ↔ bDay/bMonth/bYear
  // zostały usunięte z ProfileWizard. Tożsame effecty żyją w SettingsView
  // i to SettingsView jest pojedynczym źródłem prawdy. Dwie kopie tej samej
  // synchronizacji powodowały nieskończoną pętlę aktualizacji.

  useEffect(() => {
    setTournamentTitle('');
    setTDay(''); setTMonth(''); setTYear(new Date().getFullYear().toString());
    setTournamentTime('');
    setTournamentLocation('');
    setTournamentNote('');
    
    setPrivateEventTitle('');
    setPDay(''); setPMonth(''); setPYear(new Date().getFullYear().toString());
    setPrivateEventTime('');
    setPrivateEventAddress('');
    setPrivateEventNote('');
    
    setWizardDistances([]);
    props.setPlaceId('');
  }, [props.userId]);

  const currentYear = new Date().getFullYear();

  const handleWizardNext = () => {
    if (props.wizardStep === 4) {
      const newDists = props.generateSmartList(props.bowType, props.birthDate, props.gender);
      setWizardDistances(newDists);
    }
    props.setWizardStep(s => s + 1);
  };

  const updateWizardSight = (index: number, field: string, value: string) => {
    const newDists = [...wizardDistances];
    newDists[index] = { ...newDists[index], [field]: value };
    if (field === 'sightHeight') newDists[index].sightMark = value;
    setWizardDistances(newDists);
  };

  const handleAddTournamentAndNext = async () => {
    const finalDate = `${tYear}-${String(tMonth).padStart(2, '0')}-${String(tDay).padStart(2, '0')}`;
    
    if (tournamentTitle && tDay && tMonth && tYear) {
      setIsSavingLocal(true);
      try {
        await addDoc(collection(db, 'users', props.userId, 'tournaments'), {
          category: 'Turniej', title: tournamentTitle, date: finalDate, time: tournamentTime,
          address: tournamentLocation, note: tournamentNote, type: selectedTDist // Zapis wybranego kafelka
        });
      } catch (e) { console.error(e); }
      setIsSavingLocal(false);
    }
    props.setWizardStep(7);
  };

  const finishWizard = async (saveEvent: boolean = false) => {
    const finalDate = `${pYear}-${String(pMonth).padStart(2, '0')}-${String(pDay).padStart(2, '0')}`;

    if (saveEvent && privateEventTitle && pDay && pMonth && pYear) {
      setIsSavingLocal(true);
      try {
        await addDoc(collection(db, 'users', props.userId, 'tournaments'), {
          category: 'Inne', title: privateEventTitle, date: finalDate, time: privateEventTime,
          address: privateEventAddress, note: privateEventNote, type: 'Wydarzenie łucznicze'
        });
      } catch (e) { console.error(e); }
    }

    // Przekaż dystanse tylko jeśli zostały wygenerowane (krok 5 był odwiedzony)
    // Puste wizardDistances [] nie powinny nadpisać istniejących ustawień wizjera
    await props.onSaveSettings(wizardDistances.length > 0 ? wizardDistances : undefined);
    props.setWizardStep(0);
    if (props.onNavigate) props.onNavigate('HOME');
  };

  const renderField = (label: string, placeholder: string, value: any, onChange: any) => (
    <div key={label} className="group">
      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1 ml-1">{label}</label>
      <input type="text" value={value} onChange={onChange} className="w-full bg-gray-50 border border-gray-100 rounded-xl p-3 text-sm font-bold text-[#333] outline-none transition-all focus:border-emerald-500" placeholder={placeholder} />
    </div>
  );

  const renderExperienceText = (val: number) => {
    if (val === 0) return t('settings.wizard.lessThanYear');
    if (val >= 50) return t('settings.wizard.prehistoric');
    return `${val} ${t('settings.wizard.yearsSuffix')}`;
  };

  if (props.wizardStep === 0) return null;

  // [FIX TDZ] Te stałe muszą być zadeklarowane PRZED ekranem powitalnym,
  // bo welcome screen (wcześniej) używa `totalSteps` w tekście tłumaczenia.
  // Wcześniejsza wersja deklarowała je po returnie welcome screena → ReferenceError.
  const totalSteps = 7;
  const uName = props.nickname || props.firstName || t('settings.wizard.firstName');

  // [POPRAWKA Z-INDEX] EKRAN POWITALNY (Zero Screen)
  if (showWelcome) {
    return createPortal(
      <div className="fixed inset-0 mx-auto w-full max-w-md z-[30000] bg-[#0a3a2a] flex flex-col items-center justify-center p-6 animate-fade-in-up shadow-2xl">
        <div className="absolute inset-0 bg-emerald-900/20 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-emerald-500/10 via-transparent to-transparent"></div>
        <div className="relative z-10 flex flex-col items-center">
          <span className="material-symbols-outlined text-[80px] text-[#fed33e] mb-4 animate-bounce-subtle">auto_awesome</span>
          <h1 className="text-3xl font-black text-white mb-2 text-center flex flex-col items-center leading-snug">
            <span>{t('settings.wizard.welcomeTitle1')}</span>
            <span>{t('settings.wizard.welcomeTitle2')}</span>
          </h1>
          <p className="text-base font-black text-[#fed33e] text-center mb-4 uppercase tracking-wide">
            {t('settings.wizard.assistantTitle', { steps: totalSteps })}
          </p>

          <div className="w-full bg-emerald-900/40 rounded-2xl p-4 mb-6 border border-emerald-700/40">
            <p className="text-[13px] font-black text-white text-center leading-relaxed mb-2">
              {t('settings.wizard.motivationBanner')}
            </p>
            <ul className="space-y-1.5">
              {[
                t('settings.wizard.welcomeBenefit0'),
                t('settings.wizard.benefit1'),
                t('settings.wizard.welcomeBenefit2'),
                t('settings.wizard.benefit2'),
              ].map((item, i) => (
                <li key={i} className="flex items-start gap-2 text-[11px] font-bold text-emerald-100/90">
                  <span className="material-symbols-outlined text-[#fed33e] text-[14px] mt-0.5 shrink-0">check_circle</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <p className="text-[11px] font-bold text-emerald-200/60 text-center mb-8 px-2">
            {t('settings.wizard.laterNote')}
          </p>

          <button
            onClick={() => setShowWelcome(false)}
            className="w-full max-w-xs py-4 bg-[#fed33e] text-[#5d4a00] rounded-2xl font-black uppercase tracking-widest shadow-[0_10px_30px_rgba(254,211,62,0.3)] active:scale-95 transition-all"
          >
            {t('settings.wizard.welcomeBtn', 'ROZUMIEM, ZACZYNAMY')}
          </button>
        </div>
        <style>{`
          .animate-bounce-subtle { animation: bounce-subtle 2s infinite ease-in-out; }
          @keyframes bounce-subtle { 0%, 100% { transform: translateY(-5px); } 50% { transform: translateY(5px); } }
        `}</style>
      </div>,
      document.body
    );
  }

  const wizardDOM = (
    <div className="fixed inset-0 mx-auto w-full max-w-md z-[20000] bg-white flex flex-col h-[100dvh] animate-fade-in-up shadow-2xl">
      <div className="px-5 py-3 flex justify-between items-center border-b border-gray-100 bg-white shrink-0 pt-[max(1rem,env(safe-area-inset-top))]">
        <div className="flex gap-1.5 items-center">
          {[...Array(totalSteps)].map((_, i) => (
            <div key={i} className={`h-1.5 rounded-full transition-all duration-500 ${i + 1 <= props.wizardStep ? 'w-8 bg-[#0a3a2a]' : 'w-3 bg-gray-200'}`} />
          ))}
          <span className="text-[9px] font-black text-gray-400 ml-1">{props.wizardStep}/{totalSteps}</span>
        </div>
        {!props.autoStartWizard && (
          <button onClick={() => props.setWizardStep(0)} className="text-[11px] font-black text-gray-400 uppercase tracking-widest active:scale-95">{t('home.close')}</button>
        )}
      </div>

      {/* BANER MOTYWACYJNY — widoczny na każdym kroku */}
      <div className="px-5 py-2 bg-[#0a3a2a]/5 border-b border-[#0a3a2a]/10 shrink-0 flex items-center gap-2">
        <span className="material-symbols-outlined text-[#0a3a2a] text-[16px] shrink-0">info</span>
        <p className="text-[10px] font-black text-[#0a3a2a]/70 leading-tight">
          {t('settings.wizard.completionNote')}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-6 bg-[#fcfdfe]">

        {props.wizardStep === 1 && (
          <div className="space-y-5 animate-fade-in-up">
            <div className="flex items-start gap-3 bg-emerald-50 p-4 rounded-2xl border border-emerald-100">
              <span className="material-symbols-outlined text-3xl text-emerald-600">psychology</span>
              <div>
                <h2 className="text-sm font-black text-[#0a3a2a] mb-1">{t('settings.wizard.step1Title')}</h2>
                <p className="text-[11px] text-emerald-800 leading-relaxed font-medium">
                  {t('settings.wizard.step1Desc')}
                </p>
              </div>
            </div>

            <div className="space-y-4">
              {/* Sekcja Nazwiska i Imienia */}
              <div className="grid grid-cols-2 gap-2">
                {renderField(t('settings.wizard.firstName') + " *", t('settings.wizard.firstName'), props.firstName, (e:any)=>props.setFirstName(e.target.value))}
                {renderField(t('settings.wizard.lastName') + " " + t('common.optional'), t('settings.wizard.lastName'), props.lastName, (e:any)=>props.setLastName(e.target.value))}
              </div>

              {/* Nowe pole na pseudonim */}
              {props.setNickname && renderField(t('settings.nicknameLabel'), "np. Robin Hood", props.nickname || '', (e:any)=>props.setNickname!(e.target.value))}

              

              <div className="pt-2 border-t border-gray-100 space-y-3">
                 <h3 className="text-[10px] font-black text-gray-600 uppercase tracking-widest">{t('settings.wizard.team')}</h3>
                 
                 <div className="relative">
                    <label className="text-[10px] font-black text-gray-400 uppercase ml-1">{t('settings.wizard.country')}</label>
                    <select value={props.country} onChange={e=>props.setCountry(e.target.value)} className="w-full mt-1 bg-gray-50 border border-gray-200 p-3 rounded-xl text-sm font-bold outline-none focus:border-emerald-500">
                      {countryOptions.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                 </div>
                 
                 <div className="relative">
                    <label className="text-[10px] font-black text-gray-400 uppercase ml-1">{t('settings.wizard.clubCity')}</label>
                    <input list="wizard-cities" type="text" value={props.clubCity} onChange={e => { props.setClubCity(e.target.value); props.setClub(''); }} placeholder="np. Sankt Tönis" className="w-full mt-1 bg-gray-50 border border-gray-200 p-3 rounded-xl text-sm font-bold outline-none focus:border-emerald-500" />
                    <datalist id="wizard-cities">
                       {props.availableCities.map((c) => <option key={`city-${c}`} value={c} />)}
                    </datalist>
                 </div>

                 <div>
                    <label className="text-[10px] font-black text-gray-400 uppercase ml-1 block mb-1">{t('settings.wizard.clubName')}</label>
                    <ClubPicker
                      value={props.club}
                      onChange={props.setClub}
                      availableClubs={props.availableClubs}
                      citySelected={!!props.clubCity.trim()}
                    />
                 </div>
              </div>
            </div>
          </div>
        )}

        {props.wizardStep === 2 && (
          <div className="space-y-5 animate-fade-in-up">
            <div className="flex items-start gap-3 bg-emerald-50 p-4 rounded-2xl border border-emerald-100 flex-col text-center">
              <span className="material-symbols-outlined text-4xl text-emerald-600 self-center">cake</span>
              <div>
                <h2 className="text-sm font-black text-[#0a3a2a] mb-1">{t('settings.wizard.step2Title', { name: uName })}</h2>
                <p className="text-[11px] text-emerald-800 leading-relaxed font-medium">
                  {t('settings.wizard.step2Desc')}
                </p>
              </div>
            </div>

            <div className="flex gap-2">
              <button onClick={() => props.setGender('M')} className={`flex-1 py-3 rounded-xl font-black text-xs border-2 transition-all ${props.gender === 'M' ? 'bg-[#0a3a2a] border-[#0a3a2a] text-white shadow-md' : 'bg-white text-gray-400 border-gray-100 hover:border-gray-200'}`}>{t('settings.wizard.genderM')}</button>
              <button onClick={() => props.setGender('K')} className={`flex-1 py-3 rounded-xl font-black text-xs border-2 transition-all ${props.gender === 'K' ? 'bg-[#0a3a2a] border-[#0a3a2a] text-white shadow-md' : 'bg-white text-gray-400 border-gray-100 hover:border-gray-200'}`}>{t('settings.wizard.genderF')}</button>
            </div>

            <div className="space-y-2 mt-4">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">{t('settings.wizard.birthDate')}</label>
              <div className="flex gap-2">
                <div className="flex-1 flex flex-col gap-1">
                  <input type="number" placeholder="DD" className="w-full bg-gray-50 border border-gray-100 rounded-xl p-3 text-center font-black text-lg focus:bg-emerald-50 focus:border-emerald-500 outline-none" value={bDay} onChange={e => setBDay(e.target.value.slice(0,2))} />
                  <span className="text-[8px] text-center font-bold text-gray-300 uppercase">{t('common.day')}</span>
                </div>
                <div className="flex-1 flex flex-col gap-1">
                  <input type="number" placeholder="MM" className="w-full bg-gray-50 border border-gray-100 rounded-xl p-3 text-center font-black text-lg focus:bg-emerald-50 focus:border-emerald-500 outline-none" value={bMonth} onChange={e => setBMonth(e.target.value.slice(0,2))} />
                  <span className="text-[8px] text-center font-bold text-gray-300 uppercase">{t('common.month')}</span>
                </div>
                <div className="flex-[1.5] flex flex-col gap-1">
                  <input type="number" placeholder="YYYY" className="w-full bg-gray-50 border border-gray-100 rounded-xl p-3 text-center font-black text-lg focus:bg-emerald-50 focus:border-emerald-500 outline-none" value={bYear} onChange={e => setBYear(e.target.value.slice(0,4))} />
                  <span className="text-[8px] text-center font-bold text-gray-300 uppercase">{t('common.year')}</span>
                </div>
              </div>
            </div>

          </div>
        )}

        {props.wizardStep === 3 && (
          <div className="space-y-5 animate-fade-in-up">
            <div className="flex items-start gap-3 bg-emerald-50 p-4 rounded-2xl border border-emerald-100">
              <span className="material-symbols-outlined text-3xl text-emerald-600">accessibility_new</span>
              <div>
                <h2 className="text-sm font-black text-[#0a3a2a] mb-1">{t('settings.wizard.step3Title')}</h2>
                <p className="text-[11px] text-emerald-800 leading-relaxed font-medium">
                  {t('settings.wizard.step3Desc')}
                </p>
              </div>
            </div>

            <div className="flex gap-2">
              <button onClick={() => props.setHandedness('RH')} className={`flex-1 py-3 rounded-xl font-black text-xs border-2 transition-all ${props.handedness === 'RH' ? 'bg-[#0a3a2a] border-[#0a3a2a] text-white shadow-md' : 'bg-white text-gray-400 border-gray-100 hover:border-gray-200'}`}>{t('profile.handednessRH')}</button>
              <button onClick={() => props.setHandedness('LH')} className={`flex-1 py-3 rounded-xl font-black text-xs border-2 transition-all ${props.handedness === 'LH' ? 'bg-[#0a3a2a] border-[#0a3a2a] text-white shadow-md' : 'bg-white text-gray-400 border-gray-100 hover:border-gray-200'}`}>{t('profile.handednessLH')}</button>
            </div>

            <div>
              <label className="text-[10px] font-black text-gray-400 uppercase ml-1">{t('settings.wizard.height')}</label>
              <input type="number" value={props.height} onChange={e => props.setHeight(Number(e.target.value) || '')} placeholder="np. 180" className="w-full mt-1 bg-gray-50 border border-gray-200 rounded-xl p-3 text-sm font-bold text-center outline-none focus:border-emerald-500" />
            </div>
          </div>
        )}

        {props.wizardStep === 4 && (
          <div className="space-y-5 animate-fade-in-up pb-8">
            <div className="flex items-start gap-3 bg-emerald-50 p-4 rounded-2xl border border-emerald-100">
              <span className="material-symbols-outlined text-3xl text-emerald-600">track_changes</span>
              <div>
                <h2 className="text-sm font-black text-[#0a3a2a] mb-1">{t('settings.wizard.step4Title')}</h2>
                <p className="text-[11px] text-emerald-800 leading-relaxed font-medium">
                  {t('settings.wizard.step4Desc')}
                </p>
              </div>
            </div>

            <div>
              <label className="text-[10px] font-black text-gray-400 uppercase ml-1 mb-1 block">{t('settings.wizard.bowType')}</label>
              <div className="grid grid-cols-2 gap-2">
                {props.bowOptions.map(bow => (
                  <button key={bow.id} onClick={() => props.setBowType(bow.id)} className={`py-3 px-1 rounded-xl font-black text-[10px] border-2 transition-all ${props.bowType === bow.id ? 'bg-emerald-50 text-emerald-700 border-emerald-400 shadow-sm' : 'bg-white text-gray-400 border-gray-100 hover:border-gray-200'}`}>{bow.label}</button>
                ))}
              </div>
            </div>

            <div className="pt-2">
              <div className="flex justify-between items-end mb-1">
                <label className="text-[10px] font-black uppercase text-gray-400 ml-1">{t('settings.wizard.yearsShooting')}</label>
                <span className="text-xs font-black text-[#0a3a2a] bg-gray-50 px-2 py-1 rounded-md">{renderExperienceText(currentYear - props.startYear)}</span>
              </div>
              <input type="range" min="0" max="50" value={currentYear - props.startYear} onChange={(e) => props.setStartYear(currentYear - Number(e.target.value))} className="w-full accent-emerald-600 h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer mt-1" />
            </div>

            <div className="pt-3">
              <label className="text-[10px] font-black text-gray-400 uppercase ml-1 mb-2 block">{t('settings.wizard.highestLevel')}</label>
              <div className="flex flex-col gap-1.5">
                {competitionLevels.map(lvl => (
                  <button 
                    key={lvl} 
                    onClick={() => props.setCompetitionLevel(lvl)} 
                    className={`w-full text-left px-4 py-3 rounded-xl font-bold text-xs border-2 transition-all ${
                      props.competitionLevel === lvl 
                        ? 'bg-[#0a3a2a] border-[#0a3a2a] text-white shadow-sm' 
                        : 'bg-gray-50 border-gray-100 text-gray-500 hover:border-gray-200 hover:bg-white'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span>{lvl}</span>
                      {props.competitionLevel === lvl && <span className="material-symbols-outlined text-emerald-400 text-sm">check_circle</span>}
                    </div>
                  </button>
                ))}
              </div>
            </div>

          </div>
        )}

        {props.wizardStep === 5 && (
          <div className="space-y-4 animate-fade-in-up">
            <div className="flex items-start gap-3 bg-yellow-50 p-4 rounded-2xl border border-yellow-200">
              <span className="material-symbols-outlined text-3xl text-yellow-600">center_focus_strong</span>
              <div>
                <h2 className="text-sm font-black text-[#0a3a2a] mb-1">{t('settings.wizard.step5Title')}</h2>
                <p className="text-[11px] text-yellow-800 leading-relaxed font-medium">
                  {t('settings.wizard.step5Desc')}
                </p>
              </div>
            </div>

            <div className="space-y-2 mt-2">
              <div className="grid grid-cols-12 px-1 text-[8px] font-bold text-gray-400 uppercase text-center mb-1">
                <div className="col-span-5 text-left ml-1">{t('settings.wizard.distTarget')}</div>
                <div className="col-span-7 flex justify-around pl-1">
                  <span className="text-[7px]">{t('settings.wizard.ext')}</span>
                  <span className="text-[7px]">{t('settings.wizard.ud')}</span>
                  <span className="text-[7px]">{t('settings.wizard.lr')}</span>
                </div>
              </div>

              {wizardDistances.filter(d => d.active).map((d, i) => (
                <div key={d.m} className="p-2 rounded-xl border bg-white border-gray-100 shadow-sm">
                  <div className="grid grid-cols-12 items-center">
                    <div className="col-span-5 flex flex-col items-start justify-center">
                      <span className="font-black text-[#333] text-sm leading-none">{d.m}</span>
                      <span className="text-[8px] font-black text-emerald-600 uppercase tracking-widest mt-1">{d.targetType}</span>
                    </div>
                    <div className="col-span-7 flex gap-1 justify-end">
                      <input 
                        type="text" maxLength={8} placeholder={t('settings.wizard.ext')}
                        className="w-[32%] h-8 bg-gray-50 rounded-md text-[9px] text-center font-bold outline-none focus:bg-emerald-50 border border-transparent focus:border-emerald-200" 
                        value={d.sightExtension || ''}
                        onChange={(e) => updateWizardSight(wizardDistances.indexOf(d), 'sightExtension', e.target.value)}
                      />
                      <input 
                        type="text" maxLength={8} placeholder={t('settings.wizard.ud')}
                        className="w-[32%] h-8 bg-gray-50 rounded-md text-[9px] text-center font-bold outline-none focus:bg-emerald-50 border border-transparent focus:border-emerald-200" 
                        value={d.sightHeight || ''}
                        onChange={(e) => updateWizardSight(wizardDistances.indexOf(d), 'sightHeight', e.target.value)}
                      />
                      <input 
                        type="text" maxLength={8} placeholder={t('settings.wizard.lr')}
                        className="w-[32%] h-8 bg-gray-50 rounded-md text-[9px] text-center font-bold outline-none focus:bg-emerald-50 border border-transparent focus:border-emerald-200" 
                        value={d.sightSide || ''}
                        onChange={(e) => updateWizardSight(wizardDistances.indexOf(d), 'sightSide', e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-[10px] font-bold text-gray-400 text-center px-2 pt-1">
              <span className="material-symbols-outlined text-[12px] align-middle mr-0.5">info</span>
              {t('settings.wizard.step5Note')}
            </p>
          </div>
        )}

        {props.wizardStep === 6 && (
          <div className="space-y-4 animate-fade-in-up">
            <div className="flex items-start gap-3 bg-emerald-50 p-4 rounded-2xl border border-emerald-100 mb-2">
              <span className="material-symbols-outlined text-3xl text-emerald-600">event_available</span>
              <div>
                <h2 className="text-sm font-black text-[#0a3a2a] mb-1">{t('settings.wizard.step6Title')}</h2>
                <p className="text-[11px] text-emerald-800 leading-relaxed font-medium">
                  {t('settings.wizard.step6Desc')}
                </p>
              </div>
            </div>

            <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 mt-2">
              
              <h2 className="text-sm font-black text-[#0a3a2a] mb-3 pl-1">{t('settings.wizard.calendarTitle')}</h2>

              <div className="flex p-1 bg-gray-100 rounded-xl pointer-events-none mb-4">
                <button className="flex-1 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all bg-[#0a3a2a] text-white shadow-md">{t('settings.wizard.tournamentTab')}</button>
                <button className="flex-1 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all text-gray-400">{t('settings.wizard.otherTab')}</button>
              </div>

              {/* [POPRAWKA] Poziomy wybór dystansu zamiast starych Selectów */}
              <div className="flex flex-wrap gap-2 mb-4">
                {tournamentDistances.map(dist => (
                  <button
                    key={dist}
                    type="button"
                    onClick={() => setSelectedTDist(dist)}
                    className={`px-4 py-2.5 rounded-2xl font-black text-sm transition-all border-2 ${
                      selectedTDist === dist 
                      ? 'bg-emerald-100 border-emerald-400 text-[#0a3a2a] shadow-sm' 
                      : 'bg-gray-50 border-transparent text-gray-400 hover:bg-gray-100'
                    }`}
                  >
                    {dist}
                  </button>
                ))}
              </div>
              
              <div className="space-y-3">
                <input type="text" placeholder={t('settings.wizard.tourNamePlaceholder')} className="w-full bg-gray-50 border border-gray-100 rounded-xl p-3 text-sm font-bold focus:outline-none focus:border-emerald-500" value={tournamentTitle} onChange={e => setTournamentTitle(e.target.value)} />
                
                <div className="space-y-2 mt-3">
                  <div className="flex gap-2 items-end">
                    <div className="flex-1 flex flex-col gap-1">
                      <input type="number" placeholder="DD" className="w-full bg-gray-50 border border-gray-100 rounded-xl p-3 text-center font-black text-lg focus:bg-emerald-50 focus:border-emerald-500 outline-none" value={tDay} onChange={e => setTDay(e.target.value.slice(0,2))} />
                      <span className="text-[8px] text-center font-bold text-gray-300 uppercase">{t('common.day')}</span>
                    </div>
                    <div className="flex-1 flex flex-col gap-1">
                      <input type="number" placeholder="MM" className="w-full bg-gray-50 border border-gray-100 rounded-xl p-3 text-center font-black text-lg focus:bg-emerald-50 focus:border-emerald-500 outline-none" value={tMonth} onChange={e => setTMonth(e.target.value.slice(0,2))} />
                      <span className="text-[8px] text-center font-bold text-gray-300 uppercase">{t('common.month')}</span>
                    </div>
                    <div className="flex-[1.5] flex flex-col gap-1">
                      <input type="number" placeholder="YYYY" className="w-full bg-gray-50 border border-gray-100 rounded-xl p-3 text-center font-black text-lg focus:bg-emerald-50 focus:border-emerald-500 outline-none" value={tYear} onChange={e => setTYear(e.target.value.slice(0,4))} />
                      <span className="text-[8px] text-center font-bold text-gray-300 uppercase">{t('common.year')}</span>
                    </div>
                    <div className="flex-[1.5] flex flex-col gap-1">
                      <input type="time" className="w-full bg-[#fed33e] border border-[#e5bd38] rounded-xl p-3 text-center font-black text-lg text-[#5d4a00] outline-none" value={tournamentTime} onChange={e => setTournamentTime(e.target.value)} />
                      <span className="text-[8px] text-center font-bold text-gray-400 uppercase">{t('common.hour')}</span>
                    </div>
                    <div className="flex flex-col gap-1 pb-4">
                      <button type="button" onClick={() => tDateRef.current?.click()} className="w-11 h-11 flex items-center justify-center bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-600 active:scale-95 transition-all">
                        <span className="material-symbols-outlined text-xl">calendar_today</span>
                      </button>
                      <input ref={tDateRef} type="date" className="sr-only" onChange={e => { if (e.target.value) { const [y,m,d] = e.target.value.split('-'); setTYear(y); setTMonth(m); setTDay(d); }}} />
                    </div>
                  </div>
                </div>
                
                <input type="text" placeholder={t('settings.wizard.cityPlaceholder')} className="w-full bg-gray-50 border border-gray-100 rounded-xl p-3 text-sm font-bold focus:outline-none focus:border-emerald-500" value={tournamentLocation} onChange={e => setTournamentLocation(e.target.value)} />
                
                <textarea maxLength={120} placeholder={t('settings.wizard.notesPlaceholder')} className="w-full bg-gray-50 border border-gray-100 rounded-xl p-3 text-sm font-bold h-16 resize-none focus:outline-none focus:border-emerald-500" value={tournamentNote} onChange={e => setTournamentNote(e.target.value)} />
              </div>
            </div>
          </div>
        )}

        {props.wizardStep === 7 && (
          <div className="space-y-4 animate-fade-in-up">
            <div className="flex items-start gap-3 bg-emerald-50 p-4 rounded-2xl border border-emerald-100 mb-2">
              <span className="material-symbols-outlined text-3xl text-emerald-600">shopping_cart</span>
              <div>
                <h2 className="text-sm font-black text-[#0a3a2a] mb-1">{t('settings.wizard.step7Title')}</h2>
                <p className="text-[11px] text-emerald-800 leading-relaxed font-medium">
                  {t('settings.wizard.step7Desc')}
                </p>
              </div>
            </div>

            <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 mt-2">
              <h2 className="text-sm font-black text-[#0a3a2a] mb-3 pl-1">{t('settings.wizard.calendarTitle')}</h2>

              <div className="flex p-1 bg-gray-100 rounded-xl pointer-events-none mb-4">
                <button className="flex-1 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all text-gray-400">{t('settings.wizard.tournamentTab')}</button>
                <button className="flex-1 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all bg-emerald-100 text-emerald-700 shadow-md">{t('settings.wizard.otherTab')}</button>
              </div>
              
              <div className="space-y-3">
                <input type="text" placeholder={t('settings.wizard.privateNamePlaceholder')} className="w-full bg-gray-50 border border-gray-100 rounded-xl p-3 text-sm font-bold focus:outline-none focus:border-emerald-500" value={privateEventTitle} onChange={e => setPrivateEventTitle(e.target.value)} />
                
                <div className="space-y-2 mt-3">
                  <div className="flex gap-2 items-end">
                    <div className="flex-1 flex flex-col gap-1">
                      <input type="number" placeholder="DD" className="w-full bg-gray-50 border border-gray-100 rounded-xl p-3 text-center font-black text-lg focus:bg-emerald-50 focus:border-emerald-500 outline-none" value={pDay} onChange={e => setPDay(e.target.value.slice(0,2))} />
                      <span className="text-[8px] text-center font-bold text-gray-300 uppercase">{t('common.day')}</span>
                    </div>
                    <div className="flex-1 flex flex-col gap-1">
                      <input type="number" placeholder="MM" className="w-full bg-gray-50 border border-gray-100 rounded-xl p-3 text-center font-black text-lg focus:bg-emerald-50 focus:border-emerald-500 outline-none" value={pMonth} onChange={e => setPMonth(e.target.value.slice(0,2))} />
                      <span className="text-[8px] text-center font-bold text-gray-300 uppercase">{t('common.month')}</span>
                    </div>
                    <div className="flex-[1.5] flex flex-col gap-1">
                      <input type="number" placeholder="YYYY" className="w-full bg-gray-50 border border-gray-100 rounded-xl p-3 text-center font-black text-lg focus:bg-emerald-50 focus:border-emerald-500 outline-none" value={pYear} onChange={e => setPYear(e.target.value.slice(0,4))} />
                      <span className="text-[8px] text-center font-bold text-gray-300 uppercase">{t('common.year')}</span>
                    </div>
                    <div className="flex-[1.5] flex flex-col gap-1">
                      <input type="time" className="w-full bg-[#fed33e] border border-[#e5bd38] rounded-xl p-3 text-center font-black text-lg text-[#5d4a00] outline-none" value={privateEventTime} onChange={e => setPrivateEventTime(e.target.value)} />
                      <span className="text-[8px] text-center font-bold text-gray-400 uppercase">{t('common.hour')}</span>
                    </div>
                    <div className="flex flex-col gap-1 pb-4">
                      <button type="button" onClick={() => pDateRef.current?.click()} className="w-11 h-11 flex items-center justify-center bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-600 active:scale-95 transition-all">
                        <span className="material-symbols-outlined text-xl">calendar_today</span>
                      </button>
                      <input ref={pDateRef} type="date" className="sr-only" onChange={e => { if (e.target.value) { const [y,m,d] = e.target.value.split('-'); setPYear(y); setPMonth(m); setPDay(d); }}} />
                    </div>
                  </div>
                </div>
                
                <input type="text" placeholder={t('settings.wizard.shopPlaceholder')} className="w-full bg-gray-50 border border-gray-100 rounded-xl p-3 text-sm font-bold focus:outline-none focus:border-emerald-500" value={privateEventAddress} onChange={e => setPrivateEventAddress(e.target.value)} />
                
                <textarea maxLength={120} placeholder={t('settings.wizard.buyPlaceholder')} className="w-full bg-gray-50 border border-gray-100 rounded-xl p-3 text-sm font-bold h-16 resize-none focus:outline-none focus:border-emerald-500" value={privateEventNote} onChange={e => setPrivateEventNote(e.target.value)} />
              </div>
            </div>
          </div>
        )}

      </div>

      <div className="p-3 border-t border-gray-100 flex gap-2 shrink-0 bg-white pb-[max(1rem,env(safe-area-inset-bottom))]">
        {props.wizardStep > 1 && props.wizardStep < 6 && (
          <button onClick={() => props.setWizardStep(s => s - 1)} className="flex-1 py-3 rounded-xl font-black text-xs text-gray-500 bg-gray-100 active:scale-95 transition-all">{t('settings.wizard.btnBack')}</button>
        )}
        
        {props.wizardStep < 6 ? (
          <button onClick={handleWizardNext} disabled={props.wizardStep===1 && !props.firstName} className="flex-[2] py-3 rounded-xl font-black text-xs text-white bg-[#0a3a2a] shadow-md active:scale-95 transition-all disabled:opacity-50">{t('settings.wizard.btnNext')}</button>
        ) : null}

        {props.wizardStep === 6 && (
          <>
            <button onClick={() => props.setWizardStep(7)} className="flex-1 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest text-gray-500 bg-gray-100 active:scale-95 transition-all">{t('settings.wizard.btnSkip')}</button>
            <button onClick={handleAddTournamentAndNext} disabled={isSavingLocal || !tournamentTitle || !tDay || !tMonth || !tYear} className="flex-[2] py-3 rounded-xl font-black text-[10px] uppercase tracking-widest text-white bg-[#0a3a2a] shadow-md active:scale-95 transition-all disabled:opacity-50 disabled:active:scale-100">
              {t('settings.wizard.btnNext')}
            </button>
          </>
        )}

        {props.wizardStep === 7 && (
          <>
            <button
              onClick={() => props.setWizardStep(6)}
              className="flex-1 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest text-gray-500 bg-gray-100 active:scale-95 transition-all leading-tight"
            >
              {t('settings.wizard.btnBack')}
            </button>
            <button
              onClick={() => finishWizard(true)}
              disabled={isSavingLocal}
              className="flex-[2] py-3 rounded-xl font-black text-[10px] uppercase tracking-widest text-white bg-emerald-600 shadow-md shadow-emerald-500/30 active:scale-95 transition-all disabled:opacity-50 disabled:active:scale-100 leading-tight"
            >
              {isSavingLocal ? '...' : t('settings.wizard.btnSaveFinish')}
            </button>
          </>
        )}
      </div>

      <style>{`
        .animate-fade-in-up { animation: fadeInUp 0.4s ease-out forwards; }
        @keyframes fadeInUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
  
  return createPortal(wizardDOM, document.body);
}