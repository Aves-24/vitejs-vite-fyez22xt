import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { getRecommendation, BowType } from '../config/archeryRules';
import { useTranslation } from 'react-i18next'; // <--- DODANE

const MASTER_DISTANCES = ['18m', '20m', '25m', '30m', '35m', '40m', '50m', '60m', '70m', '90m'];

type ModalType = 'NONE' | 'NEW_YEAR' | 'BIRTHDAY';

interface SmartSeasonUpdaterProps {
  userId: string; // DODANE: Przypisanie do użytkownika
}

export default function SmartSeasonUpdater({ userId }: SmartSeasonUpdaterProps) {
  const { t } = useTranslation(); // <--- DODANE
  const [modalType, setModalType] = useState<ModalType>('NONE');
  const [userName, setUserName] = useState('');
  const [currentYearStr, setCurrentYearStr] = useState('');
  const [hasClassChanged, setHasClassChanged] = useState(false);

  useEffect(() => {
    // [ZMIANA] Nie sprawdzamy niczego, dopóki użytkownik nie jest zalogowany
    if (!userId) return;

    const checkEvents = async () => {
      try {
        console.log(`Trener AI: Rozpoczynam sprawdzanie zdarzeń dla użytkownika ${userId}...`);
        const today = new Date();
        const currentYear = today.getFullYear();
        const currentMonth = today.getMonth() + 1;
        const currentDay = today.getDate();

        // [ZMIANA] Pobieramy profil konkretnego użytkownika, a nie ogólny 'my_profile'
        const profileRef = doc(db, 'users', userId);
        const docSnap = await getDoc(profileRef);

        if (docSnap.exists()) {
          const data = docSnap.data();
          console.log("Trener AI: Pobrałem dane z bazy:", data);

          if (!data.birthDate) {
            console.log("Trener AI: Użytkownik nie ma zapisanej daty urodzenia. Kończę działanie.");
            return;
          }

          const firstName = data.firstName || 'Łuczniku';
          setUserName(firstName);
          setCurrentYearStr(currentYear.toString());

          // Rozbijamy datę YYYY-MM-DD
          const [bYearStr, bMonthStr, bDayStr] = data.birthDate.split('-');
          const bMonth = parseInt(bMonthStr, 10);
          const bDay = parseInt(bDayStr, 10);
          
          const isBirthdayToday = (bMonth === currentMonth && bDay === currentDay);
          console.log(`Trener AI: Urodziny dzisiaj? ${isBirthdayToday} (Baza: ${bDay}.${bMonth} | Dziś: ${currentDay}.${currentMonth})`);

          // 1. SPRAWDZAMY CZY TO NOWY ROK
          if (data.lastNewYearGreeting !== currentYear) {
            console.log("Trener AI: Wykryto nowy rok! Przeliczam dystanse...");
            
            const currentBow = (data.bowType || 'Klasyczny (Recurve)') as BowType;
            const currentGender = (data.gender || 'M') as 'M' | 'K';
            const birthYearNum = parseInt(bYearStr, 10) || 1990;

            const recHala = getRecommendation(currentBow, birthYearNum, 'Hala (Indoor)', currentGender);
            const recTory = getRecommendation(currentBow, birthYearNum, 'Tory (Outdoor)', currentGender);

            const updatedDistances = MASTER_DISTANCES.map(m => {
              const isRecommended = (m === recHala.distance) || (m === recTory.distance) || (m === '30m');
              let target = '122cm'; 
              if (m === '18m') target = recHala.targetType; 
              else if (m === recTory.distance) target = recTory.targetType; 
              else if (m === '30m') target = (currentBow === 'Bloczkowy (Compound)') ? '80cm (6-Ring)' : '80cm';
              else if (parseInt(m) <= 50 && currentBow === 'Bloczkowy (Compound)') target = '80cm (6-Ring)'; 

              return { m, active: isRecommended, targetType: target };
            });

            const oldDistancesStr = JSON.stringify(data.userDistances || []);
            const newDistancesStr = JSON.stringify(updatedDistances);
            const changed = oldDistancesStr !== newDistancesStr;
            
            setHasClassChanged(changed);

            await setDoc(profileRef, {
              userDistances: updatedDistances,
              lastNewYearGreeting: currentYear
            }, { merge: true });

            setModalType('NEW_YEAR');
            return; 
          }

          // 2. SPRAWDZAMY CZY TO URODZINY
          if (isBirthdayToday && data.lastBirthdayGreeting !== currentYear) {
            console.log("Trener AI: Wykryto dzisiejsze urodziny! Pokazuję tort.");
            await setDoc(profileRef, {
              lastBirthdayGreeting: currentYear
            }, { merge: true });

            setModalType('BIRTHDAY');
          } else {
             console.log("Trener AI: Brak nowych powiadomień lub wyświetlono je już w tym roku.");
          }
        } else {
          console.log("Trener AI: Brak profilu w bazie Firestore.");
        }
      } catch (error) {
        console.error("Trener AI: Wystąpił błąd krytyczny:", error);
      }
    };

    checkEvents();
  }, [userId]);

  if (modalType === 'NONE') return null;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[99999] flex items-center justify-center p-4 animate-fade-in">
      
      {modalType === 'NEW_YEAR' && (
        <div className="bg-gradient-to-br from-[#0a3a2a] to-emerald-900 rounded-[32px] p-8 w-full max-w-[400px] shadow-2xl relative flex flex-col items-center border border-emerald-700 text-center">
          <div className="absolute top-0 left-0 w-full h-full bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] opacity-20 pointer-events-none rounded-[32px]"></div>

          <div className="w-24 h-24 bg-emerald-500/20 rounded-full flex items-center justify-center mb-4 relative z-10 border border-emerald-400/30">
            <span className="material-symbols-outlined text-6xl text-emerald-400 drop-shadow-[0_0_15px_rgba(52,211,153,0.6)]">celebration</span>
          </div>

          <h2 className="text-2xl font-black text-white tracking-tight mb-2 relative z-10">
            {t('notifications.newYearTitle', { name: userName })}
          </h2>
          
          <div className="space-y-4 mb-8 relative z-10">
            <p className="text-sm text-emerald-100 leading-relaxed font-medium">
              {t('notifications.newYearMsg', { year: currentYearStr })}
            </p>
            
            <div className="bg-black/20 p-4 rounded-xl border border-black/10">
              {hasClassChanged ? (
                <p className="text-xs text-[#F2C94C] font-bold leading-relaxed">
                  <span className="material-symbols-outlined text-sm align-middle mr-1">update</span>
                  {t('notifications.classChanged')}
                </p>
              ) : (
                <p className="text-xs text-emerald-200 font-bold leading-relaxed">
                  <span className="material-symbols-outlined text-sm align-middle mr-1">task_alt</span>
                  {t('notifications.classSame')}
                </p>
              )}
            </div>
            <p className="text-[11px] text-white font-black uppercase tracking-widest pt-2 opacity-80">{t('notifications.newYearWish')}</p>
          </div>

          <button onClick={() => setModalType('NONE')} className="w-full py-4 bg-[#F2C94C] text-[#8B6508] rounded-2xl font-black text-sm uppercase tracking-widest shadow-xl shadow-yellow-500/20 active:scale-95 transition-all relative z-10">
            {t('notifications.newYearClose')}
          </button>
        </div>
      )}

      {modalType === 'BIRTHDAY' && (
        <div className="bg-gradient-to-br from-indigo-900 to-purple-900 rounded-[32px] p-8 w-full max-w-[400px] shadow-2xl relative flex flex-col items-center border border-indigo-700 text-center">
          <div className="absolute top-0 left-0 w-full h-full bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10 pointer-events-none rounded-[32px]"></div>

          <div className="w-24 h-24 bg-pink-500/20 rounded-full flex items-center justify-center mb-4 relative z-10 border border-pink-400/30">
            <span className="material-symbols-outlined text-6xl text-pink-400 drop-shadow-[0_0_15px_rgba(244,114,182,0.6)]">cake</span>
          </div>

          <h2 className="text-2xl font-black text-white tracking-tight mb-2 relative z-10">
            {t('notifications.birthdayTitle', { name: userName })}
          </h2>
          
          <div className="space-y-4 mb-8 relative z-10">
            <p className="text-sm text-indigo-100 leading-relaxed font-medium">
              {t('notifications.birthdayMsg')}
            </p>
            
            <div className="bg-black/20 p-4 rounded-xl border border-black/10">
              <p className="text-xs text-indigo-200 font-bold leading-relaxed">
                <span className="material-symbols-outlined text-sm align-middle mr-1">info</span>
                {t('notifications.birthdayInfo')}
              </p>
            </div>
          </div>

          <button onClick={() => setModalType('NONE')} className="w-full py-4 bg-pink-500 text-white rounded-2xl font-black text-sm uppercase tracking-widest shadow-xl shadow-pink-500/20 active:scale-95 transition-all relative z-10">
            {t('notifications.birthdayClose')}
          </button>
        </div>
      )}
      <style>{`.animate-fade-in { animation: fadeIn 0.5s ease-out forwards; } @keyframes fadeIn { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }`}</style>
    </div>
  );
}