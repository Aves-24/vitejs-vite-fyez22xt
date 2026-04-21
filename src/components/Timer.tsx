import React, { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next'; // <--- DODANE

interface TimerProps {
  isExpanded: boolean;
  onClose: () => void;
  playBeep: (f: number, d: number, delay?: number) => void;
  currentEnd: number;
  externalSeconds: number;
  setExternalSeconds: (s: number) => void;
  externalMode: 'IDLE' | 'PREP' | 'SHOOT' | 'FINISHED';
  setExternalMode: (m: 'IDLE' | 'PREP' | 'SHOOT' | 'FINISHED') => void;
  isTournament?: boolean; 
}

export default function Timer({ 
  isExpanded, onClose, playBeep, currentEnd, 
  externalSeconds, setExternalSeconds, externalMode, setExternalMode,
  isTournament = false
}: TimerProps) {
  const { t } = useTranslation(); // <--- DODANE
  const [maxTime, setMaxTime] = useState(120);
  const [activeGroup, setActiveGroup] = useState<'AB' | 'CD'>('AB'); 
  const wakeLockRef = useRef<any>(null); 

  const currentRound = currentEnd < 6 ? 1 : 2;
  const displayEnd = (currentEnd % 6) + 1;

  const requestWakeLock = async () => {
    try {
      if ('wakeLock' in navigator) {
        wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
      }
    } catch (err) { console.log("Wake Lock error:", err); }
  };

  const releaseWakeLock = () => {
    if (wakeLockRef.current) {
      wakeLockRef.current.release().catch(() => {});
      wakeLockRef.current = null;
    }
  };

  const start = (duration: number) => {
    requestWakeLock(); 
    setMaxTime(duration);
    setExternalMode('PREP');
    setExternalSeconds(10);
    // 2 sygnały - podejście do linii (początek czasu PREP)
    playBeep(800, 0.2, 0);
    playBeep(800, 0.2, 0.4);
  };

  const reset = () => {
    releaseWakeLock(); 
    setExternalMode('IDLE');
    setExternalSeconds(0);
    if (isTournament) setActiveGroup(prev => prev === 'AB' ? 'CD' : 'AB');
    onClose();
  };

  useEffect(() => {
    if (externalMode === 'IDLE' || externalMode === 'FINISHED') return;
    const i = setInterval(() => setExternalSeconds(externalSeconds > 0 ? externalSeconds - 1 : 0), 1000);
    return () => clearInterval(i);
  }, [externalMode, externalSeconds, setExternalSeconds]);

  useEffect(() => {
    if (externalMode === 'IDLE' || externalMode === 'FINISHED') return;
    
    if (externalSeconds > 0) {
      // Pikanie przy ostatnich 10 sekundach strzelania (SHOOT)
      if (externalMode === 'SHOOT' && externalSeconds <= 10) {
         playBeep(600, 0.1, 0); 
      } 
      // Pikanie co sekundę w czasie przygotowania (PREP). 
      else if (externalMode === 'PREP' && externalSeconds < 10) {
         playBeep(600, 0.1, 0);
      }
    }
    
    if (externalSeconds === 0) {
      if (externalMode === 'PREP') {
        setExternalMode('SHOOT');
        setExternalSeconds(maxTime);
        // 1 sygnał - start strzelania
        playBeep(1000, 0.6, 0);
      } else if (externalMode === 'SHOOT') {
        setExternalMode('FINISHED');
        // 3 sygnały - koniec strzelania
        playBeep(800, 0.3, 0);
        playBeep(800, 0.3, 0.5);
        playBeep(800, 0.7, 1.0);
        setTimeout(() => { reset(); }, 3000);
      }
    }
  }, [externalSeconds, externalMode, maxTime, playBeep, setExternalMode, setExternalSeconds]);

  if (!isExpanded || typeof document === 'undefined') return null;

  const getTheme = () => {
    switch(externalMode) {
      case 'PREP': return { bg: 'bg-[#fed33e]', text: 'text-[#5d4a00]' };
      case 'SHOOT': return { bg: 'bg-emerald-500', text: 'text-white' };
      case 'FINISHED': return { bg: 'bg-red-600', text: 'text-white' };
      default: return { bg: 'bg-white', text: 'text-[#012d1d]' };
    }
  };

  const theme = getTheme();

  // Funkcja pomocnicza do tłumaczenia trybu
  const getModeLabel = () => {
    if (externalMode === 'IDLE') return t('timer.ready');
    if (externalMode === 'PREP') return t('timer.prep');
    if (externalMode === 'SHOOT') return t('timer.shoot');
    if (externalMode === 'FINISHED') return t('timer.finished');
    return externalMode;
  };

  return createPortal(
    <div className={`fixed inset-0 z-[100000] ${theme.bg} flex flex-col items-center justify-between py-16 px-6 transition-colors duration-500 max-w-md mx-auto shadow-2xl`}>
      
      {/* HEADER TIMERA */}
      <div className="w-full flex justify-between items-center opacity-60 px-2 shrink-0">
        <div className={`flex items-center font-manrope font-extrabold uppercase tracking-widest text-xs ${theme.text}`}>
          <span className="material-symbols-outlined text-base mr-2">timer_3</span>
          {getModeLabel()}
        </div>
        <button onClick={onClose} className={`flex items-center gap-1 font-manrope font-extrabold uppercase text-xs ${theme.text} active:scale-90 transition-all`}>
          {t('timer.collapse')} <span className="material-symbols-outlined text-base ml-1">expand_circle_up</span>
        </button>
      </div>

      {/* ŚRODEK (LICZBA) */}
      <div className="flex flex-col items-center justify-center w-full relative flex-1">
        {isTournament && (
           <div className={`absolute top-0 font-manrope font-black text-5xl tracking-widest ${theme.text} transition-all`}>
             <span className={`transition-opacity duration-300 ${activeGroup === 'AB' ? 'opacity-100' : 'opacity-20'}`}>AB</span>
             <span className="opacity-20 mx-3">/</span>
             <span className={`transition-opacity duration-300 ${activeGroup === 'CD' ? 'opacity-100' : 'opacity-20'}`}>CD</span>
           </div>
        )}

        <div className={`mb-2 font-manrope font-black uppercase tracking-[0.3em] text-[11px] ${theme.text} opacity-60`}>
          {t('timer.round')} {currentRound} — {t('timer.end')} {displayEnd}
        </div>
        <span className={`text-[160px] font-manrope font-black leading-none tracking-tighter ${theme.text}`}>
          {externalSeconds > 0 ? externalSeconds : (externalMode === 'IDLE' ? maxTime : '0')}
        </span>
        <span className={`font-manrope font-bold uppercase tracking-[0.2em] text-lg ${theme.text} opacity-30 mt-4`}>
          {t('timer.seconds')}
        </span>
      </div>

      {/* PRZYCISKI - na dole */}
      <div className="w-full space-y-4 max-w-[400px] shrink-0">
        {externalMode === 'IDLE' ? (
          <div className="flex gap-4">
            <button onClick={() => start(120)} className="flex-1 py-5 bg-[#fed33e] rounded-2xl font-manrope font-black text-2xl text-[#5d4a00] shadow-sm active:scale-95 transition-all uppercase border-b-4 border-[#e5bd38]">120s</button>
            <button onClick={() => start(240)} className="flex-1 py-5 bg-[#fed33e] rounded-2xl font-manrope font-black text-2xl text-[#5d4a00] shadow-sm active:scale-95 transition-all uppercase border-b-4 border-[#e5bd38]">240s</button>
          </div>
        ) : (
          <button onClick={reset} className="w-full py-5 bg-white/20 backdrop-blur border border-white/30 text-white rounded-2xl font-manrope font-black text-2xl shadow-sm active:scale-95 transition-all">
            {t('timer.stop')}
          </button>
        )}
      </div>
    </div>,
    document.body
  );
}