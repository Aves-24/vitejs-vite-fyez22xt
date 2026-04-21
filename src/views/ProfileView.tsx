import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { useTranslation } from 'react-i18next'; // <--- DODANE

interface ProfileViewProps {
  userId: string; // Unikalne ID użytkownika
}

export default function ProfileView({ userId }: ProfileViewProps) {
  const { t } = useTranslation(); // <--- DODANE
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Stany formularza
  const [age, setAge] = useState<number | ''>('');
  const [height, setHeight] = useState<number | ''>('');
  const [drawLength, setDrawLength] = useState<number | ''>(''); // Długość naciągu
  const [handedness, setHandedness] = useState<'RH' | 'LH'>('RH'); // Praworęczny / Leworęczny
  const [bowType, setBowType] = useState('Recurve'); // Zmieniono na klucz techniczny
  const [lbs, setLbs] = useState(32); // Siła naciągu
  const [experience, setExperience] = useState(3); // Lata doświadczenia

  // Przykładowe dane do wyboru w kółeczkach
  const lbsOptions = [20, 22, 24, 26, 28, 30, 32, 34, 36, 38, 40, 42, 44, 46, 48, 50, 55, 60];
  const experienceOptions = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 15, 20];
  
  // Mapowanie technicznych kluczy na przetłumaczone nazwy łuków
  const bowOptions = [
    { id: 'Recurve', label: t('rules.bow_recurve') },
    { id: 'Compound', label: t('rules.bow_compound') },
    { id: 'Barebow', label: t('rules.bow_barebow') },
    { id: 'Traditional', label: t('rules.bow_trad') }
  ];

  // Wczytywanie profilu z Firebase
  useEffect(() => {
    const fetchProfile = async () => {
      if (!userId) return; 
      try {
        const docRef = doc(db, 'users', userId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          if (data.age) setAge(data.age);
          if (data.height) setHeight(data.height);
          if (data.drawLength) setDrawLength(data.drawLength);
          if (data.handedness) setHandedness(data.handedness);
          if (data.bowType) setBowType(data.bowType);
          if (data.lbs) setLbs(data.lbs);
          if (data.experience) setExperience(data.experience);
        }
      } catch (error) {
        console.error("Błąd wczytywania profilu:", error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchProfile();
  }, [userId, t]);

  // Zapisywanie profilu
  const saveProfile = async () => {
    if (!userId) return;
    setIsSaving(true);
    try {
      await setDoc(doc(db, 'users', userId), {
        age, height, drawLength, handedness, bowType, lbs, experience
      }, { merge: true });
      
      setTimeout(() => setIsSaving(false), 800); 
    } catch (error) {
      console.error("Błąd zapisu:", error);
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return <div className="p-6 text-center text-gray-400 mt-20 animate-pulse font-black uppercase tracking-widest text-xs">{t('profile.loading')}</div>;
  }

  return (
    <div className="space-y-4 pb-24 pt-[env(safe-area-inset-top)] px-2 max-w-md mx-auto">
      
      {/* NAGŁÓWEK */}
      <div className="bg-[#0a3a2a] p-5 rounded-2xl shadow-md text-white mt-2 relative overflow-hidden">
        <div className="absolute -right-4 -bottom-6 opacity-10">
          <span className="material-symbols-outlined text-[120px]">person</span>
        </div>
        <h1 className="text-2xl font-black tracking-wider z-10 relative">{t('profile.title')}</h1>
        <p className="text-[10px] text-emerald-300 uppercase tracking-widest font-bold z-10 relative">{t('profile.subtitle')}</p>
      </div>

      {/* SEKCJA 1: Ciało i Doświadczenie */}
      <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 space-y-4">
        <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-1 border-b border-gray-50 pb-2">
          <span className="material-symbols-outlined text-[14px]">accessibility_new</span> {t('profile.biometryTitle')}
        </h3>
        
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-[9px] font-bold text-[#0a3a2a] uppercase ml-1">{t('profile.age')}</label>
            <input type="number" value={age} onChange={(e) => setAge(Number(e.target.value) || '')} placeholder={t('profile.placeholderAge')} className="bg-gray-50 border border-gray-200 rounded-xl p-3 text-sm font-bold text-center focus:outline-none focus:border-emerald-500 transition-colors" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[9px] font-bold text-[#0a3a2a] uppercase ml-1">{t('profile.height')}</label>
            <input type="number" value={height} onChange={(e) => setHeight(Number(e.target.value) || '')} placeholder={t('profile.placeholderHeight')} className="bg-gray-50 border border-gray-200 rounded-xl p-3 text-sm font-bold text-center focus:outline-none focus:border-emerald-500 transition-colors" />
          </div>
        </div>

        <div className="flex gap-2">
          <button onClick={() => setHandedness('RH')} className={`flex-1 py-3 rounded-xl font-bold text-xs border transition-all ${handedness === 'RH' ? 'bg-[#0a3a2a] text-white border-[#0a3a2a] shadow-md' : 'bg-white text-gray-500 border-gray-200'}`}>{t('profile.handednessRH')}</button>
          <button onClick={() => setHandedness('LH')} className={`flex-1 py-3 rounded-xl font-bold text-xs border transition-all ${handedness === 'LH' ? 'bg-[#0a3a2a] text-white border-[#0a3a2a] shadow-md' : 'bg-white text-gray-500 border-gray-200'}`}>{t('profile.handednessLH')}</button>
        </div>

        <div className="flex flex-col gap-2 pt-2">
          <label className="text-[9px] font-bold text-[#0a3a2a] uppercase ml-1">{t('profile.experience')}</label>
          <div className="flex overflow-x-auto pb-2 gap-2 hide-scrollbar">
            {experienceOptions.map(exp => (
              <button key={exp} onClick={() => setExperience(exp)} className={`w-12 h-12 shrink-0 rounded-full flex items-center justify-center font-black text-sm border-2 transition-all ${experience === exp ? 'bg-[#fed33e] text-[#5d4a00] border-[#e5bd38] scale-110 shadow-sm' : 'bg-white text-gray-400 border-gray-100 hover:border-gray-200'}`}>
                {exp}{exp === 20 ? '+' : ''}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* SEKCJA 2: Sprzęt */}
      <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 space-y-4">
        <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-1 border-b border-gray-50 pb-2">
          <span className="material-symbols-outlined text-[14px]">sports_martial_arts</span> {t('profile.equipmentTitle')}
        </h3>
        
        <div className="grid grid-cols-2 gap-2">
          {bowOptions.map(bow => (
            <button key={bow.id} onClick={() => setBowType(bow.id)} className={`py-3 rounded-xl font-bold text-[11px] border transition-all ${bowType === bow.id ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-gray-50 text-gray-400 border-gray-100'}`}>
              {bow.label}
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-2 pt-2">
          <div className="flex justify-between items-end ml-1">
            <label className="text-[9px] font-bold text-[#0a3a2a] uppercase">{t('profile.drawWeight')}</label>
            <span className="text-xl font-black text-emerald-600">{lbs} <span className="text-[10px] text-gray-400">lbs</span></span>
          </div>
          <div className="flex overflow-x-auto pb-2 gap-2 hide-scrollbar snap-x">
            {lbsOptions.map(val => (
              <button key={val} onClick={() => setLbs(val)} className={`w-12 h-12 shrink-0 snap-center rounded-full flex items-center justify-center font-black text-sm border-2 transition-all ${lbs === val ? 'bg-[#0a3a2a] text-white border-[#0a3a2a] scale-110 shadow-md' : 'bg-white text-gray-400 border-gray-100 hover:border-gray-200'}`}>
                {val}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-1 pt-2">
          <label className="text-[11px] font-bold text-[#0a3a2a] uppercase ml-1">{t('profile.drawLength')}</label>
          <input type="number" step="0.5" value={drawLength} onChange={(e) => setDrawLength(Number(e.target.value) || '')} placeholder={t('profile.placeholderDraw')} className="bg-gray-50 border border-gray-200 rounded-xl p-3 text-sm font-bold text-center focus:outline-none focus:border-emerald-500 transition-colors" />
        </div>
      </div>

      {/* SEKCJA 3: Wizytówka Trenera */}
      <div className="bg-gradient-to-r from-gray-900 to-[#0a3a2a] p-1 rounded-2xl shadow-sm">
        <div className="bg-black/20 rounded-xl p-4 flex gap-4 items-center backdrop-blur-sm">
          <div className="w-14 h-14 rounded-full bg-emerald-500/20 border-2 border-emerald-500 flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-emerald-400 text-3xl">smart_toy</span>
          </div>
          <div>
            <h4 className="text-white font-black text-sm flex items-center gap-1">{t('profile.coachName')} <span className="material-symbols-outlined text-[12px] text-blue-400" title={t('profile.coachVerified')}>verified</span></h4>
            <p className="text-emerald-100/70 text-[10px] font-medium leading-tight mt-1">{t('profile.coachDesc')}</p>
          </div>
        </div>
      </div>

      <button onClick={saveProfile} disabled={isSaving} className={`w-full py-4 rounded-xl font-black text-xs uppercase tracking-wider shadow-md active:scale-95 transition-all flex items-center justify-center gap-2 ${isSaving ? 'bg-emerald-600 text-white' : 'bg-[#fed33e] text-[#5d4a00]'}`}>
        {isSaving ? (
          <><span className="material-symbols-outlined animate-spin text-sm">sync</span> {t('profile.saving')}</>
        ) : (
          <><span className="material-symbols-outlined text-sm">save</span> {t('profile.saveBtn')}</>
        )}
      </button>

      <style>{`
        .hide-scrollbar::-webkit-scrollbar { display: none; }
        .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </div>
  );
}