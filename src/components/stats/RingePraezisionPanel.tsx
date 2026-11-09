import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getScaleColor, getWeekLabelKW } from '../../lib/statsChart';

// Panel "Ringe & Präzision": karty średnich (3 ostatnie / miesiąc) + słupki
// tygodniowe (wysokość = średnia ringów/strzałę w skali 0–10).
// Prezentacyjny — dane liczy rodzic. Używany w QuickStatsModal
// oraz w przeglądzie ProStats.
interface Props {
  /** [FELD] Najwyższa wartość strzały (teren: 6) — wysokość i kolor słupków. */
  scaleMax?: number;
  avgArrows3: number;
  avgPoints3: number;
  avgArrowsMonth: number;
  avgPointsMonth: number;
  weeklyArrows: number[];
  weeklyPoints: number[];
  // Średnie tygodniowe per dystans — gdy podane, nad wykresem pojawiają się
  // chipy dystansów (QuickStats). ProStats ich nie przekazuje (ma własną
  // sekcję Distanz-Analyse), więc tam wykres zostaje globalny.
  weeklyPointsByDistance?: Record<string, number[]>;
  // Średnie kart (Ø Letzte 3 / Schnitt Monat) per dystans — po kliknięciu chipa
  // karty u góry pokazują wartości z wybranego dystansu zamiast globalnych.
  avgByDistance?: Record<string, { avgArrows3: number; avgPoints3: number; avgArrowsMonth: number; avgPointsMonth: number }>;
  // Ø ringów na trening per tydzień — druga linia nad słupkiem (globalnie i per dystans)
  weeklySessionAvg?: number[];
  weeklySessionAvgByDistance?: Record<string, number[]>;
  // [QUICK STATS 2026-11-06] Ringe/Pfeil liczone przez rodzica także z krótszych
  // treningów; brak = jak dotąd z pełnych (Σ pkt / Σ strzał).
  perArrow3?: number;
  perArrowMonth?: number;
  locked?: boolean;      // rozmycie słupków + przycisk odblokowania (gdy nie premium)
  onUnlock?: () => void;
}

const ALL_DIST = 'ALL';

export default function RingePraezisionPanel({
  avgArrows3, avgPoints3, avgArrowsMonth, avgPointsMonth, weeklyPoints, weeklyPointsByDistance, avgByDistance,
  weeklySessionAvg, weeklySessionAvgByDistance, locked = false, onUnlock, perArrow3: perArrow3All, perArrowMonth: perArrowMonthAll,
  scaleMax = 10,
}: Props) {
  const { t, i18n } = useTranslation();
  const [selectedDist, setSelectedDist] = useState<string>(ALL_DIST);

  // Chipy tylko dla dystansów, które mają jakiekolwiek punktowane tygodnie
  // (bez TECH — trening techniczny nie ma ringów), posortowane rosnąco.
  const distances = useMemo(() => {
    if (!weeklyPointsByDistance) return [];
    return Object.entries(weeklyPointsByDistance)
      .filter(([dist, pts]) => dist && dist !== 'TECH' && pts.some(p => p > 0))
      .map(([dist]) => dist)
      .sort((a, b) => (parseInt(a) || 0) - (parseInt(b) || 0));
  }, [weeklyPointsByDistance]);

  // Gdy wybrany dystans zniknął z danych (np. odświeżenie), wróć do "Wszystkie"
  const activeDist = selectedDist !== ALL_DIST && !distances.includes(selectedDist) ? ALL_DIST : selectedDist;
  const shownPoints = activeDist === ALL_DIST
    ? weeklyPoints
    : (weeklyPointsByDistance?.[activeDist] || weeklyPoints);
  const shownSessionAvg = activeDist === ALL_DIST
    ? weeklySessionAvg
    : weeklySessionAvgByDistance?.[activeDist];
  const maxPoints = Math.max(...shownPoints, 0);

  // Karty średnich: po wybraniu dystansu pokazują jego wartości, "Alle" — globalne.
  const activeAvg = activeDist !== ALL_DIST ? avgByDistance?.[activeDist] : undefined;
  const cardPoints3 = activeAvg ? activeAvg.avgPoints3 : avgPoints3;
  const cardArrows3 = activeAvg ? activeAvg.avgArrows3 : avgArrows3;
  const cardPointsMonth = activeAvg ? activeAvg.avgPointsMonth : avgPointsMonth;
  const cardArrowsMonth = activeAvg ? activeAvg.avgArrowsMonth : avgArrowsMonth;
  // Średnia na strzał = Ø punktów na sesję / Ø strzał na sesję = Σpkt/Σstrzał (dokładna).
  const perArrow3 = !activeAvg && perArrow3All !== undefined ? perArrow3All : (cardArrows3 > 0 ? cardPoints3 / cardArrows3 : 0);
  const perArrowMonth = !activeAvg && perArrowMonthAll !== undefined ? perArrowMonthAll : (cardArrowsMonth > 0 ? cardPointsMonth / cardArrowsMonth : 0);
  const fmt1 = (v: number) => v.toLocaleString(i18n.language, { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  return (
    <div className="space-y-4">
      {/* KARTY: na pierwszym miejscu Ringe/Pfeil (także z krótszych treningów),
          suma na trening jako dopisek — ta tylko z pełnych (user 2026-11-06). */}
      <div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm grid grid-cols-2 divide-x divide-gray-100">
          {([[perArrow3, cardPoints3, t('home.quickStats.perArrowLast3', { defaultValue: 'Ringe/Pfeil · letzte 3' })], [perArrowMonth, cardPointsMonth, t('home.quickStats.perArrowMonth', { defaultValue: 'Ringe/Pfeil · Monat' })]] as const).map(([pa, sum, label], i) => (
            <div key={i} className="px-3 py-2.5 min-w-0">
              <p className="text-[20px] font-black text-[#0a3a2a] leading-none">{pa ? fmt1(pa) : '—'}</p>
              <p className="text-[11px] font-bold text-gray-500 mt-1 truncate">{label}</p>
              <p className="text-[11px] font-bold text-gray-400 truncate">{t('home.quickStats.sumLabel', { defaultValue: 'Summe' })}: {sum || '—'}</p>
            </div>
          ))}
        </div>
        <p className="text-[11px] font-bold text-gray-400 mt-1.5 px-1">{t('home.quickStats.sumNote', { defaultValue: 'Summen nur aus vollen Trainings (12 Passen).' })}</p>
      </div>

      {/* SŁUPKI TYGODNIOWE: wysokość = średnia ringów/strzałę (skala 0–10),
          nad słupkiem wartość średniej. FREE: tylko wykres zablurowany (80%),
          nagłówek i chipy dystansów zostają widoczne i klikalne — dzięki temu
          widać średnie per dystans w kartach nawet bez PRO. */}
      <div className="relative">
        <h3 className="text-[12px] font-bold text-gray-500 mb-1.5 px-1">{t('stats.pro.weeklyPointsShort', 'Średnia ringów / tydzień (12 tyg.)')}</h3>
        {distances.length > 1 && (
          <div className="flex gap-2 overflow-x-auto hide-scrollbar pb-1 mb-2">
            {[ALL_DIST, ...distances].map(dist => (
              <button key={dist} onClick={() => setSelectedDist(dist)}
                className={`px-3 py-1 rounded-full text-[12px] font-bold transition-all shrink-0 border ${
                  activeDist === dist
                    ? 'bg-[#0a3a2a] text-white border-[#0a3a2a]'
                    : 'bg-white text-gray-500 border-gray-200'
                }`}>
                {dist === ALL_DIST ? t('home.quickStats.allDistShort', { defaultValue: 'Wszystkie' }) : dist}
              </button>
            ))}
          </div>
        )}
        {/* Nakładka odblokowania jest zagnieżdżona TYLKO w obrębie wykresu — inaczej
            jej backdrop-blur rozciągnąłby się na nagłówek i chipy powyżej. */}
        <div className="relative">
          <div className={`relative transition-all duration-500 ${locked ? 'blur-lg opacity-20 pointer-events-none select-none' : ''}`}>
            <div className="overflow-x-auto hide-scrollbar bg-white rounded-2xl px-3 pb-2 pt-10 border border-gray-100 shadow-sm">
              <div className="flex items-end justify-between gap-1 w-full h-28 relative">
                {shownPoints.map((pts, i) => {
                  const isBest = pts > 0 && pts === maxPoints;
                  const sessAvg = shownSessionAvg?.[i] || 0;
                  return (
                    <div key={i} className="flex flex-col items-center justify-end gap-1 relative flex-1 h-full">
                      <div className="w-full relative flex items-end justify-center h-full">
                        {pts > 0 && (
                          <span className="absolute -top-8 flex flex-col items-center leading-tight">
                            <span className={`text-[8px] font-black transition-colors ${isBest ? 'text-[#0a3a2a]' : 'text-emerald-600'}`}>{fmt1(pts)}</span>
                            {sessAvg > 0 && <span className="text-[8px] font-bold text-gray-400">{sessAvg}</span>}
                          </span>
                        )}
                        <div className={`w-full rounded-t-sm max-w-[16px] mx-auto transition-all duration-1000 ${pts > 0 ? '' : 'bg-gray-200'}`} style={{ height: pts > 0 ? `${(pts / scaleMax) * 100}%` : '4px', backgroundColor: pts > 0 ? getScaleColor(pts, scaleMax) : undefined }}></div>
                      </div>
                      <span className="text-[6px] text-gray-300 font-bold mt-1 shrink-0">{getWeekLabelKW(i)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          {locked && onUnlock && (
            <div className="absolute inset-0 flex flex-col items-center justify-center z-30 bg-[#fcfdfe]/10 backdrop-blur-[2px]">
              <button onClick={onUnlock} className="bg-[#0a3a2a] text-[#fed33e] px-8 py-3 rounded-full font-black uppercase text-[10px] tracking-widest shadow-2xl active:scale-95 transition-all flex items-center gap-2 border border-emerald-900/50">
                <span className="material-symbols-outlined text-[14px]">diamond</span>
                <span>{t('home.quickStats.buyPro', { defaultValue: 'GROT-X PRO' })}</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
