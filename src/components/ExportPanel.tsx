import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { useTranslation } from 'react-i18next'; 

interface ExportPanelProps {
  session: any; 
  isPremium: boolean;
  onTriggerPaywall: () => void;
}

export default function ExportPanel({ session, isPremium, onTriggerPaywall }: ExportPanelProps) {
  const { t, i18n } = useTranslation();
  const [isExporting, setIsExporting] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastIsError, setToastIsError] = useState(false);

  const showToast = (msg: string, isError = false) => {
    setToastIsError(isError);
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Wczytywanie polskiej czcionki Unicode do PDF
  const loadCustomFont = async (doc: jsPDF) => {
    try {
      const response = await fetch('https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.7/fonts/Roboto/Roboto-Regular.ttf');
      const buffer = await response.arrayBuffer();
      
      let binary = '';
      const bytes = new Uint8Array(buffer);
      const len = bytes.byteLength;
      for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const base64 = window.btoa(binary);

      doc.addFileToVFS('Roboto-Regular.ttf', base64);
      doc.addFont('Roboto-Regular.ttf', 'Roboto', 'normal', 'Identity-H');
      
      // Ładujemy też pogrubioną czcionkę dla ładnych nagłówków
      const responseBold = await fetch('https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.7/fonts/Roboto/Roboto-Medium.ttf');
      const bufferBold = await responseBold.arrayBuffer();
      let binaryBold = '';
      const bytesBold = new Uint8Array(bufferBold);
      for (let i = 0; i < bytesBold.byteLength; i++) binaryBold += String.fromCharCode(bytesBold[i]);
      doc.addFileToVFS('Roboto-Medium.ttf', window.btoa(binaryBold));
      doc.addFont('Roboto-Medium.ttf', 'Roboto', 'bold', 'Identity-H');
      
      return true;
    } catch (error) {
      console.warn("Nie udało się załadować czcionki.", error);
      return false;
    }
  };

  // Kalkulator statystyk dla danej rundy/całości
  const calcStats = (scoresSlice: any[]) => {
    let score = 0, arrows = 0, x = 0, t10 = 0, t9 = 0;
    scoresSlice.forEach(end => {
      (end.arrows || []).forEach((v: string) => {
        arrows++;
        if (v === 'X') { x++; t10++; score += 10; }
        else if (v === '10') { t10++; score += 10; }
        else if (v === '9') { t9++; score += 9; }
        else if (v !== 'M' && v) { score += parseInt(v) || 0; }
      });
    });
    return { 
      score, arrows, x, t10, t9, 
      avg: arrows > 0 ? (score / arrows).toFixed(2) : "0.00" 
    };
  };

  // Budowanie danych tabeli dla jednej rundy (do 6 serii)
  const generateTableData = (roundScores: any[], startIndex: number) => {
    let runningTotal = 0;
    const data: any[] = [];
    const safeVal = (v: string) => v === 'X' || v === '10' ? 10 : (v === 'M' || !v ? 0 : parseInt(v));

    roundScores.forEach((end, i) => {
      const arrs = end.arrows || [];
      const a1 = arrs[0] || ''; const a2 = arrs[1] || ''; const a3 = arrs[2] || '';
      const a4 = arrs[3] || ''; const a5 = arrs[4] || ''; const a6 = arrs[5] || '';
      
      const sum1 = safeVal(a1) + safeVal(a2) + safeVal(a3);
      const sum2 = safeVal(a4) + safeVal(a5) + safeVal(a6);
      const endSum = end.total_sum || (sum1 + sum2);
      runningTotal += endSum;
      const roundIndex = startIndex + i;

      // Zmniejszony cellPadding i fontSize dla tabeli
      data.push([
        { content: String(roundIndex * 6 + 3), styles: { halign: 'center', textColor: [150, 150, 150] } },
        { content: a1, styles: { halign: 'center' } }, { content: a2, styles: { halign: 'center' } }, { content: a3, styles: { halign: 'center' } },
        { content: sum1 > 0 ? sum1.toString() : '', styles: { halign: 'center', fontStyle: 'bold' } },
        { content: endSum.toString(), rowSpan: 2, styles: { valign: 'middle', halign: 'center', fontStyle: 'bold', fontSize: 8 } },
        { content: runningTotal.toString(), rowSpan: 2, styles: { valign: 'middle', halign: 'center', fontStyle: 'bold', fontSize: 8 } }
      ]);
      
      data.push([
        { content: String(roundIndex * 6 + 6), styles: { halign: 'center', textColor: [150, 150, 150] } },
        { content: a4, styles: { halign: 'center' } }, { content: a5, styles: { halign: 'center' } }, { content: a6, styles: { halign: 'center' } },
        { content: sum2 > 0 ? sum2.toString() : '', styles: { halign: 'center', fontStyle: 'bold' } }
      ]);
    });
    return data;
  };

  // --- RYSOWANIE ELEMENTÓW PDF ---

  const drawRoundTable = (doc: any, roundScores: any[], startIndex: number, title: string, startY: number, headColor: number[]) => {
    const data = generateTableData(roundScores, startIndex);
    const textColor = headColor[0] > 200 ? [0,0,0] : [255,255,255]; 
    
    autoTable(doc, {
      startY: startY,
      theme: 'grid',
      // Pomniejszono szerokość tabeli o 20% (130 * 0.8 = 104)
      tableWidth: 104, 
      margin: { left: 40 },
      // Zmniejszono czcionkę i padding
      styles: { font: 'Roboto', cellPadding: 1.2, fontSize: 7, lineColor: [200, 200, 200], lineWidth: 0.1 }, 
      head: [
        [{ content: title, colSpan: 7, styles: { halign: 'center', fillColor: [240, 240, 240], textColor: [10, 58, 42], fontStyle: 'bold' } }],
        [
          { content: t('export.pdfArrows', 'Strzały'), colSpan: 4, styles: { halign: 'center', fillColor: headColor, textColor: textColor } }, 
          { content: t('export.pdfSum', 'Suma'), colSpan: 2, styles: { halign: 'center', fillColor: headColor, textColor: textColor } }, 
          { content: t('export.pdfTotal', 'Wynik'), rowSpan: 2, styles: { valign: 'middle', halign: 'center', fillColor: headColor, textColor: textColor } } 
        ],
        [
          { content: 'Nr.', styles: { halign: 'center', fillColor: headColor, textColor: textColor } },
          { content: '1', styles: { halign: 'center', fillColor: headColor, textColor: textColor } },
          { content: '2', styles: { halign: 'center', fillColor: headColor, textColor: textColor } },
          { content: '3', styles: { halign: 'center', fillColor: headColor, textColor: textColor } },
          { content: '4', styles: { halign: 'center', fillColor: headColor, textColor: textColor } }, 
          { content: '5', styles: { halign: 'center', fillColor: headColor, textColor: textColor } }  
        ]
      ],
      body: data
    });
    return (doc as any).lastAutoTable.finalY;
  };

  const drawRoundSummary = (doc: any, y: number, stats: any) => {
    doc.setDrawColor(220, 220, 220);
    doc.setFillColor(252, 253, 254);
    doc.roundedRect(40, y + 2, 104, 13, 2, 2, 'FD'); 

    doc.setFillColor(235, 247, 240);
    doc.setDrawColor(200, 230, 210);
    doc.roundedRect(122, y + 3.5, 22, 9.5, 2, 2, 'FD'); 

    doc.setFont('Roboto', 'bold');
    doc.setFontSize(6); 
    doc.setTextColor(150, 150, 150);
    doc.text('X/10/9', 54, y + 7, { align: 'center' }); 
    doc.text(t('export.pdfAverage', 'Średnia'), 78, y + 7, { align: 'center' }); 
    doc.text(t('export.pdfArrowsCount', 'Strzały'), 102, y + 7, { align: 'center' }); 
    
    doc.setTextColor(10, 58, 42);
    doc.text(t('export.pdfResult', 'Wynik'), 130, y + 7, { align: 'center' }); 

    doc.setFontSize(9); 
    doc.setTextColor(0, 0, 0);
    doc.text(`${stats.x}/${stats.t10}/${stats.t9}`, 54, y + 12, { align: 'center' });
    doc.text(stats.avg.toString(), 78, y + 12, { align: 'center' });
    doc.text(stats.arrows.toString(), 102, y + 12, { align: 'center' });

    doc.setFontSize(10); 
    doc.setTextColor(10, 58, 42);
    doc.text(stats.score.toString(), 130, y + 12, { align: 'center' });

    return y + 16; 
  };

  const drawGrandTotal = (doc: any, y: number, stats: any) => {
    doc.setFillColor(242, 201, 76);
    // Skorygowana wysokość na 22, aby pomieścić dodane X/10/9
    doc.roundedRect(40, y + 4, 104, 22, 3, 3, 'F'); 

    doc.setFont('Roboto', 'bold');
    doc.setFontSize(10); 
    doc.setTextColor(10, 58, 42);
    doc.text(t('export.pdfGrandTotal', 'Suma Całkowita'), 45, y + 11); 

    doc.setFontSize(6); 
    doc.setTextColor(120, 100, 20);
    doc.text('X/10/9', 45, y + 18); 
    doc.text(t('export.pdfAverage', 'Średnia'), 75, y + 18); 
    doc.text(t('export.pdfArrowsCount', 'Strzały'), 100, y + 18); 

    doc.setFontSize(9); 
    doc.setTextColor(10, 58, 42);
    doc.text(`${stats.x}/${stats.t10}/${stats.t9}`, 45, y + 23);
    doc.text(stats.avg.toString(), 75, y + 23);
    doc.text(stats.arrows.toString(), 100, y + 23);

    doc.setFontSize(24); 
    // Wynik przesunięty idealnie do prawej strony
    doc.text(stats.score.toString(), 140, y + 21, { align: 'right' }); 

    return y + 30; 
  };

  const drawNotesSpace = (doc: any, y: number) => {
    doc.setDrawColor(200);
    doc.line(40, y, 144, y); 

    doc.setFontSize(10); 
    doc.setFont('Roboto', 'bold');
    doc.setTextColor(10, 58, 42);
    doc.text(t('export.pdfCoachNotes', 'Notatki z treningu (Twoje uwagi)'), 40, y + 8); 
    
    // Rysujemy skondensowane linie pod notatki
    doc.setDrawColor(230);
    for (let i = 0; i < 4; i++) {
        doc.line(40, y + 16 + (i * 8), 144, y + 16 + (i * 8));
    }

    return y + 50;
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
      const headColor = [10, 58, 42]; 

      // Nagłówek Dokumentu
      doc.setFontSize(18); 
      doc.setFont('Roboto', 'bold');
      doc.setTextColor(10, 58, 42); 
      doc.text('GROT-X', 40, 22); 
      
      doc.setFontSize(10); 
      doc.setFont('Roboto', 'normal');
      doc.setTextColor(100);
      doc.text(t('export.pdfScorecard', 'Karta Wyników'), 40, 30); 
      doc.text(`${t('export.pdfDate', 'Data')}: ${date}`, 40, 36); 

      let currentY = 40; 

      // === RUNDA 1 ===
      const r1Scores = session.ends.slice(0, 6);
      if (r1Scores.length > 0) {
        const r1Stats = calcStats(r1Scores);
        currentY = drawRoundTable(doc, r1Scores, 0, `${t('export.pdfRound', 'Runda')} 1`, currentY, headColor); 
        currentY = drawRoundSummary(doc, currentY, r1Stats); 
      }

      // === RUNDA 2 ===
      const r2Scores = session.ends.slice(6, 12);
      if (r2Scores.length > 0) {
        const r2Stats = calcStats(r2Scores);
        currentY = drawRoundTable(doc, r2Scores, 6, `${t('export.pdfRound', 'Runda')} 2`, currentY + 4, headColor); 
        currentY = drawRoundSummary(doc, currentY, r2Stats);
      }

      // === SUMA CAŁKOWITA ===
      const totalStats = calcStats(session.ends);
      currentY = drawGrandTotal(doc, currentY, totalStats);

      // === DODANIE MIEJSCA NA NOTATKI NA DOLE ===
      const notesStart = currentY + 6;
      drawNotesSpace(doc, notesStart);

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
    <div className="mx-2 mt-4 space-y-2 pb-2 relative">
      {toastMessage && createPortal(
        <div className={`fixed top-14 left-1/2 -translate-x-1/2 z-[500000] text-white px-6 py-3.5 rounded-full font-black text-[10px] uppercase tracking-widest shadow-2xl animate-fade-in-up flex items-center gap-2 whitespace-nowrap ${toastIsError ? 'bg-red-700' : 'bg-[#0a3a2a]'}`}>
          <span className={`material-symbols-outlined text-sm ${toastIsError ? 'text-red-200' : 'text-emerald-400'}`}>{toastIsError ? 'error' : 'check_circle'}</span>
          {toastMessage}
        </div>, document.body
      )}
      <div className="flex items-center gap-1.5 px-1 mb-1">
        <span className="material-symbols-outlined text-[14px] text-gray-400">ios_share</span>
        <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">{t('export.title', 'Eksport Danych')}</span>
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
            <span className="block text-[10px] font-black text-[#0a3a2a] leading-tight">Plik PDF</span>
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
              Dane CSV
              {!isPremium && <span className="material-symbols-outlined text-[10px] text-[#F2C94C] align-middle">diamond</span>}
            </span>
            <span className={`block text-[8px] font-bold uppercase tracking-widest mt-0.5 ${isPremium ? 'text-emerald-300' : 'text-[#B8860B]'}`}>
              {isPremium ? 'Eksportuj' : 'GROT-X PRO'}
            </span>
          </div>
        </button>
      </div>
    </div>
  );
}