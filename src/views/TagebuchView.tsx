import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { db } from '../firebase';
import { fetchCoachGroups, groupTrainingRef } from '../utils/coachGroups';
import { doc, getDoc, getDocFromServer, updateDoc, collection, query, where, orderBy, limit, startAfter, getDocs, setDoc, deleteDoc, deleteField, serverTimestamp, Timestamp, type QueryDocumentSnapshot } from 'firebase/firestore';
import { settleWrite } from '../utils/offlineWrite';
import { guestExpiryFields } from '../utils/guestMode';
import { readPrivateSessionNotes } from '../utils/privateSessionNote';
import { useTranslation } from 'react-i18next';
import StudentMessageSheet from '../components/StudentMessageSheet';
import TournamentScoreInput from '../components/TournamentScoreInput';
import TopicFilter from '../components/tagebuch/TopicFilter';
import ViewHeader from '../components/ViewHeader';
import { useNotifications } from '../hooks/useNotifications';
import { notificationId, type NotificationType } from '../utils/notificationTypes';
import { isCustomTopic, topicLabel } from '../constants/trainingTopics';
import { distanceMeters, distanceKey } from '../config/distances';
import { computeInsights } from '../components/tagebuch/sessionInsights';
import { FocusCard, FocusMilestoneCard } from '../components/tagebuch/FocusCard';
import FocusModal from '../components/tagebuch/FocusModal';
import { TechEditSheet } from '../components/tagebuch/TechEditSheet';
import { updateTechnicalSession, type TechSessionEdit } from '../utils/techSession';
import { resolveBattleResult } from '../utils/battleResult';
import {
  FOCUS_TEXT_MAX, countFocusSessions, endedFocusSnapshot, focusCompletedAt, focusMilestoneId, readEndedFocus,
  inFocusWindow, sessionFocusRef, newFocusCountFrom, countsForFocusSession, manualSessionFocus,
  readFocusGoal, readFocusMilestone, readOwnFocus,
  readCoachGoal, readCoachFocusCleared, readSessionFocuses, trackSettings,
  resolveActiveFocus, readTrainingTopic, isTopicOpen, topicAsFocus, readTopicFirst, saveTopicFirst, sessionTopicId, dayKeyOf,
  type TrainingTopic, type CoachGoal, type CoachFocusCleared,
  type ActiveFocus, type FocusMilestone, type OwnFocus,
} from '../utils/focus';
import {
  NoteComposer, SessionCard, CoachEntryCard, TrainingTopicCard, LedTrainingCard, MissedTournamentCard, SkippedTournamentCard, NoteSheet, PrivateNoteCard, NewBadge,
  SESSION_NOTE_MAX,
  type TbSession, type TbPrivateNote, type TbCoachEntry, type TbLedTraining,
} from '../components/tagebuch/TagebuchCards';

// --- TAGEBUCH ---
// Dziennik łucznika: jedna oś czasu z treningów, notatek własnych i treści od
// trenera. Trener jest warstwą — bez trenera ekran działa w pełni.
// „NEU" = nieprzeczytane powiadomienie z dzwonka (coach_note/coach_log/coach_plan)
// o tym samym refId. Otwarcie dziennika oznacza je jako przeczytane, a etykieta
// zostaje do końca tej wizyty — jeden system zamiast osobnego odhaczania.

// Strona osi czasu. Kolejne strony doczytujemy kursorem przy przewijaniu,
// a nie od nowa całą listą — koszt otwarcia nie rośnie z historią.
const PAGE = 20;
// Znacznik usuniętego wpisu fokusu w privateNotes (patrz deleteMilestone).
const MILESTONE_HIDDEN = 'focusMilestoneHidden';
const GROUP_TOPICS_KEY = 'tb_groupTopics';
const COACH_NOTIF_TYPES: NotificationType[] =['coach_note', 'coach_log', 'coach_plan'];

// Filtry (user 2026-10-15): „Wszystko”, „Od trenera” i rodzaje wpisów —
// każdy w kolorze swoich kart (pasek z lewej, tb-* w tailwind.css).
type EntryKind = 'target' | 'tournament' | 'tech' | 'coachEntry' | 'private' | 'mark' | 'topic' | 'focus' | 'coachFocus' | 'led';
type Filter = 'all' | 'coach' | EntryKind;

// Panel filtrów przy „+” (user 2026-10-23): ikona = ta sama co na karcie,
// `color` = kolor ikonki, `fill` = tło wybranej ikonki.
const KIND_FILTERS: { kind: Filter; labelKey: string; icon: string; color: string; fill: string }[] = [
  // Nazwy = etykiety typu na kartach (EntryHeading), user 2026-10-23: „opisy te same”.
  { kind: 'target', labelKey: 'tagebuch.training', icon: 'target', color: 'text-emerald-600', fill: 'bg-emerald-600' },
  { kind: 'tournament', labelKey: 'tagebuch.tournament', icon: 'emoji_events', color: 'text-[#0a3a2a]', fill: 'bg-[#0a3a2a]' },
  { kind: 'tech', labelKey: 'tagebuch.techTraining', icon: 'fitness_center', color: 'text-sky-600', fill: 'bg-sky-500' },
  { kind: 'topic', labelKey: 'tagebuch.topicLabel', icon: 'sports', color: 'text-violet-600', fill: 'bg-violet-500' },
  { kind: 'coachEntry', labelKey: 'tagebuch.coachEntry', icon: 'menu_book', color: 'text-amber-600', fill: 'bg-amber-500' },
  { kind: 'coach', labelKey: 'tagebuch.filterCoach', icon: 'person', color: 'text-amber-700', fill: 'bg-amber-700' },
  { kind: 'mark', labelKey: 'tagebuch.kindMilestone', icon: 'star', color: 'text-[#b8860b]', fill: 'bg-[#d4a017]' },
  { kind: 'private', labelKey: 'tagebuch.kindNote', icon: 'lock', color: 'text-indigo-500', fill: 'bg-indigo-500' },
  { kind: 'focus', labelKey: 'tagebuch.filterFocus', icon: 'center_focus_strong', color: 'text-amber-600', fill: 'bg-amber-500' },
  { kind: 'coachFocus', labelKey: 'tagebuch.filterCoachFocus', icon: 'center_focus_strong', color: 'text-sky-700', fill: 'bg-sky-700' },
  { kind: 'led', labelKey: 'tagebuch.ledTraining', icon: 'sports', color: 'text-rose-600', fill: 'bg-rose-500' },
];

function entryKind(it: TimelineItem): EntryKind {
  switch (it.kind) {
    case 'session': return it.session.isTech ? 'tech' : it.session.isTournament ? 'tournament' : 'target';
    case 'private': return it.note.important ? 'mark' : 'private';
    case 'milestone': return it.milestone.fromCoach ? 'coachFocus' : 'focus';
    case 'led': return 'led';
    case 'missed':
    case 'skipped': return 'tournament';
    default: return it.entry.trainingTopic ? 'topic' : 'coachEntry';
  }
}

// [PROWADZONY TRENING] Treningi, które użytkownik poprowadził jako trener:
// zakończone albo minione tematy jego grup (groups/<id>.topics) z prywatną
// notatką z historii treningów grupy.
async function loadLedTrainings(userId: string): Promise<TbLedTraining[]> {
  const groups = await fetchCoachGroups(userId);
  const today = dayKeyOf(Date.now());
  const out: TbLedTraining[] = [];
  await Promise.all(groups.map(async ({ id: gid, name, topics }) => {
    const done = Object.entries(topics || {}).filter(([d, gt]: [string, any]) => d < today || (d === today && gt?.closedAt));
    if (!done.length) return;
    let notes: Record<string, string> = {};
    try {
      const snap = await getDoc(groupTrainingRef(gid));
      notes = (snap.exists() && snap.data().notes) || {};
    } catch { /* bez notatek */ }
    done.forEach(([d, gt]) => out.push({
      id: `${gid}_${d}`, groupName: name, day: d, text: gt.text || '', topic: gt.topic || '',
      note: notes[d] || '', ts: gt.closedAt || new Date(`${d}T20:00:00`).getTime(),
    }));
  }));
  return out;
}

// Temat zaplanowany wcześniej stoi na osi czasu w swoim dniu, nie w dniu zapisu.
function topicTimelineFields(id: string, data: any): { trainingTopic?: TrainingTopic; ts?: number } {
  const tt = readTrainingTopic(id, data);
  if (!tt) return {};
  return dayKeyOf(tt.ts) === tt.day ? { trainingTopic: tt } : { trainingTopic: tt, ts: new Date(`${tt.day}T07:00:00`).getTime() };
}

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
  isLed: boolean;      // własny termin trenera (nie kopia od mojego trenera) — różowy
  kind: EventKind;
  hasScore: boolean;   // zawody z wpisanym wynikiem — znikają z „Als Nächstes”
  skipped?: boolean;   // „Nicht gestartet” — zostaje w dzienniku z notatkami
  distance?: string;
  distanceId?: string;
  distanceLabel?: string;
}

// Zaległe zawody bez wyniku pokazujemy z ostatnich 30 dni.
const MISSED_TOURNAMENT_DAYS = 30;

// Jeden słownik kolorów terminów (user 2026-10-15) — jak w kalendarzu i na Home:
// zawody ciemnozielone, Inne granat, ja jako trener róż, od mojego trenera fiolet.
type EventKind = 'tournament' | 'other' | 'led' | 'fromCoach';
const EVENT_STYLE: Record<EventKind, { row: string; icon: string; iconName: string; text: string; sub: string }> = {
  tournament: { row: 'bg-[#0a3a2a] border-[#0a3a2a] active:bg-[#0b4230]', icon: 'text-[#fed33e]', iconName: 'emoji_events', text: 'text-white', sub: 'text-white/60' },
  other: { row: 'bg-blue-50 border-blue-100 active:bg-blue-100', icon: 'text-blue-900', iconName: 'event', text: 'text-blue-950', sub: 'text-blue-800' },
  led: { row: 'bg-rose-50 border-rose-100 active:bg-rose-100', icon: 'text-rose-600', iconName: 'sports', text: 'text-rose-950', sub: 'text-rose-700' },
  fromCoach: { row: 'bg-violet-50 border-violet-100 active:bg-violet-100', icon: 'text-violet-600', iconName: 'group', text: 'text-violet-950', sub: 'text-violet-700' },
};

type TimelineItem =
  | { kind: 'session'; id: string; ts: number; session: TbSession; linked: TbPrivateNote[]; nested?: boolean }
  | { kind: 'private'; id: string; ts: number; note: TbPrivateNote }
  | { kind: 'milestone'; id: string; ts: number; milestone: FocusMilestone }
  | { kind: 'coach'; id: string; ts: number; entry: TbCoachEntry }
  | { kind: 'led'; id: string; ts: number; entry: TbLedTraining }
  | { kind: 'missed'; id: string; ts: number; ev: UpcomingEvent }
  | { kind: 'skipped'; id: string; ts: number; ev: UpcomingEvent; linked: TbPrivateNote[] };

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

const coachInitials = (c: CoachInfo) => `${c.firstName[0] || ''}${c.lastName[0] || ''}`.toUpperCase() || '?';

function toMs(v: any): number {
  if (!v) return 0;
  if (typeof v === 'number') return v;
  if (typeof v.toMillis === 'function') return v.toMillis();
  if (typeof v.seconds === 'number') return v.seconds * 1000;
  return 0;
}

const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// Zawody: Durchgangi z roundScores (zapis od 2026-10-23) albo z serii 1–6 / 7–12;
// starsze zapisy skrótowe nie mają ani jednego — wtedy sama suma.
function tournamentFields(data: any): Pick<TbSession, 'isTournament' | 'rounds' | 'counts' | 'distanceText'> {
  const sums: number[] = Array.isArray(data.ends)
    ? data.ends.map((e: any) => Number(e?.total_sum)).filter((n: number) => Number.isFinite(n))
    : [];
  const rounds = Array.isArray(data.roundScores) && data.roundScores.length === 2 && data.roundScores.every((n: any) => typeof n === 'number')
    ? data.roundScores
    : sums.length > 6 ? [sums.slice(0, 6).reduce((a, b) => a + b, 0), sums.slice(6, 12).reduce((a, b) => a + b, 0)] : undefined;
  return {
    isTournament: true,
    // Tytuł zawodów zajmuje nazwa turnieju — dystans idzie do linii z wynikiem.
    ...(data.distanceLabel || data.distance ? { distanceText: String(data.distanceLabel || data.distance) } : {}),
    ...(rounds ? { rounds } : {}),
    counts: { x: data.xCount || 0, ten: data.tenCount || 0, nine: data.nineCount || 0 },
  };
}

// Wpis „z dzisiaj”: zrobiony dziś albo temat treningu na dziś (mógł być ustawiony wcześniej).
function isTodayItem(it: TimelineItem): boolean {
  const today = ymd(new Date());
  if (it.kind === 'coach' && it.entry.trainingTopic?.day) return it.entry.trainingTopic.day === today;
  return ymd(new Date(it.ts)) === today;
}
const DAY_MS = 24 * 60 * 60 * 1000;

// Poniedziałek tygodnia (jak w PL/DE), północ czasu lokalnego.
function weekStart(ts: number): Date {
  const d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7));
}

// Stats wybiera dzień po dacie ISO, a sesje zapisują `date` jako pl-PL
// („11.09.2026"). Ta sama konwersja co `toISO` w StatsView, żeby trafić
// w ten sam dzień; bez daty — dzień z timestampu.
function statsDate(s: TbSession): string {
  const p = s.date.split('.');
  if (p.length === 3) return `${p[2]}-${p[1].padStart(2, '0')}-${p[0].padStart(2, '0')}`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s.date)) return s.date;
  return s.ts ? ymd(new Date(s.ts)) : '';
}

export default function TagebuchView({ userId, onBack, onNavigate, onNavigateToStats, pendingExtraData, onClearPending, pendingInitialTab, onClearPendingTab }: TagebuchViewProps) {
  const { t, i18n } = useTranslation();

  const [coaches, setCoaches] = useState<CoachInfo[]>([]);
  const [coachesLoaded, setCoachesLoaded] = useState(false);
  const [unreadCoachIds, setUnreadCoachIds] = useState<Set<string>>(new Set());
  const [openMessageCoach, setOpenMessageCoach] = useState<CoachInfo | null>(null);
  const [coachMenuOpen, setCoachMenuOpen] = useState(false);

  const [sessions, setSessions] = useState<TbSession[]>([]);
  const [notes, setNotes] = useState<TbPrivateNote[]>([]);
  const [coachEntries, setCoachEntries] = useState<TbCoachEntry[]>([]);
  const [upcoming, setUpcoming] = useState<UpcomingEvent[]>([]);
  // Minione zawody bez wyniku — karta w dniu zawodów z „Ringzahl eingeben”.
  const [missed, setMissed] = useState<UpcomingEvent[]>([]);
  const [scoreFor, setScoreFor] = useState<UpcomingEvent | null>(null);
  // Zawody „Nicht gestartet” — wszystkie, bez limitu dni (to wpis w dzienniku).
  const [skipped, setSkipped] = useState<UpcomingEvent[]>([]);
  // Źródło wyczerpane = ostatnia strona przyszła niepełna.
  const [sessionsDone, setSessionsDone] = useState(false);
  const [notesDone, setNotesDone] = useState(false);
  const sessionsCursor = useRef<QueryDocumentSnapshot | null>(null);
  const notesCursor = useRef<QueryDocumentSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const [filter, setFilter] = useState<Filter>('all');
  const [topic, setTopic] = useState<string>('');
  const [focusId, setFocusId] = useState<string | null>(null);
  // Ręcznie rozwinięte/zwinięte tygodnie; domyślnie otwarte są dwa najnowsze.
  const [weekOpen, setWeekOpen] = useState<Record<string, boolean>>({});
  const [ownFocus, setOwnFocus] = useState<OwnFocus | null>(null);
  // [DWA FOKUSY] cele trenera (z liczbą kropek i lekcjami trenera) + zakończenie celu przez ucznia
  const [coachGoals, setCoachGoals] = useState<CoachGoal[]>([]);
  const [coachCleared, setCoachCleared] = useState<CoachFocusCleared | null>(null);
  // [TEMAT TRENINGU] w dniu treningu: temat na górze karty zamiast fokusu
  const [ledTrainings, setLedTrainings] = useState<TbLedTraining[]>([]);
  const [topicFirst, setTopicFirst] = useState(() => (userId ? readTopicFirst(userId) : false));
  const [focusDots, setFocusDots] = useState(false);
  const [focusGoal, setFocusGoal] = useState(() => readFocusGoal(null));
  const [focusEditing, setFocusEditing] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [editingNote, setEditingNote] = useState<TbPrivateNote | null>(null);
  const [editingTech, setEditingTech] = useState<TbSession | null>(null);
  // Rozwinięte karty treningów. Nowa uwaga trenera rozwija się sama, ale
  // tylko raz — potem decyduje użytkownik.
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const autoExpandedRef = useRef<Set<string>>(new Set());
  const toggleExpanded = (id: string) => setExpandedIds(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [topicPickOpen, setTopicPickOpen] = useState(false);   // wybór tematu w zwiniętym panelu
  // Układ osi czasu: treningi pod tematem dnia (domyślnie) albo ściśle chronologicznie.
  const [groupTopics, setGroupTopics] = useState(() => {
    try { return localStorage.getItem(GROUP_TOPICS_KEY) !== '0'; } catch { return true; }
  });
  const pickGroupTopics = (on: boolean) => {
    setGroupTopics(on);
    try { localStorage.setItem(GROUP_TOPICS_KEY, on ? '1' : '0'); } catch { /* prywatny tryb */ }
  };
  // „Ausklappen” w panelu filtrów — opisy przy ikonach; zapamiętane w telefonie.
  const filtersWideKey = `grotx_tbFiltersWide_${userId}`;
  const [filtersWide, setFiltersWide] = useState(() => {
    try { return localStorage.getItem(filtersWideKey) === '1'; } catch { return false; }
  });
  const toggleFiltersWide = () => setFiltersWide(v => {
    try { localStorage.setItem(filtersWideKey, v ? '0' : '1'); } catch { /* prywatny tryb */ }
    return !v;
  });
  const inviteHiddenKey = `grotx_tbInviteHidden_${userId}`;
  const [inviteHidden, setInviteHidden] = useState(() => {
    try { return localStorage.getItem(inviteHiddenKey) === '1'; } catch { return false; }
  });
  const hideInvite = () => {
    setInviteHidden(true);
    try { localStorage.setItem(inviteHiddenKey, '1'); } catch { /* prywatny tryb */ }
  };

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
    else if (pendingInitialTab === 'notes') setFilter('private');
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
        const userData = userDoc.exists() ? userDoc.data() : {};
        setOwnFocus(readOwnFocus(userData));
        setCoachCleared(readCoachFocusCleared(userData));
        setFocusDots(userData.focusDots === true);
        setFocusGoal(readFocusGoal(userData));
        if (userData.isCoach) loadLedTrainings(userId).then(setLedTrainings).catch(e => console.error('Tagebuch: błąd prowadzonych treningów', e));
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
        setCoachGoals(snap.docs.filter(d => d.data().type === 'goal').map(d => readCoachGoal(d.id, d.data())));
        setCoachEntries(snap.docs.map(d => {
          const data = d.data();
          return {
            id: d.id,
            text: data.text || '',
            type: data.type || 'observation',
            authorName: data.authorName || t('coachLog.defaultCoachName', { defaultValue: 'Trainer' }),
            topics: data.topics || [],
            ts: toMs(data.createdAt),
            ...(data.type === 'topic' ? topicTimelineFields(d.id, data) : {}),
          };
        // [TEMAT TRENINGU] Zaplanowany na kolejne dni — uczeń zobaczy go w jego dniu.
        }).filter(e => e.type !== 'topic' || (e.trainingTopic && e.trainingTopic.day <= dayKeyOf(Date.now()))));
      } catch (e) {
        console.error('Tagebuch: błąd pobierania wpisów trenera', e);
      }
    })();
    (async () => {
      try {
        const today = ymd(new Date());
        const since = new Date();
        since.setDate(since.getDate() - MISSED_TOURNAMENT_DAYS);
        const snap = await getDocs(query(
          collection(db, `users/${userId}/tournaments`),
          where('date', '>=', ymd(since)),
          orderBy('date'),
          limit(60),
        ));
        const toEvent = (d: QueryDocumentSnapshot): UpcomingEvent => {
          const data = d.data();
          return {
            id: d.id,
            title: data.title || '',
            date: data.date || '',
            time: data.time || '',
            isCoach: data.category === 'Trener',
            isLed: data.category === 'Trener' && !data.isMirrored,
            kind: (data.category === 'Trener' ? (data.isMirrored ? 'fromCoach' : 'led') : data.category === 'Inne' ? 'other' : 'tournament') as EventKind,
            hasScore: data.hasScore === true,
            ...(data.skipped === true ? { skipped: true } : {}),
            ...(data.distance ? { distance: data.distance } : {}),
            ...(data.distanceId ? { distanceId: data.distanceId } : {}),
            ...(data.distanceLabel ? { distanceLabel: data.distanceLabel } : {}),
          };
        };
        const all = snap.docs.map(toEvent).sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
        // Zawody z wynikiem nie są już „następne” — trening z wynikiem stoi pod „Heute”.
        setUpcoming(all.filter(ev => ev.date >= today && !(ev.kind === 'tournament' && (ev.hasScore || ev.skipped))));
        // Minione zawody bez wyniku → karta w historii (user 2026-10-23).
        setMissed(all.filter(ev => ev.date < today && ev.kind === 'tournament' && !ev.hasScore && !ev.skipped));
        // „Nicht gestartet” — osobno i bez limitu dni (równość na jednym polu, bez indeksu).
        const sk = await getDocs(query(collection(db, `users/${userId}/tournaments`), where('skipped', '==', true)));
        setSkipped(sk.docs.map(toEvent));
      } catch (e) {
        console.error('Tagebuch: błąd pobierania terminów', e);
      }
    })();
  }, [userId]);

  // --- TRENINGI + NOTATKI (stronicowane kursorem) ---
  // first = od nowa (otwarcie), inaczej następna strona dopisywana na koniec.
  // Wyczerpane źródło nie jest już pytane.
  const loadPage = useCallback(async (first: boolean) => {
    if (!userId) return;
    const sessionsCol = collection(db, `users/${userId}/sessions`);
    const notesCol = collection(db, `users/${userId}/privateNotes`);
    const sCur = first ? null : sessionsCursor.current;
    const nCur = first ? null : notesCursor.current;
    const [sSnap, nSnap] = await Promise.all([
      !first && sessionsDone ? null : getDocs(sCur
        ? query(sessionsCol, orderBy('timestamp', 'desc'), startAfter(sCur), limit(PAGE))
        : query(sessionsCol, orderBy('timestamp', 'desc'), limit(PAGE))),
      !first && notesDone ? null : getDocs(nCur
        ? query(notesCol, orderBy('createdAt', 'desc'), startAfter(nCur), limit(PAGE))
        : query(notesCol, orderBy('createdAt', 'desc'), limit(PAGE))),
    ]);
    // [RODO C36] Tekst prywatnych notatek treningowych — poza sesją; czytamy
    // tylko te, których sesje są na tej stronie.
    const privIds = sSnap ? sSnap.docs.filter(d => d.data().isNotePublic === false).map(d => d.id) : [];
    const privNotes = await readPrivateSessionNotes(userId, privIds).catch(() => new Map<string, string>());

    if (sSnap) {
      if (sSnap.docs.length) sessionsCursor.current = sSnap.docs[sSnap.docs.length - 1];
      setSessionsDone(sSnap.docs.length < PAGE);
      const page: TbSession[] = sSnap.docs.map(d => {
          const data = d.data();
          return {
            id: d.id,
            ts: toMs(data.timestamp) || toMs(data.createdAt),
            date: data.date || '',
            isTech: data.type === 'TECHNICAL',
            ...(data.type === 'Turniej' ? tournamentFields(data) : {}),
            meters: distanceMeters(data.distance),
            distKey: distanceKey(data),
            label: data.tournamentName || data.distanceLabel || data.distance || '',
            score: data.score || 0,
            arrows: data.arrows || data.totalArrows || 0,
            endSums: Array.isArray(data.ends)
              ? data.ends.map((e: any) => Number(e?.total_sum)).filter((n: number) => Number.isFinite(n))
              : [],
            note: data.note || (data.isNotePublic === false ? privNotes.get(d.id) || '' : ''),
            isNotePublic: data.isNotePublic !== false,
            editCount: data.editCount || 0,
            coachNote: data.coachNote || '',
            coachSeen: !!data.coachSeenAt,
            snaps: sessionFocusRef(data, 0).snaps,
            ...(data.focusChoice === true ? { decided: true } : {}),
            focuses: readSessionFocuses(data),
            ...(sessionTopicId(data) ? { topicId: sessionTopicId(data), trainingTopic: { text: String(data.trainingTopic.text || ''), topic: String(data.trainingTopic.topic || '') } } : {}),
            topics: data.topics || [],
            coachTopics: data.coachTopics || [],
            ...(data.battleId ? { battle: {
              id: String(data.battleId), mode: String(data.battleMode || 'LOCAL'),
              ...(data.battlePlace ? { place: Number(data.battlePlace), players: Number(data.battlePlayers || 0) } : {}),
            } } : {}),
          };
      });
      setSessions(prev => first ? page : [...prev, ...page.filter(p => !prev.some(x => x.id === p.id))]);
      // [ARENA] Miejsce w bitwie: gdy sesja go jeszcze nie ma, sprawdzamy bitwę
      // (raz) — po zakończeniu gry zapisuje się w sesji na stałe.
      page.filter(p => p.battle && !p.battle.place).forEach(p => {
        resolveBattleResult(userId, p.id, p.battle!.id).then(res => {
          if (!res) return;
          setSessions(prev => prev.map(x => x.id === p.id && x.battle
            ? { ...x, battle: { ...x.battle, ...('live' in res ? { live: true } : { place: res.place, players: res.players }) } }
            : x));
        });
      });
    }
    if (nSnap) {
      if (nSnap.docs.length) notesCursor.current = nSnap.docs[nSnap.docs.length - 1];
      setNotesDone(nSnap.docs.length < PAGE);
      // Znacznik usuniętego wpisu fokusu (deleteMilestone) — nie pokazujemy.
      const page: TbPrivateNote[] = nSnap.docs.filter(d => d.data().kind !== MILESTONE_HIDDEN).map(d => {
          const data = d.data();
          return {
            id: d.id,
            text: data.text || '',
            topics: data.topics || [],
            sessionId: data.sessionId || undefined,
            ts: toMs(data.createdAt) || Date.now(),
            milestone: readFocusMilestone(data) || undefined,
            ...(data.important === true ? { important: true } : {}),
            ...(data.shared === true ? { shared: true } : {}),
            ...(typeof data.title === 'string' && data.title ? { title: data.title } : {}),
          };
      });
      setNotes(prev => first ? page : [...prev, ...page.filter(p => !prev.some(x => x.id === p.id))]);
    }
  }, [userId, sessionsDone, notesDone]);

  const loadPageRef = useRef(loadPage);
  loadPageRef.current = loadPage;

  useEffect(() => {
    if (!userId) { setIsLoading(false); return; }
    loadPageRef.current(true)
      .catch(e => console.error('Tagebuch: błąd pobierania osi czasu', e))
      .finally(() => setIsLoading(false));
  }, [userId]);

  const loadMore = useCallback(() => {
    if (isLoadingMore) return;
    setIsLoadingMore(true);
    loadPageRef.current(false)
      .catch(e => console.error('Tagebuch: błąd doczytywania osi czasu', e))
      .finally(() => setIsLoadingMore(false));
  }, [isLoadingMore]);

  // Doczytywanie przy przewijaniu: przycisk „więcej” zbliża się do ekranu →
  // kolejna strona. Kliknięcie zostaje jako zapas.
  const loadMoreRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    const el = loadMoreRef.current;
    if (!el || isLoading || isLoadingMore || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(entries => {
      if (entries.some(e => e.isIntersecting)) loadMore();
    }, { rootMargin: '300px' });
    io.observe(el);
    return () => io.disconnect();
  });

  // --- ZAPIS / USUWANIE ---
  // `important` = Meilenstein (user 2026-10-23): punkt zwrotny, np. nowy łuk.
  // `shared` = uczeń udostępnia wpis trenerom (reguła privateNotes: trener tylko czyta).
  const addPrivateNote = useCallback(async (text: string, topics: string[], sessionId?: string, important = false, shared = false, title = '') => {
    // [C41] Id nadany w telefonie — bez zasiegu notatka czeka i wysle sie sama.
    const ref = doc(collection(db, `users/${userId}/privateNotes`));
    await settleWrite(setDoc(ref, {
      text,
      topics,
      ...(sessionId ? { sessionId } : {}),
      ...(important ? { important: true } : {}),
      ...(shared ? { shared: true } : {}),
      ...(title ? { title } : {}),
      createdAt: serverTimestamp(),
      ...guestExpiryFields(), // [GOŚĆ] notatki gościa wygasają po 24h (TTL)
    }));
    setNotes(prev => [{ id: ref.id, text, topics, sessionId, ts: Date.now(), ...(important ? { important: true } : {}), ...(shared ? { shared: true } : {}), ...(title ? { title } : {}) }, ...prev]);
  }, [userId]);

  // [EDYCJA WPISU] (user 2026-10-23) Tekst, tematy, Meilenstein i udostępnienie własnej notatki.
  const updatePrivateNote = useCallback(async (id: string, text: string, topics: string[], important: boolean, shared: boolean, title: string) => {
    await settleWrite(updateDoc(doc(db, `users/${userId}/privateNotes`, id), { text, topics, important, shared, title, editedAt: Date.now() }));
    setNotes(prev => prev.map(n => (n.id === id ? { ...n, text, topics, important: important || undefined, shared: shared || undefined, title: title || undefined } : n)));
  }, [userId]);

  // [NIE STARTOWAŁEM] Znacznik na terminie; cofnięcie wraca do „bez wyniku”.
  const markSkipped = useCallback(async (ev: UpcomingEvent, on: boolean) => {
    await settleWrite(updateDoc(doc(db, `users/${userId}/tournaments`, ev.id), on ? { skipped: true } : { skipped: deleteField() }));
    try { localStorage.removeItem(`grotX_tournaments_${userId}`); } catch { /* prywatny tryb */ }
    if (on) {
      setMissed(prev => prev.filter(x => x.id !== ev.id));
      setSkipped(prev => [...prev, { ...ev, skipped: true }]);
    } else {
      setSkipped(prev => prev.filter(x => x.id !== ev.id));
      setMissed(prev => [...prev, { ...ev, skipped: undefined }]);
    }
  }, [userId]);

  const addSessionNote = useCallback(async (s: TbSession, text: string, topics: string[], shared: boolean) => {
    if (!shared) return addPrivateNote(text, topics, s.id);
    const clean = text.slice(0, SESSION_NOTE_MAX);
    const mergedTopics = [...new Set([...s.topics, ...topics])];
    await settleWrite(updateDoc(doc(db, `users/${userId}/sessions`, s.id), {
      note: clean,
      isNotePublic: true,
      editCount: s.editCount + 1,
      ...(topics.length ? { topics: mergedTopics } : {}),
    }));
    setSessions(prev => prev.map(x => x.id === s.id
      ? { ...x, note: clean, isNotePublic: true, editCount: x.editCount + 1, topics: topics.length ? mergedTopics : x.topics }
      : x));
  }, [userId, addPrivateNote]);

  // [TECHNIK] Poprawka treningu technicznego (strzały, data, tematy).
  const updateTech = useCallback(async (id: string, edit: TechSessionEdit) => {
    const s = sessions.find(x => x.id === id);
    if (!s) return;
    await updateTechnicalSession(userId, id, edit, { note: s.note, isNotePublic: s.isNotePublic, editCount: s.editCount });
    const when = new Date(edit.ts);
    const noteChanged = edit.note !== s.note;
    setSessions(prev => prev.map(x => x.id === id
      ? { ...x, arrows: edit.arrows, ts: edit.ts, date: when.toLocaleDateString('pl-PL'), topics: edit.topics, note: edit.note,
          editCount: noteChanged && x.isNotePublic ? x.editCount + 1 : x.editCount }
      : x));
  }, [userId, sessions]);

  // Usunięcie wpisu fokusu z osi czasu. Sam deleteDoc nie wystarczy: efekt
  // kamieni milowych odtworzyłby wpis zakończonego fokusu przy następnym
  // otwarciu (sprawdza tylko, czy dokument istnieje). Zostawiamy więc pod tym
  // samym id znacznik MILESTONE_HIDDEN — reguły pozwalają create, nie update.
  const deleteMilestone = useCallback(async (id: string) => {
    try {
      const ref = doc(db, `users/${userId}/privateNotes/${id}`);
      await settleWrite(deleteDoc(ref));
      await settleWrite(setDoc(ref, { kind: MILESTONE_HIDDEN, text: '', createdAt: serverTimestamp(), ...guestExpiryFields() }));
      setNotes(prev => prev.filter(n => n.id !== id));
    } catch (e) {
      console.error('Tagebuch: błąd usuwania wpisu fokusu', e);
    }
  }, [userId]);

  const deleteNote = useCallback(async (id: string) => {
    try {
      await settleWrite(deleteDoc(doc(db, `users/${userId}/privateNotes/${id}`)));
      setNotes(prev => prev.filter(n => n.id !== id));
    } catch (e) {
      console.error('Tagebuch: błąd usuwania notatki', e);
    }
  }, [userId]);

  useEffect(() => {
    const fresh = sessions.filter(s => s.coachNote && isNew('coach_note', s.id) && !autoExpandedRef.current.has(s.id));
    if (!fresh.length) return;
    fresh.forEach(s => autoExpandedRef.current.add(s.id));
    setExpandedIds(prev => {
      const next = new Set(prev);
      fresh.forEach(s => next.add(s.id));
      return next;
    });
  }, [sessions, isNew]);

  // --- FOKUS ---
  // Jeden fokus: nowszy z własnego (albo jego zakończenia) i ostatniego celu trenera.
  const latestGoal = useMemo(() => [...coachGoals].sort((a, b) => b.ts - a.ts)[0], [coachGoals]);
  const activeFocus: ActiveFocus | null = useMemo(
    () => resolveActiveFocus(ownFocus, latestGoal, coachCleared),
    [ownFocus, latestGoal, coachCleared],
  );
  // [TEMAT TRENINGU] Dzisiejszy otwarty temat — obok fokusu na karcie (chip).
  const openTopic: ActiveFocus | null = useMemo(() => {
    const tt = coachEntries
      .map(e => e.trainingTopic)
      .filter((x): x is TrainingTopic => !!x && isTopicOpen(x))
      .sort((a, b) => b.ts - a.ts)[0];
    return tt ? topicAsFocus(tt) : null;
  }, [coachEntries]);
  const cardMain = activeFocus && openTopic && topicFirst ? openTopic : (activeFocus || openTopic);
  const cardOther = activeFocus && openTopic ? (cardMain === openTopic ? activeFocus : openTopic) : null;
  const swapFocus = useCallback(() => {
    const next = !topicFirst;
    setTopicFirst(next);
    saveTopicFirst(userId, next);
  }, [topicFirst, userId]);
  const ackTopic = useCallback(async (id: string) => {
    await settleWrite(updateDoc(doc(db, `users/${userId}/coachLog`, id), { ackAt: serverTimestamp() }));
    setCoachEntries(prev => prev.map(e => e.id === id && e.trainingTopic
      ? { ...e, trainingTopic: { ...e.trainingTopic, ackAt: Date.now() } }
      : e));
  }, [userId]);
  const trainedTopicIds = useMemo(() => new Set(sessions.map(s => s.topicId).filter(Boolean) as string[]), [sessions]);
  // [DWA FOKUSY] Fokus trenera z własną liczbą treningów (goal na wpisie) —
  // kropki tego toru nie zależą od ustawień własnego fokusu.
  const { dots: trackDots, goal: trackGoal } = activeFocus
    ? trackSettings(activeFocus, { focusDots, focusGoal })
    : { dots: focusDots, goal: focusGoal };
  const coachGoalLocked = !!activeFocus?.entryGoal;

  // Liczone z wczytanej strony osi czasu (50 treningów) — przy starszym
  // fokusie i bardzo częstych treningach może zaniżyć, ale wtedy dawno jest 5.
  const focusCount = useMemo(
    () => activeFocus ? countFocusSessions(sessions, activeFocus) : 0,
    [sessions, activeFocus],
  );

  // Zakończony fokus nie znika z dziennika — migawka zostaje w znaczniku `cleared`.
  const endFocus = useCallback(async () => {
    if (activeFocus?.fromCoach) {
      // [DWA FOKUSY] Koniec fokusu trenera nie rusza własnego fokusu.
      const cleared: CoachFocusCleared = { since: activeFocus.since, setAt: Date.now(),
        ended: endedFocusSnapshot(activeFocus, trackDots, focusCount, trackGoal) };
      await settleWrite(updateDoc(doc(db, 'users', userId), { coachFocusCleared: cleared }));
      setCoachCleared(cleared);
      return;
    }
    const focus: OwnFocus = {
      cleared: true,
      setAt: Date.now(),
      ...(activeFocus ? { ended: endedFocusSnapshot(activeFocus, trackDots, focusCount, trackGoal) } : {}),
    };
    await settleWrite(updateDoc(doc(db, 'users', userId), { focus }));
    setOwnFocus(focus);
  }, [userId, activeFocus, trackDots, focusCount, trackGoal]);

  const endedFocus = useMemo(() => readEndedFocus(ownFocus, activeFocus), [ownFocus, activeFocus]);

  // Kamień milowy na osi czasu: ukończony (komplet kropek) albo zakończony fokus
  // dostaje stały wpis w privateNotes (id focus_<since>). Sprawdzamy na serwerze,
  // czy już jest — reguły nie pozwalają nadpisać notatki; offline po prostu
  // czekamy do następnego otwarcia dziennika.
  const milestoneTried = useRef(new Set<string>());
  useEffect(() => {
    if (isLoading || !userId) return;
    const candidates: FocusMilestone[] = [];
    if (activeFocus && trackDots) {
      const at = focusCompletedAt(sessions, activeFocus, trackGoal);
      if (at) candidates.push({ ...endedFocusSnapshot(activeFocus, true, focusCount, trackGoal), endedAt: at, done: true });
    }
    if (endedFocus) {
      const { endedAt, ...snap } = endedFocus;
      candidates.push({ ...snap, endedAt, done: !!(snap.step && snap.goal && snap.step >= snap.goal) });
    }
    candidates.forEach(async m => {
      const id = focusMilestoneId(m.since);
      if (milestoneTried.current.has(id) || notes.some(n => n.id === id)) return;
      milestoneTried.current.add(id);
      try {
        const ref = doc(db, `users/${userId}/privateNotes`, id);
        if ((await getDocFromServer(ref)).exists()) return;
        const topics = m.topic ? [m.topic] : [];
        await setDoc(ref, { kind: 'focusMilestone', text: '', topics, focus: m, createdAt: Timestamp.fromMillis(m.endedAt), ...guestExpiryFields() });
        setNotes(prev => [{ id, text: '', topics, ts: m.endedAt, milestone: m }, ...prev]);
      } catch {
        milestoneTried.current.delete(id);   // offline / błąd — spróbujemy przy następnym otwarciu
      }
    });
  }, [isLoading, userId, activeFocus, trackDots, trackGoal, focusCount, sessions, endedFocus, notes]);

  // Sprzątanie po błędzie z 2026-10-14: nowy fokus ustawiony w dniu treningu pod
  // poprzedni od razu liczył się jako ukończony i dostał wpis „ukończony”.
  // Ślad błędu: wpis done dla AKTYWNEGO fokusu z datą ukończenia sprzed jego
  // ustawienia, a po poprawce (inFocusWindow) kompletu nie ma. Tylko taki
  // wpis kasujemy — prawdziwe ukończenia mają datę po ustawieniu fokusu.
  useEffect(() => {
    if (isLoading || !userId || !activeFocus || !trackDots) return;
    const id = focusMilestoneId(activeFocus.since);
    const bogus = notes.find(n => n.id === id && n.milestone?.done && n.milestone.endedAt < activeFocus.since);
    if (!bogus || focusCompletedAt(sessions, activeFocus, trackGoal)) return;
    deleteDoc(doc(db, `users/${userId}/privateNotes`, id))
      .then(() => setNotes(prev => prev.filter(n => n.id !== id)))
      .catch(e => console.error('Fokus: nie udało się usunąć błędnego wpisu', e));
  }, [isLoading, userId, activeFocus, trackDots, trackGoal, sessions, notes]);

  // Liczba lekcji obecnego fokusu (stepper w FocusModal) — sam fokus nietknięty,
  // więc cel od trenera nie staje się „własnym", a postęp zostaje.
  const saveFocusGoal = useCallback(async (dots: boolean, goal: number) => {
    if (coachGoalLocked) return;   // liczbę fokusu trenera ustawia trener
    await settleWrite(updateDoc(doc(db, 'users', userId), dots ? { focusDots: true, focusGoal: goal } : { focusDots: false }));
    setFocusDots(dots);
    if (dots) setFocusGoal(goal);
  }, [userId, coachGoalLocked]);

  // Nowy fokus = nowa data startu, postęp od zera — także przy tym samym temacie.
  const setNewFocus = useCallback(async (topic: string, text: string, dots: boolean, goal: number) => {
    const now = Date.now();
    const countFrom = newFocusCountFrom(ownFocus, activeFocus && !activeFocus.fromCoach ? activeFocus : null, now);
    const focus: OwnFocus = { topic, text: text.slice(0, FOCUS_TEXT_MAX), setAt: now,
      ...(countFrom !== undefined ? { countFrom } : {}) };
    await settleWrite(updateDoc(doc(db, 'users', userId), {
      ...(dots ? { focus, focusDots: true, focusGoal: goal } : { focus, focusDots: false }),
      focusPrimary: deleteField(),
    }));
    setOwnFocus(focus);
    setFocusDots(dots);
    if (dots) setFocusGoal(goal);
    // ownFocus/activeFocus MUSZĄ być w zależnościach — bez nich newFocusCountFrom
    // dostawał stan z pierwszego renderu (null) i liczył od początku dnia.
  }, [userId, ownFocus, activeFocus]);

  // Edycja obecnego fokusu (tytuł + temat). Data startu zostaje, więc postęp
  // się nie resetuje. Fokus od trenera staje się przy tym własnym fokusem ucznia
  // (ta sama data startu = własny wygrywa w resolveActiveFocus) — wpisu trenera
  // w coachLog uczeń nie zmienia, więc nie podpisuje się pod nim cudzym tekstem.
  const editFocus = useCallback(async (text: string, topic: string) => {
    if (!activeFocus) return;
    // Edycja treści nie zmienia okna liczenia.
    const focus: OwnFocus = { topic, text: text.slice(0, FOCUS_TEXT_MAX), setAt: activeFocus.since,
      ...(activeFocus.countFrom !== undefined ? { countFrom: activeFocus.countFrom } : {}) };
    // [DWA FOKUSY] Przejęty fokus trenera nie może zostać obok jako drugi tor.
    const cleared: CoachFocusCleared | null = activeFocus.fromCoach ? { since: activeFocus.since, setAt: Date.now() } : null;
    await settleWrite(updateDoc(doc(db, 'users', userId), { focus, ...(cleared ? { coachFocusCleared: cleared } : {}) }));
    setOwnFocus(focus);
    if (cleared) setCoachCleared(cleared);
  }, [userId, activeFocus]);

  // Zaznaczenie = temat fokusu + migawka fokusu w sesji (wtedy kropka zostaje
  // mimo późniejszej zmiany tematów); odznaczenie zdejmuje oba.
  const toggleSessionFocus = useCallback(async (s: TbSession, focus: ActiveFocus) => {
    const marked = countsForFocusSession(s, focus);
    const topics = marked
      ? s.topics.filter(x => x !== focus.topic)
      : (s.topics.includes(focus.topic) ? s.topics : [...s.topics, focus.topic]);
    // [DWA FOKUSY] Lista migawek: zdejmujemy/dokładamy tylko ten fokus,
    // migawka drugiego toru zostaje.
    const focuses = marked
      ? s.focuses.filter(f => f.since !== focus.since)
      : [...s.focuses.filter(f => f.since !== focus.since), manualSessionFocus(focus)];
    await settleWrite(updateDoc(doc(db, `users/${userId}/sessions`, s.id), {
      topics,
      focuses,
      focus: focuses[0] ?? deleteField(),
    }));
    setSessions(prev => prev.map(x => x.id === s.id
      ? { ...x, topics, focuses, snaps: focuses.map(f => ({ since: f.since, fromCoach: !!f.fromCoach })) }
      : x));
  }, [userId]);

  const openComposer = () => setComposerOpen(true);

  // --- OŚ CZASU ---
  // Źródła są stronicowane osobno, więc pokazujemy tylko okres, który wszystkie
  // pełne strony pokrywają — inaczej stare notatki mieszałyby się z lukami w treningach.
  const { items, hasMore, cutoff, kindCounts, topicCounts } = useMemo(() => {
    // Puste źródło (przed wczytaniem albo bez wpisów) niczego nie ucina.
    const sessionsFull = !sessionsDone && sessions.length > 0;
    const notesFull = !notesDone && notes.length > 0;
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

    // Ile wpisów ma każdy temat (user 2026-10-23) — po tych samych polach co
    // filtr tematu, niezależnie od wybranego rodzaju; wpis liczy się raz.
    const topicCounts = new Map<string, number>();
    const countTopics = (arr: string[]) => new Set(arr).forEach(x => topicCounts.set(x, (topicCounts.get(x) || 0) + 1));
    sessions.forEach(s => {
      if (s.ts >= cutoff) countTopics([...s.topics, ...s.coachTopics, ...(bySession[s.id] || []).flatMap(n => n.topics)]);
    });
    notes.forEach(n => {
      if (n.ts >= cutoff && !n.milestone && !(n.sessionId && sessionIds.has(n.sessionId))) countTopics(n.topics);
    });
    ledTrainings.forEach(e => { if (e.ts >= cutoff && e.topic) countTopics([e.topic]); });
    coachEntries.forEach(e => { if (e.ts >= cutoff) countTopics(e.topics); });

    const all: TimelineItem[] = [];
    sessions.forEach(s => {
      if (s.ts < cutoff) return;
      const linked = (bySession[s.id] || []).slice().sort((a, b) => a.ts - b.ts);
      if (topic && !(hit(s.topics) || hit(s.coachTopics) || linked.some(n => hit(n.topics)))) return;
      all.push({ kind: 'session', id: s.id, ts: s.ts, session: s, linked });
    });
    // Notatki do zawodów „Nicht gestartet” (sessionId = id terminu) — w karcie zawodów.
    const skippedIds = new Set(skipped.map(ev => ev.id));
    const bySkipped: Record<string, TbPrivateNote[]> = {};
    notes.forEach(n => {
      if (n.sessionId && skippedIds.has(n.sessionId)) (bySkipped[n.sessionId] ||= []).push(n);
    });
    notes.forEach(n => {
      if (n.ts < cutoff || (n.sessionId && (sessionIds.has(n.sessionId) || skippedIds.has(n.sessionId)))) return;
      if (!hit(n.topics)) return;
      if (n.milestone) all.push({ kind: 'milestone', id: n.id, ts: n.ts, milestone: n.milestone });
      else all.push({ kind: 'private', id: n.id, ts: n.ts, note: n });
    });
    // [PROWADZONY TRENING] rola trenera
    ledTrainings.forEach(e => {
      if (e.ts < cutoff || !hit(e.topic ? [e.topic] : [])) return;
      all.push({ kind: 'led', id: e.id, ts: e.ts, entry: e });
    });
    coachEntries.forEach(e => {
      if (e.ts < cutoff || !hit(e.topics)) return;
      all.push({ kind: 'coach', id: e.id, ts: e.ts, entry: e });
    });
    // Zaległe zawody bez wyniku — w dniu (i godzinie) zawodów; bez tematów.
    const evTs = (ev: UpcomingEvent) => new Date(`${ev.date}T${/^\d{2}:\d{2}$/.test(ev.time) ? ev.time : '12:00'}:00`).getTime();
    if (!topic) missed.forEach(ev => {
      const ts = evTs(ev);
      if (!isNaN(ts) && ts >= cutoff) all.push({ kind: 'missed', id: ev.id, ts, ev });
    });
    skipped.forEach(ev => {
      const ts = evTs(ev);
      const linked = (bySkipped[ev.id] || []).slice().sort((a, b) => a.ts - b.ts);
      if (isNaN(ts) || ts < cutoff || (topic && !linked.some(n => hit(n.topics)))) return;
      all.push({ kind: 'skipped', id: ev.id, ts, ev, linked });
    });
    // „Od trenera”: uwagi trenera do treningów, wpisy trenera i tematy od trenera.
    const fromCoach = (it: TimelineItem) => (it.kind === 'session' && !!it.session.coachNote) || it.kind === 'coach';
    // Ile wpisów każdego rodzaju — panel filtrów pokazuje tylko te, które są.
    const kindCounts = new Map<Filter, number>();
    all.forEach(it => {
      const k = entryKind(it);
      kindCounts.set(k, (kindCounts.get(k) || 0) + 1);
      if (fromCoach(it)) kindCounts.set('coach', (kindCounts.get('coach') || 0) + 1);
    });
    const list = filter === 'all' ? all
      : filter === 'coach' ? all.filter(fromCoach)
      : all.filter(it => entryKind(it) === filter);
    list.sort((a, b) => b.ts - a.ts);
    // [GRUPUJ TEMATY] (user 2026-10-28) Treningi z tego samego dnia pod tematem
    // trenera stoją pod jego kartą; blok liczy się wg najnowszego wpisu w nim,
    // inne wpisy trafiają nad albo pod blok, nigdy do środka.
    let items = list;
    if (groupTopics) {
      const topicDay = new Map<string, string>();
      list.forEach(it => { if (it.kind === 'coach' && it.entry.trainingTopic) topicDay.set(it.id, it.entry.trainingTopic.day); });
      const kids = new Map<string, TimelineItem[]>();
      const rest: TimelineItem[] = [];
      list.forEach(it => {
        const tid = it.kind === 'session' ? it.session.topicId : undefined;
        if (it.kind === 'session' && tid && topicDay.get(tid) === ymd(new Date(it.ts))) {
          if (!kids.has(tid)) kids.set(tid, []);
          kids.get(tid)!.push({ ...it, nested: true });
        } else rest.push(it);
      });
      const blockTs = (it: TimelineItem) => Math.max(it.ts, ...(it.kind === 'coach' ? (kids.get(it.id) || []).map(k => k.ts) : []));
      rest.sort((a, b) => blockTs(b) - blockTs(a));
      items = rest.flatMap(it => (it.kind === 'coach' ? [it, ...(kids.get(it.id) || [])] : [it]));
    }
    return { items, hasMore: sessionsFull || notesFull, cutoff, kindCounts, topicCounts };
  }, [sessions, notes, coachEntries, ledTrainings, missed, skipped, filter, topic, sessionsDone, notesDone, groupTopics]);

  // [C39] Własne tematy trenera (`c:…`) do filtra — tylko te, które faktycznie
  // występują we wczytanych wpisach; wbudowane idą z TRAINING_TOPICS.
  const customTopicOptions = useMemo(() => {
    const ids = new Set<string>();
    const add = (arr?: string[]) => arr?.forEach(id => { if (isCustomTopic(id)) ids.add(id); });
    sessions.forEach(s => { add(s.topics); add(s.coachTopics); });
    notes.forEach(n => add(n.topics));
    coachEntries.forEach(e => add(e.topics));
    if (topic && isCustomTopic(topic)) ids.add(topic);
    return [...ids].sort((a, b) => a.localeCompare(b));
  }, [sessions, notes, coachEntries, topic]);

  // Rekord można ogłosić tylko, gdy wczytana jest cała historia treningów —
  // inaczej odznaka mówi uczciwie „najlepszy z ostatnich N".
  const insights = useMemo(
    () => computeInsights(sessions, sessionsDone),
    [sessions, sessionsDone],
  );

  // Tygodnie (od poniedziałku). Podsumowanie liczy wszystkie treningi tygodnia,
  // niezależnie od filtra — to obraz tygodnia, a nie wynik wyszukiwania.
  const groups = useMemo(() => {
    const out: { key: string; label: string; range: string; summary: string; items: TimelineItem[] }[] = [];
    const now = new Date();
    const thisWeek = weekStart(now.getTime()).getTime();
    const lastWeek = weekStart(thisWeek - DAY_MS).getTime();
    const fmt = (d: Date) => d.toLocaleDateString(i18n.language, {
      day: 'numeric', month: 'short',
      ...(d.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}),
    });
    const num = (v: number) => v.toLocaleString(i18n.language, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    items.forEach(it => {
      const start = weekStart(it.ts);
      const key = ymd(start);
      let g = out[out.length - 1];
      if (!g || g.key !== key) {
        const startMs = start.getTime();
        const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
        const inWeek = sessions.filter(s => s.ts >= Math.max(startMs, cutoff) && s.ts < startMs + 7 * DAY_MS);
        const arrows = inWeek.reduce((n, s) => n + s.arrows, 0);
        const scored = inWeek.filter(s => !s.isTech && s.score > 0 && s.arrows > 0);
        const scoredArrows = scored.reduce((n, s) => n + s.arrows, 0);
        const parts = inWeek.length ? [
          t('tagebuch.weekTrainings', { count: inWeek.length }),
          `${arrows} ${t('common.arrows')}`,
          ...(scoredArrows ? [t('tagebuch.avgShort', { avg: num(scored.reduce((n, s) => n + s.score, 0) / scoredArrows) })] : []),
        ] : [];
        g = {
          key,
          label: startMs === thisWeek ? t('tagebuch.thisWeek') : startMs === lastWeek ? t('tagebuch.lastWeek') : '',
          range: `${fmt(start)} – ${fmt(end)}`,
          summary: parts.join(' · '),
          items: [],
        };
        out.push(g);
      }
      g.items.push(it);
    });
    return out;
  }, [items, sessions, cutoff, i18n.language, t]);

  // Filtr albo temat = szukanie, więc pokazujemy wszystkie trafienia.
  const filterActive = filter !== 'all' || !!topic;
  const forceOpen = filterActive;
  const isWeekOpen = (key: string, index: number) => forceOpen || (weekOpen[key] ?? index < 2);

  // Dzień tygodnia + godzina; nagłówek tygodnia niesie resztę daty.
  const timeOf = (ts: number) => {
    if (!ts) return '';
    const d = new Date(ts);
    const time = d.toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit' });
    const now = new Date();
    const key = ymd(d);
    const day = key === ymd(now) ? t('tagebuch.today')
      : key === ymd(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)) ? t('tagebuch.yesterday')
      : d.toLocaleDateString(i18n.language, { weekday: 'short' });
    return `${day} ${time}`;
  };

  // Najbliższe terminy: dwa pierwsze + każdy nowy plan trenera.
  const nextEvents = useMemo(() => {
    const shown = upcoming.filter((ev, i) => i < 2 || (ev.isCoach && isNew('coach_plan', ev.id)));
    return shown.slice(0, 4);
  }, [upcoming, isNew]);

  const nextOpenKey = `grotx_tbNextOpen_${userId}`;
  const [nextOpen, setNextOpen] = useState(() => {
    try { return localStorage.getItem(nextOpenKey) !== '0'; } catch { return true; }
  });
  const toggleNextOpen = () => setNextOpen(o => {
    try { localStorage.setItem(nextOpenKey, o ? '0' : '1'); } catch { /* prywatny tryb */ }
    return !o;
  });

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
    // Wpis w zwiniętym tygodniu: najpierw rozwiń, efekt wróci po renderze.
    const gi = groups.findIndex(g => g.items.some(it => it.id === focusId));
    if (gi >= 0 && !isWeekOpen(groups[gi].key, gi)) {
      setWeekOpen(prev => ({ ...prev, [groups[gi].key]: true }));
      return;
    }
    // Trening z powiadomienia pokazujemy rozwinięty — po to się wchodzi.
    if (!expandedIds.has(focusId)) {
      setExpandedIds(prev => new Set(prev).add(focusId));
      return;
    }
    const el = document.getElementById(`tb-${focusId}`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setFlashId(focusId);
    setFocusId(null);
    const timer = setTimeout(() => setFlashId(null), 2200);
    return () => clearTimeout(timer);
  }, [focusId, isLoading, groups, weekOpen, forceOpen, expandedIds]);

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

  // [FILTRY PRZY „+”] (user 2026-10-23) Tylko rodzaje, które są w dzienniku
  // („Trainer” także, gdy jest trener). Tap = filtr; drugi tap = wszystko.
  const kindOptions = KIND_FILTERS.filter(k =>
    (kindCounts.get(k.kind) || 0) > 0 || filter === k.kind || (k.kind === 'coach' && showCoachFilter));
  const activeKind = KIND_FILTERS.find(k => k.kind === filter);
  const pickFilter = (k: Filter) => setFilter(f => (f === k ? 'all' : k));
  const clearFilters = () => { setFilter('all'); setTopic(''); };

  return (
    <div className="flex flex-col min-h-screen bg-[#fcfdfe] relative overflow-x-hidden">

      <ViewHeader
        onBack={onBack}
        title={t('tagebuch.title')}
        subtitle={<>
            {/* Trenerzy: jeden zwarty przycisk pod tytułem zamiast rzędu imion
                (przy kilku trenerach lista się rozlewała). 1 trener = od razu czat. */}
            {hasCoach && (
              <div className="relative mt-1 w-fit">
                <button
                  onClick={() => coaches.length === 1 ? setOpenMessageCoach(coaches[0]) : setCoachMenuOpen(v => !v)}
                  className="relative flex items-center gap-1 bg-white/10 hover:bg-white/20 active:scale-95 transition-all rounded-full pl-0.5 pr-1.5 py-0.5"
                  aria-label={t('tagebuch.coachChat')}
                  aria-expanded={coaches.length > 1 ? coachMenuOpen : undefined}
                >
                  {/* bg i text-[#0a3a2a] na TYM SAMYM elemencie — wtedy ciemny
                      motyw zostawia ciemny tekst na żółtym (reguła w tailwind.css). */}
                  <div className="flex -space-x-1">
                    {coaches.slice(0, 3).map(c => (
                      <span key={c.id} className="w-6 h-6 bg-[#fed33e] text-[#0a3a2a] text-[8px] font-black rounded-full ring-2 ring-[#0b4230] flex items-center justify-center">
                        {coachInitials(c)}
                      </span>
                    ))}
                    {coaches.length > 3 && (
                      <span className="w-6 h-6 bg-white/25 text-white text-[8px] font-black rounded-full ring-2 ring-[#0b4230] flex items-center justify-center">
                        +{coaches.length - 3}
                      </span>
                    )}
                  </div>
                  <span className="material-symbols-outlined text-[14px] text-white/70">chat</span>
                  {unreadCoachIds.size > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-red-500 border-2 border-[#0a3a2a] rounded-full" />
                  )}
                </button>
                {coachMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-30" onClick={() => setCoachMenuOpen(false)} />
                    <div className="absolute left-0 top-full mt-2 z-40 min-w-[210px] max-w-[260px] bg-white rounded-2xl shadow-xl border border-gray-100 py-1.5">
                    <p className="px-3 pt-1 pb-1.5 text-[9px] font-black text-gray-400 uppercase tracking-widest">{t('tagebuch.yourCoaches')}</p>
                    {coaches.map(c => (
                      <button
                        key={c.id}
                        onClick={() => { setCoachMenuOpen(false); setOpenMessageCoach(c); }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-left active:bg-gray-100 transition-colors"
                      >
                        <span className="w-7 h-7 bg-[#fed33e] text-[#0a3a2a] text-[9px] font-black rounded-full flex items-center justify-center shrink-0 relative">
                          {coachInitials(c)}
                          {unreadCoachIds.has(c.id) && <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-red-500 border-2 border-white rounded-full" />}
                        </span>
                        <span className="flex-1 min-w-0 text-[12px] font-bold text-[#0a3a2a] truncate">{c.firstName} {c.lastName}</span>
                        <span className="material-symbols-outlined text-[16px] text-gray-400 shrink-0">chat</span>
                      </button>
                    ))}
                    </div>
                  </>
                )}
              </div>
            )}
        </>}
      >
        {focusEditing && (
          <FocusModal
            userId={userId}
            focus={activeFocus}
            dots={trackDots}
            goal={trackGoal}
            count={focusCount}
            onSetGoal={saveFocusGoal}
            onSetNew={setNewFocus}
            onEditFocus={editFocus}
            onEnd={endFocus}
            onClose={() => setFocusEditing(false)}
          />
        )}
      </ViewHeader>

      <div className="flex-1 overflow-y-auto pb-32 px-4 pt-4 space-y-3">

        {/* FOKUS — pod nagłówkiem, jasnożółta karta jak na Home */}
        {!isLoading && (
          <FocusCard
            focus={cardMain}
            other={cardOther}
            onSwap={swapFocus}
            ended={endedFocus}
            dots={cardMain === activeFocus && trackDots}
            goal={trackGoal}
            count={focusCount}
            onEdit={() => setFocusEditing(true)}
          />
        )}

        {/* NOWY WPIS — okno od dołu (NoteSheet) po „+”: domyślnie prywatny,
            z trenerem przełącznik „Für Trainer sichtbar”; opcjonalnie Meilenstein. */}
        {composerOpen && (
          <NoteSheet
            canShare={hasCoach}
            onSave={(text, topics, important, shared, title) => addPrivateNote(text, topics, undefined, important, shared, title)}
            onClose={() => setComposerOpen(false)}
          />
        )}
        {/* Edycja — notatka przypięta do treningu/zawodów bez Meilenstein i udostępniania. */}
        {editingNote && (
          <NoteSheet
            canShare={hasCoach}
            standalone={!editingNote.sessionId}
            initial={{ text: editingNote.text, topics: editingNote.topics, important: editingNote.important, shared: editingNote.shared, title: editingNote.title }}
            onSave={(text, topics, important, shared, title) => updatePrivateNote(editingNote.id, text, topics, important, shared, title)}
            onClose={() => setEditingNote(null)}
          />
        )}
        {editingTech && (
          <TechEditSheet
            initial={{ arrows: editingTech.arrows, ts: editingTech.ts, topics: editingTech.topics, note: editingTech.note }}
            noteMax={Math.max(editingTech.isNotePublic ? SESSION_NOTE_MAX : 2000, editingTech.note.length)}
            onSave={edit => updateTech(editingTech.id, edit)}
            onClose={() => setEditingTech(null)}
          />
        )}

        {/* ALS NÄCHSTES — każdy termin w kolorze swojego rodzaju (EVENT_STYLE, 2026-10-15);
            wcześniej żółte tło: szare ginęło na jasnym tle strony
            (user, 2026-09-15). Kolory tekstu celowo spoza remapów ciemnego
            motywu, żeby na żółtym zostały ciemne w obu motywach. */}
        {nextEvents.length > 0 && (
          <div className="rounded-2xl overflow-hidden shadow-sm border border-gray-100">
            {/* Zwijane (user 2026-10-15) — stan zapamiętany w telefonie. */}
            <button
              onClick={toggleNextOpen}
              className="w-full flex items-center gap-2 px-3 py-1.5 bg-white text-left active:bg-gray-50 transition-colors"
              aria-expanded={nextOpen}
            >
              <span className="material-symbols-outlined text-[16px] text-[#0a3a2a]">event</span>
              <span className="flex-1 text-[9px] font-black text-gray-500 uppercase tracking-widest">
                {t('tagebuch.next')} · {nextEvents.length}
              </span>
              {!nextOpen && nextEvents.some(ev => ev.isCoach && !ev.isLed && isNew('coach_plan', ev.id)) && <NewBadge />}
              <span className={`material-symbols-outlined text-[18px] text-gray-400 transition-transform ${nextOpen ? 'rotate-180' : ''}`}>expand_more</span>
            </button>
            {nextOpen && nextEvents.map(ev => {
              const st = EVENT_STYLE[ev.kind];
              return (
              <button
                key={ev.id}
                onClick={() => onNavigate('CALENDAR', undefined, ev.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 text-left border-t transition-colors ${st.row}`}
              >
                <span className={`material-symbols-outlined text-[20px] shrink-0 ${st.icon}`}>{st.iconName}</span>
                <div className="flex-1 min-w-0">
                  <p className={`text-[12px] font-bold truncate ${st.text}`}>
                    {eventDateLabel(ev.date)}{ev.time ? ` ${ev.time}` : ''} · {ev.title}
                    {ev.kind === 'led' && <span className={`font-medium ${st.sub}`}> · {t('tagebuch.filterLed')}</span>}
                    {ev.kind === 'fromCoach' && <span className={`font-medium ${st.sub}`}> · {t('tagebuch.fromCoach')}</span>}
                  </p>
                </div>
                {ev.kind === 'fromCoach' && isNew('coach_plan', ev.id) && <NewBadge />}
                <span className={`material-symbols-outlined text-[18px] shrink-0 ${st.sub}`}>chevron_right</span>
              </button>
              );
            })}
          </div>
        )}

        {/* AKTYWNY FILTR — widać, czemu lista jest krótsza; × wraca do wszystkiego.
            Same filtry są w panelu przy „+” na dole. */}
        {filterActive && (
          <div className="flex items-center gap-1.5 flex-wrap">
            {activeKind && (
              <span className="inline-flex items-center gap-1 pl-1 pr-2.5 py-1 rounded-full bg-white border border-gray-200 text-[11px] font-black text-[#0a3a2a]">
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-white ${activeKind.fill}`}>
                  <span className="material-symbols-outlined text-[13px]">{activeKind.icon}</span>
                </span>
                {t(activeKind.labelKey)}
              </span>
            )}
            {topic && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white border border-gray-200 text-[11px] font-black text-emerald-700">
                <span className="material-symbols-outlined text-[14px]">psychology</span>
                {topicLabel(topic, t)}
              </span>
            )}
            <button
              onClick={clearFilters}
              className="w-7 h-7 flex items-center justify-center rounded-full bg-gray-100 text-gray-500 active:scale-90 transition-all"
              aria-label={t('tagebuch.closeFilters')}
            >
              <span className="material-symbols-outlined text-[16px]">close</span>
            </button>
          </div>
        )}

        {/* ZAPROSZENIE DO TRENERA — da się ukryć na stałe (Ustawienia → Trener dalej działa) */}
        {coachesLoaded && !hasCoach && !inviteHidden && filter === 'all' && (
          <div className="bg-white rounded-2xl border border-dashed border-emerald-300 p-3 flex items-start gap-3">
            <span className="material-symbols-outlined text-[22px] text-emerald-600 shrink-0">person_add</span>
            <button
              onClick={hideInvite}
              className="order-last shrink-0 -mr-1 -mt-1 w-7 h-7 flex items-center justify-center rounded-full text-gray-300 active:bg-gray-100"
              aria-label={t('tagebuch.inviteHide')}
            >
              <span className="material-symbols-outlined text-[16px]">close</span>
            </button>
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
          groups.map((g, gi) => {
            const open = isWeekOpen(g.key, gi);
            const toggle = () => setWeekOpen(prev => ({ ...prev, [g.key]: !open }));
            return (
            <div key={g.key} className="space-y-2">
              {/* Nagłówek tygodnia: nazwa albo zakres dat + podsumowanie; klik zwija */}
              <button onClick={toggle} className="w-full pt-3 pb-1 flex items-center gap-2 text-left active:opacity-60" aria-expanded={open}>
                <div className="flex-1 min-w-0">
                  <p className="flex items-baseline gap-2 min-w-0">
                    <span className="text-[15px] font-black text-[#0a3a2a] leading-tight shrink-0">{g.label || g.range}</span>
                    {g.label && <span className="text-[11px] font-bold text-gray-400 truncate">{g.range}</span>}
                  </p>
                  {g.summary && <p className="text-[11px] font-bold text-gray-500 leading-tight mt-0.5 truncate">{g.summary}</p>}
                </div>
                <span className={`material-symbols-outlined text-[20px] text-gray-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}>expand_more</span>
              </button>
              {!open && (
                <button
                  onClick={toggle}
                  className="w-full py-2.5 text-[10px] font-black text-gray-500 uppercase tracking-widest bg-white border border-dashed border-gray-200 rounded-2xl active:scale-[0.99] transition-all"
                >
                  {t('tagebuch.showWeek')}
                </button>
              )}
              {open && g.items.map((it, idx) => (
                <React.Fragment key={`${it.kind}_${it.id}`}>
                {/* Przegródka „Heute” nad dzisiejszymi wpisami (user 2026-10-23, wariant 1). */}
                {g.items.findIndex(isTodayItem) === idx && (
                  <div className="flex items-center gap-2 px-1 pt-1" aria-hidden>
                    <span className="text-[10px] font-black uppercase tracking-widest text-emerald-700">{t('tagebuch.today')}</span>
                    <span className="flex-1 h-px bg-emerald-200" />
                  </div>
                )}
                {/* Trening pod tematem dnia: wcięty, fioletowa linia łączy go z kartą tematu. */}
                <div className={it.kind === 'session' && it.nested ? 'relative pl-4 !mt-1' : undefined}>
                {it.kind === 'session' && it.nested && (
                  <span className="absolute left-1.5 -top-1 bottom-1/2 w-2.5 border-l-2 border-b-2 border-violet-300 rounded-bl-lg" aria-hidden />
                )}
                <div
                  id={`tb-${it.id}`}
                  // Dzisiejsze wpisy w pełni, starsze lekko przygaszone (user 2026-10-23: „max 5%”).
                  className={`rounded-2xl transition-shadow duration-500 ${isTodayItem(it) ? 'tb-today' : 'brightness-[0.96]'} ${flashId === it.id ? 'ring-2 ring-emerald-400' : ''}`}
                >
                  {it.kind === 'session' ? (
                    <SessionCard
                      session={it.session}
                      time={timeOf(it.ts)}
                      insight={insights.get(it.session.id)}
                      focus={trackDots && activeFocus?.topic && inFocusWindow(it.session, activeFocus)
                        // Ukończony fokus: nowe treningi już się nie dopisują,
                        // zaliczone można jeszcze odznaczyć.
                        && (focusCount < trackGoal || countsForFocusSession(it.session, activeFocus))
                        ? { topic: activeFocus.topic, marked: countsForFocusSession(it.session, activeFocus), onToggle: () => toggleSessionFocus(it.session, activeFocus) }
                        : undefined}
                      linkedNotes={it.linked}
                      underTopic={it.nested}
                      hasCoach={hasCoach}
                      isNew={isNew('coach_note', it.session.id)}
                      expanded={expandedIds.has(it.session.id)}
                      onToggle={() => toggleExpanded(it.session.id)}
                      onOpenStats={() => {
                        const day = statsDate(it.session);
                        if (day) onNavigateToStats?.(day, it.session.id);
                      }}
                      onAddNote={addSessionNote}
                      onDeleteNote={deleteNote}
                      onEditNote={setEditingNote}
                      onEditTech={() => setEditingTech(it.session)}
                    />
                  ) : it.kind === 'milestone' ? (
                    <FocusMilestoneCard milestone={it.milestone} time={timeOf(it.ts)} onDelete={() => deleteMilestone(it.id)} />
                  ) : it.kind === 'missed' ? (
                    <MissedTournamentCard title={it.ev.title} date={it.ev.date} time={timeOf(it.ts)} onEnter={() => setScoreFor(it.ev)} onSkip={() => markSkipped(it.ev, true)} />
                  ) : it.kind === 'skipped' ? (
                    <SkippedTournamentCard
                      title={it.ev.title}
                      date={it.ev.date}
                      time={timeOf(it.ts)}
                      notes={it.linked}
                      onAddNote={(text, topics) => addPrivateNote(text, topics, it.ev.id)}
                      onDeleteNote={deleteNote}
                      onEditNote={setEditingNote}
                      onUndo={() => markSkipped(it.ev, false)}
                    />
                  ) : it.kind === 'led' ? (
                    <LedTrainingCard entry={it.entry} time={timeOf(it.ts)} />
                  ) : it.kind === 'private' ? (
                    <PrivateNoteCard note={it.note} time={timeOf(it.ts)} onDelete={deleteNote} onEdit={() => setEditingNote(it.note)} />
                  ) : it.entry.trainingTopic ? (
                    <TrainingTopicCard
                      entry={it.entry}
                      time={timeOf(it.ts)}
                      isNew={isNew('coach_log', it.entry.id)}
                      trained={trainedTopicIds.has(it.entry.id)}
                      autoOpen={expandedIds.has(it.entry.id)}
                      onAck={() => ackTopic(it.entry.id)}
                    />
                  ) : (
                    <CoachEntryCard entry={it.entry} time={timeOf(it.ts)} isNew={isNew('coach_log', it.entry.id)} />
                  )}
                </div>
                </div>
                {/* Linia zamykająca „Heute” — pod ostatnim dzisiejszym wpisem (user 2026-10-23). */}
                {isTodayItem(it) && g.items.findIndex((x, i) => i > idx && isTodayItem(x)) === -1 && (
                  <div className="px-1 pt-0.5" aria-hidden><div className="h-px bg-emerald-200" /></div>
                )}
                </React.Fragment>
              ))}
            </div>
            );
          })
        )}

        {!isLoading && hasMore && (
          <button
            ref={loadMoreRef}
            onClick={loadMore}
            disabled={isLoadingMore}
            className="w-full py-3 text-[10px] font-black text-gray-500 uppercase tracking-widest bg-white border border-gray-200 rounded-2xl active:scale-[0.99] transition-all disabled:opacity-50"
          >
            {isLoadingMore ? t('tagebuch.loading') : t('tagebuch.loadMore')}
          </button>
        )}
      </div>

      {/* „+" nowa notatka. Portal, bo <main> w App ma transform (scale) —
          fixed wewnątrz liczyłby się od niego, a nie od ekranu. */}
      {/* [FILTRY PRZY „+”] (user 2026-10-23) Mniejsze kółko (¾ plusa) obok „+”;
          panel z ikonami rodzajów wpisów wysuwa się nad przyciskami. */}
      {!composerOpen && !editingNote && !editingTech && !focusEditing && !openMessageCoach && createPortal(
        <>
          {filtersOpen && (
            <>
              <div className="fixed inset-0 z-[59]" onClick={() => setFiltersOpen(false)} aria-hidden />
              <div
                className="fixed right-[max(1rem,calc((100vw_-_28rem)/2_+_1rem))] bottom-[calc(env(safe-area-inset-bottom)+150px)] z-[61] w-[min(19rem,calc(100vw_-_2rem))] max-h-[calc(100dvh_-_220px)] overflow-y-auto bg-white rounded-2xl border border-gray-100 shadow-xl shadow-black/15 p-3 tb-fade-in"
                role="dialog"
                aria-label={t('tagebuch.filters')}
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="flex-1 text-[9px] font-black uppercase tracking-widest text-gray-400">{t('tagebuch.filters')}</span>
                  <button
                    onClick={toggleFiltersWide}
                    className="flex items-center gap-0.5 text-[10px] font-black text-emerald-700 px-2 py-1 rounded-full active:bg-gray-100"
                    aria-expanded={filtersWide}
                  >
                    {t(filtersWide ? 'tagebuch.filtersCollapse' : 'tagebuch.filtersExpand')}
                    <span className={`material-symbols-outlined text-[16px] transition-transform ${filtersWide ? 'rotate-180' : ''}`}>expand_more</span>
                  </button>
                  {filterActive && (
                    <button onClick={clearFilters} className="w-7 h-7 flex items-center justify-center rounded-full bg-gray-100 text-gray-500 active:scale-90" aria-label={t('tagebuch.closeFilters')}>
                      <span className="material-symbols-outlined text-[16px]">filter_alt_off</span>
                    </button>
                  )}
                </div>
                {/* Zwinięte: same ikony w siatce; rozwinięte: ikona + opis + liczba wpisów. */}
                <div className={filtersWide ? 'space-y-0.5' : 'grid grid-cols-5 gap-2'}>
                  {kindOptions.map(k => {
                    const on = filter === k.kind;
                    const count = kindCounts.get(k.kind) || 0;
                    const badge = k.kind === 'coach' ? coachNewCount : 0;
                    const dot = (
                      <span className={`relative w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-all ${on ? `${k.fill} text-white` : `tb-icon ${k.color}`}`}>
                        <span className="material-symbols-outlined text-[20px]">{k.icon}</span>
                        {badge > 0 && <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-emerald-600 text-white text-[9px] font-black flex items-center justify-center">{badge}</span>}
                      </span>
                    );
                    return filtersWide ? (
                      <button key={k.kind} onClick={() => pickFilter(k.kind)} className={`w-full flex items-center gap-2.5 p-1 pr-2 rounded-xl text-left active:scale-[0.98] transition-all ${on ? 'bg-gray-50' : ''}`} aria-pressed={on}>
                        {dot}
                        <span className="flex-1 min-w-0 text-[12px] font-black text-[#0a3a2a] truncate">{t(k.labelKey)}</span>
                        <span className="text-[11px] font-bold text-gray-400 tabular-nums">{count}</span>
                      </button>
                    ) : (
                      <button key={k.kind} onClick={() => pickFilter(k.kind)} className="flex justify-center active:scale-90 transition-all" aria-pressed={on} aria-label={t(k.labelKey)} title={t(k.labelKey)}>
                        {dot}
                      </button>
                    );
                  })}
                  {/* Tematy w zwiniętym — ta sama ikona co w rozwiniętym wyborze tematu;
                      tap pokazuje wybór tematu pod ikonami (user 2026-10-23). */}
                  {!filtersWide && (
                    <button onClick={() => setTopicPickOpen(v => !v)} className="flex justify-center active:scale-90 transition-all" aria-expanded={topicPickOpen} aria-label={t('tagebuch.topic')} title={t('tagebuch.topic')}>
                      <span className={`relative w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-all ${topic ? 'bg-emerald-600 text-white' : topicPickOpen ? 'bg-emerald-50 text-emerald-700 ring-2 ring-emerald-200' : 'tb-icon text-emerald-700'}`}>
                        <span className="material-symbols-outlined text-[20px]">psychology</span>
                      </span>
                    </button>
                  )}
                </div>
                {/* Temat treningu — w rozwiniętym zawsze, w zwiniętym po tapnięciu ikony tematów. */}
                {(filtersWide || topicPickOpen) && (
                  <TopicFilter value={topic} onChange={setTopic} counts={topicCounts} customIds={customTopicOptions} />
                )}
                {/* [GRUPUJ TEMATY] Układ osi czasu (user 2026-10-28). */}
                <div className="mt-3 pt-2 border-t border-gray-100">
                  <span className="block text-[9px] font-black uppercase tracking-widest text-gray-400 mb-1.5">{t('tagebuch.layout')}</span>
                  <div className="grid grid-cols-2 gap-1 p-0.5 bg-gray-100 rounded-full">
                    {([[true, 'tagebuch.layoutGrouped', 'account_tree'], [false, 'tagebuch.layoutChrono', 'schedule']] as const).map(([on, key, icon]) => (
                      <button
                        key={key}
                        onClick={() => pickGroupTopics(on)}
                        className={`flex items-center justify-center gap-1 py-1.5 rounded-full text-[10px] font-black transition-all ${groupTopics === on ? 'bg-white text-[#0a3a2a] shadow-sm' : 'text-gray-500'}`}
                        aria-pressed={groupTopics === on}
                      >
                        <span className="material-symbols-outlined text-[14px]">{icon}</span>
                        {t(key)}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}
          <button
            onClick={() => setFiltersOpen(v => !v)}
            className={`fixed right-[max(4.5rem,calc((100vw_-_28rem)/2_+_4.5rem))] bottom-[calc(env(safe-area-inset-bottom)+98px)] z-[60] w-9 h-9 rounded-full shadow-md shadow-black/20 flex items-center justify-center active:scale-90 transition-all ${
              activeKind ? `${activeKind.fill} text-white` : filtersOpen ? 'bg-[#0a3a2a] text-[#fed33e]' : 'bg-white text-[#0a3a2a] border border-gray-200'
            }`}
            aria-label={t('tagebuch.filters')}
            aria-expanded={filtersOpen}
          >
            <span className="material-symbols-outlined text-[19px]">{activeKind ? activeKind.icon : 'filter_list'}</span>
            {topic && !activeKind && <span className="absolute top-0.5 right-0.5 w-2 h-2 bg-[#fed33e] rounded-full" />}
          </button>
        <button
          onClick={openComposer}
          // Prawy brzeg KOLUMNY aplikacji (max-w-md = 28rem), nie okna — na
          // komputerze `right-4` lądowało przy krawędzi ekranu (user 2026-10-14).
          className="fixed right-[max(1rem,calc((100vw_-_28rem)/2_+_1rem))] bottom-[calc(env(safe-area-inset-bottom)+92px)] z-[60] w-12 h-12 rounded-full bg-[#0a3a2a] text-[#fed33e] shadow-lg shadow-black/25 flex items-center justify-center active:scale-90 transition-all"
          aria-label={t('tagebuch.newNote')}
        >
          <span className="material-symbols-outlined text-[26px]">add</span>
        </button>
        </>,
        document.body,
      )}

      {/* Zaległy wynik zawodów — zapis w dniu zawodów (eventDate), potem statystyki tego dnia. */}
      {scoreFor && (
        <TournamentScoreInput
          userId={userId}
          eventId={scoreFor.id}
          tournamentName={scoreFor.title}
          distance={scoreFor.distance || '70m'}
          distanceId={scoreFor.distanceId}
          distanceLabel={scoreFor.distanceLabel}
          eventDate={scoreFor.date}
          // Po zapisie okno samo przechodzi do statystyk; przy powrocie dziennik czyta zawody od nowa.
          onClose={() => setScoreFor(null)}
          onNavigate={onNavigate}
        />
      )}

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
