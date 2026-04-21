import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { doc, getDoc, collection, query, where, orderBy, limit, getDocs, updateDoc } from 'firebase/firestore';
import { useTranslation } from 'react-i18next';
import { createPortal } from 'react-dom';
import StatsView from './StatsView';

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
           <textarea 
             value={text} 
             onChange={e => setText(e.target.value.slice(0, 100))} 
             maxLength={100}
             className="w-full bg-white border border-blue-200 rounded-lg p-2 text-[11px] font-bold text-[#333] outline-none focus:border-blue-500 resize-none h-16 leading-tight"
             placeholder={t('studentProfile.coachNotePlaceholder')}
           />
           <div className="flex justify-between items-center mt-1">
             <span className="text-[9px] font-bold text-blue-400/70">{text.length}/100</span>
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
                 <textarea
                   value={text}
                   onChange={e => {
                     const newNotes = [...notes];
                     newNotes[idx] = e.target.value.slice(0, 200);
                     setNotes(newNotes);
                   }}
                   placeholder={t('studentProfile.privateNotePlaceholder')}
                   className="w-full bg-white border border-gray-200 rounded-lg p-2.5 text-[11px] font-bold text-[#333] outline-none focus:border-yellow-500 resize-none h-[72px]"
                   maxLength={200}
                 />
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
  
  const [monthlyArrows, setMonthlyArrows] = useState(0);
  const [avg14Days, setAvg14Days] = useState('0.0');
  
  const [isNotesExpanded, setIsNotesExpanded] = useState(false);
  const [showTournamentsModal, setShowTournamentsModal] = useState(false);

  // [ZMIANA] Stany dla nowej, wielopolowej notatki
  const [privateNotes, setPrivateNotes] = useState<string[]>(['', '', '']);
  const [showPrivateNoteModal, setShowPrivateNoteModal] = useState(false);
  const [showHardwareModal, setShowHardwareModal] = useState(false);

  useEffect(() => {
    const fetchStudentData = async () => {
      if (!studentId) return;

      const studentDoc = await getDoc(doc(db, 'users', studentId));
      if (studentDoc.exists()) setStudent(studentDoc.data());

      const today = new Date().toISOString().split('T')[0];
      const qTourney = query(collection(db, `users/${studentId}/tournaments`), where('date', '>=', today), orderBy('date', 'asc'));
      const snapTourney = await getDocs(qTourney);
      
      const allEvents = snapTourney.docs.map(d => ({ id: d.id, ...d.data() }));
      const tourneysOnly = allEvents.filter((e: any) => e.category === 'Turniej' || !e.category);
      setUpcomingTournaments(tourneysOnly);

      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const fourteenDaysAgo = new Date();
      fourteenDaysAgo.setDate(now.getDate() - 14);

      const sessionsRef = collection(db, `users/${studentId}/sessions`);
      
      const snapRecent = await getDocs(query(sessionsRef, orderBy('timestamp', 'desc'), limit(3)));
      if (!snapRecent.empty) {
        const sessionsData = snapRecent.docs.map(d => ({ id: d.id, ...d.data() }));
        setRecentSessions(sessionsData);
      }

      const snapMonth = await getDocs(query(sessionsRef, where('timestamp', '>=', startOfMonth)));
      let monthTotal = 0;
      snapMonth.forEach(d => monthTotal += (d.data().arrows || 0));
      setMonthlyArrows(monthTotal);

      const snap14 = await getDocs(query(sessionsRef, where('timestamp', '>=', fourteenDaysAgo)));
      let tScore14 = 0; let tArrows14 = 0;
      snap14.forEach(d => {
        tScore14 += (d.data().score || 0);
        tArrows14 += (d.data().arrows || 0);
      });
      setAvg14Days(tArrows14 > 0 ? (tScore14 / tArrows14).toFixed(1) : '0.0');
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
      <div className="bg-[#0a3a2a] pt-[calc(env(safe-area-inset-top)+1rem)] pb-6 px-5 rounded-b-[32px] shadow-lg relative z-20 shrink-0">
        <div className="flex items-center gap-4 mb-4">
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

        {/* LEKKIE STATYSTYKI */}
        <div className="grid grid-cols-3 gap-2 mt-6">
          <div className="bg-white/10 rounded-2xl p-3 border border-white/10 text-center">
            <p className="text-xl font-black text-white">{monthlyArrows}</p>
            <span className="text-[8px] font-bold text-emerald-200 uppercase tracking-widest">{t('studentProfile.arrowsMonth')}</span>
          </div>
          <div className="bg-white/10 rounded-2xl p-3 border border-white/10 text-center">
            <p className="text-xl font-black text-[#fed33e]">{avg14Days}</p>
            <span className="text-[8px] font-bold text-emerald-200 uppercase tracking-widest">{t('studentProfile.avg14days')}</span>
          </div>
          <div className="bg-white/10 rounded-2xl p-3 border border-white/10 text-center">
            <p className="text-xl font-black text-white">{recentSessions.length > 0 ? recentSessions[0].score : '--'}</p>
            <span className="text-[8px] font-bold text-emerald-200 uppercase tracking-widest">{t('studentProfile.lastScore')}</span>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 pt-4 pb-32 space-y-4">
        
        {/* NASTĘPNY CEL UCZNIA */}
        {nextTournament && (
          <div 
            onClick={() => { if (additionalTournamentsCount > 0) setShowTournamentsModal(true); }}
            className={`bg-white border border-gray-100 rounded-[24px] p-4 shadow-sm flex items-center gap-4 relative ${additionalTournamentsCount > 0 ? 'cursor-pointer active:scale-[0.98] transition-all' : ''}`}
          >
            <div className="bg-fuchsia-50 text-fuchsia-600 p-3 rounded-xl text-center min-w-[60px]">
              <span className="block text-[9px] font-black uppercase mb-0.5">{new Date(nextTournament.date).toLocaleDateString(i18n.language, { month: 'short' })}</span>
              <span className="block text-xl font-black">{new Date(nextTournament.date).getDate()}</span>
            </div>
            <div className="flex-1 pr-12">
              <span className="text-[9px] font-black text-fuchsia-500 uppercase tracking-widest block mb-0.5">{t('studentProfile.nextGoal')}</span>
              <h3 className="font-black text-[#0a3a2a] text-sm leading-tight line-clamp-2">{nextTournament.title}</h3>
              <p className="text-[10px] font-bold text-gray-400 mt-1">{getDaysUntil(nextTournament.date)}</p>
            </div>

            {additionalTournamentsCount > 0 && (
              <div className="absolute right-4 top-1/2 -translate-y-1/2 bg-fuchsia-100 text-fuchsia-600 w-10 h-10 rounded-full flex items-center justify-center font-black text-xs shadow-sm border border-fuchsia-200">
                +{additionalTournamentsCount}
              </div>
            )}
          </div>
        )}

        {/* SEKCJA OSTATNIEGO TRENINGU I NOTATEK (KARUZELA) */}
        {currentSession && (
          <div className="bg-white border border-indigo-100 rounded-[24px] shadow-sm overflow-hidden">
            
            <div className="p-4 bg-indigo-50 flex items-center justify-between border-b border-indigo-100">
              <div className="flex-1 cursor-pointer" onClick={() => setIsNotesExpanded(!isNotesExpanded)}>
                <span className="text-[9px] font-black text-indigo-500 uppercase tracking-widest">
                  {t('studentProfile.historyLabel', { index: currentSessionIndex + 1, count: recentSessions.length })} • {currentSession.date}
                </span>
                <h3 className="font-black text-[#0a3a2a] text-sm mt-0.5">{currentSession.distance} • {currentSession.targetType}</h3>
              </div>
              
              <div className="flex items-center gap-1">
                <button 
                  onClick={(e) => { e.stopPropagation(); setCurrentSessionIndex(Math.min(recentSessions.length - 1, currentSessionIndex + 1)); }}
                  disabled={currentSessionIndex === recentSessions.length - 1}
                  className="w-8 h-8 rounded-full bg-white flex items-center justify-center text-indigo-600 active:scale-90 disabled:opacity-30 transition-all border border-indigo-100"
                >
                  <span className="material-symbols-outlined text-sm">arrow_back_ios_new</span>
                </button>
                <button 
                  onClick={(e) => { e.stopPropagation(); setCurrentSessionIndex(Math.max(0, currentSessionIndex - 1)); }}
                  disabled={currentSessionIndex === 0}
                  className="w-8 h-8 rounded-full bg-white flex items-center justify-center text-indigo-600 active:scale-90 disabled:opacity-30 transition-all border border-indigo-100"
                >
                  <span className="material-symbols-outlined text-sm">arrow_forward_ios</span>
                </button>
                <button onClick={() => setIsNotesExpanded(!isNotesExpanded)} className="ml-2 w-8 h-8 flex items-center justify-center">
                  <span className={`material-symbols-outlined text-indigo-400 transition-transform ${isNotesExpanded ? 'rotate-180' : ''}`}>expand_more</span>
                </button>
              </div>
            </div>

            {isNotesExpanded && (
              <div className="p-4 space-y-3 animate-fade-in">
                
                <div className="bg-white border border-gray-100 rounded-2xl p-3 grid grid-cols-5 text-center shadow-sm">
                  <div><p className="text-[8px] font-bold text-gray-400 uppercase">{t('studentProfile.statsScore')}</p><p className="text-sm font-black text-[#0a3a2a]">{currentSession.score}</p></div>
                  <div><p className="text-[8px] font-bold text-gray-400 uppercase">{t('studentProfile.statsAvg')}</p><p className="text-sm font-black text-[#0a3a2a]">{sessionAvg}</p></div>
                  <div className="border-l border-gray-100 pl-1"><p className="text-[8px] font-bold text-[#fed33e] uppercase">{t('studentProfile.statsInnerX')}</p><p className="text-sm font-black">{sessionHits.x}</p></div>
                  <div><p className="text-[8px] font-bold text-emerald-400 uppercase">10</p><p className="text-sm font-black">{sessionHits.ten}</p></div>
                  <div><p className="text-[8px] font-bold text-gray-400 uppercase">9</p><p className="text-sm font-black">{sessionHits.nine}</p></div>
                </div>

                <div className="bg-gray-50 p-3 rounded-xl border border-gray-100 relative mt-2">
                  <span className="material-symbols-outlined absolute -top-3 -left-2 text-gray-300 text-3xl rotate-12">format_quote</span>
                  <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1 relative z-10">{t('studentProfile.studentNoteLabel')}</p>
                  <p className="text-[11px] font-bold text-[#333] italic relative z-10 leading-snug">{currentSession.note || t('studentProfile.noStudentNote')}</p>
                </div>

                <CoachNoteModule 
                  session={currentSession} 
                  studentId={studentId} 
                  onSaveSuccess={handleUpdateSessionNote}
                />
              </div>
            )}
          </div>
        )}

        <div className="pt-6">
          <div className="flex items-center gap-2 mb-4">
            <h2 className="text-lg font-black text-[#0a3a2a]">{t('studentProfile.fullAnalytics')}</h2>
            {student.isPremium || student.isPremiumPromo ? (
              <span className="bg-[#fed33e] text-[#0a3a2a] text-[8px] font-black px-1.5 py-0.5 rounded uppercase tracking-widest">PRO</span>
            ) : (
              <span className="bg-gray-200 text-gray-500 text-[8px] font-black px-1.5 py-0.5 rounded uppercase tracking-widest">FREE</span>
            )}
          </div>
          
          <div className="bg-white rounded-[32px] shadow-sm border border-gray-100 overflow-hidden relative min-h-[600px] -mx-5 px-5 pt-4">
             <StatsView 
               userId={studentId} 
               viewingStudentId={studentId} 
               onNavigate={onNavigate} 
               isEmbedded={true}
             />
          </div>
        </div>

      </div>

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