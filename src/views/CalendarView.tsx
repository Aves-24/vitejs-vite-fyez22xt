import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, query, orderBy, onSnapshot, addDoc, updateDoc, deleteDoc, doc, where, getDoc } from 'firebase/firestore';
import { useTranslation } from 'react-i18next'; 
import { createPortal } from 'react-dom'; 

// IMPORTUJEMY NOWY KOMPONENT:
import TournamentScoreInput from '../components/TournamentScoreInput';

interface Event {
  id: string;
  title: string;
  date: string;
  time: string;
  address: string;
  note: string;
  type: string;
  category: 'Turniej' | 'Inne';
  distance?: string; 
  hasScore?: boolean; 
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
  
  // STAN DLA NOWEGO FORMULARZA WYNIKÓW:
  const [showScoreInput, setShowScoreInput] = useState(false);
  
  const [editingEventId, setEditingEventId] = useState<string | null>(null);

  const [calendarDate, setCalendarDate] = useState(new Date());

  const [newCategory, setNewCategory] = useState<'Turniej' | 'Inne'>('Turniej');
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
  
  const [isPremium, setIsPremium] = useState(false);
  const [userSightMarks, setUserSightMarks] = useState<any[]>([]); 

  const [showAllTournaments, setShowAllTournaments] = useState(false);
  const [showAllOthers, setShowAllOthers] = useState(false);
  const [showAllPast, setShowAllPast] = useState(false);

  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);

  const availableDistances = ['18m', '20m', '25m', '30m', '40m', '50m', '60m', '70m', '90m'];
  
  const todayObj = new Date();
  const todayStr = todayObj.toISOString().split('T')[0];

  useEffect(() => {
    if (!userId) return; 
    let unsubscribe: () => void;
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
    };

    setupCalendarData();

    return () => {
      isMounted = false; // Zaznaczamy, że komponent znika
      if (unsubscribe) unsubscribe();
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
    if (focusedEventId && events.length > 0) {
      const ev = events.find(e => e.id === focusedEventId);
      if (ev) setViewingEvent(ev);
    }
  }, [focusedEventId, events]);

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
  };

  const handleOpenNewForm = () => {
    resetForm();
    setShowForm(true);
  };

  const handleDayClick = (dateStr: string, dayEvents: Event[]) => {
    if (dayEvents.length > 0) {
      setViewingEvent(dayEvents[0]);
    } else {
      resetForm(dateStr);
      setShowForm(true);
    }
  };

  const handleEditViewing = () => {
    if (!viewingEvent) return;
    setEditingEventId(viewingEvent.id);
    setNewCategory(viewingEvent.category || 'Turniej');
    setNewTitle(viewingEvent.title);
    setNewDate(viewingEvent.date);
    const dParts = viewingEvent.date.split('-');
    setInputYear(dParts[0] || '');
    setInputMonth(dParts[1] || '');
    setInputDay(dParts[2] || '');
    setNewTime(viewingEvent.time);
    setNewAddress(viewingEvent.address);
    setNewNote(viewingEvent.note);
    if (viewingEvent.distance) setNewDistance(viewingEvent.distance); 
    
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

  const saveEvent = async () => {
    const validationError = validateInputDate(inputDay, inputMonth, inputYear);
    if (validationError) {
      setDateError(validationError);
      return;
    }
    setDateError('');
    const finalDate = `${inputYear}-${String(inputMonth).padStart(2, '0')}-${String(inputDay).padStart(2, '0')}`;
    if (!newTitle || !userId) return;
    setIsSaving(true);
    
    const eventData = {
      category: newCategory, 
      title: newTitle, 
      date: finalDate, 
      time: newTime,
      address: newAddress, 
      note: newNote, 
      distance: newCategory === 'Turniej' ? newDistance : null, 
      type: newCategory === 'Turniej' ? `${t('calendar.upcomingTournaments')} ${newDistance}` : t('calendar.trainingsAndOthers') 
    };

    try {
      if (editingEventId) {
        await updateDoc(doc(db, 'users', userId, 'tournaments', editingEventId), eventData);
      } else {
        await addDoc(collection(db, 'users', userId, 'tournaments'), eventData);
      }
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
        await deleteDoc(doc(db, 'users', userId, 'tournaments', showDeleteConfirm));
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
  const pastEvents = events.filter(e => e.date < todayStr).reverse();

  const upcomingTournaments = upcomingEvents.filter(e => e.category === 'Turniej' || !e.category);
  const upcomingOthers = upcomingEvents.filter(e => e.category === 'Inne');

  const nextTournamentId = upcomingTournaments.length > 0 ? upcomingTournaments[0].id : null;

  const visibleTournaments = showAllTournaments ? upcomingTournaments : upcomingTournaments.slice(0, 1);
  const visibleOthers = showAllOthers ? upcomingOthers : upcomingOthers.slice(0, 1);
  const visiblePast = showAllPast ? pastEvents : pastEvents.slice(0, 3);

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
      
      <div className="px-4 mt-6 mb-4 h-12 flex justify-between items-center shrink-0">
  <div className="flex items-center gap-2 ml-20">
    <div className="flex items-center shrink-0 whitespace-nowrap">
      <span className="text-[20px] font-black text-[#0a3a2a] tracking-tighter leading-none">GROT-X</span>
      <div className="w-1.5 h-1.5 bg-[#fed33e] rounded-full ml-1.5 animate-pulse"></div>
    </div>
    <div className="w-[1.5px] h-[14px] bg-gray-200 rounded-full mx-1"></div>
    <h1 className="text-[11px] font-black text-gray-400 uppercase tracking-[0.15em] leading-none pt-0.5 whitespace-nowrap">
      KALENDAR
    </h1>
  </div>
  
  <button 
    onClick={handleOpenNewForm} 
    className="bg-[#0a3a2a] text-white w-11 h-11 rounded-full shadow-lg flex items-center justify-center active:scale-95 transition-all shrink-0"
  >
    <span className="material-symbols-outlined text-[22px] leading-none font-bold">add</span>
  </button>
</div>

      <div className="px-4 mb-3 shrink-0">
        <div className="bg-white rounded-[24px] border border-gray-100 px-3 py-3 shadow-sm">
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
                const isToday = dateStr === todayStr;

                let bgClass = "bg-gray-50/50";
                let textClass = "text-gray-500";
                
                if (hasTournament) {
                  bgClass = "bg-[#0a3a2a] shadow-sm";
                  textClass = "text-white font-black";
                } else if (hasOther) {
                  bgClass = "bg-emerald-100";
                  textClass = "text-emerald-800 font-black";
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
        
        {upcomingEvents.length === 0 ? (
          <div className="text-center py-10 text-gray-300 flex flex-col items-center">
            <span className="material-symbols-outlined text-4xl mb-2 opacity-50">event_busy</span>
            <p className="font-bold text-[10px] uppercase tracking-widest">{t('calendar.noEvents')}</p>
          </div>
        ) : (
          <>
            {upcomingTournaments.length > 0 && (
              <div className="space-y-1">
                <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest pl-1 border-b border-gray-100 pb-1.5">
                  TURNIERE
                </div>
                
                {visibleTournaments.map((event, index) => {
                  const isLastVisible = !showAllTournaments && index === visibleTournaments.length - 1;
                  const hiddenCount = upcomingTournaments.length - visibleTournaments.length;

                  return (
                    <div 
                      key={event.id} 
                      onClick={() => setViewingEvent(event)}
                      className="rounded-[24px] border shadow-sm relative transition-all cursor-pointer active:scale-[0.98] flex bg-gradient-to-br from-[#0a3a2a] to-emerald-900 border-emerald-800 text-white"
                    >
                      {event.id === nextTournamentId && (
                        <div className="absolute -top-3 left-5 bg-[#fed33e] text-[#5d4a00] px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest shadow-md z-10">
                          {t('calendar.nextStart')}
                        </div>
                      )}

                      <div className="flex-1 p-4 flex items-start gap-3">
                        <div className="p-2.5 rounded-2xl text-center min-w-[56px] border bg-white/10">
                          <span className="block text-[9px] font-black uppercase leading-tight">{new Date(event.date).toLocaleDateString(currentLocale, { month: 'short' })}</span>
                          <span className="block text-xl font-black leading-none mt-0.5">{new Date(event.date).getDate()}</span>
                        </div>
                        <div className="flex-1 pr-2 mt-0.5">
                          <h3 className="font-black text-base leading-tight mb-1">{event.title}</h3>
                          <div className="flex flex-col gap-1 text-[9px] font-bold uppercase tracking-widest opacity-70">
                            <div className="flex items-center gap-2">
                              {event.distance && <span className="bg-[#fed33e] text-[#5d4a00] px-2 py-0.5 rounded-md">{event.distance}</span>}
                              <span>TURNIERE</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <span className="material-symbols-outlined text-[12px]">schedule</span> {event.time || t('calendar.wholeDay')}
                            </div>
                          </div>
                        </div>
                      </div>

                      {isLastVisible && hiddenCount > 0 ? (
                         <button 
                           onClick={(e) => { e.stopPropagation(); setShowAllTournaments(true); }}
                           className="w-[84px] bg-black/20 rounded-r-[24px] flex flex-col items-center justify-center hover:bg-black/30 active:bg-black/40 transition-colors shrink-0 border-l border-white/10"
                         >
                           <span className="material-symbols-outlined text-white/70 text-[24px] mb-0.5">calendar_month</span>
                           <span className="text-white font-black text-2xl leading-none">+{hiddenCount}</span>
                         </button>
                      ) : (
                         <div className="w-14 flex items-center justify-center opacity-40 shrink-0">
                           <span className="material-symbols-outlined">chevron_right</span>
                         </div>
                      )}
                    </div>
                  );
                })}
                
                {showAllTournaments && upcomingTournaments.length > 1 && (
                  <button 
                    onClick={() => setShowAllTournaments(false)}
                    className="w-full py-3.5 bg-gray-50 text-gray-400 font-black text-[10px] uppercase tracking-widest rounded-xl hover:bg-gray-100 active:scale-95 transition-all mt-1"
                  >
                    {t('calendar.collapseTournaments')}
                  </button>
                )}
              </div>
            )}

            {upcomingOthers.length > 0 && (
              <div className="space-y-1">
                <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest pl-1 border-b border-gray-100 pb-1.5 mt-2">
                  KALENDAR
                </div>

                {visibleOthers.map((event, index) => {
                  const isLastVisible = !showAllOthers && index === visibleOthers.length - 1;
                  const hiddenCount = upcomingOthers.length - visibleOthers.length;

                  return (
                    <div 
                      key={event.id} 
                      onClick={() => setViewingEvent(event)}
                      className="rounded-[24px] border shadow-sm relative transition-all cursor-pointer active:scale-[0.98] flex bg-emerald-50 border-emerald-100 text-[#0a3a2a]"
                    >
                      <div className="flex-1 p-4 flex items-start gap-3">
                        <div className="p-2.5 rounded-2xl text-center min-w-[56px] border bg-white shadow-sm">
                          <span className="block text-[9px] font-black uppercase leading-tight">{new Date(event.date).toLocaleDateString(currentLocale, { month: 'short' })}</span>
                          <span className="block text-xl font-black leading-none mt-0.5">{new Date(event.date).getDate()}</span>
                        </div>
                        <div className="flex-1 pr-2 mt-0.5">
                          <h3 className="font-black text-base leading-tight mb-1">{event.title}</h3>
                          <div className="flex flex-col gap-1 text-[9px] font-bold uppercase tracking-widest opacity-70">
                            <div className="flex items-center gap-1">
                              <span className="material-symbols-outlined text-[12px]">schedule</span> {event.time || t('calendar.wholeDay')}
                            </div>
                          </div>
                        </div>
                      </div>

                      {isLastVisible && hiddenCount > 0 ? (
                         <button 
                           onClick={(e) => { e.stopPropagation(); setShowAllOthers(true); }}
                           className="w-[84px] bg-emerald-600/10 rounded-r-[24px] flex flex-col items-center justify-center hover:bg-emerald-600/20 active:bg-emerald-600/30 transition-colors shrink-0 border-l border-emerald-900/5"
                         >
                           <span className="material-symbols-outlined text-emerald-600/70 text-[24px] mb-0.5">calendar_month</span>
                           <span className="text-emerald-800 font-black text-2xl leading-none">+{hiddenCount}</span>
                         </button>
                      ) : (
                         <div className="w-14 flex items-center justify-center opacity-40 shrink-0">
                           <span className="material-symbols-outlined">chevron_right</span>
                         </div>
                      )}
                    </div>
                  );
                })}

                {showAllOthers && upcomingOthers.length > 1 && (
                  <button 
                    onClick={() => setShowAllOthers(false)}
                    className="w-full py-3.5 bg-gray-50 text-gray-400 font-black text-[10px] uppercase tracking-widest rounded-xl hover:bg-gray-100 active:scale-95 transition-all mt-1"
                  >
                    {t('calendar.collapseOthers')}
                  </button>
                )}
              </div>
            )}
          </>
        )}

        {pastEvents.length > 0 && (
          <div className="space-y-1">
            <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest pl-1 border-b border-gray-100 pb-1.5 mt-4">
              {t('calendar.history')}
            </div>

            {visiblePast.map((event, index) => {
              const isLastVisible = !showAllPast && index === visiblePast.length - 1;
              const hiddenCount = pastEvents.length - visiblePast.length;

              return (
                <div 
                  key={event.id} 
                  onClick={() => setViewingEvent(event)}
                  className="rounded-[24px] border border-gray-200 bg-gray-50 text-gray-500 opacity-80 shadow-sm relative transition-all cursor-pointer active:scale-[0.98] flex"
                >
                  <div className="flex-1 p-3 flex items-center gap-3">
                    <div className="px-3 py-2 rounded-xl text-center min-w-[56px] border bg-gray-100 border-gray-200">
                      <span className="block text-[8px] font-black uppercase leading-tight">{new Date(event.date).toLocaleDateString(currentLocale, { month: 'short' })}</span>
                      <span className="block text-lg font-black leading-none mt-0.5">{new Date(event.date).getDate()}</span>
                    </div>
                    <div className="flex-1 pr-2">
                      <h3 className="font-black text-sm leading-tight line-through decoration-gray-300">{event.title}</h3>
                      <p className="text-[8px] font-bold uppercase tracking-widest opacity-70 mt-0.5">{event.category === 'Turniej' ? 'TURNIERE' : 'KALENDAR'}</p>
                    </div>
                  </div>

                  {isLastVisible && hiddenCount > 0 ? (
                     <button 
                       onClick={(e) => { e.stopPropagation(); setShowAllPast(true); }}
                       className="w-[84px] bg-gray-200/50 rounded-r-[24px] flex flex-col items-center justify-center hover:bg-gray-200 active:bg-gray-300 transition-colors shrink-0 border-l border-gray-200"
                     >
                       <span className="material-symbols-outlined text-gray-400 text-[24px] mb-0.5">history</span>
                       <span className="text-gray-500 font-black text-2xl leading-none">+{hiddenCount}</span>
                     </button>
                  ) : (
                     <div className="w-14 flex items-center justify-center opacity-40 shrink-0">
                       <span className="material-symbols-outlined">chevron_right</span>
                     </div>
                  )}
                </div>
              );
            })}

            {showAllPast && pastEvents.length > 3 && (
              <button 
                onClick={() => setShowAllPast(false)}
                className="w-full py-3.5 bg-gray-50 text-gray-400 font-black text-[10px] uppercase tracking-widest rounded-xl hover:bg-gray-100 active:scale-95 transition-all mt-1"
              >
                {t('calendar.collapseHistory')}
              </button>
            )}
          </div>
        )}

        {events.length > 0 && (
          <div className="pt-6 pb-2 px-2 text-center">
            {!isPremium ? (
              <div className="bg-gray-100 p-4 rounded-2xl border border-gray-200 border-dashed">
                <span className="material-symbols-outlined text-[#F2C94C] text-2xl mb-1">lock</span>
                <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest leading-tight">
                  {t('calendar.historyLocked')}<br/>
                  <span className="text-[#0a3a2a]">{t('calendar.proHistoryInfo')}</span>
                </p>
              </div>
            ) : (
              <div className="opacity-50">
                <span className="material-symbols-outlined text-gray-400 text-lg mb-1">history</span>
                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest leading-tight">
                  {t('calendar.proHistoryActive')}<br/>
                  {t('calendar.autoArchive')}
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-start justify-center pt-24 px-4">
          <div className="bg-white w-full max-w-sm rounded-[32px] p-6 shadow-2xl overflow-y-auto max-h-[85vh] animate-fade-in-up">
             <div className="flex justify-between items-center mb-4 text-[#0a3a2a]">
                <h2 className="text-xl font-black">{editingEventId ? t('calendar.editEvent') : t('calendar.addEvent')}</h2>
                <button onClick={() => { setShowForm(false); resetForm(); }} className="p-2 active:scale-90 bg-red-50 text-red-500 hover:text-red-600 rounded-full transition-colors"><span className="material-symbols-outlined">close</span></button>
             </div>

             <div className="flex p-1 bg-gray-100 rounded-2xl mb-4">
               <button onClick={() => setNewCategory('Turniej')} className={`flex-1 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${newCategory === 'Turniej' ? 'bg-[#0a3a2a] text-white shadow-md' : 'text-gray-400'}`}>{t('calendar.tabTournament')}</button>
               <button onClick={() => setNewCategory('Inne')} className={`flex-1 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${newCategory === 'Inne' ? 'bg-emerald-100 text-emerald-700 shadow-md' : 'text-gray-400'}`}>{t('calendar.tabOther')}</button>
             </div>
             
             <div className="space-y-4">
               <input type="text" placeholder={newCategory === 'Turniej' ? t('calendar.formTourName') : t('calendar.formOtherName')} className="w-full bg-gray-50 border border-gray-100 rounded-2xl p-4 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500" value={newTitle} onChange={e => setNewTitle(e.target.value)} />
               
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

               <div className="space-y-2">
                 <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">{t('calendar.modalDateTime')}</label>
                 <div className="flex gap-2">
                   <div className="flex-1 flex flex-col gap-1">
                     <input type="number" placeholder="DD" className={`w-full bg-gray-50 border rounded-xl p-3 text-center font-black text-lg focus:bg-emerald-50 focus:border-emerald-500 outline-none ${dateError ? 'border-red-400' : 'border-gray-100'}`} value={inputDay} onChange={e => { setInputDay(e.target.value.slice(0,2)); setDateError(''); }} />
                     <span className="text-[8px] text-center font-bold text-gray-300 uppercase">{t('common.day')}</span>
                   </div>
                   <div className="flex-1 flex flex-col gap-1">
                     <input type="number" placeholder="MM" className={`w-full bg-gray-50 border rounded-xl p-3 text-center font-black text-lg focus:bg-emerald-50 focus:border-emerald-500 outline-none ${dateError ? 'border-red-400' : 'border-gray-100'}`} value={inputMonth} onChange={e => { setInputMonth(e.target.value.slice(0,2)); setDateError(''); }} />
                     <span className="text-[8px] text-center font-bold text-gray-300 uppercase">{t('common.month')}</span>
                   </div>
                   <div className="flex-[1.5] flex flex-col gap-1">
                     <input type="number" placeholder="YYYY" className={`w-full bg-gray-50 border rounded-xl p-3 text-center font-black text-lg focus:bg-emerald-50 focus:border-emerald-500 outline-none ${dateError ? 'border-red-400' : 'border-gray-100'}`} value={inputYear} onChange={e => { setInputYear(e.target.value.slice(0,4)); setDateError(''); }} />
                     <span className="text-[8px] text-center font-bold text-gray-300 uppercase">{t('common.year')}</span>
                   </div>
                   <div className="flex-[1.5] flex flex-col gap-1">
                     <input type="text" placeholder="00:00" className="w-full bg-[#fed33e] border border-[#e5bd38] rounded-xl p-3 text-center font-black text-lg text-[#5d4a00] outline-none" value={newTime} onChange={e => setNewTime(e.target.value)} />
                     <span className="text-[8px] text-center font-bold text-gray-400 uppercase">{t('common.hour')}</span>
                   </div>
                 </div>
                 {dateError && (
                   <p className="text-[10px] font-bold text-red-500 text-center mt-1">{dateError}</p>
                 )}
               </div>
               
               <input type="text" placeholder={t('calendar.formCity')} className="w-full bg-gray-50 border border-gray-100 rounded-2xl p-4 text-sm font-bold focus:outline-none" value={newAddress} onChange={e => setNewAddress(e.target.value)} />
               <textarea maxLength={120} placeholder={t('calendar.formNotes')} className="w-full bg-gray-50 border border-gray-100 rounded-2xl p-4 text-sm font-bold h-20 resize-none focus:outline-none" value={newNote} onChange={e => setNewNote(e.target.value)} />
               
               <button 
                 onClick={saveEvent} 
                 disabled={isSaving || !newTitle || !inputDay || !inputMonth || !inputYear} 
                 className={`w-full py-4 rounded-2xl font-black uppercase tracking-widest shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2 ${(!newTitle || !inputDay || !inputMonth || !inputYear) ? 'bg-gray-200 text-gray-400' : 'bg-[#0a3a2a] text-white'}`}
               >
                 {isSaving ? t('calendar.formSaving') : t('calendar.formSave')}
               </button>
             </div>
          </div>
        </div>
      )}

      {viewingEvent && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[110] flex items-start justify-center pt-24 px-4">
          <div className="bg-white w-full max-w-sm rounded-[32px] p-5 shadow-2xl animate-fade-in-up relative max-h-[85vh] overflow-y-auto">
             
             <div className="flex justify-between items-start mb-4">
                <div>
                  <span className={`inline-block px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest mb-1.5 ${viewingEvent.category === 'Turniej' ? 'bg-[#0a3a2a] text-white' : 'bg-emerald-100 text-emerald-700'}`}>
                    {viewingEvent.category === 'Turniej' ? t('calendar.tabTournament') : t('calendar.tabOther')} {viewingEvent.distance ? `- ${viewingEvent.distance}` : ''}
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
                    <span className="text-sm font-black text-[#0a3a2a]">{new Date(viewingEvent.date).toLocaleDateString(currentLocale)} • {viewingEvent.time || '--:--'}</span>
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
        />
      )}

      <style>{`
        .animate-fade-in-up { animation: fadeInUp 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards; opacity: 0; }
        @keyframes fadeInUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
}