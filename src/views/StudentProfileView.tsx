import React, { useState, useEffect, useRef } from 'react';
import { isPartialSession, partialLabel, roundSizeFor } from '../utils/partialSession';
import { db } from '../firebase';
import { getRecentSessions } from '../lib/recentSessions';
import { doc, getDoc, collection, query, where, orderBy, limit, getDocs, updateDoc, startAfter, Timestamp, type QueryDocumentSnapshot } from 'firebase/firestore';
import { useTranslation } from 'react-i18next';
import { createPortal } from 'react-dom';
import ProStatsView from '../components/ProStatsView';
import TournamentRecordsView from '../components/TournamentRecordsView';
import { hasActivePro, freeAnalysisOpen, freeHistoryStart, FREE_HISTORY_DAYS, FREE_ANALYSIS_HOURS } from '../utils/proAccess';
import LockedCard from '../components/scoring/LockedCard';
import QuickStatsModal from '../components/QuickStatsModal';
import ViewHeader from '../components/ViewHeader';
import { CoachLogComposer, deleteCoachLogEntry, loadCoachPrivateNotes, deleteCoachPrivateNote, migrateLegacyPrivateNotes, type CoachPrivateNote } from '../components/CoachLogPanel';
import { loadSharedNotes, SharedNoteCard, type SharedNote } from '../components/StudentSharedNotes';
import CoachFocusModal from '../components/CoachFocusModal';
import SessionBilanz from '../components/scoring/SessionBilanz';
import TrendCard from '../components/scoring/TrendCard';
import TargetCard from '../components/scoring/TargetCard';
import SummaryCard from '../components/scoring/SummaryCard';
import { distanceMeters } from '../config/distances';
import { BLOWGUN_DISCIPLINE } from '../config/equipmentSetups';
import FocusResultChip, { isFocusResult } from '../components/scoring/FocusResultChip';
import { useVoiceInput } from '../hooks/useVoiceInput';
import { createNotification } from '../services/notificationService';
import { buildCoachNoteNotification } from '../utils/notificationTypes';
import TopicPicker from '../components/TopicPicker';
import StudentEquipmentCard from '../components/StudentEquipmentCard';
import { isKnownTopic, topicLabel } from '../constants/trainingTopics';
import { formatViewerAgeCategory } from '../utils/privateProfile';
import { useActiveFocus } from '../utils/focus';
import { FocusStrip } from '../components/tagebuch/FocusCard';
import { CARD_SHAPE, CARD_PAD, EntryRow, distanceTier, CoachEntryCard, type TbCoachEntry } from '../components/tagebuch/TagebuchCards';
import { MIN_SESSIONS_FOR_RANK, RANK_BOW_LABEL, rankFromStored, rankTrend, rankBowOf } from '../utils/rankEngine';

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

// Znacznik czasu sesji w ms (Timestamp z Firestore, {seconds} z cache albo liczba).
const sessionMillis = (s: any): number => {
  const ts = s?.timestamp;
  return ts?.toMillis ? ts.toMillis() : ts?.seconds ? ts.seconds * 1000 : (typeof ts === 'number' ? ts : 0);
};
// Punkt na Ergebniskurve: pełny trening z wynikiem (bez technicznych i niepełnych).
const isCurveSession = (s: any) => s.type !== 'TECHNICAL' && !isPartialSession(s) && (s.arrows || 0) > 0;

// [FREE/PRO] Uczeń FREE: trener widzi treningi tylko z okna FREE_HISTORY_DAYS.
const inFreeWindow = (list: any[], student: any): any[] => {
  if (hasActivePro(student)) return list;
  const start = freeHistoryStart().getTime();
  return list.filter(s => sessionMillis(s) >= start);
};

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

// Kto widzi wpis / komentarz (user 2026-10-30: „nie wiem, czy widzi to uczeń”).
function SeenBy({ name, onlyMe = false }: { name: string; onlyMe?: boolean }) {
  const { t } = useTranslation();
  return (
    <p className={`flex items-center gap-1 mt-1.5 text-[9px] font-black uppercase tracking-widest ${onlyMe ? 'text-indigo-500' : 'text-gray-400'}`}>
      <span className="material-symbols-outlined text-[13px]">{onlyMe ? 'lock' : 'visibility'}</span>
      {onlyMe ? t('studentProfile.seenOnlyYou') : t('studentProfile.seenByStudent', { name })}
    </p>
  );
}

// --- MIKRO-KOMPONENT NOTATKI TRENERA W SESJI ---
function CoachNoteModule({ session, studentId, coachId, onSaveSuccess, studentName = '' }: { session: any, studentId: string, coachId: string, onSaveSuccess: (note: string, editCount: number) => void, studentName?: string }) {
  const { t } = useTranslation();
  const edits = session.coachEditCount || 0;
  const canEdit = edits < 2;

  const [isEditing, setIsEditing] = useState(!session.coachNote && canEdit);
  const [text, setText] = useState(session.coachNote || '');
  const [coachTopics, setCoachTopics] = useState<string[]>(session.coachTopics || []);
  const [isSaving, setIsSaving] = useState(false);
  const voice = useVoiceInput({
    onResult: (result) => setText((prev: string) => (prev + ' ' + result).trim().slice(0, 100)),
    append: true,
  });

  useEffect(() => {
    setText(session.coachNote || '');
    setCoachTopics(session.coachTopics || []);
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
        coachEditCount: newEditCount,
        coachTopics,
      });
      setIsEditing(false);
      onSaveSuccess(cleanText, newEditCount);

      // Bell notification at student — only on first save (edits === 0),
      // since createNotification is idempotent and we don't want notification
      // re-firing on edits (student already saw the original note).
      if (edits === 0) {
        (async () => {
          let coachName: string | undefined;
          try {
            const cSnap = await getDoc(doc(db, 'users', coachId));
            if (cSnap.exists()) {
              const cd = cSnap.data();
              coachName = [cd.firstName, cd.lastName].filter(Boolean).join(' ') || undefined;
            }
          } catch { /* ignore */ }

          const { id, payload } = buildCoachNoteNotification({
            sessionId: session.id,
            sessionDate: session.date,
            coachId,
            coachName,
          });
          createNotification(studentId, id, payload).catch(() => { /* best effort */ });
        })();
      }
    } catch (e) {
      console.error("Błąd zapisu notatki", e);
    }
    setIsSaving(false);
  };

  return (
    <div className="bg-blue-50/50 border border-blue-100 rounded-xl p-3 relative mt-2">
       <div className="flex justify-between items-start gap-2 mb-1.5">
         <span className="text-[9px] font-black text-blue-700 uppercase tracking-widest flex items-start gap-1 leading-tight">
            <span className="material-symbols-outlined text-[14px] shrink-0">sports</span>
            <span>
              {session.date ? t('studentProfile.coachNoteLabel', { date: session.date }) : t('studentProfile.coachNoteLabelNoDate', { defaultValue: 'Deine Anmerkungen' })} {canEdit && !isEditing ? t('studentProfile.coachNoteEdits', { count: 2 - edits }) : ''}
            </span>
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
           <div className="mt-2">
             <TopicPicker selectedTopics={coachTopics} onChange={setCoachTopics} />
           </div>
           <div className="flex justify-between items-center mt-2">
             <div className="flex items-center gap-2">
               <span className="text-[9px] font-bold text-blue-400/70">{text.length}/100</span>
               {voice.error && <span className="text-[8px] font-bold text-red-500">{voice.error}</span>}
             </div>
             <div className="flex gap-2">
                {session.coachNote && (
                  <button onClick={() => { setIsEditing(false); setText(session.coachNote); setCoachTopics(session.coachTopics || []); }} className="text-[9px] font-black text-gray-400 uppercase tracking-widest px-2">{t('studentProfile.coachNoteCancel')}</button>
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
         <>
           <p className="text-[11px] text-[#0a3a2a] font-bold italic leading-snug">
             {session.coachNote ? `"${session.coachNote}"` : <span className="text-blue-600/50 font-medium">{t('studentProfile.coachNoteEmpty')}</span>}
           </p>
           {session.coachNote && studentName && <SeenBy name={studentName} />}
           {coachTopics.length > 0 && (
             <div className="flex flex-wrap gap-1 mt-2">
               {coachTopics.filter(isKnownTopic).map(id => (
                 <span key={id} className="bg-blue-50 text-blue-700 border border-blue-100 px-2 py-0.5 rounded-full text-[9px] font-black">
                   {topicLabel(id, t)}
                 </span>
               ))}
             </div>
           )}
         </>
       )}
    </div>
  );
}

// --- SZCZEGÓŁY TRENINGU ---
// Wspólne dla karuzeli w „Aktuell” i listy „Trainings” (profil B, etap 2):
// liczby treningu, rozwijane Bilanz → Trend → Trefferbild, notatka ucznia
// i notatka trenera. Trening techniczny: liczba strzał + notatki.
// [FREE/PRO] Trener widzi to samo co uczeń (user 2026-10-30): uczeń PRO (też trial)
// — wszystko; uczeń FREE — analiza treningu tylko 24 h od zapisu, jak w jego Statystykach.
function SessionDetail({ session, studentId, coachId, onNoteSaved, pro, studentName }: { session: any; studentId: string; coachId: string; onNoteSaved: (note: string, editCount: number) => void; pro: boolean; studentName: string }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [showLockHint, setShowLockHint] = useState(false);
  const [highlightedEnd, setHighlightedEnd] = useState<number | null>(null);
  const isTech = session.type === 'TECHNICAL';
  const ends: any[] = session.ends || [];
  const hits = calculateHits(ends);
  const avg = session.arrows > 0 ? (session.score / session.arrows).toFixed(2) : '0.00';
  const roundSize = roundSizeFor(session);
  // Jak w StatsView: tarcza z dystansu, gdy sesja ma tylko „Full”; podpowiedź celownika recurve/compound.
  const targetType = session.targetType && session.targetType !== 'Full'
    ? session.targetType
    : distanceMeters(session.distance) === 18 ? '3-Spot' : 'Full';
  const hasSight = session.bowClass !== BLOWGUN_DISCIPLINE && ['RECURVE', 'COMPOUND'].includes(rankBowOf(session.bowClass));
  const ms = sessionMillis(session);
  const analysisOpen = pro || freeAnalysisOpen(ms);

  return (
    <>
      {isTech ? (
        <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
          <span className="bg-sky-50 text-sky-700 px-2.5 py-0.5 rounded-full text-[10px] font-black">
            {session.totalArrows || session.arrows || 0} {t('common.arrows')}
          </span>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-5 text-center pt-2 border-t border-gray-100">
            <div><p className="text-[8px] font-black text-gray-400 uppercase tracking-widest">{t('studentProfile.statsScore')}</p><p className="text-sm font-black text-[#0a3a2a] tabular-nums">{session.score}{isPartialSession(session) && <span className="block text-[8px] font-black text-amber-700">{partialLabel(session)}</span>}</p></div>
            <div><p className="text-[8px] font-black text-gray-400 uppercase tracking-widest">{t('studentProfile.statsAvg')}</p><p className="text-sm font-black text-[#0a3a2a] tabular-nums">{avg}</p></div>
            <div className="border-l border-gray-100"><p className="text-[8px] font-black text-[#b8860b] uppercase tracking-widest">{t('studentProfile.statsInnerX')}</p><p className="text-sm font-black text-[#0a3a2a] tabular-nums">{hits.x}</p></div>
            <div><p className="text-[8px] font-black text-emerald-600 uppercase tracking-widest">10</p><p className="text-sm font-black text-[#0a3a2a] tabular-nums">{hits.ten}</p></div>
            <div><p className="text-[8px] font-black text-gray-400 uppercase tracking-widest">9</p><p className="text-sm font-black text-[#0a3a2a] tabular-nums">{hits.nine}</p></div>
          </div>
          {ends.length > 0 && !analysisOpen && (
            <>
              <LockedCard icon="analytics" kind={t('studentProfile.showDetailedStats')} stripe="tb-skipped" onUnlock={() => setShowLockHint(v => !v)} />
              {showLockHint && (
                <p className="text-[10px] font-bold text-gray-500 leading-snug px-1 tb-fade-in">{t('studentProfile.freeAnalysisHint', { name: studentName, hours: FREE_ANALYSIS_HOURS })}</p>
              )}
            </>
          )}
          {ends.length > 0 && analysisOpen && (
            <button
              onClick={() => { setHighlightedEnd(null); setOpen(o => !o); }}
              className="w-full flex items-center justify-between px-2.5 py-2 bg-gray-50 border border-gray-100 rounded-xl active:scale-[0.98] transition-all"
            >
              <span className="flex items-center gap-2">
                <span className="material-symbols-outlined text-emerald-600 text-[16px]">analytics</span>
                <span className="text-[9px] font-black uppercase tracking-widest text-[#0a3a2a]">
                  {open ? t('studentProfile.hideDetailedStats') : t('studentProfile.showDetailedStats')}
                </span>
              </span>
              <span className={`material-symbols-outlined text-[18px] text-gray-400 transition-transform duration-300 ${open ? 'rotate-180' : ''}`}>
                keyboard_arrow_down
              </span>
            </button>
          )}
          {open && analysisOpen && ends.length > 0 && (
            <div className="space-y-3 tb-fade-in">
              {/* [FOKUS UMGESETZT] Samoocena ucznia przy zapisie (trener 2026-10-29). */}
              {isFocusResult(session.focusResult) && <FocusResultChip value={session.focusResult} />}
              {/* [PODSUMOWANIE] Ten sam układ co po treningu i w Statystykach (2026-10-30). */}
              <SessionBilanz
                userId={studentId}
                ends={ends}
                roundSize={roundSize}
                distance={session.distance || ''}
                distanceId={session.distanceId}
                targetType={targetType}
                bowClass={session.bowClass}
                sessionId={session.id}
                beforeTs={ms || undefined}
              />
              <TrendCard ends={ends} highlighted={highlightedEnd} onPick={setHighlightedEnd} roundSize={roundSize} arrowColors={!!session.arrowColors} storageKey="coach-trend" />
              <TargetCard
                ends={ends}
                roundSize={roundSize}
                targetType={targetType}
                arrowColors={!!session.arrowColors}
                highlightedEnd={highlightedEnd}
                sightHint={hasSight}
                heatmap
                storageKey="coach-target"
              />
            </div>
          )}
        </>
      )}
      <div className="bg-gray-50 p-2.5 rounded-xl border border-gray-100">
        <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">{t('studentProfile.studentNoteLabel')}</p>
        <p className="text-[11px] font-bold text-[#333] italic leading-snug">{(session.isNotePublic !== false && session.note) || t('studentProfile.noStudentNote')}</p>
      </div>
      <CoachNoteModule session={session} studentId={studentId} coachId={coachId} onSaveSuccess={onNoteSaved} studentName={studentName} />
    </>
  );
}

// --- ZAKŁADKA „TAGEBUCH” — WSPÓLNA OŚ CZASU ---
// [PROFIL B — 2026-10-30] Trainings i dziennik trenera połączone (user): treningi
// (z technicznymi), wpisy trenera i wpisy udostępnione przez ucznia na jednej osi,
// od najnowszego, z nagłówkami miesięcy — jak dziennik ucznia, te same karty.
// Odczyty porcjami po datach: 20 treningów, do tego wpisy trenera z tego samego
// okresu (zapytanie z zakresem createdAt); „Mehr laden” = następny okres.
// Udostępnione wpisy ucznia: jedno zapytanie (≤ 50), dzielone na okresy w pamięci.
// [FREE/PRO] Uczeń FREE: treningi i jego wpisy tylko z FREE_HISTORY_DAYS;
// wpisy trenera zawsze bez okna (zasada „treści od trenera bez okna”).
const TIMELINE_PAGE = 20;

type TimelineFilter = 'all' | 'trainings' | 'notes';
type CoachLogItem = TbCoachEntry & { authorId: string };

const toMillisAny = (v: any): number =>
  v?.toMillis ? v.toMillis() : v?.seconds ? v.seconds * 1000 : (typeof v === 'number' ? v : 0);

function StudentTimeline({ studentId, coachId, pro, studentName, onCoachLogChange, focusSessionId }: {
  studentId: string;
  coachId: string;
  pro: boolean;
  studentName: string;
  onCoachLogChange: () => void; // nowy/usunięty „Ziel” może zmienić fokus
  focusSessionId?: string | null; // trening kliknięty w Analytik — rozwinąć i przewinąć
}) {
  const { t, i18n } = useTranslation();
  const [sessions, setSessions] = useState<any[]>([]);
  const [coachEntries, setCoachEntries] = useState<CoachLogItem[]>([]);
  const [shared, setShared] = useState<SharedNote[]>([]);
  // [PRYWATNE NOTATKI TRENERA] wpisy „nur für dich” (users/{coach}/coachStudentNotes)
  const [privateNotes, setPrivateNotes] = useState<CoachPrivateNote[]>([]);
  const [cursor, setCursor] = useState<QueryDocumentSnapshot | null>(null);
  // Dolna granica wczytanego okresu (ms); 0 = wszystko wczytane.
  const [loadedFrom, setLoadedFrom] = useState<number>(Infinity);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [filter, setFilter] = useState<TimelineFilter>('all');
  useEffect(() => {
    if (!focusSessionId || !sessions.some(x => x.id === focusSessionId)) return;
    setFilter('all');
    setOpenId(focusSessionId);
    setTimeout(() => document.getElementById(`tl-${focusSessionId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
  }, [focusSessionId, sessions]);
  const [adding, setAdding] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const freeStart = pro ? 0 : freeHistoryStart().getTime();

  const load = async (after: QueryDocumentSnapshot | null, upper: number) => {
    setLoading(true);
    try {
      const base = collection(db, `users/${studentId}/sessions`);
      const win = pro ? [] : [where('timestamp', '>=', Timestamp.fromDate(freeHistoryStart()))];
      const snap = await getDocs(after
        ? query(base, ...win, orderBy('timestamp', 'desc'), startAfter(after), limit(TIMELINE_PAGE))
        : query(base, ...win, orderBy('timestamp', 'desc'), limit(TIMELINE_PAGE)));
      const page = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const more = snap.docs.length === TIMELINE_PAGE;
      // Okres tej porcji: do najstarszego treningu; ostatnia porcja — do początku.
      const lower = more ? sessionMillis(page[page.length - 1]) : 0;
      const log = collection(db, `users/${studentId}/coachLog`);
      const range = [
        ...(lower > 0 ? [where('createdAt', '>=', Timestamp.fromMillis(lower))] : []),
        ...(Number.isFinite(upper) ? [where('createdAt', '<', Timestamp.fromMillis(upper))] : []),
      ];
      const logSnap = await getDocs(query(log, ...range, orderBy('createdAt', 'desc')));
      const entries: CoachLogItem[] = logSnap.docs.map(d => {
        const data = d.data();
        return {
          id: d.id,
          authorId: data.authorId || '',
          authorName: data.authorName || t('coachLog.defaultCoachName', { defaultValue: 'Trainer' }),
          text: data.text || '',
          type: data.type || 'observation',
          topics: data.topics || [],
          ts: toMillisAny(data.createdAt),
        };
      });
      setSessions(prev => (after ? [...prev, ...page] : page));
      setCoachEntries(prev => (after ? [...prev, ...entries] : entries));
      setCursor(snap.docs[snap.docs.length - 1] || after);
      setLoadedFrom(lower);
      setHasMore(more);
    } catch (e) {
      console.error('Błąd wczytania osi czasu ucznia:', e);
    }
    setLoading(false);
  };

  useEffect(() => {
    setSessions([]);
    setCoachEntries([]);
    setOpenId(null);
    load(null, Infinity);
    loadSharedNotes(studentId).then(setShared).catch(e => console.error('Udostępnione wpisy ucznia:', e));
    // Stare 3 pola (mapa w profilu trenera) → wpisy na osi, raz; potem wczytanie.
    const labels = [0, 1, 2].map(i => t(`studentProfile.privateNoteLabel${i}`));
    migrateLegacyPrivateNotes(coachId, studentId, labels)
      .catch(e => console.error('Przeniesienie prywatnych notatek:', e))
      .then(() => loadCoachPrivateNotes(coachId, studentId))
      .then(setPrivateNotes)
      .catch(e => console.error('Prywatne notatki trenera:', e));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId, pro]);

  const updateNote = (id: string, note: string, editCount: number) =>
    setSessions(prev => prev.map(x => (x.id === id ? { ...x, coachNote: note, coachEditCount: editCount } : x)));

  const handleDelete = async (id: string) => {
    try {
      if (privateNotes.some(n => n.id === id)) {
        await deleteCoachPrivateNote(coachId, id);
        setPrivateNotes(prev => prev.filter(n => n.id !== id));
      } else {
        await deleteCoachLogEntry(studentId, id);
        setCoachEntries(prev => prev.filter(e => e.id !== id));
        onCoachLogChange();
      }
    } catch (e) {
      console.error('CoachLog: błąd usuwania', e);
    }
    setConfirmDelete(null);
  };

  type Item = { key: string; ts: number; kind: 'session'; sess: any } | { key: string; ts: number; kind: 'coach'; entry: CoachLogItem } | { key: string; ts: number; kind: 'shared'; note: SharedNote } | { key: string; ts: number; kind: 'private'; note: CoachPrivateNote };
  const items: Item[] = [
    ...(filter !== 'notes' ? sessions.map(sess => ({ key: `s-${sess.id}`, ts: sessionMillis(sess), kind: 'session' as const, sess })) : []),
    ...(filter !== 'trainings' ? coachEntries.map(entry => ({ key: `c-${entry.id}`, ts: entry.ts, kind: 'coach' as const, entry })) : []),
    ...(filter !== 'trainings'
      ? shared.filter(n => n.ts >= Math.max(loadedFrom, freeStart)).map(note => ({ key: `n-${note.id}`, ts: note.ts, kind: 'shared' as const, note }))
      : []),
    // Własne wpisy trenera — bez okna FREE, tylko w już wczytanym okresie.
    ...(filter !== 'trainings'
      ? privateNotes.filter(n => n.ts >= loadedFrom).map(note => ({ key: `p-${note.id}`, ts: note.ts, kind: 'private' as const, note }))
      : []),
  ].sort((a, b) => b.ts - a.ts);

  const fmtDay = (ms: number) => (ms ? new Date(ms).toLocaleDateString(i18n.language, { day: 'numeric', month: 'short' }) : '');
  const chip = (on: boolean) => `px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border transition-all ${on ? 'bg-[#0a3a2a] text-white border-[#0a3a2a]' : 'bg-white text-gray-400 border-gray-200'}`;

  let lastMonth = '';
  return (
    <div className="space-y-2">
      {/* Filtry + nowy wpis trenera */}
      <div className="flex items-center gap-1.5">
        {([['all', t('studentProfile.filterAll')], ['trainings', t('studentProfile.filterTrainings')], ['notes', t('studentProfile.filterNotes')]] as const).map(([key, label]) => (
          <button key={key} onClick={() => setFilter(key)} className={chip(filter === key)}>{label}</button>
        ))}
      </div>
      {/* Nowy wpis ogólny — pełna szerokość (długi napis nie mieści się obok filtrów). */}
      {!adding && (
        <button
          onClick={() => setAdding(true)}
          className="w-full bg-[#0a3a2a] text-[#fed33e] py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest active:scale-95 transition-all flex items-center justify-center gap-1.5"
        >
          <span className="material-symbols-outlined text-[16px]">add</span>
          {t('coachLog.addBtn', { defaultValue: 'Eintrag' })}
        </button>
      )}
      {adding && (
        <CoachLogComposer
          studentId={studentId}
          studentName={studentName}
          currentUserId={coachId}
          onCancel={() => setAdding(false)}
          onSaved={entry => { setCoachEntries(prev => [entry, ...prev]); setAdding(false); onCoachLogChange(); }}
          onSavedPrivate={note => { setPrivateNotes(prev => [note, ...prev]); setAdding(false); }}
        />
      )}

      {!loading && items.length === 0 && (
        <div className={`${CARD_SHAPE} tb-skipped ${CARD_PAD} flex items-center gap-2.5`}>
          <span className="tb-icon w-8 h-8 rounded-lg flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-[18px] text-gray-400">history_edu</span>
          </span>
          <span className="text-[11px] font-bold text-gray-500 leading-snug">{filter === 'notes' ? t('studentProfile.entriesEmpty', { name: studentName }) : t('studentProfile.noSessions', { defaultValue: 'Noch keine Trainingseinheiten' })}</span>
        </div>
      )}

      {items.map(item => {
        const month = item.ts ? new Date(item.ts).toLocaleDateString(i18n.language, { month: 'long', year: 'numeric' }) : '';
        const showMonth = month !== lastMonth;
        lastMonth = month;
        const header = showMonth && month ? <p className="pt-2 px-1 text-[10px] font-black uppercase tracking-widest text-gray-400">{month}</p> : null;

        if (item.kind === 'coach') {
          const own = item.entry.authorId === coachId;
          return (
            <React.Fragment key={item.key}>
              {header}
              <div className="relative">
                <CoachEntryCard entry={item.entry} time={fmtDay(item.ts)} isNew={false} footer={<SeenBy name={studentName} />} />
                {own && (
                  <button onClick={() => setConfirmDelete(item.entry.id)} className="absolute right-2 bottom-2 p-1 text-gray-300 active:text-red-500" aria-label={t('coachLog.delete', { defaultValue: 'Löschen' })}>
                    <span className="material-symbols-outlined text-[16px]">delete</span>
                  </button>
                )}
              </div>
            </React.Fragment>
          );
        }
        if (item.kind === 'private') {
          const n = item.note;
          return (
            <React.Fragment key={item.key}>
              {header}
              <div className={`${CARD_SHAPE} tb-private ${CARD_PAD} relative`}>
                <EntryRow
                  icon="lock"
                  iconCls="text-indigo-500"
                  kind={t('studentProfile.privateKind')}
                  kindCls="text-indigo-600"
                  title={n.title || undefined}
                  time={fmtDay(item.ts)}
                >
                  <p className="text-[12px] font-medium text-gray-700 leading-relaxed whitespace-pre-wrap break-words mt-1 pr-6">{n.text}</p>
                  {n.topics.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {n.topics.map(id => (
                        <span key={id} className="border px-2 py-0.5 rounded-full text-[9px] font-black bg-indigo-50 text-indigo-600 border-indigo-100">{topicLabel(id, t)}</span>
                      ))}
                    </div>
                  )}
                  <SeenBy name={studentName} onlyMe />
                </EntryRow>
                <button onClick={() => setConfirmDelete(n.id)} className="absolute right-2 bottom-2 p-1 text-gray-300 active:text-red-500" aria-label={t('coachLog.delete', { defaultValue: 'Löschen' })}>
                  <span className="material-symbols-outlined text-[16px]">delete</span>
                </button>
              </div>
            </React.Fragment>
          );
        }
        if (item.kind === 'shared') {
          return (
            <React.Fragment key={item.key}>
              {header}
              <SharedNoteCard note={item.note} time={fmtDay(item.ts)} />
            </React.Fragment>
          );
        }

        const sess = item.sess;
        const isTech = sess.type === 'TECHNICAL';
        const isTourney = sess.type === 'Turniej';
        const stripe = isTech ? 'tb-tech' : isTourney ? 'tb-tourney' : distanceTier(distanceMeters(sess.distance) || 0);
        const open = openId === sess.id;
        const hasStudentNote = sess.isNotePublic !== false && !!sess.note;
        return (
          <React.Fragment key={item.key}>
            {header}
            <div id={`tl-${sess.id}`} className={`${CARD_SHAPE} ${stripe} ${CARD_PAD} scroll-mt-3`}>
              <button onClick={() => setOpenId(open ? null : sess.id)} className="w-full text-left active:opacity-60" aria-expanded={open}>
                <EntryRow
                  icon={isTech ? 'fitness_center' : isTourney ? 'emoji_events' : 'target'}
                  iconCls={isTech ? 'text-sky-500' : isTourney ? 'text-[#0a3a2a]' : 'text-emerald-600'}
                  kind={isTech ? t('stats.techSessionType') : isTourney ? t('stats.sessionInfo.tournament') : t('stats.sessionInfo.solo')}
                  kindCls={isTech ? 'text-sky-600' : 'text-emerald-700'}
                  title={isTech
                    ? `${sess.totalArrows || sess.arrows || 0} ${t('common.arrows')}`
                    : <>{sess.score || 0}{isTourney && (sess.tournamentName || sess.title) ? <span className="font-bold text-gray-500"> · {sess.tournamentName || sess.title}</span> : null}</>}
                  meta={<>{!isTech && sess.distance ? sess.distance : ''}{isPartialSession(sess) && <span className="ml-1.5 text-amber-700">{partialLabel(sess)}</span>}</>}
                  time={fmtDay(item.ts)}
                  extra={
                    <span className="flex items-center gap-1 shrink-0">
                      {hasStudentNote && <span className="material-symbols-outlined text-[15px] text-gray-400">chat</span>}
                      {sess.coachNote && <span className="material-symbols-outlined text-[15px] text-amber-500">sports</span>}
                      <span className={`material-symbols-outlined text-[18px] text-gray-400 transition-transform duration-300 ${open ? 'rotate-180' : ''}`}>expand_more</span>
                    </span>
                  }
                />
              </button>
              {open && (
                <div className="mt-2 space-y-2.5 tb-fade-in">
                  <SessionDetail session={sess} studentId={studentId} coachId={coachId} onNoteSaved={(n, c) => updateNote(sess.id, n, c)} pro={pro} studentName={studentName} />
                </div>
              )}
            </div>
          </React.Fragment>
        );
      })}

      {(loading || hasMore) && (
        <button
          onClick={() => !loading && load(cursor, loadedFrom)}
          disabled={loading}
          className="w-full py-3 rounded-2xl bg-gray-50 border border-gray-100 text-[10px] font-black uppercase tracking-widest text-[#0a3a2a] active:scale-95 transition-all disabled:opacity-50"
        >
          {loading ? t('studentProfile.loading') : t('studentProfile.loadMore')}
        </button>
      )}
      {!pro && !loading && !hasMore && (
        <p className="flex items-start gap-1.5 px-1 pt-1 text-[10px] font-bold text-gray-500 leading-snug">
          <span className="material-symbols-outlined text-[14px] text-gray-400 shrink-0">lock</span>
          {t('studentProfile.freeWindowHint', { name: studentName, days: FREE_HISTORY_DAYS })}
        </p>
      )}

      {/* Potwierdzenie usunięcia wpisu trenera */}
      {confirmDelete && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[400000] bg-black/80 backdrop-blur-sm flex items-center justify-center p-6 tb-fade-in" onClick={() => setConfirmDelete(null)}>
          <div className="bg-white rounded-[24px] p-6 max-w-sm w-full text-center shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="w-12 h-12 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-3">
              <span className="material-symbols-outlined text-red-500">delete</span>
            </div>
            <h3 className="text-base font-black text-[#0a3a2a] mb-2">{t('coachLog.deleteTitle', { defaultValue: 'Eintrag löschen?' })}</h3>
            <p className="text-[11px] font-bold text-gray-500 mb-5 leading-relaxed">{t('coachLog.deleteDesc', { defaultValue: 'Diese Aktion kann nicht rückgängig gemacht werden.' })}</p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmDelete(null)} className="flex-1 py-3 bg-gray-100 text-gray-500 rounded-xl font-black uppercase text-[10px] tracking-widest">{t('coachLog.cancel', { defaultValue: 'Abbrechen' })}</button>
              <button onClick={() => handleDelete(confirmDelete)} className="flex-1 py-3 bg-red-500 text-white rounded-xl font-black uppercase text-[10px] tracking-widest">{t('coachLog.delete', { defaultValue: 'Löschen' })}</button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

interface StudentProfileViewProps {
  coachId: string;
  studentId: string;
  onNavigate: (view: string, tab?: string, extraData?: string, sId?: string) => void;
}

// Poza JSX ikony: skrypt icon-font czyta literały w <span> ikony.
const RANK_TREND_ICON = { up: 'trending_up', down: 'trending_down', flat: 'trending_flat' } as const;

export default function StudentProfileView({ coachId, studentId, onNavigate }: StudentProfileViewProps) {
  const { t, i18n } = useTranslation();
  
  const [student, setStudent] = useState<any | null>(null);

  const [upcomingTournaments, setUpcomingTournaments] = useState<any[]>([]); 
  
  const [recentSessions, setRecentSessions] = useState<any[]>([]);
  const [allModalSessions, setAllModalSessions] = useState<any[]>([]);
  const [currentSessionIndex, setCurrentSessionIndex] = useState(0);

  const [dailyArrows, setDailyArrows] = useState(0);
  const [monthlyArrows, setMonthlyArrows] = useState(0);
  const [yearlyArrows, setYearlyArrows] = useState(0);
  const [avg14Days, setAvg14Days] = useState('0.0');
  const [avgArrows3, setAvgArrows3] = useState(0);
  const [avgPoints3, setAvgPoints3] = useState(0);
  const [avgArrowsMonth, setAvgArrowsMonth] = useState(0);
  const [avgPointsMonth, setAvgPointsMonth] = useState(0);

  const [trendFilterType, setTrendFilterType] = useState<string>('');
  const [trendFilterDist, setTrendFilterDist] = useState<string>('');

  const [isQuickStatsOpen, setIsQuickStatsOpen] = useState(false);
  const [quickStatsTab, setQuickStatsTab] = useState<'ARROWS' | 'POINTS'>('ARROWS');
  // Słupki 12-tygodniowe liczone leniwie dopiero przy otwarciu QuickStats
  // (widok ucznia ładuje tylko 15 ostatnich sesji do reszty UI).
  const [weeklyArrows, setWeeklyArrows] = useState<number[]>(Array(12).fill(0));
  const [weeklyPoints, setWeeklyPoints] = useState<number[]>(Array(12).fill(0));
  const [weeklyPointsByDist, setWeeklyPointsByDist] = useState<Record<string, number[]>>({});
  const [avgByDist, setAvgByDist] = useState<Record<string, { avgArrows3: number; avgPoints3: number; avgArrowsMonth: number; avgPointsMonth: number }>>({});
  const [weeklySessionAvg, setWeeklySessionAvg] = useState<number[]>(Array(12).fill(0));
  const [weeklySessionAvgByDist, setWeeklySessionAvgByDist] = useState<Record<string, number[]>>({});
  
  const sessionSectionRef = useRef<HTMLDivElement>(null);
  const [isNotesExpanded, setIsNotesExpanded] = useState(false);
  const [showTournamentsModal, setShowTournamentsModal] = useState(false);


  // TABS
  const [activeTab, setActiveTab] = useState<'overview' | 'diary' | 'analytics'>('overview');
  // [ANALYTIK] Długi okres: Fortschritt (PRO Progress) i Rekorde; trening z wykresu → Tagebuch.
  const [analyticsTab, setAnalyticsTab] = useState<'progress' | 'records'>('progress');
  const [focusSessionId, setFocusSessionId] = useState<string | null>(null);

  // Fokus ucznia widziany oczami trenera — ten sam wynik co u ucznia na Home
  // (własny fokus vs najnowszy „Ziel" z dziennika trenerskiego, wygrywa
  // nowszy). Reguły przepuszczają trenera do users/{uid}, coachLog i sessions
  // (relacja w coaches[]), więc hook działa bez zmian. `true` = kropki postępu.
  // Klucz odświeżania: dziennik trenerski zgłasza dodanie/usunięcie wpisu —
  // nowy „Cel" może zmienić fokus, a pasek w nagłówku widać na każdej zakładce.
  const [focusNonce, setFocusNonce] = useState(0);
  const focusState = useActiveFocus(studentId, true, focusNonce);
  const [showFocusModal, setShowFocusModal] = useState(false);

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

      const cacheKey = `grotX_studentProfile_v6_${studentId}`;
      const cached = spCacheGet<any>(cacheKey);

      if (cached && cached.lastSessionTimestamp === lastTs) {
        // Nic się nie zmieniło — używamy cache, 0 dodatkowych odczytów
        setUpcomingTournaments(cached.tournaments);
        setRecentSessions(inFreeWindow(cached.recentSessions, studentData));
        setDailyArrows(cached.dailyArrows);
        setMonthlyArrows(cached.monthlyArrows);
        setYearlyArrows(cached.yearlyArrows);
        setAvg14Days(cached.avg14Days);
        if (cached.avgArrows3 != null) setAvgArrows3(cached.avgArrows3);
        if (cached.avgPoints3 != null) setAvgPoints3(cached.avgPoints3);
        if (cached.avgArrowsMonth != null) setAvgArrowsMonth(cached.avgArrowsMonth);
        if (cached.avgPointsMonth != null) setAvgPointsMonth(cached.avgPointsMonth);
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

      let recentSessions: any[] = [];
      let dayTotal = 0, monthTotal = 0, yearTotal = 0, tScore14 = 0, tArrows14 = 0;
      // Miesiąc — sumy na sesję (sesje z wynikiem, bez technicznych)
      let monthCount = 0, monthArrowsSum = 0, monthScoreSum = 0;

      if (!snap.empty) {
        const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        const nonTech = all.filter((s: any) => s.type !== 'TECHNICAL');
        // [OŚ CZASU] (user 2026-10-30) 5 ostatnich pełnych treningów z wynikiem
        // (krzywa — [C31] bez niepełnych) plus wszystko pomiędzy nimi: treningi
        // techniczne i niepełne. Karuzela „Letzte Trainings” idzie po tej osi
        // chronologicznie, krzywa zaznacza na niej każde zdarzenie.
        const curve = nonTech.filter(isCurveSession).slice(0, 5);
        const cutoff = curve.length ? sessionMillis(curve[curve.length - 1]) : -Infinity;
        recentSessions = curve.length ? all.filter((s: any) => sessionMillis(s) >= cutoff) : all.slice(0, 5);
        setAllModalSessions(nonTech);
        all.forEach((s: any) => {
          const ts: number = s.timestamp?.toMillis ? s.timestamp.toMillis() : (s.timestamp || 0);
          const arrows = s.arrows || 0;
          if (ts >= startOfDay)   dayTotal   += arrows;
          if (ts >= startOfMonth) monthTotal += arrows;
          if (ts >= startOfYear)  yearTotal  += arrows;
          if (ts >= fourteenDaysAgo && s.type !== 'TECHNICAL') { tScore14 += (s.score || 0); tArrows14 += arrows; }
          if (ts >= startOfMonth && s.type !== 'TECHNICAL' && !isPartialSession(s) && (s.score || 0) > 0) { monthCount++; monthArrowsSum += arrows; monthScoreSum += (s.score || 0); }
        });
      }

      const avg14Days = tArrows14 > 0 ? (tScore14 / tArrows14).toFixed(1) : '0.0';
      const avgArrowsMonthVal = monthCount > 0 ? Math.round(monthArrowsSum / monthCount) : 0;
      const avgPointsMonthVal = monthCount > 0 ? Math.round(monthScoreSum / monthCount) : 0;
      // Średnie na sesję z 3 ostatnich sesji z wynikiem, bez technicznych.
      // snap jest posortowany malejąco (timestamp desc), więc bierzemy pierwsze 3.
      const last3NonTech = (snap.empty ? [] : snap.docs.map(d => d.data()))
        .filter((s: any) => (s.score || 0) > 0 && s.type !== 'TECHNICAL' && !isPartialSession(s))
        .slice(0, 3);
      const avgArrows3Val = last3NonTech.length
        ? Math.round(last3NonTech.reduce((acc: number, s: any) => acc + (s.arrows || 0), 0) / last3NonTech.length)
        : 0;
      const avgPoints3Val = last3NonTech.length
        ? Math.round(last3NonTech.reduce((acc: number, s: any) => acc + (s.score || 0), 0) / last3NonTech.length)
        : 0;
      setRecentSessions(inFreeWindow(recentSessions, studentData));
      setDailyArrows(dayTotal);
      setMonthlyArrows(monthTotal);
      setYearlyArrows(yearTotal);
      setAvg14Days(avg14Days);
      setAvgArrows3(avgArrows3Val);
      setAvgPoints3(avgPoints3Val);
      setAvgArrowsMonth(avgArrowsMonthVal);
      setAvgPointsMonth(avgPointsMonthVal);

      spCacheSet(cacheKey, { lastSessionTimestamp: lastTs, tournaments, recentSessions, dailyArrows: dayTotal, monthlyArrows: monthTotal, yearlyArrows: yearTotal, avg14Days, avgArrows3: avgArrows3Val, avgPoints3: avgPoints3Val, avgArrowsMonth: avgArrowsMonthVal, avgPointsMonth: avgPointsMonthVal });
    };

    fetchStudentData();
  }, [studentId]);

  // Okno Ergebniskurve: przy profilu z cache (bez nowego treningu) lista nie
  // była wczytana i okno pokazywało „Brak danych” — doczytujemy ją przy
  // otwarciu tym samym zapytaniem co pełny fetch (15 ostatnich).
  useEffect(() => {
    if (!showTrendModal || !studentId || allModalSessions.length > 0) return;
    let cancelled = false;
    getDocs(query(collection(db, `users/${studentId}/sessions`), orderBy('timestamp', 'desc'), limit(15)))
      .then(snap => {
        if (cancelled) return;
        setAllModalSessions(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter((s: any) => s.type !== 'TECHNICAL'));
      })
      .catch(e => console.error('Błąd wczytania listy Ergebniskurve:', e));
    return () => { cancelled = true; };
  }, [showTrendModal, studentId, allModalSessions.length]);

  // Leniwe słupki 12-tygodniowe dla QuickStats ucznia — liczone dopiero przy
  // otwarciu modala, ze wspólnego źródła (cache IndexedDB + dedup w pamięci).
  useEffect(() => {
    if (!isQuickStatsOpen || !studentId) return;
    let cancelled = false;
    (async () => {
      try {
        const sessions = await getRecentSessions(studentId);
        if (cancelled) return;
        const now = Date.now();
        const wArrows = Array(12).fill(0);
        const wScore = Array(12).fill(0);
        const wScoreArrows = Array(12).fill(0);
        const wSessions = Array(12).fill(0);
        const wFullScore = Array(12).fill(0);
        const wScoreByDist: Record<string, number[]> = {};
        const wScoreArrowsByDist: Record<string, number[]> = {};
        const wSessionsByDist: Record<string, number[]> = {};
        const wFullScoreByDist: Record<string, number[]> = {};
        sessions.forEach((data: any) => {
          const ts = data.timestamp?.toMillis ? data.timestamp.toMillis() : (typeof data.timestamp === 'number' ? data.timestamp : 0);
          const diffWeeks = Math.floor(Math.max(0, now - ts) / (1000 * 60 * 60 * 24 * 7));
          if (diffWeeks < 12) {
            const idx = 11 - diffWeeks;
            const arr = data.arrows || data.totalArrows || 0;
            const scoreArr = data.scoreArrows || data.arrows || 0;
            wArrows[idx] += arr;
            if (data.type !== 'TECHNICAL' && scoreArr > 0 && (data.score || 0) > 0) {
              const full = !isPartialSession(data);
              wScore[idx] += (data.score || 0); wScoreArrows[idx] += scoreArr;
              if (full) { wSessions[idx]++; wFullScore[idx] += (data.score || 0); }
              const dist = data.distance || '';
              if (dist && dist !== 'TECH') {
                if (!wScoreByDist[dist]) { wScoreByDist[dist] = Array(12).fill(0); wScoreArrowsByDist[dist] = Array(12).fill(0); wSessionsByDist[dist] = Array(12).fill(0); wFullScoreByDist[dist] = Array(12).fill(0); }
                wScoreByDist[dist][idx] += (data.score || 0); wScoreArrowsByDist[dist][idx] += scoreArr;
                if (full) { wSessionsByDist[dist][idx]++; wFullScoreByDist[dist][idx] += (data.score || 0); }
              }
            }
          }
        });
        setWeeklyArrows(wArrows);
        setWeeklyPoints(wScore.map((sc, i) => wScoreArrows[i] > 0 ? sc / wScoreArrows[i] : 0));
        setWeeklySessionAvg(wFullScore.map((sc, i) => wSessions[i] > 0 ? Math.round(sc / wSessions[i]) : 0));
        const byDist: Record<string, number[]> = {};
        const sessAvgByDist: Record<string, number[]> = {};
        Object.keys(wScoreByDist).forEach(dist => {
          byDist[dist] = wScoreByDist[dist].map((sc, i) => wScoreArrowsByDist[dist][i] > 0 ? sc / wScoreArrowsByDist[dist][i] : 0);
          sessAvgByDist[dist] = wFullScoreByDist[dist].map((sc, i) => wSessionsByDist[dist][i] > 0 ? Math.round(sc / wSessionsByDist[dist][i]) : 0);
        });
        setWeeklyPointsByDist(byDist);
        setWeeklySessionAvgByDist(sessAvgByDist);

        // ─── ŚREDNIE KART PER DYSTANS (Ø Letzte 3 / Schnitt Monat) ──
        const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
        const scoredNonTech = sessions
          .map((s: any) => ({
            arrows: s.arrows || s.totalArrows || 0,
            score: s.score || 0,
            distance: s.distance || '',
            type: s.type || 'Trening',
            ts: s.timestamp?.toMillis ? s.timestamp.toMillis() : (typeof s.timestamp === 'number' ? s.timestamp : 0),
            partial: isPartialSession(s),
          }))
          .filter((s: any) => s.score > 0 && !s.partial && s.type !== 'TECHNICAL' && s.distance && s.distance !== 'TECH')
          .sort((a: any, b: any) => a.ts - b.ts);
        const meanRound = (arr: any[], key: 'arrows' | 'score') =>
          arr.length ? Math.round(arr.reduce((acc: number, s: any) => acc + (s[key] || 0), 0) / arr.length) : 0;
        const aByDist: Record<string, { avgArrows3: number; avgPoints3: number; avgArrowsMonth: number; avgPointsMonth: number }> = {};
        Array.from(new Set(scoredNonTech.map((s: any) => s.distance))).forEach(dist => {
          const ds = scoredNonTech.filter((s: any) => s.distance === dist);
          const l3 = ds.slice(-3);
          const mo = ds.filter((s: any) => s.ts >= startOfMonth);
          aByDist[dist as string] = {
            avgArrows3: meanRound(l3, 'arrows'),
            avgPoints3: meanRound(l3, 'score'),
            avgArrowsMonth: meanRound(mo, 'arrows'),
            avgPointsMonth: meanRound(mo, 'score'),
          };
        });
        setAvgByDist(aByDist);
      } catch (e) {
        console.error('Błąd liczenia słupków QuickStats ucznia:', e);
      }
    })();
    return () => { cancelled = true; };
  }, [isQuickStatsOpen, studentId]);

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

  const studentPro = hasActivePro(student);
  const currentSession = recentSessions.length > 0 ? recentSessions[currentSessionIndex] : null;
  const isTechSession = currentSession?.type === 'TECHNICAL';
  const lastScored = recentSessions.find((s: any) => s.type !== 'TECHNICAL') || null;

  return (
    // data-view: znacznik widoku (diagnostyka/testy; przy okazji C47 — zmiana
    // hasha chunka do testu powrotu na ekran po deployu).
    <div data-view="student-profile" className="flex flex-col min-h-screen bg-[#fcfdfe] relative overflow-x-hidden">
      
      <ViewHeader
        onBack={() => onNavigate('COACH')}
        eyebrow={t('studentProfile.headerLabel')}
        title={`${student.firstName} ${student.lastName}`}
        subtitle={(student.ageCategory || student.ageCategoryPL) && (
          <p className="text-[10px] font-bold text-emerald-300/80 uppercase tracking-widest mt-0.5 truncate">{formatViewerAgeCategory(student.ageCategory, student.ageCategoryPL, i18n.language, t)}</p>
        )}
        hideLogo
      >

        {/* [PROFIL B, etap 1] W nagłówku zostaje tylko fokus — widoczny na każdej
            zakładce; liczby, krzywa i handicap przeszły do karty „Form” w „Jetzt”.
            Fokus ucznia (user 2026-09-16: w nagłówku). Ten sam wynik co u ucznia na Home:
            własny fokus vs najnowszy „Cel" z dziennika trenerskiego. Bez
            dopisku o autorze (user 2026-09-17: nieważne kto ustawił).
            Klikalne (user 2026-09-17): otwiera CoachFocusModal — zmiana
            liczby lekcji, nowy fokus, zakończenie przed czasem, daty treningów. */}
        {focusState?.focus ? (
          <button onClick={() => setShowFocusModal(true)} className="mt-3 w-full text-left">
            <FocusStrip
              variant="glass"
              focus={focusState.focus}
              dots={focusState.dots}
              goal={focusState.goal}
              count={focusState.count}
              label={t('studentProfile.focusLabel')}
              sourceLabel=""
            />
          </button>
        ) : focusState && (
          <button onClick={() => setShowFocusModal(true)} className="mt-3 w-full flex items-center gap-3 border border-dashed border-white/15 rounded-2xl px-3.5 py-2 text-left">
            <span className="material-symbols-outlined text-[22px] text-white/25 shrink-0">center_focus_strong</span>
            <div className="flex-1 min-w-0">
              <p className="text-[9px] font-black uppercase tracking-widest text-emerald-300/60 truncate">{t('studentProfile.focusLabel')}</p>
              <p className="text-[11px] font-bold text-white/50 leading-snug truncate">{t('studentProfile.focusNone')}</p>
            </div>
          </button>
        )}
        {showFocusModal && (
          <CoachFocusModal
            studentId={studentId}
            coachId={coachId}
            focusState={focusState}
            onClose={() => setShowFocusModal(false)}
            onChange={() => setFocusNonce(n => n + 1)}
          />
        )}
        {/* Diagnostyka: które źródło fokusu się nie wczytało. */}
        {focusState?.failed && (
          <p className="text-[10px] font-bold text-red-300 px-1 mt-1">
            {t('studentProfile.focusLoadError', {
              parts: focusState.failed.map(p => t(`studentProfile.focusPart_${p}`)).join(', '),
            })}
          </p>
        )}
      </ViewHeader>

      {/* ─── TAB BAR ─────────────────────────────────────────── */}
      <div className="bg-white shrink-0 z-10 px-3 pt-3 pb-2">
        <div className="bg-gray-50 rounded-2xl p-1 flex relative">
          {[
            { key: 'overview',   icon: 'space_dashboard', label: t('studentProfile.tabOverview',   { defaultValue: 'Aktuell' }) },
            { key: 'diary',      icon: 'edit_note',       label: t('studentProfile.tabDiary',      { defaultValue: 'Tagebuch' }) },
            { key: 'analytics',  icon: 'monitoring',      label: t('studentProfile.tabAnalytics',  { defaultValue: 'Analytik' }) },
          ].map(tab => {
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => { setFocusSessionId(null); setActiveTab(tab.key as any); }}
                className={`flex-1 min-w-0 flex items-center justify-center gap-1 px-1 py-2.5 rounded-xl transition-all duration-200 ${
                  isActive
                    ? 'bg-[#0a3a2a] text-[#fed33e] shadow-md'
                    : 'text-gray-500 active:scale-95'
                }`}
              >
                <span className={`material-symbols-outlined text-[16px] shrink-0 ${isActive ? 'text-[#fed33e]' : 'text-gray-400'}`} style={isActive ? { fontVariationSettings: '"FILL" 1' } : {}}>
                  {tab.icon}
                </span>
                <span className="text-[9px] font-black uppercase tracking-wide truncate">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ─── TAB CONTENT ─────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto pb-32">

        {/* [FREE/PRO] Informacja dla trenera (user 2026-10-30): widok ograniczony,
            bo uczeń nie ma GROT-X PRO — trener widzi to samo co uczeń FREE. */}
        {!studentPro && (
          <div className="px-4 pt-3">
            <div className="tb-card tb-skipped border rounded-l-md rounded-r-2xl shadow-sm pl-2 pr-3 py-2.5 flex items-center gap-2.5">
              <span className="tb-icon w-8 h-8 rounded-lg flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-[18px] text-gray-500">lock</span>
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-[9px] font-black uppercase tracking-widest leading-tight text-gray-500">{t('studentProfile.limitedViewKind')}</span>
                <span className="block text-[11px] font-bold leading-snug text-[#0a3a2a]">{t('studentProfile.limitedViewText', { name: student.firstName || '', days: FREE_HISTORY_DAYS, hours: FREE_ANALYSIS_HOURS })}</span>
              </span>
              <span className="shrink-0 bg-[#0a3a2a] text-[#fed33e] rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-widest">FREE</span>
            </div>
          </div>
        )}

        {/* ══ TAB 1: AKTUELL ═══════════════════════════════════
            [PROFIL B, etap 1 — 2026-10-30] Odpowiada na „co u niego teraz?”.
            Wszystko jako karty dziennika (pasek z lewej, ikonka, mała etykieta
            + pogrubiony tytuł), kolory ze słownika: zawody ciemnozielone,
            trening zielony, technika sky, prywatna notatka indygo. */}
        {activeTab === 'overview' && (
          <div className="px-4 pt-3 space-y-3">

            {/* NAJBLIŻSZE ZAWODY */}
            {nextTournament && (
              <button
                onClick={() => { if (additionalTournamentsCount > 0) setShowTournamentsModal(true); }}
                className={`tb-card border rounded-l-md rounded-r-2xl shadow-sm tb-tourney w-full pl-2 pr-3 py-2.5 flex items-center gap-2.5 text-left ${additionalTournamentsCount > 0 ? 'active:opacity-60' : 'cursor-default'}`}
              >
                <span className="tb-tourney-icon w-8 h-8 rounded-lg flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-[18px] tb-tourney-accent">emoji_events</span>
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[9px] font-black uppercase tracking-widest leading-tight text-emerald-700">{t('studentProfile.nextGoal')}</span>
                  <span className="block text-[13px] font-black leading-snug text-[#0a3a2a] truncate">{nextTournament.title}</span>
                  <span className="block text-[10px] font-bold text-gray-500 mt-0.5">
                    {new Date(nextTournament.date).toLocaleDateString(i18n.language, { day: 'numeric', month: 'short' })} · {getDaysUntil(nextTournament.date)}
                  </span>
                </span>
                {additionalTournamentsCount > 0 && (
                  <span className="shrink-0 bg-[#0a3a2a] text-[#fed33e] w-7 h-7 rounded-full flex items-center justify-center font-black text-[10px]">
                    +{additionalTournamentsCount}
                  </span>
                )}
              </button>
            )}

            {/* FORMA: handicap (zamiast odznaki rangi), 3 liczby, krzywa wyników */}
            {(() => {
              const r = rankFromStored(student);
              const trend = rankTrend(student);
              const tile = 'flex flex-col items-center py-1.5 rounded-xl active:bg-gray-50 transition-colors';
              return (
                <div className={`tb-card border rounded-l-md rounded-r-2xl shadow-sm tb-d2 pl-2 pr-3 py-2.5`}>
                  <div className="flex items-center gap-2.5">
                    <span className="tb-icon w-8 h-8 rounded-lg flex items-center justify-center shrink-0">
                      <span className="material-symbols-outlined text-[18px] text-emerald-600">monitoring</span>
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-[9px] font-black uppercase tracking-widest leading-tight text-emerald-700">{t('studentProfile.formCard')}</span>
                      {r.handicap === null ? (
                        <span className="block text-[12px] font-bold leading-snug text-gray-500 truncate">{t('home.rankPending', { count: r.sessions, total: MIN_SESSIONS_FOR_RANK })}</span>
                      ) : (
                        <span className="block text-[13px] font-black leading-snug text-[#0a3a2a] truncate">
                          {t('studentProfile.handicap')} {r.handicap}
                          {r.bow && <span className="text-[10px] font-bold text-gray-400 ml-1.5">{t(RANK_BOW_LABEL[r.bow])}</span>}
                        </span>
                      )}
                    </span>
                    {trend && (
                      <span className={`flex items-center gap-1 text-[10px] font-black shrink-0 ${trend === 'up' ? 'text-emerald-600' : trend === 'down' ? 'text-red-500' : 'text-gray-400'}`}>
                        <span className="material-symbols-outlined text-[16px]">{RANK_TREND_ICON[trend]}</span>
                        {t(`studentProfile.rankTrend_${trend}`)}
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-3 mt-2.5 pt-2 border-t border-gray-100 text-center">
                    <button onClick={() => { setQuickStatsTab('ARROWS'); setIsQuickStatsOpen(true); }} className={tile}>
                      <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest">{t('studentProfile.arrowsMonth')}</span>
                      <span className="text-lg font-black text-emerald-600 tabular-nums leading-tight">{monthlyArrows}</span>
                    </button>
                    <button onClick={() => { setQuickStatsTab('POINTS'); setIsQuickStatsOpen(true); }} className={`${tile} border-x border-gray-100 rounded-none`}>
                      <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest">{t('studentProfile.avg14days')}</span>
                      <span className="text-lg font-black text-[#0a3a2a] tabular-nums leading-tight">{avg14Days}</span>
                    </button>
                    <button
                      onClick={() => { if (lastScored) { setCurrentSessionIndex(recentSessions.indexOf(lastScored)); setTimeout(() => sessionSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80); } }}
                      className={tile}
                    >
                      <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest">{t('studentProfile.lastScore')}</span>
                      <span className="text-lg font-black text-[#0a3a2a] tabular-nums leading-tight">{lastScored ? lastScored.score : '–'}</span>
                    </button>
                  </div>

                  {/* Ergebniskurve — klik otwiera okno z filtrami i listą wyników */}
                  {(() => {
                    // Oś czasu od najstarszego: każde zdarzenie ma swoje miejsce na osi X,
                    // linia łączy tylko pełne treningi z wynikiem.
                    const tl = [...recentSessions].reverse();
                    const scored = tl.map((sess, i) => ({ sess, i })).filter(({ sess }) => isCurveSession(sess));
                    if (scored.length < 2) return null;
                    const W = 200, H = 36, pad = 5, base = H - 1;
                    const vals = scored.map(({ sess }) => sess.score || 0);
                    const minS = Math.min(...vals);
                    const maxS = Math.max(...vals);
                    const lastS = vals[vals.length - 1];
                    const range = maxS - minS || 1;
                    const maxIdx = scored[vals.indexOf(maxS)].i;
                    const minIdx = scored[vals.lastIndexOf(minS)].i;
                    const lastIdx = scored[scored.length - 1].i;
                    const xOf = (i: number) => pad + (i / Math.max(tl.length - 1, 1)) * (W - pad * 2);
                    const yOf = (sc: number) => H - pad - 3 - ((sc - minS) / range) * (H - pad * 2 - 3);
                    // Trening wybrany w „Letzte Trainings” — obwódka (+ wynik nad punktem).
                    const selIdx = currentSession ? tl.length - 1 - currentSessionIndex : -1;
                    const selSess = selIdx >= 0 ? tl[selIdx] : null;
                    const selOnCurve = !!selSess && isCurveSession(selSess);
                    const sel = selSess ? { x: xOf(selIdx), y: selOnCurve ? yOf(selSess.score || 0) : base } : null;
                    return (
                      <button onClick={() => setShowTrendModal(true)} className="w-full mt-2 pt-2 border-t border-gray-100 flex items-center gap-2 text-left active:opacity-60">
                        <span className="flex-1 min-w-0">
                          <span className="block text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1">{t('studentProfile.trendTitle', { defaultValue: 'Ergebniskurve' })}</span>
                          <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ overflow: 'visible' }}>
                            <polyline points={scored.map(({ sess, i }) => `${xOf(i)},${yOf(sess.score || 0)}`).join(' ')} fill="none" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.5" />
                            {tl.map((sess, i) => {
                              // Trening techniczny: błękitny kwadracik na osi; niepełny: pusta bursztynowa kropka.
                              if (sess.type === 'TECHNICAL') return <rect key={i} x={xOf(i) - 2.5} y={base - 2.5} width={5} height={5} rx={1.5} fill="#38bdf8" />;
                              if (!isCurveSession(sess)) return <circle key={i} cx={xOf(i)} cy={base} r={2.5} fill="none" stroke="#d97706" strokeWidth="1.2" />;
                              const isMax = i === maxIdx, isMin = i === minIdx, isLast = i === lastIdx;
                              const color = isMax ? '#10b981' : isMin ? '#ef4444' : isLast ? '#0a3a2a' : '#9ca3af';
                              return <circle key={i} cx={xOf(i)} cy={yOf(sess.score || 0)} r={isMax || isMin ? 4 : isLast ? 3.5 : 2} fill={color} opacity={isMax || isMin || isLast ? 1 : 0.5} />;
                            })}
                            {sel && (
                              <g className="tb-fade-in" key={selIdx}>
                                {selOnCurve && <line x1={sel.x} y1={sel.y + 6} x2={sel.x} y2={H} stroke="#0a3a2a" strokeWidth="1" strokeDasharray="2 2" opacity="0.35" />}
                                <circle cx={sel.x} cy={sel.y} r={6.5} fill="none" stroke={selSess?.type === 'TECHNICAL' ? '#0284c7' : '#0a3a2a'} strokeWidth="1.5" />
                                {selOnCurve && <text x={Math.min(Math.max(sel.x, 10), W - 10)} y={sel.y - 9} fontSize="9" fontWeight="900" textAnchor="middle" fill="#0a3a2a">{selSess?.score}</text>}
                              </g>
                            )}
                          </svg>
                        </span>
                        <span className="w-14 flex flex-col items-end gap-1 shrink-0">
                          <span className="flex items-center gap-1 text-[11px] font-black text-emerald-600 leading-none"><span className="w-2 h-2 rounded-full bg-emerald-500" />{maxS}</span>
                          <span className="flex items-center gap-1 text-[11px] font-black text-red-500 leading-none"><span className="w-2 h-2 rounded-full bg-red-500" />{minS}</span>
                          <span className="flex items-center gap-1 text-[11px] font-black text-[#0a3a2a] leading-none"><span className="w-2 h-2 rounded-full bg-[#0a3a2a]" />{lastS}</span>
                        </span>
                      </button>
                    );
                  })()}
                </div>
              );
            })()}

            {/* OSTATNIE TRENINGI — karuzela po osi czasu krzywej (5 wyników + technika pomiędzy);
                w etapie 2 dojdzie pełna lista w zakładce „Trainings” */}
            {currentSession ? (
              <div ref={sessionSectionRef} className={`tb-card border rounded-l-md rounded-r-2xl shadow-sm ${isTechSession ? 'tb-tech' : currentSession.type === 'Turniej' ? 'tb-tourney' : 'tb-d2'} pl-2 pr-3 py-2.5 space-y-2.5 scroll-mt-3`}>
                <div className="flex items-center gap-2.5">
                  <span className={`${currentSession.type === 'Turniej' ? 'tb-tourney-icon' : 'tb-icon'} w-8 h-8 rounded-lg flex items-center justify-center shrink-0`}>
                    <span className={`material-symbols-outlined text-[18px] ${isTechSession ? 'text-sky-500' : currentSession.type === 'Turniej' ? 'tb-tourney-accent' : 'text-emerald-600'}`}>{isTechSession ? 'fitness_center' : currentSession.type === 'Turniej' ? 'emoji_events' : 'target'}</span>
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className={`block text-[9px] font-black uppercase tracking-widest leading-tight truncate ${isTechSession ? 'text-sky-600' : 'text-emerald-700'}`}>{isTechSession ? t('stats.techSessionType') : t('studentProfile.lastTrainings')}</span>
                    <span className="block text-[13px] font-black leading-snug text-[#0a3a2a] truncate">{currentSession.date}{!isTechSession && currentSession.distance ? ` · ${currentSession.distance}` : ''}</span>
                  </span>
                  <span className="flex items-center gap-1.5 shrink-0">
                    <button onClick={() => setCurrentSessionIndex(Math.min(recentSessions.length - 1, currentSessionIndex + 1))} disabled={currentSessionIndex === recentSessions.length - 1} className="w-10 h-10 rounded-full bg-[#0a3a2a] shadow-md flex items-center justify-center text-[#fed33e] active:scale-90 disabled:opacity-20 disabled:shadow-none transition-all" aria-label="‹">
                      <span className="material-symbols-outlined text-[18px]">arrow_back_ios_new</span>
                    </button>
                    <button onClick={() => setCurrentSessionIndex(Math.max(0, currentSessionIndex - 1))} disabled={currentSessionIndex === 0} className="w-10 h-10 rounded-full bg-[#0a3a2a] shadow-md flex items-center justify-center text-[#fed33e] active:scale-90 disabled:opacity-20 disabled:shadow-none transition-all" aria-label="›">
                      <span className="material-symbols-outlined text-[18px]">arrow_forward_ios</span>
                    </button>
                  </span>
                </div>
                {recentSessions.length > 1 && (
                  <div className="flex items-center justify-center gap-1">
                    {recentSessions.map((sess, i) => ({ sess, i })).reverse().map(({ sess, i }) => (
                      <button key={sess.id || i} onClick={() => setCurrentSessionIndex(i)} className={`rounded-full transition-all ${i === currentSessionIndex ? `w-3.5 h-1.5 ${sess.type === 'TECHNICAL' ? 'bg-sky-500' : 'bg-[#0a3a2a]'}` : `w-1.5 h-1.5 ${sess.type === 'TECHNICAL' ? 'bg-sky-200' : 'bg-gray-200'}`}`} />
                    ))}
                  </div>
                )}
                <SessionDetail key={currentSession.id} session={currentSession} studentId={studentId} coachId={coachId} onNoteSaved={handleUpdateSessionNote} pro={studentPro} studentName={student.firstName || ''} />
              </div>
            ) : (
              <div className={`tb-card border rounded-l-md rounded-r-2xl shadow-sm tb-skipped pl-2 pr-3 py-2.5 flex items-center gap-2.5`}>
                <span className="tb-icon w-8 h-8 rounded-lg flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-[18px] text-gray-400">sports_score</span>
                </span>
                <span className="text-[11px] font-bold text-gray-500">{t('studentProfile.noSessions', { defaultValue: 'Noch keine Trainingseinheiten' })}</span>
              </div>
            )}

            {/* SPRZĘT — zwijana karta zamiast ikonki 🔧 w nagłówku */}
            <SummaryCard icon="build" stripe="tb-d1" kind={t('studentProfile.hardwareTitle')} title={t('studentProfile.hardwareSubtitle')} storageKey="coach-equipment" defaultOpen={false}>
              <StudentEquipmentCard student={student} />
            </SummaryCard>

          </div>
        )}

        {/* ══ TAB 2: TAGEBUCH — wspólna oś czasu ════════════════ */}
        {activeTab === 'diary' && (
          <div className="px-4 pt-3">
            <StudentTimeline studentId={studentId} coachId={coachId} pro={studentPro} studentName={student.firstName || ''} onCoachLogChange={() => setFocusNonce(n => n + 1)} focusSessionId={focusSessionId} />
          </div>
        )}

        {/* ══ TAB 3: ANALYTIK ═══════════════════════════════════
            [PROFIL B, etap 4 — 2026-10-30] Tylko długi okres: PRO Progress
            (krzywa, Ringe/Präzision, Gruppengröße, strzały, technika) i Rekorde
            zawodów. Pojedynczy trening jest w Tagebuch — bez drugiego wyboru dnia.
            [FREE/PRO] isPremium = PRO ucznia: FREE widzi to samo co uczeń. Przycisk
            „odblokuj” nie prowadzi trenera do jego własnego zakupu PRO. */}
        {activeTab === 'analytics' && (
          <div className="px-4 pt-3">
            <div className="flex bg-gray-100 p-1 rounded-xl mb-2 shadow-inner">
              {([['progress', t('stats.tabPro')], ['records', t('stats.tabRecords')]] as const).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setAnalyticsTab(key)}
                  className={`flex-1 py-2.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${analyticsTab === key ? 'bg-white text-[#0a3a2a] shadow-sm' : 'text-gray-400'}`}
                >
                  {label}
                </button>
              ))}
            </div>
            {analyticsTab === 'progress' ? (
              <ProStatsView
                userId={studentId}
                isPremium={studentPro}
                onNavigate={(view, tab) => { if (view !== 'SETTINGS') onNavigate(view, tab); }}
                onOpenSession={(sessionId) => { setFocusSessionId(sessionId); setActiveTab('diary'); }}
              />
            ) : (
              <TournamentRecordsView
                userId={studentId}
                isPremium={studentPro}
                onNavigate={(view: string, tab?: string) => { if (view !== 'SETTINGS') onNavigate(view, tab); }}
              />
            )}
          </div>
        )}

      </div>

      {/* QUICK STATS MODAL UCZNIA */}
      <QuickStatsModal
        isOpen={isQuickStatsOpen}
        onClose={() => setIsQuickStatsOpen(false)}
        isPremium={hasActivePro(student)}
        onNavigate={onNavigate}
        userId={studentId}
        initialTab={quickStatsTab}
        weeklyArrows={weeklyArrows}
        weeklyPoints={weeklyPoints}
        weeklyPointsByDistance={weeklyPointsByDist}
        avgByDistance={avgByDist}
        weeklySessionAvg={weeklySessionAvg}
        weeklySessionAvgByDistance={weeklySessionAvgByDist}
        stats={{ daily: dailyArrows, monthly: monthlyArrows, yearly: yearlyArrows, avg14: avg14Days, avgArrows3, avgPoints3, avgArrowsMonth, avgPointsMonth }}
      />

      {/* MODAL: KRZYWA WYNIKÓW UCZNIA */}
      {showTrendModal && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-[200000] bg-black/70 backdrop-blur-sm flex items-start justify-center p-4 pt-[max(1.5rem,env(safe-area-inset-top))] animate-fade-in overflow-y-auto"
          onClick={() => setShowTrendModal(false)}
        >
          <div className="bg-[#fcfdfe] w-full max-w-md rounded-[32px] shadow-2xl p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <span className="text-[9px] font-black text-emerald-600 uppercase tracking-widest block leading-none mb-0.5">{student.firstName} {student.lastName}</span>
                <h2 className="text-xl font-black text-[#0a3a2a] leading-tight">{t('studentProfile.trendTitle', { defaultValue: 'Ergebniskurve' })}</h2>
              </div>
              <button onClick={() => setShowTrendModal(false)} className="w-9 h-9 bg-gray-100 rounded-full flex items-center justify-center text-gray-500 active:scale-90 transition-all">
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>

            {(() => {
              const availTypes = Array.from(new Set(allModalSessions.map((s: any) => s.type || 'Trening')));
              const availDists = Array.from(new Set(allModalSessions.map((s: any) => s.distance).filter(Boolean))).sort();

              const filtered = allModalSessions.filter((s: any) => {
                const typeMatch = !trendFilterType || (s.type || 'Trening') === trendFilterType;
                const distMatch = !trendFilterDist || s.distance === trendFilterDist;
                return typeMatch && distMatch;
              });

              const scores = filtered.filter(s => !isPartialSession(s)).slice(0, 10).reverse().filter((s: any) => s.arrows > 0).map((s: any) => s.score);
              const W = 300, H = 100, pad = 12;
              const minS = scores.length ? Math.min(...scores) : 0;
              const maxS = scores.length ? Math.max(...scores) : 0;
              const range = maxS - minS || 1;
              const maxIdx = scores.indexOf(maxS);
              const minIdx = scores.lastIndexOf(minS);
              const pts = scores.map((s, i) => ({
                x: pad + (i / Math.max(scores.length - 1, 1)) * (W - pad * 2),
                y: H - pad - ((s - minS) / range) * (H - pad * 2),
                s,
              }));
              const polyline = pts.map(p => `${p.x},${p.y}`).join(' ');

              return (
                <>
                  {/* FILTRY TYPU */}
                  {availTypes.length > 1 && (
                    <div className="flex gap-1.5 flex-wrap mb-2">
                      <button
                        onClick={() => setTrendFilterType('')}
                        className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border transition-all ${!trendFilterType ? 'bg-[#0a3a2a] text-white border-[#0a3a2a]' : 'bg-white text-gray-400 border-gray-200'}`}
                      >Alle</button>
                      {availTypes.map(type => {
                        const lbl = type === 'Turniej' ? 'Turnier' : type === 'Arena' ? 'Arena' : type === 'WORLD_BATTLE' ? 'World' : 'Training';
                        const active = trendFilterType === type;
                        const col = active
                          ? type === 'Turniej' ? 'bg-[#0a3a2a] text-white border-[#0a3a2a]'
                          : type === 'Arena' ? 'bg-blue-500 text-white border-blue-500'
                          : 'bg-[#fed33e] text-[#5d4a00] border-[#e5bd38]'
                          : 'bg-white text-gray-400 border-gray-200';
                        return (
                          <button key={type} onClick={() => setTrendFilterType(active ? '' : type)}
                            className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border transition-all ${col}`}>
                            {lbl}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* FILTRY DYSTANSU */}
                  {availDists.length > 1 && (
                    <div className="flex gap-1.5 flex-wrap mb-3">
                      <button
                        onClick={() => setTrendFilterDist('')}
                        className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border transition-all ${!trendFilterDist ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-gray-400 border-gray-200'}`}
                      >Alle</button>
                      {(availDists as string[]).map((dist: string) => (
                        <button key={dist} onClick={() => setTrendFilterDist(trendFilterDist === dist ? '' : dist)}
                          className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border transition-all ${trendFilterDist === dist ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-gray-400 border-gray-200'}`}>
                          {dist}
                        </button>
                      ))}
                    </div>
                  )}

                  {scores.length >= 2 ? (
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
                  ) : (
                    <div className="bg-[#0a3a2a] rounded-2xl p-6 mb-4 flex items-center justify-center opacity-50">
                      <span className="text-white text-[10px] font-black uppercase tracking-widest">Brak danych</span>
                    </div>
                  )}

                  <div className="space-y-1.5">
                    {/* Jak u ucznia na Home: FREE widzi 4 wpisy listy, PRO 10. */}
                    {[...filtered].slice(0, studentPro ? 10 : 4).map((sess, i) => {
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
                            {isPartialSession(sess) && (
                              <span className="text-[8px] font-black text-amber-700 bg-amber-100 rounded px-1 py-0.5">{partialLabel(sess)}</span>
                            )}
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