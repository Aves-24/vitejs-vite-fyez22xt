import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { doc, getDoc, setDoc, updateDoc, arrayUnion, arrayRemove, collection, query, where, getDocs, onSnapshot, writeBatch, serverTimestamp } from 'firebase/firestore';
import { useTranslation } from 'react-i18next';
import { Html5Qrcode } from 'html5-qrcode';
import { createPortal } from 'react-dom';

interface CoachDashboardViewProps {
  userId: string;
  onNavigate: (view: string, tab?: string, extraData?: string, studentId?: string) => void;
}

export default function CoachDashboardView({ userId, onNavigate }: CoachDashboardViewProps) {
  const { t } = useTranslation();
  const [students, setStudents] = useState<any[]>([]);
  const [coachLimit, setCoachLimit] = useState<number>(0);
  const [studentLastChecked, setStudentLastChecked] = useState<Record<string, number>>({});
  
  const [isScanning, setIsScanning] = useState(false);
  const [cameraError, setCameraError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const [expandedStudentMenu, setExpandedStudentMenu] = useState<string | null>(null);
  const [studentToDelete, setStudentToDelete] = useState<string | null>(null);
  const [manualStudentId, setManualStudentId] = useState('');

  // Komunikacja Grupowa
  const [selectedStudents, setSelectedStudents] = useState<string[]>([]);
  const [isMessageModalOpen, setIsMessageModalOpen] = useState(false);
  const [msgTitle, setMsgTitle] = useState('');
  const [msgContent, setMsgContent] = useState('');
  const [isSendingMsg, setIsSendingMsg] = useState(false);

  // Zarządzanie Grupami i Dziennikiem
  const [coachGroups, setCoachGroups] = useState<{id: string, name: string}[]>([]);
  const [studentGroupMap, setStudentGroupMap] = useState<Record<string, string[]>>({});
  const [groupNotes, setGroupNotes] = useState<Record<string, {id: string, text: string, timestamp: number}[]>>({});
  
  const [activeGroup, setActiveGroup] = useState<string>('ALL');
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [managingGroupsForStudent, setManagingGroupsForStudent] = useState<string | null>(null);

  const [newNoteText, setNewNoteText] = useState('');
  const [noteReplacementPrompt, setNoteReplacementPrompt] = useState<{ pendingNote: string, oldestNote: any } | null>(null);
  const [confirmDeleteNote, setConfirmDeleteNote] = useState<{ groupId: string; noteId: string } | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const fetchCoachData = async () => {
    if (!userId) return;
    setIsLoading(true);
    
    try {
      const coachDoc = await getDoc(doc(db, 'users', userId));
      if (coachDoc.exists()) {
        const data = coachDoc.data();
        setCoachLimit(data.coachLimit || 0);
        setStudentLastChecked(data.studentLastChecked || {});
        
        setCoachGroups(data.coachGroups || []);
        setStudentGroupMap(data.studentGroupMap || {});
        setGroupNotes(data.groupNotes || {});
        
        const studentIds = data.students || [];
        
        if (studentIds.length > 0) {
          const studentsData = [];
          const chunks = [];
          for (let i = 0; i < studentIds.length; i += 10) {
            chunks.push(studentIds.slice(i, i + 10));
          }

          for (const chunk of chunks) {
            const q = query(collection(db, 'users'), where('__name__', 'in', chunk));
            const snap = await getDocs(q);

            for (const d of snap.docs) {
              const studentData = { id: d.id, ...d.data() } as any;

              // Dane denormalizowane — zapisywane przez ScoringView przy każdym zapisie sesji
              const ts = studentData.lastSessionTimestamp;
              studentData.exactLastActivity = ts?.toMillis
                ? ts.toMillis()
                : (ts?.seconds ? ts.seconds * 1000 : (ts || 0));

              studentsData.push(studentData);
            }
          }
          
          studentsData.sort((a, b) => {
            const timeA = a.exactLastActivity || 0;
            const timeB = b.exactLastActivity || 0;
            return timeB - timeA;
          });

          setStudents(studentsData as any);
        } else {
          setStudents([]);
        }
      }
    } catch (error) {
      console.error("Błąd pobierania danych trenera:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // [REAL-TIME] Nasłuch na własny dokument trenera. Gdy uczeń zaakceptuje
  // zaproszenie i dopisze się do `students[]`, panel trenera od razu to widzi
  // bez konieczności odświeżania. Po zmianie pola students — robimy pełny
  // fetch (dociągamy dane studentów, sortujemy po aktywności).
  useEffect(() => {
    if (!userId) return;
    let prevStudentsKey = '';
    const unsub = onSnapshot(doc(db, 'users', userId), (snap) => {
      if (!snap.exists()) return;
      const data = snap.data();
      const ids = (data.students || []) as string[];
      const key = [...ids].sort().join(',');
      // Pierwszy snapshot albo zmiana listy studentów → pełny refetch
      if (key !== prevStudentsKey) {
        prevStudentsKey = key;
        fetchCoachData();
      }
    }, (err) => {
      console.error('Coach doc listener error:', err);
    });
    return () => unsub();
  }, [userId]);

  useEffect(() => {
    let html5QrCode: Html5Qrcode | null = null;

    const startScanner = async () => {
      setCameraError(false);
      html5QrCode = new Html5Qrcode("reader");
      try {
        await html5QrCode.start(
          { facingMode: "environment" }, 
          { fps: 10, qrbox: { width: 250, height: 250 } },
          async (decodedText) => {
            if (html5QrCode && html5QrCode.isScanning) {
              await html5QrCode.stop();
              html5QrCode.clear();
            }
            setIsScanning(false);
            await handleAddStudent(decodedText);
          },
          undefined 
        );
      } catch (err) {
        console.error("Camera access error:", err);
        setCameraError(true);
      }
    };

    if (isScanning) {
      setTimeout(startScanner, 100);
    }

    return () => {
      if (html5QrCode && html5QrCode.isScanning) {
        html5QrCode.stop().then(() => {
          if (html5QrCode) html5QrCode.clear();
        }).catch(console.error);
      }
    };
  }, [isScanning]);

  const handleAddStudent = async (studentId: string) => {
    if (!studentId) return;
    
    if (studentId === userId) {
      showToast(t('coachDashboard.toastSelf'));
      return;
    }
    if (students.length >= coachLimit) {
      showToast(t('coachDashboard.toastLimit', { limit: coachLimit }));
      return;
    }
    if (students.some(s => s.id === studentId)) {
      showToast(t('coachDashboard.toastAlready'));
      return;
    }

    try {
      const studentDoc = await getDoc(doc(db, 'users', studentId));
      if (!studentDoc.exists()) {
        showToast(t('coachDashboard.toastNotFound'));
        return;
      }

      // [BEZPIECZEŃSTWO] Zamiast bezpośredniego dopisania trenera do ucznia
      // i odwrotnie, wysyłamy zaproszenie. Uczeń musi je zaakceptować w popupie
      // zanim relacja faktycznie powstanie. ID invite = "{coachId}_{studentId}"
      // żeby zapobiec duplikatom i żeby reguły /users mogły zweryfikować istnienie.
      const inviteId = `${userId}_${studentId}`;
      await setDoc(doc(db, 'coachInvites', inviteId), {
        coachId: userId,
        studentId: studentId,
        createdAt: serverTimestamp(),
      });

      setManualStudentId('');
      showToast(t('coachDashboard.toastInviteSent'));
    } catch (error) {
      console.error("Błąd wysyłania zaproszenia:", error);
      showToast(t('coachDashboard.toastError'));
    }
  };

  // [POPRAWKA] Mechanizm dwustopniowy. Zabezpieczony przed TypeScript errors (string | null).
  const confirmRemoveStudent = async (studentId: string | null) => {
    if (!studentId) return;

    try {
      // 1. Kasowanie ze składu głównego
      await updateDoc(doc(db, 'users', userId), {
        students: arrayRemove(studentId)
      });
      await updateDoc(doc(db, 'users', studentId), {
        coaches: arrayRemove(userId)
      });
      
      // 2. Automatyczne sprzątanie z Grup!
      const newMap = { ...studentGroupMap };
      let mapChanged = false;
      Object.keys(newMap).forEach(groupId => {
        if (newMap[groupId].includes(studentId)) {
          newMap[groupId] = newMap[groupId].filter(id => id !== studentId);
          mapChanged = true;
        }
      });
      
      if (mapChanged) {
        await updateDoc(doc(db, 'users', userId), { studentGroupMap: newMap });
        setStudentGroupMap(newMap);
      }

      // Aktualizacja widoków
      setStudents(prev => prev.filter(s => s.id !== studentId));
      setSelectedStudents(prev => prev.filter(id => id !== studentId));

      showToast(t('coachDashboard.toastRemoved'));
    } catch (error) {
      console.error("Błąd usuwania ucznia:", error);
    } finally {
      setStudentToDelete(null); 
    }
  };

  const handleCheckStudent = async (studentId: string) => {
    const now = Date.now();
    await updateDoc(doc(db, 'users', userId), {
      [`studentLastChecked.${studentId}`]: now
    });
    
    setStudentLastChecked(prev => ({ ...prev, [studentId]: now }));
    onNavigate('STUDENT_PROFILE', undefined, undefined, studentId);
  };

  const getTimeSinceLastActivity = (timestamp: number) => {
    if (!timestamp) return t('coachDashboard.noTrainings');

    const now = Date.now();
    const diffTime = Math.abs(now - timestamp);
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return t('coachDashboard.today');
    if (diffDays === 1) return t('coachDashboard.yesterday');
    return t('coachDashboard.daysAgo', { count: diffDays });
  };

  const toggleStudentSelection = (e: React.MouseEvent, studentId: string) => {
    e.stopPropagation(); 
    setSelectedStudents(prev => 
      prev.includes(studentId) ? prev.filter(id => id !== studentId) : [...prev, studentId]
    );
  };

  const visibleStudents = activeGroup === 'ALL' 
    ? students 
    : students.filter(s => (studentGroupMap[s.id] || []).includes(activeGroup));

  const areAllVisibleSelected = visibleStudents.length > 0 && visibleStudents.every(s => selectedStudents.includes(s.id));
  
  const handleToggleSelectAll = () => {
    if (areAllVisibleSelected) {
      const visibleIds = visibleStudents.map(s => s.id);
      setSelectedStudents(prev => prev.filter(id => !visibleIds.includes(id)));
    } else {
      const visibleIds = visibleStudents.map(s => s.id);
      setSelectedStudents(prev => Array.from(new Set([...prev, ...visibleIds])));
    }
  };

  const sendGroupMessage = async () => {
    if (!msgTitle.trim() || !msgContent.trim()) {
      return showToast(t('coachDashboard.toastFillFields'));
    }
    
    setIsSendingMsg(true);
    try {
      const batch = writeBatch(db);
      selectedStudents.forEach(studentId => {
        const docRef = doc(collection(db, 'announcements'));
        batch.set(docRef, {
          title: msgTitle.trim(),
          content: msgContent.trim(),
          target: 'USER', 
          targetId: studentId,
          lang: 'all', 
          timestamp: serverTimestamp(),
          senderId: userId 
        });
      });

      await batch.commit();
      
      showToast(t('coachDashboard.toastMsgSent'));
      setIsMessageModalOpen(false);
      setSelectedStudents([]);
      setMsgTitle('');
      setMsgContent('');
    } catch (e) {
      console.error(e);
      showToast(t('coachDashboard.toastConnError'));
    }
    setIsSendingMsg(false);
  };

  const handleCreateGroup = async () => {
    if (!newGroupName.trim() || coachGroups.length >= 5) return;
    const newGroup = { id: 'group_' + Date.now(), name: newGroupName.trim() };
    const updatedGroups = [...coachGroups, newGroup];
    
    try {
      await updateDoc(doc(db, 'users', userId), { coachGroups: updatedGroups });
      setCoachGroups(updatedGroups);
      setIsCreatingGroup(false);
      setNewGroupName('');
      setActiveGroup(newGroup.id);
      showToast(t('coachDashboard.toastGroupCreated'));
    } catch (error) {
      showToast(t('coachDashboard.toastGroupError'));
    }
  };

  const toggleGroupForStudent = async (groupId: string) => {
    if (!managingGroupsForStudent) return;
    const currentGroups = studentGroupMap[managingGroupsForStudent] || [];
    const updatedGroups = currentGroups.includes(groupId)
      ? currentGroups.filter(id => id !== groupId)
      : [...currentGroups, groupId];
      
    const newMap = { ...studentGroupMap, [managingGroupsForStudent]: updatedGroups };
    setStudentGroupMap(newMap);

    try {
      await updateDoc(doc(db, 'users', userId), { studentGroupMap: newMap });
    } catch(e) { showToast(t('coachDashboard.toastSaveError')); }
  };

  const saveNote = async (text: string, replace: boolean = false) => {
    let currentNotes = groupNotes[activeGroup] || [];
    
    if (replace) {
      currentNotes.sort((a, b) => a.timestamp - b.timestamp);
      currentNotes = currentNotes.slice(1);
    }

    const newNote = { id: 'note_' + Date.now(), text, timestamp: Date.now() };
    const newNotesArray = [...currentNotes, newNote];
    const updatedNotesMap = { ...groupNotes, [activeGroup]: newNotesArray };

    try {
      await updateDoc(doc(db, 'users', userId), { groupNotes: updatedNotesMap });
      setGroupNotes(updatedNotesMap);
      setNewNoteText('');
      setNoteReplacementPrompt(null);
      showToast(t('coachDashboard.toastNoteAdded'));
    } catch(e) {
      showToast(t('coachDashboard.toastNoteError'));
    }
  };

  const handleAddNoteClick = () => {
    if (!newNoteText.trim()) return;
    const currentNotes = groupNotes[activeGroup] || [];
    
    if (currentNotes.length >= 5) {
      const sorted = [...currentNotes].sort((a, b) => a.timestamp - b.timestamp);
      setNoteReplacementPrompt({ pendingNote: newNoteText, oldestNote: sorted[0] });
    } else {
      saveNote(newNoteText, false);
    }
  };

  const isLimitReached = students.length >= coachLimit;

  return (
    <div className="min-h-screen bg-[#fcfdfe] px-5 pb-24 pt-[calc(env(safe-area-inset-top)+1rem)] relative">
      
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button onClick={() => onNavigate('HOME')} className="w-10 h-10 bg-white rounded-full shadow-sm border border-gray-100 flex items-center justify-center text-gray-600 active:scale-90 transition-all">
            <span className="material-symbols-outlined text-[20px]">arrow_back_ios_new</span>
          </button>
          <div>
            <h1 className="text-2xl font-black text-[#0a3a2a] leading-none">{t('coachDashboard.title')}</h1>
            <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest mt-1">{t('coachDashboard.subtitle')}</p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <div className="bg-[#0a3a2a] text-[#fed33e] px-3 py-1.5 rounded-xl flex items-center gap-1.5 shadow-md h-10">
            <span className="material-symbols-outlined text-sm">groups</span>
            <span className="text-sm font-black">{students.length}/{coachLimit}</span>
          </div>
          
          <button 
            onClick={() => setIsScanning(true)}
            disabled={isLimitReached}
            className={`h-10 px-3 rounded-xl flex items-center gap-1.5 shadow-md transition-all ${
              isLimitReached 
              ? 'bg-gray-100 text-gray-400 border border-gray-200' 
              : 'bg-indigo-600 text-white active:scale-95'
            }`}
          >
            <span className="material-symbols-outlined text-[18px]">add_reaction</span>
            <span className="text-[10px] font-black uppercase tracking-widest hidden xs:block">
              {t('coachDashboard.addBtn')}
            </span>
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-6">
        <button 
          onClick={() => setActiveGroup('ALL')}
          className={`shrink-0 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-sm border ${
            activeGroup === 'ALL' ? 'bg-[#0a3a2a] text-[#fed33e] border-[#0a3a2a]' : 'bg-white text-gray-500 border-gray-100'
          }`}
        >
          {t('coachDashboard.allGroups')}
        </button>
        {coachGroups.map(g => (
          <button 
            key={g.id}
            onClick={() => setActiveGroup(g.id)}
            className={`shrink-0 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-sm border ${
              activeGroup === g.id ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-500 border-gray-100'
            }`}
          >
            {g.name}
          </button>
        ))}
        {coachGroups.length < 5 && (
          <button 
            onClick={() => setIsCreatingGroup(true)}
            className="shrink-0 w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center border border-indigo-100 shadow-sm active:scale-90 transition-all"
          >
            <span className="material-symbols-outlined text-sm font-bold">add</span>
          </button>
        )}
      </div>

      {isScanning && (
        <div className="bg-white rounded-[32px] p-4 shadow-xl border border-gray-100 mb-6 relative overflow-hidden animate-fade-in-up">
          <div className="flex justify-between items-center mb-4">
            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{t('coachDashboard.addStudentHeader')}</span>
            <button onClick={() => setIsScanning(false)} className="bg-red-50 text-red-500 w-8 h-8 rounded-full flex items-center justify-center active:scale-90">
              <span className="material-symbols-outlined text-sm">close</span>
            </button>
          </div>

          <div className="mb-5 flex gap-2">
            <input
              type="text"
              value={manualStudentId}
              onChange={(e) => setManualStudentId(e.target.value)}
              placeholder={t('coachDashboard.idPlaceholder')}
              className="flex-1 bg-gray-50 border border-gray-200 rounded-xl p-3 text-[11px] font-bold outline-none focus:border-indigo-500 text-[#333]"
            />
            <button
              onClick={() => {
                if(manualStudentId.trim()) {
                  handleAddStudent(manualStudentId.trim());
                }
              }}
              disabled={!manualStudentId.trim() || isLoading}
              className="bg-indigo-600 text-white px-4 rounded-xl text-[10px] font-black uppercase tracking-widest active:scale-95 disabled:opacity-50 transition-all shadow-md"
            >
              {t('coachDashboard.addBtn')}
            </button>
          </div>

          <div className="flex items-center gap-3 mb-5">
            <div className="flex-1 h-px bg-gray-100"></div>
            <span className="text-[9px] font-black text-gray-300 uppercase tracking-widest">{t('coachDashboard.orScanQr')}</span>
            <div className="flex-1 h-px bg-gray-100"></div>
          </div>

          {cameraError ? (
            <div className="w-full bg-red-50 border border-red-100 rounded-2xl p-6 flex flex-col items-center justify-center min-h-[150px] text-center">
               <span className="material-symbols-outlined text-red-400 text-3xl mb-2">no_photography</span>
               <p className="text-[11px] font-bold text-red-600">{t('coachDashboard.cameraError')}</p>
               <p className="text-[9px] text-red-400 mt-1 uppercase tracking-widest">{t('coachDashboard.cameraErrorDesc')}</p>
            </div>
          ) : (
            <div id="reader" className="w-full rounded-2xl overflow-hidden border-2 border-indigo-100 bg-gray-50 flex items-center justify-center min-h-[250px]"></div>
          )}
        </div>
      )}

      {activeGroup !== 'ALL' && (
        <div className="bg-indigo-50/50 rounded-3xl p-4 border border-indigo-100 mb-6 animate-fade-in">
           <div className="flex items-center gap-2 mb-3">
              <span className="material-symbols-outlined text-indigo-600 text-[18px]">menu_book</span>
              <h3 className="text-[11px] font-black text-indigo-800 uppercase tracking-widest">{t('coachDashboard.journalTitle')}</h3>
              <span className="ml-auto text-[9px] font-bold text-indigo-400">{t('coachDashboard.journalCount', { count: (groupNotes[activeGroup] || []).length })}</span>
           </div>

           <div className="relative mb-3">
             <textarea 
               value={newNoteText}
               onChange={e => setNewNoteText(e.target.value)}
               placeholder={t('coachDashboard.journalPlaceholder')}
               maxLength={200}
               className="w-full bg-white border border-indigo-100 rounded-2xl p-3 text-[11px] font-medium h-20 resize-none outline-none focus:border-indigo-400 text-[#333]"
             />
             <span className={`absolute bottom-2 right-3 text-[8px] font-bold ${newNoteText.length >= 200 ? 'text-red-500' : 'text-gray-400'}`}>
               {newNoteText.length}/200
             </span>
           </div>

           <div className="flex justify-end mb-4">
             <button 
               onClick={handleAddNoteClick}
               disabled={!newNoteText.trim()}
               className="bg-indigo-600 text-white px-5 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest active:scale-95 disabled:opacity-50 transition-all shadow-sm"
             >
               {t('coachDashboard.journalAddBtn')}
             </button>
           </div>

           <div className="space-y-2">
             {(() => {
                const notes = [...(groupNotes[activeGroup] || [])].sort((a, b) => b.timestamp - a.timestamp);
                return notes.map(note => (
                  <div key={note.id} className="bg-white p-3 rounded-xl shadow-sm border border-gray-100 relative pr-8">
                     <p className="text-[11px] text-[#333] font-medium leading-relaxed break-words whitespace-pre-wrap">{note.text}</p>
                     <p className="text-[8px] font-bold text-gray-400 uppercase mt-2">
                        {new Date(note.timestamp).toLocaleDateString()} {new Date(note.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                     </p>
                     <button
                       onClick={() => setConfirmDeleteNote({ groupId: activeGroup, noteId: note.id })}
                       className="absolute top-2 right-2 text-gray-300 hover:text-red-500 transition-colors"
                     >
                       <span className="material-symbols-outlined text-[16px]">close</span>
                     </button>
                  </div>
                ));
             })()}
           </div>
        </div>
      )}

      <div>
        <div className="flex items-center justify-between mb-4 ml-2 pr-1">
          <h2 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
             {activeGroup === 'ALL' ? t('coachDashboard.allStudents') : t('coachDashboard.groupList')} ({visibleStudents.length})
          </h2>
          {visibleStudents.length > 0 && (
             <button
               onClick={handleToggleSelectAll}
               className={`text-[9px] font-black uppercase active:scale-95 transition-colors ${areAllVisibleSelected ? 'text-red-400' : 'text-indigo-600'}`}
             >
               {areAllVisibleSelected ? t('coachDashboard.deselectAll') : t('coachDashboard.selectAll')}
             </button>
          )}
        </div>
        
        {isLoading ? (
          <div className="flex flex-col gap-2">
            {[1, 2, 3, 4, 5].map(i => <div key={i} className="h-14 bg-gray-100 rounded-2xl animate-pulse"></div>)}
          </div>
        ) : visibleStudents.length === 0 ? (
          <div className="text-center py-10 bg-gray-50 rounded-3xl border border-dashed border-gray-200">
            <span className="material-symbols-outlined text-4xl text-gray-300 mb-2">sentiment_dissatisfied</span>
            <p className="text-[11px] font-black text-gray-400 uppercase tracking-widest">{t('coachDashboard.noStudents')}</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {visibleStudents.map(student => {
              const lastActivity = student.exactLastActivity || 0;
              const lastChecked = studentLastChecked[student.id] || 0;
              const hasNewActivity = lastActivity > lastChecked;
              const initials = `${student.firstName?.[0] || ''}${student.lastName?.[0] || ''}`.toUpperCase();
              const isSelected = selectedStudents.includes(student.id);

              return (
                <div key={student.id} className={`relative flex items-center gap-2 animate-fade-in ${expandedStudentMenu === student.id ? 'z-50' : 'z-10'}`}>
                  <button 
                    onClick={(e) => toggleStudentSelection(e, student.id)} 
                    className={`w-7 h-7 shrink-0 rounded-full flex items-center justify-center transition-all ${
                      isSelected ? 'bg-[#0a3a2a] text-[#fed33e] border border-[#0a3a2a]' : 'bg-white text-transparent border border-gray-200 shadow-sm'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[14px] font-black">check</span>
                  </button>

                  <div 
                    onClick={() => handleCheckStudent(student.id)}
                    className={`flex-1 bg-white rounded-2xl p-2.5 pr-1 shadow-sm border active:scale-[0.98] transition-all relative overflow-hidden flex items-center justify-between cursor-pointer ${
                      isSelected ? 'border-[#0a3a2a] ring-1 ring-[#0a3a2a]' : 'border-gray-100'
                    }`}
                  >
                    
                    {hasNewActivity && !isSelected && (
                      <div className="absolute left-0 top-0 bottom-0 w-1 bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></div>
                    )}

                    <div className="flex items-center gap-3 pl-1.5 flex-1 overflow-hidden">
                      <div className="w-10 h-10 bg-[#fed33e]/20 text-[#8B6508] border border-[#fed33e]/50 rounded-full flex items-center justify-center shrink-0 relative">
                        {initials ? (
                          <span className="font-black text-[13px]">{initials}</span>
                        ) : (
                          <span className="material-symbols-outlined text-[20px]">person</span>
                        )}
                        
                        {hasNewActivity && (
                           <div className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-emerald-500 border-2 border-white rounded-full animate-pulse shadow-sm"></div>
                        )}
                      </div>
                      
                      <div className="flex flex-col justify-center truncate pr-2">
                        <h3 className="font-black text-[#0a3a2a] text-[13px] leading-tight truncate">
                          {student.firstName || t('coachDashboard.defaultStudentName')} {student.lastName || ''}
                        </h3>
                        <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mt-0.5 truncate">
                          {hasNewActivity ? <span className="text-emerald-500">{t('coachDashboard.newTraining')}</span> : getTimeSinceLastActivity(lastActivity)}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center transition-all ${
                          hasNewActivity 
                          ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/30' 
                          : 'bg-indigo-50 text-indigo-600'
                        }`}
                      >
                        <span className="material-symbols-outlined text-[18px]">analytics</span>
                      </div>

                      <button 
                        onClick={(e) => { 
                          e.preventDefault();
                          e.stopPropagation(); 
                          setExpandedStudentMenu(expandedStudentMenu === student.id ? null : student.id); 
                        }}
                        className="w-9 h-9 rounded-full flex items-center justify-center text-gray-400 hover:bg-gray-50 active:scale-90 transition-all"
                      >
                        <span className="material-symbols-outlined text-[20px]">more_vert</span>
                      </button>
                    </div>
                  </div>

                  {expandedStudentMenu === student.id && (
                    <div className="absolute right-0 top-[52px] bg-white border border-gray-100 shadow-2xl rounded-2xl p-2 z-[200] min-w-[170px] animate-fade-in-up">
                      {coachGroups.length > 0 && (
                         <button 
                           onClick={(e) => { 
                             e.preventDefault(); e.stopPropagation(); 
                             setManagingGroupsForStudent(student.id);
                             setExpandedStudentMenu(null);
                           }}
                           className="w-full text-left px-3 py-2.5 rounded-t-xl text-[10px] font-black uppercase text-indigo-600 hover:bg-indigo-50 flex items-center gap-2 transition-all border-b border-gray-50"
                         >
                           <span className="material-symbols-outlined text-[16px]">folder_shared</span> {t('coachDashboard.manageGroups')}
                         </button>
                      )}
                      <button 
                        onClick={(e) => { 
                          e.preventDefault();
                          e.stopPropagation(); 
                          setStudentToDelete(student.id); 
                          setExpandedStudentMenu(null);
                        }}
                        className={`w-full text-left px-3 py-2.5 text-[10px] font-black uppercase text-red-500 hover:bg-red-50 flex items-center gap-2 transition-all ${coachGroups.length > 0 ? 'rounded-b-xl' : 'rounded-xl'}`}
                      >
                        <span className="material-symbols-outlined text-[16px]">person_remove</span> {t('coachDashboard.removeStudent')}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Wersja wbudowana pod listę (niezasłaniająca) */}
{selectedStudents.length > 0 && (
  <div className="mt-4 bg-[#0a3a2a] p-4 rounded-3xl shadow-md flex items-center justify-between border border-[#124b38] animate-fade-in-up">
    <div className="text-white flex items-center gap-3">
       <div className="w-10 h-10 bg-[#124b38] rounded-full flex items-center justify-center shrink-0">
         <span className="material-symbols-outlined text-[#fed33e]">mark_email_unread</span>
       </div>
       <div>
         <p className="text-[10px] font-bold text-gray-400 uppercase leading-none">{t('coachDashboard.selected')}</p>
         <p className="font-black text-xl leading-none mt-1">{selectedStudents.length}</p>
       </div>
    </div>
    <button 
      onClick={() => setIsMessageModalOpen(true)}
      className="bg-[#fed33e] text-[#0a3a2a] px-5 py-3 rounded-xl font-black text-[11px] uppercase shadow-sm active:scale-95 transition-all shrink-0"
    >
      {t('coachDashboard.writeBtn')}
    </button>
  </div>
)}

      {toastMessage && (
        <div className="fixed top-14 left-0 right-0 mx-auto w-max z-[300000] bg-[#0a3a2a] text-white px-6 py-3.5 rounded-full font-black text-[10px] uppercase tracking-widest shadow-2xl border border-emerald-900 flex items-center gap-2 whitespace-nowrap animate-fade-in-up">
          <span className="material-symbols-outlined text-emerald-400 text-sm">info</span>
          {toastMessage}
        </div>
      )}

      {isCreatingGroup && typeof document !== 'undefined' && createPortal(
         <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[500000] flex items-center justify-center p-4 animate-fade-in" onClick={() => setIsCreatingGroup(false)}>
           <div className="bg-white rounded-[32px] p-6 w-full max-w-[320px] shadow-2xl relative" onClick={e => e.stopPropagation()}>
             <h2 className="text-lg font-black text-[#0a3a2a] mb-4">{t('coachDashboard.newGroupTitle')}</h2>
             <input
               type="text"
               placeholder={t('coachDashboard.newGroupPlaceholder')}
               value={newGroupName}
               onChange={e => setNewGroupName(e.target.value)}
               maxLength={15}
               className="w-full bg-gray-50 border border-gray-200 rounded-xl p-4 text-[12px] font-black outline-none focus:border-indigo-500 mb-6 text-[#333]"
             />
             <div className="flex gap-2">
               <button onClick={() => setIsCreatingGroup(false)} className="flex-1 py-3 bg-gray-100 text-gray-500 rounded-xl font-black text-[10px] uppercase tracking-widest active:scale-95">{t('coachDashboard.cancel')}</button>
               <button onClick={handleCreateGroup} disabled={!newGroupName.trim()} className="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest active:scale-95 disabled:opacity-50 shadow-md">{t('coachDashboard.save')}</button>
             </div>
           </div>
         </div>,
         document.body
      )}

      {managingGroupsForStudent && typeof document !== 'undefined' && createPortal(
         <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[500000] flex items-center justify-center p-4 animate-fade-in" onClick={() => setManagingGroupsForStudent(null)}>
           <div className="bg-white rounded-[32px] p-6 w-full max-w-[320px] shadow-2xl relative" onClick={e => e.stopPropagation()}>
             <h2 className="text-lg font-black text-[#0a3a2a] mb-1">{t('coachDashboard.manageGroupsTitle')}</h2>
             <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-6">{t('coachDashboard.manageGroupsDesc')}</p>
             
             <div className="space-y-2 mb-6">
               {coachGroups.map(g => {
                 const isAssigned = (studentGroupMap[managingGroupsForStudent] || []).includes(g.id);
                 return (
                   <button 
                     key={g.id}
                     onClick={() => toggleGroupForStudent(g.id)}
                     className={`w-full flex items-center justify-between p-4 rounded-xl border transition-all active:scale-[0.98] ${
                       isAssigned ? 'bg-indigo-50 border-indigo-200' : 'bg-white border-gray-200'
                     }`}
                   >
                     <span className={`text-[12px] font-black ${isAssigned ? 'text-indigo-800' : 'text-gray-600'}`}>{g.name}</span>
                     <div className={`w-6 h-6 rounded flex items-center justify-center ${isAssigned ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-transparent'}`}>
                        <span className="material-symbols-outlined text-[14px] font-black">check</span>
                     </div>
                   </button>
                 )
               })}
             </div>
             <button onClick={() => setManagingGroupsForStudent(null)} className="w-full py-4 bg-[#0a3a2a] text-white rounded-xl font-black text-[10px] uppercase tracking-widest active:scale-95 shadow-lg">{t('coachDashboard.done')}</button>
           </div>
         </div>,
         document.body
      )}

      {noteReplacementPrompt && typeof document !== 'undefined' && createPortal(
         <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[500000] flex items-center justify-center p-4 animate-fade-in">
           <div className="bg-white rounded-[32px] p-6 w-full max-w-[320px] shadow-2xl relative">
             <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4 border border-red-100">
                <span className="material-symbols-outlined text-3xl">warning</span>
             </div>
             <h2 className="text-xl font-black text-center text-[#0a3a2a] mb-2">{t('coachDashboard.limitTitle')}</h2>
             <p className="text-[11px] font-bold text-gray-500 mb-4 text-center leading-relaxed">
               {t('coachDashboard.limitDesc')}
             </p>
             <div className="bg-gray-50 p-3 rounded-xl border border-gray-100 mb-6 max-h-24 overflow-y-auto">
                <p className="text-[10px] text-gray-600 font-medium italic break-words">"{noteReplacementPrompt.oldestNote?.text}"</p>
             </div>
             <div className="flex gap-2">
               <button onClick={() => setNoteReplacementPrompt(null)} className="flex-1 py-3 bg-gray-100 text-gray-500 rounded-xl font-black text-[10px] uppercase tracking-widest active:scale-95">{t('coachDashboard.cancel')}</button>
               <button onClick={() => saveNote(noteReplacementPrompt.pendingNote, true)} className="flex-1 py-3 bg-red-500 text-white rounded-xl font-black text-[10px] uppercase tracking-widest active:scale-95 shadow-md">{t('coachDashboard.replaceOld')}</button>
             </div>
           </div>
         </div>,
         document.body
      )}

      {isMessageModalOpen && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[500000] flex items-center justify-center p-4 animate-fade-in" onClick={() => setIsMessageModalOpen(false)}>
          <div className="bg-white rounded-[32px] p-6 w-full max-w-[340px] shadow-2xl relative" onClick={e => e.stopPropagation()}>
             <div className="flex justify-between items-center mb-5">
               <div className="flex items-center gap-2">
                 <div className="w-8 h-8 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center">
                    <span className="material-symbols-outlined text-[16px]">campaign</span>
                 </div>
                 <h2 className="text-lg font-black text-[#0a3a2a] leading-none">{t('coachDashboard.messageTitle')}</h2>
               </div>
               <button onClick={() => setIsMessageModalOpen(false)} className="w-8 h-8 bg-gray-50 text-gray-500 rounded-full flex items-center justify-center active:scale-90 transition-all">
                  <span className="material-symbols-outlined text-sm">close</span>
               </button>
             </div>

             <p className="text-[10px] font-bold text-gray-400 uppercase mb-4 pl-1">{t('coachDashboard.recipients')} <span className="text-[#0a3a2a] font-black">{t('coachDashboard.recipientsCount', { count: selectedStudents.length })}</span></p>

             <div className="space-y-3">
               <input 
                 type="text"
                 placeholder={t('coachDashboard.titlePlaceholder')}
                 value={msgTitle} 
                 onChange={e => setMsgTitle(e.target.value)} 
                 className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-[12px] font-black outline-none focus:border-indigo-500 transition-colors text-[#333]" 
               />
               <textarea 
                 placeholder={t('coachDashboard.contentPlaceholder')}
                 value={msgContent} 
                 onChange={e => setMsgContent(e.target.value)} 
                 className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-[12px] font-medium h-32 resize-none outline-none focus:border-indigo-500 transition-colors text-[#333]" 
               />
             </div>

             <button 
               onClick={sendGroupMessage} 
               disabled={isSendingMsg} 
               className="w-full mt-6 py-4 bg-[#0a3a2a] text-white rounded-2xl font-black text-[11px] uppercase tracking-widest active:scale-95 transition-all shadow-xl disabled:opacity-50 flex items-center justify-center gap-2"
             >
               {isSendingMsg ? (
                 <>{t('coachDashboard.processing')}</>
               ) : (
                 <>
                   <span className="material-symbols-outlined text-[16px]">send</span>
                   {t('coachDashboard.sendTo', { count: selectedStudents.length })}
                 </>
               )}
             </button>
          </div>
        </div>,
        document.body
      )}

      {studentToDelete && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[500000] flex items-center justify-center p-4 animate-fade-in" onClick={() => setStudentToDelete(null)}>
          <div className="bg-white rounded-[32px] p-6 w-full max-w-[320px] shadow-2xl relative text-center" onClick={e => e.stopPropagation()}>
            
            <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4 border border-red-100">
              <span className="material-symbols-outlined text-3xl">person_remove</span>
            </div>
            
            <h2 className="text-xl font-black text-[#0a3a2a] mb-2">{t('coachDashboard.deleteTitle')}</h2>

            <p className="text-[11px] font-bold text-gray-500 mb-6 leading-relaxed px-2">
              {t('coachDashboard.deleteDescPre')} <span className="text-red-500 font-black text-sm">0</span>{t('coachDashboard.deleteDescPost')}
            </p>
            
            <div className="flex gap-3 justify-center mb-6">
              <button 
                onClick={() => setStudentToDelete(null)} 
                className="w-14 h-14 bg-gray-100 text-gray-500 rounded-2xl font-black text-xl active:scale-90 transition-all border border-gray-200"
              >
                8
              </button>
              <button 
                onClick={() => confirmRemoveStudent(studentToDelete)} 
                className="w-14 h-14 bg-red-50 text-red-500 rounded-2xl font-black text-xl active:scale-90 transition-all border border-red-200 shadow-md shadow-red-500/20"
              >
                0
              </button>
              <button 
                onClick={() => setStudentToDelete(null)} 
                className="w-14 h-14 bg-gray-100 text-gray-500 rounded-2xl font-black text-xl active:scale-90 transition-all border border-gray-200"
              >
                4
              </button>
            </div>
            
            <button 
              onClick={() => setStudentToDelete(null)} 
              className="w-full py-4 bg-gray-50 text-gray-400 rounded-xl font-black uppercase text-[10px] tracking-widest active:scale-95 transition-all hover:bg-gray-100 border border-gray-100"
            >
              {t('coachDashboard.cancelOp')}
            </button>
            
          </div>
        </div>,
        document.body
      )}

      {confirmDeleteNote && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[400000] bg-black/80 backdrop-blur-sm flex items-center justify-center p-6 animate-fade-in">
          <div className="bg-white rounded-[32px] p-6 w-full max-w-sm text-center shadow-2xl">
            <div className="w-14 h-14 bg-orange-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="material-symbols-outlined text-orange-500 text-2xl">warning</span>
            </div>
            <h2 className="text-lg font-black text-[#0a3a2a] mb-2">{t('coachDashboard.deleteNoteTitle')}</h2>
            <p className="text-sm font-bold text-gray-500 mb-6">{t('coachDashboard.deleteNoteDesc')}</p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmDeleteNote(null)} className="flex-1 py-3.5 bg-gray-100 text-gray-500 rounded-xl font-black uppercase text-[11px]">{t('coachDashboard.cancel')}</button>
              <button onClick={async () => {
                const { groupId, noteId } = confirmDeleteNote;
                setConfirmDeleteNote(null);
                const updatedNotes = groupNotes[groupId].filter(n => n.id !== noteId);
                const newMap = { ...groupNotes, [groupId]: updatedNotes };
                await updateDoc(doc(db, 'users', userId), { groupNotes: newMap });
                setGroupNotes(newMap);
              }} className="flex-1 py-3.5 bg-[#0a3a2a] text-white rounded-xl font-black uppercase text-[11px]">{t('coachDashboard.confirm')}</button>
            </div>
          </div>
        </div>, document.body
      )}

      <style>{`
        .hide-scrollbar::-webkit-scrollbar { display: none; }
        .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        .animate-fade-in-up { animation: fadeInUp 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        .animate-fade-in { animation: fadeIn 0.2s ease-out; }
        @keyframes fadeInUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(-5px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
}