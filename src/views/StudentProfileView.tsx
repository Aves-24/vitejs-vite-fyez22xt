import React, { useState, useEffect, useRef } from 'react';
import { db } from '../firebase';
import { doc, getDoc, collection, query, where, orderBy, limit, getDocs, updateDoc } from 'firebase/firestore';
import { useTranslation } from 'react-i18next';
import { createPortal } from 'react-dom';
import StatsView from './StatsView';
import QuickStatsModal from '../components/QuickStatsModal';
import CoachLogPanel from '../components/CoachLogPanel';
import { useVoiceInput } from '../hooks/useVoiceInput';

function spCacheGet<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch { return null; }
}

function spCacheSet(key: string, data: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch { /* ignore */ }
}

// --- FUNKCJA POMOCNICZA DO OBLICZANIA TRAFIEŃ ---
const calculateHits = (ends: any[]) => {
  let x = 0, ten = 0, nine = 0;
  if (!ends) return { x, ten, nine };
  ends.forEach(end => {
    end.arrows?.forEach((a: string) => {
      if (a === 'X') { x++; ten++; }
      else if (a === '10') ten++;
      else if (a === '9') nine++;
    });
  });
  return { x, ten, nine };
};

// --- MIKRO-KOMPONENT NOTATKI TRENERA W SESJI ---
function CoachNoteModule({ session, studentId, onSaveSuccess }: { session: any, studentId: string, onSaveSuccess: (note: string, editCount: number) => void }) {
  const { t } = useTranslation();
  const edits = session.coachEditCount || 0;
  const canEdit = edits < 2;

  const [isEditing, setIsEditing] = useState(!session.coachNote && canEdit);
  const [text, setText] = useState(session.coachNote || '');
  const [isSaving, setIsSaving] = useState(false);
  const voice = useVoiceInput({
    onResult: (result) => setText((prev: string) => (prev + ' ' + result).trim().slice(0, 100)),
    append: true,
  });

  useEffect(() => {
    setText(session.coachNote || '');
    setIsEditing(!session.coachNote && (session.coachEditCount || 0) < 2);
  }, [session.id, session.coachNote, session.coachEditCount]);

  const handleSave = async () => {
    const cleanText = text.trim().slice(0, 100);
    if (!cleanText && !session.coachNote) { 
      setIsEditing(false); 
      return; 
    }
    
    setIsSaving(true);
    try {
      const newEditCount = edits + 1;
      await updateDoc(doc(db, `users/${studentId}/sessions`, session.id), {
        coachNote: cleanText,
        coachEditCount: newEditCount
      });
      setIsEditing(false); 
      onSaveSuccess(cleanText, newEditCount);
    } catch (e) {
      console.error("Błąd zapisu notatki", e);
    }
    setIsSaving(false);
  };

  return (
    <div className="bg-blue-50/50 border border-blue-100 rounded-xl p-3 relative mt-2">
       <div className="flex justify-between items-center mb-1.5">
         <span className="text-[9px] font-black text-blue-700 uppercase tracking-widest flex items-center gap-1">
            <span className="material-symbols-outlined text-[14px]">sports</span>
            {t('studentProfile.coachNoteLabel')} {canEdit && !isEditing ? t('studentProfile.coachNoteEdits', { count: 2 - edits }) : ''}
         </span>
         {canEdit && !isEditing && (
           <button onClick={() => setIsEditing(true)} className="text-blue-500 hover:text-blue-600 active:scale-90 bg-blue-100 p-1 rounded transition-colors">
             <span className="material-symbols-outlined text-[14px]">edit</span>
           </button>
         )}
       </div>
       
       {isEditing ? (
         <div className="flex flex-col gap-1.5 mt-1">
           <div className="relative">
             <textarea
               value={text}
               onChange={e => setText(e.target.value.slice(0, 100))}
               maxLength={100}
               className="w-full bg-white border border-blue-200 rounded-lg p-2 text-[11px] font-bold text-[#333] outline-none focus:border-blue-500 resize-none h-16 leading-tight pr-10"
               placeholder={t('studentProfile.coachNotePlaceholder')}
             />
             {voice.isSupported && (
               <button
                 onClick={voice.isListening ? voice.stopListening : () => voice.startListening()}
                 className={`absolute right-1.5 top-1.5 p-1.5 rounded transition-all ${
                   voice.isListening
                     ? 'bg-red-500 text-white scale-105 animate-pulse'
                     : 'bg-[#fed33e] text-[#0a3a2a] hover:shadow-md active:scale-95'
                 }`}
                 title={voice.isListening ? 'Stop recording' : 'Record voice'}
               >
                 <span className="material-symbols-outlined text-[14px]">
                   {voice.isListening ? 'mic' : 'mic_none'}
                 </span>
               </button>
             )}
           </div>
           <div className="flex justify-between items-center mt-1">
             <div className="flex items-center gap-2">
               <span className="text-[9px] font-bold text-blue-400/70">{text.length}/100</span>
               {voice.error && <span className="text-[8px] font-bold text-red-500">{voice.error}</span>}
             </div>
             <div className="flex gap-2">
                {session.coachNote && (
                  <button onClick={() => { setIsEditing(false); setText(session.coachNote); }} className="text-[9px] font-black text-gray-400 uppercase tracking-widest px-2">{t('studentProfile.coachNoteCancel')}</button>
                )}
                <button
                  onClick={handleSave}
                  disabled={isSaving || !text.trim()}
                  className="text-[9px] font-black bg-blue-600 text-white px-4 py-1.5 rounded-lg shadow-sm uppercase tracking-widest disabled:opacity-50 active:scale-95 transition-all"
                >
                  {isSaving ? t('studentProfile.coachNoteSaving') : t('studentProfile.coachNoteSave')}
                </button>
             </div>
           </div>
         </div>
       ) : (
         <p className="text-[11px] text-[#0a3a2a] font-bold italic leading-snug">
           {session.coachNote ? `"${session.coachNote}"` : <span className="text-blue-600/50 font-medium">{t('studentProfile.coachNoteEmpty')}</span>}
         </p>
       )}
    </div>
  );
}

// --- MIKRO-KOMPONENT POUFNEJ NOTATKI (Teraz 3 sekcje x 200 znaków!) ---
function PrivateNoteModal({ coachId, studentId, initialNotes, onClose, onSaveSuccess }: any) {
  const { t } = useTranslation();
  const [notes, setNotes] = useState<string[]>(initialNotes || ['', '', '']);
  const [isSaving, setIsSaving] = useState(false);
  const [recordingNoteIndex, setRecordingNoteIndex] = useState<number | null>(null);
  const voice = useVoiceInput({
    onResult: (result) => {
      if (recordingNoteIndex !== null) {
        setNotes(prev => {
          const newNotes = [...prev];
          newNotes[recordingNoteIndex] = (newNotes[recordingNoteIndex] + ' ' + result).trim().slice(0, 200);
          return newNotes;
        });
      }
    },
    append: true,
  });

  const labels = [
    { title: t('studentProfile.privateNoteLabel0'), icon: 'flag' },
    { title: t('studentProfile.privateNoteLabel1'), icon: 'model_training' },
    { title: t('studentProfile.privateNoteLabel2'), icon: 'notes' }
  ];

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const cleanNotes = notes.map(n => n.trim().slice(0, 200));
      await updateDoc(doc(db, 'users', coachId), {
        [`privateStudentNotes.${studentId}`]: cleanNotes
      });
      onSaveSuccess(cleanNotes);
      onClose(); // Automatycznie zamyka modal po udanym zapisie
    } catch(e) {
      console.error("Błąd zapisu prywatnej notatki:", e);
    }
    setIsSaving(false);
  };

  return createPortal(
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[500000] flex items-center justify-center p-4 animate-fade-in" onClick={onClose}>
       <div className="bg-white rounded-[32px] p-6 w-full max-w-[400px] shadow-2xl relative max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
         <button onClick={onClose} className="absolute top-5 right-5 p-2 bg-gray-100 rounded-full active:scale-90 transition-all">
           <span className="material-symbols-outlined">close</span>
         </button>
         
         <div className="flex items-center gap-3 mb-2 mt-2 shrink-0">
           <div className="w-10 h-10 rounded-full bg-yellow-50 flex items-center justify-center shrink-0">
             <span className="material-symbols-outlined text-yellow-600">lock</span>
           </div>
           <div>
             <h2 className="text-xl font-black text-[#0a3a2a] leading-none">{t('studentProfile.privateNoteTitle')}</h2>
             <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">{t('studentProfile.privateNoteSubtitle')}</p>
           </div>
         </div>
         <p className="text-[10px] text-gray-500 font-medium mb-4 leading-tight shrink-0">{t('studentProfile.privateNoteDesc')}</p>
         
         <div className="overflow-y-auto flex-1 space-y-3 pr-2 pb-4 hide-scrollbar">
            {notes.map((text, idx) => (
               <div key={idx} className="bg-gray-50 border border-gray-100 rounded-xl p-3">
                 <div className="flex justify-between items-center mb-2">
                   <span className="text-[10px] font-black text-[#0a3a2a] uppercase tracking-widest flex items-center gap-1.5">
                     <span className="material-symbols-outlined text-[14px] text-yellow-600">{labels[idx].icon}</span>
                     {labels[idx].title}
                   </span>
                   <span className={`text-[9px] font-bold ${text.length >= 200 ? 'text-red-500' : 'text-gray-400'}`}>{text.length}/200</span>
                 </div>
                 <div className="relative">
                   <textarea
                     value={text}
                     onChange={e => {
                       const newNotes = [...notes];
                       newNotes[idx] = e.target.value.slice(0, 200);
                       setNotes(newNotes);
                     }}
                     placeholder={t('studentProfile.privateNotePlaceholder')}
                     className="w-full bg-white border border-gray-200 rounded-lg p-2.5 text-[11px] font-bold text-[#333] outline-none focus:border-yellow-500 resize-none h-[72px] pr-9"
                     maxLength={200}
                   />
                   {voice.isSupported && (
                     <button
                       onClick={() => {
                         setRecordingNoteIndex(recordingNoteIndex === idx ? null : idx);
                         if (recordingNoteIndex !== idx) {
                           voice.startListening();
                         } else {
                           voice.stopListening();
                         }
                       }}
                       className={`absolute right-1.5 top-1.5 p-1.5 rounded transition-all ${
                         recordingNoteIndex === idx && voice.isListening
                           ? 'bg-red-500 text-white scale-105 animate-pulse'
                           : 'bg-[#fed33e] text-[#0a3a2a] hover:shadow-md active:scale-95'
                       }`}
                       title={recordingNoteIndex === idx && voice.isListening ? 'Stop recording' : 'Record voice'}
                     >
                       <span className="material-symbols-outlined text-[14px]">
                         {recordingNoteIndex === idx && voice.isListening ? 'mic' : 'mic_none'}
                       </span>
                     </button>
                   )}
                 </div>
               </div>
            ))}
         </div>

         <div className="pt-2 shrink-0">
           <button
             onClick={handleSave}
             disabled={isSaving}
             className="w-full bg-[#0a3a2a] text-[#fed33e] px-5 py-4 rounded-xl text-[11px] font-black uppercase tracking-widest active:scale-95 transition-all shadow-md disabled:opacity-50"
           >
             {isSaving ? t('studentProfile.privateNoteSaving') : t('studentProfile.privateNoteSave')}
           </button>
         </div>
       </div>
    </div>, document.body
  );
}

interface StudentProfileViewProps {
  coachId: string;
  studentId: string;
  onNavigate: (view: string, tab?: string, extraData?: string, sId?: string) => void;
}

export default function StudentProfileView({ coachId, studentId, onNavigate }: StudentProfileViewProps) {
  const { t, i18n } = useTranslation();
  
  const [student, setStudent] = useState<any | null>(null);
  const [upcomingTournaments, setUpcomingTournaments] = useState<any[]>([]); 
  
  const [recentSessions, setRecentSessions] = useState<any[]>([]);
  const [currentSessionIndex, setCurrentSessionIndex] = useState(0);
  
  const [dailyArrows, setDailyArrows] = useState(0);
  const [monthlyArrows, setMonthlyArrows] = useState(0);
  const [yearlyArrows, setYearlyArrows] = useState(0);
  const [avg14Days, setAvg14Days] = useState('0.0');
  const [sparkline, setSparkline] = useState<number[]>([]);

  const [isQuickStatsOpen, setIsQuickStatsOpen] = useState(false);
  const [quickStatsTab, setQuickStatsTab] = useState<'ARROWS' | 'POINTS'>('ARROWS');
  
  const sessionSectionRef = useRef<HTMLDivElement>(null);
  const [isNotesExpanded, setIsNotesExpanded] = useState(false);
  const [showTournamentsModal, setShowTournamentsModal] = useState(false);

  // [ZMIANA] Stany dla nowej, wielopolowej notatki
  const [privateNotes, setPrivateNotes] = useState<string[]>(['', '', '']);
  const [showPrivateNoteModal, setShowPrivateNoteModal] = useState(false);
  const [showHardwareModal, setShowHardwareModal] = useState(false);

  // TABS
  const [activeTab, setActiveTab] = useState<'overview' | 'diary' | 'analytics'>('overview');

  // TREND MODAL
  const [showTrendModal, setShowTrendModal] = useState(false);

  useEffect(() => {
    const fetchStudentData = async () => {
      if (!studentId) return;

      // Zawsze pobieramy profil ucznia — 1 odczyt, potrzebny i tak
      const studentDoc = await getDoc(doc(db, 'users', studentId));
      const studentData = studentDoc.exists() ? studentDoc.data() : null;
      if (studentData) setStudent(studentData);

      // lastSessionTimestamp jako klucz świeżości danych
      const rawTs = studentData?.lastSessionTimestamp;
      const lastTs: number = rawTs?.toMillis ? rawTs.toMillis() : (rawTs?.seconds ? rawTs.seconds * 1000 : (rawTs || 0));

      const cacheKey = `grotX_studentProfile_${studentId}`;
      const cached = spCacheGet<any>(cacheKey);

      if (cached && cached.lastSessionTimestamp === lastTs) {
        // Nic się nie zmieniło — używamy cache, 0 dodatkowych odczytów
        setUpcomingTournaments(cached.tournaments);
        setRecentSessions(cached.recentSessions);
        setSparkline(cached.sparkline);
        setDailyArrows(cached.dailyArrows);
        setMonthlyArrows(cached.monthlyArrows);
        setYearlyArrows(cached.yearlyArrows);
        setAvg14Days(cached.avg14Days);
        return;
      }

      // Nowa aktywność lub brak cache — pełny fetch
      const today = new Date().toISOString().split('T')[0];
      const snapTourney = await getDocs(query(collection(db, `users/${studentId}/tournaments`), where('date', '>=', today), orderBy('date', 'asc')));
      const tournaments = snapTourney.docs.map(d => ({ id: d.id, ...d.data() })).filter((e: any) => e.category === 'Turniej' || !e.category);
      setUpcomingTournaments(tournaments);

      const now = new Date();
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
      const startOfYear = new Date(now.getFullYear(), 0, 1).getTime();
      const fourteenDaysAgo = now.getTime() - 14 * 24 * 60 * 60 * 1000;

      const snap = await getDocs(query(collection(db, `users/${studentId}/sessions`), orderBy('timestamp', 'desc'), limit(15)));

      let recentSessions: any[] = [], sparkline: number[] = [];
      let dayTotal = 0, monthTotal = 0, yearTotal = 0, tScore14 = 0, tArrows14 = 0;

      if (!snap.empty) {
        const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        const nonTech = all.filter((s: any) => s.type !== 'TECHNICAL');
        recentSessions = nonTech.slice(0, 3);
        sparkline = nonTech.slice(0, 5).reverse().filter((s: any) => s.arrows > 0).map((s: any) => s.score);
        all.forEach((s: any) => {
          const ts: number = s.timestamp?.toMillis ? s.timestamp.toMillis() : (s.timestamp || 0);
          const arrows = s.arrows || 0;
          if (ts >= startOfDay)   dayTotal   += arrows;
          if (ts >= startOfMonth) monthTotal += arrows;
          if (ts >= startOfYear)  yearTotal  += arrows;
          if (ts >= fourteenDaysAgo && s.type !== 'TECHNICAL') { tScore14 += (s.score || 0); tArrows14 += arrows; }
        });
      }

      const avg14Days = tArrows14 > 0 ? (tScore14 / tArrows14).toFixed(1) : '0.0';
      setRecentSessions(recentSessions);
      setSparkline(sparkline);
      setDailyArrows(dayTotal);
      setMonthlyArrows(monthTotal);
      setYearlyArrows(yearTotal);
      setAvg14Days(avg14Days);

      spCacheSet(cacheKey, { lastSessionTimestamp: lastTs, tournaments, recentSessions, sparkline, dailyArrows: dayTotal, monthlyArrows: monthTotal, yearlyArrows: yearTotal, avg14Days });
    };

    fetchStudentData();
  }, [studentId]);

  useEffect(() => {
    const fetchPrivateNote = async () => {
      if (!coachId || !studentId) return;
      const cDoc = await getDoc(doc(db, 'users', coachId));
      if (cDoc.exists()) {
        const notes = cDoc.data().privateStudentNotes || {};
        const studentNoteData = notes[studentId];
        
        // Kompatybilność wsteczna - jeśli stara notatka była pojedynczym stringiem
        if (Array.isArray(studentNoteData)) {
          setPrivateNotes([studentNoteData[0] || '', studentNoteData[1] || '', studentNoteData[2] || '']);
        } else if (typeof studentNoteData === 'string') {
          setPrivateNotes([studentNoteData, '', '']);
        } else {
          setPrivateNotes(['', '', '']);
        }
      }
    };
    fetchPrivateNote();
  }, [coachId, studentId]);

  const getDaysUntil = (dateStr: string) => {
    const diff = new Date(dateStr).getTime() - new Date().getTime();
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
    if (days <= 0) return t('studentProfile.today');
    if (days === 1) return t('studentProfile.tomorrow');
    return t('studentProfile.inDays', { count: days });
  };

  const handleUpdateSessionNote = (newNote: string, editCount: number) => {
    const updatedSessions = [...recentSessions];
    updatedSessions[currentSessionIndex].coachNote = newNote;
    updatedSessions[currentSessionIndex].coachEditCount = editCount;
    setRecentSessions(updatedSessions);
  };

  if (!student) return <div className="p-10 text-center">{t('studentProfile.loading')}</div>;

  const nextTournament = upcomingTournaments.length > 0 ? upcomingTournaments[0] : null;
  const additionalTournamentsCount = upcomingTournaments.length - 1;

  const currentSession = recentSessions.length > 0 ? recentSessions[currentSessionIndex] : null;
  const sessionHits = currentSession ? calculateHits(currentSession.ends) : { x: 0, ten: 0, nine: 0 };
  const sessionAvg = currentSession && currentSession.arrows > 0 ? (currentSession.score / currentSession.arrows).toFixed(2) : '0.00';

  const hasAnyPrivateNote = privateNotes.some(n => n.trim().length > 0);

  return (
    <div className="flex flex-col min-h-screen bg-[#fcfdfe] relative overflow-x-hidden">
      
      {/* HEADER TRENERA */}
      <div className="bg-gradient-to-b from-[#0a3a2a] to-[#0d4a36] pt-[calc(env(safe-area-inset-top)+1rem)] pb-5 px-5 rounded-b-[36px] shadow-xl shadow-[#0a3a2a]/20 relative z-20 shrink-0">
        <div className="flex items-center gap-4 mb-2">
          <button onClick={() => onNavigate('COACH')} className="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center text-white hover:bg-white/20 transition-all active:scale-90 shrink-0">
            <span className="material-symbols-outlined">arrow_back</span>
          </button>
          
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">{t('studentProfile.headerLabel')}</p>
            <h1 className="text-2xl font-black text-white leading-tight truncate">{student.firstName} {student.lastName}</h1>
          </div>
          
          {/* PRZYCISKI PO PRAWEJ STRONIE (Sprzęt i Notatka) */}
          <div className="flex gap-2 shrink-0">
            <button onClick={() => setShowHardwareModal(true)} className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center text-white shadow-sm active:scale-90 transition-all border border-white/10">
              <span className="material-symbols-outlined text-2xl">build</span>
            </button>

            <button onClick={() => setShowPrivateNoteModal(true)} className="w-12 h-12 bg-[#fed33e] rounded-2xl flex items-center justify-center text-[#0a3a2a] shadow-sm active:scale-90 transition-all relative">
              <span className="material-symbols-outlined text-3xl">person</span>
              {hasAnyPrivateNote && <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-red-500 rounded-full border-2 border-white"></span>}
            </button>
          </div>
        </div>

        {/* STATYSTYKI — rząd 1: 3 kafelki */}
        <div className="flex gap-2 mt-3">
          <button
            onClick={() => { setQuickStatsTab('ARROWS'); setIsQuickStatsOpen(true); }}
            className="flex-1 bg-white/[0.07] backdrop-blur-sm rounded-2xl px-2.5 py-2 flex flex-col active:scale-[0.97] transition-all"
          >
            <span className="material-symbols-outlined text-emerald-400 text-[15px] mb-0.5">bolt</span>
            <p className="text-base font-black text-white leading-none">{monthlyArrows}</p>
            <span className="text-[7px] font-bold text-emerald-300/70 uppercase tracking-widest mt-0.5 leading-none">{t('studentProfile.arrowsMonth')}</span>
          </button>

          <button
            onClick={() => { setQuickStatsTab('POINTS'); setIsQuickStatsOpen(true); }}
            className="flex-1 bg-white/[0.07] backdrop-blur-sm rounded-2xl px-2.5 py-2 flex flex-col active:scale-[0.97] transition-all"
          >
            <span className="material-symbols-outlined text-[#fed33e] text-[15px] mb-0.5">target</span>
            <p className="text-base font-black text-[#fed33e] leading-none">{avg14Days}</p>
            <span className="text-[7px] font-bold text-emerald-300/70 uppercase tracking-widest mt-0.5 leading-none">{t('studentProfile.avg14days')}</span>
          </button>

          <button
            onClick={() => {
              if (recentSessions.length > 0) {
                setActiveTab('overview');
                setCurrentSessionIndex(0);
                setTimeout(() => sessionSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
              }
            }}
            className="flex-1 bg-white/[0.07] backdrop-blur-sm rounded-2xl px-2.5 py-2 flex flex-col active:scale-[0.97] transition-all"
          >
            <span className="material-symbols-outlined text-white/60 text-[15px] mb-0.5">trophy</span>
            <p className="text-base font-black text-white leading-none">{recentSessions.length > 0 ? recentSessions[0].score : '--'}</p>
            <span className="text-[7px] font-bold text-emerald-300/70 uppercase tracking-widest mt-0.5 leading-none">{t('studentProfile.lastScore')}</span>
          </button>
        </div>

        {/* STATYSTYKI — rząd 2: Ergebniskurve pełna szerokość */}
        <button
          onClick={() => sparkline.length >= 2 && setShowTrendModal(true)}
          className="w-full mt-2 bg-white/[0.07] backdrop-blur-sm rounded-2xl px-3.5 pt-2 pb-2.5 flex flex-col active:scale-[0.97] transition-all"
        >
          <span className="text-[8px] font-bold text-emerald-300/80 uppercase tracking-widest mb-1.5">Ergebniskurve</span>
          <div className="flex items-center w-full gap-0">
            {sparkline.length >= 2 ? (() => {
              const W = 200, H = 36, pad = 5;
              const minS = Math.min(...sparkline);
              const maxS = Math.max(...sparkline);
              const lastS = sparkline[sparkline.length - 1];
              const range = maxS - minS || 1;
              const maxIdx = sparkline.indexOf(maxS);
              const minIdx = sparkline.lastIndexOf(minS);
              const pts = sparkline.map((s, i) => ({
                x: pad + (i / (sparkline.length - 1)) * (W - pad * 2),
                y: H - pad - ((s - minS) / range) * (H - pad * 2),
              }));
              const polyline = pts.map(p => `${p.x},${p.y}`).join(' ');
              return (
                <>
                  {/* 75% wykres */}
                  <div className="w-3/4 min-w-0">
                    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ overflow: 'visible' }}>
                      <polyline points={polyline} fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.25" />
                      {pts.map((p, i) => {
                        const isMax = i === maxIdx;
                        const isMin = i === minIdx;
                        const isLast = i === pts.length - 1;
                        const color = isMax ? '#22c55e' : isMin ? '#ef4444' : isLast ? '#fed33e' : 'white';
                        const r = (isMax || isMin) ? 4 : isLast ? 3.5 : 2;
                        const op = (isMax || isMin || isLast) ? 1 : 0.2;
                        return <circle key={i} cx={p.x} cy={p.y} r={r} fill={color} opacity={op} />;
                      })}
                    </svg>
                  </div>
                  {/* 25% legenda */}
                  <div className="w-1/4 flex flex-col items-end justify-center gap-[7px] pl-2">
                    <span className="flex items-center gap-1 text-[11px] font-black text-emerald-400 leading-none"><span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />{maxS}</span>
                    <span className="flex items-center gap-1 text-[11px] font-black text-red-400 leading-none"><span className="w-2 h-2 rounded-full bg-red-400 shrink-0" />{minS}</span>
                    <span className="flex items-center gap-1 text-[11px] font-black text-[#fed33e] leading-none"><span className="w-2 h-2 rounded-full bg-[#fed33e] shrink-0" />{lastS}</span>
                  </div>
                </>
              );
            })() : (
              <span className="material-symbols-outlined text-white/20 text-xl">monitoring</span>
            )}
          </div>
        </button>
      </div>

      {/* ─── TAB BAR ─────────────────────────────────────────── */}
      <div className="bg-white shrink-0 z-10 px-3 pt-3 pb-2">
        <div className="bg-gray-50 rounded-2xl p-1 flex relative">
          {[
            { key: 'overview',   icon: 'space_dashboard', label: t('studentProfile.tabOverview',   { defaultValue: 'Überblick' }) },
            { key: 'diary',      icon: 'edit_note',       label: t('studentProfile.tabDiary',      { defaultValue: 'Tagebuch' }) },
            { key: 'analytics',  icon: 'monitoring',      label: t('studentProfile.tabAnalytics',  { defaultValue: 'Analytik' }) },
          ].map(tab => {
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key as any)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl transition-all duration-200 ${
                  isActive
                    ? 'bg-[#0a3a2a] text-[#fed33e] shadow-md'
                    : 'text-gray-500 active:scale-95'
                }`}
              >
                <span className={`material-symbols-outlined text-[18px] ${isActive ? 'text-[#fed33e]' : 'text-gray-400'}`} style={isActive ? { fontVariationSettings: '"FILL" 1' } : {}}>
                  {tab.icon}
                </span>
                <span className="text-[10px] font-black uppercase tracking-wider">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ─── TAB CONTENT ─────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto pb-32">

        {/* ══ TAB 1: ÜBERBLICK ══════════════════════════════════ */}
        {activeTab === 'overview' && (
          <div className="px-5 pt-3 space-y-2">

            {/* NASTĘPNY CEL UCZNIA */}
            {nextTournament && (
              <div
                onClick={() => { if (additionalTournamentsCount > 0) setShowTournamentsModal(true); }}
                className={`bg-[#fed33e] rounded-[20px] p-3.5 flex items-center gap-3 relative overflow-hidden ${additionalTournamentsCount > 0 ? 'cursor-pointer active:scale-[0.98] transition-all' : ''}`}
              >
                <div className="absolute -right-5 -top-5 w-28 h-28 rounded-full border-[14px] border-black/5 pointer-events-none" />
                <div className="w-10 h-10 bg-[#0a3a2a] rounded-xl flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-[#fed33e] text-[20px]">emoji_events</span>
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-[8px] font-black text-[#0a3a2a]/50 uppercase tracking-widest block mb-0.5">{t('studentProfile.nextGoal')}</span>
                  <h3 className="font-black text-[#0a3a2a] text-[13px] leading-tight truncate">{nextTournament.title}</h3>
                  <div className="flex items-center gap-1 mt-0.5">
                    <span className="material-symbols-outlined text-[#0a3a2a]/50 text-[11px]">calendar_today</span>
                    <p className="text-[10px] font-bold text-[#0a3a2a]/60">
                      {new Date(nextTournament.date).toLocaleDateString(i18n.language, { day: 'numeric', month: 'short' })} · {getDaysUntil(nextTournament.date)}
                    </p>
                  </div>
                </div>
                {additionalTournamentsCount > 0 && (
                  <div className="shrink-0 bg-[#0a3a2a] text-[#fed33e] w-7 h-7 rounded-full flex items-center justify-center font-black text-[10px] z-10">
                    +{additionalTournamentsCount}
                  </div>
                )}
              </div>
            )}

            {/* SEKCJA OSTATNIEGO TRENINGU I NOTATEK (KARUZELA) */}
            {currentSession ? (
              <div ref={sessionSectionRef} className="bg-[#0a3a2a] rounded-[20px] overflow-hidden">
                <div className="px-3 py-2.5 flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <span className="text-[8px] font-black text-emerald-400 uppercase tracking-widest">{currentSession.date} · </span>
                    <span className="text-[8px] font-black text-white uppercase tracking-widest">{currentSession.distance} · {currentSession.targetType}</span>
                  </div>
                  {recentSessions.length > 1 && (
                    <div className="flex items-center gap-1 shrink-0">
                      {recentSessions.map((_, i) => (
                        <button key={i} onClick={() => setCurrentSessionIndex(i)} className={`rounded-full transition-all ${i === currentSessionIndex ? 'w-3.5 h-1.5 bg-[#fed33e]' : 'w-1.5 h-1.5 bg-white/25'}`} />
                      ))}
                    </div>
                  )}
                  <div className="flex items-center gap-0.5 shrink-0">
                    <button onClick={() => setCurrentSessionIndex(Math.min(recentSessions.length - 1, currentSessionIndex + 1))} disabled={currentSessionIndex === recentSessions.length - 1} className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center text-white active:scale-90 disabled:opacity-25 transition-all">
                      <span className="material-symbols-outlined text-[13px]">arrow_back_ios_new</span>
                    </button>
                    <button onClick={() => setCurrentSessionIndex(Math.max(0, currentSessionIndex - 1))} disabled={currentSessionIndex === 0} className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center text-white active:scale-90 disabled:opacity-25 transition-all">
                      <span className="material-symbols-outlined text-[13px]">arrow_forward_ios</span>
                    </button>
                  </div>
                </div>
                <div className="mx-2.5 mb-2.5 bg-white rounded-[14px] p-3 space-y-2.5">
                  <div className="grid grid-cols-5 text-center pb-2.5 border-b border-gray-50">
                    <div><p className="text-[8px] font-bold text-gray-400 uppercase">{t('studentProfile.statsScore')}</p><p className="text-sm font-black text-[#0a3a2a]">{currentSession.score}</p></div>
                    <div><p className="text-[8px] font-bold text-gray-400 uppercase">{t('studentProfile.statsAvg')}</p><p className="text-sm font-black text-[#0a3a2a]">{sessionAvg}</p></div>
                    <div className="border-l border-gray-100 pl-1"><p className="text-[8px] font-bold text-[#b8860b] uppercase">{t('studentProfile.statsInnerX')}</p><p className="text-sm font-black text-[#0a3a2a]">{sessionHits.x}</p></div>
                    <div><p className="text-[8px] font-bold text-emerald-500 uppercase">10</p><p className="text-sm font-black text-[#0a3a2a]">{sessionHits.ten}</p></div>
                    <div><p className="text-[8px] font-bold text-gray-400 uppercase">9</p><p className="text-sm font-black text-[#0a3a2a]">{sessionHits.nine}</p></div>
                  </div>
                  <div className="bg-gray-50 p-2.5 rounded-xl border border-gray-100 relative">
                    <span className="material-symbols-outlined absolute -top-2.5 -left-1.5 text-gray-200 text-2xl rotate-12 pointer-events-none">format_quote</span>
                    <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1 relative z-10">{t('studentProfile.studentNoteLabel')}</p>
                    <p className="text-[11px] font-bold text-[#333] italic relative z-10 leading-snug">{currentSession.note || t('studentProfile.noStudentNote')}</p>
                  </div>
                  <CoachNoteModule session={currentSession} studentId={studentId} onSaveSuccess={handleUpdateSessionNote} />
                </div>
              </div>
            ) : (
              <div className="bg-gray-50 rounded-[20px] p-8 text-center border border-dashed border-gray-200">
                <span className="material-symbols-outlined text-gray-200 text-4xl mb-2 block">sports_score</span>
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{t('studentProfile.noSessions', { defaultValue: 'Noch keine Trainingseinheiten' })}</p>
              </div>
            )}

          </div>
        )}

        {/* ══ TAB 2: TRAINER-TAGEBUCH ═══════════════════════════ */}
        {activeTab === 'diary' && (
          <div className="px-5 pt-3">
            <CoachLogPanel studentId={studentId} currentUserId={coachId} mode="coach" />
          </div>
        )}

        {/* ══ TAB 3: ANALYTIK ═══════════════════════════════════ */}
        {activeTab === 'analytics' && (
          <div>
            <div className="px-5 pt-3 pb-2">
              <div className="bg-[#0a3a2a] rounded-[20px] px-4 py-3 flex items-center justify-between overflow-hidden relative">
                <div className="absolute -right-6 -top-6 w-24 h-24 rounded-full border-[12px] border-white/5 pointer-events-none" />
                <div className="absolute right-10 -bottom-4 w-14 h-14 rounded-full border-[8px] border-white/5 pointer-events-none" />
                <div className="flex items-center gap-3 relative z-10">
                  <div className="w-9 h-9 bg-[#fed33e] rounded-xl flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-[#0a3a2a] text-[18px]">analytics</span>
                  </div>
                  <div>
                    <p className="text-[8px] font-black text-emerald-400 uppercase tracking-widest leading-none mb-0.5">{student.firstName} {student.lastName}</p>
                    <h2 className="text-base font-black text-white leading-none">{t('studentProfile.fullAnalytics')}</h2>
                  </div>
                </div>
                {student.isPremium || student.isPremiumPromo ? (
                  <span className="relative z-10 bg-[#fed33e] text-[#0a3a2a] text-[8px] font-black px-2 py-1 rounded-lg uppercase tracking-widest">PRO</span>
                ) : (
                  <span className="relative z-10 bg-white/10 text-white/50 text-[8px] font-black px-2 py-1 rounded-lg uppercase tracking-widest">FREE</span>
                )}
              </div>
            </div>
            <div className="bg-white shadow-sm border-t border-gray-100 overflow-hidden relative min-h-[600px] px-5 pt-4">
              <StatsView userId={studentId} viewingStudentId={studentId} onNavigate={onNavigate} isEmbedded={true} />
            </div>
          </div>
        )}

      </div>

      {/* QUICK STATS MODAL UCZNIA */}
      <QuickStatsModal
        isOpen={isQuickStatsOpen}
        onClose={() => setIsQuickStatsOpen(false)}
        isPremium={!!(student.isPremium || student.isPremiumPromo)}
        onNavigate={onNavigate}
        userId={studentId}
        initialTab={quickStatsTab}
        stats={{ daily: dailyArrows, monthly: monthlyArrows, yearly: yearlyArrows, avg14: avg14Days }}
      />

      {/* MODAL: KRZYWA WYNIKÓW UCZNIA */}
      {showTrendModal && sparkline.length >= 2 && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-[200000] bg-black/70 backdrop-blur-sm flex items-start justify-center p-4 pt-[max(1.5rem,env(safe-area-inset-top))] animate-fade-in overflow-y-auto"
          onClick={() => setShowTrendModal(false)}
        >
          <div className="bg-[#fcfdfe] w-full max-w-md rounded-[32px] shadow-2xl p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <div>
                <span className="text-[9px] font-black text-emerald-600 uppercase tracking-widest block leading-none mb-0.5">{student.firstName} {student.lastName}</span>
                <h2 className="text-xl font-black text-[#0a3a2a] leading-tight">{t('studentProfile.trendTitle', { defaultValue: 'Ergebniskurve' })}</h2>
              </div>
              <button onClick={() => setShowTrendModal(false)} className="w-9 h-9 bg-gray-100 rounded-full flex items-center justify-center text-gray-500 active:scale-90 transition-all">
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>

            {(() => {
              const W = 300, H = 100, pad = 12;
              const scores = sparkline;
              const minS = Math.min(...scores);
              const maxS = Math.max(...scores);
              const range = maxS - minS || 1;
              const maxIdx = scores.indexOf(maxS);
              const minIdx = scores.lastIndexOf(minS);
              const pts = scores.map((s, i) => ({
                x: pad + (i / (scores.length - 1)) * (W - pad * 2),
                y: H - pad - ((s - minS) / range) * (H - pad * 2),
                s,
              }));
              const polyline = pts.map(p => `${p.x},${p.y}`).join(' ');
              return (
                <>
                  <div className="bg-[#0a3a2a] rounded-2xl p-4 mb-4">
                    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ overflow: 'visible' }}>
                      <defs>
                        <linearGradient id="trendGradCoach" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#fed33e" stopOpacity="0.2" />
                          <stop offset="100%" stopColor="#fed33e" stopOpacity="0" />
                        </linearGradient>
                      </defs>
                      <polygon points={`${pts[0].x},${H} ${polyline} ${pts[pts.length-1].x},${H}`} fill="url(#trendGradCoach)" />
                      <polyline points={polyline} fill="none" stroke="#fed33e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                      {pts.map((p, i) => {
                        const isMax = i === maxIdx;
                        const isMin = i === minIdx;
                        const isLast = i === pts.length - 1;
                        const color = isMax ? '#22c55e' : isMin ? '#ef4444' : isLast ? '#fed33e' : 'rgba(255,255,255,0.4)';
                        const r = (isMax || isMin || isLast) ? 5 : 3;
                        return (
                          <g key={i}>
                            <circle cx={p.x} cy={p.y} r={r} fill={color} />
                            {(isMax || isMin || isLast) && (
                              <text x={p.x} y={p.y - 9} fontSize="8" fontWeight="bold" textAnchor="middle" fill={color}>{p.s}</text>
                            )}
                          </g>
                        );
                      })}
                    </svg>
                  </div>

                  <div className="space-y-1.5">
                    {[...recentSessions].reverse().map((sess, i) => {
                      const isTurniej = sess.type === 'Turniej';
                      const isArena = sess.type === 'Arena';
                      const dotColor = isTurniej ? 'bg-[#0a3a2a]' : isArena ? 'bg-blue-500' : 'bg-[#fed33e]';
                      const label = isTurniej
                        ? (sess.title || sess.tournamentName || sess.name || 'Turnier')
                        : isArena ? 'Arena' : 'Training';
                      const tsRaw = sess.timestamp;
                      const ms = tsRaw?.toMillis ? tsRaw.toMillis() : tsRaw?.seconds ? tsRaw.seconds * 1000 : (typeof tsRaw === 'number' ? tsRaw : 0);
                      const dateStr = ms ? (() => { const d = new Date(ms); return `${d.getDate().toString().padStart(2,'0')}.${(d.getMonth()+1).toString().padStart(2,'0')}`; })() : (sess.date || '');
                      return (
                        <div key={i} className="flex items-center justify-between bg-gray-50 rounded-xl px-3 py-2 border border-gray-100">
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <span className={`w-2 h-2 rounded-full shrink-0 ${dotColor}`} />
                            <span className="text-[9px] font-black text-gray-500 truncate">{label}</span>
                            <span className="text-[9px] font-bold text-gray-300 shrink-0">{sess.distance}</span>
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            {dateStr && <span className="text-[9px] font-bold text-gray-300">{dateStr}</span>}
                            <span className="text-sm font-black text-[#0a3a2a]">{sess.score}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              );
            })()}
          </div>
        </div>,
        document.body
      )}

      {/* MODAL KARTY SPRZĘTOWEJ */}
      {showHardwareModal && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[500000] flex items-center justify-center p-4 animate-fade-in" onClick={() => setShowHardwareModal(false)}>
          <div className="bg-white rounded-[32px] p-6 w-full max-w-[400px] shadow-2xl relative max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <button onClick={() => setShowHardwareModal(false)} className="absolute top-5 right-5 p-2 bg-gray-100 rounded-full active:scale-90 transition-all">
              <span className="material-symbols-outlined">close</span>
            </button>
            
            <div className="flex items-center gap-3 mb-6 mt-2 shrink-0">
              <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-blue-500">build</span>
              </div>
              <div>
                <h2 className="text-xl font-black text-[#0a3a2a] leading-none">{t('studentProfile.hardwareTitle')}</h2>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">{t('studentProfile.hardwareSubtitle')}</p>
              </div>
            </div>
            
            <div className="overflow-y-auto flex-1 space-y-6 pr-2 pb-4 hide-scrollbar">
              <div>
                <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-1">
                  <span className="material-symbols-outlined text-[14px]">sports_martial_arts</span> {t('studentProfile.hardwareBow')}
                </h3>
                <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100 space-y-3">
                  <div className="flex justify-between items-center border-b border-gray-100 pb-2">
                    <span className="text-[10px] font-bold text-gray-500 uppercase">{t('studentProfile.hardwareBowType')}</span>
                    <span className="text-[11px] font-black text-[#0a3a2a]">{student.bowType || '-'}</span>
                  </div>
                  <div className="flex justify-between items-center border-b border-gray-100 pb-2">
                    <span className="text-[10px] font-bold text-gray-500 uppercase">{t('studentProfile.hardwareDraw')}</span>
                    <span className="text-[11px] font-black text-[#0a3a2a]">{student.lbs ? `${student.lbs} lbs` : '-'}</span>
                  </div>
                  <div className="flex justify-between items-center border-b border-gray-100 pb-2">
                    <span className="text-[10px] font-bold text-gray-500 uppercase">{t('studentProfile.hardwareRiser')}</span>
                    <span className="text-[11px] font-black text-[#0a3a2a]">{student.riser || '-'}</span>
                  </div>
                  <div className="flex justify-between items-center border-b border-gray-100 pb-2">
                    <span className="text-[10px] font-bold text-gray-500 uppercase">{t('studentProfile.hardwareLimbs')}</span>
                    <span className="text-[11px] font-black text-[#0a3a2a]">{student.limbs || '-'}</span>
                  </div>
                  <div className="flex justify-between items-center border-b border-gray-100 pb-2">
                    <span className="text-[10px] font-bold text-gray-500 uppercase">{t('studentProfile.hardwareStabilizers')}</span>
                    <span className="text-[11px] font-black text-[#0a3a2a]">{student.stabilizers || '-'}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-bold text-gray-500 uppercase">{t('studentProfile.hardwareSight')}</span>
                    <span className="text-[11px] font-black text-[#0a3a2a]">{student.sight || '-'}</span>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-1">
                  <span className="material-symbols-outlined text-[14px]">my_location</span> {t('studentProfile.hardwareSightMarks')}
                </h3>
                <div className="space-y-2">
                  {student.userDistances && student.userDistances.filter((d: any) => d.active).length > 0 ? (
                    student.userDistances.filter((d: any) => d.active).map((d: any, i: number) => (
                      <div key={i} className="bg-white border border-gray-200 rounded-xl p-3 shadow-sm">
                        <div className="flex justify-between items-center mb-2 pb-2 border-b border-gray-50">
                          <div className="flex items-center gap-2">
                            <span className="bg-[#0a3a2a] text-[#fed33e] text-[10px] font-black px-2 py-0.5 rounded-md">{d.m}</span>
                            <span className="text-[9px] font-bold text-gray-400 uppercase">{d.targetType || '122cm'}</span>
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-center">
                          <div>
                            <span className="block text-[8px] font-bold text-gray-400 uppercase mb-0.5">{t('studentProfile.hardwareSightExt')}</span>
                            <span className="block text-[11px] font-black text-[#333] bg-gray-50 rounded p-1">{d.sightExtension || '-'}</span>
                          </div>
                          <div>
                            <span className="block text-[8px] font-bold text-gray-400 uppercase mb-0.5">{t('studentProfile.hardwareSightUD')}</span>
                            <span className="block text-[11px] font-black text-[#333] bg-gray-50 rounded p-1">{d.sightHeight || d.sightMark || '-'}</span>
                          </div>
                          <div>
                            <span className="block text-[8px] font-bold text-gray-400 uppercase mb-0.5">{t('studentProfile.hardwareSightLR')}</span>
                            <span className="block text-[11px] font-black text-[#333] bg-gray-50 rounded p-1">{d.sightSide || '-'}</span>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-6 bg-gray-50 rounded-2xl border border-dashed border-gray-200">
                      <span className="text-[10px] font-bold text-gray-400 uppercase">{t('studentProfile.hardwareNoSight')}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* MODAL POUFNEJ NOTATKI TRENERA (Teraz Rozbudowany!) */}
      {showPrivateNoteModal && (
         <PrivateNoteModal 
            coachId={coachId} 
            studentId={studentId} 
            initialNotes={privateNotes} 
            onClose={() => setShowPrivateNoteModal(false)}
            onSaveSuccess={(n: string[]) => setPrivateNotes(n)}
         />
      )}

      {/* MODAL Z LISTĄ TURNIEJÓW */}
      {showTournamentsModal && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[500000] flex items-center justify-center p-4 animate-fade-in" onClick={() => setShowTournamentsModal(false)}>
          <div className="bg-white rounded-[32px] p-6 w-full max-w-[400px] shadow-2xl relative max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <button onClick={() => setShowTournamentsModal(false)} className="absolute top-5 right-5 p-2 bg-gray-100 rounded-full active:scale-90 transition-all">
              <span className="material-symbols-outlined">close</span>
            </button>
            
            <div className="flex items-center gap-3 mb-6 mt-2">
              <div className="w-10 h-10 rounded-full bg-fuchsia-50 flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-fuchsia-500">emoji_events</span>
              </div>
              <div>
                <h2 className="text-xl font-black text-[#0a3a2a] leading-none">{t('studentProfile.tournamentsTitle')}</h2>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">{t('studentProfile.tournamentsSubtitle')}</p>
              </div>
            </div>
            
            <div className="overflow-y-auto flex-1 space-y-3 pr-2 pb-4 hide-scrollbar">
              {upcomingTournaments.map(tourney => (
                <div key={tourney.id} className="bg-gray-50 rounded-2xl p-4 border border-gray-100 flex items-center gap-4">
                  <div className="bg-white text-fuchsia-600 p-2 rounded-xl text-center min-w-[50px] shadow-sm border border-gray-100">
                    <span className="block text-[8px] font-black uppercase mb-0.5">{new Date(tourney.date).toLocaleDateString(i18n.language, { month: 'short' })}</span>
                    <span className="block text-lg font-black">{new Date(tourney.date).getDate()}</span>
                  </div>
                  <div>
                    <h3 className="font-black text-[#0a3a2a] text-sm leading-tight">{tourney.title}</h3>
                    <p className="text-[9px] font-bold text-gray-400 mt-1">{tourney.address || t('studentProfile.noLocation')}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>,
        document.body
      )}

      <style>{`
        .hide-scrollbar::-webkit-scrollbar { display: none; }
        .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        .animate-fade-in { animation: fadeIn 0.2s ease-out; } 
        @keyframes fadeIn { from { opacity: 0; transform: translateY(-5px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
}