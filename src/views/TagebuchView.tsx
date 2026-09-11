import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { db } from '../firebase';
import { doc, getDoc, updateDoc, collection, query, where, orderBy, limit, getDocs, addDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { useTranslation } from 'react-i18next';
import StudentMessageSheet from '../components/StudentMessageSheet';
import { useNotifications } from '../hooks/useNotifications';
import { notificationId, type NotificationType } from '../utils/notificationTypes';
import { TRAINING_TOPICS } from '../constants/trainingTopics';
import {
  NoteComposer, SessionCard, CoachEntryCard, PrivateNoteCard, NewBadge,
  SESSION_NOTE_MAX,
  type TbSession, type TbPrivateNote, type TbCoachEntry,
} from '../components/tagebuch/TagebuchCards';

// --- TAGEBUCH ---
// Dziennik łucznika: jedna oś czasu z treningów, notatek własnych i treści od
// trenera. Trener jest warstwą — bez trenera ekran działa w pełni.
// „NEU" = nieprzeczytane powiadomienie z dzwonka (coach_note/coach_log/coach_plan)
// o tym samym refId. Otwarcie dziennika oznacza je jako przeczytane, a etykieta
// zostaje do końca tej wizyty — jeden system zamiast osobnego odhaczania.

const PAGE = 50;
const COACH_NOTIF_TYPES: NotificationType[] = ['coach_note', 'coach_log', 'coach_plan'];

type Filter = 'all' | 'coach' | 'mine';

interface CoachInfo {
  id: string;
  firstName: string;
  lastName: string;
}

interface UpcomingEvent {
  id: string;
  title: string;
  date: string;       // YYYY-MM-DD
  time: string;
  isCoach: boolean;
}

type TimelineItem =
  | { kind: 'session'; id: string; ts: number; session: TbSession; linked: TbPrivateNote[] }
  | { kind: 'private'; id: string; ts: number; note: TbPrivateNote }
  | { kind: 'coach'; id: string; ts: number; entry: TbCoachEntry };

interface TagebuchViewProps {
  userId: string;
  onBack: () => void;
  onNavigate: (view: string, tab?: string, extraData?: string) => void;
  onNavigateToStats?: (date: string, sessionId?: string) => void;
  pendingExtraData?: string | null;     // id trenera (czat) albo id wpisu z powiadomienia
  onClearPending?: () => void;
  pendingInitialTab?: string | null;    // stare targetTab z powiadomień: plan/diary/tips/notes
  onClearPendingTab?: () => void;
}

function toMs(v: any): number {
  if (!v) return 0;
  if (typeof v === 'number') return v;
  if (typeof v.toMillis === 'function') return v.toMillis();
  if (typeof v.seconds === 'number') return v.seconds * 1000;
  return 0;
}

const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export default function TagebuchView({ userId, onBack, onNavigate, onNavigateToStats, pendingExtraData, onClearPending, pendingInitialTab, onClearPendingTab }: TagebuchViewProps) {
  const { t, i18n } = useTranslation();

  const [coaches, setCoaches] = useState<CoachInfo[]>([]);
  const [coachesLoaded, setCoachesLoaded] = useState(false);
  const [unreadCoachIds, setUnreadCoachIds] = useState<Set<string>>(new Set());
  const [openMessageCoach, setOpenMessageCoach] = useState<CoachInfo | null>(null);

  const [sessions, setSessions] = useState<TbSession[]>([]);
  const [notes, setNotes] = useState<TbPrivateNote[]>([]);
  const [coachEntries, setCoachEntries] = useState<TbCoachEntry[]>([]);
  const [upcoming, setUpcoming] = useState<UpcomingEvent[]>([]);
  const [pageSize, setPageSize] = useState(PAGE);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const [filter, setFilter] = useState<Filter>('all');
  const [topic, setTopic] = useState<string>('');
  const [focusId, setFocusId] = useState<string | null>(null);

  const hasCoach = coaches.length > 0;

  // --- NEU (z powiadomień) ---
  const { notifications, markAsRead } = useNotifications(userId || null);
  const [neuIds, setNeuIds] = useState<Set<string>>(new Set());
  const markedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const fresh = notifications.filter(n => !n.readAt && COACH_NOTIF_TYPES.includes(n.type) && !markedRef.current.has(n.id));
    if (!fresh.length) return;
    setNeuIds(prev => {
      const next = new Set(prev);
      fresh.forEach(n => next.add(n.id));
      return next;
    });
    fresh.forEach(n => { markedRef.current.add(n.id); markAsRead(n.id); });
  }, [notifications, markAsRead]);
  const isNew = useCallback((type: NotificationType, refId: string) => neuIds.has(notificationId(type, refId)), [neuIds]);

  // --- WEJŚCIE Z POWIADOMIENIA ---
  useEffect(() => {
    if (!pendingInitialTab) return;
    if (pendingInitialTab === 'tips' || pendingInitialTab === 'diary') setFilter('coach');
    else if (pendingInitialTab === 'notes') setFilter('mine');
    onClearPendingTab?.();
  }, [pendingInitialTab]);

  useEffect(() => {
    if (!pendingExtraData || !coachesLoaded) return;
    const coach = coaches.find(c => c.id === pendingExtraData);
    if (coach) setOpenMessageCoach(coach);
    else setFocusId(pendingExtraData);
    onClearPending?.();
  }, [pendingExtraData, coachesLoaded, coaches]);

  // --- TRENERZY + CZAT ---
  useEffect(() => {
    if (!userId) return;
    (async () => {
      try {
        const userDoc = await getDoc(doc(db, 'users', userId));
        const coachIds: string[] = userDoc.exists() ? (userDoc.data().coaches || []) : [];
        const list: CoachInfo[] = [];
        await Promise.all(coachIds.map(async cid => {
          try {
            const cDoc = await getDoc(doc(db, 'users', cid));
            if (cDoc.exists()) {
              const d = cDoc.data();
              list.push({ id: cid, firstName: d.firstName || '', lastName: d.lastName || '' });
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
        console.error('Tagebuch: błąd pobierania trenerów', e);
      }
      setCoachesLoaded(true);
    })();
  }, [userId]);

  // --- WPISY TRENERA + NAJBLIŻSZE TERMINY ---
  useEffect(() => {
    if (!userId) return;
    (async () => {
      try {
        const snap = await getDocs(query(collection(db, `users/${userId}/coachLog`), orderBy('createdAt', 'desc')));
        setCoachEntries(snap.docs.map(d => {
          const data = d.data();
          return {
            id: d.id,
            text: data.text || '',
            type: data.type || 'observation',
            authorName: data.authorName || t('coachLog.defaultCoachName', { defaultValue: 'Trainer' }),
            topics: data.topics || [],
            ts: toMs(data.createdAt),
          };
        }));
      } catch (e) {
        console.error('Tagebuch: błąd pobierania wpisów trenera', e);
      }
    })();
    (async () => {
      try {
        const snap = await getDocs(query(
          collection(db, `users/${userId}/tournaments`),
          where('date', '>=', ymd(new Date())),
          orderBy('date'),
          limit(20),
        ));
        setUpcoming(snap.docs.map(d => {
          const data = d.data();
          return {
            id: d.id,
            title: data.title || '',
            date: data.date || '',
            time: data.time || '',
            isCoach: data.category === 'Trener',
          };
        }).sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time)));
      } catch (e) {
        console.error('Tagebuch: błąd pobierania terminów', e);
      }
    })();
  }, [userId]);

  // --- TRENINGI + NOTATKI (stronicowane) ---
  useEffect(() => {
    if (!userId) { setIsLoading(false); return; }
    (async () => {
      try {
        const [sSnap, nSnap] = await Promise.all([
          getDocs(query(collection(db, `users/${userId}/sessions`), orderBy('timestamp', 'desc'), limit(pageSize))),
          getDocs(query(collection(db, `users/${userId}/privateNotes`), orderBy('createdAt', 'desc'), limit(pageSize))),
        ]);
        setSessions(sSnap.docs.map(d => {
          const data = d.data();
          return {
            id: d.id,
            ts: toMs(data.timestamp) || toMs(data.createdAt),
            date: data.date || '',
            isTech: data.type === 'TECHNICAL',
            label: data.tournamentName || data.distanceLabel || data.distance || '',
            score: data.score || 0,
            arrows: data.arrows || data.totalArrows || 0,
            note: data.note || '',
            isNotePublic: data.isNotePublic !== false,
            editCount: data.editCount || 0,
            coachNote: data.coachNote || '',
            topics: data.topics || [],
            coachTopics: data.coachTopics || [],
          };
        }));
        setNotes(nSnap.docs.map(d => {
          const data = d.data();
          return {
            id: d.id,
            text: data.text || '',
            topics: data.topics || [],
            sessionId: data.sessionId || undefined,
            ts: toMs(data.createdAt) || Date.now(),
          };
        }));
      } catch (e) {
        console.error('Tagebuch: błąd pobierania osi czasu', e);
      }
      setIsLoading(false);
      setIsLoadingMore(false);
    })();
  }, [userId, pageSize]);

  // --- ZAPIS / USUWANIE ---
  const addPrivateNote = useCallback(async (text: string, topics: string[], sessionId?: string) => {
    const ref = await addDoc(collection(db, `users/${userId}/privateNotes`), {
      text,
      topics,
      ...(sessionId ? { sessionId } : {}),
      createdAt: serverTimestamp(),
    });
    setNotes(prev => [{ id: ref.id, text, topics, sessionId, ts: Date.now() }, ...prev]);
  }, [userId]);

  const addSessionNote = useCallback(async (s: TbSession, text: string, topics: string[], shared: boolean) => {
    if (!shared) return addPrivateNote(text, topics, s.id);
    const clean = text.slice(0, SESSION_NOTE_MAX);
    const mergedTopics = [...new Set([...s.topics, ...topics])];
    await updateDoc(doc(db, `users/${userId}/sessions`, s.id), {
      note: clean,
      isNotePublic: true,
      editCount: s.editCount + 1,
      ...(topics.length ? { topics: mergedTopics } : {}),
    });
    setSessions(prev => prev.map(x => x.id === s.id
      ? { ...x, note: clean, isNotePublic: true, editCount: x.editCount + 1, topics: topics.length ? mergedTopics : x.topics }
      : x));
  }, [userId, addPrivateNote]);

  const deleteNote = useCallback(async (id: string) => {
    try {
      await deleteDoc(doc(db, `users/${userId}/privateNotes/${id}`));
      setNotes(prev => prev.filter(n => n.id !== id));
    } catch (e) {
      console.error('Tagebuch: błąd usuwania notatki', e);
    }
  }, [userId]);

  // --- OŚ CZASU ---
  // Źródła są stronicowane osobno, więc pokazujemy tylko okres, który wszystkie
  // pełne strony pokrywają — inaczej stare notatki mieszałyby się z lukami w treningach.
  const { items, hasMore } = useMemo(() => {
    const sessionsFull = sessions.length >= pageSize;
    const notesFull = notes.length >= pageSize;
    let cutoff = 0;
    if (sessionsFull) cutoff = Math.max(cutoff, sessions[sessions.length - 1].ts);
    if (notesFull) cutoff = Math.max(cutoff, notes[notes.length - 1].ts);

    const sessionIds = new Set(sessions.map(s => s.id));
    const bySession: Record<string, TbPrivateNote[]> = {};
    notes.forEach(n => {
      if (n.sessionId && sessionIds.has(n.sessionId)) {
        if (!bySession[n.sessionId]) bySession[n.sessionId] = [];
        bySession[n.sessionId].push(n);
      }
    });
    const hit = (arr: string[]) => !topic || arr.includes(topic);

    const list: TimelineItem[] = [];
    sessions.forEach(s => {
      if (s.ts < cutoff) return;
      const linked = (bySession[s.id] || []).slice().sort((a, b) => a.ts - b.ts);
      if (filter === 'coach' && !s.coachNote) return;
      if (topic && !(hit(s.topics) || hit(s.coachTopics) || linked.some(n => hit(n.topics)))) return;
      list.push({ kind: 'session', id: s.id, ts: s.ts, session: s, linked });
    });
    if (filter !== 'coach') {
      notes.forEach(n => {
        if (n.ts < cutoff || (n.sessionId && sessionIds.has(n.sessionId))) return;
        if (!hit(n.topics)) return;
        list.push({ kind: 'private', id: n.id, ts: n.ts, note: n });
      });
    }
    if (filter !== 'mine') {
      coachEntries.forEach(e => {
        if (e.ts < cutoff || !hit(e.topics)) return;
        list.push({ kind: 'coach', id: e.id, ts: e.ts, entry: e });
      });
    }
    list.sort((a, b) => b.ts - a.ts);
    return { items: list, hasMore: sessionsFull || notesFull };
  }, [sessions, notes, coachEntries, filter, topic, pageSize]);

  const groups = useMemo(() => {
    const out: { key: string; label: string; items: TimelineItem[] }[] = [];
    const now = new Date();
    const todayKey = ymd(now);
    const yesterdayKey = ymd(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
    const weekAgo = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6).getTime();
    items.forEach(it => {
      const d = new Date(it.ts);
      const key = ymd(d);
      let g = out[out.length - 1];
      if (!g || g.key !== key) {
        const label = key === todayKey ? t('tagebuch.today')
          : key === yesterdayKey ? t('tagebuch.yesterday')
          : it.ts >= weekAgo ? d.toLocaleDateString(i18n.language, { weekday: 'long' })
          : d.toLocaleDateString(i18n.language, {
              day: 'numeric', month: 'long',
              ...(d.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}),
            });
        g = { key, label, items: [] };
        out.push(g);
      }
      g.items.push(it);
    });
    return out;
  }, [items, i18n.language, t]);

  // Najbliższe terminy: dwa pierwsze + każdy nowy plan trenera.
  const nextEvents = useMemo(() => {
    const shown = upcoming.filter((ev, i) => i < 2 || (ev.isCoach && isNew('coach_plan', ev.id)));
    return shown.slice(0, 4);
  }, [upcoming, isNew]);

  const eventDateLabel = (dateStr: string) => {
    const now = new Date();
    if (dateStr === ymd(now)) return t('tagebuch.today');
    if (dateStr === ymd(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1))) return t('tagebuch.tomorrow');
    const d = new Date(`${dateStr}T00:00:00`);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString(i18n.language, { weekday: 'short', day: 'numeric', month: 'short' });
  };

  // Przewinięcie do wpisu z powiadomienia (sesja / wpis trenera).
  const [flashId, setFlashId] = useState<string | null>(null);
  useEffect(() => {
    if (!focusId || isLoading) return;
    const el = document.getElementById(`tb-${focusId}`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setFlashId(focusId);
    setFocusId(null);
    const timer = setTimeout(() => setFlashId(null), 2200);
    return () => clearTimeout(timer);
  }, [focusId, isLoading, groups]);

  const coachContentCount = useMemo(
    () => sessions.filter(s => s.coachNote).length + coachEntries.length,
    [sessions, coachEntries],
  );
  const coachNewCount = useMemo(
    () => sessions.filter(s => s.coachNote && isNew('coach_note', s.id)).length
      + coachEntries.filter(e => isNew('coach_log', e.id)).length,
    [sessions, coachEntries, isNew],
  );
  const showCoachFilter = hasCoach || coachContentCount > 0;
  const isEmpty = !isLoading && sessions.length === 0 && notes.length === 0 && coachEntries.length === 0;

  const chip = (value: Filter, label: string, badge = 0) => (
    <button
      onClick={() => setFilter(value)}
      className={`shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-full text-[11px] font-black transition-all active:scale-95 ${
        filter === value ? 'bg-[#0a3a2a] text-white' : 'bg-white text-gray-500 border border-gray-200'
      }`}
    >
      {label}
      {badge > 0 && (
        <span className={`min-w-[16px] h-4 px-1 rounded-full text-[9px] flex items-center justify-center ${filter === value ? 'bg-white text-[#0a3a2a]' : 'bg-emerald-600 text-white'}`}>{badge}</span>
      )}
    </button>
  );

  return (
    <div className="flex flex-col min-h-screen bg-[#fcfdfe] relative overflow-x-hidden">

      {/* HEADER */}
      <div className="bg-gradient-to-b from-[#0a3a2a] to-[#0d4a36] pt-[calc(env(safe-area-inset-top)+1rem)] pb-4 px-5 rounded-b-[36px] shadow-xl shadow-[#0a3a2a]/20 relative z-20 shrink-0">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center text-white hover:bg-white/20 transition-all active:scale-90 shrink-0">
            <span className="material-symbols-outlined">arrow_back</span>
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-black text-white leading-tight truncate">{t('tagebuch.title')}</h1>
            {hasCoach && (
              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                {coaches.map(c => {
                  const initials = `${c.firstName[0] || ''}${c.lastName[0] || ''}`.toUpperCase();
                  return (
                    <button
                      key={c.id}
                      onClick={() => setOpenMessageCoach(c)}
                      className="flex items-center gap-1 bg-white/10 hover:bg-white/20 active:scale-95 transition-all rounded-full pl-0.5 pr-2 py-0.5"
                    >
                      <div className="w-5 h-5 bg-[#fed33e] rounded-full flex items-center justify-center shrink-0 relative">
                        <span className="text-[8px] font-black text-[#0a3a2a]">{initials || '?'}</span>
                        {unreadCoachIds.has(c.id) && <div className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-red-500 border border-white rounded-full" />}
                      </div>
                      <span className="text-[9px] font-black text-white/80 truncate max-w-[80px]">{c.firstName} {c.lastName}</span>
                      <span className="material-symbols-outlined text-[11px] text-white/50">chat</span>
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

      <div className="flex-1 overflow-y-auto pb-32 px-4 pt-4 space-y-3">

        {/* SZYBKA NOTATKA — zawsze prywatna */}
        <NoteComposer allowShare={false} onSave={(text, topics) => addPrivateNote(text, topics)} />

        {/* ALS NÄCHSTES */}
        {nextEvents.length > 0 && (
          <div className="bg-gray-50 rounded-2xl divide-y divide-gray-100 overflow-hidden">
            {nextEvents.map(ev => (
              <button
                key={ev.id}
                onClick={() => onNavigate('CALENDAR', undefined, ev.id)}
                className="w-full flex items-center gap-3 px-3 py-2.5 text-left active:bg-gray-100 transition-colors"
              >
                <span className="material-symbols-outlined text-[20px] text-emerald-700 shrink-0">event</span>
                <div className="flex-1 min-w-0">
                  <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">{t('tagebuch.next')}</p>
                  <p className="text-[12px] font-bold text-[#0a3a2a] truncate">
                    {eventDateLabel(ev.date)}{ev.time ? ` ${ev.time}` : ''} · {ev.title}
                    {ev.isCoach && <span className="text-gray-400 font-medium"> · {t('tagebuch.fromCoach')}</span>}
                  </p>
                </div>
                {ev.isCoach && isNew('coach_plan', ev.id) && <NewBadge />}
                <span className="material-symbols-outlined text-[18px] text-gray-300 shrink-0">chevron_right</span>
              </button>
            ))}
          </div>
        )}

        {/* FILTRY */}
        <div className="flex items-center gap-1.5 overflow-x-auto -mx-4 px-4 pb-0.5" style={{ scrollbarWidth: 'none' }}>
          {chip('all', t('tagebuch.filterAll'))}
          {showCoachFilter && chip('coach', t('tagebuch.filterCoach'), coachNewCount)}
          {chip('mine', t('tagebuch.filterMine'))}
          <div className={`shrink-0 relative flex items-center rounded-full border text-[11px] font-black ${topic ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-white border-gray-200 text-gray-500'}`}>
            <span className="material-symbols-outlined text-[14px] pl-2.5">psychology</span>
            <select
              value={topic}
              onChange={e => setTopic(e.target.value)}
              className="appearance-none bg-transparent pl-1 pr-6 py-1.5 outline-none max-w-[150px] truncate"
              aria-label={t('tagebuch.topic')}
            >
              <option value="">{t('tagebuch.allTopics')}</option>
              {TRAINING_TOPICS.map(cat => (
                <optgroup key={cat.id} label={`${cat.num}. ${t(`sessionSetup.topicCat_${cat.id}`)}`}>
                  {cat.subtopics.map(sub => (
                    <option key={sub.id} value={sub.id}>{t(`sessionSetup.topic_${sub.id}`)}</option>
                  ))}
                </optgroup>
              ))}
            </select>
            <span className="material-symbols-outlined text-[14px] absolute right-1.5 pointer-events-none">expand_more</span>
          </div>
        </div>

        {/* ZAPROSZENIE DO TRENERA */}
        {coachesLoaded && !hasCoach && filter !== 'mine' && (
          <div className="bg-white rounded-2xl border border-dashed border-emerald-300 p-3 flex items-start gap-3">
            <span className="material-symbols-outlined text-[22px] text-emerald-600 shrink-0">person_add</span>
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-black text-[#0a3a2a]">{t('tagebuch.inviteTitle')}</p>
              <p className="text-[11px] font-medium text-gray-400 leading-snug mt-0.5">{t('tagebuch.inviteDesc')}</p>
              <button
                onClick={() => onNavigate('SETTINGS', 'TRENER')}
                className="mt-2 text-[10px] font-black text-emerald-700 border border-emerald-300 rounded-full px-3 py-1 active:scale-95 transition-all"
              >
                {t('tagebuch.inviteBtn')}
              </button>
            </div>
          </div>
        )}

        {/* OŚ CZASU */}
        {isLoading ? (
          <div className="text-center py-10">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{t('tagebuch.loading')}</span>
          </div>
        ) : isEmpty ? (
          <div className="bg-gray-50 rounded-2xl p-8 text-center border border-dashed border-gray-200">
            <span className="material-symbols-outlined text-gray-300 text-4xl mb-2 block">menu_book</span>
            <p className="text-[12px] font-black text-[#0a3a2a]">{t('tagebuch.emptyTitle')}</p>
            <p className="text-[11px] font-medium text-gray-400 mt-1">{t('tagebuch.emptyDesc')}</p>
          </div>
        ) : groups.length === 0 ? (
          <div className="bg-gray-50 rounded-2xl p-6 text-center border border-dashed border-gray-200">
            <p className="text-[11px] font-bold text-gray-400">{t('tagebuch.emptyFilter')}</p>
          </div>
        ) : (
          groups.map(g => (
            <div key={g.key} className="space-y-2">
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1 pt-1">{g.label}</p>
              {g.items.map(it => (
                <div
                  key={`${it.kind}_${it.id}`}
                  id={`tb-${it.id}`}
                  className={`rounded-2xl transition-shadow duration-500 ${flashId === it.id ? 'ring-2 ring-emerald-400' : ''}`}
                >
                  {it.kind === 'session' ? (
                    <SessionCard
                      session={it.session}
                      linkedNotes={it.linked}
                      hasCoach={hasCoach}
                      isNew={isNew('coach_note', it.session.id)}
                      onOpen={() => it.session.date && onNavigateToStats?.(it.session.date, it.session.id)}
                      onAddNote={addSessionNote}
                      onDeleteNote={deleteNote}
                    />
                  ) : it.kind === 'private' ? (
                    <PrivateNoteCard note={it.note} onDelete={deleteNote} />
                  ) : (
                    <CoachEntryCard entry={it.entry} isNew={isNew('coach_log', it.entry.id)} />
                  )}
                </div>
              ))}
            </div>
          ))
        )}

        {!isLoading && hasMore && (
          <button
            onClick={() => { setIsLoadingMore(true); setPageSize(p => p + PAGE); }}
            disabled={isLoadingMore}
            className="w-full py-3 text-[10px] font-black text-gray-500 uppercase tracking-widest bg-white border border-gray-200 rounded-2xl active:scale-[0.99] transition-all disabled:opacity-50"
          >
            {isLoadingMore ? t('tagebuch.loading') : t('tagebuch.loadMore')}
          </button>
        )}
      </div>

      {openMessageCoach && (
        <StudentMessageSheet
          coachId={openMessageCoach.id}
          studentId={userId}
          currentUserId={userId}
          mode="student"
          otherName={`${openMessageCoach.firstName} ${openMessageCoach.lastName}`.trim()}
          onClose={() => {
            setUnreadCoachIds(prev => { const n = new Set(prev); n.delete(openMessageCoach.id); return n; });
            setOpenMessageCoach(null);
          }}
        />
      )}
    </div>
  );
}
