import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import jsPDF from 'jspdf';
import { buildSessionPdf } from './export/sessionPdf';
import { useTranslation } from 'react-i18next'; 

interface ExportPanelProps {
  session: any; 
  isPremium: boolean;
  onTriggerPaywall: () => void;
  roundSize?: number;   // podział na rundy (krótsze treningi: 6/8/10 serii)
  targetType?: string;  // tarcza do rysunku (StatsView: displayTargetType)
  sightHint?: boolean;  // łuk z celownikiem — linijka korekty celownika
}

export default function ExportPanel({ session, isPremium, onTriggerPaywall, roundSize = 6, targetType, sightHint }: ExportPanelProps) {
  const { t, i18n } = useTranslation();
  const [isExporting, setIsExporting] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastIsError, setToastIsError] = useState(false);

  const showToast = (msg: string, isError = false) => {
    setToastIsError(isError);
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Wczytywanie polskiej czcionki Unicode do PDF.
  // Czcionki self-hosted w public/fonts/ (wcześniej cdnjs.cloudflare.com) —
  // brak wycieku IP do zewnętrznego CDN, eksport działa też offline.
  const fetchFontAsBase64 = async (path: string): Promise<string> => {
    const response = await fetch(path);
    const bytes = new Uint8Array(await response.arrayBuffer());
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  };

  const loadCustomFont = async (doc: jsPDF) => {
    try {
      doc.addFileToVFS('Roboto-Regular.ttf', await fetchFontAsBase64('/fonts/Roboto-Regular.ttf'));
      doc.addFont('Roboto-Regular.ttf', 'Roboto', 'normal', 'Identity-H');

      // Pogrubiona czcionka dla nagłówków
      doc.addFileToVFS('Roboto-Medium.ttf', await fetchFontAsBase64('/fonts/Roboto-Medium.ttf'));
      doc.addFont('Roboto-Medium.ttf', 'Roboto', 'bold', 'Identity-H');

      return true;
    } catch (error) {
      console.warn("Nie udało się załadować czcionki.", error);
      return false;
    }
  };

  // --- GŁÓWNA FUNKCJA EKSPORTU ---

  const handleGeneratePDF = async () => {
    if (!session || !session.ends || session.ends.length === 0) {
      showToast(t('export.errorEmpty', 'Brak strzał do wyeksportowania w tej sesji.'), true);
      return;
    }
    setIsExporting(true);

    try {
      const doc = new jsPDF();
      await loadCustomFont(doc); 
      doc.setFont('Roboto', 'normal');

      const date = session.date || new Date().toLocaleDateString(i18n.language === 'en' ? 'en-GB' : i18n.language === 'de' ? 'de-DE' : 'pl-PL');
      // [PDF 2026-10-29] Układ nowego podsumowania — components/export/sessionPdf.ts
      buildSessionPdf(doc, session, {
        t, lang: i18n.language, roundSize, targetType: targetType || session.targetType || 'Full', sightHint,
        note: session.isNotePublic !== false ? (session.note || '') : '',
      });

      doc.save(`GrotX_Report_${date}.pdf`);

    } catch (e) {
      console.error(e);
      showToast(t('export.errorGenerate', 'Wystąpił błąd podczas generowania dokumentu.'), true);
    } finally {
      setIsExporting(false);
    }
  };

  const handleGenerateCSV = () => {
    if (!isPremium) {
      onTriggerPaywall();
      return;
    }

    if (!session || !session.ends || session.ends.length === 0) {
      showToast(t('export.errorEmpty', 'Brak strzał do wyeksportowania w tej sesji.'), true);
      return;
    }

    const date = session.date || new Date().toISOString().split('T')[0];
    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "Seria,Strzala 1,Strzala 2,Strzala 3,Strzala 4,Strzala 5,Strzala 6,Suma\n"; 
    
    session.ends.forEach((end: any, index: number) => {
       const arrs = end.arrows || [];
       const row = [
         index + 1, 
         arrs[0] || '', arrs[1] || '', arrs[2] || '', 
         arrs[3] || '', arrs[4] || '', arrs[5] || '', 
         end.total_sum || 0
       ];
       csvContent += row.join(",") + "\n";
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `GrotX_Data_${date}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="pl-2 pr-3 pt-2.5 pb-3 space-y-2.5 relative">
      {toastMessage && createPortal(
        <div className={`fixed top-14 left-1/2 -translate-x-1/2 z-[500000] text-white px-6 py-3.5 rounded-full font-black text-[10px] uppercase tracking-widest shadow-2xl animate-fade-in-up flex items-center gap-2 whitespace-nowrap ${toastIsError ? 'bg-red-700' : 'bg-[#0a3a2a]'}`}>
          <span className={`material-symbols-outlined text-sm ${toastIsError ? 'text-red-200' : 'text-emerald-400'}`}>{toastIsError ? 'error' : 'check_circle'}</span>
          {toastMessage}
        </div>, document.body
      )}
      {/* Nagłówek jak karty dziennika (2026-10-29) — panel siedzi w tb-card w StatsView. */}
      <div className="flex items-center gap-2.5">
        <span className="tb-icon w-8 h-8 rounded-lg flex items-center justify-center shrink-0">
          <span className="material-symbols-outlined text-[18px] text-emerald-600">ios_share</span>
        </span>
        <span className="text-[9px] font-black text-emerald-700 uppercase tracking-widest">{t('export.title', 'Eksport Danych')}</span>
      </div>
      
      <div className="grid grid-cols-2 gap-2">
        {/* LEWY PRZYCISK: Karta PDF */}
        <button 
          onClick={handleGeneratePDF}
          disabled={isExporting}
          className="bg-white border border-gray-200 p-2.5 rounded-xl flex items-center gap-2.5 shadow-sm active:scale-95 transition-all hover:bg-gray-50 disabled:opacity-50"
        >
          <div className="bg-gray-100 text-gray-500 p-1.5 rounded-lg shrink-0 flex items-center justify-center">
            {isExporting ? (
              <span className="material-symbols-outlined text-lg animate-spin">sync</span>
            ) : (
              <span className="material-symbols-outlined text-lg">picture_as_pdf</span>
            )}
          </div>
          <div className="text-left">
            <span className="block text-[10px] font-black text-[#0a3a2a] leading-tight">{t('export.pdfFile', 'Plik PDF')}</span>
            <span className="block text-[8px] font-bold text-gray-400 uppercase tracking-widest mt-0.5">{t('export.pdfScorecard', 'Karta Wyników')}</span>
          </div>
        </button>

        {/* PRAWY PRZYCISK: Surowe dane CSV */}
        <button 
          onClick={handleGenerateCSV}
          disabled={isExporting}
          className={`border p-2.5 rounded-xl flex items-center gap-2.5 shadow-sm active:scale-95 transition-all relative overflow-hidden disabled:opacity-50 ${
            isPremium 
              ? 'bg-[#0a3a2a] border-[#0a3a2a] hover:bg-[#0d4a36]' 
              : 'bg-white border-[#F2C94C]/40 hover:bg-yellow-50/30'
          }`}
        >
          {!isPremium && (
            <div className="absolute top-0 right-0 w-10 h-10 bg-gradient-to-bl from-[#F2C94C]/20 to-transparent rounded-bl-full pointer-events-none"></div>
          )}
          
          <div className={`${isPremium ? 'bg-white/10 text-emerald-400' : 'bg-[#F2C94C]/10 text-[#F2C94C]'} p-1.5 rounded-lg shrink-0 flex items-center justify-center`}>
            <span className="material-symbols-outlined text-lg">data_table</span>
          </div>
          
          <div className="text-left relative z-10">
            <span className={`block text-[10px] font-black leading-tight flex items-center gap-1 ${isPremium ? 'text-white' : 'text-[#0a3a2a]'}`}>
              {t('export.csvData', 'Dane CSV')}
              {!isPremium && <span className="material-symbols-outlined text-[10px] text-[#F2C94C] align-middle">diamond</span>}
            </span>
            <span className={`block text-[8px] font-bold uppercase tracking-widest mt-0.5 ${isPremium ? 'text-emerald-300' : 'text-[#B8860B]'}`}>
              {isPremium ? t('export.exportBtn', 'Eksportuj') : 'GROT-X PRO'}
            </span>
          </div>
        </button>
      </div>
    </div>
  );
}