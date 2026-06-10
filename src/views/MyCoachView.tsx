import React, { useState, useEffect, useCallback, useRef } from 'react';
import { db } from '../firebase';
import { doc, getDoc, updateDoc, collection, query, orderBy, limit, getDocs, addDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { useTranslation } from 'react-i18next';
import CoachLogPanel, { CoachLogLatestEntry } from '../components/CoachLogPanel';
import CoachPlanBanner, { CoachPlanEvent } from '../components/CoachPlanBanner';
import StudentMessageSheet from '../components/StudentMessageSheet';
import TopicPicker from '../components/TopicPicker';
import TopicFeedTab from '../components/TopicFeedTab';

const MAX_ACKED = 50;
const ackedCacheKey = (uid: string) => `grotX_acked_${uid}`;

interface MyCoachViewProps {
  userId: string;
  onBack: () => void;
  onNavigateToSettings?: () => void;
  onNavigateToStats?: (date: string, sessionId?: string) => void;
  pendingOpenCoachId?: string | null;
  onClearPending?: () => void;
  pendingInitialTab?: string | null;
  onClearPendingTab?: () => void;
}

interface CoachInfo {
  id: string;
  firstName: string;
  lastName: string;
  clubName?: string;
}

interface SessionWithNote {
  id: string;
  date: string;
  score: number;
  arrows: number;
  distance: string;
  coachNote: string;
  timestamp: number;
}

interface PrivateNote {
  id: string;
  text: string;
  topics?: string[];
  createdAt: number;
}

export default function MyCoachView({ userId, onBack, onNavigateToSettings, onNavigateToStats, pendingOpenCoachId, onClearPending, pendingInitialTab, onClearPendingTab }: MyCoachViewProps) {
  const { t } = useTranslation();
  const [coaches, setCoaches] = useState<CoachInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'plan' | 'diary' | 'tips' | 'notes' | 'topics' | null>(null);

  const hasCoach = !isLoading && coaches.length > 0;
  const COACH_TABS = ['plan', 'diary', 'tips'];
  const [planCount, setPlanCount] = useState(0);
  const [diaryCount, setDiaryCount] = useState(0);
  const [sessionNotes, setSessionNotes] = useState<SessionWithNote[]>([]);
  const [sessionNotesLoading, setSessionNotesLoading] = useState(true);
  const [unreadCoachIds, setUnreadCoachIds] = useState<Set<string>>(new Set());
  const [openMessageCoach, setOpenMessageCoach] = useState<CoachInfo | null>(null);
  const [latestPlanEvent, setLatestPlanEvent] = useState<CoachPlanEvent | null>(null);
  const [latestDiaryEntry, setLatestDiaryEntry] = useState<CoachLogLatestEntry | null>(null);

  // Private notes
  const [privateNotes, setPrivateNotes] = useState<PrivateNote[]>([]);
  const [privateNotesLoading, setPrivateNotesLoading] = useState(true);
  const [newNoteText, setNewNoteText] = useState('');
  const [newNoteTopics, setNewNoteTopics] = useState<string[]>([]);
  const [isSavingNote, setIsSavingNote] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<any>(null);
  const hasSpeechAPI = typeof window !== 'undefined' && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);

  useEffect(() => {
    if (!pendingOpenCoachId || isLoading) return;
    const coach = coaches.find(c => c.id === pendingOpenCoachId);
    if (coach) {
      setOpenMessageCoach(coach);
      onClearPending?.();
    }
  }, [pendingOpenCoachId, coaches, isLoading]);

  // Apply initial tab from navigation (e.g. coach_note notification → "tips")
  useEffect(() => {
    if (!pendingInitialTab) return;
    if (pendingInitialTab === 'plan' || pendingInitialTab === 'diary'
        || pendingInitialTab === 'tips' || pendingInitialTab === 'notes') {
      setActiveTab(pendingInitialTab);
    }
    onClearPendingTab?.();
  }, [pendingInitialTab]);

  const [acknowledgedList, setAcknowledgedList] = useState<string[]>(() => {
    try {
      const cached = localStorage.getItem(ackedCacheKey(userId));
      return cached ? JSON.parse(cached) : [];
    } catch { return []; }
  });
  const acknowledgedIds = new Set(acknowledgedList);

  useEffect(() => {
    const fetchCoaches = async () => {
      if (!userId) return;
      setIsLoading(true);
      try {
        const userDoc = await getDoc(doc(db, 'users', userId));
        if (!userDoc.exists()) { setIsLoading(false); return; }

        const data = userDoc.data();
        const remote: string[] = data.acknowledgedItems || [];
        setAcknowledgedList(prev => {
          const merged = [...new Set([...prev, ...remote])].slice(0, MAX_ACKED);
          try { localStorage.setItem(ackedCacheKey(userId), JSON.stringify(merged)); } catch { /* ignore */ }
          return merged;
        });

        const coachIds: string[] = data.coaches || [];
        if (coachIds.length === 0) { setCoaches([]); setIsLoading(false); return; }

        const list: CoachInfo[] = [];
        await Promise.all(coachIds.map(async cid => {
          try {
            const cDoc = await getDoc(doc(db, 'users', cid));
            if (cDoc.exists()) {
              const d = cDoc.data();
              list.push({ id: cid, firstName: d.firstName || '', lastName: d.lastName || '', clubName: d.clubName || '' });
            }
          } catch { /* ignore */ }
        }));
        setCoaches(list);

        const unread = new Set<string>();
        await Promise.all(list.map(async c => {
          try {
            const snap = await getDoc(doc(db, `users/${c.id}/studentMessages/${userId}`));
            if (snap.exists()) {
              const d = snap.data();
              if ((d.lastCoachAt || 0) > (d.lastStudentReadAt || 0)) unread.add(c.id);
            }
          } catch { /* ignore */ }
        }));
        setUnreadCoachIds(unread);
      } catch (e) {
        console.error('MyCoachView: błąd pobierania trenerów', e);
      }
      setIsLoading(false);
    };
    fetchCoaches();
  }, [userId]);

  useEffect(() => {
    const fetchSessionNotes = async () => {
      if (!userId) { setSessionNotesLoading(false); return; }
      setSessionNotesLoading(true);
      try {
        const snap = await getDocs(query(
          collection(db, `users/${userId}/sessions`),
          orderBy('timestamp', 'desc'),
          limit(60)
        ));
        const withNote: SessionWithNote[] = [];
        snap.docs.forEach(d => {
          const data = d.data();
          if (!data.coachNote) return;
          const ts = data.timestamp?.toMillis
            ? data.timestamp.toMillis()
            : data.timestamp?.seconds
            ? data.timestamp.seconds * 1000
            : (typeof data.timestamp === 'number' ? data.timestamp : 0);
          withNote.push({
            id: d.id, date: data.date || '', score: data.score || 0,
            arrows: data.arrows || 0, distance: data.distance || '',
            coachNote: data.coachNote, timestamp: ts,
          });
        });
        setSessionNotes(withNote);
      } catch (e) {
        console.error('MyCoachView: błąd pobierania notatek sesji', e);
      }
      setSessionNotesLoading(false);
    };
    fetchSessionNotes();
  }, [userId]);

  useEffect(() => {
    const fetchPrivateNotes = async () => {
      if (!userId) { setPrivateNotesLoading(false); return; }
      setPrivateNotesLoading(true);
      try {
        const snap = await getDocs(query(
          collection(db, `users/${userId}/privateNotes`),
          orderBy('createdAt', 'desc'),
          limit(50)
        ));
        const notes: PrivateNote[] = snap.docs.map(d => {
          const data = d.data();
          const ts = data.createdAt?.toMillis
            ? data.createdAt.toMillis()
            : data.createdAt?.seconds
            ? data.createdAt.seconds * 1000
            : Date.now();
          return { id: d.id, text: data.text || '', topics: data.topics || [], createdAt: ts };
        });
        setPrivateNotes(notes);
      } catch (e) {
        console.error('MyCoachView: błąd pobierania prywatnych notatek', e);
      }
      setPrivateNotesLoading(false);
    };
    fetchPrivateNotes();
  }, [userId]);

  const handleAcknowledge = useCallback((id: string) => {
    let toSave: string[] = [];
    setAcknowledgedList(prev => {
      const updated = [id, ...prev.filter(x => x !== id)].slice(0, MAX_ACKED);
      toSave = updated;
      return updated;
    });
    try { localStorage.setItem(ackedCacheKey(userId), JSON.stringify(toSave)); } catch { /* ignore */ }
    updateDoc(doc(db, 'users', userId), { acknowledgedItems: toSave }).catch(() => { /* ignore */ });
  }, [userId]);

  const handleAddNote = async () => {
    if (!newNoteText.trim() || isSavingNote) return;
    setIsSavingNote(true);
    try {
      const ref = await addDoc(collection(db, `users/${userId}/privateNotes`), {
        text: newNoteText.trim(),
        topics: newNoteTopics,
        createdAt: serverTimestamp(),
      });
      setPrivateNotes(prev => [{ id: ref.id, text: newNoteText.trim(), topics: newNoteTopics, createdAt: Date.now() }, ...prev]);
      setNewNoteText('');
      setNewNoteTopics([]);
      if (textareaRef.current) textareaRef.current.style.height = 'auto';
    } catch (e) {
      console.error('MyCoachView: błąd dodawania notatki', e);
    }
    setIsSavingNote(false);
  };

  const handleToggleRecording = () => {
    if (!hasSpeechAPI) return;
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (isRecording) {
      recognitionRef.current?.stop();
      return;
    }

    const rec = new SR();
    rec.lang = 'pl-PL';
    rec.continuous = true;
    rec.interimResults = false;

    rec.onresult = (e: any) => {
      const transcript = Array.from(e.results)
        .slice(e.resultIndex)
        .map((r: any) => r[0].transcript)
        .join('');
      setNewNoteText(prev => {
        const sep = prev && !prev.endsWith(' ') ? ' ' : '';
        const next = prev + sep + transcript;
        if (textareaRef.current) {
          textareaRef.current.style.height = 'auto';
          textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
        }
        return next;
      });
    };

    rec.onerror = () => {
      setIsRecording(false);
    };

    rec.onend = () => {
      setIsRecording(false);
    };

    recognitionRef.current = rec;
    rec.start();
    setIsRecording(true);
  };

  const handleDeleteNote = async (noteId: string) => {
    try {
      await deleteDoc(doc(db, `users/${userId}/privateNotes/${noteId}`));
      setPrivateNotes(prev => prev.filter(n => n.id !== noteId));
    } catch (e) {
      console.error('MyCoachView: błąd usuwania notatki', e);
    }
    setConfirmDeleteId(null);
  };

  const unreadNotes = sessionNotes.filter(s => !acknowledgedIds.has(s.id));
  const readNotes = sessionNotes.filter(s => acknowledgedIds.has(s.id)).slice(0, 10);

  const formatNoteDate = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
  };

  return (
    <div className="flex flex-col min-h-screen bg-[#fcfdfe] relative overflow-x-hidden">

      {/* HEADER */}
      <div className="bg-gradient-to-b from-[#0a3a2a] to-[#0d4a36] pt-[calc(env(safe-area-inset-top)+1rem)] pb-4 px-5 rounded-b-[36px] shadow-xl shadow-[#0a3a2a]/20 relative z-20 shrink-0">
        <div className="flex items-center gap-4">
          <button onClick={() => (activeTab ? setActiveTab(null) : onBack())} className="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center text-white hover:bg-white/20 transition-all active:scale-90 shrink-0">
            <span className="material-symbols-outlined">arrow_back</span>
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-black text-white leading-tight truncate">
              {activeTab
                ? t(`myCoach.tab${activeTab.charAt(0).toUpperCase()}${activeTab.slice(1)}`)
                : t('myCoach.headerLabel')}
            </h1>
            {!isLoading && coaches.length > 0 && (
              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                {coaches.map(c => {
                  const initials = `${c.firstName[0] || ''}${c.lastName[0] || ''}`.toUpperCase();
                  const hasUnread = unreadCoachIds.has(c.id);
                  return (
                    <button
                      key={c.id}
                      onClick={() => setOpenMessageCoach(c)}
                      className="flex items-center gap-1 bg-white/10 hover:bg-white/20 active:scale-95 transition-all rounded-full pl-0.5 pr-2 py-0.5 relative"
                    >
                      <div className="w-5 h-5 bg-[#fed33e] rounded-full flex items-center justify-center shrink-0 relative">
                        <span className="text-[8px] font-black text-[#0a3a2a]">{initials || '?'}</span>
                        {hasUnread && <div className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-red-500 border border-white rounded-full" />}
                      </div>
                      <span className="text-[9px] font-black text-white/80 truncate max-w-[80px]">{c.firstName} {c.lastName}</span>
                      <span className="material-symbols-outlined text-[11px] text-white/40">chat</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <div className="flex items-center shrink-0">
            <span className="text-base font-black text-white tracking-tighter leading-none">GROT-X</span>
            <div className="bg-[#fed33e] w-1.5 h-1.5 rounded-full ml-1" />
          </div>
        </div>
      </div>

      {/* DASHBOARD — single navigation, grouped by content owner */}
      {!isLoading && activeTab === null && (() => {
        const tip = unreadNotes[0] || readNotes[0];
        const trunc = (s: string, n = 42) => (s.length > n ? s.slice(0, n) + '…' : s);

        const DashRow = ({ section, icon, accent, title, subtitle, badge, locked }: {
          section: 'plan' | 'diary' | 'tips' | 'notes' | 'topics';
          icon: string; accent: string; title: string; subtitle: string; badge: number; locked: boolean;
        }) => (
          <button
            onClick={() => setActiveTab(section)}
            className="w-full flex items-center gap-3 p-3.5 text-left active:bg-gray-50 transition-colors"
          >
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${locked ? 'bg-gray-100' : accent}`}>
              <span className={`material-symbols-outlined text-[20px] ${locked ? 'text-gray-300' : 'text-white'}`}>
                {locked ? 'lock' : icon}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-black text-[#0a3a2a] truncate">{title}</span>
                {!locked && badge > 0 && (
                  <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-emerald-600 text-white text-[9px] font-black flex items-center justify-center shrink-0">{badge}</span>
                )}
              </div>
              <p className="text-[11px] font-medium text-gray-400 truncate mt-0.5">{subtitle}</p>
            </div>
            <span className="material-symbols-outlined text-[20px] text-gray-300 shrink-0">chevron_right</span>
          </button>
        );

        return (
          <div className="flex-1 overflow-y-auto pb-32 px-4 pt-4 space-y-5">
            {/* OD TRENERA */}
            <div>
              <h2 className="text-[11px] font-black text-gray-400 uppercase tracking-widest px-1 mb-2">{t('myCoach.groupCoach')}</h2>
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm divide-y divide-gray-50 overflow-hidden">
                <DashRow
                  section="plan" icon="event" accent="bg-[#0a3a2a]" badge={planCount} locked={!hasCoach}
                  title={t('myCoach.tabPlan')}
                  subtitle={!hasCoach ? t('myCoach.lockedHint')
                    : latestPlanEvent ? `${latestPlanEvent.title}${latestPlanEvent.date ? ` · ${latestPlanEvent.date}` : ''}`
                    : t('myCoach.noUpcoming')}
                />
                <DashRow
                  section="diary" icon="edit_note" accent="bg-amber-500" badge={diaryCount} locked={!hasCoach}
                  title={t('myCoach.tabDiary')}
                  subtitle={!hasCoach ? t('myCoach.lockedHint')
                    : latestDiaryEntry ? trunc(latestDiaryEntry.text) : t('myCoach.noEntries')}
                />
                <DashRow
                  section="tips" icon="sports" accent="bg-blue-600" badge={unreadNotes.length} locked={!hasCoach}
                  title={t('myCoach.tabTips')}
                  subtitle={!hasCoach ? t('myCoach.lockedHint')
                    : tip ? trunc(tip.coachNote) : t('myCoach.noTips')}
                />
              </div>
            </div>

            {/* MOJE */}
            <div>
              <h2 className="text-[11px] font-black text-gray-400 uppercase tracking-widest px-1 mb-2">{t('myCoach.groupMine')}</h2>
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm divide-y divide-gray-50 overflow-hidden">
                <DashRow
                  section="notes" icon="shield_person" accent="bg-indigo-600" badge={privateNotes.length} locked={false}
                  title={t('myCoach.tabNotes')}
                  subtitle={privateNotes.length > 0 ? trunc(privateNotes[0].text) : t('myCoach.noNotes')}
                />
                <DashRow
                  section="topics" icon="psychology" accent="bg-emerald-600" badge={0} locked={false}
                  title={t('myCoach.tabTopics')}
                  subtitle={t('myCoach.topicsHint')}
                />
              </div>
            </div>
          </div>
        );
      })()}

      {/* SECTION CONTENT — kept mounted (hidden) on dashboard so previews/counts stay fed */}
      <div className={`flex-1 overflow-y-auto pb-32 px-5 pt-3 ${activeTab === null ? 'hidden' : ''}`}>

        {isLoading && (
          <div className="text-center py-10">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{t('myCoach.loading')}</span>
          </div>
        )}

        {/* Ekran "wymaga trenera" — wspólny dla Plan/Diary/Tips */}
        {!isLoading && !hasCoach && activeTab !== null && COACH_TABS.includes(activeTab) && (
          <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
              <span className="material-symbols-outlined text-gray-300 text-3xl">lock</span>
            </div>
            <h3 className="text-base font-black text-[#0a3a2a] mb-2">{t('myCoach.requiresCoach')}</h3>
            <p className="text-[11px] font-bold text-gray-400 leading-snug mb-5 max-w-[240px]">{t('myCoach.requiresCoachDesc')}</p>
            {onNavigateToSettings && (
              <button
                onClick={onNavigateToSettings}
                className="flex items-center gap-2 bg-[#0a3a2a] text-white px-4 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest active:scale-95 transition-all"
              >
                <span className="material-symbols-outlined text-[14px]">settings</span>
                {t('myCoach.addCoach')}
              </button>
            )}
          </div>
        )}

        {/* Plan */}
        <div className={activeTab === 'plan' && (hasCoach || isLoading) ? '' : 'hidden'}>
          <div className="mb-3 px-3 py-2 bg-[#0a3a2a]/5 border border-[#0a3a2a]/10 rounded-xl flex items-start gap-1.5">
            <span className="material-symbols-outlined text-[14px] text-[#0a3a2a] mt-px shrink-0">info</span>
            <p className="text-[10px] font-semibold text-[#0a3a2a] leading-snug">{t('myCoach.planDesc')}</p>
          </div>
          {!isLoading && (
            coaches.length > 0 ? (
              <>
                <CoachPlanBanner
                  userId={userId}
                  compact={false}
                  onCountChange={setPlanCount}
                  onLatestEvent={setLatestPlanEvent}
                  acknowledgedIds={acknowledgedIds}
                  onAcknowledge={handleAcknowledge}
                />
                <div className="text-center mt-4">
                  <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">
                    {t('myCoach.planNote')}
                  </p>
                </div>
              </>
            ) : (
              <div className="bg-gray-50 rounded-[20px] p-8 text-center border border-dashed border-gray-200">
                <span className="material-symbols-outlined text-gray-200 text-4xl mb-2 block">event_busy</span>
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{t('myCoach.noPlan')}</p>
              </div>
            )
          )}
        </div>

        {/* Tagebuch */}
        <div className={activeTab === 'diary' && (hasCoach || isLoading) ? '' : 'hidden'}>
          {!isLoading && (
            coaches.length > 0 ? (
              <CoachLogPanel
                studentId={userId}
                currentUserId={userId}
                mode="student"
                onCountChange={setDiaryCount}
                onLatestEntry={setLatestDiaryEntry}
                acknowledgedIds={acknowledgedIds}
                onAcknowledge={handleAcknowledge}
              />
            ) : (
              <div className="bg-gray-50 rounded-[20px] p-8 text-center border border-dashed border-gray-200">
                <span className="material-symbols-outlined text-gray-200 text-4xl mb-2 block">menu_book</span>
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{t('myCoach.noDiary')}</p>
              </div>
            )
          )}
        </div>

        {/* Wskazówki */}
        <div className={activeTab === 'tips' && (hasCoach || isLoading) ? '' : 'hidden'}>
          <div className="mb-3 px-3 py-2 bg-blue-50 border border-blue-100 rounded-xl flex items-start gap-1.5">
            <span className="material-symbols-outlined text-[14px] text-blue-600 mt-px shrink-0">info</span>
            <p className="text-[10px] font-semibold text-blue-700 leading-snug">{t('myCoach.tipsDesc')}</p>
          </div>
          {sessionNotesLoading ? (
            <div className="text-center py-10">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{t('myCoach.loading')}</span>
            </div>
          ) : unreadNotes.length === 0 && readNotes.length === 0 ? (
            <div className="bg-gray-50 rounded-[20px] p-8 text-center border border-dashed border-gray-200">
              <span className="material-symbols-outlined text-gray-200 text-4xl mb-2 block">sports</span>
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{t('myCoach.noTips')}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {unreadNotes.length > 0 && (
                <div className="bg-white rounded-[20px] border border-gray-100 shadow-sm overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
                    <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center shrink-0">
                      <span className="material-symbols-outlined text-white text-[15px]">sports</span>
                    </div>
                    <div className="leading-tight">
                      <h3 className="text-sm font-black text-[#0a3a2a]">{t('myCoach.sessionNotesTitle')}</h3>
                      <p className="text-[8px] font-bold text-gray-400 uppercase tracking-widest">
                        {t('myCoach.sessionNotesSubtitle')} · {unreadNotes.length}
                      </p>
                    </div>
                  </div>
                  <div className="divide-y divide-gray-50">
                    {unreadNotes.map(s => {
                      const pts = s.arrows > 0 ? Math.round((s.score / (s.arrows * 10)) * 100) : 0;
                      const dateLabel = s.date
                        ? new Date(s.date + 'T00:00:00').toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })
                        : '';
                      return (
                        <div key={s.id} className="flex items-start">
                          <button
                            onClick={() => s.date && onNavigateToStats?.(s.date, s.id)}
                            className="flex-1 text-left p-3 flex items-start gap-2.5 active:bg-blue-50 transition-colors group"
                          >
                            <div className="w-7 h-7 rounded-lg bg-blue-50 group-active:bg-blue-100 flex items-center justify-center shrink-0 mt-0.5 transition-colors">
                              <span className="material-symbols-outlined text-[14px] text-blue-500">sports</span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-baseline justify-between gap-2 mb-0.5">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  {s.distance && <span className="text-[8px] font-black text-blue-700 uppercase tracking-widest">{s.distance}</span>}
                                  <span className="text-[8px] font-bold text-gray-400">{s.score} {t('myCoach.pts')} · {pts}%</span>
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                  <span className="text-[8px] font-bold text-gray-400">{dateLabel}</span>
                                  <span className="material-symbols-outlined text-[12px] text-gray-300 group-active:text-blue-400 transition-colors">chevron_right</span>
                                </div>
                              </div>
                              <p className="text-[11px] font-bold text-[#333] leading-snug whitespace-pre-wrap break-words">"{s.coachNote}"</p>
                            </div>
                          </button>
                          <button
                            onClick={() => handleAcknowledge(s.id)}
                            className="shrink-0 w-10 flex items-center justify-center self-stretch text-gray-300 hover:text-emerald-500 active:scale-90 transition-all"
                            title={t('myCoach.acknowledged')}
                          >
                            <span className="material-symbols-outlined text-[20px]">check_circle</span>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              {readNotes.length > 0 && (
                <div className="bg-gray-50 rounded-[20px] border border-gray-100 overflow-hidden">
                  <div className="px-4 py-2 border-b border-gray-100 flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[14px] text-gray-400">check_circle</span>
                    <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest">{t('myCoach.readHistory')} · {readNotes.length}</span>
                  </div>
                  <div className="divide-y divide-gray-100">
                    {readNotes.map(s => {
                      const pts = s.arrows > 0 ? Math.round((s.score / (s.arrows * 10)) * 100) : 0;
                      const dateLabel = s.date
                        ? new Date(s.date + 'T00:00:00').toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })
                        : '';
                      return (
                        <button
                          key={s.id}
                          onClick={() => s.date && onNavigateToStats?.(s.date, s.id)}
                          className="w-full text-left p-3 flex items-start gap-2.5 active:bg-gray-100 transition-colors group opacity-75"
                        >
                          <div className="w-7 h-7 rounded-lg bg-gray-200 flex items-center justify-center shrink-0 mt-0.5">
                            <span className="material-symbols-outlined text-[14px] text-gray-400">sports</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-baseline justify-between gap-2 mb-0.5">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                {s.distance && <span className="text-[8px] font-black text-gray-500 uppercase tracking-widest">{s.distance}</span>}
                                <span className="text-[8px] font-bold text-gray-400">{s.score} {t('myCoach.pts')} · {pts}%</span>
                              </div>
                              <span className="text-[8px] font-bold text-gray-400 shrink-0">{dateLabel}</span>
                            </div>
                            <p className="text-[11px] font-bold text-gray-500 leading-snug whitespace-pre-wrap break-words">"{s.coachNote}"</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Prywatne notatki */}
        <div className={activeTab === 'notes' ? '' : 'hidden'}>
          <div className="mb-3 px-3 py-2 bg-indigo-50 border border-indigo-100 rounded-xl flex items-start gap-1.5">
            <span className="material-symbols-outlined text-[14px] text-indigo-500 mt-px shrink-0">info</span>
            <p className="text-[10px] font-semibold text-indigo-700 leading-snug">{t('myCoach.notesDesc')}</p>
          </div>

          {/* Add note form */}
          <div className={`bg-white rounded-[20px] border shadow-sm p-3 mb-3 transition-all ${isRecording ? 'border-red-300 shadow-red-100' : 'border-gray-100'}`}>
            {isRecording && (
              <div className="flex items-center gap-2 mb-2 px-1">
                <span className="inline-block w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                <span className="text-[10px] font-black text-red-500 uppercase tracking-widest">
                  {t('myCoach.notesMicRecording', { defaultValue: 'Nagrywanie…' })}
                </span>
              </div>
            )}
            <textarea
              ref={textareaRef}
              value={newNoteText}
              onChange={e => {
                setNewNoteText(e.target.value);
                e.target.style.height = 'auto';
                e.target.style.height = `${e.target.scrollHeight}px`;
              }}
              onKeyDown={e => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleAddNote();
              }}
              placeholder={t('myCoach.notesPlaceholder')}
              rows={2}
              className="w-full text-[12px] font-medium text-gray-700 placeholder-gray-300 resize-none outline-none leading-relaxed"
              style={{ minHeight: '48px' }}
            />
            <div className="mt-2 mb-1">
              <TopicPicker selectedTopics={newNoteTopics} onChange={setNewNoteTopics} />
            </div>
            <div className="flex items-center justify-between mt-2">
              {hasSpeechAPI ? (
                <button
                  onClick={handleToggleRecording}
                  className={`w-8 h-8 flex items-center justify-center rounded-xl transition-all active:scale-95 ${
                    isRecording ? 'bg-red-500 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                  }`}
                >
                  <span className="material-symbols-outlined text-[18px]">
                    {isRecording ? 'stop' : 'mic'}
                  </span>
                </button>
              ) : (
                <span />
              )}
              <button
                onClick={handleAddNote}
                disabled={!newNoteText.trim() || isSavingNote}
                className="bg-indigo-600 text-white text-[10px] font-black uppercase tracking-widest px-4 py-1.5 rounded-xl disabled:opacity-40 active:scale-95 transition-all"
              >
                {t('myCoach.notesAdd')}
              </button>
            </div>
          </div>

          {/* Notes list */}
          {privateNotesLoading ? (
            <div className="text-center py-6">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{t('myCoach.loading')}</span>
            </div>
          ) : privateNotes.length === 0 ? (
            <div className="bg-gray-50 rounded-[20px] p-8 text-center border border-dashed border-gray-200">
              <span className="material-symbols-outlined text-gray-200 text-4xl mb-2 block">edit_note</span>
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{t('myCoach.noNotes')}</p>
              <p className="text-[9px] font-medium text-gray-300 mt-1">{t('myCoach.notesEmpty')}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {privateNotes.map(note => (
                <div key={note.id} className={`bg-white rounded-2xl border shadow-sm overflow-hidden transition-all ${confirmDeleteId === note.id ? 'border-red-200' : 'border-gray-100'}`}>
                  <div className="p-3.5 flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-medium text-gray-700 leading-relaxed whitespace-pre-wrap break-words">{note.text}</p>
                      {note.topics && note.topics.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {note.topics.map(id => (
                            <span key={id} className="bg-indigo-50 text-indigo-600 border border-indigo-100 px-2 py-0.5 rounded-full text-[8px] font-black">
                              {t(`sessionSetup.topic_${id}`)}
                            </span>
                          ))}
                        </div>
                      )}
                      <p className="text-[8px] font-bold text-gray-300 mt-1.5">{formatNoteDate(note.createdAt)}</p>
                    </div>
                    <button
                      onClick={() => setConfirmDeleteId(confirmDeleteId === note.id ? null : note.id)}
                      className={`shrink-0 active:scale-90 transition-all mt-0.5 ${confirmDeleteId === note.id ? 'text-red-400' : 'text-gray-200 hover:text-red-400'}`}
                    >
                      <span className="material-symbols-outlined text-[18px]">delete</span>
                    </button>
                  </div>
                  {confirmDeleteId === note.id && (
                    <div className="flex items-center gap-2 px-3.5 pb-3">
                      <span className="text-[10px] font-black text-red-500 flex-1">{t('myCoach.notesDeleteTitle')}</span>
                      <button
                        onClick={() => setConfirmDeleteId(null)}
                        className="px-3 py-1 bg-gray-100 text-gray-500 rounded-lg font-black text-[9px] uppercase tracking-widest active:scale-95 transition-all"
                      >
                        {t('coachLog.cancel', { defaultValue: 'Abbrechen' })}
                      </button>
                      <button
                        onClick={() => handleDeleteNote(note.id)}
                        className="px-3 py-1 bg-red-500 text-white rounded-lg font-black text-[9px] uppercase tracking-widest active:scale-95 transition-all"
                      >
                        {t('myCoach.notesDeleteConfirm')}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Tematy */}
        <div className={activeTab === 'topics' ? '' : 'hidden'}>
          <TopicFeedTab userId={userId} />
        </div>

      </div>

      {openMessageCoach && (
        <StudentMessageSheet
          coachId={openMessageCoach.id}
          studentId={userId}
          currentUserId={userId}
          mode="student"
          otherName={`${openMessageCoach.firstName} ${openMessageCoach.lastName}`.trim()}
          onClose={() => {
            setOpenMessageCoach(null);
            setUnreadCoachIds(prev => { const n = new Set(prev); n.delete(openMessageCoach.id); return n; });
          }}
        />
      )}
    </div>
  );
}
