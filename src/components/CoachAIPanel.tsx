import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { useTranslation } from 'react-i18next'; // <--- DODANE

interface CoachAIPanelProps {
  userId: string;
  totalScore: number;
  arrowCount: number;
  accuracy: string | number;
}

export default function CoachAIPanel({ userId, totalScore, arrowCount, accuracy }: CoachAIPanelProps) {
  const { t } = useTranslation(); // <--- DODANE
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<string | null>(null);
  
  const [lastAdvice, setLastAdvice] = useState<string>(t('coach.noPrevious'));

  useEffect(() => {
    if (!userId) return;
    
    const fetchLastAdvice = async () => {
      try {
        const docSnap = await getDoc(doc(db, 'users', userId));
        if (docSnap.exists() && docSnap.data().lastCoachAdvice) {
          setLastAdvice(docSnap.data().lastCoachAdvice);
        }
      } catch (e) {
        console.error("Błąd pobierania notatek trenera:", e);
      }
    };
    
    fetchLastAdvice();
  }, [userId, t]);

  const handleGenerateAnalysis = () => {
    setIsAnalyzing(true);
    
    setTimeout(async () => {
      // Używamy szablonu z i18n, wstrzykując aktualne parametry sesji
      const generatedAdvice = t('coach.mockAdvice', {
        score: totalScore,
        arrows: arrowCount,
        accuracy: accuracy
      });
      
      setAnalysisResult(generatedAdvice);
      setIsAnalyzing(false);

      if (userId) {
        try {
          await updateDoc(doc(db, 'users', userId), {
            lastCoachAdvice: t('coach.saveAdvice')
          });
        } catch (e) {
          console.error("Błąd zapisu nowej porady trenera:", e);
        }
      }
    }, 2500);
  };

  return (
    <div className="bg-gradient-to-br from-[#0a3a2a] to-emerald-900 p-5 mx-2 rounded-2xl shadow-lg border border-emerald-800 flex flex-col mt-4 text-white relative overflow-hidden">
      
      {/* Tło */}
      <div className="absolute -right-4 -top-4 opacity-[0.07] pointer-events-none">
         <span className="material-symbols-outlined text-[140px]">smart_toy</span>
      </div>
      
      <div className="flex items-center justify-between mb-4 relative z-10">
        <div className="flex items-center gap-2">
          <div className="bg-emerald-500/20 p-2 rounded-xl border border-emerald-500/30 flex items-center justify-center">
             <span className="material-symbols-outlined text-emerald-400 text-lg">psychology</span>
          </div>
          <h3 className="text-[11px] font-black text-emerald-50 uppercase tracking-widest leading-tight">
            {t('coach.virtualTrainer')} <br/> <span className="text-[9px] text-emerald-400 font-bold opacity-80">{t('coach.aiAnalysis')}</span>
          </h3>
        </div>
      </div>

      <div className="relative z-10">
        {!analysisResult && !isAnalyzing && (
          <div className="flex flex-col gap-3">
            <div className="bg-black/20 p-3 rounded-xl border border-white/5 border-l-2 border-l-emerald-500">
              <span className="text-[9px] font-bold text-emerald-400 uppercase tracking-widest block mb-1">{t('coach.previousNote')}</span>
              <p className="text-xs text-emerald-50/80 italic">"{lastAdvice}"</p>
            </div>
            <button 
              onClick={handleGenerateAnalysis}
              className="w-full py-3.5 bg-emerald-500 text-[#0a3a2a] rounded-xl font-black text-[11px] uppercase tracking-wider shadow-[0_0_15px_rgba(16,185,129,0.3)] active:scale-95 transition-all border border-emerald-400 flex items-center justify-center gap-2"
            >
              <span className="material-symbols-outlined text-sm">auto_awesome</span>
              {t('coach.generateBtn')}
            </button>
          </div>
        )}

        {isAnalyzing && (
          <div className="flex flex-col items-center justify-center py-6 gap-3">
            <span className="material-symbols-outlined text-4xl text-emerald-400 animate-spin">autorenew</span>
            <span className="text-[10px] font-bold text-emerald-300 uppercase tracking-widest animate-pulse">{t('coach.analyzing')}</span>
          </div>
        )}

        {analysisResult && !isAnalyzing && (
          <div className="bg-black/20 p-4 rounded-xl border border-white/10 animate-fade-in-up">
            <p className="text-xs text-emerald-50 leading-relaxed whitespace-pre-line font-medium">
              {analysisResult}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}