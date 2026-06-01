import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { db } from '../firebase';
import { collection, addDoc, serverTimestamp, doc, updateDoc, increment, setDoc } from 'firebase/firestore';
import { useTranslation } from 'react-i18next';

interface TournamentScoreInputProps {
  userId: string;
  eventId: string;
  tournamentName: string;
  distance: string;
  onClose: () => void;
  onNavigate?: (view: string, tab?: string, extraData?: string) => void;
}

export default function TournamentScoreInput({ userId, eventId, tournamentName, distance, onClose, onNavigate }: TournamentScoreInputProps) {
  const { t } = useTranslation();
  const [inputMode, setInputMode] = useState<'DETAILED' | 'SUMMARY'>('DETAILED');

  // STANY DLA TRYBU SZCZEGÓŁOWEGO
  const [ends, setEnds] = useState<string[][]>([]); 
  const [currentEnd, setCurrentEnd] = useState<string[]>([]); 
  const [editingTarget, setEditingTarget] = useState<{ endIdx: number, arrowIdx: number } | null>(null);

  // STANY DLA TRYBU SKRÓTOWEGO
  const [summaryR1, setSummaryR1] = useState('');
  const [summaryX1, setSummaryX1] = useState('');
  const [summary10_1, setSummary10_1] = useState('');
  const [summary9_1, setSummary9_1] = useState('');

  const [summaryR2, setSummaryR2] = useState('');
  const [summaryX2, setSummaryX2] = useState('');
  const [summary10_2, setSummary10_2] = useState('');
  const [summary9_2, setSummary9_2] = useState('');

  const [practiceArrows, setPracticeArrows] = useState(0);
  const [aiNote, setAiNote] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [showKeyboard, setShowKeyboard] = useState(true);

  const numKeys = ['X', '10', '9', '8', '7', '6', '5', '4', '3', '2', '1'];

  const getArrowValue = (val: string): number => {
    if (val === 'X' || val === '10') return 10;
    if (val === 'M') return 0;
    return parseInt(val) || 0;
  };

  const getArrowStyles = (val: string, isEditing: boolean = false) => {
    let base;
    if (['X', '10', '9'].includes(val)) base = 'bg-[#F2C94C] text-[#333] border-none shadow-sm';
    else if (['8', '7'].includes(val)) base = 'bg-[#EB5757] text-white border-none shadow-sm';
    else if (['6', '5'].includes(val)) base = 'bg-[#2F80ED] text-white border-none shadow-sm';
    else if (['4', '3'].includes(val)) base = 'bg-[#333333] text-white border-none shadow-sm';
    else if (['2', '1'].includes(val)) base = 'bg-white border border-gray-200 text-[#333] shadow-sm';
    else if (val === 'M') base = 'bg-indigo-900 text-white border-none shadow-sm';
    else base = 'bg-[#F9F9F9] border border-gray-100 text-transparent shadow-sm';

    return `${base} ${isEditing ? 'ring-4 ring-blue-500 scale-110 z-20' : ''}`;
  };

  const handleKeyPress = (key: string) => {
    if (editingTarget) {
      if (editingTarget.endIdx === -1) {
        const newCurrent = [...currentEnd];
        newCurrent[editingTarget.arrowIdx] = key;
        newCurrent.sort((a, b) => getArrowValue(b) - getArrowValue(a));
        setCurrentEnd(newCurrent);
      } else {
        const newEnds = [...ends];
        const targetEnd = [...newEnds[editingTarget.endIdx]];
        targetEnd[editingTarget.arrowIdx] = key;
        targetEnd.sort((a, b) => getArrowValue(b) - getArrowValue(a));
        newEnds[editingTarget.endIdx] = targetEnd;
        setEnds(newEnds);
      }
      setEditingTarget(null);
    } else {
      if (currentEnd.length < 6 && ends.length < 12) {
        const newEnd = [...currentEnd, key].sort((a, b) => getArrowValue(b) - getArrowValue(a));
        setCurrentEnd(newEnd);
      }
    }
  };

  useEffect(() => {
    if (currentEnd.length === 6 && !editingTarget) {
      const timer = setTimeout(() => {
        setEnds(prev => [...prev, currentEnd]);
        setCurrentEnd([]);
        if (ends.length === 11) setShowKeyboard(false);
      }, 150); 
      return () => clearTimeout(timer);
    }
  }, [currentEnd, ends.length, editingTarget]);

  const handleDelete = () => {
    if (editingTarget) { setEditingTarget(null); return; }
    if (currentEnd.length > 0) { setCurrentEnd(prev => prev.slice(0, -1)); }
    else if (ends.length > 0) {
      const lastEnd = ends[ends.length - 1];
      setEnds(prev => prev.slice(0, -1));
      setCurrentEnd(lastEnd);
      setShowKeyboard(true);
    }
  };

  // Czy mamy jakiekolwiek dane w trybie szczegółowym?
  const hasDetailedData = ends.length > 0 || currentEnd.length > 0;

  // Sumy wyliczone z trybu szczegółowego dla każdego Durchgangu
  const detailedR1 = useMemo(() => {
    const r1ends = ends.slice(0, 6);
    let score = 0, x = 0, tens = 0, nines = 0;
    r1ends.forEach(end => end.forEach(a => {
      score += getArrowValue(a);
      if (a === 'X') { x++; tens++; }
      else if (a === '10') tens++;
      else if (a === '9') nines++;
    }));
    return { score, x, tens, nines };
  }, [ends]);

  const detailedR2 = useMemo(() => {
    const r2ends = ends.slice(6, 12);
    let score = 0, x = 0, tens = 0, nines = 0;
    r2ends.forEach(end => end.forEach(a => {
      score += getArrowValue(a);
      if (a === 'X') { x++; tens++; }
      else if (a === '10') tens++;
      else if (a === '9') nines++;
    }));
    return { score, x, tens, nines };
  }, [ends]);

  const stats = useMemo(() => {
    let totalScore = 0, totalX = 0, total10 = 0, total9 = 0;
    // Detailliert lub Summary z danymi z detailliert → zawsze licz z detailliert
    if (inputMode === 'DETAILED' || hasDetailedData) {
      const allArrows = [...ends.flat(), ...currentEnd];
      allArrows.forEach(arrow => {
        totalScore += getArrowValue(arrow);
        if (arrow === 'X') { totalX++; total10++; }
        else if (arrow === '10') total10++;
        else if (arrow === '9') total9++;
      });
    } else {
      // Tryb awaryjny — tylko ręczne sumy
      totalScore = (parseInt(summaryR1) || 0) + (parseInt(summaryR2) || 0);
      totalX = (parseInt(summaryX1) || 0) + (parseInt(summaryX2) || 0);
      const t10_1 = (parseInt(summary10_1) || 0) + (parseInt(summaryX1) || 0);
      const t10_2 = (parseInt(summary10_2) || 0) + (parseInt(summaryX2) || 0);
      total10 = t10_1 + t10_2;
      total9 = (parseInt(summary9_1) || 0) + (parseInt(summary9_2) || 0);
    }
    return { totalScore, totalX, total10, total9 };
  }, [ends, currentEnd, inputMode, hasDetailedData, summaryR1, summaryR2, summaryX1, summaryX2, summary10_1, summary10_2, summary9_1, summary9_2]);

  const saveTournamentScore = async () => {
    setIsSaving(true);
    const finalEnds = currentEnd.length > 0 ? [...ends, currentEnd] : ends;
    const todayStr = new Date().toLocaleDateString('pl-PL');
    const todayISO = new Date().toISOString().split('T')[0];
    const competitionArrows = inputMode === 'DETAILED' ? finalEnds.flat().filter(a => a !== 'M').length : 72;
    const arrowCount = competitionArrows + practiceArrows;

    // Konwersja formatu 'ends' dla trybu DETAILED (aby StatsView widziało strzały)
    const archivedEnds = finalEnds.map(end => ({
      arrows: end,
      dots: [], // Tryb turniejowy nie ma współrzędnych, ale potrzebujemy pustej tablicy
      total_sum: end.reduce((acc, val) => acc + getArrowValue(val), 0)
    }));

    try {
      // Oznaczenie turnieju jako posiadającego wynik
      if (eventId) {
        await updateDoc(doc(db, 'users', userId, 'tournaments', eventId), {
          hasScore: true
        });
      }

      // ZAPIS SESJI
      await addDoc(collection(db, 'users', userId, 'sessions'), {
        date: todayStr,
        timestamp: serverTimestamp(),
        distance,
        type: 'Turniej',
        tournamentName,
        score: stats.totalScore,
        arrows: competitionArrows,
        practiceArrows: practiceArrows,
        xCount: stats.totalX,
        tenCount: stats.total10,
        nineCount: stats.total9,
        ends: inputMode === 'DETAILED' ? archivedEnds : [],
        note: aiNote.trim(),
        inputMode: inputMode,
        targetType: distance === '18m' ? '3-Spot' : 'Full'
      });

      // Aktualizacje nieblokujące — błędy nie przerywają nawigacji
      try {
        const userRef = doc(db, 'users', userId);
        await updateDoc(userRef, { totalArrows: increment(arrowCount), monthlyArrows: increment(arrowCount) });
        const dailyRef = doc(db, 'users', userId, 'dailyStats', todayISO);
        await setDoc(dailyRef, { arrows: increment(arrowCount) }, { merge: true });
      } catch (secondaryError) {
        console.warn('Nieblokujący błąd aktualizacji statystyk:', secondaryError);
      }

      // Zawsze nawiguj po udanym zapisie sesji
      onClose();
      if (onNavigate) {
        onNavigate('STATS', undefined, todayISO);
      }
    } catch (e) {
      console.error('Błąd zapisu turnieju:', e);
      alert(t('auth.errorGeneral') || 'Błąd zapisu. Sprawdź połączenie.');
    } finally {
      setIsSaving(false);
    }
  };

  const isFinished = ends.length >= 12;

  const content = (
    <div className="fixed inset-0 mx-auto w-full max-w-md bg-[#fcfdfe] z-[100000] flex flex-col pt-[calc(env(safe-area-inset-top)+1rem)] pb-8 animate-fade-in-up shadow-2xl overflow-hidden">
      
      <div className="relative mb-3 flex flex-col items-center shrink-0 px-14 text-center">
        <span className="inline-block px-3 py-1 rounded-lg text-[9px] font-black uppercase bg-[#fed33e] text-[#5d4a00] mb-1 shadow-sm">{t('tournamentInput.cardTitle')} - {distance}</span>
        <h2 className="text-lg font-black text-[#0a3a2a] leading-tight line-clamp-1">{tournamentName}</h2>
        <button onClick={onClose} className="absolute right-4 top-1/2 -translate-y-1/2 w-9 h-9 bg-gray-100 rounded-full flex items-center justify-center text-gray-500 border border-gray-200 active:scale-90"><span className="material-symbols-outlined text-lg">close</span></button>
      </div>

      <div className="px-5 mb-3 shrink-0">
        <div className="flex p-1 bg-gray-100 rounded-2xl">
          <button onClick={() => setInputMode('DETAILED')} className={`flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase transition-all ${inputMode === 'DETAILED' ? 'bg-[#0a3a2a] text-white shadow-md' : 'text-gray-400'}`}>{t('tournamentInput.modeDetailed')}</button>
          <button onClick={() => setInputMode('SUMMARY')} className={`flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase transition-all ${inputMode === 'SUMMARY' ? (hasDetailedData ? 'bg-[#0a3a2a] text-white shadow-md' : 'bg-amber-100 text-amber-800 shadow-md') : 'text-gray-400'}`}>{t('tournamentInput.modeSummary')}</button>
        </div>
      </div>

      <div className="px-5 mb-3 shrink-0">
        <div className="bg-[#0a3a2a] rounded-[24px] p-5 text-white shadow-lg flex justify-between items-end relative overflow-hidden">
          <span className="material-symbols-outlined absolute -right-4 -bottom-4 text-[100px] text-white/5 rotate-12 pointer-events-none">scoreboard</span>
          <div className="relative z-10">
            <p className="text-[10px] font-bold text-emerald-300 uppercase tracking-widest mb-0.5">{t('tournamentInput.totalScore')}</p>
            <span className="text-4xl font-black leading-none">{stats.totalScore}</span>
          </div>
          <div className="flex gap-3 text-right relative z-10">
            <div><p className="text-[8px] font-bold text-emerald-300 uppercase mb-0.5">10</p><span className="text-lg font-black">{stats.total10}</span></div>
            <div><p className="text-[8px] font-bold text-[#fed33e] uppercase mb-0.5">X</p><span className="text-lg font-black text-[#fed33e]">{stats.totalX}</span></div>
            <div><p className="text-[8px] font-bold text-gray-300 uppercase mb-0.5">9</p><span className="text-lg font-black text-gray-100">{stats.total9}</span></div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-2">
        {inputMode === 'SUMMARY' ? (
          <div className="space-y-4 animate-fade-in">

            {/* BANER INFO */}
            {hasDetailedData ? (
              <div className="flex items-start gap-2 bg-[#0a3a2a]/5 border border-[#0a3a2a]/20 rounded-2xl p-3">
                <span className="material-symbols-outlined text-[#0a3a2a] text-[18px] shrink-0 mt-0.5">info</span>
                <p className="text-[9px] font-bold text-[#0a3a2a] leading-relaxed">{t('tournamentInput.fromDetailed')}</p>
              </div>
            ) : (
              <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-2xl p-3">
                <span className="material-symbols-outlined text-amber-600 text-[18px] shrink-0 mt-0.5">warning</span>
                <p className="text-[9px] font-bold text-amber-800 leading-relaxed">
                  <strong>{t('tournamentInput.fallbackMode')}</strong> — {t('tournamentInput.fallbackDesc')}
                </p>
              </div>
            )}

            {/* DURCHGANG 1 */}
            {(() => {
              const locked = hasDetailedData;
              const score  = locked ? detailedR1.score : (parseInt(summaryR1) || 0);
              const arrows = locked ? ends.slice(0,6).flat().filter(a => a !== 'M').length : 36;
              const avg    = arrows > 0 ? (score / arrows).toFixed(2) : '—';
              const r1x    = locked ? String(detailedR1.x)    : summaryX1;
              const r1t    = locked ? String(detailedR1.tens)  : summary10_1;
              const r1n    = locked ? String(detailedR1.nines) : summary9_1;
              const inputCls = `w-full border rounded-xl p-2 text-center text-base font-black focus:outline-none ${locked ? 'bg-gray-50 border-gray-200 text-gray-500 cursor-not-allowed' : 'bg-white border-emerald-200'}`;
              return (
                <div className="bg-emerald-50 rounded-[24px] p-4 border border-emerald-100 shadow-sm">
                  <div className="flex items-center justify-between mb-3 border-b border-emerald-200/50 pb-1">
                    <h3 className="text-[10px] font-black text-emerald-800 uppercase">{t('tournamentInput.durchgang1')}</h3>
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] font-black text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                        {t('tournamentInput.avgDurchgang')}: <span className="text-[#0a3a2a]">{avg}</span>
                      </span>
                      {locked && ends.slice(0,6).length > 0 && <span className="text-[8px] font-black text-emerald-600 bg-emerald-200/60 px-2 py-0.5 rounded-full">{ends.slice(0,6).length}/6 {t('tournamentInput.passes')}</span>}
                    </div>
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    <div>
                      <label className="text-[8px] font-bold text-emerald-700 uppercase block text-center mb-1">{t('tournamentInput.points')}</label>
                      <input readOnly={locked} type="number" value={locked ? String(score) : summaryR1} onChange={e => { if (!locked) { const v = parseInt(e.target.value); if (e.target.value === '' || (!isNaN(v) && v <= 360)) setSummaryR1(e.target.value); } }} placeholder="0" className={inputCls} />
                    </div>
                    <div><label className="text-[8px] font-bold text-emerald-700 uppercase block text-center mb-1">10</label><input readOnly={locked} type="number" value={r1t} onChange={e => { if (!locked) { const v = parseInt(e.target.value); if (e.target.value === '' || (!isNaN(v) && v <= 36)) setSummary10_1(e.target.value); } }} placeholder="0" className={inputCls} /></div>
                    <div><label className="text-[8px] font-bold text-[#cca800] uppercase block text-center mb-1">X</label><input readOnly={locked} type="number" value={r1x} onChange={e => { if (!locked) { const v = parseInt(e.target.value); if (e.target.value === '' || (!isNaN(v) && v <= 36)) setSummaryX1(e.target.value); } }} placeholder="0" className={inputCls} /></div>
                    <div><label className="text-[8px] font-bold text-gray-400 uppercase block text-center mb-1">9</label><input readOnly={locked} type="number" value={r1n} onChange={e => { if (!locked) { const v = parseInt(e.target.value); if (e.target.value === '' || (!isNaN(v) && v <= 36)) setSummary9_1(e.target.value); } }} placeholder="0" className={inputCls} /></div>
                  </div>
                </div>
              );
            })()}

            {/* DURCHGANG 2 */}
            {(() => {
              const locked = hasDetailedData;
              const score  = locked ? detailedR2.score : (parseInt(summaryR2) || 0);
              const arrows = locked ? ends.slice(6,12).flat().filter(a => a !== 'M').length : 36;
              const avg    = arrows > 0 ? (score / arrows).toFixed(2) : '—';
              const r2x    = locked ? String(detailedR2.x)    : summaryX2;
              const r2t    = locked ? String(detailedR2.tens)  : summary10_2;
              const r2n    = locked ? String(detailedR2.nines) : summary9_2;
              const inputCls = `w-full border rounded-xl p-2 text-center text-base font-black focus:outline-none ${locked ? 'bg-gray-50 border-gray-200 text-gray-500 cursor-not-allowed' : 'bg-white border-blue-100'}`;
              return (
                <div className="bg-blue-50/50 rounded-[24px] p-4 border border-blue-100 shadow-sm">
                  <div className="flex items-center justify-between mb-3 border-b border-blue-200/50 pb-1">
                    <h3 className="text-[10px] font-black text-blue-800 uppercase">{t('tournamentInput.durchgang2')}</h3>
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] font-black text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full">
                        {t('tournamentInput.avgDurchgang')}: <span className="text-blue-900">{avg}</span>
                      </span>
                      {locked && ends.slice(6,12).length > 0 && <span className="text-[8px] font-black text-blue-600 bg-blue-200/60 px-2 py-0.5 rounded-full">{ends.slice(6,12).length}/6 {t('tournamentInput.passes')}</span>}
                    </div>
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    <div>
                      <label className="text-[8px] font-bold text-blue-700 uppercase block text-center mb-1">{t('tournamentInput.points')}</label>
                      <input readOnly={locked} type="number" value={locked ? String(score) : summaryR2} onChange={e => { if (!locked) { const v = parseInt(e.target.value); if (e.target.value === '' || (!isNaN(v) && v <= 360)) setSummaryR2(e.target.value); } }} placeholder="0" className={inputCls} />
                    </div>
                    <div><label className="text-[8px] font-bold text-blue-700 uppercase block text-center mb-1">10</label><input readOnly={locked} type="number" value={r2t} onChange={e => { if (!locked) { const v = parseInt(e.target.value); if (e.target.value === '' || (!isNaN(v) && v <= 36)) setSummary10_2(e.target.value); } }} placeholder="0" className={inputCls} /></div>
                    <div><label className="text-[8px] font-bold text-[#cca800] uppercase block text-center mb-1">X</label><input readOnly={locked} type="number" value={r2x} onChange={e => { if (!locked) { const v = parseInt(e.target.value); if (e.target.value === '' || (!isNaN(v) && v <= 36)) setSummaryX2(e.target.value); } }} placeholder="0" className={inputCls} /></div>
                    <div><label className="text-[8px] font-bold text-gray-400 uppercase block text-center mb-1">9</label><input readOnly={locked} type="number" value={r2n} onChange={e => { if (!locked) { const v = parseInt(e.target.value); if (e.target.value === '' || (!isNaN(v) && v <= 36)) setSummary9_2(e.target.value); } }} placeholder="0" className={inputCls} /></div>
                  </div>
                </div>
              );
            })()}

            {/* ŚREDNIA CAŁEGO MECZU */}
            {(() => {
              const totalScore = stats.totalScore;
              const totalArrows = hasDetailedData
                ? ends.flat().filter(a => a !== 'M').length
                : ((parseInt(summaryR1) || 0) > 0 || (parseInt(summaryR2) || 0) > 0 ? 72 : 0);
              const avg = totalArrows > 0 ? (totalScore / totalArrows).toFixed(2) : '—';
              return totalScore > 0 ? (
                <div className="bg-[#0a3a2a] rounded-[24px] p-4 shadow-md flex items-center justify-between">
                  <div>
                    <p className="text-[9px] font-black text-emerald-300 uppercase tracking-widest mb-0.5">{t('tournamentInput.avgTotal')}</p>
                    <p className="text-[8px] font-bold text-emerald-400/60">{t('tournamentInput.practiceNote')}</p>
                  </div>
                  <span className="text-3xl font-black text-white">{avg}</span>
                </div>
              ) : null;
            })()}

          </div>
        ) : (
          <div className="space-y-[2px]">
            {/* HISTORIA SZCZEGÓŁOWA — aktywny Durchgang na górze */}
            {[1, 0].map(durchgang => {
              const startIdx = durchgang * 6;
              const endIdx = startIdx + 6;
              const durchgangEnds = ends.slice(startIdx, endIdx);
              const isCurrentDurchgang = ends.length >= startIdx && ends.length < endIdx;
              const isDurchgangDone = ends.length >= endIdx;
              const durchgangScore = durchgangEnds.reduce((sum, end) => sum + end.reduce((s, v) => s + getArrowValue(v), 0), 0);

              // Nie pokazuj 2. Durchgandu jeśli jeszcze nie doszliśmy
              if (durchgang === 1 && ends.length < 6 && currentEnd.length === 0) return null;

              return (
                <div key={durchgang} className="mb-3">
                  {/* Nagłówek Durchgangu */}
                  <div className="flex items-center justify-between px-1 mb-1.5">
                    <div className="flex items-center gap-2">
                      <div className={`px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest ${durchgang === 0 ? 'bg-[#0a3a2a] text-white' : 'bg-blue-600 text-white'}`}>
                        Durchgang {durchgang + 1}
                      </div>
                      <span className="text-[8px] font-bold text-gray-400 uppercase">Passe {startIdx + 1}–{startIdx + 6}</span>
                    </div>
                    {isDurchgangDone && (
                      <span className="text-sm font-black text-[#0a3a2a]">{durchgangScore}</span>
                    )}
                  </div>

                  {/* Passe tego Durchgangu — aktywna na górze, historia odwrócona */}
                  <div className="space-y-[2px]">
                    {/* Aktywna passe na górze */}
                    {isCurrentDurchgang && !isFinished && (
                      <div className="bg-emerald-50 border-2 border-emerald-200 rounded-xl p-1.5 flex items-center shadow-sm">
                        <div className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center shrink-0 mr-2 border border-emerald-300">
                          <span className="text-[8px] font-black text-emerald-700">{ends.length + 1}</span>
                        </div>
                        <div className="flex-1 flex gap-1">
                          {[...Array(6)].map((_, aIdx) => {
                            const arrow = currentEnd[aIdx];
                            return arrow ? (
                              <button key={aIdx} onClick={() => setEditingTarget({ endIdx: -1, arrowIdx: aIdx })} className={`w-6 h-6 rounded-md flex items-center justify-center text-[9px] font-black shadow-sm border animate-scale-in ${getArrowStyles(arrow, editingTarget?.endIdx === -1 && editingTarget?.arrowIdx === aIdx)}`}>{arrow}</button>
                            ) : (
                              <div key={aIdx} className="w-6 h-6 rounded-md flex items-center justify-center text-[9px] font-black border-2 border-dashed border-emerald-200 bg-white/50 text-transparent">-</div>
                            );
                          })}
                        </div>
                        <div className="w-8 text-right">
                          <span className="text-sm font-black text-emerald-800">{currentEnd.reduce((acc, v) => acc + getArrowValue(v), 0)}</span>
                        </div>
                      </div>
                    )}

                    {/* Historia passe — od najnowszej do najstarszej */}
                    {[...durchgangEnds].reverse().map((end, revIdx) => {
                      const relIdx = durchgangEnds.length - 1 - revIdx;
                      const realEndIdx = startIdx + relIdx;
                      return (
                        <div key={realEndIdx} className="bg-white border border-gray-100 rounded-xl p-1.5 flex items-center shadow-sm opacity-90 transition-all">
                          <div className="w-6 h-6 rounded-full bg-gray-50 flex items-center justify-center shrink-0 mr-2 border border-gray-200">
                            <span className="text-[8px] font-black text-gray-400">{realEndIdx + 1}</span>
                          </div>
                          <div className="flex-1 flex gap-1">
                            {end.map((arrow, aIdx) => (
                              <button key={aIdx} onClick={() => { setEditingTarget({ endIdx: realEndIdx, arrowIdx: aIdx }); setShowKeyboard(true); }} className={`w-6 h-6 rounded-md flex items-center justify-center text-[9px] font-black border transition-all ${getArrowStyles(arrow, editingTarget?.endIdx === realEndIdx && editingTarget?.arrowIdx === aIdx)}`}>{arrow}</button>
                            ))}
                          </div>
                          <div className="w-8 text-right">
                            <span className="text-sm font-black text-[#0a3a2a]">{end.reduce((acc, v) => acc + getArrowValue(v), 0)}</span>
                          </div>
                        </div>
                      );
                    })}

                    {/* Separator — pokazuje się pod Durchgangiem 2 (który jest u góry) */}
                    {durchgang === 1 && ends.length >= 6 && (
                      <div className="flex items-center gap-2 py-1 mt-1">
                        <div className="flex-1 h-px bg-gray-200" />
                        <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest">D1: {ends.slice(0,6).reduce((s,e)=>s+e.reduce((a,v)=>a+getArrowValue(v),0),0)} / D2: {durchgangScore}</span>
                        <div className="flex-1 h-px bg-gray-200" />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {isFinished && !showKeyboard && (
              <div className="bg-blue-50 border-2 border-blue-100 rounded-[24px] p-4 text-center flex flex-col items-center shadow-sm mt-2">
                <span className="material-symbols-outlined text-3xl text-blue-500 mb-1">verified</span>
                <p className="text-[11px] font-black text-blue-900 uppercase tracking-widest leading-none">{t('tournamentInput.finishedMsg')}</p>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="bg-white border-t border-gray-100 px-5 pt-3 shrink-0 shadow-[0_-10px_20px_rgba(0,0,0,0.02)]">
        {inputMode === 'DETAILED' && (
          <>
            {showKeyboard ? (
              <div className="animate-slide-up">
                {editingTarget && <div className="bg-blue-600 text-white text-[9px] font-black uppercase text-center py-1 rounded-t-lg animate-pulse mb-1">{t('tournamentInput.editMode')}</div>}
                <div className="flex flex-col gap-1.5 w-full mb-2">
                  <div className="grid grid-cols-3 gap-1.5 flex-1">
                    {['X','10','9'].map(v => <button key={v} onClick={() => handleKeyPress(v)} className={`h-12 rounded-xl font-bold text-lg active:scale-95 transition-all ${getArrowStyles(v, false)}`}>{v}</button>)}
                  </div>
                  <div className="grid grid-cols-3 gap-1.5 flex-1">
                    {['8','7','6'].map(v => <button key={v} onClick={() => handleKeyPress(v)} className={`h-12 rounded-xl font-bold text-lg active:scale-95 transition-all ${getArrowStyles(v, false)}`}>{v}</button>)}
                  </div>
                  <div className="grid grid-cols-3 gap-1.5 flex-1">
                    {['5','4','3'].map(v => <button key={v} onClick={() => handleKeyPress(v)} className={`h-12 rounded-xl font-bold text-lg active:scale-95 transition-all ${getArrowStyles(v, false)}`}>{v}</button>)}
                  </div>
                  <div className="grid grid-cols-3 gap-1.5 flex-1">
                    <button onClick={() => handleKeyPress('2')} className={`h-12 rounded-xl font-bold text-lg active:scale-95 transition-all ${getArrowStyles('2', false)}`}>2</button>
                    <button onClick={() => handleKeyPress('1')} className={`h-12 rounded-xl font-bold text-lg active:scale-95 transition-all ${getArrowStyles('1', false)}`}>1</button>
                    <div className="grid grid-cols-2 gap-1.5">
                      <button onClick={() => handleKeyPress('M')} className={`h-12 rounded-xl font-bold text-lg active:scale-95 transition-all ${getArrowStyles('M', false)}`}>M</button>
                      <button onClick={handleDelete} className="h-12 rounded-xl bg-white border border-red-100 text-red-500 shadow-sm flex items-center justify-center active:scale-95 transition-all">
                        <span className="material-symbols-outlined text-lg font-black">{editingTarget ? 'cancel' : 'undo'}</span>
                      </button>
                    </div>
                  </div>
                </div>
                <button onClick={() => { setShowKeyboard(false); setEditingTarget(null); }} className="w-full py-1 text-[9px] font-bold text-gray-300 uppercase tracking-widest mb-1">{t('tournamentInput.hideKeyboard')}</button>
              </div>
            ) : (
              <button onClick={() => setShowKeyboard(true)} className={`w-full py-3 mb-2 rounded-xl font-black text-[10px] uppercase tracking-widest border shadow-sm animate-fade-in ${isFinished ? 'bg-gray-100 text-gray-500 border-gray-200' : 'bg-[#fed33e] text-[#5d4a00] border-[#e5bd38]'}`}>{isFinished ? t('tournamentInput.fixScores') : t('tournamentInput.showKeyboard')}</button>
            )}
          </>
        )}

        <div className="flex items-center justify-between bg-gray-50 border border-gray-100 rounded-xl px-4 py-2.5 mb-2 mt-1 shadow-sm">
          <div className="flex flex-col">
            <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest leading-none mb-0.5">{t('tournamentInput.practiceArrowsLabel')}</span>
            <span className="text-lg font-black text-[#0a3a2a] leading-none">{practiceArrows}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <button onClick={() => setPracticeArrows(p => Math.max(0, p - 1))} className="w-8 h-8 rounded-lg bg-white border border-gray-200 flex items-center justify-center text-gray-500 font-black text-sm shadow-sm active:scale-90 transition-all">−1</button>
            <button onClick={() => setPracticeArrows(p => p + 1)} className="w-8 h-8 rounded-lg bg-white border border-gray-200 flex items-center justify-center text-gray-500 font-black text-sm shadow-sm active:scale-90 transition-all">+1</button>
            <button onClick={() => setPracticeArrows(p => p + 6)} className="w-10 h-8 rounded-lg bg-[#0a3a2a] border border-[#0a3a2a] flex items-center justify-center text-white font-black text-sm shadow-sm active:scale-90 transition-all">+6</button>
          </div>
        </div>

        <div className="relative mb-2">
          <input type="text" maxLength={50} value={aiNote} onChange={e => setAiNote(e.target.value)} placeholder={t('tournamentInput.aiPlaceholder')} className="w-full bg-yellow-50/50 border border-yellow-200/60 rounded-xl p-3 text-[10px] font-bold text-[#0a3a2a] focus:outline-none focus:border-yellow-400 pr-10 shadow-inner" />
          <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-yellow-500 text-[18px]">psychology</span>
        </div>
        
        <button onClick={saveTournamentScore} disabled={isSaving || (inputMode === 'DETAILED' && ends.length === 0 && currentEnd.length === 0) || (inputMode === 'SUMMARY' && !summaryR1 && !summaryR2)} className={`w-full h-14 text-white rounded-[20px] font-black text-xs uppercase tracking-widest shadow-lg flex items-center justify-center gap-2 active:scale-95 transition-all ${isSaving ? 'bg-gray-400' : 'bg-[#0a3a2a]'}`}>{isSaving ? t('tournamentInput.saving') : t('tournamentInput.saveBtn')}</button>
      </div>

      <style>{`
        .animate-fade-in-up { animation: fadeInUp 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        .animate-slide-up { animation: slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        .animate-scale-in { animation: scaleIn 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards; }
        @keyframes scaleIn { from { transform: scale(0.5); opacity: 0; } to { scale(1); opacity: 1; } }
        @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
      `}</style>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(content, document.body) : content;
}