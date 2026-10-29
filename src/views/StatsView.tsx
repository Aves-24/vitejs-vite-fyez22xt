import React, { useState, useEffect, useRef, useMemo } from 'react';
import { distanceMeters, sessionDistanceLabel, distanceKey } from '../config/distances';
import { useDistanceColors } from '../hooks/useDistanceColors';
import { db } from '../firebase';
import { collection, query, where, orderBy, limit, startAfter, doc, getDoc, getDocs, deleteDoc, updateDoc, onSnapshot, QueryDocumentSnapshot, Timestamp } from 'firebase/firestore';
import { readPrivateSessionNote, sessionNoteField, writePrivateSessionNote } from '../utils/privateSessionNote';
import { useTranslation } from 'react-i18next';
import ViewHeader from '../components/ViewHeader';
import CoachAIPanel from '../components/CoachAIPanel';
import { AI_ENABLED } from '../config/features';
import { hasActivePro, FREE_HISTORY_DAYS, FREE_ANALYSIS_HOURS, freeAnalysisOpen } from '../utils/proAccess';
import LockedCard from '../components/scoring/LockedCard';
import SessionBilanz from '../components/scoring/SessionBilanz';
import TrendCard from '../components/scoring/TrendCard';
import TargetCard from '../components/scoring/TargetCard';
import { rankBowOf } from '../utils/rankEngine';
import { BLOWGUN_DISCIPLINE } from '../config/equipmentSetups';
import ProStatsView from '../components/ProStatsView';
import TournamentRecordsView from '../components/TournamentRecordsView';
import ExportPanel from '../components/ExportPanel';
import TechSessionCard from '../components/TechSessionCard';
import { SessionFocusCard } from '../components/tagebuch/FocusCard';
import { createPortal } from 'react-dom';
import { isPartialSession, partialLabel, isShortPlanned, roundSizeFor } from '../utils/partialSession';

// Status PRO jest odczytywany zawsze świeżo z Firestore (SDK ma własny offline cache w IndexedDB)
// Nie używamy tu localStorage — admin może zmienić status w dowolnej chwili

const getArrowBg = (val: string) => {
  if (['X', '10', '9'].includes(val)) return 'bg-[#F2C94C] text-[#333] shadow-sm';
  if (['8', '7'].includes(val)) return 'bg-[#EB5757] text-white shadow-sm';
  if (['6', '5'].includes(val)) return 'bg-[#2F80ED] text-white shadow-sm';
  if (['4', '3'].includes(val)) return 'bg-[#333] text-white shadow-sm';
  if (val === 'M') return 'bg-purple-900 text-white shadow-sm';
  return 'bg-gray-100 text-gray-400';
};


// Zwijana, szczegółowa tabela z rozbiciem na dwa Durchgänge (Runda 1 / Runda 2).
// Standardowo zwinięta — rozwijana kliknięciem nagłówka.
function RoundDetailTable({ r1Ends, r2Ends, t }: { r1Ends: any[], r2Ends: any[], t: any }) {
  const [open, setOpen] = useState(false);

  const renderDurchgang = (ends: any[], idx: number, startIndex: number) => {
    const sum = ends.reduce((acc, e) => acc + (e.total_sum ?? (e.arrows?.reduce((a: number, v: string) => a + (v === 'X' ? 10 : v === 'M' ? 0 : Number(v) || 0), 0) ?? 0)), 0);
    return (
      <div key={idx} className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1.5 px-1">
          <span className="text-[9px] font-black text-emerald-700 uppercase tracking-widest">{t('stats.cards.durchgang')} {idx + 1}</span>
          <span className="text-[10px] font-black text-[#0a3a2a]">{sum}</span>
        </div>
        <table className="w-full border-collapse text-[10px]">
          <thead>
            <tr className="text-gray-400">
              <th className="text-left font-black uppercase py-1 pl-1 w-8">{t('stats.cards.endLabel')}</th>
              <th className="text-center font-black uppercase py-1">{t('scoringView.arrows')}</th>
              <th className="text-right font-black uppercase py-1 pr-1 w-9">{t('stats.cards.sumLabel')}</th>
            </tr>
          </thead>
          <tbody>
            {ends.map((end: any, i: number) => (
              <tr key={i} className="border-t border-gray-100">
                <td className="py-1 pl-1 font-black text-gray-500">P{startIndex + i + 1}</td>
                <td className="py-1">
                  <div className="flex gap-0.5 justify-center flex-wrap">
                    {end.arrows?.map((a: string, j: number) => (
                      <span key={j} className={`w-5 h-5 rounded-md flex items-center justify-center text-[9px] font-black ${getArrowBg(a)}`}>{a}</span>
                    ))}
                  </div>
                </td>
                <td className="py-1 pr-1 text-right font-black text-[#0a3a2a]">{end.total_sum ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    // Styl kart dziennika (2026-10-29), zwinięta jak dotąd.
    <div className="tb-card tb-d1 border rounded-l-md rounded-r-2xl shadow-sm overflow-hidden">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center gap-2.5 pl-2 pr-3 py-2.5 text-left active:opacity-60" aria-expanded={open}>
        <span className="tb-icon w-8 h-8 rounded-lg flex items-center justify-center shrink-0">
          <span className="material-symbols-outlined text-[18px] text-emerald-600">table_chart</span>
        </span>
        <span className="flex-1 min-w-0 text-[9px] font-black uppercase tracking-widest text-emerald-700">{t('stats.cards.detailTable')}</span>
        <span className={`material-symbols-outlined text-gray-400 transition-transform duration-300 ${open ? 'rotate-180' : ''}`}>keyboard_arrow_down</span>
      </button>
      {open && (
        <div className="px-3 pb-3 pt-1 flex flex-col gap-4 tb-fade-in">
          {renderDurchgang(r1Ends, 0, 0)}
          {r2Ends.length > 0 && renderDurchgang(r2Ends, 1, r1Ends.length)}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// BEZPIECZNE LINKI: parser wyłapuje http(s) URL i renderuje je jako
// SafeLink — "chip" pokazujący domenę + ostrzeżenia dla URL shortenerów
// (cel ukryty) oraz domen Unicode/IDN (homograph attack — podszywanie).
// Ochrona: rel=noopener (tabnabbing), nofollow (SEO), click.stopPropagation.
// ─────────────────────────────────────────────────────────────────────────────

// Znane URL shortenery — cel linku jest ukryty, podwyższone ryzyko phishingu.
const URL_SHORTENERS: Set<string> = new Set([
  'bit.ly', 'tinyurl.com', 't.co', 'is.gd', 'goo.gl', 'ow.ly',
  'buff.ly', 'tiny.cc', 'rb.gy', 'cutt.ly', 'short.io', 's.id',
  'shorturl.at', 'lnkd.in', 'rebrand.ly', 'bl.ink', 'tr.im',
]);

type LinkSafety = {
  domain: string;
  isShortener: boolean;
  isIDN: boolean;
  isValid: boolean;
};

const analyzeLink = (url: string): LinkSafety => {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { domain: '', isShortener: false, isIDN: false, isValid: false };
    }
    const domain = parsed.hostname.toLowerCase();
    // IDN: non-ASCII chars w oryginalnym URL LUB punycode prefix po parse.
    // (iterujemy po codePoints, bez kontrolnych znaków w regex — ESLint-friendly)
    const hasUnicode = [...url].some(ch => ch.charCodeAt(0) > 127);
    const isPunycode = domain.split('.').some(part => part.startsWith('xn--'));
    return {
      domain,
      isShortener: URL_SHORTENERS.has(domain),
      isIDN: hasUnicode || isPunycode,
      isValid: true,
    };
  } catch {
    return { domain: '', isShortener: false, isIDN: false, isValid: false };
  }
};

const SafeLink = ({ url }: { url: string }) => {
  const { t } = useTranslation();
  const { domain, isShortener, isIDN, isValid } = analyzeLink(url);

  // Niepoprawny URL — wyświetl jako zwykły tekst (nie linkuj).
  if (!isValid) {
    return (
      <span className="text-gray-500 break-words" title={t('stats.invalidUrl')}>
        {url}
      </span>
    );
  }

  const hasWarning = isShortener || isIDN;
  const chipClass = hasWarning
    ? 'bg-amber-50 text-amber-900 border-amber-300 hover:bg-amber-100'
    : 'bg-blue-50 text-blue-800 border-blue-200 hover:bg-blue-100';

  return (
    <span className="inline-flex flex-col gap-0.5 my-1 align-middle max-w-full">
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer nofollow"
        onClick={e => e.stopPropagation()}
        title={url}
        className={`inline-flex items-center gap-1 px-2 py-1 rounded-md border text-sm font-bold no-underline transition-colors break-all ${chipClass}`}
      >
        <span>{hasWarning ? '⚠️' : '🔗'}</span>
        <span className="font-mono">{domain}</span>
        <span className="text-[10px] opacity-60">↗</span>
      </a>
      {isShortener && (
        <span className="text-[10px] text-amber-700 font-medium pl-1">
          ⚠ Skracany link — cel ukryty, sprawdź przed kliknięciem
        </span>
      )}
      {isIDN && (
        <span className="text-[10px] text-red-700 font-medium pl-1">
          ⚠ Domena Unicode — ryzyko podszywania (homograph)
        </span>
      )}
    </span>
  );
};

const renderWithLinks = (text: string) => {
  if (!text) return null;
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = text.split(urlRegex);
  return parts.map((part, i) =>
    part.match(urlRegex)
      ? <SafeLink key={i} url={part} />
      : <span key={i}>{part}</span>
  );
};

function NoteModule({ session, userId, viewingStudentId }: any) {
  const { t } = useTranslation();
  const [isEditing, setIsEditing] = useState(false);
  // [RODO C36] Tekst prywatnej notatki leży w sessionNotes (tylko właściciel).
  // `session.note` przy prywatnej jest puste — chyba że sesja sprzed migracji.
  const [privateText, setPrivateText] = useState('');
  const isOwnPrivate = !viewingStudentId && session.isNotePublic === false;
  const ownNote: string = session.note || (isOwnPrivate ? privateText : '');
  const [text, setText] = useState(ownNote);
  const [isNotePublic, setIsNotePublic] = useState(session.isNotePublic ?? true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setPrivateText('');
    if (!isOwnPrivate || !userId) return;
    let alive = true;
    readPrivateSessionNote(userId, session.id)
      .then(n => { if (alive) setPrivateText(n); })
      .catch(e => console.error('Prywatna notatka:', e));
    return () => { alive = false; };
  }, [session.id, isOwnPrivate, userId]);

  useEffect(() => {
    setText(ownNote);
    setIsNotePublic(session.isNotePublic ?? true);
    setIsEditing(false);
  }, [session.id, ownNote, session.isNotePublic]);

  const edits = session.editCount || 0;
  const canEdit = !viewingStudentId && edits < 2;

  const handleSave = async () => {
    const cleanText = text.trim().slice(0, 250); // Zwiększony limit znaków do 250!
    if (!cleanText && !ownNote && isNotePublic === session.isNotePublic) { 
        setIsEditing(false); 
        return; 
    }
    
    setIsSaving(true);
    try {
      await updateDoc(doc(db, `users/${userId}/sessions`, session.id), {
        note: sessionNoteField(cleanText, isNotePublic),
        isNotePublic: isNotePublic,
        editCount: edits + 1
      });
      await writePrivateSessionNote(userId, session.id, cleanText, isNotePublic);
      setPrivateText(isNotePublic ? '' : cleanText);
      setIsEditing(false);
    } catch(e) { console.error(e); }
    setIsSaving(false);
  };

  // Trener nie widzi notatki, którą uczeń oznaczył jako prywatną.
  const showStudentNote = !viewingStudentId || (!!session.note && session.isNotePublic !== false);
  if (!showStudentNote && !session.coachNote) return null;

  return (
    // Styl kart dziennika (2026-10-29): notatka ucznia fioletowa (prywatne notatki),
    // wskazówka trenera pomarańczowa (wpisy trenera) — słownik kolorów.
    <div className="flex flex-col gap-3 w-full">
       {showStudentNote && (
         <div className="tb-card tb-private border rounded-l-md rounded-r-2xl shadow-sm pl-3 pr-3 py-3 relative">
            <div className="flex justify-between items-center mb-2.5">
              <span className="text-[9px] font-black text-indigo-600 uppercase tracking-widest flex items-center gap-1">
                 <span className="material-symbols-outlined text-[16px] text-indigo-500">edit_note</span>
                 {viewingStudentId ? t('stats.studentFindings') : t('stats.yourNotes')}
                 {!viewingStudentId && ownNote && (
                    <span className="material-symbols-outlined text-[12px] opacity-60" title={session.isNotePublic !== false ? t('stats.sharedWithCoach') : t('stats.private')}>
                        {session.isNotePublic !== false ? 'visibility' : 'visibility_off'}
                    </span>
                 )}
                 {canEdit && !isEditing ? <span className="text-[8px] opacity-50 ml-1">{t('stats.noteEditsLeft', { count: 2 - edits })}</span> : ''}
              </span>
              {canEdit && !isEditing && (
                <button onClick={() => setIsEditing(true)} className="text-indigo-500 active:scale-90 transition-all bg-white rounded-lg p-1 shadow-sm border border-gray-200">
                  <span className="material-symbols-outlined text-[14px] block">edit</span>
                </button>
              )}
            </div>
            
            {isEditing ? (
              <div className="flex flex-col gap-2 mt-1">
                {/* POWIĘKSZONA CZCIONKA TEXTAREA */}
                <textarea 
                  value={text} 
                  onChange={e => setText(e.target.value.slice(0, 250))} 
                  maxLength={250}
                  className="w-full bg-white border border-emerald-200 rounded-xl p-3 text-[14px] font-medium text-[#0a3a2a] outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 resize-none h-24 leading-relaxed"
                  placeholder={t('stats.notePlaceholder', 'Opisz wnioski, wklej link do wideo (max 250 znaków)...')}
                />
                
                <label className="flex items-center gap-2 cursor-pointer group w-max mt-1 mb-1">
                  <div className={`w-4 h-4 rounded-md flex items-center justify-center border transition-all ${isNotePublic ? 'bg-emerald-500 border-emerald-600 text-white' : 'bg-white border-gray-300 text-transparent'}`}>
                    <span className="material-symbols-outlined text-[12px] font-bold">check</span>
                  </div>
                  <input 
                    type="checkbox" 
                    className="hidden" 
                    checked={isNotePublic} 
                    onChange={(e) => setIsNotePublic(e.target.checked)} 
                  />
                  <span className="text-[10px] font-black uppercase tracking-widest text-emerald-800 group-hover:text-emerald-600 transition-colors">
                    {t('stats.shareWithCoach', 'Udostępnij trenerowi')}
                  </span>
                </label>

                <div className="flex justify-between items-center mt-1">
                  <span className="text-[10px] font-bold text-gray-400">{text.length}/250</span>
                  <div className="flex gap-2">
                     <button onClick={() => { setIsEditing(false); setText(ownNote); setIsNotePublic(session.isNotePublic ?? true); }} className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-3 py-2 active:scale-95">{t('setup.warningCancel')}</button>
                     <button onClick={handleSave} disabled={isSaving || (!text.trim() && isNotePublic === session.isNotePublic)} className="text-[10px] font-black bg-emerald-600 text-white px-5 py-2 rounded-xl shadow-sm uppercase tracking-widest disabled:opacity-50 active:scale-95 transition-all">{isSaving ? t('common.saving') : t('stats.saveNote')}</button>
                  </div>
                </div>
              </div>
            ) : (
              // POWIĘKSZONA CZCIONKA, BRAK KROJU ITALIC, AKTYWNE LINKI
              <div className="text-[14px] text-[#0a3a2a] font-medium leading-relaxed">
                {ownNote ? (
                  <>{renderWithLinks(ownNote)}</>
                ) : (
                  <span className="text-gray-400 font-medium text-[12px] italic">{t('stats.noNote', 'Brak notatki. Pamiętaj, by zostawiać wnioski.')}</span>
                )}
                {/* Trener odhaczył „Widziałem” w karcie ucznia (bez odpowiedzi). */}
                {!viewingStudentId && session.note && session.isNotePublic !== false && session.coachSeenAt && !session.coachNote && (
                  <p className="mt-2 flex items-center gap-1 text-[11px] font-black text-amber-800">
                    <span className="material-symbols-outlined text-[15px]">done_all</span>
                    {t('tagebuch.coachSeen')}
                  </p>
                )}
              </div>
            )}
         </div>
       )}

       {session.coachNote && (
         <div className="tb-card tb-coach border rounded-l-md rounded-r-2xl shadow-sm pl-3 pr-3 py-3 relative">
            <div className="flex items-center gap-1.5 mb-2">
              <span className="material-symbols-outlined text-[16px] text-amber-500">sports</span>
              <span className="text-[9px] font-black text-amber-700 uppercase tracking-widest">{t('stats.coachTip', 'Wskazówka Trenera')}</span>
            </div>
            {/* POWIĘKSZONA CZCIONKA TRENERA, AKTYWNE LINKI */}
            <div className="text-[14px] text-[#0a3a2a] font-medium leading-relaxed">
               {renderWithLinks(session.coachNote)}
            </div>
         </div>
       )}
    </div>
  );
}

interface Session {
  id: string; score: number; arrows: number; distance: string; distanceId?: string; distanceLabel?: string; date: string; timestamp: any;
  type?: 'Trening' | 'Turniej' | 'Arena' | 'TECHNICAL' | 'WORLD_BATTLE'; worldResult?: 'WIN' | 'LOSS'; tournamentName?: string;
  note?: string; coachNote?: string; editCount?: number; targetType?: string; ends?: any[]; weather?: any;
  bowClass?: string; // [ZESTAWY] klasa łuku ze stempla — celownik, handicap
  /** [KOLORY STRZAŁ] Seria wpisana w kolejności kolorów — dots[i] = strzała nr i+1. */
  arrowColors?: boolean;
  isNotePublic?: boolean; totalArrows?: number; shotArrows?: number; scoreArrows?: number; sessionArrows?: number; practiceArrows?: number;
  isPartial?: boolean; endsShot?: number; endsPlanned?: number;
}

interface StatsViewProps {
  userId: string;
  onNavigate: any;
  initialDate?: string;
  initialSessionId?: string;
  viewingStudentId?: string | null;
  isEmbedded?: boolean;
}

export default function StatsView({ userId, onNavigate, initialDate, initialSessionId, viewingStudentId, isEmbedded = false }: StatsViewProps) {
  const { t, i18n } = useTranslation();
  // Bitwa klubowa ma własną etykietę zamiast ogólnego „Arena Live”.
  const arenaLabel = (s: any) => s?.battleMode === 'CLUB' ? t('stats.sessionInfo.arenaClub') : t('stats.sessionInfo.arena');
  
  const [activeTab, setActiveTab] = useState<'DAILY' | 'RECORDS' | 'PRO'>('DAILY');

  const [sessions, setSessions] = useState<Session[]>([]);
  // Sesje dociągnięte punktowo dla konkretnej daty (skok z archiwum zawodów).
  // Trzymane osobno, bo `sessions` nadpisuje w całości nasłuch onSnapshot.
  const [dayFetchedSessions, setDayFetchedSessions] = useState<Session[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>(initialDate || new Date().toISOString().split('T')[0]);
  const [selectedSessionId, setSelectedSessionId] = useState<string>('');
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [hasAutoSelectedDate, setHasAutoSelectedDate] = useState(false);

  const [isPremium, setIsPremium] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [lastVisible, setLastVisible] = useState<QueryDocumentSnapshot | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [dailyArrows, setDailyArrows] = useState(0);
  const [dailyPfeilzaehler, setDailyPfeilzaehler] = useState(0);
  const [highlightedEnd, setHighlightedEnd] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pendingSessionIdRef = useRef(initialSessionId || '');

  const todayISO = new Date().toISOString().split('T')[0];
  const daysToShow = isPremium ? 1095 : FREE_HISTORY_DAYS;

  const targetUserId = viewingStudentId || userId;
  // [KOLORY] Kolory zestawów właściciela statystyk (u trenera — ucznia).
  const distanceColors = useDistanceColors(targetUserId);

  useEffect(() => {
    const fetchProfile = async () => {
      // Zawsze pobieramy status PRO świeżo z Firestore
      // (SDK używa własnego offline cache, więc przy braku sieci też działa)
      const uDoc = await getDoc(doc(db, 'users', userId));
      const d = uDoc.data();
      if (d) {
        setIsPremium(hasActivePro(d));

        const pz = d.pfeilzaehler || {};
        const today = new Date();
        const todayKey = `${today.getFullYear()}_${String(today.getMonth() + 1).padStart(2, '0')}_${String(today.getDate()).padStart(2, '0')}`;
        setDailyPfeilzaehler(pz[todayKey] || 0);
      }
      // Ręczność (RH/LH) czytała tu karta Biomechanik — przy pojedynczym treningu
      // zastąpił ją Trefferbild (2026-10-29), karta została tylko w Pro Progress.
    };

    fetchProfile();
  }, [userId]);

  useEffect(() => {
    if (!targetUserId) return;
    setIsLoading(true);
    setLastVisible(null);
    setHasMore(true);

    const q = query(
      collection(db, `users/${targetUserId}/sessions`),
      orderBy('timestamp', 'desc'),
      limit(15)
    );

    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as Session));
      setSessions(data);
      setLastVisible(snap.docs[snap.docs.length - 1] || null);
      setHasMore(snap.docs.length === 15);
      setIsLoading(false);
    });

    return () => unsub();
  }, [targetUserId]);

  // Lista sesji jest stronicowana (15 najnowszych, dalej ręcznym przyciskiem),
  // więc skok na starą datę — np. z archiwum zawodów — trafiałby w pusty dzień.
  // Dociągamy ten jeden dzień po zakresie timestamp, obok stronicowania.
  useEffect(() => {
    if (!targetUserId || !initialDate) return;
    let cancelled = false;

    const dayStart = new Date(`${initialDate}T00:00:00`);
    // Zła data (np. "11.09.2026" zamiast ISO) → Timestamp.fromDate rzuca
    // synchronicznie i wywraca cały widok. Wtedy po prostu nie dociągamy dnia.
    if (isNaN(dayStart.getTime())) return;
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);

    getDocs(query(
      collection(db, `users/${targetUserId}/sessions`),
      where('timestamp', '>=', Timestamp.fromDate(dayStart)),
      where('timestamp', '<', Timestamp.fromDate(dayEnd)),
      orderBy('timestamp', 'desc')
    ))
      .then(snap => {
        if (cancelled) return;
        setDayFetchedSessions(snap.docs.map(d => ({ id: d.id, ...d.data() } as Session)));
      })
      .catch(() => { /* dzień pozostanie pusty — nie blokuje reszty widoku */ });

    return () => { cancelled = true; };
  }, [targetUserId, initialDate]);

  // Widok czyta z połączonej listy; duplikaty odpadają po id.
  const allSessions = useMemo(() => {
    if (dayFetchedSessions.length === 0) return sessions;
    const known = new Set(sessions.map(s => s.id));
    const extra = dayFetchedSessions.filter(s => !known.has(s.id));
    return extra.length > 0 ? [...sessions, ...extra] : sessions;
  }, [sessions, dayFetchedSessions]);

  const loadMore = async () => {
    if (!targetUserId || !lastVisible || isLoadingMore || !hasMore) return;
    setIsLoadingMore(true);
    try {
      const q = query(
        collection(db, `users/${targetUserId}/sessions`),
        orderBy('timestamp', 'desc'),
        startAfter(lastVisible),
        limit(15)
      );
      const snap = await getDocs(q);
      const newData = snap.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as Session));
      setSessions(prev => [...prev, ...newData]);
      setLastVisible(snap.docs[snap.docs.length - 1] || null);
      setHasMore(snap.docs.length === 15);
    } catch (e) {
      console.error('Load more error:', e);
    }
    setIsLoadingMore(false);
  };

  const toISO = (d: string) => { 
    if (!d) return '';
    const p = d.split('.'); 
    if (p.length === 3) {
      return `${p[2]}-${p[1].padStart(2, '0')}-${p[0].padStart(2, '0')}`;
    }
    return d; 
  };

  // Grupujemy sesje po dacie ISO raz — pasek dni (do 1095 komórek) i daySessions
  // czytają z mapy zamiast filtrować całą tablicę dla każdego dnia.
  const sessionsByISODate = useMemo(() => {
    const map = new Map<string, Session[]>();
    allSessions.forEach(s => {
      const iso = toISO(s.date);
      const arr = map.get(iso);
      if (arr) arr.push(s); else map.set(iso, [s]);
    });
    return map;
  }, [allSessions]);

  const daySessions = useMemo(() => sessionsByISODate.get(selectedDate) || [], [sessionsByISODate, selectedDate]);

  // Tryb trenera (viewingStudentId): gdy otworzy profil ucznia i dzisiaj nie ma
  // treningu, automatycznie wybierz datę OSTATNIEJ sesji ucznia. Odpala się
  // tylko raz (flaga hasAutoSelectedDate) — nie nadpisuje ręcznego wyboru trenera.
  useEffect(() => {
    if (
      viewingStudentId &&
      !hasAutoSelectedDate &&
      !initialDate &&
      !isLoading &&
      sessions.length > 0 &&
      daySessions.length === 0
    ) {
      const latestDate = toISO(sessions[0].date);
      if (latestDate) {
        setSelectedDate(latestDate);
        setHasAutoSelectedDate(true);
      }
    }
  }, [viewingStudentId, hasAutoSelectedDate, initialDate, isLoading, sessions, daySessions]);

  useEffect(() => {
    setDailyArrows(
      daySessions.reduce((acc, s) => {
        // Nowy model: arrows = sessionArrows + practiceArrows
        // Stary model: arrows = non-M arrows (bez próbnych)
        const total = s.arrows ?? s.totalArrows ?? 0;
        return acc + total;
      }, 0)
      + dailyPfeilzaehler
    );
    if (daySessions.length > 0) {
      if (!daySessions.find(s => s.id === selectedSessionId)) {
        setSelectedSessionId(daySessions[0].id);
      }
    } else {
      setSelectedSessionId('');
      setSelectedSession(null);
    }
  }, [daySessions, dailyPfeilzaehler]);

  useEffect(() => {
    const pending = pendingSessionIdRef.current;
    if (!pending || allSessions.length === 0) return;
    const session = allSessions.find(s => s.id === pending);
    if (!session) return;
    const dateISO = toISO(session.date);
    if (dateISO) setSelectedDate(dateISO);
    setSelectedSessionId(pending);
    pendingSessionIdRef.current = '';
  }, [allSessions]);

  useEffect(() => {
    if (selectedSessionId) {
      const s = allSessions.find(s => s.id === selectedSessionId);
      setSelectedSession(s || null);
      setHighlightedEnd(null);
    }
  }, [selectedSessionId, allSessions]);

  useEffect(() => { if (scrollRef.current && activeTab === 'DAILY') scrollRef.current.scrollLeft = scrollRef.current.scrollWidth; }, [isLoading, activeTab]);

  // Po każdej porcji: jeśli pasek wciąż stoi przy najstarszym końcu albo wybrany
  // dzień jest starszy niż to, co mamy, dociągamy dalej bez czekania na scroll.
  useEffect(() => {
    if (isLoading || isLoadingMore || !hasMore || activeTab !== 'DAILY') return;
    const nearOldEnd = (scrollRef.current?.scrollLeft ?? Infinity) < 300;
    const oldestLoaded = sessions.length > 0 ? toISO(sessions[sessions.length - 1].date) : '';
    if (nearOldEnd || (oldestLoaded && selectedDate < oldestLoaded)) loadMore();
  }, [isLoading, isLoadingMore, hasMore, activeTab, sessions, selectedDate]);

  const handleDeleteSession = async () => {
    if (!selectedSessionId || !userId) return;
    try {
      await deleteDoc(doc(db, `users/${userId}/sessions`, selectedSessionId));
      setShowDeleteModal(false);
      setSelectedSessionId('');
      setSelectedSession(null);
    } catch (error) {
      console.error("Błąd podczas usuwania sesji:", error);
    }
  };

  if (isLoading) return <div className="p-10 text-center animate-pulse text-gray-400 mt-20">{t('stats.loading')}</div>;

  // [FREE 24 h] Pełna analiza: PRO zawsze, FREE przez 24 h od zapisu treningu.
  // Stare sesje bez czasu — jak dawniej: tylko w dniu treningu.
  const sessionMs: number | null = selectedSession?.timestamp?.toMillis?.() ?? (selectedSession?.timestamp?.seconds ? selectedSession.timestamp.seconds * 1000 : null);
  const hasFullAccess = isPremium || (sessionMs ? freeAnalysisOpen(sessionMs) : selectedDate === todayISO);
  
  const currentEnds = selectedSession?.ends || [];
  const roundSize = roundSizeFor(selectedSession);
  const r1Ends = currentEnds.slice(0, roundSize);
  const r2Ends = currentEnds.slice(roundSize, roundSize * 2);

  // [C25] Bylo `distance.includes('18')` — kruche: wlasny dystans z etykieta
  // zawierajaca "18" (np. "7m seria18") wpadal w ten warunek. Teraz porownujemy
  // METRY, a nie fragment napisu.
  // Tarcza z sesji. Wcześniej każda sesja 18 m była pokazywana jako 3-Spot,
  // nawet gdy strzelano na pełną 40 cm albo 122 cm. 3-Spot zostaje tylko dla
  // starych sesji 18 m bez zapisanej tarczy.
  const displayTargetType = selectedSession?.targetType && selectedSession.targetType !== 'Full'
      ? selectedSession.targetType
      : distanceMeters(selectedSession?.distance) === 18 ? '3-Spot' : 'Full';

  // [KOREKTA CELOWNIKA] Łuk z sesji (stempel zestawu) — celownik tylko recurve/compound.
  const sessionHasSight = selectedSession?.bowClass !== BLOWGUN_DISCIPLINE
    && ['RECURVE', 'COMPOUND'].includes(rankBowOf(selectedSession?.bowClass));


  return (
    <div className={`flex flex-col overflow-x-hidden ${isEmbedded ? 'w-full pb-10' : 'h-full bg-[#fcfdfe] pb-32 max-w-md mx-auto'}`}>

      {!isEmbedded && <ViewHeader onBack={() => onNavigate('HOME')} title={t('stats.title')} />}

      <div className={`flex bg-gray-100 p-1 rounded-xl mb-1 shadow-inner ${isEmbedded ? 'mx-0 mt-2' : 'mx-6 mt-4'}`}>
        <button 
          onClick={() => setActiveTab('DAILY')} 
          className={`flex-1 py-2.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'DAILY' ? 'bg-white text-[#0a3a2a] shadow-sm' : 'text-gray-400'}`}
        >
          {t('stats.tabDaily')}
        </button>
        <button
          onClick={() => setActiveTab('RECORDS')}
          className={`flex-1 py-2.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'RECORDS' ? 'bg-white text-[#0a3a2a] shadow-sm' : 'text-gray-400'}`}
        >
          {t('stats.tabRecords')}
        </button>
        <button
          onClick={() => setActiveTab('PRO')}
          className={`flex-1 py-2.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-1.5 ${activeTab === 'PRO' ? 'bg-[#0a3a2a] text-[#fed33e] shadow-md' : 'text-gray-400'}`}
        >
          <span className={`material-symbols-outlined text-[14px] ${activeTab === 'PRO' ? 'text-[#fed33e]' : 'text-yellow-500'}`}>diamond</span>
          {t('stats.tabPro')}
        </button>
      </div>

      {activeTab === 'RECORDS' && (
        <TournamentRecordsView
          userId={targetUserId}
          isPremium={isPremium}
          onNavigate={onNavigate}
        />
      )}

      {activeTab === 'PRO' && (
        <ProStatsView
          userId={targetUserId}
          isPremium={isPremium}
          onNavigate={onNavigate}
          onOpenSession={(sessionId, date) => {
            const iso = toISO(date);
            if (iso) setSelectedDate(iso);
            setSelectedSessionId(sessionId);
            setActiveTab('DAILY');
          }}
        />
      )}

      {activeTab === 'DAILY' && (
        <>
          <div className={`mb-2 ${isEmbedded ? 'px-0' : 'px-2'}`}>
            {/* Starsze treningi dociągamy same, gdy pasek dni zbliża się do lewego
                (najstarszego) końca — dawny przycisk „załaduj więcej” był pod
                szczegółami dnia i nie było widać, co zmienia. */}
            <div
              ref={scrollRef}
              onScroll={(e) => { if (e.currentTarget.scrollLeft < 300) loadMore(); }}
              className="flex gap-2 overflow-x-auto hide-scrollbar pt-4 pb-2 px-2 snap-x"
            >
              {Array.from({ length: daysToShow }, (_, i) => {
                const d = new Date(); d.setDate(d.getDate() - i);
                const dStr = d.toISOString().split('T')[0];
                const dayActs = sessionsByISODate.get(dStr) || [];
                const isSel = selectedDate === dStr;
                
                let bg = "bg-white", txt = "text-gray-400", brd = "border-gray-100";
                
                let displayScore: number | null = null;

                if (dayActs.length > 0) {
                  const hasTournament = dayActs.some(a => a.type === 'Turniej');
                  const hasArena = dayActs.some(a => a.type === 'Arena');
                  const hasNormalTraining = dayActs.some(a => a.type !== 'Turniej' && a.type !== 'Arena' && a.type !== 'TECHNICAL');
                  const hasTech = dayActs.some(a => a.type === 'TECHNICAL');
                  const hasWorld = dayActs.some(a => a.type === 'WORLD_BATTLE');

                  if (hasTournament) { bg = "bg-[#0a3a2a]"; txt = "text-white"; brd = "border-[#0a3a2a]"; }
                  else if (hasArena) { bg = "bg-blue-500"; txt = "text-white"; brd = "border-blue-500"; }
                  else if (hasNormalTraining) { bg = "bg-[#fed33e]"; txt = "text-[#5d4a00]"; brd = "border-[#e5bd38]"; }
                  else if (hasTech) { bg = "bg-emerald-100"; txt = "text-emerald-700"; brd = "border-emerald-300"; }

                  const scoredSessions = hasTournament
                    ? dayActs.filter(a => a.type === 'Turniej')
                    : hasNormalTraining
                    ? dayActs.filter(a => a.type !== 'Turniej' && a.type !== 'Arena' && a.type !== 'TECHNICAL')
                    : hasArena
                    ? dayActs.filter(a => a.type === 'Arena')
                    : [];
                  const scores = scoredSessions.map(a => a.score || 0).filter(s => s > 0);
                  if (scores.length > 0) displayScore = Math.max(...scores);
                }

                return (
                  <div key={dStr} className="relative flex-shrink-0 flex flex-col items-center gap-1 snap-center">
                    <button onClick={() => setSelectedDate(dStr)} className={`relative w-12 h-16 rounded-2xl flex flex-col items-center justify-center transition-all border-2 ${bg} ${txt} ${brd} ${isSel ? 'scale-110 shadow-lg ring-2 ring-emerald-500/50 z-10' : 'opacity-80 active:scale-95'} ${dayActs.length === 0 ? 'opacity-30 border-dashed border-gray-200' : ''}`}>
                      <span className="text-[7px] font-black uppercase mb-1 opacity-70">{d.toLocaleDateString(i18n.language === 'pl' ? 'pl-PL' : i18n.language === 'de' ? 'de-DE' : 'en-US', { weekday: 'short' })}</span>
                      <span className="text-lg font-black leading-none">{dStr.split('-')[2]}</span>
                      {dayActs.length > 1 && (
                        <span className={`absolute -top-1 -right-1 w-3 h-3 rounded-full text-[6px] font-black flex items-center justify-center text-white ${dayActs.some(a => a.type === 'TECHNICAL') && dayActs.some(a => a.type !== 'TECHNICAL') ? 'bg-purple-500' : 'bg-red-500'}`}>
                          {dayActs.length}
                        </span>
                      )}
                    </button>
                    {displayScore !== null ? (
                      <span className="text-[9px] font-black leading-none text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded-md">{displayScore}</span>
                    ) : (
                      <span className="h-[18px]" />
                    )}
                  </div>
                );
              }).reverse()}
            </div>
          </div>

          {daySessions.length > 1 && (
            <div className={`mb-4 flex gap-2 overflow-x-auto hide-scrollbar ${isEmbedded ? 'px-0' : 'px-6'}`}>
              {daySessions.map((sess, idx) => {
                 const isTech = sess.type === 'TECHNICAL';
                 const isActive = selectedSessionId === sess.id;
                 const btnBg = isActive ? (isTech ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-[#0a3a2a] text-white border-[#0a3a2a]') : 'bg-white text-gray-400 border-gray-100';

                 return (
                   <button key={sess.id} onClick={() => setSelectedSessionId(sess.id)} className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all shrink-0 border shadow-sm flex items-center gap-1 ${btnBg}`}>
                     {isTech && <span className="material-symbols-outlined text-[12px]">fitness_center</span>}
                     {sess.type === 'Turniej' ? t('stats.sessionInfo.tournament') : sess.type === 'Arena' ? arenaLabel(sess) : sess.type === 'TECHNICAL' ? 'TECH' : sess.type === 'WORLD_BATTLE' ? (sess.worldResult === 'WIN' ? t('stats.sessionInfo.worldTabWin') : t('stats.sessionInfo.worldTabLoss')) : t('stats.sessionInfo.solo')} {idx > 0 && `(#${idx+1})`}
                   </button>
                 );
              })}
            </div>
          )}

          {selectedSession ? (
            <div className={`space-y-4 animate-fade-in-up pb-20 ${isEmbedded ? 'px-0' : 'px-4'}`}>
              
              {selectedSession.type === 'TECHNICAL' ? (
                <TechSessionCard
                  session={selectedSession}
                  canDelete={!viewingStudentId}
                  onDelete={() => setShowDeleteModal(true)}
                  userId={viewingStudentId ? undefined : userId}
                  noteComponent={<NoteModule session={selectedSession} userId={userId} viewingStudentId={viewingStudentId} />}
                />
              ) : (
                // Styl kart dziennika (2026-10-29): bez wielkiej białej ramki — każda
                // sekcja to osobna karta z paskiem; nagłówek jak karta treningu w dzienniku.
                <div className="space-y-3">
                  <div className={`tb-card ${selectedSession.type === 'Turniej' ? 'tb-tourney' : 'tb-d2'} border rounded-l-md rounded-r-2xl shadow-sm pl-2 pr-3 py-3`}>
                    <div className="flex items-start gap-2.5">
                      <span className={`${selectedSession.type === 'Turniej' ? 'tb-tourney-icon' : 'tb-icon'} w-8 h-8 rounded-lg flex items-center justify-center shrink-0`}>
                        <span className={`material-symbols-outlined text-[18px] ${selectedSession.type === 'Turniej' ? 'tb-tourney-accent' : selectedSession.type === 'Arena' || selectedSession.type === 'WORLD_BATTLE' ? 'text-fuchsia-600' : 'text-emerald-600'}`}>{selectedSession.type === 'Turniej' ? 'emoji_events' : selectedSession.type === 'Arena' || selectedSession.type === 'WORLD_BATTLE' ? 'shield' : 'target'}</span>
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <span className="block min-w-0">
                            <span className="block text-[9px] font-black uppercase tracking-widest leading-tight text-emerald-700">
                              {selectedSession.type === 'Turniej' ? t('stats.sessionInfo.tournament') : selectedSession.type === 'Arena' ? arenaLabel(selectedSession) : selectedSession.type === 'WORLD_BATTLE' ? t('stats.sessionInfo.worldBattle') : t('stats.sessionInfo.typeSolo')}
                            </span>
                            <span className="block text-[15px] font-black leading-snug text-[#0a3a2a] truncate">
                              {selectedSession.type === 'Turniej' ? (selectedSession.tournamentName || t('stats.sessionInfo.defaultTournament')) : selectedSession.type === 'Arena' ? arenaLabel(selectedSession) : selectedSession.type === 'WORLD_BATTLE' ? (selectedSession.worldResult === 'WIN' ? t('stats.sessionInfo.worldWin') : t('stats.sessionInfo.worldLoss')) : t('stats.sessionInfo.solo')}
                            </span>
                          </span>
                          <span className="shrink-0 bg-emerald-50 text-emerald-700 px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase">{displayTargetType || t('stats.sessionInfo.dynamic')}</span>
                        </div>
                        <p className="text-[10px] text-gray-500 font-bold flex items-center gap-1 mt-0.5">
                          {selectedSession.date} •
                          {/* [KOLORY] Kropka zestawu — odróżnia czerwone „18m" od niebieskiego. */}
                          {distanceColors.has(distanceKey(selectedSession)) && (
                            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: distanceColors.get(distanceKey(selectedSession)) }} />
                          )}
                          {sessionDistanceLabel(selectedSession)}
                        </p>
                        {/* [C31] Niepełny trening — suma nie wchodzi do krzywych i średnich „na trening". */}
                        {isPartialSession(selectedSession) && (
                          <span className="inline-flex items-center gap-1 mt-1 text-[9px] font-black text-amber-700 bg-amber-100 rounded-full px-2 py-0.5 uppercase tracking-wide">
                            <span className="material-symbols-outlined text-[12px]">hourglass_top</span>
                            {isShortPlanned(selectedSession)
                              ? t('stats.shortBadge', { count: selectedSession.endsPlanned })
                              : t('stats.partialBadge', { label: partialLabel(selectedSession) })}
                          </span>
                        )}
                        {/* Wynik, średnia i strzały dnia w jednym wierszu, bez szarych kafli. */}
                        <div className="grid grid-cols-3 mt-2.5 pt-2.5 border-t border-gray-100 text-center">
                          <div><span className="block text-[8px] font-black text-gray-400 uppercase tracking-widest">{t('stats.cards.score')}</span><span className="text-xl font-black text-[#0a3a2a] tabular-nums">{selectedSession.score || 0}</span></div>
                          <div className="border-x border-gray-100"><span className="block text-[8px] font-black text-gray-400 uppercase tracking-widest">{t('stats.cards.average')}</span><span className="text-xl font-black text-[#0a3a2a] tabular-nums">{((selectedSession.score || 0) / (selectedSession.scoreArrows || selectedSession.arrows || 1)).toFixed(2)}</span></div>
                          <div><span className="block text-[8px] font-black text-gray-400 uppercase tracking-widest">{t('stats.cards.dailyArrows', 'Strzały dzisiaj')}</span><span className="text-xl font-black text-emerald-600 tabular-nums">{dailyArrows}</span></div>
                        </div>
                      </div>
                    </div>
                  </div>


                  {/* [FOKUS] Migawka z chwili treningu — patrz utils/focus.ts */}
                  <div className="empty:hidden"><SessionFocusCard session={selectedSession} /></div>

                  <NoteModule session={selectedSession} userId={userId} viewingStudentId={viewingStudentId} />

                    <div className="space-y-3">
                      {/* FREE (dowolny dzień z okna FREE_HISTORY_DAYS): pogoda, rozbicie X/10/9,
                          tabela rund, przebieg serii — surowe dane własnej sesji. */}
                      {selectedSession.weather && (
                        <div className="flex gap-3 bg-gray-50/50 p-2 rounded-xl w-max border border-gray-100">
                          <div className="flex items-center gap-1"><span className="material-symbols-outlined text-sm text-blue-400">device_thermostat</span><span className="text-[10px] font-black">{selectedSession.weather.temp}°C</span></div>
                          <div className="flex items-center gap-1"><span className="material-symbols-outlined text-sm text-gray-400">air</span><span className="text-[10px] font-black">{selectedSession.weather.wind} km/h</span></div>
                        </div>
                      )}

                      {/* [PODSUMOWANIE] Ten sam układ co po treningu (user 2026-10-29):
                          Bilanz → tabela serii → Trend z wybraną serią → Trefferbild → eksport.
                          [FREE 24 h] PRO zawsze; FREE przez 24 h od treningu (proAccess),
                          potem same zwinięte, zablokowane nagłówki kart. */}
                      {hasFullAccess ? (
                      <>
                      {currentEnds.length > 0 && (
                        <SessionBilanz
                          userId={targetUserId}
                          ends={currentEnds}
                          roundSize={roundSize}
                          distance={selectedSession.distance || ''}
                          distanceId={selectedSession.distanceId}
                          targetType={displayTargetType}
                          bowClass={selectedSession.bowClass}
                          sessionId={selectedSession.id}
                          beforeTs={sessionMs ?? undefined}
                        />
                      )}

                      <RoundDetailTable r1Ends={r1Ends} r2Ends={r2Ends} t={t} />

                      <TrendCard ends={currentEnds} highlighted={highlightedEnd} onPick={setHighlightedEnd} roundSize={roundSize} arrowColors={!!selectedSession?.arrowColors} storageKey="stats-trend" />

                      {/* Jedna duża tarcza jak po treningu; heatmapa w karcie zamiast okienka. */}
                      <TargetCard
                        key={selectedSession.id}
                        ends={currentEnds}
                        roundSize={roundSize}
                        targetType={displayTargetType}
                        arrowColors={!!selectedSession?.arrowColors}
                        highlightedEnd={highlightedEnd}
                        sightHint={sessionHasSight}
                        heatmap
                        storageKey="stats-target"
                      />
                      {AI_ENABLED && <CoachAIPanel userId={targetUserId} totalScore={selectedSession.score || 0} arrowCount={selectedSession.arrows || 1} accuracy={(((selectedSession.score || 0) / ((selectedSession.arrows || 1) * 10)) * 100).toFixed(1)} />}

                      {/* Eksport: PDF dla każdego w oknie analizy, CSV tylko PRO (ExportPanel). */}
                      {!viewingStudentId && (
                        <div className="tb-card tb-d1 border rounded-l-md rounded-r-2xl shadow-sm overflow-hidden">
                          <ExportPanel
                            session={selectedSession}
                            isPremium={isPremium}
                            onTriggerPaywall={() => onNavigate('SETTINGS', 'PRO')}
                            roundSize={roundSize}
                            targetType={displayTargetType}
                            sightHint={sessionHasSight}
                          />
                        </div>
                      )}
                      </>
                      ) : (
                      <>
                        {/* Po 24 h (FREE): krótka informacja i zwinięte, zablokowane karty. */}
                        <div className="flex items-start gap-2 px-1">
                          <span className="material-symbols-outlined text-[16px] text-[#8a6d00] shrink-0">schedule</span>
                          <p className="text-[11px] font-bold text-gray-500 leading-snug">{t('stats.locked.hint', { hours: FREE_ANALYSIS_HOURS })}</p>
                        </div>
                        {[
                          { icon: 'insights', kind: t('scoring.bilanz.title'), stripe: 'tb-d3' },
                          { icon: 'table_chart', kind: t('stats.cards.detailTable'), stripe: 'tb-d1' },
                          { icon: 'bar_chart', kind: t('scoring.trendTitle'), stripe: 'tb-d2' },
                          { icon: 'adjust', kind: t('scoring.targetCard'), stripe: 'tb-d2' },
                          ...(!viewingStudentId ? [{ icon: 'ios_share', kind: t('export.title', 'Eksport Danych'), stripe: 'tb-d1' }] : []),
                        ].map(c => (
                          <LockedCard key={c.kind} icon={c.icon} kind={c.kind} stripe={c.stripe} onUnlock={() => onNavigate('SETTINGS', 'PRO')} />
                        ))}
                      </>
                      )}

                      {!viewingStudentId && (
                        <button
                          onClick={() => setShowDeleteModal(true)}
                          className="mt-2 w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-red-50 text-red-500 font-black text-[10px] uppercase tracking-widest active:scale-95 transition-all border border-red-100"
                        >
                          <span className="material-symbols-outlined text-[16px]">delete</span>
                          {t('stats.deleteSession', 'Usuń ten trening')}
                        </button>
                      )}

                    </div>
                </div>
              )}

            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-20 opacity-20">
              <span className="material-symbols-outlined text-6xl mb-2">event_busy</span>
              <p className="font-black uppercase text-[10px] tracking-widest text-center px-10">{t('stats.noSessions')}</p>
            </div>
          )}
        </>
      )}


      {/* PSYCHOLOGICZNY MODAL USUWANIA */}
      {showDeleteModal && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100000] flex items-center justify-center p-4 animate-fade-in" onClick={() => setShowDeleteModal(false)}>
          <div className="bg-white rounded-[32px] p-6 w-full max-w-[400px] shadow-2xl relative" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-full bg-[#0a3a2a] flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-[#fed33e]">delete</span>
              </div>
              <div>
                <span className="text-[10px] font-black text-emerald-600 uppercase tracking-[0.2em] block leading-tight">{t('stats.deleteAnalyzing', 'Na pewno usunąć?')}</span>
              </div>
            </div>
            
            <p className="text-[13px] text-gray-600 font-medium mb-6 leading-relaxed">
              {t('stats.deleteWarning', 'Pamiętaj, że mistrzostwo buduje się na błędach. Każdy kiepski wynik to informacja, nie powód do wstydu. Z tych zapisów widać wzorce, które pomagają poprawić formę.')}
            </p>

            <div className="flex flex-col gap-2">
              <button 
                onClick={() => setShowDeleteModal(false)}
                className="w-full py-3.5 bg-[#0a3a2a] text-[#fed33e] rounded-xl text-[10px] font-black uppercase tracking-widest active:scale-95 transition-all shadow-md"
              >
                {t('stats.deleteCancel', 'Masz rację. Zostawiam ten wynik.')}
              </button>
              <button 
                onClick={handleDeleteSession}
                className="w-full py-3.5 bg-red-50 text-red-500 rounded-xl text-[10px] font-black uppercase tracking-widest active:scale-95 transition-all border border-red-100"
              >
                {t('stats.deleteConfirm', 'Tak, mimo to usuń ten trening.')}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      <style>{`.hide-scrollbar::-webkit-scrollbar { display: none; } .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; } .animate-fade-in-up { animation: fadeInUp 0.4s ease-out forwards; } @keyframes fadeInUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } } .animate-fade-in { animation: fadeIn 0.2s ease-out; } @keyframes fadeIn { from { opacity: 0; transform: translateY(-5px); } to { opacity: 1; transform: translateY(0); } }`}</style>
    </div>
  );
}