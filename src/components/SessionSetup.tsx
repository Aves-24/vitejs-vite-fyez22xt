import React, { useState, useEffect } from 'react';
import { collection, query, onSnapshot, doc, getDoc, getDocs, setDoc, addDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { useTranslation } from 'react-i18next';

interface SessionSetupProps {
  userId: string;
  activeDistances: any[];
  onStartSession: (distance: string, targetType: string, forceClear: boolean, battleId: string | null) => void;
  onUpdateDistances?: (newDistances: any[]) => void; 
  onNavigate?: (view: string, tab?: string) => void; 
  onGoToBattle?: (distance: string, targetType: string) => void;
  hasActiveSession?: boolean; 
}

const ADMIN_IDS = ['Lglbqv96HlO2LoN98yxrIeaQS172', 'b55wNdZf17gH5wxziuzG9bkaQKo2'];

export default function SessionSetup({ userId, activeDistances, onStartSession, onUpdateDistances, onNavigate, onGoToBattle, hasActiveSession }: SessionSetupProps) {
  const { t } = useTranslation();
  const [selectedDistance, setSelectedDistance] = useState<string>('');
  const [selectedTarget, setSelectedTarget] = useState<string>('122cm');
  
  const [sightExtension, setSightExtension] = useState<string>('');
  const [sightHeight, setSightHeight] = useState<string>('');
  const [sightSide, setSightSide] = useState<string>('');
  
  const [hasUnsaved, setHasUnsaved] = useState(false);
  const [showWarning, setShowWarning] = useState(false);
  const [isPremium, setIsPremium] = useState(false);
  
  const [showSightEditor, setShowSightEditor] = useState(false);
  const [editExt, setEditExt] = useState('');
  const [editHeight, setEditHeight] = useState('');
  const [editSide, setEditSide] = useState('');
  const [isSavingSight, setIsSavingSight] = useState(false);

  // Stany dla treningu technicznego
  const [showTechModal, setShowTechModal] = useState(false);
  const [techArrows, setTechArrows] = useState<string>(() => localStorage.getItem(`grotX_techCounter_${userId}`) || '0');
  const [techNote, setTechNote] = useState('');
  const [isSavingTech, setIsSavingTech] = useState(false);
  const [counterSaved, setCounterSaved] = useState(false);

  const [isSavingCounter, setIsSavingCounter] = useState(false);

  const updateCounter = (newVal: string) => {
    setTechArrows(newVal);
    localStorage.setItem(`grotX_techCounter_${userId}`, newVal);
    setCounterSaved(true);
    setTimeout(() => setCounterSaved(false), 1200);
  };

  const invalidateStatsCache = () => {
    localStorage.removeItem(`grotX_stats_v4_${userId}`);
    localStorage.removeItem(`grotX_lastSession_${userId}`);
    window.dispatchEvent(new CustomEvent('grotx-stats-updated'));
  };

  const handleSaveCounter = async () => {
    const count = parseInt(techArrows || '0');
    if (count <= 0) { updateCounter('0'); return; }
    setIsSavingCounter(true);
    try {
      await addDoc(collection(db, `users/${userId}/sessions`), {
        userId,
        distance: 'TECH',
        targetType: 'TECHNICAL',
        arrows: count,
        totalArrows: count,
        note: '',
        createdAt: serverTimestamp(),
        type: 'TECHNICAL',
        timestamp: Timestamp.fromDate(new Date()),
        date: new Date().toLocaleDateString('pl-PL'),
      });
      setTechArrows('0');
      localStorage.removeItem(`grotX_techCounter_${userId}`);
      invalidateStatsCache();
      setCounterSaved(true);
      setTimeout(() => setCounterSaved(false), 1800);
    } catch (e) {
      console.error('Error saving counter:', e);
    } finally {
      setIsSavingCounter(false);
    }
  };

  const targetOptions = ['3-Spot', '40cm', '60cm', '80cm (6-Ring)', '80cm', '122cm', 'Field'];

  useEffect(() => {
    if (hasActiveSession) {
      setHasUnsaved(true);
      setShowWarning(true);
    }
  }, [hasActiveSession]);

  useEffect(() => {
    const checkData = async () => {
      try {
        const profileSnap = await getDoc(doc(db, 'users', userId));
        if (profileSnap.exists()) {
          const data = profileSnap.data();
          let userIsPro = data.isPremium === true || data.isPremiumPromo === true;
          if (data.trialEndsAt) {
            const trialEnd = new Date(data.trialEndsAt);
            if (trialEnd > new Date()) userIsPro = true;
          }
          if (ADMIN_IDS.includes(userId)) userIsPro = true;
          setIsPremium(userIsPro);
        }
      } catch (e) { console.error(e); }
    };
    if (userId) checkData();
  }, [userId]);

  useEffect(() => {
    if (activeDistances.length > 0 && !selectedDistance) {
      updateSelection(activeDistances[0].m);
    }
  }, [activeDistances, selectedDistance]);

  const updateSelection = (dist: string) => {
    setSelectedDistance(dist);
    const profileDist = activeDistances.find(d => d.m === dist);
    if (profileDist) {
      setSelectedTarget(profileDist.targetType || '122cm');
      setSightExtension(profileDist.sightExtension || '');
      setSightHeight(profileDist.sightHeight || '');
      setSightSide(profileDist.sightSide || '');
    }
  };

  const handleStartClick = () => {
    if (hasUnsaved) setShowWarning(true);
    else onStartSession(selectedDistance, selectedTarget, true, null);
  };

  const openSightEditor = () => {
    setEditExt(sightExtension); setEditHeight(sightHeight); setEditSide(sightSide);
    setShowSightEditor(true);
  };

  const handleSaveTechnical = async () => {
    setIsSavingTech(true);
    const count = techArrows ? parseInt(techArrows) : 0;
    try {
      await addDoc(collection(db, `users/${userId}/sessions`), {
        userId,
        distance: 'TECH',
        targetType: 'TECHNICAL',
        arrows: count,
        totalArrows: count,
        note: techNote,
        createdAt: serverTimestamp(),
        type: 'TECHNICAL',
        timestamp: Timestamp.fromDate(new Date()),
        date: new Date().toLocaleDateString('pl-PL'),
      });
      setShowTechModal(false);
      setTechArrows('0');
      setTechNote('');
      localStorage.removeItem(`grotX_techCounter_${userId}`);
      invalidateStatsCache();
      if (onNavigate) onNavigate('STATS');
    } catch (e) {
      console.error("Error saving technical session:", e);
    } finally {
      setIsSavingTech(false);
    }
  };

  const saveSightSettings = async () => {
    setIsSavingSight(true);
    try {
      const profileSnap = await getDoc(doc(db, 'users', userId));
      if (profileSnap.exists()) {
        const userDistances = profileSnap.data().userDistances || [];
        const idx = userDistances.findIndex((d: any) => d.m === selectedDistance);
        if (idx !== -1) {
          userDistances[idx].sightExtension = editExt;
          userDistances[idx].sightHeight = editHeight;
          userDistances[idx].sightSide = editSide;
          await setDoc(doc(db, 'users', userId), { userDistances }, { merge: true });
          setSightExtension(editExt); setSightHeight(editHeight); setSightSide(editSide);
          if (onUpdateDistances) onUpdateDistances(userDistances);
        }
      }
      setShowSightEditor(false);
    } catch (error) { console.error(error); } 
    finally { setIsSavingSight(false); }
  };

  return (
    <div className="flex flex-col h-full bg-[#fcfdfe] pt-[env(safe-area-inset-top)] px-3 pb-24 animate-fade-in max-w-md mx-auto relative">
      <div className="mt-2 mb-2 text-center">
        <h1 className="text-lg font-black text-[#0a3a2a] tracking-tight uppercase">{t('setup.title')}</h1>
      </div>

      <div className="space-y-2">
        <div className="bg-white px-3 py-2.5 rounded-[20px] border border-gray-100 shadow-sm">
          <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-2 text-center">{t('setup.selectDistance')}</span>
          <div className="flex flex-wrap gap-1.5 justify-center">
            {activeDistances.map((d) => (
              <button
                key={d.m}
                onClick={() => updateSelection(d.m)}
                className={`flex-1 min-w-[30%] py-2 rounded-xl font-black text-sm transition-all active:scale-95 border-2 ${
                  selectedDistance === d.m
                    ? 'bg-[#0a3a2a] border-[#0a3a2a] text-white shadow-md'
                    : 'bg-white border-gray-100 text-gray-400 hover:border-gray-200'
                }`}
              >
                {d.m}
              </button>
            ))}
          </div>
        </div>

        <div className="bg-[#0a3a2a] px-3 py-2.5 rounded-[20px] shadow-lg border border-emerald-900 relative overflow-hidden">
          <div className="flex justify-between items-center mb-1.5 relative z-10">
             <span className="text-[9px] font-black text-emerald-400 uppercase tracking-widest">{t('setup.sightTitle')}</span>
             <div className="flex items-center gap-2">
               {isPremium && <button onClick={openSightEditor} className="w-5 h-5 flex items-center justify-center bg-white/5 border border-white/10 rounded-md text-emerald-400 active:scale-90 transition-all"><span className="material-symbols-outlined text-[12px]">edit</span></button>}
               <span className="text-[11px] font-black text-white bg-white/10 px-2 py-0.5 rounded-md">{selectedDistance}</span>
             </div>
          </div>
          {isPremium ? (
            <div className="grid grid-cols-3 gap-1.5 relative z-10">
              <div className="bg-black/20 rounded-xl py-1.5 px-1 flex flex-col items-center justify-center border border-white/5">
                <span className="text-[8px] font-bold text-emerald-300/60 uppercase mb-0.5 tracking-tighter">{t('setup.sightExt')}</span>
                <span className="text-lg font-black text-[#fed33e]">{sightExtension || '-'}</span>
              </div>
              <div className="bg-black/20 rounded-xl py-1.5 px-1 flex flex-col items-center justify-center border border-white/5 shadow-inner">
                <span className="text-[8px] font-bold text-emerald-300/60 uppercase mb-0.5 tracking-tighter">{t('setup.sightHeight')}</span>
                <span className="text-2xl font-black text-white">{sightHeight || '-'}</span>
              </div>
              <div className="bg-black/20 rounded-xl py-1.5 px-1 flex flex-col items-center justify-center border border-white/5">
                <span className="text-[8px] font-bold text-emerald-300/60 uppercase mb-0.5 tracking-tighter">{t('setup.sightSide')}</span>
                <span className="text-lg font-black text-[#fed33e]">{sightSide || '-'}</span>
              </div>
            </div>
          ) : (
            <button onClick={() => onNavigate?.('SETTINGS', 'PRO')} className="w-full relative z-10 flex flex-col items-center justify-center py-1.5 active:scale-95"><span className="material-symbols-outlined text-[#F2C94C] text-lg mb-0.5">diamond</span><span className="text-[9px] font-black text-[#F2C94C] uppercase tracking-widest">{t('setup.sightPro')}</span></button>
          )}
        </div>

        <div className="bg-white px-3 py-2.5 rounded-[20px] border border-gray-100 shadow-sm transition-all duration-300">
          <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-2 text-center">
            {t('setup.targetTitle')}
          </span>
          <div className="w-full py-2 px-3 rounded-xl shadow-inner mb-2 flex items-center justify-center gap-3 relative overflow-hidden transition-colors bg-[#0a3a2a]">
            <span className="text-[9px] font-bold text-emerald-400 uppercase tracking-widest z-10">{t('setup.selected')}:</span>
            <span className="text-xl font-black text-white uppercase tracking-tight z-10">{selectedTarget}</span>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
            {targetOptions.filter(t => t !== selectedTarget).map((t) => (
              <button
                key={t}
                onClick={() => setSelectedTarget(t)}
                className="h-8 flex items-center justify-center rounded-lg border bg-white text-gray-400 border-gray-100 hover:border-gray-200 transition-all active:scale-95"
              >
                <span className="text-[10px] font-black uppercase tracking-tight text-center leading-none px-1 truncate w-full">{t}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-3">

        {/* PFEILZÄHLER */}
        <div className="bg-white rounded-[20px] border-2 border-[#0a3a2a] shadow-sm px-3 pt-2 pb-2.5 mb-2">
          <div className="flex items-center justify-center gap-2 mb-1.5">
            <span className="text-[13px] font-black text-[#0a3a2a] uppercase tracking-widest">{t('sessionSetup.arrowCounter')}</span>
            <span className={`text-[9px] font-black uppercase tracking-widest transition-all duration-300 ${counterSaved ? 'text-blue-400 opacity-100' : 'opacity-0'}`}>
              ✓ {parseInt(techArrows || '0')}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => updateCounter(String(Math.max(0, parseInt(techArrows || '0') + 6)))}
              className="flex-1 py-2.5 bg-blue-500 text-white rounded-xl font-black text-base active:scale-95 transition-all"
            >+6</button>
            <button
              onClick={() => updateCounter(String(Math.max(0, parseInt(techArrows || '0') + 1)))}
              className="flex-1 py-2.5 bg-blue-100 text-blue-700 rounded-xl font-black text-base active:scale-95 transition-all"
            >+1</button>
            <button
              onClick={() => updateCounter(String(Math.max(0, parseInt(techArrows || '0') - 1)))}
              className="flex-1 py-2.5 bg-red-50 text-red-500 rounded-xl font-black text-base active:scale-95 transition-all border border-red-100"
            >−1</button>
            <div className="flex-1 py-2.5 bg-[#0a3a2a] text-white rounded-xl font-black text-2xl flex items-center justify-center">
              {techArrows || '0'}
            </div>
            <button
              onClick={handleSaveCounter}
              disabled={isSavingCounter}
              className="px-4 py-2.5 bg-emerald-500 text-white rounded-xl active:scale-95 transition-all disabled:opacity-50 shadow-sm font-black text-[13px] uppercase tracking-wide"
            >
              {isSavingCounter
                ? <span className="material-symbols-outlined text-[20px] animate-spin">progress_activity</span>
                : t('sessionSetup.saveCounter')
              }
            </button>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => setShowTechModal(true)}
            disabled={!selectedDistance}
            className="flex-1 py-5 bg-emerald-600 text-white rounded-[20px] font-black flex flex-col items-center justify-end relative overflow-hidden active:scale-95 shadow-lg shadow-emerald-100 transition-all disabled:opacity-50 min-h-[90px]"
          >
            <span className="material-symbols-outlined absolute text-[80px] text-white/10 -top-3 left-1/2 -translate-x-1/2">psychology</span>
            <span className="text-[13px] uppercase tracking-wide text-center leading-tight whitespace-pre-line relative z-10">{t('setup.techBtn')}</span>
          </button>

          <button
            onClick={handleStartClick}
            disabled={!selectedDistance}
            className="flex-1 py-5 bg-[#F2C94C] text-[#8B6508] rounded-[20px] font-black flex flex-col items-center justify-end relative overflow-hidden active:scale-95 shadow-lg shadow-yellow-200 transition-all disabled:opacity-50 min-h-[90px]"
          >
            <span className="material-symbols-outlined absolute text-[80px] text-[#8B6508]/10 -top-3 left-1/2 -translate-x-1/2">target</span>
            <span className="text-[13px] uppercase tracking-wide text-center leading-tight whitespace-pre-line relative z-10">{t('setup.startBtn')}</span>
          </button>

          <button
            onClick={() => {
              if (onGoToBattle) {
                onGoToBattle(selectedDistance, selectedTarget);
              } else {
                onNavigate?.('BATTLE_LOBBY');
              }
            }}
            disabled={!selectedDistance}
            className="flex-1 py-5 bg-indigo-600 text-white rounded-[20px] font-black flex flex-col items-center justify-end relative overflow-hidden active:scale-95 shadow-lg shadow-indigo-200 transition-all disabled:opacity-50 min-h-[90px]"
          >
            <span className="material-symbols-outlined absolute text-[80px] text-white/10 -top-3 left-1/2 -translate-x-1/2">swords</span>
            <span className="text-[13px] uppercase tracking-wide text-center leading-tight whitespace-pre-line relative z-10">{t('setup.battleBtn')}</span>
          </button>
        </div>
        
        {hasUnsaved && (
          <button 
            onClick={() => onStartSession(selectedDistance, selectedTarget, false, null)} 
            className="w-full py-4 mt-2 rounded-[20px] font-black text-[10px] uppercase tracking-widest border-2 border-red-500 text-red-500 bg-red-50 active:scale-95 transition-all flex items-center justify-center gap-2"
          >
            <span className="material-symbols-outlined text-sm">history</span>
            {t('setup.continueBtn')}
          </button>
        )}
      </div>

      {/* MODAL TRENINGU TECHNICZNEGO */}
      {showTechModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100001] flex items-start justify-center p-3 pt-[calc(env(safe-area-inset-top)+56px)]">
          <div className="bg-white w-full max-w-md rounded-[28px] p-5 pb-6 animate-fade-in-up shadow-2xl border-t-4 border-emerald-600">

            {/* HEADER */}
            <div className="flex justify-between items-center mb-4">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-emerald-600 text-lg">psychology</span>
                <h2 className="text-base font-black text-[#0a3a2a] uppercase">{t('stats.techSessionTitle')}</h2>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black text-emerald-600 bg-emerald-50 px-2 py-1 rounded-lg uppercase tracking-widest">{t('sessionSetup.techSubtitle')}</span>
                <button onClick={() => setShowTechModal(false)} className="text-gray-400 p-1 active:scale-90 transition-all"><span className="material-symbols-outlined text-lg">close</span></button>
              </div>
            </div>

            {/* LICZNIK STRZAŁ */}
            <div className="bg-[#0a3a2a]/5 rounded-[20px] border-2 border-[#0a3a2a]/10 px-3 py-3 mb-4">
              <span className="text-[13px] font-black text-[#0a3a2a] uppercase tracking-widest block mb-2.5 text-center">{t('sessionSetup.arrowCounter')}</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setTechArrows(v => String(Math.max(0, parseInt(v || '0') + 6)))}
                  className="flex-1 py-3 bg-emerald-500 text-white rounded-xl font-black text-base active:scale-95 transition-all"
                >+6</button>
                <button
                  onClick={() => setTechArrows(v => String(Math.max(0, parseInt(v || '0') + 1)))}
                  className="flex-1 py-3 bg-emerald-100 text-emerald-700 rounded-xl font-black text-base active:scale-95 transition-all"
                >+1</button>
                <button
                  onClick={() => setTechArrows(v => String(Math.max(0, parseInt(v || '0') - 1)))}
                  className="flex-1 py-3 bg-red-50 text-red-500 rounded-xl font-black text-base active:scale-95 transition-all border border-red-100"
                >−1</button>
                <div className="flex-1 py-3 bg-[#0a3a2a] text-white rounded-xl font-black text-2xl flex items-center justify-center">
                  {techArrows || '0'}
                </div>
              </div>
            </div>

            {/* NOTATKI */}
            <div className="mb-5">
              <div className="flex justify-between items-center mb-1.5">
                <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">{t('sessionSetup.techNotes')}</span>
                <span className={`text-[9px] font-bold ${techNote.length >= 100 ? 'text-red-500' : 'text-gray-300'}`}>{techNote.length}/100</span>
              </div>
              <textarea
                value={techNote}
                onChange={e => setTechNote(e.target.value)}
                maxLength={100}
                placeholder={t('sessionSetup.notePlaceholder')}
                className="w-full bg-gray-50 border-2 border-gray-100 p-3 rounded-xl font-bold text-sm text-[#0a3a2a] focus:border-emerald-500 outline-none transition-all h-24 resize-none"
              />
            </div>

            <button
              onClick={handleSaveTechnical}
              disabled={isSavingTech}
              className={`w-full py-4 rounded-2xl font-black uppercase tracking-widest transition-all active:scale-95 flex items-center justify-center gap-2 ${
                isSavingTech ? 'bg-gray-100 text-gray-400' : 'bg-emerald-600 text-white shadow-xl shadow-emerald-100'
              }`}
            >
              {isSavingTech ? t('common.saving') : t('sessionSetup.saveBtn')}
            </button>
          </div>
        </div>
      )}

      {showSightEditor && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100000] flex items-end justify-center">
          <div className="bg-white w-full max-w-md rounded-t-[32px] p-6 pb-12 animate-fade-in-up">
            <h2 className="text-xl font-black text-[#0a3a2a] mb-6">{t('setup.editorTitle')} ({selectedDistance})</h2>
            <div className="space-y-4 mb-8 text-center">
              <input type="text" value={editExt} onChange={e => setEditExt(e.target.value)} placeholder={t('setup.editorExt')} className="w-full bg-gray-50 border p-4 rounded-xl font-bold" />
              <input type="text" value={editHeight} onChange={e => setEditHeight(e.target.value)} placeholder={t('setup.editorHeight')} className="w-full bg-gray-50 border p-4 rounded-xl font-bold" />
              <input type="text" value={editSide} onChange={e => setEditSide(e.target.value)} placeholder={t('setup.editorSide')} className="w-full bg-gray-50 border p-4 rounded-xl font-bold" />
            </div>
            <button onClick={saveSightSettings} className="w-full py-4 bg-[#0a3a2a] text-white rounded-xl font-black uppercase">{t('setup.editorSave')}</button>
          </div>
        </div>
      )}

      {showWarning && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[99999] flex items-center justify-center p-6">
          <div className="bg-white rounded-[32px] p-8 w-full shadow-2xl text-center">
            <h2 className="text-xl font-black text-[#0a3a2a] mb-2">{t('setup.warningTitle')}</h2>
            <button onClick={() => onStartSession(selectedDistance, selectedTarget, true, null)} className="w-full py-4 bg-red-500 text-white rounded-xl font-black uppercase mb-3">{t('setup.warningConfirm')}</button>
            <button onClick={() => setShowWarning(false)} className="w-full py-4 bg-gray-100 text-gray-500 rounded-xl font-black uppercase">{t('setup.warningCancel')}</button>
          </div>
        </div>
      )}

      <style>{`
        .animate-fade-in-up { animation: fadeInUp 0.3s ease-out forwards; } 
        @keyframes fadeInUp { from { opacity: 0; transform: translateY(15px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
}