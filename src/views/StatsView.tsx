import React, { useState, useEffect, useRef, useMemo } from 'react';
import { db } from '../firebase';
import { collection, query, orderBy, limit, doc, getDoc, deleteDoc, updateDoc, onSnapshot } from 'firebase/firestore';
import { useTranslation } from 'react-i18next';
import SessionTrend from '../components/SessionTrend';
import CoachAIPanel from '../components/CoachAIPanel';
import RoundTargetSummary from '../components/RoundTargetSummary';
import ProStatsView from '../components/ProStatsView';
import ExportPanel from '../components/ExportPanel';
import TechSessionCard from '../components/TechSessionCard';
import { createPortal } from 'react-dom';

// Status PRO jest odczytywany zawsze świeżo z Firestore (SDK ma własny offline cache w IndexedDB)
// Nie używamy tu localStorage — admin może zmienić status w dowolnej chwili

const calculateHits = (ends: any[]) => {
  let x = 0, ten = 0, nine = 0;
  ends.forEach(end => {
    end.arrows?.forEach((a: string) => {
      if (a === 'X') { x++; ten++; }
      else if (a === '10') ten++;
      else if (a === '9') nine++;
    });
  });
  return { x, ten, nine };
};

const getArrowBg = (val: string) => {
  if (['X', '10', '9'].includes(val)) return 'bg-[#F2C94C] text-[#333] shadow-sm';
  if (['8', '7'].includes(val)) return 'bg-[#EB5757] text-white shadow-sm';
  if (['6', '5'].includes(val)) return 'bg-[#2F80ED] text-white shadow-sm';
  if (['4', '3'].includes(val)) return 'bg-[#333] text-white shadow-sm';
  if (val === 'M') return 'bg-purple-900 text-white shadow-sm';
  return 'bg-gray-100 text-gray-400';
};

const calculateSpread = (ends: any[], targetType: string) => {
  const dxArr: number[] = [];
  const dyArr: number[] = [];

  ends.forEach(end => {
    end.dots?.forEach((dot: any) => {
      if (dot.x === null || dot.y === null) return;
      let cX = 150, cY = 150;
      if (targetType === '3-Spot' || targetType === 'Vertical 3-Spot' || targetType === '3-Spot (Vertical)') {
        cX = dot.x < 150 ? 75 : 225;
        if (dot.y < 133) cY = 66;
        else if (dot.y < 266) cY = 200;
        else cY = 333;
      } 
      dxArr.push(dot.x - cX);
      dyArr.push(dot.y - cY);
    });
  });

  if (dxArr.length === 0) return null;

  const avgDx = dxArr.reduce((a, b) => a + b, 0) / dxArr.length;
  const avgDy = dyArr.reduce((a, b) => a + b, 0) / dyArr.length;
  const varX = dxArr.reduce((a, b) => a + Math.pow(b - avgDx, 2), 0) / dxArr.length;
  const varY = dyArr.reduce((a, b) => a + Math.pow(b - avgDy, 2), 0) / dyArr.length;
  const stdX = Math.sqrt(varX);
  const stdY = Math.sqrt(varY);

  let hKey = "stats.pro.zones.center"; 
  if (avgDx > 5) hKey = "stats.pro.zones.right";
  if (avgDx < -5) hKey = "stats.pro.zones.left";

  let vKey = "stats.pro.zones.center";
  if (avgDy > 5) vKey = "stats.pro.zones.down";
  if (avgDy < -5) vKey = "stats.pro.zones.up";

  let errorKey = "stats.pro.zones.symm";
  if (stdX > stdY * 1.3) errorKey = "stats.pro.zones.horiz";
  if (stdY > stdX * 1.3) errorKey = "stats.pro.zones.vert";

  return { hKey, vKey, errorKey };
};

function LargeTargetSVG({ ends, targetType, activeEnd }: { ends: any[], targetType: string, activeEnd: number | null }) {
  const isFullFace = ['Full', 'WA 80cm', '122cm', '80cm', '60cm', '40cm'].includes(targetType);
  const is3Spot = targetType === '3-Spot' || targetType === 'Vertical 3-Spot' || targetType === '3-Spot (Vertical)';

  const renderSpot = (cx: number, cy: number) => (
    <g key={`${cx}-${cy}`}>
      <circle cx={cx} cy={cy} r="62.5" fill="#2F80ED" stroke="#333" strokeWidth="0.5" />
      <circle cx={cx} cy={cy} r="50" fill="#2F80ED" stroke="#333" strokeWidth="0.5" />
      <circle cx={cx} cy={cy} r="37.5" fill="#EB5757" stroke="#333" strokeWidth="0.5" />
      <circle cx={cx} cy={cy} r="25" fill="#EB5757" stroke="#333" strokeWidth="0.5" />
      <circle cx={cx} cy={cy} r="12.5" fill="#F2C94C" stroke="#333" strokeWidth="0.5" />
      <circle cx={cx} cy={cy} r="6.25" fill="#F2C94C" stroke="#333" strokeWidth="0.5" />
    </g>
  );

  const renderDots = (end: any, localIdx: number, isHighlighted: boolean) => {
    const opacity = isHighlighted ? 1 : 0.15;
    const radius = isHighlighted ? "7" : "4"; 
    const strokeWidth = isHighlighted ? "1.5" : "0.5";
    const fillColor = isHighlighted ? "#fed33e" : "white";
    return end.dots?.map((dot: any, dotIdx: number) => {
      if (dot.x == null || dot.y == null) return null;
      const arrowNumber = dot.order || dotIdx + 1;
      return (
        <g key={`${localIdx}-${dotIdx}`} style={{ opacity, transition: 'all 0.3s ease' }}>
          <circle cx={dot.x} cy={dot.y} r={radius} fill={fillColor} stroke="#0a3a2a" strokeWidth={strokeWidth} />
          {isHighlighted && (
            <text x={dot.x} y={dot.y} fontSize="8" fontWeight="black" textAnchor="middle" dominantBaseline="central" fill="#0a3a2a" style={{ pointerEvents: 'none' }}>{arrowNumber}</text>
          )}
        </g>
      );
    });
  };

  return (
    <svg viewBox={!isFullFace ? "0 0 300 400" : "0 0 300 300"} className="w-full h-auto max-h-[55vh]">
      {isFullFace ? (
        <g>
          <circle cx="150" cy="150" r="150" fill="white" stroke="#333" strokeWidth="1" /><circle cx="150" cy="150" r="135" fill="white" stroke="#333" strokeWidth="1" /><circle cx="150" cy="150" r="120" fill="#333" stroke="#fff" strokeWidth="1" /><circle cx="150" cy="150" r="105" fill="#333" stroke="#fff" strokeWidth="1" /><circle cx="150" cy="150" r="90" fill="#2F80ED" stroke="#333" strokeWidth="1" /><circle cx="150" cy="150" r="75" fill="#2F80ED" stroke="#333" strokeWidth="1" /><circle cx="150" cy="150" r="60" fill="#EB5757" stroke="#333" strokeWidth="1" /><circle cx="150" cy="150" r="45" fill="#EB5757" stroke="#333" strokeWidth="1" /><circle cx="150" cy="150" r="30" fill="#F2C94C" stroke="#333" strokeWidth="1" /><circle cx="150" cy="150" r="15" fill="#F2C94C" stroke="#333" strokeWidth="1" /><circle cx="150" cy="150" r="7.5" fill="#F2C94C" stroke="#333" strokeWidth="1" />
        </g>
      ) : is3Spot ? (
        <g>
          <rect x="5" y="0" width="140" height="400" fill="#e8eaed" rx="8" stroke="#d1d5db" strokeWidth="2" />
          <rect x="155" y="0" width="140" height="400" fill="#e8eaed" rx="8" stroke="#d1d5db" strokeWidth="2" />
          {[66, 200, 333].map(cy => renderSpot(75, cy))}
          {[66, 200, 333].map(cy => renderSpot(225, cy))}
        </g>
      ) : (
        <g>
          <rect x="75" y="0" width="150" height="400" fill="#e8eaed" rx="8" stroke="#d1d5db" strokeWidth="2" />
          {[66, 200, 333].map(cy => renderSpot(150, cy))}
        </g>
      )}
      {ends.map((end: any, localIdx: number) => (activeEnd === null || activeEnd === localIdx ? null : renderDots(end, localIdx, false)))}
      {ends.map((end: any, localIdx: number) => (activeEnd !== null && activeEnd !== localIdx ? null : renderDots(end, localIdx, true)))}
    </svg>
  );
}

function TargetZoomModal({ roundTitle, ends, targetType, onClose, t }: any) {
  const [activeEnd, setActiveEnd] = useState<number | null>(null);
  if (typeof document === 'undefined') return null;
  return createPortal(
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100000] flex items-center justify-center p-4 transition-opacity duration-300" onClick={onClose}>
      <div className="bg-white rounded-[32px] p-6 w-full max-w-[500px] h-[85vh] shadow-2xl relative flex flex-col items-center border border-gray-100" onClick={e => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-5 right-5 p-2 bg-gray-100 text-gray-500 rounded-full active:scale-90 transition-all z-10">
          <span className="material-symbols-outlined font-bold text-xl">close</span>
        </button>
        <div className="text-center mb-6 w-full px-8 mt-2">
           <span className="text-[10px] font-black text-emerald-600 uppercase tracking-[0.2em] mb-1 block">{t('stats.zoom.title', 'Podgląd Rozrzutu')}</span>
           <h3 className="text-xl font-black text-[#0a3a2a] leading-tight block">{roundTitle}</h3>
        </div>
        <div className="flex gap-1.5 mb-6 justify-center w-full overflow-x-auto hide-scrollbar px-2 shrink-0">
          <button onClick={() => setActiveEnd(null)} className={`px-3 py-2 rounded-xl text-[10px] font-black transition-all ${activeEnd === null ? 'bg-[#0a3a2a] text-white shadow-md' : 'bg-gray-100 text-gray-500 active:bg-gray-200'}`}>{t('stats.zoom.all', 'WSZYSTKIE')}</button>
          {ends.map((_: any, i: number) => (
            <button key={i} onClick={() => setActiveEnd(i)} className={`w-10 py-2 rounded-xl text-[10px] font-black transition-all flex items-center justify-center ${activeEnd === i ? 'bg-[#fed33e] text-[#0a3a2a] shadow-md border border-[#e5bd38]' : 'bg-gray-100 text-gray-500 active:bg-gray-200 border border-transparent'}`}>P{i + 1}</button>
          ))}
        </div>
        <div className="flex-1 w-full flex flex-col items-center justify-start bg-gray-50 rounded-2xl border border-gray-100 p-2 overflow-hidden">
          <div className="w-full pt-4">
            <LargeTargetSVG ends={ends} targetType={targetType} activeEnd={activeEnd} />
          </div>
        </div>
      </div>
    </div>, document.body
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// NOWOŚĆ: FUNKCJA DO KLIKALNYCH LINKÓW (Wyłapuje URL i renderuje tag <a>)
// ─────────────────────────────────────────────────────────────────────────────
const renderWithLinks = (text: string) => {
  if (!text) return null;
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = text.split(urlRegex);
  return parts.map((part, i) => 
    part.match(urlRegex) ? (
      <a 
        key={i} 
        href={part} 
        target="_blank" 
        rel="noopener noreferrer" 
        className="text-blue-600 font-bold underline break-words hover:text-blue-800 transition-colors" 
        onClick={e => e.stopPropagation()}
      >
        {part}
      </a>
    ) : (
      <span key={i}>{part}</span>
    )
  );
};

function NoteModule({ session, userId, viewingStudentId }: any) {
  const { t } = useTranslation();
  const [isEditing, setIsEditing] = useState(false);
  const [text, setText] = useState(session.note || '');
  const [isNotePublic, setIsNotePublic] = useState(session.isNotePublic ?? true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setText(session.note || '');
    setIsNotePublic(session.isNotePublic ?? true);
    setIsEditing(false);
  }, [session.id, session.note, session.isNotePublic]);

  const edits = session.editCount || 0;
  const canEdit = !viewingStudentId && edits < 2;

  const handleSave = async () => {
    const cleanText = text.trim().slice(0, 250); // Zwiększony limit znaków do 250!
    if (!cleanText && !session.note && isNotePublic === session.isNotePublic) { 
        setIsEditing(false); 
        return; 
    }
    
    setIsSaving(true);
    try {
      await updateDoc(doc(db, `users/${userId}/sessions`, session.id), {
        note: cleanText,
        isNotePublic: isNotePublic,
        editCount: edits + 1
      });
      setIsEditing(false);
    } catch(e) { console.error(e); }
    setIsSaving(false);
  };

  if (!session.note && !session.coachNote && viewingStudentId) return null;

  return (
    <div className="flex flex-col gap-2 w-full mt-2 mb-4">
       {(session.note || !viewingStudentId) && (
         <div className="bg-emerald-50/50 border border-emerald-100 rounded-xl p-4 relative shadow-sm">
            <div className="flex justify-between items-center mb-2.5">
              <span className="text-[10px] font-black text-emerald-700 uppercase tracking-widest flex items-center gap-1">
                 {viewingStudentId ? t('stats.studentFindings') : t('stats.yourNotes')}
                 {!viewingStudentId && session.note && (
                    <span className="material-symbols-outlined text-[12px] opacity-60" title={session.isNotePublic !== false ? t('stats.sharedWithCoach') : t('stats.private')}>
                        {session.isNotePublic !== false ? 'visibility' : 'visibility_off'}
                    </span>
                 )}
                 {canEdit && !isEditing ? <span className="text-[8px] opacity-50 ml-1">({2 - edits} edycje)</span> : ''}
              </span>
              {canEdit && !isEditing && (
                <button onClick={() => setIsEditing(true)} className="text-emerald-500 hover:text-emerald-700 active:scale-90 transition-all bg-white rounded-md p-1 shadow-sm border border-emerald-100">
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
                     <button onClick={() => { setIsEditing(false); setText(session.note || ''); setIsNotePublic(session.isNotePublic ?? true); }} className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-3 py-2 active:scale-95">{t('setup.warningCancel')}</button>
                     <button onClick={handleSave} disabled={isSaving || (!text.trim() && isNotePublic === session.isNotePublic)} className="text-[10px] font-black bg-emerald-600 text-white px-5 py-2 rounded-xl shadow-sm uppercase tracking-widest disabled:opacity-50 active:scale-95 transition-all">{isSaving ? t('common.saving') : t('stats.saveNote')}</button>
                  </div>
                </div>
              </div>
            ) : (
              // POWIĘKSZONA CZCIONKA, BRAK KROJU ITALIC, AKTYWNE LINKI
              <div className="text-[14px] text-[#0a3a2a] font-medium leading-relaxed">
                {session.note ? (
                  <>{renderWithLinks(session.note)}</>
                ) : (
                  <span className="text-emerald-600/50 font-medium text-[12px] italic">{t('stats.noNote', 'Brak notatki. Pamiętaj, by zostawiać wnioski.')}</span>
                )}
              </div>
            )}
         </div>
       )}

       {session.coachNote && (
         <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 relative mt-2 shadow-sm">
            <div className="flex items-center gap-1.5 mb-2">
              <span className="material-symbols-outlined text-[16px] text-blue-500">sports</span>
              <span className="text-[10px] font-black text-blue-700 uppercase tracking-widest">{t('stats.coachTip', 'Wskazówka Trenera')}</span>
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
  id: string; score: number; arrows: number; distance: string; date: string; timestamp: any;
  type?: 'Trening' | 'Turniej' | 'Arena' | 'TECHNICAL' | 'WORLD_BATTLE'; worldResult?: 'WIN' | 'LOSS'; tournamentName?: string;
  note?: string; coachNote?: string; editCount?: number; targetType?: string; ends?: any[]; weather?: any;
  isNotePublic?: boolean; totalArrows?: number;
}

interface StatsViewProps {
  userId: string;
  onNavigate: any;
  initialDate?: string;
  viewingStudentId?: string | null;
  isEmbedded?: boolean;
}

export default function StatsView({ userId, onNavigate, initialDate, viewingStudentId, isEmbedded = false }: StatsViewProps) {
  const { t, i18n } = useTranslation();
  
  const [activeTab, setActiveTab] = useState<'DAILY' | 'PRO'>('DAILY');

  const [sessions, setSessions] = useState<Session[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>(initialDate || new Date().toISOString().split('T')[0]);
  const [selectedSessionId, setSelectedSessionId] = useState<string>('');
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [hasAutoSelectedDate, setHasAutoSelectedDate] = useState(false);

  const [isPremium, setIsPremium] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [dailyArrows, setDailyArrows] = useState(0);
  const [highlightedEnd, setHighlightedEnd] = useState<number | null>(null);
  const [zoomedRoundData, setZoomedRoundData] = useState<any>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const todayISO = new Date().toISOString().split('T')[0];
  const daysToShow = isPremium ? 1095 : 30;

  const targetUserId = viewingStudentId || userId;

  useEffect(() => {
    const fetchProfile = async () => {
      // Zawsze pobieramy status PRO świeżo z Firestore
      // (SDK używa własnego offline cache, więc przy braku sieci też działa)
      const uDoc = await getDoc(doc(db, 'users', userId));
      const d = uDoc.data();
      if (d) {
        const isBought = d.isPremium || false;
        const isPromo = d.isPremiumPromo || false;
        let isTrial = false;
        if (d.trialEndsAt) {
          isTrial = new Date(d.trialEndsAt).getTime() > Date.now();
        }
        setIsPremium(isBought || isPromo || isTrial);
      }
    };

    fetchProfile();
  }, [userId]);

  useEffect(() => {
    if (!targetUserId) return;
    setIsLoading(true);

    const q = query(
      collection(db, `users/${targetUserId}/sessions`),
      orderBy('timestamp', 'desc'),
      limit(150)
    );

    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as Session));
      setSessions(data);
      setIsLoading(false);
    });

    return () => unsub();
  }, [targetUserId]);

  const toISO = (d: string) => { 
    if (!d) return '';
    const p = d.split('.'); 
    if (p.length === 3) {
      return `${p[2]}-${p[1].padStart(2, '0')}-${p[0].padStart(2, '0')}`;
    }
    return d; 
  };

  const daySessions = useMemo(() => sessions.filter(s => toISO(s.date) === selectedDate), [sessions, selectedDate]);

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
    setDailyArrows(daySessions.reduce((acc, s) => acc + (s.arrows || s.totalArrows || 0), 0));
    if (daySessions.length > 0) {
      if (!daySessions.find(s => s.id === selectedSessionId)) {
        setSelectedSessionId(daySessions[0].id);
      }
    } else {
      setSelectedSessionId('');
      setSelectedSession(null);
    }
  }, [daySessions]);

  useEffect(() => {
    if (selectedSessionId) {
      const s = sessions.find(s => s.id === selectedSessionId);
      setSelectedSession(s || null); 
      setHighlightedEnd(null);
    }
  }, [selectedSessionId, sessions]);

  useEffect(() => { if (scrollRef.current && activeTab === 'DAILY') scrollRef.current.scrollLeft = scrollRef.current.scrollWidth; }, [isLoading, activeTab]);

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

  const hasFullAccess = isPremium || selectedDate === todayISO;
  
  const currentEnds = selectedSession?.ends || [];
  const r1Ends = currentEnds.slice(0, 6);
  const r2Ends = currentEnds.slice(6, 12);

  const displayTargetType = selectedSession?.distance?.includes('18') 
      ? '3-Spot' 
      : (selectedSession?.targetType && selectedSession.targetType !== 'Full' ? selectedSession.targetType : 'Full');

  const r1Hits = calculateHits(r1Ends);
  const r2Hits = calculateHits(r2Ends);
  const totalHits = calculateHits(currentEnds);
  const spreadData = calculateSpread(currentEnds, displayTargetType);

  const previewEnd = highlightedEnd !== null ? currentEnds[highlightedEnd] : null;

  return (
    <div className={`flex flex-col overflow-x-hidden ${isEmbedded ? 'w-full pb-10' : 'h-full bg-[#fcfdfe] pt-[env(safe-area-inset-top)] pb-32 max-w-md mx-auto'}`}>
      
      {!isEmbedded && (
        <div className="px-10 mt-6 mb-1 h-12 flex justify-between items-center shrink-0">
          <div className="flex items-center gap-2 ml-14">
            <div className="flex items-center shrink-0 whitespace-nowrap">
              <span className="text-[20px] font-black text-[#0a3a2a] tracking-tighter leading-none">GROT-X</span>
              <div className="w-1.5 h-1.5 bg-[#fed33e] rounded-full ml-1.5 animate-pulse"></div>
            </div>
            <div className="w-[1.5px] h-[14px] bg-gray-200 rounded-full mx-2"></div>
            <h1 className="text-[11px] font-black text-gray-400 uppercase tracking-[0.15em] leading-none pt-0.5 whitespace-nowrap">
              STATY
            </h1>
          </div>
        </div>
      )}

      <div className={`flex bg-gray-100 p-1 rounded-xl mb-1 shadow-inner ${isEmbedded ? 'mx-0 mt-2' : 'mx-6'}`}>
        <button 
          onClick={() => setActiveTab('DAILY')} 
          className={`flex-1 py-2.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'DAILY' ? 'bg-white text-[#0a3a2a] shadow-sm' : 'text-gray-400'}`}
        >
          {t('stats.tabDaily')}
        </button>
        <button 
          onClick={() => setActiveTab('PRO')} 
          className={`flex-1 py-2.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-1.5 ${activeTab === 'PRO' ? 'bg-[#0a3a2a] text-[#fed33e] shadow-md' : 'text-gray-400'}`}
        >
          <span className={`material-symbols-outlined text-[14px] ${activeTab === 'PRO' ? 'text-[#fed33e]' : 'text-yellow-500'}`}>diamond</span>
          {t('stats.tabPro')}
          {!isPremium && <span className="material-symbols-outlined text-[12px]">lock</span>}
        </button>
      </div>

      {activeTab === 'PRO' && (
        <ProStatsView userId={userId} isPremium={isPremium} onNavigate={onNavigate} />
      )}

      {activeTab === 'DAILY' && (
        <>
          <div className={`mb-4 ${isEmbedded ? 'px-0' : 'px-2'}`}>
            <div ref={scrollRef} className="flex gap-2 overflow-x-auto hide-scrollbar py-4 px-2 snap-x">
              {Array.from({ length: daysToShow }, (_, i) => {
                const d = new Date(); d.setDate(d.getDate() - i);
                const dStr = d.toISOString().split('T')[0];
                const dayActs = sessions.filter(s => toISO(s.date) === dStr);
                const isSel = selectedDate === dStr;
                
                let bg = "bg-white", txt = "text-gray-400", brd = "border-gray-100";
                
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
                }
                
                return (
                  <button key={dStr} onClick={() => setSelectedDate(dStr)} className={`relative flex-shrink-0 w-12 h-16 rounded-2xl flex flex-col items-center justify-center transition-all snap-center border-2 ${bg} ${txt} ${brd} ${isSel ? 'scale-110 shadow-lg ring-2 ring-emerald-500/50 z-10' : 'opacity-80 active:scale-95'} ${dayActs.length === 0 ? 'opacity-30 border-dashed border-gray-200' : ''}`}>
                    <span className="text-[7px] font-black uppercase mb-1 opacity-70">{d.toLocaleDateString(i18n.language === 'pl' ? 'pl-PL' : i18n.language === 'de' ? 'de-DE' : 'en-US', { weekday: 'short' })}</span>
                    <span className="text-lg font-black leading-none">{dStr.split('-')[2]}</span>
                    {dayActs.length > 1 && (
                       <span className={`absolute -top-1 -right-1 w-3 h-3 rounded-full text-[6px] font-black flex items-center justify-center text-white ${dayActs.some(a => a.type === 'TECHNICAL') && dayActs.some(a => a.type !== 'TECHNICAL') ? 'bg-purple-500' : 'bg-red-500'}`}>
                         {dayActs.length}
                       </span>
                    )}
                  </button>
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
                     {sess.type === 'Turniej' ? t('stats.sessionInfo.tournament') : sess.type === 'Arena' ? t('stats.sessionInfo.arena') : sess.type === 'TECHNICAL' ? 'TECH' : sess.type === 'WORLD_BATTLE' ? (sess.worldResult === 'WIN' ? t('stats.sessionInfo.worldTabWin') : t('stats.sessionInfo.worldTabLoss')) : t('stats.sessionInfo.solo')} {idx > 0 && `(#${idx+1})`}
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
                  noteComponent={<NoteModule session={selectedSession} userId={userId} viewingStudentId={viewingStudentId} />}
                />
              ) : (
                <div className="bg-white rounded-[32px] border border-gray-100 shadow-sm p-5 relative overflow-hidden">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <div className="flex items-center gap-1.5 mb-0.5">
                         <div className={`w-2 h-2 rounded-full ${selectedSession.type === 'Turniej' ? 'bg-[#0a3a2a]' : selectedSession.type === 'Arena' ? 'bg-blue-500' : selectedSession.type === 'WORLD_BATTLE' ? 'bg-emerald-500' : 'bg-[#fed33e]'}`}></div>
                         <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">
                           {selectedSession.type === 'Turniej' ? t('stats.sessionInfo.tournament') : selectedSession.type === 'Arena' ? t('stats.sessionInfo.arena') : selectedSession.type === 'WORLD_BATTLE' ? t('stats.sessionInfo.worldBattle') : t('stats.sessionInfo.typeSolo')}
                         </span>
                      </div>
                      <h2 className="text-xl font-black text-[#0a3a2a] leading-tight truncate max-w-[200px]">
                        {selectedSession.type === 'Turniej' ? (selectedSession.tournamentName || t('stats.sessionInfo.defaultTournament')) : selectedSession.type === 'Arena' ? t('stats.sessionInfo.arena') : selectedSession.type === 'WORLD_BATTLE' ? (selectedSession.worldResult === 'WIN' ? t('stats.sessionInfo.worldWin') : t('stats.sessionInfo.worldLoss')) : t('stats.sessionInfo.solo')}
                      </h2>
                      <p className="text-[10px] text-gray-300 font-bold uppercase">{selectedSession.date} • {selectedSession.distance}</p>
                    </div>
                    <div className="bg-emerald-50 text-emerald-700 px-3 py-1 rounded-full text-[9px] font-black uppercase">{displayTargetType || t('stats.sessionInfo.dynamic')}</div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 mb-4">
                    <div className="bg-gray-50 rounded-2xl py-3 px-1 text-center border border-gray-100/50"><span className="block text-[8px] font-black text-gray-400 uppercase mb-0.5">{t('stats.cards.score')}</span><span className="text-2xl font-black text-[#0a3a2a]">{selectedSession.score || 0}</span></div>
                    <div className="bg-gray-50 rounded-2xl py-3 px-1 text-center border border-gray-100/50"><span className="block text-[8px] font-black text-gray-400 uppercase mb-0.5">{t('stats.cards.average')}</span><span className="text-2xl font-black text-[#0a3a2a]">{((selectedSession.score || 0) / (selectedSession.arrows || 1)).toFixed(2)}</span></div>
                    <div className="bg-gray-50 rounded-2xl py-3 px-1 text-center border border-gray-100/50"><span className="block text-[8px] font-black text-gray-400 uppercase mb-0.5">{t('stats.cards.dailyArrows', 'Strzały dzisiaj')}</span><span className="text-2xl font-black text-emerald-600">{dailyArrows}</span></div>
                  </div>

                  <NoteModule session={selectedSession} userId={userId} viewingStudentId={viewingStudentId} />

                  {hasFullAccess ? (
                    <div className="space-y-5 mt-4">
                      
                      {selectedSession.weather && (
                        <div className="flex gap-3 bg-gray-50/50 p-2 rounded-xl w-max border border-gray-100">
                          <div className="flex items-center gap-1"><span className="material-symbols-outlined text-sm text-blue-400">device_thermostat</span><span className="text-[10px] font-black">{selectedSession.weather.temp}°C</span></div>
                          <div className="flex items-center gap-1"><span className="material-symbols-outlined text-sm text-gray-400">air</span><span className="text-[10px] font-black">{selectedSession.weather.wind} km/h</span></div>
                        </div>
                      )}

                      <div className="bg-[#0a3a2a] rounded-2xl p-4 text-white shadow-md relative overflow-hidden">
                        <div className="flex justify-between items-center mb-3 border-b border-white/10 pb-2">
                          <span className="text-[10px] font-black uppercase tracking-widest">{t('stats.cards.hitStats')}</span>
                          <span className="text-[10px] font-bold text-emerald-400">{t('stats.cards.total')}</span>
                        </div>
                        <div className="grid grid-cols-3 gap-4 text-center">
                          <div><p className="text-[8px] font-bold text-[#fed33e] uppercase">Inner X</p><p className="text-xl font-black">{totalHits.x}</p></div>
                          <div><p className="text-[8px] font-bold text-emerald-400 uppercase">{t('stats.cards.tenSum')}</p><p className="text-xl font-black">{totalHits.ten}</p></div>
                          <div><p className="text-[8px] font-bold text-gray-300 uppercase">{t('stats.cards.nineSum')}</p><p className="text-xl font-black">{totalHits.nine}</p></div>
                        </div>
                      </div>

                      <div className="space-y-2 relative">
                        <SessionTrend submittedEnds={currentEnds} onPointClick={(idx) => setHighlightedEnd(highlightedEnd === idx ? null : idx)} />
                        
                        {previewEnd && (
                          <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-3 flex items-center justify-between animate-fade-in">
                             <div className="flex flex-col">
                               <span className="text-[9px] font-black text-emerald-700 uppercase">{t('scoring.series')} P{highlightedEnd! + 1}</span>
                               <span className="text-lg font-black text-[#0a3a2a]">{previewEnd.total_sum} {t('scoringView.pts')}</span>
                             </div>
                             <div className="flex gap-1">
                               {previewEnd.arrows?.map((a: string, i: number) => (
                                 <div key={i} className={`w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-black ${getArrowBg(a)}`}>{a}</div>
                               ))}
                             </div>
                             <button onClick={() => setHighlightedEnd(null)} className="text-emerald-400 active:scale-90"><span className="material-symbols-outlined text-sm">close</span></button>
                          </div>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-2 mb-4">
                        <div className="space-y-2 flex flex-col">
                          <RoundTargetSummary title={`${t('scoring.round')} 1`} ends={r1Ends} highlightedEnd={highlightedEnd} startIndex={0} targetType={displayTargetType} onZoomClick={() => setZoomedRoundData({title:`${t('scoring.round')} 1`, ends:r1Ends, targetType: displayTargetType, t:t})} />
                          <div className="text-[9px] font-black text-emerald-600 uppercase text-center mb-1">{r1Ends.reduce((acc, end) => acc + (end.arrows?.length || 0), 0)} {t('scoringView.arrows')}</div>
                          <div className="bg-gray-50 rounded-xl p-2 text-[9px] font-bold flex justify-around border border-gray-100">
                            <span>X: {r1Hits.x}</span><span>10: {r1Hits.ten}</span><span>9: {r1Hits.nine}</span>
                          </div>
                        </div>
                        <div className="space-y-2 flex flex-col">
                          <RoundTargetSummary title={`${t('scoring.round')} 2`} ends={r2Ends} highlightedEnd={highlightedEnd} startIndex={6} targetType={displayTargetType} onZoomClick={() => setZoomedRoundData({title:`${t('scoring.round')} 2`, ends:r2Ends, targetType: displayTargetType, t:t})} />
                          <div className="text-[9px] font-black text-emerald-600 uppercase text-center mb-1">{r2Ends.reduce((acc, end) => acc + (end.arrows?.length || 0), 0)} {t('scoringView.arrows')}</div>
                          <div className="bg-gray-50 rounded-xl p-2 text-[9px] font-bold flex justify-around border border-gray-100">
                            <span>X: {r2Hits.x}</span><span>10: {r2Hits.ten}</span><span>9: {r2Hits.nine}</span>
                          </div>
                        </div>
                      </div>

                      {spreadData && (
                        <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm mt-4">
                          <div className="flex justify-between items-center mb-3">
                            <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{t('stats.cards.biomechanics')}</h3>
                            <span className="material-symbols-outlined text-gray-300 text-sm">troubleshoot</span>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div className="bg-indigo-50/50 rounded-xl p-3 border border-indigo-100/50">
                              <span className="text-[8px] font-bold text-indigo-400 uppercase block mb-0.5">{t('stats.cards.tendency')}</span>
                              <span className="text-xs font-black text-[#0a3a2a] block leading-tight">
                                {t(spreadData.hKey)} / {t(spreadData.vKey)}
                              </span>
                            </div>
                            <div className="bg-orange-50/50 rounded-xl p-3 border border-orange-100/50">
                              <span className="text-[8px] font-bold text-orange-400 uppercase block mb-0.5">{t('stats.cards.error')}</span>
                              <span className="text-xs font-black text-[#0a3a2a] block leading-tight">{t(spreadData.errorKey)}</span>
                            </div>
                          </div>
                        </div>
                      )}

                      <CoachAIPanel userId={userId} totalScore={selectedSession.score || 0} arrowCount={selectedSession.arrows || 1} accuracy={(((selectedSession.score || 0) / ((selectedSession.arrows || 1) * 10)) * 100).toFixed(1)} />

                      {!viewingStudentId && (
                        <div className="mt-6">
                          {isPremium || selectedDate === todayISO ? (
                            <div className="bg-white border border-gray-100 rounded-[24px] shadow-sm overflow-hidden">
                               <ExportPanel session={selectedSession} isPremium={isPremium} onTriggerPaywall={() => onNavigate('SETTINGS', 'PRO')} />
                            </div>
                          ) : (
                            <button
                              onClick={() => onNavigate('SETTINGS', 'PRO')}
                              className="w-full py-4 bg-gradient-to-r from-yellow-400 to-[#fed33e] text-[#0a3a2a] rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-md flex items-center justify-center gap-2 active:scale-95 transition-all"
                            >
                              <span className="material-symbols-outlined text-[16px]">diamond</span>
                              GROT-X PRO — Eksport Archiwum
                            </button>
                          )}
                        </div>
                      )}

                      {!viewingStudentId && (
                        <button
                          onClick={() => setShowDeleteModal(true)}
                          className="mt-4 w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-red-50 text-red-500 font-black text-[10px] uppercase tracking-widest active:scale-95 transition-all border border-red-100"
                        >
                          <span className="material-symbols-outlined text-[16px]">delete</span>
                          {t('stats.deleteSession', 'Usuń ten trening')}
                        </button>
                      )}

                    </div>
                  ) : (
                    <div className="mt-4 p-8 bg-gray-50 rounded-[24px] border-2 border-dashed border-gray-200 text-center flex flex-col items-center">
                      <span className="material-symbols-outlined text-[#F2C94C] text-3xl mb-2">diamond</span>
                      <p className="text-[11px] text-gray-400 font-bold uppercase tracking-widest">{t('stats.unlockDetails')}</p>
                      <button onClick={() => onNavigate('SETTINGS', 'PRO')} className="mt-3 px-6 py-2 bg-[#0a3a2a] text-[#fed33e] rounded-full text-[9px] font-black uppercase tracking-widest shadow-md flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-[12px]">diamond</span>
                        GROT-X PRO
                      </button>
                    </div>
                  )}
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

      {zoomedRoundData && <TargetZoomModal roundTitle={zoomedRoundData.title} ends={zoomedRoundData.ends} targetType={zoomedRoundData.targetType} onClose={() => setZoomedRoundData(null)} t={zoomedRoundData.t} />}

      {/* PSYCHOLOGICZNY MODAL USUWANIA */}
      {showDeleteModal && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100000] flex items-center justify-center p-4 animate-fade-in" onClick={() => setShowDeleteModal(false)}>
          <div className="bg-white rounded-[32px] p-6 w-full max-w-[400px] shadow-2xl relative" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-full bg-[#0a3a2a] flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-[#fed33e]">smart_toy</span>
              </div>
              <div>
                <span className="text-[10px] font-black text-emerald-600 uppercase tracking-[0.2em] block leading-tight">{t('stats.deleteAnalyzing', 'Trener AI analizuje Twoją decyzję...')}</span>
              </div>
            </div>
            
            <p className="text-[13px] text-gray-600 font-medium mb-6 leading-relaxed">
              {t('stats.deleteWarning', 'Pamiętaj, że mistrzostwo buduje się na błędach. Każdy kiepski wynik to informacja, nie powód do wstydu. Trener AI potrzebuje tego zapisu, by wychwycić wzorce i pomóc Ci poprawić formę.')}
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