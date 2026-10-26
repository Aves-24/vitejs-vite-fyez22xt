import React, { useState, useEffect, useRef } from 'react';
import { db } from '../firebase';
import { doc, getDoc, setDoc, updateDoc, arrayUnion, arrayRemove, collection, query, where, getDocs, onSnapshot, writeBatch, serverTimestamp, orderBy, limit, deleteField } from 'firebase/firestore';
import { useTranslation } from 'react-i18next';
import { Html5Qrcode } from 'html5-qrcode';
import { createPortal } from 'react-dom';
import StudentMessageSheet from '../components/StudentMessageSheet';
import ViewHeader from '../components/ViewHeader';
import { getPublicProfile } from '../utils/publicProfile';
import { loadUpcomingEvents } from '../utils/upcomingEvents';
import { effectiveCoachLimit } from '../utils/coachAccess';
import { topicLabel } from '../constants/trainingTopics';
import { loadFocusState, type FocusState } from '../utils/focus';
import { FocusDots, focusTitle } from '../components/tagebuch/FocusCard';
import { CARD_SHAPE } from '../components/tagebuch/TagebuchCards';
import CoachStudentSheet from '../components/CoachStudentSheet';
import GroupIconPicker from '../components/GroupIconPicker';
import { DEFAULT_GROUP_ICON, groupIcon } from '../constants/groupIcons';
import GroupTopicPanel,{ GroupSectionHeader, type GroupTopic, type GroupTopicsByDay } from '../components/GroupTopicPanel';
import GroupTrainingHistory from '../components/GroupTrainingHistory';
import { rankFromStored } from '../utils/rankEngine';
import { dayKeyOf } from '../utils/focus';
import { type GroupSchedule, type ScheduleSlot, normalizeSchedule, sortSlots, upcomingOccurrences, prevOccurrence } from '../utils/groupSchedule';

const EMPTY_NOTES: { id: string; text: string; timestamp: number }[] = [];
import { formatViewerAgeCategory } from '../utils/privateProfile';

/** Po tylu dniach bez treningu uczeń trafia do paska „wypada z rytmu". */
const INACTIVE_DAYS = 14;
// Heute: tyle wierszy na listę, reszta pod „Alle anzeigen”.
const TODAY_SHOWN = 3;
// [PAUZA] Po tylu dniach pauzy uczeń wraca RAZ do „bez treningu" jako
// przypomnienie (user 2026-09-18: najpierw 14 dni, potem jeszcze miesiąc).
const PAUSE_REMIND_DAYS = 30;

/**
 * [PAUZA] Uczniowie wstrzymani przez trenera (choroba, kontuzja — bez powodu
 * i bez daty, user 2026-09-18). Leży w `users/{coachId}.coachPausedStudents`
 * jako `{ [studentId]: { at, reminded? } }` — pole spoza chronionych, więc
 * przechodzi przez Path B reguł bez zmian. Pauza kończy się sama, gdy uczeń
 * zapisze trening po `at`.
 */
export interface StudentPause { at: number; reminded?: boolean }

/**
 * Forma = ostatni trening kontra POPRZEDNI na tym samym dystansie, tarczy
 * i klasie łuku (decyzja usera 2026-09-10). Wcześniej był tu trend
 * handicapu — trener nie umiał go przeczytać („Handicap 34 → 30", maleje,
 * gdy jest lepiej). Teraz widzi prawdziwe punkty: „70m · teraz 312 ·
 * poprzednio 298". Ten sam dystans, bo 312 na 18 m i 298 na 70 m nic nie
 * mówią.
 *
 * Zmiana liczona na średniej na strzałę (sesje mają różną liczbę strzał),
 * pokazywana od 5% — mniejsza to zwykły rozrzut między treningami
 * (5% ≈ 15 pkt na 36 strzał, ≈ 30 na 72).
 */
const FORM_MIN_CHANGE = 0.05;
const FORM_SESSIONS_READ = 10;
// Wynik ucznia zmienia się tylko po jego nowym treningu (wtedy liczymy od
// razu), doba to zapas na edycję lub usunięcie starszej sesji.
const FORM_TTL = 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

interface FormCompare {
  dir: 'up' | 'down';
  /** „70m" albo „18m barebow" — nazwa dystansu z chwili strzału. */
  distance: string;
  now: number; nowArrows: number;
  prev: number; prevArrows: number;
  /** Zmiana średniej na strzałę, np. 0.07 = +7%. */
  pct: number;
  /** Czas ostatniego treningu — po obejrzeniu ucznia wpis znika z „Forma”. */
  at: number;
}

// Poza JSX ikony: skrypt icon-font czyta literały w <span> ikony i brałby
// „up" z warunku za nazwę ikony.
const TREND_ICON = { up: 'trending_up', down: 'trending_down' } as const;
const ROW_ICON = { lastTraining: 'schedule' } as const;
// Ikona na początku linii wpisu trenera — rodzaj widać bez czytania (user 2026-10-22).
const LOG_ICON: Record<string, string> = {
  observation: 'visibility', tip: 'lightbulb', goal: 'center_focus_strong', flag: 'priority_high', topic: 'sports',
};

const scoredArrows = (x: any): number => Number(x.scoreArrows ?? x.sessionArrows ?? x.arrows) || 0;

/** Ta sama konkurencja: dystans (id wpisu, a bez niego metry), tarcza, klasa łuku. */
const sameKind = (a: any, b: any) =>
  (a.distanceId && b.distanceId ? a.distanceId === b.distanceId : a.distance === b.distance)
  && (a.targetType || '') === (b.targetType || '')
  && (!a.bowClass || !b.bowClass || a.bowClass === b.bowClass);

/**
 * Porównanie formy dla uczniów aktywnych w ostatnich INACTIVE_DAYS (reszta
 * i tak siedzi w „bez treningu"). Zapytanie na ucznia (10 ostatnich sesji),
 * wynik w pamięci per uczeń — liczony na nowo po jego nowym treningu.
 */
/**
 * [C37] Zielona kropka przy „Uczniowie" (życzenie usera 2026-09-16): trener
 * wchodzi w panel i ma widzieć, że doszedł ktoś nowy, bez rozwijania listy.
 * „Nowy" = uczeń, którego id nie ma jeszcze na liście obejrzanych.
 *
 * Lista leży w `users/{coachId}.coachSeenStudents`, a nie w localStorage
 * (decyzja usera 2026-09-16): dzięki temu odhaczenie na telefonie gasi kropkę
 * także na laptopie. Dokument trenera i tak jest czytany przy wejściu w panel,
 * więc nie kosztuje to dodatkowego odczytu. Reguł nie trzeba było ruszać —
 * Path B (`allow update: if isSelf(uid)`) przepuszcza własne pola spoza listy
 * chronionych, a `coachSeenStudents` do niej nie należy.
 *
 * Pierwsze wejście zasiewa listę bieżącymi uczniami, żeby po aktualizacji
 * aplikacji cała klasa nie zapaliła się naraz jako „nowa".
 */
async function saveSeenStudents(coachId: string, ids: string[]) {
  try {
    await setDoc(doc(db, 'users', coachId), { coachSeenStudents: ids }, { merge: true });
  } catch (e) {
    // Kropka to tylko podpowiedź — brak zapisu nie może wywrócić panelu.
    console.error('Zapis obejrzanych uczniów nie powiódł się:', e);
  }
}

type FormCacheEntry = { act: number; cmp: FormCompare | null; exp: number };

async function loadFormCompare(coachId: string, students: any[]): Promise<Record<string, FormCompare>> {
  const active = students.filter(s => s.exactLastActivity && Date.now() - s.exactLastActivity < INACTIVE_DAYS * DAY_MS);
  // Pamięć per uczeń: liczymy na nowo tylko tych, którzy od ostatniego razu
  // potrenowali (inny `exactLastActivity`). Dawniej jeden trening dowolnego
  // ucznia kasował cały wynik i panel czytał po 10 sesji od każdego.
  const key = `grotX_formCompare3_${coachId}`;
  let cache: Record<string, FormCacheEntry> = {};
  try {
    const raw = localStorage.getItem(key);
    if (raw) cache = JSON.parse(raw) || {};
  } catch { /* uszkodzony wpis — czytamy z bazy */ }
  const now = Date.now();
  const fresh = (s: any) => {
    const c = cache[s.id];
    return !!c && c.act === s.exactLastActivity && now <= c.exp;
  };

  const entries = await Promise.all(active.map(async s => {
    if (fresh(s)) return [s.id, cache[s.id].cmp, true] as const;
    try {
      const snap = await getDocs(query(
        collection(db, `users/${s.id}/sessions`),
        orderBy('timestamp', 'desc'),
        limit(FORM_SESSIONS_READ)
      ));
      // Tylko sesje z wynikiem — trening „na ilość" nie mówi nic o formie.
      const sessions = snap.docs.map(d => d.data()).filter(x => x.score > 0 && scoredArrows(x) > 0);
      const [last, ...rest] = sessions;
      const prev = last && rest.find(x => sameKind(last, x));
      if (!last || !prev) return [s.id, null, false] as const;
      const avgNow = last.score / scoredArrows(last);
      const avgPrev = prev.score / scoredArrows(prev);
      const pct = (avgNow - avgPrev) / avgPrev;
      if (Math.abs(pct) < FORM_MIN_CHANGE) return [s.id, null, false] as const;
      const cmp: FormCompare = {
        dir: pct > 0 ? 'up' : 'down',
        distance: String(last.distanceLabel || last.distance || ''),
        now: last.score, nowArrows: scoredArrows(last),
        prev: prev.score, prevArrows: scoredArrows(prev),
        pct,
        at: last.timestamp?.toMillis ? last.timestamp.toMillis() : (last.timestamp?.seconds || 0) * 1000,
      };
      return [s.id, cmp, false] as const;
    } catch { return null; }
  }));

  const data: Record<string, FormCompare> = {};
  const nextCache: Record<string, FormCacheEntry> = {};
  for (const e of entries) {
    if (!e) continue; // błąd odczytu — bez wpisu w pamięci, następnym razem od nowa
    const [sid, cmp, wasCached] = e;
    if (cmp) data[sid] = cmp;
    const s = active.find(x => x.id === sid);
    nextCache[sid] = wasCached ? cache[sid] : { act: s.exactLastActivity, cmp, exp: now + FORM_TTL };
  }
  try {
    localStorage.setItem(key, JSON.stringify(nextCache));
  } catch { /* ignore */ }
  return data;
}

interface StudentTournament { title: string; date: string; names: string[] }

const STUDENT_TOURNAMENT_TTL = 30 * 60 * 1000;

/** Ile startów podopiecznych mieści rozwinięta sekcja — tyle, co terminy. */
const STUDENT_TOURNAMENTS_SHOWN = 3;

/**
 * Najbliższe starty podopiecznych, rosnąco po dacie. Zwinięta sekcja pokazuje
 * pierwszy, rozwinięta — do `STUDENT_TOURNAMENTS_SHOWN` (życzenie usera
 * 2026-09-10: jak „Najbliższe terminy"). Uczniowie jadący na to samo (ta sama
 * data i nazwa) są zebrani w jeden wpis. Zapytanie na ucznia — dlatego wynik
 * leży 30 min w pamięci, unieważniany zmianą listy uczniów.
 * `limit(15)`, nie filtr kategorii w zapytaniu: stare terminy nie mają
 * `category` (liczą się jako turniej), a przed turniejem mogą stać kopie
 * terminów od trenera.
 */
// [MEILENSTEIN] (user 2026-10-23) Kamienie milowe, które uczniowie sami
// udostępnili (privateNotes: shared + important), z ostatnich 30 dni — na
// stronie głównej panelu, nie dopiero w zakładce ucznia. Reguła wpuszcza
// trenera tylko z filtrem shared == true. Jak starty: zapytanie na ucznia,
// wynik 30 min w pamięci telefonu.
interface StudentMilestone { student: any; id: string; title: string; text: string; ts: number }
const MILESTONE_DAYS = 30;

async function loadStudentMilestones(coachId: string, students: any[]): Promise<StudentMilestone[]> {
  const key = `grotX_studentMilestones2_${coachId}`; // 2: z tytułem
  const ids = students.map(s => s.id).sort().join(',');
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const cached = JSON.parse(raw);
      if (cached.ids === ids && Date.now() <= cached.expiresAt) {
        // W pamięci tylko id ucznia — obiekt ucznia bierzemy z bieżącej listy.
        return (cached.data as any[])
          .map(m => ({ ...m, student: students.find(s => s.id === m.studentId) }))
          .filter(m => m.student);
      }
    }
  } catch { /* uszkodzony wpis — czytamy z bazy */ }

  const since = Date.now() - MILESTONE_DAYS * 24 * 60 * 60 * 1000;
  const found = await Promise.all(students.map(async s => {
    try {
      // Dwie równości — bez indeksu złożonego; datę filtrujemy tutaj.
      const snap = await getDocs(query(
        collection(db, `users/${s.id}/privateNotes`),
        where('shared', '==', true),
        where('important', '==', true),
        limit(10),
      ));
      return snap.docs.map(d => {
        const data = d.data();
        const c = data.createdAt;
        const ts = typeof c?.toMillis === 'function' ? c.toMillis() : typeof c === 'number' ? c : 0;
        return { student: s, id: d.id, title: typeof data.title === 'string' ? data.title : '', text: String(data.text || ''), ts };
      }).filter(m => m.ts >= since);
    } catch { return []; }
  }));
  const data = found.flat().sort((a, b) => b.ts - a.ts);
  try {
    localStorage.setItem(key, JSON.stringify({
      ids, expiresAt: Date.now() + STUDENT_TOURNAMENT_TTL,
      data: data.map(({ student, ...m }) => ({ ...m, studentId: student.id })),
    }));
  } catch { /* ignore */ }
  return data;
}

async function loadStudentTournaments(coachId: string, students: any[]): Promise<StudentTournament[]> {
  const key = `grotX_studentTournaments_${coachId}`;
  const ids = students.map(s => s.id).sort().join(',');
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const cached = JSON.parse(raw);
      if (cached.ids === ids && Date.now() <= cached.expiresAt) return cached.data;
    }
  } catch { /* uszkodzony wpis — czytamy z bazy */ }

  const today = new Date().toISOString().split('T')[0];
  const found = await Promise.all(students.map(async s => {
    try {
      const snap = await getDocs(query(
        collection(db, `users/${s.id}/tournaments`),
        where('date', '>=', today),
        orderBy('date', 'asc'),
        limit(15)
      ));
      return snap.docs
        .map(d => d.data())
        .filter(e => e.category === 'Turniej' || !e.category)
        .map(e => ({ student: s, title: String(e.title || ''), date: String(e.date) }));
    } catch { return []; }
  }));

  const groups = new Map<string, StudentTournament>();
  for (const h of found.flat()) {
    const k = `${h.date}|${h.title.trim().toLowerCase()}`;
    const name = `${h.student.firstName || ''} ${h.student.lastName ? h.student.lastName[0] + '.' : ''}`.trim();
    const g = groups.get(k);
    if (g) { if (!g.names.includes(name)) g.names.push(name); }
    else groups.set(k, { title: h.title, date: h.date, names: [name] });
  }
  const data = [...groups.values()]
    .sort((a, b) => a.date.localeCompare(b.date) || b.names.length - a.names.length)
    .slice(0, STUDENT_TOURNAMENTS_SHOWN);
  try {
    localStorage.setItem(key, JSON.stringify({ ids, data, expiresAt: Date.now() + STUDENT_TOURNAMENT_TTL }));
  } catch { /* ignore */ }
  return data;
}

interface CoachDashboardViewProps {
  userId: string;
  onNavigate: (view: string, tab?: string, extraData?: string, studentId?: string) => void;
  pendingOpenStudentId?: string | null;
  onClearPending?: () => void;
  /** Z terminu tematu w kalendarzu: zakładka Grupy z tą grupą rozwiniętą. */
  pendingOpenGroupId?: string | null;
  onClearPendingGroup?: () => void;
  /** Zakładka trybu trenera z dolnego menu: Heute albo Schüler (z Gruppen). */
  section?: 'TODAY' | 'ATHLETES' | 'GROUPS';
}

export default function CoachDashboardView({ userId, onNavigate, pendingOpenStudentId, onClearPending, pendingOpenGroupId, onClearPendingGroup, section = 'TODAY' }: CoachDashboardViewProps) {
  const { t, i18n } = useTranslation();
  const [students, setStudents] = useState<any[]>([]);
  const [coachLimit, setCoachLimit] = useState<number>(0);
  const [studentLastChecked, setStudentLastChecked] = useState<Record<string, number>>({});
  // [C37] Uczniowie, których trener jeszcze nie oglądał — źródło zielonej kropki.
  const [newStudentIds, setNewStudentIds] = useState<string[]>([]);
  // [C37] Po rozwinięciu „Uczniowie" kropka z przycisku przechodzi na wiersze
  // nowych uczniów (życzenie usera 2026-09-16) i zostaje do wyjścia z panelu —
  // w bazie są już odhaczeni, więc przy następnym wejściu nie wrócą.
  const [highlightStudentIds, setHighlightStudentIds] = useState<string[]>([]);
  
  const [isScanning, setIsScanning] = useState(false);
  const [cameraError, setCameraError] = useState<string | false>(false);
  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Uczniowie do usunięcia / do przypisania grup — zaznaczeni w trybie wyboru.
  const [studentsToDelete, setStudentsToDelete] = useState<string[] | null>(null);
  const [manualStudentId, setManualStudentId] = useState('');
  // [C38] Potwierdzenie wysłania zaproszenia — okienko zamiast znikającego
  // toastu (zgłoszenie usera 2026-09-16: informacja ginęła za szybko).
  // Wartość = nazwa ucznia z publicznego lustra ('' gdy brak).
  const [inviteSentTo, setInviteSentTo] = useState<string | null>(null);

  // Komunikacja Grupowa
  const [selectedStudents, setSelectedStudents] = useState<string[]>([]);
  // Tryb wyboru (życzenie usera 2026-09-10): kółko zaznaczania nie siedzi
  // stale w wierszu — pojawia się dopiero po „Wybierz" nad listą.
  const [isSelecting, setIsSelecting] = useState(false);
  const exitSelecting = () => { setIsSelecting(false); setSelectedStudents([]); };
  const [isMessageModalOpen, setIsMessageModalOpen] = useState(false);
  // Wiadomość wysłana z karty grupy (✉) — nazwa w oknie; po zamknięciu
  // bez wysyłki zaznaczenie wraca do pustego, bo trener niczego nie zaznaczał.
  const [messageGroupName, setMessageGroupName] = useState<string | null>(null);
  // „+ Dodaj ucznia" w rozwiniętej grupie: do której grupy i kogo zaznaczono.
  const [addToGroupId, setAddToGroupId] = useState<string | null>(null);
  const [addPicked, setAddPicked] = useState<string[]>([]);
  const [msgTitle, setMsgTitle] = useState('');
  const [msgContent, setMsgContent] = useState('');
  const [isSendingMsg, setIsSendingMsg] = useState(false);

  // Zarządzanie Grupami i Dziennikiem
  const [coachGroups, setCoachGroups] = useState<{id: string, name: string, icon?: string, schedule?: GroupSchedule}[]>([]);
  // [HARMONOGRAM] Edytor stałego treningu grupy (id grupy albo null).
  const [scheduleGroupId, setScheduleGroupId] = useState<string | null>(null);
  const [schedSlots, setSchedSlots] = useState<ScheduleSlot[]>([]);
  const [schedEvery, setSchedEvery] = useState<1 | 2>(1);
  const [studentGroupMap, setStudentGroupMap] = useState<Record<string, string[]>>({});
  const [groupNotes, setGroupNotes] = useState<Record<string, {id: string, text: string, timestamp: number}[]>>({});
  
  // Rozwinięta grupa w zakładce GRUPY; 'ALL' = żadna.
  const [activeGroup, setActiveGroup] = useState<string>('ALL');
  // Lista członków w rozwiniętej grupie — zwinięta (user 2026-10-14: grupa to
  // głównie wiadomości, fokus i statystyki).
  const [isGroupListOpen, setIsGroupListOpen] = useState(false);
  const [coachGroupTopics, setCoachGroupTopics] = useState<Record<string, GroupTopicsByDay>>({});
  // Życzenie usera 2026-09-10: pod przełącznikiem nic, dopóki trener nie
  // wybierze zakładki; ponowny klik zwija.
  // Schüler i Gruppen to osobne zakładki dolnego menu (user 2026-10-26).
  const viewMode: 'groups' | 'students' = section === 'GROUPS' ? 'groups' : 'students';
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupIcon, setNewGroupIcon] = useState(DEFAULT_GROUP_ICON);
  const [managingGroupsFor, setManagingGroupsFor] = useState<string[] | null>(null);

  // Tryb wyboru grup (jak „Wybierz" u uczniów): jedna zaznaczona grupa,
  // pasek z Zmień nazwę / Nowy wpis / Usuń. Okno nowego wpisu dla grupy.
  const [isGroupSelecting, setIsGroupSelecting] = useState(false);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  // Rozwinięte stare wpisy pod polem nowego wpisu (zwinięte = 30 znaków).
  const exitGroupSelecting = () => { setIsGroupSelecting(false); setSelectedGroupId(null); };

  const [editingGroup, setEditingGroup] = useState<{ id: string; name: string } | null>(null);
  const [editGroupName, setEditGroupName] = useState('');
  const [editGroupIcon, setEditGroupIcon] = useState(DEFAULT_GROUP_ICON);
  const [confirmDeleteGroup, setConfirmDeleteGroup] = useState<string | null>(null);

  // Ostatni wpis CoachLog per uczeń
  const [lastLogEntries, setLastLogEntries] = useState<Record<string, { text: string; type: string } | null>>({});
  // Fokus każdego ucznia na liście (user 2026-09-18: bez wchodzenia w profil).
  const [studentFocus, setStudentFocus] = useState<Record<string, FocusState>>({});
  // [PAUZA] Z nasłuchu na dokument trenera — zmiana w karcie od razu widać.
  const [pausedStudents, setPausedStudents] = useState<Record<string, StudentPause>>({});
  // [KARTA UCZNIA] Tapnięcie ucznia otwiera kartę; pełny profil z jej przycisku.
  const [sheetStudentId, setSheetStudentId] = useState<string | null>(null);

  // Wiadomości per uczeń
  const [unreadStudentIds, setUnreadStudentIds] = useState<Set<string>>(new Set());
  const [openMessageStudentId, setOpenMessageStudentId] = useState<string | null>(null);

  // [C27] Trzy najbliższe własne terminy trenerskie (bez kopii od innego
  // trenera — `isMirrored`). null = jeszcze się wczytują.
  const [upcomingCoachEvents, setUpcomingCoachEvents] = useState<any[] | null>(null);
  const [studentTournaments, setStudentTournaments] = useState<StudentTournament[]>([]);
  const [studentMilestones, setStudentMilestones] = useState<StudentMilestone[]>([]);
  const [isMilestonesOpen, setIsMilestonesOpen] = useState(false);
  // Przeczytane kamienie milowe (`studentId_noteId`) — w dokumencie trenera,
  // jak coachSeenStudents: odhaczenie na telefonie gaśnie też na laptopie.
  const [seenMilestones, setSeenMilestones] = useState<string[]>([]);
  // Lista uczniów zawężona do tych bez treningu od INACTIVE_DAYS (pasek u góry).
  const [inactiveOnly, setInactiveOnly] = useState(false);
  // Heute: dzień ostatniego minionego treningu (YYYY-MM-DD); null = brak,
  // undefined = jeszcze się ładuje. Od niego liczy się „seit dem letzten Training”.
  const [lastTrainingDate, setLastTrainingDate] = useState<string | null | undefined>(undefined);
  const [isRosterOpen, setIsRosterOpen] = useState(false);
  // Odliczanie „in 1:30 h” na karcie dzisiejszego treningu.
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [isNewTrainingsOpen, setIsNewTrainingsOpen] = useState(false);
  const [formCompare, setFormCompare] = useState<Record<string, FormCompare>>({});

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    loadUpcomingEvents(userId)
      .then(all => {
        if (cancelled) return;
        setUpcomingCoachEvents(all.filter((e: any) => e.category === 'Trener' && !e.isMirrored).slice(0, 3));
      })
      .catch(err => {
        console.error('Błąd pobierania terminów trenera:', err);
        if (!cancelled) setUpcomingCoachEvents([]);
      });
    return () => { cancelled = true; };
  }, [userId]);

  // Ostatni miniony termin trenera — raz dziennie (pamięć do północy), bo
  // zmienia się tylko po kolejnym treningu. Bez indeksu złożonego: kategorię
  // filtrujemy u siebie z kilkunastu ostatnich terminów.
  useEffect(() => {
    if (!userId) return;
    const today = dayKeyOf(Date.now());
    const key = `grotX_lastCoachTraining_${userId}`;
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const c = JSON.parse(raw);
        if (c?.day === today) { setLastTrainingDate(c.date ?? null); return; }
      }
    } catch { /* uszkodzony wpis — czytamy z bazy */ }
    let cancelled = false;
    getDocs(query(
      collection(db, `users/${userId}/tournaments`),
      where('date', '<', today),
      orderBy('date', 'desc'),
      limit(15),
    ))
      .then(snap => {
        const ev = snap.docs.map(d => d.data()).find(e => e.category === 'Trener' && !e.isMirrored);
        const date = (ev?.date as string) || null;
        try { localStorage.setItem(key, JSON.stringify({ day: today, date })); } catch { /* ignore */ }
        if (!cancelled) setLastTrainingDate(date);
      })
      .catch(err => {
        console.error('Ostatni trening trenera:', err);
        if (!cancelled) setLastTrainingDate(null);
      });
    return () => { cancelled = true; };
  }, [userId]);

  useEffect(() => {
    if (section !== 'TODAY') return;
    const id = setInterval(() => setNowTick(Date.now()), 60000);
    return () => clearInterval(id);
  }, [section]);

  // [C34] Esc zamyka skaner — i, co ważniejsze, gasi kamerę. Bez tego
  // zamknięcie klawiaturą zostawiłoby diodę zapaloną.
  useEffect(() => {
    if (!isScanning) return;
    const onKey = async (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      await stopScanner();
      setIsScanning(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isScanning]);

  useEffect(() => {
    if (!pendingOpenStudentId || students.length === 0) return;
    if (students.some(s => s.id === pendingOpenStudentId)) {
      setOpenMessageStudentId(pendingOpenStudentId);
      onClearPending?.();
    }
  }, [pendingOpenStudentId, students]);

  // Z kalendarza (termin tematu treningu): Grupy + ta grupa rozwinięta, przewinięta do widoku.
  useEffect(() => {
    if (!pendingOpenGroupId || coachGroups.length === 0) return;
    if (coachGroups.some(g => g.id === pendingOpenGroupId)) {
      setActiveGroup(pendingOpenGroupId);
      setIsGroupListOpen(false);
      const id = pendingOpenGroupId;
      setTimeout(() => document.getElementById(`coach-group-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150);
    }
    onClearPendingGroup?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingOpenGroupId, coachGroups]);

  // [C37] Lista uczniów na ekranie = nowi zobaczeni; kropka gaśnie na
  // wszystkich urządzeniach trenera, bo lista idzie do jego dokumentu.
  useEffect(() => {
    if (section !== 'ATHLETES' || viewMode !== 'students' || newStudentIds.length === 0) return;
    setHighlightStudentIds(newStudentIds);
    setNewStudentIds([]);
    void saveSeenStudents(userId, students.map(s => s.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section, viewMode, newStudentIds]);

  // Filtr „nieaktywni” dotyczy tylko zakładki Schüler; zaznaczanie gaśnie przy każdej zmianie zakładki.
  useEffect(() => {
    if (section !== 'ATHLETES') setInactiveOnly(false);
    setIsSelecting(false); setSelectedStudents([]);
    setIsGroupSelecting(false); setSelectedGroupId(null);
  }, [section]);

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
        setCoachLimit(effectiveCoachLimit(data));
        setStudentLastChecked(data.studentLastChecked || {});
        
        setCoachGroups(data.coachGroups || []);
        setSeenMilestones(Array.isArray(data.coachSeenMilestones) ? data.coachSeenMilestones : []);
        setStudentGroupMap(data.studentGroupMap || {});
        setGroupNotes(data.groupNotes || {});
        // [TEMAT TRENINGU] tematy grup po dniach; coachGroupTopic = pierwsza wersja (jeden temat na grupę, 2026-10-15)
        const byGroup: Record<string, GroupTopicsByDay> = { ...(data.coachGroupTopics || {}) };
        Object.entries((data.coachGroupTopic || {}) as Record<string, GroupTopic>).forEach(([gid, gt]) => {
          if (gt?.day && !byGroup[gid]?.[gt.day]) byGroup[gid] = { ...(byGroup[gid] || {}), [gt.day]: gt };
        });
        setCoachGroupTopics(byGroup);
        
        const studentIds = data.students || [];
        
        if (studentIds.length > 0) {
          // [RODO C6] Pojedyncze getDoc zamiast zapytań `in` po users:
          // reguła relacyjna (trener w coaches[] ucznia) działa per-dokument,
          // a zapytania listowe po users odrzucane są w całości.
          const studentDocs = await Promise.all(
            (studentIds as string[]).map(sid => getDoc(doc(db, 'users', sid)).catch(() => null))
          );
          const studentsData = [];
          for (const d of studentDocs) {
            if (!d || !d.exists()) continue;
            const studentData = { id: d.id, ...d.data() } as any;

            // Dane denormalizowane — zapisywane przez ScoringView przy każdym zapisie sesji
            const ts = studentData.lastSessionTimestamp;
            studentData.exactLastActivity = ts?.toMillis
              ? ts.toMillis()
              : (ts?.seconds ? ts.seconds * 1000 : (ts || 0));

            studentsData.push(studentData);
          }
          
          studentsData.sort((a, b) => {
            const timeA = a.exactLastActivity || 0;
            const timeB = b.exactLastActivity || 0;
            return timeB - timeA;
          });

          setStudents(studentsData as any);

          // [C37] Kto doszedł od ostatniego zajrzenia w „Uczniowie".
          const currentIds = studentsData.map((s: any) => s.id);
          const seen: string[] | null = Array.isArray(data.coachSeenStudents)
            ? data.coachSeenStudents
            : null;
          if (seen === null) {
            // Pierwsze wejście od czasu tej funkcji — zasiewamy bez kropki.
            setNewStudentIds([]);
            void saveSeenStudents(userId, currentIds);
          } else {
            setNewStudentIds(currentIds.filter((id: string) => !seen.includes(id)));
            // Sprzątanie po rozłączonych uczniach: gdyby ktoś wrócił, ma się
            // znowu policzyć jako nowy. Zapis tylko wtedy, gdy faktycznie ubyło.
            const stillLinked = seen.filter((id: string) => currentIds.includes(id));
            if (stillLinked.length !== seen.length) void saveSeenStudents(userId, stillLinked);
          }

          // Bez await — turniej podopiecznych nie blokuje listy uczniów.
          loadStudentTournaments(userId, studentsData)
            .then(setStudentTournaments)
            .catch(() => setStudentTournaments([]));
          loadStudentMilestones(userId, studentsData)
            .then(setStudentMilestones)
            .catch(() => setStudentMilestones([]));
          loadFormCompare(userId, studentsData)
            .then(setFormCompare)
            .catch(() => setFormCompare({}));
          // Fokus — profil ucznia już mamy, dochodzi cel trenera i (przy
          // kropkach) treningi od startu fokusu. Bez await, jak wyżej.
          Promise.all((studentsData as any[]).map(async (s: any) => {
            try { return [s.id, await loadFocusState(s.id, true, s)] as const; } catch { return null; }
          })).then(list => setStudentFocus(Object.fromEntries(list.filter(Boolean) as [string, FocusState][])));

          // Fetch ostatniego wpisu CoachLog dla każdego ucznia
          const entries: Record<string, { text: string; type: string } | null> = {};
          await Promise.all((studentsData as any[]).map(async (s: any) => {
            try {
              const snap = await getDocs(query(
                collection(db, `users/${s.id}/coachLog`),
                orderBy('createdAt', 'desc'),
                limit(5)
              ));
              // Temat zaplanowany na przyszły dzień uczeń jeszcze nie widzi —
              // w wierszu tylko dzisiejszy lub ostatni wpis (user 2026-10-22).
              const todayKey = dayKeyOf(Date.now());
              const d = snap.docs.map(x => x.data()).find(x => !(x.type === 'topic' && x.day && x.day > todayKey));
              entries[s.id] = d ? { text: d.text || '', type: d.type || 'observation' } : null;
            } catch { entries[s.id] = null; }
          }));
          setLastLogEntries(entries);

          // Nieprzeczytane wiadomości per uczeń (czerwona kropka na dymku).
          // Podgląd treści w wierszu usunięty 2026-09-10 — ucinał wiersz.
          const unread = new Set<string>();
          await Promise.all((studentsData as any[]).map(async (s: any) => {
            try {
              const snap = await getDoc(doc(db, `users/${userId}/studentMessages/${s.id}`));
              if (snap.exists()) {
                const d = snap.data();
                if ((d.lastStudentAt || 0) > (d.lastCoachReadAt || 0)) unread.add(s.id);
              }
            } catch { /* ignore */ }
          }));
          setUnreadStudentIds(unread);

        } else {
          setStudents([]);
          setStudentTournaments([]);
          setStudentMilestones([]);
          setFormCompare({});
          setNewStudentIds([]);
          // [C37] Nie ma uczniów — czyścimy pamięć tylko, gdy coś w niej było.
          if (Array.isArray(data.coachSeenStudents) && data.coachSeenStudents.length > 0) {
            void saveSeenStudents(userId, []);
          }
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
    let prevStudentsKey: string | null = null;
    const unsub = onSnapshot(doc(db, 'users', userId), (snap) => {
      if (!snap.exists()) return;
      const data = snap.data();
      // Świeży coachLimit z każdego snapshota — admin może go zmienić w locie.
      setCoachLimit(effectiveCoachLimit(data));
      setPausedStudents(data.coachPausedStudents && typeof data.coachPausedStudents === 'object' ? data.coachPausedStudents : {});
      const ids = (data.students || []) as string[];
      const key = [...ids].sort().join(',');
      // Pierwszy snapshot (prevStudentsKey === null) albo zmiana listy studentów → pełny refetch
      if (key !== prevStudentsKey) {
        prevStudentsKey = key;
        fetchCoachData();
      }
    }, (err) => {
      console.error('Coach doc listener error:', err);
    });
    return () => unsub();
  }, [userId]);

  const stopScanner = async () => {
    const instance = html5QrCodeRef.current;
    if (!instance) return;
    try {
      if (instance.isScanning) await instance.stop();
      instance.clear();
    } catch (e) {
      console.error('Scanner stop error:', e);
    } finally {
      html5QrCodeRef.current = null;
    }
  };

  const startScanner = async () => {
    setCameraError(false);
    setIsScanning(true);

    // Poczekaj na render <div id="reader"> w DOM (mikrotask, zachowuje user-gesture context na iOS).
    await Promise.resolve();
    const readerEl = document.getElementById('reader');
    if (!readerEl) {
      setCameraError('NoReaderEl');
      return;
    }

    const instance = new Html5Qrcode('reader');
    html5QrCodeRef.current = instance;

    const onDecoded = async (decodedText: string) => {
      await stopScanner();
      setIsScanning(false);
      await handleAddStudent(decodedText);
    };
    const config = { fps: 10, qrbox: { width: 250, height: 250 } };

    const applyVideoFixes = () => {
      // iOS Safari: bez playsinline+muted wideo nie wystartuje inline.
      const video = readerEl.querySelector('video');
      if (video) {
        video.setAttribute('playsinline', 'true');
        video.setAttribute('webkit-playsinline', 'true');
        video.muted = true;
        video.play().catch(() => {});
      }
    };

    try {
      // 1. Próba przez konkretny deviceId tylnej kamery (najlepiej działa na iOS).
      let started = false;
      try {
        const cameras = await Html5Qrcode.getCameras();
        if (cameras && cameras.length > 0) {
          const back = cameras.find(c => /back|rear|environment|tył/i.test(c.label)) || cameras[cameras.length - 1];
          await instance.start(back.id, config, onDecoded, undefined);
          started = true;
        }
      } catch (e) {
        console.warn('getCameras path failed, falling back to facingMode:', e);
      }

      // 2. Fallback: facingMode environment.
      if (!started) {
        try {
          await instance.start({ facingMode: 'environment' }, config, onDecoded, undefined);
          started = true;
        } catch (e) {
          console.warn('environment camera failed, trying any camera:', e);
        }
      }

      // 3. Ostatnia deska ratunku: jakakolwiek kamera (np. urządzenia z samym frontem).
      if (!started) {
        await instance.start({ facingMode: 'user' }, config, onDecoded, undefined);
      }

      applyVideoFixes();
      // Drugi przejazd po krótkim opóźnieniu — video element bywa wstrzykiwany po start().
      setTimeout(applyVideoFixes, 200);
    } catch (err: any) {
      console.error('Camera access error:', err);
      const name = err?.name || err?.message || 'Unknown';
      setCameraError(String(name));
      html5QrCodeRef.current = null;
    }
  };

  useEffect(() => {
    return () => { stopScanner(); };
  }, []);

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
      // [RODO C6] Przed zaproszeniem nie ma relacji, więc users/{studentId}
      // jest niedostępny — istnienie konta weryfikujemy po publicznym lustrze.
      const studentPub = await getPublicProfile(studentId);
      if (!studentPub) {
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
      setInviteSentTo(studentPub.displayName || '');
    } catch (error) {
      console.error("Błąd wysyłania zaproszenia:", error);
      showToast(t('coachDashboard.toastError'));
    }
  };

  // Usuwa zaznaczonych uczniów (tryb wyboru, 2026-09-10 — wcześniej jeden
  // z menu „⋮"). PO JEDNYM: reguła Path G pozwala trenerowi skrócić własne
  // `students` dokładnie o 1 na zapis, więc arrayRemove wielu naraz padnie.
  const confirmRemoveStudents = async (ids: string[] | null) => {
    if (!ids || ids.length === 0) return;
    const removed: string[] = [];

    try {
      for (const studentId of ids) {
        // 1. Kasowanie ze składu głównego, potem siebie z `coaches` ucznia (Path H)
        await updateDoc(doc(db, 'users', userId), { students: arrayRemove(studentId) });
        await updateDoc(doc(db, 'users', studentId), { coaches: arrayRemove(userId) });
        removed.push(studentId);
      }
    } catch (error) {
      console.error("Błąd usuwania ucznia:", error);
    }

    if (removed.length > 0) {
      // 2. Sprzątanie z grup. Mapa jest uczeń → grupy, więc wystarczy zdjąć
      // klucz ucznia (stary kod szukał ucznia w listach grup i nic nie zdejmował).
      const newMap = { ...studentGroupMap };
      let mapChanged = false;
      for (const id of removed) {
        if (newMap[id]) { delete newMap[id]; mapChanged = true; }
      }
      if (mapChanged) {
        try {
          await updateDoc(doc(db, 'users', userId), { studentGroupMap: newMap });
          setStudentGroupMap(newMap);
        } catch (error) {
          console.error("Błąd sprzątania grup:", error);
        }
      }

      setStudents(prev => prev.filter(s => !removed.includes(s.id)));
      setSelectedStudents(prev => prev.filter(id => !removed.includes(id)));
      showToast(t('coachDashboard.toastRemoved'));
    }
    if (removed.length === ids.length) setIsSelecting(false);
    setStudentsToDelete(null);
  };

  // Uczeń obejrzany (karta albo profil) — schodzi z „Nowe treningi” i „Forma”.
  const markStudentChecked = async (studentId: string) => {
    const now = Date.now();
    setStudentLastChecked(prev => ({ ...prev, [studentId]: now }));
    try {
      await updateDoc(doc(db, 'users', userId), {
        [`studentLastChecked.${studentId}`]: now
      });
    } catch (e) {
      console.error('Zapis obejrzenia ucznia nie powiódł się:', e);
    }
  };

  // Od 2026-09-18 tapnięcie otwiera kartę ucznia, nie profil — samo otwarcie
  // karty też liczy się jako obejrzenie (user: sekcje nie chciały zniknąć).
  useEffect(() => {
    if (sheetStudentId) void markStudentChecked(sheetStudentId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheetStudentId]);

  const handleCheckStudent = async (studentId: string) => {
    await markStudentChecked(studentId);
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

  // [PAUZA] Aktywna, dopóki uczeń nie zapisał treningu po jej ustawieniu.
  const pauseOf = (s: any): StudentPause | null => {
    const p = pausedStudents[s.id];
    return p && typeof p.at === 'number' && (s.exactLastActivity || 0) <= p.at ? p : null;
  };
  // Przypomnienie: miesiąc pauzy minął i trener jeszcze go nie odhaczył.
  const pauseReminderDue = (s: any) => {
    const p = pauseOf(s);
    return !!p && !p.reminded && Date.now() - p.at >= PAUSE_REMIND_DAYS * 24 * 60 * 60 * 1000;
  };

  const setPause = async (studentId: string, value: StudentPause | null) => {
    setPausedStudents(prev => {
      const next = { ...prev };
      if (value) next[studentId] = value; else delete next[studentId];
      return next;
    });
    try {
      await updateDoc(doc(db, 'users', userId), { [`coachPausedStudents.${studentId}`]: value ?? deleteField() });
    } catch (e) { console.error('Pauza: błąd zapisu', e); }
  };

  // Uczeń, który nigdy nie trenował (0), też „wypada z rytmu". Wstrzymani
  // (pauza) nie — chyba że właśnie minął miesiąc i jest jedno przypomnienie.
  const inactiveCutoff = Date.now() - INACTIVE_DAYS * 24 * 60 * 60 * 1000;
  const isInactive = (s: any) => (s.exactLastActivity || 0) < inactiveCutoff
    && (!pauseOf(s) || pauseReminderDue(s));
  // Najdłużej bez treningu na górze (nigdy nie trenował = 0, więc pierwszy).
  const inactiveStudents = students
    .filter(isInactive)
    .sort((a, b) => (a.exactLastActivity || 0) - (b.exactLastActivity || 0));
  const inactiveCount = inactiveStudents.length;

  // Trenowali, odkąd trener ostatnio otworzył ich profil (ta sama reguła, co
  // zielona kropka w wierszu) — najświeżsi na górze.
  const newTrainingStudents = students
    .filter(s => (s.exactLastActivity || 0) > (studentLastChecked[s.id] || 0))
    .sort((a, b) => (b.exactLastActivity || 0) - (a.exactLastActivity || 0));

  // Zmiana formy (loadFormCompare) przy uczniach z nowym treningiem — liczona
  // dla treningu, którego trener jeszcze nie widział.
  const newTrend = (s: any): FormCompare | null => {
    const c = formCompare[s.id];
    return c && (c.at || 0) > (studentLastChecked[s.id] || 0) ? c : null;
  };
  const newTrends = newTrainingStudents.map(newTrend).filter((c): c is FormCompare => !!c);
  const formUpCount = newTrends.filter(c => c.dir === 'up').length;
  const formDownCount = newTrends.length - formUpCount;
  // „poprzednio 298” — wynik poprzedniego treningu na tym samym dystansie;
  // przy innej liczbie strzał z liczbą strzał (598/72), żeby było z czym porównać.
  const formPrev = (c: FormCompare) => t('coachDashboard.formPrev', { prev: c.nowArrows === c.prevArrows ? c.prev : `${c.prev}/${c.prevArrows}` });

  // Zakładka UCZNIOWIE: zawsze wszyscy (grupy żyją w zakładce GRUPY),
  // ewentualnie zawężeni do nieaktywnych z sekcji u góry.
  const visibleStudents = inactiveOnly ? students.filter(isInactive) : students;
  const studentsOfGroup = (groupId: string) =>
    students.filter(s => (studentGroupMap[s.id] || []).includes(groupId));

  // Puls grupy na zwiniętej karcie: kto trenował w 7 dni, zmiana formy
  // (ostatni trening vs poprzedni na tym samym dystansie), nieaktywni.
  // Uczeń na pauzie nie wlicza się do „x/y trenowało” — chory nie zaniża grupy.
  const groupPulse = (members: any[]) => {
    const weekCutoff = Date.now() - 7 * DAY_MS;
    const counted = members.filter(s => !pauseOf(s));
    return {
      total: counted.length,
      active: counted.filter(s => (s.exactLastActivity || 0) >= weekCutoff).length,
      up: members.filter(s => formCompare[s.id]?.dir === 'up').length,
      down: members.filter(s => formCompare[s.id]?.dir === 'down').length,
      inactive: members.filter(isInactive).length,
    };
  };

  const openGroupMessage = (group: { name: string }, members: any[]) => {
    exitSelecting();
    setSelectedStudents(members.map(s => s.id));
    setMessageGroupName(group.name);
    setIsMessageModalOpen(true);
  };

  const handleGroupTopicChanged = (groupId: string, next: GroupTopicsByDay) => {
    setCoachGroupTopics(prev => ({ ...prev, [groupId]: next }));
  };

  const closeMessageModal = () => {
    setIsMessageModalOpen(false);
    if (messageGroupName !== null) {
      setSelectedStudents([]);
      setMessageGroupName(null);
    }
  };

  // „Anna Kowalska, Jan Nowak +2" — kogo dotyczy akcja na zaznaczonych.
  const namesOf = (ids: string[]) => {
    const names = ids
      .map(id => students.find(s => s.id === id))
      .filter(Boolean)
      .map(s => `${s.firstName || ''} ${s.lastName || ''}`.trim() || t('coachDashboard.defaultStudentName'));
    return names.length > 3 ? `${names.slice(0, 3).join(', ')} +${names.length - 3}` : names.join(', ');
  };

  // „70m · 312 pkt / 36 strz." — z pól, które zapis sesji zostawia na
  // dokumencie ucznia (ScoringView), więc bez dodatkowego odczytu.
  const lastSessionDetails = (s: any) => {
    const parts: string[] = [];
    if (s.lastSessionType === 'TECHNICAL') parts.push(t('coachDashboard.lastSessionTech'));
    else if (s.lastSessionDistance) parts.push(String(s.lastSessionDistance));
    if (s.lastSessionArrows > 0) {
      parts.push(s.lastSessionScore > 0
        ? t('coachDashboard.lastSessionScore', { score: s.lastSessionScore, arrows: s.lastSessionArrows })
        : t('coachDashboard.lastSessionArrows', { count: s.lastSessionArrows }));
    }
    return parts.join(' · ');
  };

  // „Zaznacz widocznych" działa na liście, pod którą stoi — wszyscy uczniowie
  // albo członkowie rozwiniętej grupy (wiadomość do całej grupy).
  const allSelected = (list: any[]) => list.length > 0 && list.every(s => selectedStudents.includes(s.id));

  const toggleSelectAll = (list: any[]) => {
    const ids = list.map(s => s.id);
    if (allSelected(list)) {
      setSelectedStudents(prev => prev.filter(id => !ids.includes(id)));
    } else {
      setSelectedStudents(prev => Array.from(new Set([...prev, ...ids])));
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
      setMessageGroupName(null);
      setSelectedStudents([]);
      setIsSelecting(false);
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
    const newGroup = { id: 'group_' + Date.now(), name: newGroupName.trim(), icon: newGroupIcon };
    const updatedGroups = [...coachGroups, newGroup];
    
    try {
      await updateDoc(doc(db, 'users', userId), { coachGroups: updatedGroups });
      setCoachGroups(updatedGroups);
      setIsCreatingGroup(false);
      setNewGroupName('');
      setNewGroupIcon(DEFAULT_GROUP_ICON);
      // Nowa grupa od razu rozwinięta — trener zwykle chce dopisać uczniów.
      setActiveGroup(newGroup.id);
     
      showToast(t('coachDashboard.toastGroupCreated'));
    } catch (error) {
      showToast(t('coachDashboard.toastGroupError'));
    }
  };

  const openScheduleEditor = (group: { id: string; schedule?: GroupSchedule }) => {
    const sc = normalizeSchedule(group.schedule);
    setSchedSlots(sc?.slots || [{ day: new Date().getDay(), time: '18:00' }]);
    setSchedEvery(sc?.every || 1);
    setScheduleGroupId(group.id);
  };

  // null = usunięcie stałego treningu. Kotwica „co drugi tydzień” = najbliższy
  // termin od dziś, czyli „zaczynamy w tym/następnym tygodniu”.
  const saveSchedule = async (remove = false) => {
    if (!scheduleGroupId) return;
    let schedule: GroupSchedule | null = null;
    if (!remove) {
      const slots = schedSlots.map(x => ({ ...x, place: (x.place || '').trim().slice(0, 40) || undefined }));
      const draft: GroupSchedule = { slots: sortSlots(slots), every: schedEvery, anchor: dayKeyOf(Date.now()) };
      draft.anchor = upcomingOccurrences({ ...draft, every: 1 }, draft.anchor, 1, 7)[0]?.date || draft.anchor;
      schedule = normalizeSchedule(draft);
      if (!schedule) return;
      schedule = { ...schedule, slots: schedule.slots.map(x => (x.place ? x : { day: x.day, time: x.time })) };
    }
    const updatedGroups = coachGroups.map(g => {
      if (g.id !== scheduleGroupId) return g;
      const { schedule: _old, ...rest } = g;
      return schedule ? { ...rest, schedule } : rest;
    });
    try {
      await updateDoc(doc(db, 'users', userId), { coachGroups: updatedGroups });
      setCoachGroups(updatedGroups);
      setScheduleGroupId(null);
      showToast(t(remove ? 'coachSchedule.toastRemoved' : 'coachSchedule.toastSaved'));
    } catch {
      showToast(t('coachDashboard.toastGroupError'));
    }
  };

  // 1.11.2026 to niedziela, więc 1 + getDay() daje właściwy dzień tygodnia.
  const weekdayShort = (day: number) => new Date(2026, 10, 1 + day).toLocaleDateString(i18n.language, { weekday: 'short' }).replace('.', '');
  // „Mi 18:00, Sa 12:00 · jede Woche · Halle” — na karcie grupy. Gdy miejsca
  // się różnią, każde stoi przy swoim terminie: „Mi 18:00 Halle, Sa 12:00 Platz”.
  const scheduleSummary = (raw: unknown) => {
    const sc = normalizeSchedule(raw);
    if (!sc) return '';
    const places = [...new Set(sc.slots.map(x => x.place || ''))];
    const shared = places.length === 1 ? places[0] : '';
    const slots = sc.slots.map(x => [weekdayShort(x.day), x.time, shared ? '' : x.place].filter(Boolean).join(' ')).join(', ');
    return [slots, t(sc.every === 2 ? 'coachSchedule.every2' : 'coachSchedule.every1'), shared].filter(Boolean).join(' · ');
  };

  const handleEditGroup = async () => {
    if (!editingGroup || !editGroupName.trim()) return;
    const updatedGroups = coachGroups.map(g =>
      g.id === editingGroup.id ? { ...g, name: editGroupName.trim(), icon: editGroupIcon } : g
    );
    try {
      await updateDoc(doc(db, 'users', userId), { coachGroups: updatedGroups });
      setCoachGroups(updatedGroups);
      setEditingGroup(null);
      setEditGroupName('');
      showToast(t('coachDashboard.toastGroupRenamed'));
    } catch (e) {
      showToast(t('coachDashboard.toastGroupError'));
    }
  };

  const addPickedToGroup = async () => {
    if (!addToGroupId || addPicked.length === 0) return;
    const newMap = { ...studentGroupMap };
    for (const id of addPicked) {
      newMap[id] = Array.from(new Set([...(newMap[id] || []), addToGroupId]));
    }
    try {
      await updateDoc(doc(db, 'users', userId), { studentGroupMap: newMap });
      setStudentGroupMap(newMap);
      setAddToGroupId(null);
      setAddPicked([]);
    } catch (e) {
      console.error(e);
      showToast(t('coachDashboard.toastGroupError'));
    }
  };

  const handleDeleteGroup = async (groupId: string) => {
    const updatedGroups = coachGroups.filter(g => g.id !== groupId);
    const newMap = { ...studentGroupMap };
    Object.keys(newMap).forEach(sid => {
      if (newMap[sid]) newMap[sid] = newMap[sid].filter(id => id !== groupId);
    });
    const newNotes = { ...groupNotes };
    delete newNotes[groupId];
    try {
      await updateDoc(doc(db, 'users', userId), {
        coachGroups: updatedGroups,
        studentGroupMap: newMap,
        groupNotes: newNotes,
        [`coachGroupFocus.${groupId}`]: deleteField(),
        [`coachGroupTopic.${groupId}`]: deleteField(),
        [`coachGroupTopics.${groupId}`]: deleteField(),
      });
      setCoachGroups(updatedGroups);
      setStudentGroupMap(newMap);
      setGroupNotes(newNotes);
      setCoachGroupTopics(prev => { const next = { ...prev }; delete next[groupId]; return next; });
      setActiveGroup('ALL');
      setSelectedGroupId(null);
      setConfirmDeleteGroup(null);
      showToast(t('coachDashboard.toastGroupDeleted'));
    } catch (e) {
      showToast(t('coachDashboard.toastGroupError'));
    }
  };

  // Przypisanie grupy wszystkim zaznaczonym naraz: jeśli wszyscy już w niej
  // są — zdejmuje ich, w przeciwnym razie dopisuje brakujących.
  const toggleGroupForSelected = async (groupId: string) => {
    if (!managingGroupsFor || managingGroupsFor.length === 0) return;
    const allIn = managingGroupsFor.every(id => (studentGroupMap[id] || []).includes(groupId));
    const newMap = { ...studentGroupMap };
    for (const id of managingGroupsFor) {
      const current = newMap[id] || [];
      newMap[id] = allIn
        ? current.filter(g => g !== groupId)
        : Array.from(new Set([...current, groupId]));
    }
    setStudentGroupMap(newMap);

    try {
      await updateDoc(doc(db, 'users', userId), { studentGroupMap: newMap });
    } catch(e) { showToast(t('coachDashboard.toastSaveError')); }
  };

  // [HISTORIA TRENINGÓW] Stary dziennik grupy przeniesiony do prywatnego
  // dokumentu trenera — z profilu (czytanego też przez uczniów) znika.
  const handleLegacyNotesMigrated = async (groupId: string) => {
    try {
      await updateDoc(doc(db, 'users', userId), { [`groupNotes.${groupId}`]: deleteField() });
      setGroupNotes(prev => { const next = { ...prev }; delete next[groupId]; return next; });
    } catch (e) { console.error('Dziennik grupy: błąd sprzątania', e); }
  };

  const isLimitReached = coachLimit > 0 && students.length >= coachLimit;

  // `date` to „RRRR-MM-DD" bez strefy — parsowane lokalnie, żeby na zachód
  // od Greenwich termin nie cofał się o dzień.
  const eventDate = (ev: any) => new Date(`${ev.date}T00:00:00`);
  const eventRecipients = (ev: any) =>
    ev.coachStudents === 'all'
      ? t('coachDashboard.allStudentsCard')
      : Array.isArray(ev.coachStudents) && ev.coachStudents.length > 0
        ? t('coachDashboard.studentsCount', { count: ev.coachStudents.length })
        : null;

  // Wiersz ucznia — ten sam w zakładce UCZNIOWIE i w rozwiniętej grupie.
  const renderStudentRow = (student: any, index = 0) => {
    const lastActivity = student.exactLastActivity || 0;
    const lastChecked = studentLastChecked[student.id] || 0;
    const hasNewActivity = lastActivity > lastChecked;
    const initials = `${student.firstName?.[0] || ''}${student.lastName?.[0] || ''}`.toUpperCase();
    // [RANGA] Mała odznaka rangi z handicapu przy inicjałach (user 2026-10-22).
    const studentRank = rankFromStored(student);
    const isSelected = selectedStudents.includes(student.id);
    const trend = formCompare[student.id]?.dir;
    const isNewStudent = highlightStudentIds.includes(student.id);
    const fc = studentFocus[student.id];

    return (
      <div key={student.id} className="relative animate-fade-in">
        {/* W trybie wyboru klik zaznacza zamiast otwierać statystyki */}
        <div
          onClick={(e) => isSelecting ? toggleStudentSelection(e, student.id) : setSheetStudentId(student.id)}
          // Co drugi wiersz minimalnie szary — długa lista się nie zlewa (user 2026-10-22).
          className={`${index % 2 ? 'bg-gray-50' : 'bg-white'} rounded-2xl p-2.5 pr-1 shadow-sm border active:scale-[0.98] transition-all relative overflow-hidden flex items-center justify-between cursor-pointer ${
            isSelected ? 'border-[#0a3a2a] ring-1 ring-[#0a3a2a]' : 'border-gray-100'
          }`}
        >

          {hasNewActivity && !isSelected && (
            <div className="absolute left-0 top-0 bottom-0 w-1 bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></div>
          )}

          <div className="flex items-center gap-3 pl-1.5 flex-1 overflow-hidden">
            {isSelecting ? (
              // Pole zaznaczenia w miejscu inicjałów — wiersz nie traci szerokości.
              <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-all ${
                isSelected ? 'bg-[#0a3a2a] text-[#fed33e] border border-[#0a3a2a]' : 'bg-white text-transparent border-2 border-gray-200'
              }`}>
                <span className="material-symbols-outlined text-[20px] font-black">check</span>
              </div>
            ) : (
            <div className="w-10 h-10 bg-[#fed33e]/20 text-[#8B6508] border border-[#fed33e]/50 rounded-full flex items-center justify-center shrink-0 relative">
              {initials ? (
                <span className="font-black text-[13px]">{initials}</span>
              ) : (
                <span className="material-symbols-outlined text-[20px]">person</span>
              )}

              {hasNewActivity && (
                 <div className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-emerald-500 border-2 border-white rounded-full animate-pulse shadow-sm"></div>
              )}
              {studentRank.handicap !== null && (
                <div
                  className="absolute -bottom-1 -right-1 w-[18px] h-[18px] rounded-full flex items-center justify-center shadow-sm"
                  style={{ background: studentRank.color, border: `1.5px solid ${studentRank.border}`, boxShadow: '0 0 0 1.5px #fff' }}
                  title={studentRank.rankName}
                >
                  <span className="text-[9px] font-black leading-none" style={{ color: studentRank.textColor }}>{studentRank.level}</span>
                </div>
              )}
            </div>
            )}

            <div className="flex flex-col justify-center truncate pr-2">
              <h3 className="font-black text-[#0a3a2a] text-[13px] leading-tight flex items-center gap-1.5 min-w-0">
                <span className="truncate">
                  {student.firstName || t('coachDashboard.defaultStudentName')} {student.lastName || ''}
                </span>
                {/* [C37] Nowy uczeń — napis obok kropki, bo sama zielona kropka
                    na inicjałach znaczy już „nowy trening". */}
                {pauseOf(student) && (
                  <span className="shrink-0 inline-flex items-center gap-0.5 bg-gray-100 border border-gray-200 text-gray-500 rounded-full px-1.5 py-0.5 text-[8px] font-black uppercase tracking-widest">
                    <span className="material-symbols-outlined text-[10px]">pause</span>
                    {t('coachDashboard.pauseBadge')}
                  </span>
                )}
                {isNewStudent && (
                  <span className="shrink-0 inline-flex items-center gap-1 bg-emerald-50 border border-emerald-100 text-emerald-600 rounded-full pl-1 pr-1.5 py-0.5 text-[8px] font-black uppercase tracking-widest">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    {t('coachDashboard.newStudentBadge')}
                  </span>
                )}
              </h3>
              {/* tracking-wide, nie -widest: ta linia niesie dystans i wynik
                  i przy szerokim rozstrzeleniu ucinała się w połowie */}
              <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wide mt-0.5 flex items-center gap-1 min-w-0">
                {/* Każda linia zaczyna się od ikony (user 2026-10-22): trend formy albo zegar. */}
                <span
                  className={`material-symbols-outlined text-[12px] shrink-0 ${trend === 'up' ? 'text-emerald-500' : trend === 'down' ? 'text-orange-500' : 'text-gray-400'}`}
                  title={trend ? t(trend === 'up' ? 'coachDashboard.trendUp' : 'coachDashboard.trendDown') : undefined}
                  aria-label={trend ? t(trend === 'up' ? 'coachDashboard.trendUp' : 'coachDashboard.trendDown') : undefined}
                >
                  {trend ? TREND_ICON[trend] : ROW_ICON.lastTraining}
                </span>
                <span className="truncate">
                  {hasNewActivity ? <span className="text-emerald-500">{t('coachDashboard.newTraining')}</span> : getTimeSinceLastActivity(lastActivity)}
                  {lastActivity > 0 && lastSessionDetails(student) && ` · ${lastSessionDetails(student)}`}
                </span>
              </p>
              {renderFocusLine(student.id)}
              {/* Ostatni wpis z dziennika — bez celu, gdy fokus już jest wyżej. */}
              {lastLogEntries[student.id] && !(fc?.focus && lastLogEntries[student.id]!.type === 'goal') && (() => {
                const entry = lastLogEntries[student.id]!;
                const typeColors: Record<string, string> = {
                  observation: '#059669',
                  tip: '#b45309',
                  goal: '#2563eb',
                  flag: '#dc2626',
                  topic: '#e11d48',
                };
                const color = typeColors[entry.type] || '#059669';
                // Opis, co to za linia — sam tekst był dla trenera zagadką (user 2026-10-22).
                const typeLabel: Record<string, string> = {
                  observation: t('coachLog.typeObservation'),
                  tip: t('coachLog.typeTip'),
                  goal: t('coachLog.typeGoal'),
                  flag: t('coachLog.typeFlag'),
                  topic: t('coachDashboard.groupTopicLabel'),
                };
                return (
                  <p className="text-[9px] font-bold mt-0.5 truncate flex items-center gap-1" style={{ color }}>
                    <span className="material-symbols-outlined text-[12px] shrink-0">{LOG_ICON[entry.type] || LOG_ICON.observation}</span>
                    <span className="truncate">{typeLabel[entry.type] && <span className="font-black">{typeLabel[entry.type]}:</span>} {entry.text}</span>
                  </p>
                );
              })()}
            </div>
          </div>

          {/* Z prawej tylko dymek wiadomości. Ikona statystyk (cały wiersz
              prowadzi do statystyk) i menu „⋮" usunięte 2026-09-10 — grupy
              i usuwanie są na pasku trybu wyboru, dla wielu uczniów naraz.
              W trybie wyboru dymek znika — klik ma tylko zaznaczać. */}
          {!isSelecting && (
            <button
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpenMessageStudentId(student.id); }}
              className="relative w-9 h-9 mr-1 shrink-0 rounded-full flex items-center justify-center transition-all bg-gray-50 text-gray-400 hover:bg-gray-100 active:scale-90"
            >
              <span className="material-symbols-outlined text-[18px]">chat</span>
              {unreadStudentIds.has(student.id) && (
                <div className="absolute top-0.5 right-0.5 w-2.5 h-2.5 bg-red-500 border-2 border-white rounded-full" />
              )}
            </button>
          )}
        </div>
      </div>
    );
  };

  const renderStudentList = (list: any[], title: string) => (
    <div>
      <div className="flex items-center justify-between mb-3 ml-2 pr-1">
        {/* Bez tytułu w zwijanej liście grupy — nagłówek sekcji już go ma. */}
        {title ? (
          <h2 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
            {title} ({list.length})
          </h2>
        ) : <span />}
        {list.length > 0 && (isSelecting ? (
          <div className="flex items-center gap-3">
            <button
              onClick={() => toggleSelectAll(list)}
              className={`text-[9px] font-black uppercase active:scale-95 transition-colors ${allSelected(list) ? 'text-red-400' : 'text-[#0a3a2a]'}`}
            >
              {allSelected(list) ? t('coachDashboard.deselectAll') : t('coachDashboard.selectAll')}
            </button>
            <button
              onClick={exitSelecting}
              className="text-[9px] font-black uppercase text-white bg-[#0a3a2a] px-2.5 py-1 rounded-lg active:scale-95 transition-all"
            >
              {t('coachDashboard.done')}
            </button>
          </div>
        ) : (
          <button
            onClick={() => setIsSelecting(true)}
            className="text-[9px] font-black uppercase text-[#0a3a2a] flex items-center gap-1 active:scale-95 transition-all"
          >
            <span className="material-symbols-outlined text-rose-500 text-[14px]">check_circle</span>
            {t('coachDashboard.selectMode')}
          </button>
        ))}
      </div>

      {/* Pasek wysyłki NAD listą (życzenie usera 2026-09-10) — pod długą
          listą trener go nie widział. Widoczny przez cały tryb wyboru,
          przycisk aktywny od pierwszego zaznaczonego. */}
      {isSelecting && list.length > 0 && (
        <div className="mb-2 bg-[#0a3a2a] pl-3 pr-1.5 py-1.5 rounded-xl flex items-center gap-1.5 animate-fade-in">
          {/* Liczba zaznaczonych — ikona zamiast słowa, żeby akcje się zmieściły */}
          <span
            className="flex items-center gap-1 text-[12px] font-black text-white flex-1 min-w-0"
            aria-label={`${t('coachDashboard.selected')}: ${selectedStudents.length}`}
          >
            <span className="material-symbols-outlined text-[16px] text-[#fed33e]">check_circle</span>
            {selectedStudents.length}
          </span>
          <button
            onClick={() => setIsMessageModalOpen(true)}
            disabled={selectedStudents.length === 0}
            className="bg-[#fed33e] text-[#0a3a2a] px-3 py-1.5 rounded-lg font-black text-[10px] uppercase active:scale-95 transition-all shrink-0 disabled:opacity-40"
          >
            {t('coachDashboard.sendMessageBtn')}
          </button>
          {/* Dawne menu „⋮" z wiersza — teraz dla wszystkich zaznaczonych */}
          {coachGroups.length > 0 && (
            <button
              onClick={() => setManagingGroupsFor([...selectedStudents])}
              disabled={selectedStudents.length === 0}
              aria-label={t('coachDashboard.manageGroups')}
              title={t('coachDashboard.manageGroups')}
              className="w-8 h-8 shrink-0 rounded-lg bg-white/10 text-white flex items-center justify-center active:scale-90 transition-all disabled:opacity-40"
            >
              <span className="material-symbols-outlined text-[18px]">folder_shared</span>
            </button>
          )}
          <button
            onClick={() => setStudentsToDelete([...selectedStudents])}
            disabled={selectedStudents.length === 0}
            aria-label={t('coachDashboard.removeStudent')}
            title={t('coachDashboard.removeStudent')}
            className="w-8 h-8 shrink-0 rounded-lg bg-white/10 text-red-300 flex items-center justify-center active:scale-90 transition-all disabled:opacity-40"
          >
            <span className="material-symbols-outlined text-[18px]">person_remove</span>
          </button>
        </div>
      )}

      {isLoading ? (
        <div className="flex flex-col gap-2">
          {[1, 2, 3].map(i => <div key={i} className="h-14 bg-gray-100 rounded-2xl animate-pulse"></div>)}
        </div>
      ) : list.length === 0 ? (
        <div className="text-center py-8 bg-gray-50 rounded-3xl border border-dashed border-gray-200">
          <span className="material-symbols-outlined text-4xl text-gray-300 mb-2">sentiment_dissatisfied</span>
          <p className="text-[11px] font-black text-gray-400 uppercase tracking-widest">{t('coachDashboard.noStudents')}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {list.map(renderStudentRow)}
        </div>
      )}
    </div>
  );

  // Mały wiersz ucznia w sekcjach u góry (nowe treningi, forma, bez
  // treningu): inicjały, nazwisko, jedna linia opisu; klik = profil.
  // Linijka fokusu ucznia — w pełnym wierszu listy i w małych wierszach sekcji
  // (nowe treningi, forma, bez treningu 14+ dni). Aktualny albo ukończony
  // (złote kropki), dopóki nie zostanie zakończony lub zastąpiony.
  const renderFocusLine = (studentId: string) => {
    const fc = studentFocus[studentId];
    if (!fc?.focus) return null;
    return (
      <p className="text-[9px] font-bold mt-0.5 flex items-center gap-1 min-w-0 text-amber-800">
        <span className="material-symbols-outlined text-[12px] text-amber-600 shrink-0">center_focus_strong</span>
        <span className="truncate"><span className="font-black">{t('coachLog.typeGoal')}:</span> {focusTitle(fc.focus, t)}</span>
        {fc.dots && <span className="shrink-0 ml-0.5"><FocusDots count={fc.count} goal={fc.goal} small light /></span>}
      </p>
    );
  };

  // [MEILENSTEIN] Otwarcie wpisu = przeczytany → znika z sekcji na głównej
  // (user 2026-10-23). W karcie ucznia zostaje przez 14 dni. Zapisujemy tylko
  // klucze wciąż obecne w sekcji (30 dni), więc lista nie rośnie bez końca.
  const milestoneKey = (m: StudentMilestone) => `${m.student.id}_${m.id}`;
  const unseenMilestones = studentMilestones.filter(m => !seenMilestones.includes(milestoneKey(m)));
  const openMilestone = (m: StudentMilestone) => {
    const live = new Set(studentMilestones.map(milestoneKey));
    const next = [...new Set([...seenMilestones.filter(k => live.has(k)), milestoneKey(m)])];
    setSeenMilestones(next);
    setDoc(doc(db, 'users', userId), { coachSeenMilestones: next }, { merge: true })
      .catch(e => console.error('Zapis przeczytanych kamieni milowych:', e));
    setSheetStudentId(m.student.id);
  };

  // opts.focus=false — bez linijki fokusu (kamienie milowe: user 2026-10-23
  // „po co tam fokus”); opts.plainSub — opis zwykłym tekstem, nie wersalikami.
  const renderMiniStudentRow = (s: any, sub: React.ReactNode, avatarClass: string, action?: React.ReactNode, opts: { focus?: boolean; plainSub?: boolean; onOpen?: () => void } = {}) => {
    const initials = `${s.firstName?.[0] || ''}${s.lastName?.[0] || ''}`.toUpperCase();
    return (
      <div key={s.id} className="w-full flex items-center bg-white rounded-xl shadow-sm border border-gray-100">
      <button
        type="button"
        onClick={opts.onOpen ?? (() => setSheetStudentId(s.id))}
        className="flex-1 min-w-0 flex items-center gap-2.5 px-2.5 py-2 active:scale-[0.98] transition-all text-left"
      >
        <div className={`w-9 h-9 border rounded-full flex items-center justify-center shrink-0 ${avatarClass}`}>
          {initials
            ? <span className="font-black text-[12px]">{initials}</span>
            : <span className="material-symbols-outlined text-[18px]">person</span>}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-black text-[#0a3a2a] text-[14px] leading-tight truncate">
            {s.firstName || t('coachDashboard.defaultStudentName')} {s.lastName || ''}
          </p>
          <p className={opts.plainSub ? 'text-[12px] font-bold mt-0.5 line-clamp-2 break-words' : 'text-[9px] font-bold uppercase tracking-widest mt-0.5 truncate'}>{sub}</p>
          {opts.focus !== false && renderFocusLine(s.id)}
        </div>
        {!action && <span className="material-symbols-outlined text-gray-300 text-[20px] shrink-0">chevron_right</span>}
      </button>
      {action && <div className="flex items-center gap-1 pr-2 shrink-0">{action}</div>}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#fcfdfe] px-5 pb-24 relative">

      <ViewHeader
        // Nagłówek przyklejony u góry: zakładka trenera zawsze widoczna, też nad kartą ucznia.
        className="-mx-5 mb-4 sticky top-0"
        // Z Schüler/Gruppen strzałka wraca do Übersicht, z Übersicht — do trybu zawodnika.
        onBack={() => (section === 'TODAY' ? onNavigate('HOME') : onNavigate('COACH', 'TODAY'))}
        title={section === 'ATHLETES' ? t('nav.coachAthletes') : section === 'GROUPS' ? t('nav.coachGroups') : t('coachDashboard.subtitle')}
        hideLogo
        actions={<>
          <div className="bg-white/10 text-[#fed33e] px-2.5 rounded-xl flex items-center gap-1.5 h-10">
            <span className="material-symbols-outlined text-sm">groups</span>
            <span className="text-sm font-black">{students.length}/{coachLimit}</span>
          </div>
          <button
            onClick={() => { startScanner(); }}
            disabled={isLimitReached}
            aria-label={t('coachDashboard.addBtn')}
            className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-md transition-all ${
              isLimitReached
              ? 'bg-white/10 text-white/30'
              : 'bg-[#fed33e] text-[#0a3a2a] active:scale-95'
            }`}
          >
            <span className="material-symbols-outlined text-[20px]">person_add</span>
          </button>
        </>}
      />

      {/* Zakładka Heute — dzień trenera, nie skrzynka zaległości.
          A: dziś jest trening → odprawa: kto przyjdzie, z jakim fokusem i formą.
          B: dziś bez treningu → najbliższy trening i kto dziś sam trenował.
          W obu: co od ostatniego treningu grupy, a nieaktywni tylko jedną linią. */}
      {section === 'TODAY' && (() => {
        const todayKey = dayKeyOf(nowTick);
        const startOfToday = new Date(nowTick).setHours(0, 0, 0, 0);
        const evs = upcomingCoachEvents || [];
        // [HARMONOGRAM] Treningi ze stałego planu grup liczone w locie. Termin
        // z kalendarza dla tej samej grupy tego dnia ma pierwszeństwo.
        const tomorrowKey = dayKeyOf(startOfToday + 36 * 60 * 60 * 1000);
        const scheduledOcc = coachGroups.flatMap(g => {
          const sc = normalizeSchedule(g.schedule);
          return sc ? upcomingOccurrences(sc, todayKey, 4).map(o => ({
            id: `sched_${g.id}_${o.date}_${o.time}`, date: o.date, time: o.time, title: g.name, place: o.place,
            trainingTopicGroupId: g.id, topicText: coachGroupTopics[g.id]?.[o.date]?.text, scheduledGroupId: g.id,
          })) : [];
        });
        const byWhen = (a: any, b: any) => `${a.date} ${a.time || '99:99'}`.localeCompare(`${b.date} ${b.time || '99:99'}`);
        // Oś treningów od dziś: kalendarz + plan grup, po czasie.
        const timeline: any[] = [...evs, ...scheduledOcc]
          .filter((e: any, _i, all: any[]) =>
            !e.scheduledGroupId || !all.some(o => !o.scheduledGroupId && o.date === e.date && o.trainingTopicGroupId === e.scheduledGroupId))
          .sort(byWhen);
        const todayEv = timeline.find(e => e.date === todayKey);
        const nextEv = timeline.find(e => e.date >= tomorrowKey);
        // Następny trening tej samej grupy (termin bez grupy — po prostu kolejny termin).
        const followUpOf = (ev: any) => ev && timeline
          .slice(timeline.indexOf(ev) + 1)
          .find(e => !ev.trainingTopicGroupId || e.trainingTopicGroupId === ev.trainingTopicGroupId);
        // Termin z kalendarza otwiera kalendarz, trening z planu — swoją grupę.
        const openEv = (ev: any) => ev.scheduledGroupId
          ? onNavigate('COACH', 'GROUP', ev.scheduledGroupId)
          : onNavigate('CALENDAR', undefined, ev.id);
        const dayLabel = (d: Date) => {
          const days = Math.round((new Date(d).setHours(0, 0, 0, 0) - startOfToday) / 86400000);
          return days === 0 ? t('coachToday.today') : days === 1 ? t('coachToday.tomorrow')
            : d.toLocaleDateString(i18n.language, { weekday: 'long' });
        };
        // „Samstag, 31.10.” — dzień tygodnia z datą (user 2026-10-26); dziś bez daty.
        const dateLabel = (d: Date) => {
          const day = dayLabel(d);
          return dayKeyOf(d.getTime()) === todayKey ? day : `${day}, ${d.toLocaleDateString(i18n.language, { day: 'numeric', month: 'numeric' })}`;
        };
        // „in 1:30 h” / „läuft” / „vorbei” — trening liczymy jako 2 h.
        const countdown = (ev: any) => {
          const m = /^(\d{1,2}):(\d{2})/.exec(ev.time || '');
          if (!m) return null;
          const start = new Date(nowTick).setHours(+m[1], +m[2], 0, 0);
          const diff = Math.round((start - nowTick) / 60000);
          if (diff > 0) return t('coachToday.inTime', { time: diff >= 60 ? `${Math.floor(diff / 60)}:${String(diff % 60).padStart(2, '0')} h` : `${diff} min` });
          return diff > -120 ? t('coachToday.running') : t('coachToday.finished');
        };
        // Skład terminu: grupa z tematu treningu, wybrani uczniowie albo wszyscy.
        const rosterOf = (ev: any): any[] =>
          ev.trainingTopicGroupId ? studentsOfGroup(ev.trainingTopicGroupId)
            : Array.isArray(ev.coachStudents) ? students.filter(s => ev.coachStudents.includes(s.id))
            : students;
        // Najpierw ci, na których trzeba zwrócić uwagę: spadek formy, potem dawno bez treningu.
        const rosterRank = (s: any) => formCompare[s.id]?.dir === 'down' ? 0 : isInactive(s) ? 1 : 2;

        // Ostatni trening: późniejszy z kalendarza i z planu grup.
        const lastDay = [lastTrainingDate, ...coachGroups.map(g => prevOccurrence(g.schedule, todayKey))]
          .filter((d): d is string => !!d).sort().pop() || null;
        const since = lastDay ? new Date(`${lastDay}T00:00:00`).getTime() : nowTick - 7 * DAY_MS;
        const sinceLabel = lastDay
          ? t('coachToday.sinceTraining', { day: new Date(`${lastDay}T00:00:00`).toLocaleDateString(i18n.language, { weekday: 'short', day: 'numeric', month: 'numeric' }) })
          : t('coachToday.sinceWeek');
        const trainedToday = students
          .filter(s => (s.exactLastActivity || 0) >= startOfToday)
          .sort((a, b) => (b.exactLastActivity || 0) - (a.exactLastActivity || 0));
        const unread = students.filter(s => unreadStudentIds.has(s.id));
        // W stanie B dzisiejsi są już wyżej, w „Heute trainiert”.
        const trainedSince = students
          .filter(s => (s.exactLastActivity || 0) >= since && (todayEv || (s.exactLastActivity || 0) < startOfToday))
          .sort((a, b) => (b.exactLastActivity || 0) - (a.exactLastActivity || 0));
        const sinceUp = trainedSince.filter(s => formCompare[s.id]?.dir === 'up').length;
        const sinceDown = trainedSince.filter(s => formCompare[s.id]?.dir === 'down').length;
        const hasSince = unread.length > 0 || newStudentIds.length > 0 || trainedSince.length > 0
          || unseenMilestones.length > 0 || studentTournaments.length > 0;

        const label = (text: string, right?: React.ReactNode) => (
          <div className="flex items-center justify-between mb-2 px-1">
            <h2 className="text-[12px] font-black text-gray-500 uppercase tracking-wider">{text}</h2>
            {right}
          </div>
        );
        const more = (total: number, open: boolean, toggle: () => void) => total > TODAY_SHOWN && (
          <button type="button" onClick={toggle} className="w-full py-2 text-[12px] font-black text-rose-600 active:scale-95 transition-all">
            {open ? t('coachToday.showLess') : t('coachToday.showAll', { count: total })}
          </button>
        );
        const cap = <T,>(list: T[], open: boolean) => (open ? list : list.slice(0, TODAY_SHOWN));
        const trend = (s: any) => {
          const c = formCompare[s.id];
          return c ? (
            <span className={`inline-flex items-center text-[13px] font-black ${c.dir === 'up' ? 'text-emerald-600' : 'text-orange-500'}`}>
              <span className="material-symbols-outlined text-[16px]">{TREND_ICON[c.dir]}</span>{c.now}
            </span>
          ) : s.lastSessionScore > 0 ? <span className="text-[13px] font-black text-gray-400">{s.lastSessionScore}</span> : null;
        };
        const plain = { plainSub: true, focus: false };
        const topicsLine = (ev: any) => Array.isArray(ev.topics) && ev.topics.length > 0
          ? ev.topics.map((id: string) => topicLabel(id, t)).join(' · ') : ev.topicText || null;
        // Kolejny trening tej grupy: pod kartą, mniejszy i przygaszony (user 2026-10-26).
        const followCard = (ev: any) => ev && (
          <button
            type="button"
            onClick={() => openEv(ev)}
            className="mt-2 w-full flex items-center gap-2 bg-white rounded-xl px-3 py-2 border border-gray-100 opacity-70 active:scale-[0.98] transition-all text-left"
          >
            <span className="material-symbols-outlined text-[16px] text-rose-600 shrink-0">schedule</span>
            <span className="text-[12px] font-black text-rose-600 shrink-0 first-letter:uppercase">{dateLabel(eventDate(ev))}{ev.time ? ` · ${ev.time}` : ''}</span>
            <span className="flex-1 min-w-0 text-[13px] font-bold text-[#0a3a2a] truncate">{ev.title}{ev.place && <span className="text-gray-400"> · {ev.place}</span>}</span>
            <span className="material-symbols-outlined text-gray-300 text-[18px] shrink-0">chevron_right</span>
          </button>
        );
        const addEventBtn = (
          <button
            type="button"
            onClick={() => onNavigate('CALENDAR', 'NEW_TRAINER_EVENT')}
            className="flex items-center gap-1 text-[12px] font-black text-rose-600 active:scale-95 transition-all"
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
            {t('coachDashboard.newEventBtn')}
          </button>
        );

        return (
        <div className="space-y-6 mb-4">

          {/* Nagłówek dnia — mówi wprost, czy dziś jest trening. */}
          <div className="px-1">
            <p className="text-[13px] font-bold text-gray-500 first-letter:uppercase">
              {new Date(nowTick).toLocaleDateString(i18n.language, { weekday: 'long', day: 'numeric', month: 'long' })}
            </p>
            <h1 className="text-[22px] font-black text-[#0a3a2a] leading-tight mt-0.5">
              {upcomingCoachEvents === null ? '…'
                : todayEv ? (todayEv.time ? t('coachToday.trainingAt', { time: todayEv.time }) : t('coachToday.trainingToday'))
                : t('coachToday.noTraining')}
            </h1>
          </div>

          {/* A: odprawa przed dzisiejszym treningiem */}
          {todayEv && (() => {
            const roster = rosterOf(todayEv).slice().sort((a, b) => rosterRank(a) - rosterRank(b));
            const shown = isRosterOpen ? roster : roster.slice(0, 5);
            const cd = countdown(todayEv);
            const topics = topicsLine(todayEv);
            return (
              <section className="bg-white rounded-2xl border-2 border-rose-200 shadow-sm overflow-hidden">
                <button
                  type="button"
                  onClick={() => openEv(todayEv)}
                  className="w-full text-left px-3.5 pt-3 pb-2.5 active:bg-rose-50/50 transition-all"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-[16px] font-black text-[#0a3a2a] leading-tight min-w-0 break-words">{todayEv.title}{todayEv.place && <span className="text-gray-400 font-bold"> · {todayEv.place}</span>}</p>
                    {cd && <span className="shrink-0 text-[12px] font-black text-rose-600 bg-rose-50 rounded-full px-2 py-0.5">{cd}</span>}
                  </div>
                  {topics && <p className="text-[13px] font-bold text-emerald-700 mt-1">{topics}</p>}
                </button>
                <div className="border-t border-gray-100 px-3.5 py-2">
                  <p className="text-[12px] font-bold text-gray-400 mb-1">{t('coachToday.rosterTitle', { count: roster.length })}</p>
                  {roster.length === 0 && <p className="text-[13px] font-bold text-gray-400 py-1">{t('coachToday.noRoster')}</p>}
                  {shown.map(s => {
                    const fc = studentFocus[s.id];
                    const initials = `${s.firstName?.[0] || ''}${s.lastName?.[0] || ''}`.toUpperCase();
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => setSheetStudentId(s.id)}
                        className="w-full flex items-center gap-2.5 py-1.5 text-left active:scale-[0.98] transition-all"
                      >
                        <div className="w-8 h-8 rounded-full bg-gray-50 border border-gray-100 flex items-center justify-center shrink-0 text-[11px] font-black text-[#0a3a2a]">{initials || '?'}</div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[14px] font-black text-[#0a3a2a] leading-tight truncate">{s.firstName || t('coachDashboard.defaultStudentName')} {s.lastName || ''}</p>
                          <p className="text-[12px] font-bold truncate">
                            {isInactive(s)
                              ? <span className="text-amber-700">{getTimeSinceLastActivity(s.exactLastActivity || 0)}</span>
                              : fc?.focus
                                ? <span className="text-amber-800">{t('coachLog.typeGoal')}: {focusTitle(fc.focus, t)}</span>
                                : <span className="text-gray-400">{t('coachToday.noFocus')}</span>}
                          </p>
                        </div>
                        {trend(s)}
                      </button>
                    );
                  })}
                  {roster.length > 5 && (
                    <button type="button" onClick={() => setIsRosterOpen(o => !o)} className="w-full py-1.5 text-[12px] font-black text-rose-600 active:scale-95 transition-all">
                      {isRosterOpen ? t('coachToday.showLess') : t('coachToday.rosterMore', { count: roster.length - 5 })}
                    </button>
                  )}
                </div>
              </section>
            );
          })()}
          {todayEv && <div className="-mt-4">{followCard(followUpOf(todayEv))}</div>}

          {/* B: bez treningu dziś — najbliższy trening jedną kartą */}
          {!todayEv && upcomingCoachEvents !== null && (
            <section>
              {label(t('coachToday.nextTraining'), addEventBtn)}
              {nextEv ? (() => {
                const d = eventDate(nextEv);
                const topics = topicsLine(nextEv);
                return (
                  <button
                    type="button"
                    onClick={() => openEv(nextEv)}
                    className="w-full flex items-center gap-3 bg-white rounded-2xl px-3.5 py-3 shadow-sm border border-rose-100 active:scale-[0.98] transition-all text-left"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-black text-rose-600 first-letter:uppercase">{dateLabel(d)}{nextEv.time ? ` · ${nextEv.time}` : ''}</p>
                      <p className="text-[15px] font-black text-[#0a3a2a] leading-tight mt-0.5 truncate">{nextEv.title}{nextEv.place && <span className="text-gray-400 font-bold"> · {nextEv.place}</span>}</p>
                      {topics && <p className="text-[12px] font-bold text-emerald-700 mt-0.5 truncate">{topics}</p>}
                    </div>
                    <span className="material-symbols-outlined text-gray-300 text-[22px] shrink-0">chevron_right</span>
                  </button>
                );
              })() : (
                <button
                  type="button"
                  onClick={() => onNavigate('CALENDAR', 'NEW_TRAINER_EVENT')}
                  className="w-full rounded-2xl border border-dashed border-rose-200 bg-rose-50/40 py-4 text-center active:scale-[0.98] transition-all"
                >
                  <span className="block text-[13px] font-bold text-gray-500">{t('coachDashboard.upcomingNone')}</span>
                  <span className="block text-[13px] font-black text-rose-600 mt-1">{t('coachDashboard.newEventBtn')}</span>
                </button>
              )}
              {followCard(followUpOf(nextEv))}
            </section>
          )}

          {/* B: kto dziś sam trenował */}
          {!todayEv && !isLoading && trainedToday.length > 0 && (
            <section className="space-y-1.5">
              {label(t('coachToday.trainedToday'))}
              {cap(trainedToday, isNewTrainingsOpen).map(s => renderMiniStudentRow(
                s,
                <span className="text-emerald-700">{lastSessionDetails(s) || getTimeSinceLastActivity(s.exactLastActivity || 0)}</span>,
                'bg-emerald-50 text-emerald-700 border-emerald-100',
                trend(s),
                plain,
              ))}
              {more(trainedToday.length, isNewTrainingsOpen, () => setIsNewTrainingsOpen(o => !o))}
            </section>
          )}

          {/* Od ostatniego treningu grupy (albo z 7 dni, gdy go jeszcze nie było) */}
          {!isLoading && lastTrainingDate !== undefined && (
            <section className="space-y-1.5">
              {label(sinceLabel)}
              {!hasSince && <p className="text-[13px] font-bold text-gray-400 px-1">{t('coachToday.nothingNew')}</p>}
              {/* [C37] Nowy uczeń — dawniej kropka na przycisku „Schüler”. */}
              {newStudentIds.length > 0 && (
                <button
                  type="button"
                  onClick={() => { onNavigate('COACH', 'ATHLETES'); }}
                  className="w-full flex items-center gap-2.5 bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-3 text-left active:scale-[0.98] transition-all"
                >
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse shrink-0 ml-1" />
                  <span className="flex-1 text-[14px] font-black text-emerald-800">{t('coachDashboard.newStudentDot', { count: newStudentIds.length })}</span>
                  <span className="material-symbols-outlined text-emerald-400 text-[20px]">chevron_right</span>
                </button>
              )}
              {unread.map(s => renderMiniStudentRow(
                s,
                <span className="text-red-600 inline-flex items-center gap-1">
                  <span className="material-symbols-outlined text-[14px]">chat</span>{t('coachToday.unreadMessage')}
                </span>,
                'bg-red-50 text-red-700 border-red-100',
                undefined,
                { ...plain, onOpen: () => setOpenMessageStudentId(s.id) },
              ))}
              {trainedSince.length > 0 && (
                <>
                  <p className="text-[12px] font-bold text-gray-400 px-1 pt-1 flex items-center gap-2">
                    {t('coachToday.trainedSince', { count: trainedSince.length })}
                    {sinceUp > 0 && <span className="inline-flex items-center text-emerald-600"><span className="material-symbols-outlined text-[14px]">trending_up</span>{sinceUp}</span>}
                    {sinceDown > 0 && <span className="inline-flex items-center text-orange-500"><span className="material-symbols-outlined text-[14px]">trending_down</span>{sinceDown}</span>}
                  </p>
                  {cap(trainedSince, isMilestonesOpen).map(s => renderMiniStudentRow(
                    s,
                    <span className="text-gray-500">
                      {getTimeSinceLastActivity(s.exactLastActivity || 0)}{lastSessionDetails(s) && ` · ${lastSessionDetails(s)}`}
                    </span>,
                    'bg-gray-50 text-[#0a3a2a] border-gray-100',
                    trend(s),
                    plain,
                  ))}
                  {more(trainedSince.length, isMilestonesOpen, () => setIsMilestonesOpen(o => !o))}
                </>
              )}
              {unseenMilestones.map(m => (
                <React.Fragment key={`${m.student.id}_${m.id}`}>
                  {renderMiniStudentRow(
                    m.student,
                    <span className="text-[#8B6508]">
                      <span className="material-symbols-outlined text-[14px] align-[-3px]">star</span>{' '}
                      {/* Tytuł pogrubiony, opis po nim (user 2026-10-23); starsze bez tytułu — sam tekst. */}
                      <span className="font-black text-[#0a3a2a]">{m.title || m.text}</span>
                      {m.title && m.text && <span className="text-gray-500"> — {m.text}</span>}
                    </span>,
                    'bg-[#fed33e]/20 text-[#8B6508] border-[#fed33e]/50',
                    undefined,
                    { ...plain, onOpen: () => openMilestone(m) },
                  )}
                </React.Fragment>
              ))}
              {studentTournaments.map(tour => {
                const d = eventDate(tour);
                return (
                  <div
                    key={`${tour.date}|${tour.title}`}
                    className="flex items-center gap-2.5 bg-white rounded-xl px-2.5 py-2 shadow-sm border border-gray-100"
                  >
                    <div className="bg-[#fed33e]/20 rounded-lg text-center min-w-[42px] px-1.5 py-1 shrink-0">
                      <span className="block text-[10px] font-black uppercase leading-none mb-0.5 text-[#8B6508]">{d.toLocaleDateString(i18n.language, { month: 'short' })}</span>
                      <span className="block text-[16px] font-black leading-none text-[#0a3a2a]">{d.getDate()}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-black text-[#0a3a2a] text-[14px] leading-tight truncate">{tour.title}</p>
                      <p className="text-[12px] font-bold text-[#8B6508] mt-0.5 truncate first-letter:uppercase">
                        {dayLabel(d)} · {tour.names.join(', ')}
                      </p>
                    </div>
                  </div>
                );
              })}
            </section>
          )}

          {/* Zaległości — ważne, ale nie na dziś: jedna linia do listy z filtrem. */}
          {!isLoading && inactiveCount > 0 && (
            <button
              type="button"
              onClick={() => { setInactiveOnly(true); setActiveGroup('ALL'); onNavigate('COACH', 'ATHLETES'); }}
              className="w-full flex items-center gap-2 border-t border-gray-100 px-1 pt-3 text-left active:scale-[0.98] transition-all"
            >
              <span className="material-symbols-outlined text-[18px] text-amber-600">person_off</span>
              <span className="flex-1 text-[13px] font-bold text-gray-500">{t('coachToday.inactiveLine', { count: inactiveCount, days: INACTIVE_DAYS })}</span>
              <span className="material-symbols-outlined text-gray-300 text-[20px]">chevron_right</span>
            </button>
          )}
        </div>
        );
      })()}

      {/* [C34] Skaner jako popup (zgłoszenie usera 2026-09-16: doczepiał się
          na dole strony, pod listą uczniów, i łatwo było go przeoczyć).
          Przez createPortal do body, bo <main> w App.tsx ma `scale-*`, czyli
          transform — `fixed` w jego środku kotwiczy się do strony, nie do okna.
          Zawartość karty i kolejność elementów zostają bez zmian, żeby nie
          ruszać startu kamery: startScanner() czeka mikrotask na #reader
          i musi zachować kontekst gestu użytkownika (inaczej iOS nie da
          kamery), a portal trafia do tego samego commita Reacta. */}
      {isScanning && createPortal(
        <div
          className="fixed inset-0 z-[500000] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in"
          onClick={async () => { await stopScanner(); setIsScanning(false); }}
        >
        <div
          className="bg-white rounded-[32px] p-4 shadow-xl border border-gray-100 relative overflow-hidden w-full max-w-sm max-h-[90vh] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex justify-between items-center mb-4">
            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{t('coachDashboard.addStudentHeader')}</span>
            <button onClick={async () => { await stopScanner(); setIsScanning(false); }} className="bg-red-50 text-red-500 w-8 h-8 rounded-full flex items-center justify-center active:scale-90">
              <span className="material-symbols-outlined text-sm">close</span>
            </button>
          </div>

          <div className="mb-5 flex gap-2">
            <input
              type="text"
              value={manualStudentId}
              onChange={(e) => setManualStudentId(e.target.value)}
              placeholder={t('coachDashboard.idPlaceholder')}
              className="flex-1 bg-gray-50 border border-gray-200 rounded-xl p-3 text-[11px] font-bold outline-none focus:border-rose-500 text-[#333]"
            />
            <button
              onClick={() => {
                if(manualStudentId.trim()) {
                  handleAddStudent(manualStudentId.trim());
                }
              }}
              disabled={!manualStudentId.trim() || isLoading}
              className="bg-rose-600 text-white px-4 rounded-xl text-[10px] font-black uppercase tracking-widest active:scale-95 disabled:opacity-50 transition-all shadow-md"
            >
              {t('coachDashboard.addBtn')}
            </button>
          </div>

          <div className="flex items-center gap-3 mb-5">
            <div className="flex-1 h-px bg-gray-100"></div>
            <span className="text-[9px] font-black text-gray-300 uppercase tracking-widest">{t('coachDashboard.orScanQr')}</span>
            <div className="flex-1 h-px bg-gray-100"></div>
          </div>

          <div id="reader" className={`w-full rounded-2xl overflow-hidden border-2 border-rose-100 bg-gray-50 flex items-center justify-center min-h-[250px] ${cameraError ? 'hidden' : ''}`}></div>
          {cameraError && (
            <div className="w-full bg-red-50 border border-red-100 rounded-2xl p-6 flex flex-col items-center justify-center min-h-[150px] text-center">
               <span className="material-symbols-outlined text-red-400 text-3xl mb-2">no_photography</span>
               <p className="text-[11px] font-bold text-red-600">{t('coachDashboard.cameraError')}</p>
               <p className="text-[9px] text-red-400 mt-1 uppercase tracking-widest">{t('coachDashboard.cameraErrorDesc')}</p>
               <p className="text-[9px] text-red-300 mt-2 font-mono">[{cameraError}]</p>
            </div>
          )}
        </div>
        </div>,
        document.body
      )}

      {section === 'GROUPS' && (
        <div className="space-y-2">
          {/* [C27] Same grupy. Klik rozwija grupę w miejscu: jej uczniowie
              i dziennik (do czytania). Zmiana nazwy, nowy wpis i usunięcie —
              przez „Wybierz", tym samym trikiem co u uczniów (życzenie usera
              2026-09-10); w rozwiniętej grupie tych przycisków już nie ma. */}
          {coachGroups.length > 0 && (
            <div className="flex items-center justify-between ml-2 pr-1 mb-1">
              <h2 className="text-[10px] font-black text-rose-500 uppercase tracking-widest">
                {t('coachDashboard.viewGroups')} ({coachGroups.length})
              </h2>
              {isGroupSelecting ? (
                <button
                  onClick={exitGroupSelecting}
                  className="text-[9px] font-black uppercase text-white bg-[#0a3a2a] px-2.5 py-1 rounded-lg active:scale-95 transition-all"
                >
                  {t('coachDashboard.done')}
                </button>
              ) : (
                <button
                  onClick={() => { setIsGroupSelecting(true); setActiveGroup('ALL'); exitSelecting(); }}
                  className="text-[9px] font-black uppercase text-[#0a3a2a] flex items-center gap-1 active:scale-95 transition-all"
                >
                  <span className="material-symbols-outlined text-rose-500 text-[14px]">check_circle</span>
                  {t('coachDashboard.selectMode')}
                </button>
              )}
            </div>
          )}

          {/* Pasek akcji dla zaznaczonej grupy — jak pasek wysyłki u uczniów */}
          {isGroupSelecting && (() => {
            const sel = coachGroups.find(g => g.id === selectedGroupId);
            return (
              <div className="bg-[#0a3a2a] pl-3 pr-1.5 py-1.5 rounded-xl flex items-center gap-1.5 animate-fade-in">
                <span className="flex-1 min-w-0 flex items-center gap-1 text-[11px] font-black text-white">
                  <span className="material-symbols-outlined text-[16px] text-[#fed33e] shrink-0">{sel ? groupIcon(sel) : DEFAULT_GROUP_ICON}</span>
                  <span className={`truncate ${sel ? '' : 'text-white/50'}`}>{sel ? sel.name : t('coachDashboard.pickGroupHint')}</span>
                </span>
                <button
                  onClick={() => { if (sel) { setEditingGroup(sel); setEditGroupName(sel.name); setEditGroupIcon(groupIcon(sel)); } }}
                  disabled={!sel}
                  aria-label={t('coachDashboard.editGroupBtn')}
                  title={t('coachDashboard.editGroupBtn')}
                  className="w-8 h-8 shrink-0 rounded-lg bg-white/10 text-white flex items-center justify-center active:scale-90 transition-all disabled:opacity-40"
                >
                  <span className="material-symbols-outlined text-[18px]">edit</span>
                </button>
                <button
                  onClick={() => { if (sel) setConfirmDeleteGroup(sel.id); }}
                  disabled={!sel}
                  aria-label={t('coachDashboard.deleteGroupBtn')}
                  title={t('coachDashboard.deleteGroupBtn')}
                  className="w-8 h-8 shrink-0 rounded-lg bg-white/10 text-red-300 flex items-center justify-center active:scale-90 transition-all disabled:opacity-40"
                >
                  <span className="material-symbols-outlined text-[18px]">delete</span>
                </button>
              </div>
            );
          })()}

          {coachGroups.map(group => {
            const members = studentsOfGroup(group.id);
            // [TEMAT TRENINGU] Na zwiniętej karcie: dzisiejszy albo następny zaplanowany temat.
            const todayKey = dayKeyOf(Date.now());
            const nextTopicDay = Object.keys(coachGroupTopics[group.id] || {}).sort().find(d => d >= todayKey);
            const nextTopic = nextTopicDay ? coachGroupTopics[group.id][nextTopicDay] : undefined;
            const isOpen = !isGroupSelecting && activeGroup === group.id;
            const isPicked = isGroupSelecting && selectedGroupId === group.id;
            const pulse = groupPulse(members);
            return (
              // [WIDOK GRUPY] (user 2026-10-23) Karta grupy = sam nagłówek w stylu
              // dziennika (biała, różowy pasek). Rozwinięta treść stoi POD nią,
              // nie w niej — koniec „tabelki w tabelce”.
              <div key={group.id} id={`coach-group-${group.id}`} className={`scroll-mt-4 ${isOpen ? 'pb-3' : ''}`}>
                <div
                  role="button"
                  aria-expanded={isGroupSelecting ? undefined : isOpen}
                  aria-pressed={isGroupSelecting ? isPicked : undefined}
                  onClick={() => {
                    // W trybie wyboru klik zaznacza (jedna grupa naraz), poza nim rozwija.
                    if (isGroupSelecting) { setSelectedGroupId(isPicked ? null : group.id); return; }
                    setActiveGroup(isOpen ? 'ALL' : group.id); setIsGroupListOpen(false);
                  }}
                  // Otwarta grupa: grubszy pasek, jak dzisiejsze wpisy w dzienniku.
                  style={isOpen ? { borderLeftWidth: 7 } : undefined}
                  className={`${CARD_SHAPE} tb-led pl-2 pr-1 py-2 flex items-center gap-2.5 cursor-pointer active:scale-[0.99] transition-all ${
                    isPicked ? 'ring-2 ring-[#0a3a2a]' : ''
                  }`}
                >
                  {isGroupSelecting ? (
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 transition-all ${
                      isPicked ? 'bg-[#0a3a2a] text-[#fed33e]' : 'bg-white text-transparent border-2 border-gray-200'
                    }`}>
                      <span className="material-symbols-outlined text-[18px] font-black">check</span>
                    </div>
                  ) : (
                    <span className="tb-icon w-9 h-9 rounded-lg flex items-center justify-center shrink-0">
                      <span className="material-symbols-outlined text-rose-600 text-[20px]">{groupIcon(group)}</span>
                    </span>
                  )}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-black text-[#0a3a2a] text-[14px] leading-tight truncate">{group.name}</h3>
                    {/* [HARMONOGRAM] Stały trening od razu pod nazwą (user 2026-10-26: „ma być u góry”). */}
                    {scheduleSummary(group.schedule) && (
                      <p className="flex items-center gap-1 text-[12px] font-bold text-rose-700 truncate mt-0.5">
                        <span className="material-symbols-outlined text-[14px]">schedule</span>
                        <span className="truncate">{scheduleSummary(group.schedule)}</span>
                      </p>
                    )}
                    {/* Liczba uczniów i puls w jednej linii — dawniej liczba stała osobno po prawej i ściskała nazwę. */}
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                      <span className="text-[10px] font-bold text-gray-500">{t('coachDashboard.studentsCount', { count: members.length })}</span>
                      {members.length > 0 && !isLoading && (<>
                        {pulse.total > 0 && (
                          <span
                            className={`text-[10px] font-black px-1.5 py-0.5 rounded-md ${
                              pulse.active === pulse.total ? 'bg-emerald-50 text-emerald-700'
                                : pulse.active === 0 ? 'bg-red-50 text-red-500' : 'bg-gray-100 text-gray-600'
                            }`}
                            title={t('coachDashboard.groupPulseActiveHint')}
                          >
                            {t('coachDashboard.groupPulseActive', { active: pulse.active, total: pulse.total })}
                          </span>
                        )}
                        {pulse.up > 0 && (
                          <span className="flex items-center text-[10px] font-black text-emerald-600" title={t('coachDashboard.groupPulseUp')} aria-label={`${t('coachDashboard.groupPulseUp')}: ${pulse.up}`}>
                            <span className="material-symbols-outlined text-[14px]">trending_up</span>{pulse.up}
                          </span>
                        )}
                        {pulse.down > 0 && (
                          <span className="flex items-center text-[10px] font-black text-red-500" title={t('coachDashboard.groupPulseDown')} aria-label={`${t('coachDashboard.groupPulseDown')}: ${pulse.down}`}>
                            <span className="material-symbols-outlined text-[14px]">trending_down</span>{pulse.down}
                          </span>
                        )}
                        {pulse.inactive > 0 && (
                          <span className="flex items-center gap-0.5 text-[10px] font-black text-amber-600" title={t('coachDashboard.groupPulseInactive')} aria-label={`${t('coachDashboard.groupPulseInactive')}: ${pulse.inactive}`}>
                            <span className="material-symbols-outlined text-[14px]">person_off</span>{pulse.inactive}
                          </span>
                        )}
                      </>)}
                    </div>
                    {!isOpen && nextTopic && (
                      <p className="flex items-center gap-1 text-[11px] font-bold text-[#0a3a2a] truncate mt-1">
                        <span className="material-symbols-outlined text-rose-600 text-[14px]">sports</span>
                        <span className="truncate">
                          <span className="font-black">
                            {nextTopicDay === todayKey
                              ? t('coachDashboard.groupTopicToday')
                              : new Date(`${nextTopicDay}T12:00:00`).toLocaleDateString(i18n.language, { weekday: 'short', day: 'numeric', month: 'short' })}:
                          </span> {nextTopic.text}
                        </span>
                      </p>
                    )}
                  </div>
                  {!isGroupSelecting && members.length > 0 && (
                    <button
                      onClick={e => { e.stopPropagation(); openGroupMessage(group, members); }}
                      aria-label={t('coachDashboard.groupMessageBtn')}
                      title={t('coachDashboard.groupMessageBtn')}
                      className="w-10 h-10 shrink-0 rounded-xl text-rose-600 flex items-center justify-center active:scale-90 transition-all"
                    >
                      <span className="material-symbols-outlined text-[20px]">mail</span>
                    </button>
                  )}
                  {!isGroupSelecting && (
                    <span className="material-symbols-outlined text-gray-400 text-[22px] shrink-0 mr-1">{isOpen ? 'expand_less' : 'expand_more'}</span>
                  )}
                </div>

                {isOpen && (
                  <div className="pt-1 space-y-3">
                    {/* [HARMONOGRAM] Stały trening grupy — z niego Heute wie, kiedy jest trening. */}
                    <button
                      type="button"
                      onClick={() => openScheduleEditor(group)}
                      className={`w-full flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-left active:scale-[0.98] transition-all ${
                        scheduleSummary(group.schedule) ? 'bg-white border border-rose-100 shadow-sm' : 'border border-dashed border-rose-200 bg-rose-50/40'
                      }`}
                    >
                      <span className="material-symbols-outlined text-rose-600 text-[20px]">schedule</span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-[12px] font-bold text-gray-500">{t('coachSchedule.title')}</span>
                        <span className="block text-[14px] font-black text-[#0a3a2a] truncate">
                          {scheduleSummary(group.schedule) || t('coachSchedule.setUp')}
                        </span>
                      </span>
                      <span className="material-symbols-outlined text-gray-300 text-[20px]">{scheduleSummary(group.schedule) ? 'edit' : 'add'}</span>
                    </button>
                    <GroupTopicPanel
                      groupId={group.id}
                      groupName={group.name}
                      members={members}
                      coachId={userId}
                      topics={coachGroupTopics[group.id] || {}}
                      onChanged={next => handleGroupTopicChanged(group.id, next)}
                      showToast={showToast}
                      onOpenStudent={setSheetStudentId}
                      renderHistory={(repeatToday, editTopic) => (
                        <GroupTrainingHistory
                          onRepeat={repeatToday}
                          onEdit={editTopic}
                          groupId={group.id}
                          coachId={userId}
                          members={members}
                          topics={coachGroupTopics[group.id] || {}}
                          legacyNotes={groupNotes[group.id] || EMPTY_NOTES}
                          onLegacyMigrated={() => handleLegacyNotesMigrated(group.id)}
                          onOpenStudent={setSheetStudentId}
                        />
                      )}
                    />

                    {/* Skład grupy — zwijany, liczba w nagłówku; „dodaj ucznia” obok, nie na dole listy. */}
                    <section>
                      <GroupSectionHeader
                        icon="groups"
                        label={t('coachDashboard.groupList')}
                        count={members.length}
                        open={isGroupListOpen}
                        onToggle={() => setIsGroupListOpen(o => !o)}
                        action={members.length < students.length && !isSelecting ? (
                          <button
                            type="button"
                            onClick={() => { setAddPicked([]); setAddToGroupId(group.id); }}
                            aria-label={t('coachDashboard.addToGroupBtn')}
                            title={t('coachDashboard.addToGroupBtn')}
                            className="w-10 h-10 shrink-0 rounded-xl text-rose-600 flex items-center justify-center active:scale-90 transition-all"
                          >
                            <span className="material-symbols-outlined text-[20px]">person_add</span>
                          </button>
                        ) : undefined}
                      />
                      {isGroupListOpen && renderStudentList(members, '')}
                    </section>
                  </div>
                )}
              </div>
            );
          })}

          {/* Stan pusty — brak grup */}
          {coachGroups.length === 0 && (
            <div className="text-center py-10 bg-gray-50 rounded-3xl border border-dashed border-gray-200 mt-2">
              <span className="material-symbols-outlined text-4xl text-gray-300 mb-2 block">folder_off</span>
              <p className="text-[11px] font-black text-gray-400 uppercase tracking-widest mb-4">{t('coachDashboard.noGroups')}</p>
              <button
                onClick={() => setIsCreatingGroup(true)}
                className="bg-rose-600 text-white px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest active:scale-95 shadow-sm"
              >
                {t('coachDashboard.createFirstGroup')}
              </button>
            </div>
          )}

          {/* Przycisk dodania nowej grupy */}
          {coachGroups.length > 0 && coachGroups.length < 5 && (
            <button
              onClick={() => setIsCreatingGroup(true)}
              className="w-full py-2.5 bg-rose-50 text-[#0a3a2a] rounded-2xl font-black text-[10px] uppercase tracking-widest border border-rose-100 flex items-center justify-center gap-2 active:scale-95 transition-all shadow-sm"
            >
              <span className="material-symbols-outlined text-rose-500 text-sm">add</span>
              {t('coachDashboard.newGroupTitle')}
            </button>
          )}
        </div>
      )}

      {/* Zakładka UCZNIOWIE — sama lista, bez paska grup */}
      {section === 'ATHLETES' && (
        <div>
          {inactiveOnly && (
            <button
              type="button"
              onClick={() => setInactiveOnly(false)}
              className="mb-3 inline-flex items-center gap-1 bg-amber-50 border border-amber-100 text-amber-800 rounded-full pl-3 pr-2 py-1 text-[9px] font-black uppercase tracking-widest active:scale-95 transition-all"
            >
              {t('coachDashboard.inactiveFilterChip', { days: INACTIVE_DAYS })}
              <span className="material-symbols-outlined text-[14px]">close</span>
            </button>
          )}
          {renderStudentList(visibleStudents, t('coachDashboard.allStudents'))}
        </div>
      )}

      {inviteSentTo !== null && createPortal(
        <div className="fixed inset-0 z-[500000] bg-black/80 backdrop-blur-sm flex items-center justify-center p-6 animate-fade-in" onClick={() => setInviteSentTo(null)}>
          <div className="bg-white rounded-[32px] p-6 w-full max-w-sm text-center shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-emerald-50 border-2 border-emerald-100 flex items-center justify-center">
              <span className="material-symbols-outlined text-emerald-500 text-3xl">send</span>
            </div>
            <h2 className="text-lg font-black text-[#0a3a2a] mb-2">{t('coachDashboard.inviteSentTitle')}</h2>
            <p className="text-sm font-bold text-gray-600 mb-6 leading-relaxed">
              {inviteSentTo
                ? t('coachDashboard.inviteSentDesc', { name: inviteSentTo })
                : t('coachDashboard.inviteSentDescNoName')}
            </p>
            <button onClick={() => setInviteSentTo(null)} className="w-full py-3.5 rounded-xl font-black text-[11px] uppercase tracking-widest text-white bg-[#0a3a2a] shadow-md active:scale-95 transition-all">
              {t('coachDashboard.inviteSentOk')}
            </button>
          </div>
        </div>,
        document.body
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
               className="w-full bg-gray-50 border border-gray-200 rounded-xl p-4 text-[12px] font-black outline-none focus:border-rose-500 mb-4 text-[#333]"
             />
             <GroupIconPicker value={newGroupIcon} onChange={setNewGroupIcon} />
             <div className="flex gap-2">
               <button onClick={() => setIsCreatingGroup(false)} className="flex-1 py-3 bg-gray-100 text-gray-500 rounded-xl font-black text-[10px] uppercase tracking-widest active:scale-95">{t('coachDashboard.cancel')}</button>
               <button onClick={handleCreateGroup} disabled={!newGroupName.trim()} className="flex-1 py-3 bg-rose-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest active:scale-95 disabled:opacity-50 shadow-md">{t('coachDashboard.save')}</button>
             </div>
           </div>
         </div>,
         document.body
      )}

      {addToGroupId && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[500000] flex items-center justify-center p-4 animate-fade-in" onClick={() => setAddToGroupId(null)}>
          <div className="bg-white rounded-[32px] p-6 w-full max-w-[340px] shadow-2xl flex flex-col max-h-[85vh]" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-black text-[#0a3a2a] mb-1">{t('coachDashboard.addToGroupTitle')}</h2>
            <p className="text-[10px] font-black text-[#0a3a2a] mb-4 truncate">{coachGroups.find(g => g.id === addToGroupId)?.name}</p>
            <div className="space-y-1.5 overflow-y-auto hide-scrollbar mb-5">
              {students
                .filter(s => !(studentGroupMap[s.id] || []).includes(addToGroupId))
                .sort((a, b) => `${a.firstName || ''} ${a.lastName || ''}`.localeCompare(`${b.firstName || ''} ${b.lastName || ''}`))
                .map(s => {
                  const picked = addPicked.includes(s.id);
                  return (
                    <button
                      key={s.id}
                      type="button"
                      aria-pressed={picked}
                      onClick={() => setAddPicked(p => picked ? p.filter(id => id !== s.id) : [...p, s.id])}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl border text-left active:scale-[0.98] transition-all ${
                        picked ? 'bg-rose-50 border-rose-300' : 'bg-white border-gray-100'
                      }`}
                    >
                      <span className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 ${
                        picked ? 'bg-rose-600 text-white' : 'border-2 border-gray-200 text-transparent'
                      }`}>
                        <span className="material-symbols-outlined text-[16px] font-black">check</span>
                      </span>
                      <span className="flex-1 min-w-0 font-black text-[12px] text-[#0a3a2a] truncate">
                        {s.firstName || t('coachDashboard.defaultStudentName')} {s.lastName || ''}
                      </span>
                    </button>
                  );
                })}
            </div>
            <div className="flex gap-2">
              <button onClick={() => setAddToGroupId(null)} className="flex-1 py-3 bg-gray-100 text-gray-500 rounded-xl font-black text-[10px] uppercase tracking-widest active:scale-95">{t('coachDashboard.cancel')}</button>
              <button onClick={addPickedToGroup} disabled={addPicked.length === 0} className="flex-1 py-3 bg-rose-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest active:scale-95 disabled:opacity-50 shadow-md">
                {t('coachDashboard.addToGroupConfirm', { count: addPicked.length })}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {managingGroupsFor && typeof document !== 'undefined' && createPortal(
         <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[500000] flex items-center justify-center p-4 animate-fade-in" onClick={() => setManagingGroupsFor(null)}>
           <div className="bg-white rounded-[32px] p-6 w-full max-w-[320px] shadow-2xl relative" onClick={e => e.stopPropagation()}>
             <h2 className="text-lg font-black text-[#0a3a2a] mb-1">{t('coachDashboard.manageGroupsTitle')}</h2>
             <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">{t('coachDashboard.manageGroupsDesc')}</p>
             <p className="text-[10px] font-black text-[#0a3a2a] mb-5 truncate">{namesOf(managingGroupsFor)}</p>

             <div className="space-y-2 mb-6">
               {coachGroups.map(g => {
                 // Kilku uczniów: w grupie wszyscy (✓), część (–) albo nikt.
                 const inCount = managingGroupsFor.filter(id => (studentGroupMap[id] || []).includes(g.id)).length;
                 const isAssigned = inCount === managingGroupsFor.length;
                 const isPartial = inCount > 0 && !isAssigned;
                 return (
                   <button
                     key={g.id}
                     onClick={() => toggleGroupForSelected(g.id)}
                     className={`w-full flex items-center justify-between p-4 rounded-xl border transition-all active:scale-[0.98] ${
                       isAssigned || isPartial ? 'bg-rose-50 border-rose-200' : 'bg-white border-gray-200'
                     }`}
                   >
                     <span className={`text-[12px] font-black ${isAssigned || isPartial ? 'text-[#0a3a2a]' : 'text-gray-600'}`}>{g.name}</span>
                     <div className={`w-6 h-6 rounded flex items-center justify-center ${
                       isAssigned ? 'bg-rose-600 text-white' : isPartial ? 'bg-rose-200 text-[#0a3a2a]' : 'bg-gray-100 text-transparent'
                     }`}>
                        {/* „–" jako tekst: ikony `remove` nie ma w subsecie fontu */}
                        {isPartial
                          ? <span className="text-[14px] font-black leading-none">–</span>
                          : <span className="material-symbols-outlined text-[14px] font-black">check</span>}
                     </div>
                   </button>
                 )
               })}
             </div>
             <button onClick={() => setManagingGroupsFor(null)} className="w-full py-4 bg-[#0a3a2a] text-white rounded-xl font-black text-[10px] uppercase tracking-widest active:scale-95 shadow-lg">{t('coachDashboard.done')}</button>
           </div>
         </div>,
         document.body
      )}

      {isMessageModalOpen && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[500000] flex items-center justify-center p-4 animate-fade-in" onClick={closeMessageModal}>
          <div className="bg-white rounded-[32px] p-6 w-full max-w-[340px] shadow-2xl relative" onClick={e => e.stopPropagation()}>
             <div className="flex justify-between items-center mb-5">
               <div className="flex items-center gap-2">
                 <div className="w-8 h-8 bg-rose-50 text-rose-600 rounded-full flex items-center justify-center">
                    <span className="material-symbols-outlined text-[16px]">campaign</span>
                 </div>
                 <h2 className="text-lg font-black text-[#0a3a2a] leading-none">{t('coachDashboard.messageTitle')}</h2>
               </div>
               <button onClick={closeMessageModal} className="w-8 h-8 bg-gray-50 text-gray-500 rounded-full flex items-center justify-center active:scale-90 transition-all">
                  <span className="material-symbols-outlined text-sm">close</span>
               </button>
             </div>

             <p className="text-[10px] font-bold text-gray-400 uppercase mb-4 pl-1">{t('coachDashboard.recipients')} <span className="text-[#0a3a2a] font-black">{messageGroupName !== null && <>{messageGroupName} · </>}{t('coachDashboard.recipientsCount', { count: selectedStudents.length })}</span></p>

             <div className="space-y-3">
               <input 
                 type="text"
                 placeholder={t('coachDashboard.titlePlaceholder')}
                 value={msgTitle} 
                 onChange={e => setMsgTitle(e.target.value)} 
                 className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-[12px] font-black outline-none focus:border-rose-500 transition-colors text-[#333]" 
               />
               <textarea 
                 placeholder={t('coachDashboard.contentPlaceholder')}
                 value={msgContent} 
                 onChange={e => setMsgContent(e.target.value)} 
                 className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-[12px] font-medium h-32 resize-none outline-none focus:border-rose-500 transition-colors text-[#333]" 
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

      {studentsToDelete && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[500000] flex items-center justify-center p-4 animate-fade-in" onClick={() => setStudentsToDelete(null)}>
          <div className="bg-white rounded-[32px] p-6 w-full max-w-[320px] shadow-2xl relative text-center" onClick={e => e.stopPropagation()}>
            
            <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4 border border-red-100">
              <span className="material-symbols-outlined text-3xl">person_remove</span>
            </div>
            
            <h2 className="text-xl font-black text-[#0a3a2a] mb-1">{t('coachDashboard.deleteTitle')}</h2>
            {/* Kogo dokładnie — przy kilku zaznaczonych łatwo o pomyłkę */}
            <p className="text-[11px] font-black text-red-500 mb-2 px-2 break-words">{namesOf(studentsToDelete)}</p>

            <p className="text-[11px] font-bold text-gray-500 mb-6 leading-relaxed px-2">
              {t('coachDashboard.deleteDescPre')} <span className="text-red-500 font-black text-sm">0</span>{t('coachDashboard.deleteDescPost')}
            </p>
            
            <div className="flex gap-3 justify-center mb-6">
              <button 
                onClick={() => setStudentsToDelete(null)} 
                className="w-14 h-14 bg-gray-100 text-gray-500 rounded-2xl font-black text-xl active:scale-90 transition-all border border-gray-200"
              >
                8
              </button>
              <button 
                onClick={() => confirmRemoveStudents(studentsToDelete)}
                className="w-14 h-14 bg-red-50 text-red-500 rounded-2xl font-black text-xl active:scale-90 transition-all border border-red-200 shadow-md shadow-red-500/20"
              >
                0
              </button>
              <button 
                onClick={() => setStudentsToDelete(null)} 
                className="w-14 h-14 bg-gray-100 text-gray-500 rounded-2xl font-black text-xl active:scale-90 transition-all border border-gray-200"
              >
                4
              </button>
            </div>
            
            <button 
              onClick={() => setStudentsToDelete(null)} 
              className="w-full py-4 bg-gray-50 text-gray-400 rounded-xl font-black uppercase text-[10px] tracking-widest active:scale-95 transition-all hover:bg-gray-100 border border-gray-100"
            >
              {t('coachDashboard.cancelOp')}
            </button>
            
          </div>
        </div>,
        document.body
      )}

      {scheduleGroupId && typeof document !== 'undefined' && (() => {
        const group = coachGroups.find(g => g.id === scheduleGroupId);
        if (!group) return null;
        // Kolejność od poniedziałku; podpis z kalendarza (1.11.2026 = niedziela).
        const weekDays = [1, 2, 3, 4, 5, 6, 0];
        const canSave = schedSlots.length > 0 && schedSlots.every(x => /^\d{1,2}:\d{2}$/.test(x.time));
        const setSlot = (i: number, patch: Partial<ScheduleSlot>) =>
          setSchedSlots(prev => prev.map((x, j) => (j === i ? { ...x, ...patch } : x)));
        return createPortal(
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[500000] flex items-end sm:items-center justify-center p-4 animate-fade-in" onClick={() => setScheduleGroupId(null)}>
            <div className="bg-white rounded-[32px] p-6 w-full max-w-[360px] shadow-2xl relative max-h-[90vh] overflow-y-auto hide-scrollbar" onClick={e => e.stopPropagation()}>
              <h2 className="text-lg font-black text-[#0a3a2a] leading-tight">{t('coachSchedule.title')}</h2>
              <p className="text-[13px] font-bold text-gray-500 mb-4">{group.name}</p>

              {/* Każdy termin osobno: dzień + godzina (user 2026-10-26: „sobota 12, środa 18”). */}
              <p className="text-[12px] font-black text-gray-500 mb-2">{t('coachSchedule.days')}</p>
              <div className="space-y-3 mb-2">
                {schedSlots.map((slot, i) => (
                  <div key={i} className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <select
                      value={slot.day}
                      onChange={e => setSlot(i, { day: Number(e.target.value) })}
                      aria-label={t('coachSchedule.days')}
                      className="flex-1 min-w-0 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-[15px] font-black text-[#0a3a2a] outline-none focus:border-rose-500"
                    >
                      {weekDays.map(d => (
                        <option key={d} value={d}>{new Date(2026, 10, 1 + d).toLocaleDateString(i18n.language, { weekday: 'long' })}</option>
                      ))}
                    </select>
                    <input
                      type="time"
                      value={slot.time}
                      onChange={e => setSlot(i, { time: e.target.value })}
                      aria-label={t('coachSchedule.time')}
                      className="w-[104px] shrink-0 bg-gray-50 border border-gray-200 rounded-xl px-2 py-2.5 text-[15px] font-black text-[#0a3a2a] outline-none focus:border-rose-500"
                    />
                    <button
                      type="button"
                      onClick={() => setSchedSlots(prev => prev.filter((_, j) => j !== i))}
                      disabled={schedSlots.length === 1}
                      aria-label={t('coachSchedule.removeSlot')}
                      className="w-9 h-9 shrink-0 rounded-full flex items-center justify-center text-gray-400 active:scale-90 transition-all disabled:opacity-30"
                    >
                      <span className="material-symbols-outlined text-[20px]">close</span>
                    </button>
                  </div>
                  {/* Miejsce tego terminu — w różne dni może być inne. */}
                  <div className="flex items-center gap-2 pr-11">
                    <span className="material-symbols-outlined text-[18px] text-gray-400 shrink-0">location_on</span>
                    <input
                      type="text"
                      value={slot.place || ''}
                      maxLength={40}
                      placeholder={t('coachSchedule.placeHint')}
                      aria-label={t('coachSchedule.place')}
                      onChange={e => setSlot(i, { place: e.target.value })}
                      className="flex-1 min-w-0 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-[14px] font-bold text-[#333] outline-none focus:border-rose-500"
                    />
                  </div>
                  </div>
                ))}
              </div>
              {schedSlots.length < 7 && (
                <button
                  type="button"
                  onClick={() => setSchedSlots(prev => [...prev, { day: prev[prev.length - 1]?.day ?? 3, time: prev[prev.length - 1]?.time || '18:00', place: prev[prev.length - 1]?.place }])}
                  className="w-full mb-4 py-2 rounded-xl border border-dashed border-rose-200 text-[13px] font-black text-rose-600 flex items-center justify-center gap-1 active:scale-95 transition-all"
                >
                  <span className="material-symbols-outlined text-[18px]">add</span>
                  {t('coachSchedule.addSlot')}
                </button>
              )}

              <p className="text-[12px] font-black text-gray-500 mb-2">{t('coachSchedule.interval')}</p>
              <div className="flex gap-2 mb-4">
                {([1, 2] as const).map(n => (
                  <button
                    key={n}
                    type="button"
                    aria-pressed={schedEvery === n}
                    onClick={() => setSchedEvery(n)}
                    className={`flex-1 py-2.5 rounded-xl text-[13px] font-black transition-all ${schedEvery === n ? 'bg-rose-600 text-white' : 'bg-gray-50 text-gray-500 border border-gray-200'}`}
                  >
                    {t(n === 2 ? 'coachSchedule.every2' : 'coachSchedule.every1')}
                  </button>
                ))}
              </div>


              <div className="flex gap-2">
                <button onClick={() => setScheduleGroupId(null)} className="flex-1 py-3 bg-gray-100 text-gray-500 rounded-xl font-black text-[11px] uppercase tracking-widest active:scale-95">{t('coachDashboard.cancel')}</button>
                <button onClick={() => saveSchedule()} disabled={!canSave} className="flex-1 py-3 bg-rose-600 text-white rounded-xl font-black text-[11px] uppercase tracking-widest active:scale-95 disabled:opacity-50 shadow-md">{t('coachSchedule.save')}</button>
              </div>
              {group.schedule && (
                <button onClick={() => saveSchedule(true)} className="w-full mt-3 py-2 text-[12px] font-black text-red-500 active:scale-95">{t('coachSchedule.remove')}</button>
              )}
            </div>
          </div>,
          document.body
        );
      })()}

      {editingGroup && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[500000] flex items-center justify-center p-4 animate-fade-in" onClick={() => setEditingGroup(null)}>
          <div className="bg-white rounded-[32px] p-6 w-full max-w-[320px] shadow-2xl relative" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-black text-[#0a3a2a] mb-4">{t('coachDashboard.editGroupTitle')}</h2>
            <input
              type="text"
              value={editGroupName}
              onChange={e => setEditGroupName(e.target.value)}
              maxLength={15}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl p-4 text-[12px] font-black outline-none focus:border-rose-500 mb-4 text-[#333]"
            />
            <GroupIconPicker value={editGroupIcon} onChange={setEditGroupIcon} />
            <div className="flex gap-2">
              <button onClick={() => setEditingGroup(null)} className="flex-1 py-3 bg-gray-100 text-gray-500 rounded-xl font-black text-[10px] uppercase tracking-widest active:scale-95">{t('coachDashboard.cancel')}</button>
              <button onClick={handleEditGroup} disabled={!editGroupName.trim()} className="flex-1 py-3 bg-rose-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest active:scale-95 disabled:opacity-50 shadow-md">{t('coachDashboard.editGroupBtn')}</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Usunięcie grupy — to samo zabezpieczenie „wybierz 0", co przy
          usuwaniu ucznia (życzenie usera 2026-09-10: jedno kliknięcie było za
          łatwe, a grupa zabiera ze sobą dziennik i przypisania). */}
      {confirmDeleteGroup && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[500000] flex items-center justify-center p-4 animate-fade-in" onClick={() => setConfirmDeleteGroup(null)}>
          <div className="bg-white rounded-[32px] p-6 w-full max-w-[320px] shadow-2xl relative text-center" onClick={e => e.stopPropagation()}>
            <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4 border border-red-100">
              <span className="material-symbols-outlined text-3xl">delete_forever</span>
            </div>
            <h2 className="text-xl font-black text-[#0a3a2a] mb-1">{t('coachDashboard.deleteGroupTitle')}</h2>
            <p className="text-[12px] font-black text-red-500 mb-2 px-2 break-words">{coachGroups.find(g => g.id === confirmDeleteGroup)?.name}</p>
            <p className="text-[11px] font-bold text-gray-500 mb-3 leading-relaxed px-2">{t('coachDashboard.deleteGroupDesc')}</p>
            <p className="text-[11px] font-bold text-gray-500 mb-5 leading-relaxed px-2">
              {t('coachDashboard.deleteDescPre')} <span className="text-red-500 font-black text-sm">0</span>{t('coachDashboard.deleteDescPost')}
            </p>

            <div className="flex gap-3 justify-center mb-6">
              <button
                onClick={() => setConfirmDeleteGroup(null)}
                className="w-14 h-14 bg-gray-100 text-gray-500 rounded-2xl font-black text-xl active:scale-90 transition-all border border-gray-200"
              >
                8
              </button>
              <button
                onClick={() => handleDeleteGroup(confirmDeleteGroup)}
                className="w-14 h-14 bg-red-50 text-red-500 rounded-2xl font-black text-xl active:scale-90 transition-all border border-red-200 shadow-md shadow-red-500/20"
              >
                0
              </button>
              <button
                onClick={() => setConfirmDeleteGroup(null)}
                className="w-14 h-14 bg-gray-100 text-gray-500 rounded-2xl font-black text-xl active:scale-90 transition-all border border-gray-200"
              >
                4
              </button>
            </div>

            <button
              onClick={() => setConfirmDeleteGroup(null)}
              className="w-full py-4 bg-gray-50 text-gray-400 rounded-xl font-black uppercase text-[10px] tracking-widest active:scale-95 transition-all hover:bg-gray-100 border border-gray-100"
            >
              {t('coachDashboard.cancelOp')}
            </button>
          </div>
        </div>,
        document.body
      )}

      {sheetStudentId && (() => {
        const st = students.find((x: any) => x.id === sheetStudentId);
        if (!st) return null;
        const last = st.exactLastActivity || 0;
        const subtitle = [
          formatViewerAgeCategory(st.ageCategory, st.ageCategoryPL, i18n.language, t),
          last > 0 ? [getTimeSinceLastActivity(last), lastSessionDetails(st)].filter(Boolean).join(' · ') : t('coachDashboard.noTrainings'),
        ].filter(Boolean).join(' · ');
        return (
          <CoachStudentSheet
            student={st}
            coachId={userId}
            subtitle={subtitle}
            focusState={studentFocus[st.id]}
            milestones={studentMilestones.filter(m => m.student.id === st.id && m.ts >= Date.now() - 14 * 24 * 60 * 60 * 1000)}
            pause={pauseOf(st)}
            pauseReminder={pauseReminderDue(st)}
            onStartPause={() => setPause(st.id, { at: Date.now() })}
            onEndPause={() => setPause(st.id, null)}
            onKeepPause={() => { const p = pauseOf(st); if (p) setPause(st.id, { ...p, reminded: true }); }}
            onClose={() => setSheetStudentId(null)}
            onOpenProfile={() => { setSheetStudentId(null); handleCheckStudent(st.id); }}
            onOpenChat={() => { setSheetStudentId(null); setOpenMessageStudentId(st.id); }}
          />
        );
      })()}

      {openMessageStudentId && (() => {
        const student = students.find(s => s.id === openMessageStudentId);
        if (!student) return null;
        const name = `${student.firstName || ''} ${student.lastName || ''}`.trim() || 'Uczeń';
        return (
          <StudentMessageSheet
            coachId={userId}
            studentId={openMessageStudentId}
            currentUserId={userId}
            mode="coach"
            otherName={name}
            onClose={() => {
              setOpenMessageStudentId(null);
              setUnreadStudentIds(prev => {
                const next = new Set(prev);
                next.delete(openMessageStudentId);
                return next;
              });
            }}
          />
        );
      })()}

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