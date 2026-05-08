import React, { useState, useEffect, useRef } from 'react';
import { db } from '../firebase';
import { collection, query, orderBy, onSnapshot, addDoc, updateDoc, deleteDoc, doc, where, getDoc, getDocs } from 'firebase/firestore';
import { useTranslation } from 'react-i18next'; 
import { createPortal } from 'react-dom'; 

// IMPORTUJEMY NOWY KOMPONENT:
import TournamentScoreInput from '../components/TournamentScoreInput';
import { mirrorTrenerEventToStudents, updateMirroredEvent, deleteMirroredEvent } from '../utils/coachCalendarMirror';

interface Event {
  id: string;
  title: string;
  date: string;
  time: string;
  address: string;
  note: string;
  type: string;
  category: 'Turniej' | 'Inne' | 'Trener';
  distance?: string;
  hasScore?: boolean;
  coachStudents?: 'all' | string[];
  todo?: boolean;
  wasATodo?: boolean;
  isMirrored?: boolean;
}

interface CoachStudent {
  id: string;
  firstName: string;
  lastName: string;
}

interface CalendarViewProps {
  userId: string; 
  focusedEventId?: string | null;
  clearFocusedEvent?: () => void;
  onNavigate?: (view: string, tab?: string) => void;
}

export default function CalendarView({ userId, focusedEventId, clearFocusedEvent, onNavigate }: CalendarViewProps) {
  const { t, i18n: i18nCore } = useTranslation(); 
  const [events, setEvents] = useState<Event[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [viewingEvent, setViewingEvent] = useState<Event | null>(null);
  const [dayPickerEvents, setDayPickerEvents] = useState<Event[]>([]);
  const [dayPickerDate, setDayPickerDate] = useState<string>('');
  
  // STAN DLA NOWEGO FORMULARZA WYNIKÓW:
  const [showScoreInput, setShowScoreInput] = useState(false);
  
  const [editingEventId, setEditingEventId] = useState<string | null>(null);

  const [calendarDate, setCalendarDate] = useState(new Date());

  const [isCoach, setIsCoach] = useState(false);
  const [coachStudentsList, setCoachStudentsList] = useState<CoachStudent[]>([]);
  const [coachGroups, setCoachGroups] = useState<{id: string, name: string}[]>([]);
  const [studentGroupMap, setStudentGroupMap] = useState<Record<string, string[]>>({});
  const [newCoachStudents, setNewCoachStudents] = useState<'all' | string[]>([]);

  const [newCategory, setNewCategory] = useState<'Turniej' | 'Inne' | 'Trener'>('Turniej');
  const [newTitle, setNewTitle] = useState('');
  const [newDate, setNewDate] = useState('');
  
  const [inputDay, setInputDay] = useState('');
  const [inputMonth, setInputMonth] = useState('');
  const [inputYear, setInputYear] = useState('');
  const [dateError, setDateError] = useState<string>('');
  
  const [newTime, setNewTime] = useState('');
  const [newAddress, setNewAddress] = useState('');
  const [newNote, setNewNote] = useState('');
  const [newDistance, setNewDistance] = useState('70m');
  const calendarPickerRef = useRef<HTMLInputElement>(null);
  
  const [isPremium, setIsPremium] = useState(false);
  const [userSightMarks, setUserSightMarks] = useState<any[]>([]); 

  const [showAllTournaments, setShowAllTournaments] = useState(false);
  const [showAllOthers, setShowAllOthers] = useState(false);
  const [showAllTrainer, setShowAllTrainer] = useState(false);

  type ArchiveState = { open: boolean; allItems: Event[]; shown: number; loading: boolean };
  const initArch = (): ArchiveState => ({ open: false, allItems: [], shown: 5, loading: false });
  const [archTurniej, setArchTurniej] = useState<ArchiveState>(initArch());
  const [archInne, setArchInne] = useState<ArchiveState>(initArch());
  const [archTrainerRec, setArchTrainerRec] = useState<ArchiveState>(initArch());
  const [archTrainerSent, setArchTrainerSent] = useState<ArchiveState>(initArch());
  const [archTodo, setArchTodo] = useState<ArchiveState>(initArch());

  const [newIsTodo, setNewIsTodo] = useState(false);
  const [todoEvents, setTodoEvents] = useState<Event[]>([]);

  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);

  const availableDistances = ['18m', '20m', '25m', '30m', '40m', '50m', '60m', '70m', '90m'];
  
  const todayObj = new Date();
  const todayStr = todayObj.toISOString().split('T')[0];

  useEffect(() => {
    if (!userId) return; 
    let unsubscribe: () => void;
    let unsubscribeTodo: () => void;
    let isMounted = true; // <--- DODANE: Zabezpieczenie przed asynchronicznym duchem

    const setupCalendarData = async () => {
      let userIsPremium = false;
      try {
        const profileSnap = await getDoc(doc(db, 'users', userId));
        if (profileSnap.exists() && isMounted) {
          const data = profileSnap.data();
          userIsPremium = data.isPremium || false;
          setUserSightMarks(data.userDistances || []);
          setIsPremium(userIsPremium);
          const coachFlag = data.isCoach || false;
          setIsCoach(coachFlag);
          if (coachFlag) {
            const studentIds: string[] = data.students || [];
            if (studentIds.length > 0) {
              const loaded: CoachStudent[] = [];
              for (let i = 0; i < studentIds.length; i += 10) {
                const chunk = studentIds.slice(i, i + 10);
                const sq = query(collection(db, 'users'), where('__name__', 'in', chunk));
                const snap = await getDocs(sq);
                snap.docs.forEach(d => {
                  const sd = d.data();
                  loaded.push({ id: d.id, firstName: sd.firstName || '', lastName: sd.lastName || '' });
                });
              }
              setCoachStudentsList(loaded);
            }
            setCoachGroups(data.coachGroups || []);
            setStudentGroupMap(data.studentGroupMap || {});
          }
        }
      } catch (e) { console.error("Błąd sprawdzania profilu:", e); }
      
      // Jeśli użytkownik wyszedł w trakcie ładowania profilu, przerywamy i nie stawiamy podsłuchu!
      if (!isMounted) return; 

      const cutoffDateObj = new Date(todayObj);
      if (userIsPremium) {
        cutoffDateObj.setDate(cutoffDateObj.getDate() - 730); 
      } else {
        cutoffDateObj.setDate(cutoffDateObj.getDate() - 60); 
      }
      const cutoffStr = cutoffDateObj.toISOString().split('T')[0];

      const q = query(
        collection(db, 'users', userId, 'tournaments'), 
        where('date', '>=', cutoffStr),
        orderBy('date', 'asc')
      );

      unsubscribe = onSnapshot(q, (snapshot) => {
        if (!isMounted) return;
        const loadedEvents = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Event[];
        setEvents(loadedEvents);
      });

      const qTodo = query(
        collection(db, 'users', userId, 'tournaments'),
        where('todo', '==', true)
      );
      unsubscribeTodo = onSnapshot(qTodo, (snapshot) => {
        if (!isMounted) return;
        const loaded = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Event[];
        setTodoEvents(loaded);
      });
    };

    setupCalendarData();

    return () => {
      isMounted = false; // Zaznaczamy, że komponent znika
      if (unsubscribe) unsubscribe();
      if (unsubscribeTodo) unsubscribeTodo();
    };
  }, [userId]);

  const getSightMarkForDistance = (dist: string) => {
    const mark = userSightMarks.find(m => m.distance === dist || m.name === dist || m.m === dist);
    return mark ? {
        ext: mark.sightExtension || '-',
        height: mark.sightHeight || '-',
        side: mark.sightSide || '-'
    } : null;
  };

  useEffect(() => {
    if (!focusedEventId) return;
    const ev = [...events, ...todoEvents].find(e => e.id === focusedEventId);
    if (ev) setViewingEvent(ev);
  }, [focusedEventId, events, todoEvents]);

  const closeViewingModal = () => {
    setViewingEvent(null);
    if (clearFocusedEvent) clearFocusedEvent();
  };

  const resetForm = (prefilledDate?: string) => {
    setEditingEventId(null);
    setNewTitle(''); 
    setNewDate(prefilledDate || ''); 
    if (prefilledDate) {
      const parts = prefilledDate.split('-');
      setInputYear(parts[0] || '');
      setInputMonth(parts[1] || '');
      setInputDay(parts[2] || '');
    } else {
      setInputYear(new Date().getFullYear().toString());
      setInputMonth('');
      setInputDay('');
    }
    setNewTime(''); 
    setNewAddress(''); 
    setNewNote(''); 
    setNewDistance('70m');
    setNewCategory('Turniej');
    setNewCoachStudents([]);
    setNewIsTodo(false);
  };

  const handleOpenNewForm = () => {
    resetForm();
    setShowForm(true);
  };

  const handleDayClick = (dateStr: string, dayEvents: Event[]) => {
    if (dayEvents.length === 0) {
      setDayPickerEvents([]);
      setDayPickerDate('');
      resetForm(dateStr);
      setShowForm(true);
    } else if (dayEvents.length === 1) {
      setDayPickerEvents([]);
      setDayPickerDate('');
      setViewingEvent(dayEvents[0]);
    } else {
      setDayPickerEvents(dayEvents);
      setDayPickerDate(dateStr);
    }
  };

  const handleEditViewing = () => {
    if (!viewingEvent) return;
    setEditingEventId(viewingEvent.id);
    setNewCategory(viewingEvent.category || 'Turniej');
    setNewTitle(viewingEvent.title);
    setNewIsTodo(viewingEvent.todo || false);
    setNewDate(viewingEvent.date);
    const dParts = viewingEvent.date.split('-');
    setInputYear(dParts[0] || '');
    setInputMonth(dParts[1] || '');
    setInputDay(dParts[2] || '');
    setNewTime(viewingEvent.time);
    setNewAddress(viewingEvent.address);
    setNewNote(viewingEvent.note);
    if (viewingEvent.distance) setNewDistance(viewingEvent.distance);
    setNewCoachStudents(viewingEvent.coachStudents || []);

    setViewingEvent(null);
    setShowForm(true);    
  };

  // Walidacja wpisanej daty. Zwraca komunikat błędu albo pusty string gdy OK.
  const validateInputDate = (d: string, m: string, y: string): string => {
    if (!d || !m || !y) return t('calendar.dateErrorRequired');
    const day = parseInt(d, 10);
    const month = parseInt(m, 10);
    const year = parseInt(y, 10);
    if (isNaN(day) || isNaN(month) || isNaN(year)) return t('calendar.dateErrorInvalid');
    if (year < 2000 || year > 2100) return t('calendar.dateErrorYear');
    if (month < 1 || month > 12) return t('calendar.dateErrorMonth');
    if (day < 1 || day > 31) return t('calendar.dateErrorDay');
    // Sprawdzenie realnej daty (JS Date normalizuje np. 31.02 → 03.03).
    const testDate = new Date(year, month - 1, day);
    if (
      testDate.getFullYear() !== year ||
      testDate.getMonth() !== month - 1 ||
      testDate.getDate() !== day
    ) {
      return t('calendar.dateErrorInvalid');
    }
    return '';
  };

  const markTodoComplete = async (id: string) => {
    try {
      await updateDoc(doc(db, 'users', userId, 'tournaments', id), {
        todo: false,
        date: todayStr,
        wasATodo: true,
      });
      localStorage.removeItem(`grotX_todos_${userId}`);
      localStorage.removeItem(`grotX_tournaments_${userId}`);
    } catch (error) {
      console.error('Błąd oznaczenia jako zrobione:', error);
    }
  };

  const saveEvent = async () => {
    let finalDate = '';
    if (!newIsTodo) {
      const validationError = validateInputDate(inputDay, inputMonth, inputYear);
      if (validationError) {
        setDateError(validationError);
        return;
      }
      setDateError('');
      finalDate = `${inputYear}-${String(inputMonth).padStart(2, '0')}-${String(inputDay).padStart(2, '0')}`;
    }
    if (!newTitle || !userId) return;
    setIsSaving(true);
    
    const eventData: Record<string, unknown> = {
      category: newCategory,
      title: newTitle,
      date: finalDate,
      todo: newIsTodo,
      time: newTime,
      address: newAddress,
      note: newNote,
      distance: newCategory === 'Turniej' ? newDistance : null,
      type: newCategory === 'Turniej'
        ? `${t('calendar.upcomingTournaments')} ${newDistance}`
        : newCategory === 'Trener'
        ? 'Trener'
        : t('calendar.trainingsAndOthers'),
    };
    if (newCategory === 'Trener') {
      eventData.coachStudents = newCoachStudents;
    }

    // Rozwiąż listę studentIds dla mirror (all → pełna lista)
    const resolvedStudentIds: string[] = newCategory === 'Trener'
      ? (newCoachStudents === 'all'
          ? coachStudentsList.map(s => s.id)
          : newCoachStudents as string[])
      : [];

    try {
      if (editingEventId) {
        await updateDoc(doc(db, 'users', userId, 'tournaments', editingEventId), eventData as any);
        // Mirror update do uczniów
        if (newCategory === 'Trener') {
          await updateMirroredEvent(editingEventId, eventData as any, resolvedStudentIds, userId);
        }
      } else {
        const docRef = await addDoc(collection(db, 'users', userId, 'tournaments'), eventData);
        if (newIsTodo) localStorage.removeItem(`grotX_todos_${userId}`);
        // Mirror nowego eventu do uczniów
        if (newCategory === 'Trener' && resolvedStudentIds.length > 0) {
          await mirrorTrenerEventToStudents(eventData as any, docRef.id, resolvedStudentIds, userId);
        }
      }
      localStorage.removeItem(`grotX_tournaments_${userId}`);
      setShowForm(false);
      resetForm();
    } catch (error) {
      console.error("Błąd zapisu:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteEvent = (id: string) => {
    setShowDeleteConfirm(id);
  };

  const confirmDeletion = async () => {
    if (showDeleteConfirm && userId) {
      try {
        // Znajdź event żeby sprawdzić czy to Trener i pobrać listę uczniów
        const eventToDelete = events.find(e => e.id === showDeleteConfirm);
        if (eventToDelete?.category === 'Trener') {
          const studentIds = eventToDelete.coachStudents === 'all'
            ? coachStudentsList.map(s => s.id)
            : (eventToDelete.coachStudents as string[] || []);
          await deleteMirroredEvent(showDeleteConfirm, studentIds);
        }
        await deleteDoc(doc(db, 'users', userId, 'tournaments', showDeleteConfirm));
        localStorage.removeItem(`grotX_tournaments_${userId}`);
        localStorage.removeItem(`grotX_todos_${userId}`);
        setShowDeleteConfirm(null);
        closeViewingModal();
      } catch (error) {
        console.error("Błąd usuwania:", error);
      }
    }
  };

  const nextMonth = () => setCalendarDate(new Date(calendarDate.getFullYear(), calendarDate.getMonth() + 1, 1));
  const prevMonth = () => setCalendarDate(new Date(calendarDate.getFullYear(), calendarDate.getMonth() - 1, 1));
  const getDaysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
  const getFirstDayOfMonth = (year: number, month: number) => {
    const day = new Date(year, month, 1).getDay();
    return day === 0 ? 6 : day - 1; 
  };
  const formatDateStr = (year: number, month: number, day: number) => {
    return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  };

  const upcomingEvents = events.filter(e => e.date >= todayStr);

  const getArchiveCutoff = (type: 'turniej' | 'other') => {
    const d = new Date();
    if (type === 'turniej') {
      if (isPremium) d.setFullYear(d.getFullYear() - 5); else d.setFullYear(d.getFullYear() - 1);
    } else {
      if (isPremium) d.setFullYear(d.getFullYear() - 1); else d.setMonth(d.getMonth() - 2);
    }
    return d.toISOString().split('T')[0];
  };

  const openArchiveSection = async (
    state: ArchiveState,
    setter: React.Dispatch<React.SetStateAction<ArchiveState>>,
    cutoffType: 'turniej' | 'other',
    filterFn: (e: Event) => boolean
  ) => {
    if (state.allItems.length > 0) { setter(p => ({ ...p, open: !p.open })); return; }
    setter(p => ({ ...p, loading: true, open: true }));
    try {
      const cutoff = getArchiveCutoff(cutoffType);
      const snap = await getDocs(query(
        collection(db, 'users', userId, 'tournaments'),
        where('date', '>=', cutoff),
        where('date', '<', todayStr),
        orderBy('date', 'desc')
      ));
      const allItems = snap.docs.map(d => ({ id: d.id, ...d.data() } as Event)).filter(filterFn);
      setter({ open: true, allItems, shown: 5, loading: false });
    } catch { setter(p => ({ ...p, loading: false, open: false })); }
  };

  const upcomingTournaments = upcomingEvents.filter(e => e.category === 'Turniej' || !e.category);
  const upcomingOthers = upcomingEvents.filter(e => e.category === 'Inne');
  const upcomingTrainer = upcomingEvents.filter(e => e.category === 'Trener');

  const nextTournamentId = upcomingTournaments.length > 0 ? upcomingTournaments[0].id : null;

  const visibleTournaments = showAllTournaments ? upcomingTournaments : upcomingTournaments.slice(0, 1);
  const visibleOthers = showAllOthers ? upcomingOthers : upcomingOthers.slice(0, 1);
  const visibleTrainer = showAllTrainer ? upcomingTrainer : upcomingTrainer.slice(0, 1);

  const openInGoogleMaps = (address: string) => {
    const encodedAddress = encodeURIComponent(address);
    // noopener,noreferrer — ochrona przed tabnabbing (opened tab nie ma
    // dostępu do window.opener i nie może nas zredirectować).
    window.open(
      `https://www.google.com/maps/search/?api=1&query=${encodedAddress}`,
      '_blank',
      'noopener,noreferrer'
    );
  };

  const dayNames = t('calendar.days', { returnObjects: true }) as string[];
  const currentLocale = i18nCore.language === 'pl' ? 'pl-PL' : i18nCore.language === 'de' ? 'de-DE' : 'en-GB';

  return (
    <div className="flex flex-col h-full bg-[#fcfdfe] pt-[env(safe-area-inset-top)] pb-32">
      
      <div className="px-4 mt-6 mb-4 h-12 flex items-center shrink-0">
        <div className="w-20 shrink-0" />
        <div className="flex-1 flex items-center gap-1.5">
          <span className="text-[20px] font-black text-[#0a3a2a] tracking-tighter leading-none">GROT-X</span>
          <div className="w-1.5 h-1.5 bg-[#fed33e] rounded-full ml-0.5 animate-pulse" />
          <div className="w-px h-3.5 bg-gray-200 rounded-full mx-1.5" />
          <h1 className="text-[11px] font-black text-gray-400 uppercase tracking-[0.15em] leading-none whitespace-nowrap">
            {t('nav.calendar')}
          </h1>
        </div>
        <div className="relative shrink-0">
          <div className="absolute inset-0 rounded-full bg-[#0a3a2a]/25 animate-ping" />
          <button
            onClick={handleOpenNewForm}
            className="relative bg-[#0a3a2a] text-white w-11 h-11 rounded-full shadow-lg flex items-center justify-center active:scale-95 transition-all z-10"
          >
            <span className="material-symbols-outlined text-[22px] leading-none font-bold">add</span>
          </button>
        </div>
      </div>

      <div className="px-4 mb-2 shrink-0">
        <div className="bg-white rounded-[24px] border border-gray-100 px-3 py-2.5 shadow-sm">
           <div className="flex justify-between items-center mb-1.5 px-1">
             <button onClick={prevMonth} className="p-1 text-gray-400 active:scale-90"><span className="material-symbols-outlined text-[18px]">chevron_left</span></button>
             <h3 className="font-black text-[#0a3a2a] uppercase tracking-widest text-[10px]">
                {calendarDate.toLocaleDateString(currentLocale, { month: 'long', year: 'numeric' })}
             </h3>
             <button onClick={nextMonth} className="p-1 text-gray-400 active:scale-90"><span className="material-symbols-outlined text-[18px]">chevron_right</span></button>
           </div>
           
           <div className="grid grid-cols-7 gap-1 text-center mb-1">
             {dayNames.map(d => (
               <div key={d} className="text-[8px] font-black text-gray-300 uppercase">{d}</div>
             ))}
           </div>
           
           <div className="grid grid-cols-7 gap-1.5">
             {Array.from({ length: getFirstDayOfMonth(calendarDate.getFullYear(), calendarDate.getMonth()) }).map((_, i) => (
               <div key={`empty-${i}`} className="h-[34px]" />
             ))}
             
             {Array.from({ length: getDaysInMonth(calendarDate.getFullYear(), calendarDate.getMonth()) }).map((_, i) => {
                const day = i + 1;
                const dateStr = formatDateStr(calendarDate.getFullYear(), calendarDate.getMonth(), day);
                const dayEvents = events.filter(e => e.date === dateStr);
                
                const hasTournament = dayEvents.some(e => e.category === 'Turniej' || !e.category);
                const hasOther = dayEvents.some(e => e.category === 'Inne');
                const hasOwnTrainer = dayEvents.some(e => e.category === 'Trener' && !e.isMirrored);
                const hasMirroredTrainer = dayEvents.some(e => e.category === 'Trener' && e.isMirrored);
                const hasTrainer = hasOwnTrainer || hasMirroredTrainer;
                const isToday = dateStr === todayStr;
                const typeCount = [hasTournament, hasOther, hasOwnTrainer, hasMirroredTrainer].filter(Boolean).length;

                if (typeCount > 1) {
                  return (
                    <button
                      key={day}
                      onClick={() => handleDayClick(dateStr, dayEvents)}
                      className="h-[34px] flex items-center justify-center active:scale-90 transition-transform"
                    >
                      <div className="w-full h-full rounded-[10px] overflow-hidden flex flex-col relative">
                        {hasTournament && <div className="bg-[#0a3a2a] flex-1" />}
                        {hasOther && <div className="bg-emerald-300 flex-1" />}
                        {hasOwnTrainer && <div className="bg-indigo-500 flex-1" />}
                        {hasMirroredTrainer && <div className="bg-sky-400 flex-1" />}
                        <span className="absolute inset-0 flex items-center justify-center text-white font-black text-[11px] drop-shadow">
                          {day}
                        </span>
                      </div>
                    </button>
                  );
                }

                let bgClass = "bg-gray-50/50";
                let textClass = "text-gray-500";

                if (hasTournament) {
                  bgClass = "bg-[#0a3a2a] shadow-sm";
                  textClass = "text-white font-black";
                } else if (hasOther) {
                  bgClass = "bg-emerald-100";
                  textClass = "text-emerald-800 font-black";
                } else if (hasOwnTrainer) {
                  bgClass = "bg-indigo-500 shadow-sm";
                  textClass = "text-white font-black";
                } else if (hasMirroredTrainer) {
                  bgClass = "bg-sky-400 shadow-sm";
                  textClass = "text-white font-black";
                } else if (isToday) {
                  bgClass = "bg-white border-2 border-[#fed33e] shadow-sm";
                  textClass = "text-[#725b00] font-black";
                }

                return (
                  <button
                    key={day}
                    onClick={() => handleDayClick(dateStr, dayEvents)}
                    className="h-[34px] flex items-center justify-center active:scale-90 transition-transform"
                  >
                    <div className={`w-full h-full flex items-center justify-center rounded-[10px] text-[11px] transition-all ${bgClass} ${textClass}`}>
                      {day}
                    </div>
                  </button>
                )
             })}
           </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-1">

        {todoEvents.length === 0 && upcomingEvents.length === 0 ? (
          <div className="text-center py-10 text-gray-300 flex flex-col items-center">
            <span className="material-symbols-outlined text-4xl mb-2 opacity-50">event_busy</span>
            <p className="font-bold text-[10px] uppercase tracking-widest">{t('calendar.noEvents')}</p>
          </div>
        ) : (
          <>
            {todoEvents.length > 0 && (
              <div className="space-y-1">
                {todoEvents.map(event => (
                  <div
                    key={event.id}
                    onClick={() => setViewingEvent(event)}
                    className="rounded-[24px] border shadow-sm relative transition-all cursor-pointer active:scale-[0.98] flex bg-emerald-50 border-emerald-200 text-[#0a3a2a]"
                  >
                    <span className="absolute top-2 left-3 text-[8px] font-black text-emerald-500 uppercase tracking-widest opacity-60">{t('calendar.todoSection')}</span>
                    <div className="flex-1 p-3 pt-5 flex items-center gap-3">
                      <div className="w-10 h-10 rounded-2xl bg-white border border-emerald-100 flex items-center justify-center shadow-sm shrink-0">
                        <span className="material-symbols-outlined text-emerald-300 text-[22px]">radio_button_unchecked</span>
                      </div>
                      <div className="flex-1 pr-2">
                        <h3 className="font-black text-sm leading-tight">{event.title}</h3>
                        {event.note && (
                          <p className="text-[9px] font-bold text-emerald-600/70 mt-0.5 line-clamp-1">{event.note}</p>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); markTodoComplete(event.id); }}
                      className="w-14 bg-emerald-500 rounded-r-[24px] flex flex-col items-center justify-center hover:bg-emerald-600 active:bg-emerald-700 transition-colors shrink-0 border-l border-emerald-200"
                    >
                      <span className="material-symbols-outlined text-white text-[20px]">check</span>
                    </button>
                  </div>
                ))}
              </div>
            )}

            {upcomingTournaments.length > 0 && (
              <div className="space-y-1">

                {visibleTournaments.map((event, index) => {
                  const isLastVisible = !showAllTournaments && index === visibleTournaments.length - 1;
                  const hiddenCount = upcomingTournaments.length - visibleTournaments.length;

                  return (
                    <div
                      key={event.id}
                      onClick={() => setViewingEvent(event)}
                      className="rounded-[24px] border shadow-sm relative transition-all cursor-pointer active:scale-[0.98] flex bg-gradient-to-br from-[#0a3a2a] to-emerald-900 border-emerald-800 text-white"
                    >
                      <span className="absolute top-2 left-3 text-[7px] font-black text-white/40 uppercase tracking-widest">{t('calendar.upcomingTournaments')}</span>
                      {event.id === nextTournamentId && (
                        <div className="absolute top-2 right-3 bg-[#fed33e] text-[#5d4a00] px-2 py-0.5 rounded-full text-[7px] font-black uppercase tracking-widest shadow-md z-10">
                          {t('calendar.nextStart')}
                        </div>
                      )}

                      <div className="flex-1 p-3 pt-5 flex items-start gap-2.5">
                        <div className="p-1.5 rounded-xl text-center min-w-[48px] border bg-white/10 text-[10px]">
                          <span className="block font-black uppercase leading-tight">{new Date(event.date).toLocaleDateString(currentLocale, { month: 'short' })}</span>
                          <span className="block text-lg font-black leading-none mt-0">{new Date(event.date).getDate()}</span>
                        </div>
                        <div className="flex-1 pr-2">
                          <h3 className="font-black text-sm leading-tight mb-0.5">{event.title}</h3>
                          <div className="flex flex-col gap-0.5 text-[8px] font-bold uppercase tracking-widest opacity-70">
                            {event.distance && <span className="bg-[#fed33e] text-[#5d4a00] px-1.5 py-0.5 rounded w-fit text-[7px]">{event.distance}</span>}
                            <div className="flex items-center gap-1">
                              <span className="material-symbols-outlined text-[10px]">schedule</span> {event.time || t('calendar.wholeDay')}
                            </div>
                          </div>
                        </div>
                      </div>

                      {isLastVisible && hiddenCount > 0 ? (
                         <button
                           onClick={(e) => { e.stopPropagation(); setShowAllTournaments(true); }}
                           className="w-12 bg-black/20 rounded-r-[24px] flex flex-col items-center justify-center hover:bg-black/30 active:bg-black/40 transition-colors shrink-0 border-l border-white/10"
                         >
                           <span className="material-symbols-outlined text-white/70 text-[18px]">add</span>
                           <span className="text-white font-black text-xs leading-none">{hiddenCount}</span>
                         </button>
                      ) : (
                         <div className="w-10 flex items-center justify-center opacity-40 shrink-0">
                           <span className="material-symbols-outlined text-lg">chevron_right</span>
                         </div>
                      )}
                    </div>
                  );
                })}
                
                {showAllTournaments && upcomingTournaments.length > 1 && (
                  <button
                    onClick={() => setShowAllTournaments(false)}
                    className="w-full py-2 bg-gray-50 text-gray-400 font-black text-[9px] uppercase tracking-widest rounded-lg hover:bg-gray-100 active:scale-95 transition-all mt-0.5"
                  >
                    {t('calendar.collapseTournaments')}
                  </button>
                )}
              </div>
            )}

            {upcomingOthers.length > 0 && (
              <div className="space-y-1">

                {visibleOthers.map((event, index) => {
                  const isLastVisible = !showAllOthers && index === visibleOthers.length - 1;
                  const hiddenCount = upcomingOthers.length - visibleOthers.length;

                  return (
                    <div
                      key={event.id}
                      onClick={() => setViewingEvent(event)}
                      className="rounded-[24px] border shadow-sm relative transition-all cursor-pointer active:scale-[0.98] flex bg-emerald-50 border-emerald-100 text-[#0a3a2a]"
                    >
                      <span className="absolute top-2 left-3 text-[8px] font-black text-emerald-500 uppercase tracking-widest opacity-60">{t('calendar.tabOther')}</span>
                      <div className="flex-1 p-3 pt-5 flex items-start gap-2.5">
                        <div className="p-1.5 rounded-xl text-center min-w-[48px] border bg-white shadow-sm text-[10px]">
                          <span className="block font-black uppercase leading-tight">{new Date(event.date).toLocaleDateString(currentLocale, { month: 'short' })}</span>
                          <span className="block text-lg font-black leading-none mt-0">{new Date(event.date).getDate()}</span>
                        </div>
                        <div className="flex-1 pr-2">
                          <h3 className="font-black text-sm leading-tight mb-0.5">{event.title}</h3>
                          <div className="flex flex-col gap-0.5 text-[8px] font-bold uppercase tracking-widest opacity-70">
                            <div className="flex items-center gap-1">
                              <span className="material-symbols-outlined text-[10px]">schedule</span> {event.time || t('calendar.wholeDay')}
                            </div>
                          </div>
                        </div>
                      </div>

                      {isLastVisible && hiddenCount > 0 ? (
                         <button
                           onClick={(e) => { e.stopPropagation(); setShowAllOthers(true); }}
                           className="w-12 bg-emerald-600/10 rounded-r-[24px] flex flex-col items-center justify-center hover:bg-emerald-600/20 active:bg-emerald-600/30 transition-colors shrink-0 border-l border-emerald-900/5"
                         >
                           <span className="material-symbols-outlined text-emerald-600/70 text-[18px]">add</span>
                           <span className="text-emerald-800 font-black text-xs leading-none">{hiddenCount}</span>
                         </button>
                      ) : (
                         <div className="w-10 flex items-center justify-center opacity-40 shrink-0">
                           <span className="material-symbols-outlined text-lg">chevron_right</span>
                         </div>
                      )}
                    </div>
                  );
                })}

                {showAllOthers && upcomingOthers.length > 1 && (
                  <button
                    onClick={() => setShowAllOthers(false)}
                    className="w-full py-2 bg-gray-50 text-gray-400 font-black text-[9px] uppercase tracking-widest rounded-lg hover:bg-gray-100 active:scale-95 transition-all mt-0.5"
                  >
                    {t('calendar.collapseOthers')}
                  </button>
                )}
              </div>
            )}

            {upcomingTrainer.length > 0 && (
              <div className="space-y-1">

                {visibleTrainer.map((event, index) => {
                  const isLastVisible = !showAllTrainer && index === visibleTrainer.length - 1;
                  const hiddenCount = upcomingTrainer.length - visibleTrainer.length;

                  return (
                    <div
                      key={event.id}
                      onClick={() => setViewingEvent(event)}
                      className={`rounded-[24px] border shadow-sm relative transition-all cursor-pointer active:scale-[0.98] flex text-[#0a3a2a] ${event.isMirrored ? 'bg-sky-50 border-sky-100' : 'bg-indigo-50 border-indigo-100'}`}
                    >
                      <span className={`absolute top-2 left-3 text-[8px] font-black uppercase tracking-widest opacity-60 ${event.isMirrored ? 'text-sky-500' : 'text-indigo-500'}`}>{t('calendar.tabTrainer')}</span>
                      <div className="flex-1 p-3 pt-5 flex items-start gap-2.5">
                        <div className="p-1.5 rounded-xl text-center min-w-[48px] border bg-white shadow-sm text-[10px]">
                          <span className="block font-black uppercase leading-tight">{new Date(event.date).toLocaleDateString(currentLocale, { month: 'short' })}</span>
                          <span className="block text-lg font-black leading-none mt-0">{new Date(event.date).getDate()}</span>
                        </div>
                        <div className="flex-1 pr-2">
                          <h3 className="font-black text-sm leading-tight mb-0.5">{event.title}</h3>
                          <div className="flex flex-col gap-0.5 text-[8px] font-bold uppercase tracking-widest opacity-70">
                            <div className="flex items-center gap-1">
                              <span className="material-symbols-outlined text-[10px]">schedule</span> {event.time || t('calendar.wholeDay')}
                            </div>
                          </div>
                          {isCoach && !event.isMirrored && (
                            <div className="flex flex-wrap gap-1 mt-1.5">
                              {(!event.coachStudents || event.coachStudents === 'all') ? (
                                <span className="px-1.5 py-0.5 bg-indigo-100 text-indigo-700 rounded-md text-[8px] font-black leading-none">
                                  {t('calendar.trainerAllStudents')}
                                </span>
                              ) : (
                                (event.coachStudents as string[]).map(sid => {
                                  const s = coachStudentsList.find(cs => cs.id === sid);
                                  return s ? (
                                    <span key={sid} className="px-1.5 py-0.5 bg-indigo-100 text-indigo-700 rounded-md text-[8px] font-black leading-none">
                                      {s.firstName} {s.lastName}
                                    </span>
                                  ) : null;
                                })
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      {isLastVisible && hiddenCount > 0 ? (
                        <button
                          onClick={(e) => { e.stopPropagation(); setShowAllTrainer(true); }}
                          className={`w-12 rounded-r-[24px] flex flex-col items-center justify-center transition-colors shrink-0 border-l ${event.isMirrored ? 'bg-sky-500/10 hover:bg-sky-500/20 active:bg-sky-500/30 border-sky-900/5' : 'bg-indigo-600/10 hover:bg-indigo-600/20 active:bg-indigo-600/30 border-indigo-900/5'}`}
                        >
                          <span className={`material-symbols-outlined text-[18px] ${event.isMirrored ? 'text-sky-500/70' : 'text-indigo-600/70'}`}>add</span>
                          <span className={`font-black text-xs leading-none ${event.isMirrored ? 'text-sky-800' : 'text-indigo-800'}`}>{hiddenCount}</span>
                        </button>
                      ) : (
                        <div className="w-10 flex items-center justify-center opacity-40 shrink-0">
                          <span className="material-symbols-outlined text-lg">chevron_right</span>
                        </div>
                      )}
                    </div>
                  );
                })}

                {showAllTrainer && upcomingTrainer.length > 1 && (
                  <button
                    onClick={() => setShowAllTrainer(false)}
                    className="w-full py-2 bg-gray-50 text-gray-400 font-black text-[9px] uppercase tracking-widest rounded-lg hover:bg-gray-100 active:scale-95 transition-all mt-0.5"
                  >
                    {t('calendar.collapseTrainer')}
                  </button>
                )}
              </div>
            )}
          </>
        )}

        {/* ─── ARCHIWA ─────────────────────────────────────────── */}
        {(() => {
          const ArchiveSection = ({
            label, icon, state, setter, cutoffType, filterFn,
          }: {
            label: string; icon: string;
            state: ArchiveState; setter: React.Dispatch<React.SetStateAction<ArchiveState>>;
            cutoffType: 'turniej' | 'other'; filterFn: (e: Event) => boolean;
          }) => (
            <div className="mt-0.5">
              <button
                onClick={() => openArchiveSection(state, setter, cutoffType, filterFn)}
                className="w-full flex items-center justify-between px-3 py-2 bg-gray-50 border border-gray-100 rounded-lg active:bg-gray-100 transition-all"
              >
                <span className="flex items-center gap-2 text-[10px] font-black text-gray-400 uppercase tracking-widest">
                  <span className="material-symbols-outlined text-[15px] text-gray-300">{icon}</span>
                  {label}
                  {state.loading && <span className="material-symbols-outlined text-[12px] animate-spin text-gray-300">progress_activity</span>}
                  {!state.loading && state.allItems.length > 0 && (
                    <span className="bg-gray-200 text-gray-500 text-[9px] font-black px-1.5 py-0.5 rounded-full leading-none">{state.allItems.length}</span>
                  )}
                </span>
                <span className="material-symbols-outlined text-gray-300 text-[18px]">
                  {state.open ? 'expand_less' : 'expand_more'}
                </span>
              </button>

              {state.open && (
                <div className="space-y-1 mt-1">
                  {state.allItems.length === 0 && !state.loading && (
                    <p className="text-center text-[9px] font-bold text-gray-300 uppercase py-2">{t('calendar.archiveEmpty')}</p>
                  )}
                  {state.allItems.slice(0, state.shown).map(event => (
                    <div
                      key={event.id}
                      onClick={() => setViewingEvent(event)}
                      className="rounded-lg border border-gray-200 bg-gray-50 text-gray-500 opacity-80 shadow-sm transition-all cursor-pointer active:scale-[0.98] flex"
                    >
                      <div className="flex-1 p-2.5 flex items-center gap-2">
                        <div className="px-2 py-1.5 rounded-lg text-center min-w-[48px] border bg-gray-100 border-gray-200 text-[8px]">
                          <span className="block font-black uppercase leading-tight">{new Date(event.date).toLocaleDateString(currentLocale, { month: 'short' })}</span>
                          <span className="block text-base font-black leading-none mt-0">{new Date(event.date).getDate()}</span>
                        </div>
                        <div className="flex-1 pr-1.5">
                          <h3 className="font-black text-xs leading-tight line-through decoration-gray-300">{event.title}</h3>
                          <p className="text-[7px] font-bold uppercase tracking-widest opacity-70 mt-0.5">
                            {event.category === 'Turniej' ? t('calendar.upcomingTournaments') : event.category === 'Trener' ? t('calendar.tabTrainer') : t('calendar.tabOther')}
                          </p>
                        </div>
                      </div>
                      <div className="w-8 flex items-center justify-center opacity-30 shrink-0">
                        <span className="material-symbols-outlined text-sm">chevron_right</span>
                      </div>
                    </div>
                  ))}
                  {state.shown < state.allItems.length && (
                    <button
                      onClick={() => setter(p => ({ ...p, shown: p.shown + 5 }))}
                      className="w-full py-2 bg-gray-50 text-gray-400 font-black text-[9px] uppercase tracking-widest rounded-lg active:bg-gray-100 transition-all flex items-center justify-center gap-1"
                    >
                      <span className="material-symbols-outlined text-[12px]">expand_more</span>
                      {t('calendar.archiveLoadMore')}
                    </button>
                  )}
                </div>
              )}
            </div>
          );

          return (
            <div className="mt-2 space-y-0.5">
              <div className="text-[8px] font-black text-gray-300 uppercase tracking-widest pl-1 pb-0.5">{t('calendar.history')}</div>
              <ArchiveSection label={t('calendar.archiveTournaments')} icon="emoji_events" state={archTurniej} setter={setArchTurniej} cutoffType="turniej" filterFn={e => e.category === 'Turniej' || !e.category} />
              <ArchiveSection label={t('calendar.archiveCalendar')} icon="calendar_month" state={archInne} setter={setArchInne} cutoffType="other" filterFn={e => e.category === 'Inne' && !e.wasATodo} />
              <ArchiveSection label={t('calendar.archiveTrainerReceived')} icon="school" state={archTrainerRec} setter={setArchTrainerRec} cutoffType="other" filterFn={e => e.category === 'Trener' && !!e.isMirrored} />
              <ArchiveSection label={t('calendar.archiveTrainerSent')} icon="send" state={archTrainerSent} setter={setArchTrainerSent} cutoffType="other" filterFn={e => e.category === 'Trener' && !e.isMirrored} />
              <ArchiveSection label={t('calendar.archiveTodo')} icon="check_circle" state={archTodo} setter={setArchTodo} cutoffType="other" filterFn={e => !!e.wasATodo} />
            </div>
          );
        })()}

        <div className="mx-4 mb-6 mt-2 p-4 bg-white rounded-2xl border border-gray-100">
          <p className="text-[9px] font-black uppercase tracking-widest text-gray-400 mb-3">{t('calendar.legend', 'Legenda')}</p>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-[#0a3a2a] flex-shrink-0" />
              <span className="text-[10px] font-bold text-gray-500">{t('calendar.legendTournament', 'Turniej')}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-emerald-300 flex-shrink-0" />
              <span className="text-[10px] font-bold text-gray-500">{t('calendar.legendOther', 'Inne')}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-sky-400 flex-shrink-0" />
              <span className="text-[10px] font-bold text-gray-500">{t('calendar.legendTrainerReceived', 'Moje terminy od trenera')}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-indigo-500 flex-shrink-0" />
              <span className="text-[10px] font-bold text-gray-500">{t('calendar.legendTrainerSent', 'Terminy jako trener')}</span>
            </div>
          </div>
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-start justify-center pt-14 px-4">
          <div className="bg-white w-full max-w-sm rounded-[32px] px-5 pt-4 pb-5 shadow-2xl overflow-y-auto max-h-[90vh] animate-fade-in-up">
             <div className="flex justify-between items-center mb-2 text-[#0a3a2a]">
                <h2 className="text-xl font-black">{editingEventId ? t('calendar.editEvent') : t('calendar.addEvent')}</h2>
                <button onClick={() => { setShowForm(false); resetForm(); }} className="p-2 active:scale-90 bg-red-50 text-red-500 hover:text-red-600 rounded-full transition-colors"><span className="material-symbols-outlined">close</span></button>
             </div>

             <div className="flex p-1 bg-gray-100 rounded-xl mb-3">
               <button onClick={() => setNewCategory('Turniej')} className={`flex-1 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${newCategory === 'Turniej' ? 'bg-[#0a3a2a] text-white shadow-md' : 'text-gray-400'}`}>{t('calendar.tabTournament')}</button>
               <button onClick={() => setNewCategory('Inne')} className={`flex-1 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${newCategory === 'Inne' ? 'bg-emerald-100 text-emerald-700 shadow-md' : 'text-gray-400'}`}>{t('calendar.tabOther')}</button>
               {isCoach && (
                 <button onClick={() => setNewCategory('Trener')} className={`flex-1 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${newCategory === 'Trener' ? 'bg-blue-100 text-blue-700 shadow-md' : 'text-gray-400'}`}>{t('calendar.tabTrainer')}</button>
               )}
             </div>
             
             <div className="space-y-3">
               <input type="text" placeholder={newCategory === 'Turniej' ? t('calendar.formTourName') : newCategory === 'Trener' ? t('calendar.formTrainerName') : t('calendar.formOtherName')} className="w-full bg-emerald-50 border border-emerald-200 rounded-2xl p-3.5 text-sm font-bold text-[#0a3a2a] placeholder:text-emerald-300 focus:outline-none focus:ring-2 focus:ring-emerald-400" value={newTitle} onChange={e => setNewTitle(e.target.value)} />
               
               {newCategory === 'Turniej' && (
                 <div className="space-y-1.5">
                   <label className="text-[10px] font-black text-gray-400 uppercase ml-1 block">{t('calendar.formDistLabel')}</label>
                   <div className="grid grid-cols-5 gap-1">
                     {availableDistances.map(d => (
                       <button key={d} onClick={() => setNewDistance(d)} className={`py-2 rounded-xl text-[10px] font-black border transition-all ${newDistance === d ? 'bg-emerald-100 border-emerald-500 text-emerald-700' : 'bg-gray-50 border-transparent text-gray-400'}`}>{d}</button>
                     ))}
                   </div>
                 </div>
               )}

               {newCategory === 'Trener' && coachStudentsList.length > 0 && (
                 <div className="space-y-1.5">
                   <label className="text-[10px] font-black text-gray-400 uppercase ml-1 block">{t('calendar.trainerStudents')}</label>
                   <div className="flex flex-wrap gap-1.5">
                     <button
                       onClick={() => setNewCoachStudents(newCoachStudents === 'all' ? [] : 'all')}
                       className={`px-3 py-1.5 rounded-xl text-[10px] font-black border transition-all ${newCoachStudents === 'all' ? 'bg-blue-100 border-blue-400 text-blue-700' : 'bg-gray-50 border-transparent text-gray-400'}`}
                     >
                       {t('calendar.trainerAllStudents')}
                     </button>
                     {coachGroups.map(group => {
                       const groupStudentIds = Object.entries(studentGroupMap)
                         .filter(([, groups]) => groups.includes(group.id))
                         .map(([studentId]) => studentId)
                         .filter(id => coachStudentsList.some(s => s.id === id));
                       const selectedArr = newCoachStudents === 'all' ? coachStudentsList.map(s => s.id) : newCoachStudents as string[];
                       const allInGroup = groupStudentIds.length > 0 && groupStudentIds.every(id => selectedArr.includes(id));
                       const someInGroup = groupStudentIds.some(id => selectedArr.includes(id));
                       return (
                         <button
                           key={group.id}
                           onClick={() => {
                             const currentArr = newCoachStudents === 'all' ? coachStudentsList.map(s => s.id) : [...newCoachStudents as string[]];
                             const next = allInGroup
                               ? currentArr.filter(id => !groupStudentIds.includes(id))
                               : Array.from(new Set([...currentArr, ...groupStudentIds]));
                             setNewCoachStudents(next);
                           }}
                           className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-[10px] font-black border transition-all ${allInGroup ? 'bg-indigo-100 border-indigo-400 text-indigo-700' : someInGroup ? 'bg-indigo-50 border-indigo-200 text-indigo-500' : 'bg-gray-50 border-transparent text-gray-400'}`}
                         >
                           <span className="material-symbols-outlined text-[12px]">folder_shared</span>
                           {group.name}
                         </button>
                       );
                     })}
                     {coachGroups.length > 0 && <div className="w-full h-px bg-gray-100 my-0.5" />}
                     {coachStudentsList.map(s => {
                       const isSelected = newCoachStudents === 'all' || (Array.isArray(newCoachStudents) && newCoachStudents.includes(s.id));
                       return (
                         <button
                           key={s.id}
                           onClick={() => {
                             if (newCoachStudents === 'all') {
                               setNewCoachStudents([s.id]);
                             } else {
                               const arr = newCoachStudents as string[];
                               setNewCoachStudents(arr.includes(s.id) ? arr.filter(id => id !== s.id) : [...arr, s.id]);
                             }
                           }}
                           className={`px-3 py-1.5 rounded-xl text-[10px] font-black border transition-all ${isSelected ? 'bg-blue-100 border-blue-400 text-blue-700' : 'bg-gray-50 border-transparent text-gray-400'}`}
                         >
                           {s.firstName} {s.lastName}
                         </button>
                       );
                     })}
                   </div>
                   {(() => {
                     const hasSelected = newCoachStudents === 'all' || (Array.isArray(newCoachStudents) && newCoachStudents.length > 0);
                     return (
                       <p className={`text-[10px] ml-1 mt-1 flex items-center gap-1 ${hasSelected ? 'text-blue-500' : 'text-gray-400'}`}>
                         <span className="material-symbols-outlined text-[12px]">{hasSelected ? 'visibility' : 'visibility_off'}</span>
                         {hasSelected ? t('calendar.trainerPlanHint') : t('calendar.trainerPlanHintNone')}
                       </p>
                     );
                   })()}
                 </div>
               )}

               {newCategory === 'Inne' && (
                 <button
                   type="button"
                   onClick={() => setNewIsTodo(!newIsTodo)}
                   className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl border-2 transition-all ${newIsTodo ? 'bg-emerald-50 border-emerald-400 text-emerald-700' : 'bg-gray-50 border-gray-100 text-gray-400'}`}
                 >
                   <span className={`material-symbols-outlined text-[20px] ${newIsTodo ? 'text-emerald-600' : 'text-gray-300'}`}>
                     {newIsTodo ? 'check_circle' : 'radio_button_unchecked'}
                   </span>
                   <span className="text-[11px] font-black uppercase tracking-widest">{t('calendar.todoToggle')}</span>
                 </button>
               )}

               {!newIsTodo && <div className="space-y-2">
                 <div className="flex items-center gap-1.5 ml-1">
                   <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{t('calendar.modalDateTime')}</label>
                   <div className="relative w-6 h-6">
                     <div className="w-6 h-6 flex items-center justify-center bg-emerald-50 border border-emerald-200 rounded-md text-emerald-600 pointer-events-none">
                       <span className="material-symbols-outlined text-xs">calendar_today</span>
                     </div>
                     <input ref={calendarPickerRef} type="date" className="absolute inset-0 opacity-0 cursor-pointer w-full h-full" onChange={e => { if (e.target.value) { const [y,m,d] = e.target.value.split('-'); setInputYear(y); setInputMonth(m); setInputDay(d); setDateError(''); } }} />
                   </div>
                 </div>
                 <div className="flex gap-1.5">
                   <div className="flex-1 flex flex-col gap-1">
                     <input type="number" placeholder="DD" className={`w-full bg-gray-50 border rounded-xl p-2.5 text-center font-black text-base focus:bg-emerald-50 focus:border-emerald-500 outline-none ${dateError ? 'border-red-400' : 'border-gray-100'}`} value={inputDay} onChange={e => { setInputDay(e.target.value.slice(0,2)); setDateError(''); }} />
                     <span className="text-[8px] text-center font-bold text-gray-300 uppercase">{t('common.day')}</span>
                   </div>
                   <div className="flex-1 flex flex-col gap-1">
                     <input type="number" placeholder="MM" className={`w-full bg-gray-50 border rounded-xl p-2.5 text-center font-black text-base focus:bg-emerald-50 focus:border-emerald-500 outline-none ${dateError ? 'border-red-400' : 'border-gray-100'}`} value={inputMonth} onChange={e => { setInputMonth(e.target.value.slice(0,2)); setDateError(''); }} />
                     <span className="text-[8px] text-center font-bold text-gray-300 uppercase">{t('common.month')}</span>
                   </div>
                   <div className="flex-[1.5] flex flex-col gap-1">
                     <input type="number" placeholder="YYYY" className={`w-full bg-gray-50 border rounded-xl p-2.5 text-center font-black text-base focus:bg-emerald-50 focus:border-emerald-500 outline-none ${dateError ? 'border-red-400' : 'border-gray-100'}`} value={inputYear} onChange={e => { setInputYear(e.target.value.slice(0,4)); setDateError(''); }} />
                     <span className="text-[8px] text-center font-bold text-gray-300 uppercase">{t('common.year')}</span>
                   </div>
                   <div className="flex-[1.5] flex flex-col gap-1">
                     <input type="time" className="w-full bg-[#fed33e] border border-[#e5bd38] rounded-xl p-2.5 text-center font-black text-base text-[#5d4a00] outline-none" value={newTime} onChange={e => setNewTime(e.target.value)} />
                     <span className="text-[8px] text-center font-bold text-gray-400 uppercase">{t('common.hour')}</span>
                   </div>
                 </div>
                 {dateError && (
                   <p className="text-[10px] font-bold text-red-500 text-center mt-1">{dateError}</p>
                 )}
               </div>}

               <input type="text" placeholder={t('calendar.formCity')} className="w-full bg-gray-50 border border-gray-100 rounded-2xl p-4 text-sm font-bold focus:outline-none" value={newAddress} onChange={e => setNewAddress(e.target.value)} />
               <textarea maxLength={120} placeholder={t('calendar.formNotes')} className="w-full bg-gray-50 border border-gray-100 rounded-2xl p-4 text-sm font-bold h-20 resize-none focus:outline-none" value={newNote} onChange={e => setNewNote(e.target.value)} />
               
               <button
                 onClick={saveEvent}
                 disabled={isSaving || !newTitle || (!newIsTodo && (!inputDay || !inputMonth || !inputYear))}
                 className={`w-full py-4 rounded-2xl font-black uppercase tracking-widest shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2 ${(!newTitle || (!newIsTodo && (!inputDay || !inputMonth || !inputYear))) ? 'bg-gray-200 text-gray-400' : 'bg-[#0a3a2a] text-white'}`}
               >
                 {isSaving ? t('calendar.formSaving') : t('calendar.formSave')}
               </button>
             </div>
          </div>
        </div>
      )}

      {dayPickerEvents.length > 0 && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[110] flex items-start justify-center pt-24 px-4">
          <div className="bg-white w-full max-w-sm rounded-[32px] p-5 shadow-2xl animate-fade-in-up">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-base font-black text-[#0a3a2a]">
                {new Date(dayPickerDate).toLocaleDateString(currentLocale, { day: 'numeric', month: 'long' })}
              </h2>
              <button onClick={() => { setDayPickerEvents([]); setDayPickerDate(''); }} className="p-1.5 bg-red-50 text-red-500 rounded-full active:scale-90 transition-colors">
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>
            <div className="space-y-2">
              {dayPickerEvents.map(ev => (
                <button
                  key={ev.id}
                  onClick={() => { setViewingEvent(ev); }}
                  className="w-full flex items-center gap-3 p-3 rounded-2xl border active:scale-[0.98] transition-all text-left"
                  style={{
                    background: ev.category === 'Turniej' ? '#0a3a2a' : ev.category === 'Trener' ? (ev.isMirrored ? '#f0f9ff' : '#eef2ff') : '#f0fdf4',
                    borderColor: ev.category === 'Turniej' ? '#0a3a2a' : ev.category === 'Trener' ? (ev.isMirrored ? '#bae6fd' : '#c7d2fe') : '#bbf7d0',
                  }}
                >
                  <span className={`material-symbols-outlined text-xl ${ev.category === 'Turniej' ? 'text-white' : ev.category === 'Trener' ? (ev.isMirrored ? 'text-sky-500' : 'text-indigo-500') : 'text-emerald-600'}`}>
                    {ev.category === 'Turniej' ? 'emoji_events' : ev.category === 'Trener' ? 'group' : 'event'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className={`font-black text-sm leading-tight truncate ${ev.category === 'Turniej' ? 'text-white' : 'text-[#0a3a2a]'}`}>{ev.title}</p>
                    <p className={`text-[10px] font-bold uppercase tracking-widest mt-0.5 ${ev.category === 'Turniej' ? 'text-white/60' : ev.category === 'Trener' ? (ev.isMirrored ? 'text-sky-500' : 'text-indigo-500') : 'text-emerald-600'}`}>
                      {ev.category === 'Turniej' ? t('calendar.tabTournament') : ev.category === 'Trener' ? t('calendar.tabTrainer') : t('calendar.tabOther')}
                      {ev.time ? ` • ${ev.time}` : ''}
                    </p>
                  </div>
                  <span className={`material-symbols-outlined text-lg ${ev.category === 'Turniej' ? 'text-white/50' : 'text-gray-300'}`}>chevron_right</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {viewingEvent && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[120] flex items-start justify-center pt-24 px-4">
          <div className="bg-white w-full max-w-sm rounded-[32px] p-5 shadow-2xl animate-fade-in-up relative max-h-[85vh] overflow-y-auto">
             
             <div className="flex justify-between items-start mb-4">
                <div>
                  <span className={`inline-block px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest mb-1.5 ${viewingEvent.category === 'Turniej' ? 'bg-[#0a3a2a] text-white' : viewingEvent.category === 'Trener' ? (viewingEvent.isMirrored ? 'bg-sky-100 text-sky-700' : 'bg-indigo-100 text-indigo-700') : 'bg-emerald-100 text-emerald-700'}`}>
                    {viewingEvent.category === 'Turniej' ? t('calendar.tabTournament') : viewingEvent.category === 'Trener' ? t('calendar.tabTrainer') : t('calendar.tabOther')} {viewingEvent.distance ? `- ${viewingEvent.distance}` : ''}
                  </span>
                  <h2 className="text-xl font-black text-[#0a3a2a] leading-tight pr-2">{viewingEvent.title}</h2>
                </div>
                <button onClick={closeViewingModal} className="p-1.5 bg-red-50 text-red-500 hover:text-red-600 rounded-full active:scale-90 shrink-0 transition-colors"><span className="material-symbols-outlined text-lg">close</span></button>
             </div>

             {viewingEvent.category === 'Turniej' && viewingEvent.distance && (() => {
                const sight = getSightMarkForDistance(viewingEvent.distance);
                const isTournamentToday = viewingEvent.date <= todayStr;
                const formattedDate = new Date(viewingEvent.date).toLocaleDateString(currentLocale, { day: '2-digit', month: '2-digit' });
                
                return (
                  <div className="flex gap-2 mb-5 items-stretch">
                      <div className="flex-[7] bg-emerald-50 border border-emerald-100 rounded-[20px] p-2.5 shadow-sm flex flex-col justify-center">
                          <div className="flex items-center gap-1.5 mb-2">
                              <span className="material-symbols-outlined text-[16px] text-emerald-600">visibility</span>
                              <p className="text-[9px] font-black text-emerald-800 uppercase tracking-widest leading-none mt-0.5">{t('calendar.modalSight')} {viewingEvent.distance}</p>
                          </div>
                          <div className="grid grid-cols-3 gap-1">
                              <div className="bg-white rounded-xl py-1.5 px-1 text-center shadow-sm flex flex-col justify-center">
                                  <span className="block text-[8px] font-bold text-gray-400 uppercase tracking-tighter mb-0.5">{t('calendar.modalSightExt')}</span>
                                  <span className="text-xl font-black text-[#0a3a2a] leading-none">{sight?.ext || '-'}</span>
                              </div>
                              <div className="bg-[#0a3a2a] rounded-xl py-1.5 px-1 text-center shadow-md flex flex-col justify-center">
                                  <span className="block text-[8px] font-bold text-emerald-100/50 uppercase tracking-tighter mb-0.5">{t('calendar.modalSightGD')}</span>
                                  <span className="text-2xl font-black text-white leading-none">{sight?.height || '-'}</span>
                              </div>
                              <div className="bg-white rounded-xl py-1.5 px-1 text-center shadow-sm flex flex-col justify-center">
                                  <span className="block text-[8px] font-bold text-gray-400 uppercase tracking-tighter mb-0.5">{t('calendar.modalSightLP')}</span>
                                  <span className="text-xl font-black text-[#0a3a2a] leading-none">{sight?.side || '-'}</span>
                              </div>
                          </div>
                      </div>
                      
                      <button 
                          disabled={!isTournamentToday && !viewingEvent.hasScore}
                          onClick={() => {
                              if (viewingEvent.hasScore) {
                                  onNavigate?.('STATS');
                                  closeViewingModal();
                              } else if (isTournamentToday) {
                                  setShowScoreInput(true);
                              }
                          }} 
                          className={`flex-[3] flex flex-col items-center justify-center rounded-[20px] p-2 transition-all shadow-sm active:scale-95 border-2 ${
                            viewingEvent.hasScore 
                                ? 'bg-emerald-600 text-white border-emerald-500' 
                                : !isTournamentToday 
                                  ? 'bg-gray-50 text-gray-400 border-gray-200 cursor-not-allowed' 
                                  : 'bg-[#fed33e] text-[#5d4a00] border-[#e5bd38]'
                          }`}
                      >
                          <span className="material-symbols-outlined text-[28px] mb-1">
                            {viewingEvent.hasScore ? 'verified' : !isTournamentToday ? 'lock' : 'edit_note'}
                          </span>
                          <span className="text-[10px] font-black uppercase tracking-widest leading-tight text-center whitespace-pre-line">
                              {viewingEvent.hasScore
                                  ? t('calendar.seeResult')
                                  : !isTournamentToday
                                    ? `${t('calendar.modalActiveFrom')}\n${formattedDate}` 
                                    : t('calendar.modalEnterScore').replace(' ', '\n')
                              }
                          </span>
                      </button>
                  </div>
                );
             })()}

             <div className="bg-gray-50 border border-gray-100 rounded-[20px] p-4 mb-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center shadow-sm shrink-0 text-gray-400">
                    <span className="material-symbols-outlined text-[16px]">calendar_today</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest leading-none mb-0.5">{t('calendar.modalDateTime')}</span>
                    <span className="text-sm font-black text-[#0a3a2a]">
                      {viewingEvent.todo ? t('calendar.todoSection') : `${new Date(viewingEvent.date).toLocaleDateString(currentLocale)} • ${viewingEvent.time || '--:--'}`}
                    </span>
                  </div>
                </div>

                {viewingEvent.address && (
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center shadow-sm shrink-0 text-gray-400">
                      <span className="material-symbols-outlined text-[16px]">location_on</span>
                    </div>
                    <div className="flex-1 flex items-center justify-between">
                      <div className="flex flex-col">
                        <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest leading-none mb-0.5">{t('calendar.modalPlace')}</span>
                        <span className="text-sm font-black text-[#0a3a2a] leading-tight pr-2">{viewingEvent.address}</span>
                      </div>
                      <button 
                        onClick={() => openInGoogleMaps(viewingEvent.address)}
                        className="bg-white border border-gray-200 p-2 rounded-xl text-indigo-600 shadow-sm active:scale-90 transition-all flex items-center justify-center"
                      >
                        <span className="material-symbols-outlined text-lg">directions_car</span>
                      </button>
                    </div>
                  </div>
                )}

                {viewingEvent.category === 'Trener' && viewingEvent.coachStudents && (
                  <div className="flex items-start gap-3 pt-3 border-t border-gray-200/60">
                    <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center shadow-sm shrink-0 text-blue-400">
                      <span className="material-symbols-outlined text-[16px]">group</span>
                    </div>
                    <div className="flex flex-col flex-1 mt-1">
                      <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest leading-none mb-1">{t('calendar.trainerStudents')}</span>
                      {viewingEvent.coachStudents === 'all' ? (
                        <span className="text-xs font-black text-blue-700">{t('calendar.trainerAllStudents')}</span>
                      ) : (
                        <div className="flex flex-wrap gap-1 mt-0.5">
                          {(viewingEvent.coachStudents as string[]).map(sid => {
                            const s = coachStudentsList.find(cs => cs.id === sid);
                            return s ? (
                              <span key={sid} className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-lg text-[10px] font-black">
                                {s.firstName} {s.lastName}
                              </span>
                            ) : null;
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {viewingEvent.note && (
                  <div className="flex items-start gap-3 pt-3 border-t border-gray-200/60">
                    <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center shadow-sm shrink-0 text-gray-400">
                      <span className="material-symbols-outlined text-[16px]">notes</span>
                    </div>
                    <div className="flex flex-col flex-1 mt-1">
                      <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest leading-none mb-1">{t('calendar.modalNotes')}</span>
                      <span className="text-xs font-bold text-gray-600 leading-tight italic">{viewingEvent.note}</span>
                    </div>
                  </div>
                )}
             </div>

             {viewingEvent.todo && (
               <button
                 onClick={() => { markTodoComplete(viewingEvent.id); closeViewingModal(); }}
                 className="w-full mb-2 py-3.5 rounded-[16px] font-black text-[10px] uppercase tracking-widest bg-emerald-500 text-white active:scale-95 transition-all flex items-center justify-center gap-2"
               >
                 <span className="material-symbols-outlined text-[16px]">check_circle</span>
                 {t('calendar.todoDone')}
               </button>
             )}

             <div className="flex gap-2">
               <button
                  onClick={handleEditViewing}
                  className="flex-1 py-3.5 rounded-[16px] font-black text-[10px] uppercase tracking-widest bg-gray-100 text-[#0a3a2a] active:scale-95 transition-all"
                >
                  {t('calendar.modalEdit')}
               </button>
               <button
                  onClick={() => handleDeleteEvent(viewingEvent.id)}
                  className="flex-1 py-3.5 rounded-[16px] font-black text-[10px] uppercase tracking-widest bg-red-50 text-red-500 border border-red-100 active:scale-95 transition-all"
                >
                  {t('calendar.modalDelete')}
               </button>
             </div>
          </div>
        </div>
      )}

      {showDeleteConfirm && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[300000] flex items-center justify-center p-6">
          <div className="bg-white rounded-[32px] p-8 w-full max-w-sm text-center shadow-2xl border border-red-50 animate-fade-in-up">
            <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="material-symbols-outlined text-3xl">delete_forever</span>
            </div>
            <h2 className="text-xl font-black text-[#0a3a2a] mb-2 uppercase tracking-tighter">{t('calendar.confirmDelete')}</h2>
            <p className="text-xs text-gray-400 font-bold mb-8 uppercase tracking-widest">{t('settings.coach.confirmRevokeDesc', 'Ta operacja jest nieodwracalna.')}</p>
            <div className="space-y-3">
              <button onClick={confirmDeletion} className="w-full py-4 bg-red-500 text-white rounded-xl font-black uppercase text-[11px] tracking-widest shadow-lg active:scale-95 transition-all">
                {t('announcements.deleteBtn')}
              </button>
              <button onClick={() => setShowDeleteConfirm(null)} className="w-full py-4 bg-gray-100 text-gray-500 rounded-xl font-black uppercase text-[11px] active:scale-95 transition-all">
                {t('setup.warningCancel')}
              </button>
            </div>
          </div>
        </div>, document.body
      )}

      {showScoreInput && viewingEvent && (
        <TournamentScoreInput
          userId={userId}
          eventId={viewingEvent.id}
          tournamentName={viewingEvent.title}
          distance={viewingEvent.distance || '70m'}
          onClose={() => setShowScoreInput(false)}
          onNavigate={onNavigate}
        />
      )}

      <style>{`
        .animate-fade-in-up { animation: fadeInUp 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards; opacity: 0; }
        @keyframes fadeInUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
}