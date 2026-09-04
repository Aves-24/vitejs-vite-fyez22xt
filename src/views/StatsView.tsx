import React, { useState, useEffect, useRef, useMemo } from 'react';
import { distanceMeters, sessionDistanceLabel } from '../config/distances';
import { db } from '../firebase';
import { collection, query, where, orderBy, limit, startAfter, doc, getDoc, getDocs, deleteDoc, updateDoc, onSnapshot, QueryDocumentSnapshot, Timestamp } from 'firebase/firestore';
import { useTranslation } from 'react-i18next';
import SessionTrend from '../components/SessionTrend';
import CoachAIPanel from '../components/CoachAIPanel';
import RoundTargetSummary from '../components/RoundTargetSummary';
import ProStatsView from '../components/ProStatsView';
import TournamentRecordsView from '../components/TournamentRecordsView';
import ExportPanel from '../components/ExportPanel';
import TechSessionCard from '../components/TechSessionCard';
import BiomechCard from '../components/BiomechCard';
import HeatmapTarget from '../components/HeatmapTarget';
import { calculateSpread } from '../utils/spread';
import { createPortal } from 'react-dom';
import { isFullFace as isFullFaceType, isSpotFace } from '../config/targetFaces';

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
    <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between px-4 py-3 active:bg-gray-50 transition-colors">
        <span className="text-[10px] font-black uppercase tracking-widest text-[#0a3a2a] flex items-center gap-1.5">
          <span className="material-symbols-outlined text-[15px] text-emerald-600">table_chart</span>
          {t('stats.cards.detailTable')}
        </span>
        <span className={`material-symbols-outlined text-[18px] text-gray-400 transition-transform duration-300 ${open ? 'rotate-180' : ''}`}>expand_more</span>
      </button>
      {open && (
        <div className="px-3 pb-3 pt-1 flex flex-col gap-4 animate-fade-in">
          {renderDurchgang(r1Ends, 0, 0)}
          {r2Ends.length > 0 && renderDurchgang(r2Ends, 1, r1Ends.length)}
        </div>
      )}
    </div>
  );
}

function LargeTargetSVG({ ends, targetType, activeEnd }: { ends: any[], targetType: string, activeEnd: number | null }) {
  const isFullFace = isFullFaceType(targetType);
  const is3Spot = isSpotFace(targetType);

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

function TargetZoomModal({ rounds, initial, targetType, onClose, t }: any) {
  const [roundIdx, setRoundIdx] = useState<number>(initial || 0);
  const [activeEnd, setActiveEnd] = useState<number | null>(null);
  const [showHeatmap, setShowHeatmap] = useState(false);

  const round = rounds[roundIdx] || rounds[0];
  const ends = round.ends;
  const startIndex = round.startIndex || 0;

  // Heatmapa dla CAŁEJ rundy — zbieramy wszystkie kropki ze wszystkich serii
  // (ta sama logika i przestrzeń współrzędnych co w zakładce PRO Progress).
  const heatDots = useMemo(
    () => ends.flatMap((end: any) => (end.dots || []).filter((d: any) => d.x != null && d.y != null)),
    [ends]
  );

  // Reset wyboru serii przy zmianie rundy (P-numery i sumy się przeliczają).
  const switchRound = (idx: number) => { setRoundIdx(idx); setActiveEnd(null); };

  if (typeof document === 'undefined') return null;
  return createPortal(
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100000] flex items-center justify-center p-4 transition-opacity duration-300" onClick={onClose}>
      <div className="bg-white rounded-[32px] p-6 w-full max-w-[500px] h-[85vh] shadow-2xl relative flex flex-col items-center border border-gray-100" onClick={e => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-5 right-5 p-2 bg-gray-100 text-gray-500 rounded-full active:scale-90 transition-all z-10">
          <span className="material-symbols-outlined font-bold text-xl">close</span>
        </button>
        <div className="text-center mb-3 w-full px-8 mt-2">
           <span className="text-[10px] font-black text-emerald-600 uppercase tracking-[0.2em] mb-1 block">{t('stats.zoom.title', 'Podgląd Rozrzutu')}</span>
           <h3 className="text-xl font-black text-[#0a3a2a] leading-tight block">{round.title}</h3>
        </div>

        {/* PRZEŁĄCZNIK RUND — zmiana rundy bez zamykania okna */}
        {rounds.length > 1 && (
          <div className="flex gap-1.5 mb-3 shrink-0">
            {rounds.map((r: any, i: number) => (
              <button key={i} onClick={() => switchRound(i)} className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all border active:scale-95 ${roundIdx === i ? 'bg-[#0a3a2a] text-white border-[#0a3a2a] shadow-md' : 'bg-white text-gray-400 border-gray-200'}`}>{r.title}</button>
            ))}
          </div>
        )}

        {/* PRZEŁĄCZNIK HEATMAPY — włącz/wyłącz termowizyjny rozrzut tej rundy */}
        <button
          onClick={() => setShowHeatmap(v => !v)}
          disabled={heatDots.length < 2}
          className={`mb-3 flex items-center gap-1.5 px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest transition-all shrink-0 border active:scale-95 disabled:opacity-30 ${showHeatmap ? 'bg-[#0a3a2a] text-[#fed33e] border-[#0a3a2a] shadow-md' : 'bg-gray-100 text-gray-500 border-gray-200'}`}
        >
          <span className="material-symbols-outlined text-[15px]">{showHeatmap ? 'whatshot' : 'local_fire_department'}</span>
          {t('stats.zoom.heatmap', 'Heatmapa')}
          <span className={`ml-1 w-7 h-3.5 rounded-full relative transition-colors ${showHeatmap ? 'bg-[#fed33e]' : 'bg-gray-300'}`}>
            <span className={`absolute top-0.5 w-2.5 h-2.5 rounded-full bg-white transition-all ${showHeatmap ? 'left-[15px]' : 'left-0.5'}`} />
          </span>
        </button>

        {!showHeatmap && (
          <div className="flex gap-1.5 mb-4 justify-center w-full overflow-x-auto hide-scrollbar px-2 shrink-0">
            <button onClick={() => setActiveEnd(null)} className={`px-3 py-2 rounded-xl text-[10px] font-black transition-all self-start ${activeEnd === null ? 'bg-[#0a3a2a] text-white shadow-md' : 'bg-gray-100 text-gray-500 active:bg-gray-200'}`}>{t('stats.zoom.all', 'WSZYSTKIE')}</button>
            {ends.map((end: any, i: number) => (
              <button key={i} onClick={() => setActiveEnd(i)} className={`w-10 py-1.5 rounded-xl text-[10px] font-black transition-all flex flex-col items-center justify-center leading-tight ${activeEnd === i ? 'bg-[#fed33e] text-[#0a3a2a] shadow-md border border-[#e5bd38]' : 'bg-gray-100 text-gray-500 active:bg-gray-200 border border-transparent'}`}>
                <span>P{startIndex + i + 1}</span>
                <span className="text-[9px] font-black opacity-70">{end.total_sum ?? end.arrows?.reduce((a: number, v: string) => a + (v === 'X' ? 10 : v === 'M' ? 0 : Number(v) || 0), 0) ?? 0}</span>
              </button>
            ))}
          </div>
        )}
        <div className="flex-1 w-full flex flex-col items-center justify-center bg-gray-50 rounded-2xl border border-gray-100 p-2 overflow-hidden">
          <div className="w-full pt-4">
            {showHeatmap
              ? <HeatmapTarget dots={heatDots} targetType={targetType} />
              : <LargeTargetSVG ends={ends} targetType={targetType} activeEnd={activeEnd} />}
          </div>
        </div>
      </div>
    </div>, document.body
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
                 {canEdit && !isEditing ? <span className="text-[8px] opacity-50 ml-1">{t('stats.noteEditsLeft', { count: 2 - edits })}</span> : ''}
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
  id: string; score: number; arrows: number; distance: string; distanceId?: string; distanceLabel?: string; date: string; timestamp: any;
  type?: 'Trening' | 'Turniej' | 'Arena' | 'TECHNICAL' | 'WORLD_BATTLE'; worldResult?: 'WIN' | 'LOSS'; tournamentName?: string;
  note?: string; coachNote?: string; editCount?: number; targetType?: string; ends?: any[]; weather?: any;
  isNotePublic?: boolean; totalArrows?: number; shotArrows?: number; scoreArrows?: number; sessionArrows?: number; practiceArrows?: number;
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
  const [zoomedRoundData, setZoomedRoundData] = useState<any>(null);
  // Ręczność łucznika (RH/LH) — decyduje o lustrzanym odbiciu wskazówek lewo/prawo.
  // null = nieustawiona w profilu → pokazujemy prośbę o uzupełnienie.
  const [handedness, setHandedness] = useState<'RH' | 'LH' | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pendingSessionIdRef = useRef(initialSessionId || '');

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

        const pz = d.pfeilzaehler || {};
        const today = new Date();
        const todayKey = `${today.getFullYear()}_${String(today.getMonth() + 1).padStart(2, '0')}_${String(today.getDate()).padStart(2, '0')}`;
        setDailyPfeilzaehler(pz[todayKey] || 0);
      }

      // Ręczność: gdy oglądamy własne staty czytamy z `userId`, przy podglądzie
      // ucznia (trener) z jego profilu — wskazówki kierunkowe są dla łucznika.
      if (viewingStudentId) {
        try {
          const sDoc = await getDoc(doc(db, 'users', viewingStudentId));
          setHandedness((sDoc.data()?.handedness as 'RH' | 'LH') || null);
        } catch { setHandedness(null); }
      } else {
        setHandedness((d?.handedness as 'RH' | 'LH') || null);
      }
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

  // [C25] Bylo `distance.includes('18')` — kruche: wlasny dystans z etykieta
  // zawierajaca "18" (np. "7m seria18") wpadal w ten warunek. Teraz porownujemy
  // METRY, a nie fragment napisu.
  const displayTargetType = distanceMeters(selectedSession?.distance) === 18
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
              {t('stats.title')}
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
          userId={userId}
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
            <div ref={scrollRef} className="flex gap-2 overflow-x-auto hide-scrollbar pt-4 pb-2 px-2 snap-x">
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
                  userId={viewingStudentId ? undefined : userId}
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
                      <p className="text-[10px] text-gray-300 font-bold uppercase">{selectedSession.date} • {sessionDistanceLabel(selectedSession)}</p>
                    </div>
                    <div className="bg-emerald-50 text-emerald-700 px-3 py-1 rounded-full text-[9px] font-black uppercase">{displayTargetType || t('stats.sessionInfo.dynamic')}</div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 mb-4">
                    <div className="bg-gray-50 rounded-2xl py-3 px-1 text-center border border-gray-100/50"><span className="block text-[8px] font-black text-gray-400 uppercase mb-0.5">{t('stats.cards.score')}</span><span className="text-2xl font-black text-[#0a3a2a]">{selectedSession.score || 0}</span></div>
                    <div className="bg-gray-50 rounded-2xl py-3 px-1 text-center border border-gray-100/50"><span className="block text-[8px] font-black text-gray-400 uppercase mb-0.5">{t('stats.cards.average')}</span><span className="text-2xl font-black text-[#0a3a2a]">{((selectedSession.score || 0) / (selectedSession.scoreArrows || selectedSession.arrows || 1)).toFixed(2)}</span></div>
                    <div className="bg-gray-50 rounded-2xl py-3 px-1 text-center border border-gray-100/50"><span className="block text-[8px] font-black text-gray-400 uppercase mb-0.5">{t('stats.cards.dailyArrows', 'Strzały dzisiaj')}</span><span className="text-2xl font-black text-emerald-600">{dailyArrows}</span></div>
                  </div>

                  <NoteModule session={selectedSession} userId={userId} viewingStudentId={viewingStudentId} />

                    <div className="space-y-5 mt-4">
                      {/* FREE (dowolny dzień z okna 30 dni): pogoda, rozbicie X/10/9,
                          tabela rund, przebieg serii — surowe dane własnej sesji. */}
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

                      <RoundDetailTable r1Ends={r1Ends} r2Ends={r2Ends} t={t} />

                      <div className="space-y-2 relative">
                        <SessionTrend submittedEnds={currentEnds} onPointClick={(idx) => setHighlightedEnd(highlightedEnd === idx ? null : idx)} />
                        
                        {previewEnd && (
                          <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-3 flex items-center justify-between animate-fade-in">
                             <div className="flex flex-col">
                               <span className="text-[9px] font-black text-emerald-700 uppercase">{t('scoring.series')} {highlightedEnd! + 1}</span>
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

                      {/* PRO (miniony dzień): wizualny rozrzut na tarczy, biomechanika,
                          AI, eksport. Dziś zostaje darmowe — hasFullAccess === true. */}
                      {hasFullAccess ? (
                      <>
                      <div className="grid grid-cols-2 gap-2 mb-4">
                        <div className="space-y-2 flex flex-col">
                          <RoundTargetSummary title={`${t('scoring.round')} 1`} ends={r1Ends} highlightedEnd={highlightedEnd} startIndex={0} targetType={displayTargetType} onZoomClick={() => setZoomedRoundData({initial: 0, targetType: displayTargetType, t:t, rounds: [{title:`${t('scoring.round')} 1`, ends:r1Ends, startIndex:0}, ...(r2Ends.length > 0 ? [{title:`${t('scoring.round')} 2`, ends:r2Ends, startIndex: r1Ends.length}] : [])]})} />
                          <div className="text-[9px] font-black text-emerald-600 uppercase text-center mb-1">{r1Ends.reduce((acc, end) => acc + (end.arrows?.length || 0), 0)} {t('scoringView.arrows')}</div>
                          <div className="bg-gray-50 rounded-xl p-2 text-[9px] font-bold flex justify-around border border-gray-100">
                            <span>X: {r1Hits.x}</span><span>10: {r1Hits.ten}</span><span>9: {r1Hits.nine}</span>
                          </div>
                        </div>
                        <div className="space-y-2 flex flex-col">
                          <RoundTargetSummary title={`${t('scoring.round')} 2`} ends={r2Ends} highlightedEnd={highlightedEnd} startIndex={6} targetType={displayTargetType} onZoomClick={() => setZoomedRoundData({initial: 1, targetType: displayTargetType, t:t, rounds: [{title:`${t('scoring.round')} 1`, ends:r1Ends, startIndex:0}, {title:`${t('scoring.round')} 2`, ends:r2Ends, startIndex: r1Ends.length}]})} />
                          <div className="text-[9px] font-black text-emerald-600 uppercase text-center mb-1">{r2Ends.reduce((acc, end) => acc + (end.arrows?.length || 0), 0)} {t('scoringView.arrows')}</div>
                          <div className="bg-gray-50 rounded-xl p-2 text-[9px] font-bold flex justify-around border border-gray-100">
                            <span>X: {r2Hits.x}</span><span>10: {r2Hits.ten}</span><span>9: {r2Hits.nine}</span>
                          </div>
                        </div>
                      </div>

                      {spreadData && (
                        <BiomechCard spread={spreadData} handedness={handedness} onNavigate={onNavigate} />
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
                      </>
                      ) : (
                        <div className="mt-4 p-6 bg-gray-50 rounded-[24px] border-2 border-dashed border-gray-200 text-center flex flex-col items-center">
                          <span className="material-symbols-outlined text-[#F2C94C] text-3xl mb-2">diamond</span>
                          <p className="text-[11px] text-gray-400 font-bold uppercase tracking-widest">{t('stats.unlockAnalysis', { defaultValue: 'Rozrzut na tarczy, biomechanika i AI w PRO' })}</p>
                          <button onClick={() => onNavigate('SETTINGS', 'PRO')} className="mt-3 px-6 py-2 bg-[#0a3a2a] text-[#fed33e] rounded-full text-[9px] font-black uppercase tracking-widest shadow-md flex items-center gap-1.5">
                            <span className="material-symbols-outlined text-[12px]">diamond</span>
                            GROT-X PRO
                          </button>
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
                </div>
              )}

              {hasMore && (
                <button
                  onClick={loadMore}
                  disabled={isLoadingMore}
                  className="w-full py-3 mt-6 bg-gray-100 text-gray-600 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-gray-150 active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isLoadingMore ? (
                    <>
                      <span className="material-symbols-outlined text-[14px] animate-spin">loading</span>
                      Ładowanie...
                    </>
                  ) : (
                    <>
                      <span className="material-symbols-outlined text-[14px]">expand_more</span>
                      Załaduj więcej treningów
                    </>
                  )}
                </button>
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

      {zoomedRoundData && <TargetZoomModal rounds={zoomedRoundData.rounds} initial={zoomedRoundData.initial} targetType={zoomedRoundData.targetType} onClose={() => setZoomedRoundData(null)} t={zoomedRoundData.t} />}

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