import React, { useState, useEffect, useRef } from 'react';
import { StandardTarget } from './StandardTarget';
import { SpotTarget } from './SpotTarget';
import { resolveTargetFace, isSpotFace, isVerticalSpotFace } from '../../config/targetFaces';
import { calculateSpotScore, scoreSingleFace, LINE_TOUCH } from '../../utils/targetScoring';
import { arrowColorAt } from '../../config/arrowColors';
import { smoothAim, Sample, WINDOW_MS } from '../../utils/aimSmoothing';
import { useTranslation } from 'react-i18next';

const getArrowStyles = (val: string) => {
  if (['X', '10', '9'].includes(val)) return 'bg-[#F2C94C] text-[#333] border-none shadow-sm';
  if (['8', '7'].includes(val)) return 'bg-[#EB5757] text-white border-none shadow-sm';
  if (['6', '5'].includes(val)) return 'bg-[#2F80ED] text-white border-none shadow-sm';
  if (['4', '3'].includes(val)) return 'bg-[#333333] text-white border-none shadow-sm';
  if (['2', '1'].includes(val)) return 'bg-white border border-gray-200 text-[#333] shadow-sm';
  if (val === 'M') return 'bg-indigo-900 text-white border-none shadow-sm';
  return 'bg-[#F9F9F9] border border-gray-100 text-transparent';
};

// SVG-native odpowiednik getArrowStyles — używany dla score chipa przyczepionego do krzyżyka w SVG.
const getScoreColors = (val: string): { bg: string; text: string; stroke: string } => {
  if (['X', '10', '9'].includes(val)) return { bg: '#F2C94C', text: '#333', stroke: '#fff' };
  if (['8', '7'].includes(val)) return { bg: '#EB5757', text: '#fff', stroke: '#fff' };
  if (['6', '5'].includes(val)) return { bg: '#2F80ED', text: '#fff', stroke: '#fff' };
  if (['4', '3'].includes(val)) return { bg: '#333', text: '#fff', stroke: '#fff' };
  if (['2', '1'].includes(val)) return { bg: '#fff', text: '#333', stroke: '#e5e7eb' };
  if (val === 'M') return { bg: '#312e81', text: '#fff', stroke: '#fff' };
  return { bg: '#F9F9F9', text: 'transparent', stroke: '#f3f4f6' };
};

// `embed` — opcjonalne nadpisania dla osadzenia w innym przepływie niż
// ScoringView. Bez tego propu komponent zachowuje się dokładnie jak wcześniej.
//   autoExit  false = nie wychodź sam po 6 strzałach (seria może mieć 3,
//                     a w treningu technicznym wyjście robi własny przycisk)
//   svgStyle  nadpisania rozmiaru SVG. UWAGA: maxHeight musi być bezwzględne
//             (vh/px). Procenty liczą się względem rodzica `flex-1`, który ma
//             min-height:auto, więc rozciąga się do naturalnej wysokości SVG
//             i ogranicznik sam się unieważnia.
//   padClass  odstęp pod tarczą w trybie pełnoekranowym
//   headerClass  odstępy paska ze slotami (w poziomie 88px to za dużo)
//   title  podpis pod paskiem ze slotami (np. "Pfeile eintragen") — biale
//          tlo pod nim jest inaczej puste, wywolujacy ekran nie ma zadnego
//          tytulu wlasnego
//   slots  liczba pol w pasku ze strzalami (domyslnie 6) — passa moze miec
//          inna liczbe strzal niz standardowa serie
//   arrowColors  [KOLORY STRZAŁ] kropki w kolorach strzał + podpowiedź, która
//                strzała jest teraz do wpisania (config/arrowColors.ts)
export default function TargetInput({ onShot, isFullscreen, onToggleFullscreen, currentArrows, currentCoords, onUndo, targetType, embed, arrowColors }: any) {
  const { t } = useTranslation();
  const svgRef = useRef<SVGSVGElement>(null);
  const [isAiming, setIsAiming] = useState(false);
  const [aimPos, setAimPos] = useState<{x: number, y: number} | null>(null);
  const [touchPos, setTouchPos] = useState<{x: number, y: number} | null>(null);
  const [currentAimScore, setCurrentAimScore] = useState<string | null>(null);
  const aimRef = useRef<{x: number, y: number} | null>(null);
  const lastScoreRef = useRef<string | null>(null);
  // [STABILIZACJA] Próbki dotyku z ostatnich ~100 ms + dosunięcie, gdy palec stoi.
  const samplesRef = useRef<Sample[]>([]);
  const settleRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [aimOffset, setAimOffset] = useState(() => parseInt(localStorage.getItem('grotx-aim-offset') || '55'));
  // [RĘKA] Gdzie krzyżyk stoi względem palca: R = praworęczny (krzyżyk w lewo
  // do góry — kciuk z prawej nie zasłania), L = leworęczny, C = prosto w górę.
  const [hand, setHand] = useState<'L' | 'C' | 'R'>(() => {
    try { const v = localStorage.getItem('grotx-aim-hand'); return v === 'L' || v === 'R' ? v : 'C'; } catch { return 'C'; }
  });
  const [showOffsetSlider, setShowOffsetSlider] = useState(false);
  // [KATALOG TARCZ] Wszystko o tarczy pochodzi z config/targetFaces — wcześniej
  // były to porównania stringów, przez które 6-Ring nigdy się nie uruchamiał.
  const face = resolveTargetFace(targetType);
  const is3Spot = isSpotFace(targetType);
  const isVertical = isVerticalSpotFace(targetType);
  // Tarcze bez zewnętrznych pierścieni (6-Ring) rysują się mniejsze niż pełne
  // 300 jednostek, więc dostają ciaśniejszy viewBox.
  const isCompactFace = face.rings.length > 0 && face.rings[0].r < 150;
  const isTarget2 = currentArrows.length >= 3;
  const maxShots = embed?.slots ?? 6;

  // [PUNKTACJA] Zasada łucznicza: wystarczy musnąć linię, żeby dostać wyższą
  // wartość. Linia ma na rysunku 0,5 jednostki grubości, a czerwona kropka
  // krzyżyka w lupie promień 0,7 — gdy kropka dotyka linii, liczy się wyżej.
  // Promień całej strzały (fd0c21b, 2,25 j.) był za hojny — dawał 9 przy
  // kropce wyraźnie jeszcze w 8 (user 2026-11-03).

  // [WIĘKSZA TARCZA] Kadr na pełnym ekranie. 3-Spot pokazuje tylko kolumnę,
  // w którą teraz strzelamy — druga i tak jest zablokowana, a pokazanie obu
  // zmniejszało spot do ~12 px na pierścień. Tarcza 6-Ring nie ma zewnętrznych
  // pierścieni, więc kadr ciasno wokół niej. Poza pełnym ekranem bez zmian
  // (tam widać obie kolumny i całą serię).
  const spotCx = isVertical ? 150 : isTarget2 ? 225 : 75;
  const viewBox = is3Spot
    ? (isFullscreen ? `${spotCx - 85} -25 170 450` : "-20 -40 340 480")
    : isCompactFace
      ? (isFullscreen ? "30 0 240 300" : "-20 -30 340 360")
      : (isFullscreen ? "-8 -45 316 380" : "-20 0 340 300");
  const viewCx = (() => { const [x, , w] = viewBox.split(" ").map(Number); return x + w / 2; })();
  // [KOLORY STRZAŁ] Kolor kropki = kolor strzały z tego miejsca w serii.
  // Ciemna obwódka zawsze, bo biała kropka na bieli i żółta na złocie znikają.
  const dotColor = (i: number) => (arrowColors && arrowColorAt(i)) || { hex: '#ffffff', text: '#000000' };
  const nextArrow = arrowColors ? arrowColorAt(currentCoords.length) : null;
  const endSum = currentArrows.reduce((s: number, v: string) => s + (v === 'X' ? 10 : v === 'M' ? 0 : parseInt(v) || 0), 0);

  useEffect(() => {
    if (isFullscreen) {
      document.body.style.overflow = 'hidden';
      document.body.style.position = 'fixed';
      document.body.style.width = '100%';
    } else {
      document.body.style.overflow = 'auto';
      document.body.style.position = 'static';
    }
    return () => {
      document.body.style.overflow = 'auto';
      document.body.style.position = 'static';
    };
  }, [isFullscreen]);

  useEffect(() => {
    if (embed?.autoExit === false) return;
    if (currentArrows.length === 6 && isFullscreen) {
      const timer = setTimeout(() => {
        onToggleFullscreen();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [currentArrows.length, isFullscreen, onToggleFullscreen, embed?.autoExit]);

  // [WIBRACJA] Krótkie „tyk” przy każdej zmianie pierścienia — granicę czuć
  // w palcu. Android; iPhone (Safari) tego nie obsługuje i po prostu milczy.
  const buzz = (ms: number) => { try { navigator.vibrate?.(ms); } catch { /* brak wibracji */ } };

  // [WIĘKSZA TARCZA] Przesunięcie celownika jest w pikselach ekranu, nie
  // w jednostkach tarczy — inaczej po powiększeniu tarczy palec musiałby
  // stać dalej. Na pełnej tarczy 1 jednostka ≈ 1 px, więc zapisane wartości
  // zostają mniej więcej tym, czym były.
  const pxPerUnit = () => svgRef.current?.getScreenCTM()?.a || 1;
  // [RĘKA] Odchylenie o ~20° od pionu w stronę przeciwną do kciuka.
  const aimFrom = (c: { x: number; y: number }) => {
    const off = aimOffset / pxPerUnit();
    const dx = hand === 'R' ? -0.34 : hand === 'L' ? 0.34 : 0;
    const dy = hand === 'C' ? 1 : 0.94;
    return { x: c.x + dx * off, y: c.y - dy * off };
  };

  const getSvgCoords = (clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return null;
    const pt = svg.createSVGPoint(); pt.x = clientX; pt.y = clientY;
    return pt.matrixTransform(svg.getScreenCTM()?.inverse());
  };

  const calculateScore = (x: number, y: number) => {
    if (is3Spot) {
      return calculateSpotScore(x, y, isVertical, isTarget2, LINE_TOUCH);
    }
    return scoreSingleFace(face, x, y, LINE_TOUCH);
  };

  const aimAt = (c: { x: number; y: number }, fresh: boolean) => {
    setTouchPos({ x: c.x, y: c.y });
    const a = aimFrom(c);
    aimRef.current = a;
    setAimPos(a);
    const val = calculateScore(a.x, a.y).val;
    if (!fresh && lastScoreRef.current !== null && val !== lastScoreRef.current) buzz(8);
    lastScoreRef.current = val;
    setCurrentAimScore(val);
  };

  const clearSettle = () => { if (settleRef.current) { clearTimeout(settleRef.current); settleRef.current = null; } };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (currentCoords.length >= maxShots) return;
    (e.target as Element).setPointerCapture(e.pointerId);
    const c = getSvgCoords(e.clientX, e.clientY);
    if (c) {
      setIsAiming(true);
      lastScoreRef.current = null;
      samplesRef.current = [{ x: e.clientX, y: e.clientY, t: e.timeStamp }];
      aimAt(c, true);
    }
  };

  const smoothTo = (s: Sample) => {
    const [kept, p] = smoothAim(samplesRef.current, s);
    samplesRef.current = kept;
    const c = getSvgCoords(p.x, p.y);
    if (c) aimAt(c, false);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isAiming) return;
    const s = { x: e.clientX, y: e.clientY, t: e.timeStamp };
    smoothTo(s);
    // Palec stanął (iPhone wtedy nie wysyła ruchów) — po oknie krzyżyk dochodzi do palca.
    clearSettle();
    settleRef.current = setTimeout(() => smoothTo({ ...s, t: s.t + WINDOW_MS }), WINDOW_MS);
  };

  const handlePointerUp = () => {
    clearSettle();
    samplesRef.current = [];
    const a = aimRef.current;
    if (isAiming && a) {
      const { val, sId } = calculateScore(a.x, a.y);
      onShot(val, a.x, a.y, sId);
    }
    aimRef.current = null; lastScoreRef.current = null;
    setIsAiming(false); setAimPos(null); setTouchPos(null); setCurrentAimScore(null);
  };

  const chooseHand = (h: 'L' | 'C' | 'R') => {
    setHand(h);
    try { localStorage.setItem('grotx-aim-hand', h); } catch { /* prywatne okno */ }
  };

  // [LUPA] Nad tarczą, w górnym rogu PO DRUGIEJ stronie niż krzyżyk — wzrok
  // nie skacze w róg, w którym jest palec. Wcześniej siedziała w nagłówku
  // i zasłaniała pierwsze pole wyniku (user 2026-11-03).
  const loupeRight = !!aimPos && aimPos.x < viewCx;

  return (
    <div className={`flex flex-col items-center ${isFullscreen ? 'fixed inset-0 z-[99999] bg-[#fcfdfe] pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] justify-start touch-none' : 'w-full h-full relative justify-center overflow-hidden'}`}>

      {/* NAGŁÓWEK. Pełny ekran: LEWO wyniki serii + suma, PRAWO cofnij i zamknij.
          Mały widok: tylko przyszła strzała i powiększenie, po prawej. */}
      <div className={`w-full flex justify-between items-center z-20 pointer-events-none shrink-0 ${isFullscreen ? `relative ${embed?.headerClass ?? 'px-4 pt-5 mb-3'}` : 'px-2 pt-2 absolute top-0'}`}>
        {isFullscreen ? (
          <>
            <div className="flex items-center gap-2 pointer-events-auto min-w-0">
              <div className="flex gap-0.5 bg-white p-1 rounded-xl shadow-sm border border-gray-100">
                {/* embed.slots — liczba pol ma odpowiadac wybranej liczbie
                    strzal (np. 4), nie zawsze 6. Domyslnie 6 dla wywolan bez
                    embed (ScoringView), zeby nic tam sie nie zmienilo. */}
                {Array.from({ length: maxShots }, (_, i) => i).map(i => <div key={i} className={`relative w-7 h-7 flex items-center justify-center text-[11px] font-black rounded-md ${getArrowStyles(currentArrows[i] || '')}`}>{currentArrows[i] || ''}{arrowColors && <ArrowColorBar index={i} isNext={i === currentArrows.length} />}</div>)}
              </div>
              {currentArrows.length > 0 && (
                <span className="text-[#0a3a2a] font-black text-lg tabular-nums leading-none" aria-label={t('targetInput.endSum')}>
                  <span className="text-[10px] text-gray-400 mr-0.5">Σ</span>{endSum}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 pointer-events-auto shrink-0">
              <button onClick={onUndo} aria-label={t('targetInput.undo')} className="w-10 h-10 bg-white border border-red-100 shadow-md rounded-full flex items-center justify-center active:scale-90 transition-all">
                <span className="material-symbols-outlined text-red-500 font-bold text-xl">undo</span>
              </button>
              <button onClick={onToggleFullscreen} aria-label={t('targetInput.close')} className="w-10 h-10 bg-white border border-gray-200 shadow-md rounded-full flex items-center justify-center active:scale-90 transition-all">
                <span className="material-symbols-outlined text-gray-500 font-bold text-xl">close</span>
              </button>
            </div>
          </>
        ) : (
          <div className="flex items-center gap-1.5 pointer-events-auto ml-auto">
          {nextArrow && <NextArrowChip index={currentCoords.length} />}
          <button onClick={onToggleFullscreen} className="p-2 bg-white/90 border border-gray-200 rounded-full shadow-md text-gray-400 active:scale-90 pointer-events-auto transition-all"><span className="material-symbols-outlined text-lg">fullscreen</span></button>
          </div>
        )}
      </div>

      {isFullscreen && embed?.title && (
        <p className="w-full text-center text-[#0a3a2a]/55 text-[11px] font-black uppercase tracking-widest shrink-0 -mt-1 mb-2 z-20 pointer-events-none">
          {embed.title}
        </p>
      )}

      {/* LEWY DÓŁ: celownik (offset) + strona ręki */}
      <div className={`absolute z-[100] flex flex-col items-center justify-end transition-all duration-300 origin-bottom ${isFullscreen ? 'left-6 bottom-8' : 'left-2 bottom-2'}`}>
        {showOffsetSlider ? (
          <div className="relative h-44 bg-white/95 backdrop-blur-md rounded-[22px] shadow-xl border border-gray-100 flex items-stretch gap-1 px-1.5 pb-2 pt-3 pointer-events-auto animate-fade-in-up">
            {/* [RĘKA] Strzałka pokazuje, gdzie krzyżyk stanie nad palcem. */}
            <div className="flex flex-col items-center justify-center gap-1.5">
              {/* Strzałki rysowane — ikony north_west/east nie ma w okrojonym foncie (npm run icons:update). */}
              {([['R', -45], ['C', 0], ['L', 45]] as const).map(([h, deg]) => (
                <button
                  key={h}
                  onClick={(e) => { e.stopPropagation(); chooseHand(h); }}
                  aria-pressed={hand === h}
                  aria-label={t(`targetInput.hand.${h}`)}
                  title={t(`targetInput.hand.${h}`)}
                  className={`w-8 h-8 rounded-full flex flex-col items-center justify-center transition-colors ${hand === h ? 'bg-[#0a3a2a] text-white' : 'text-gray-400 active:bg-gray-100'}`}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: `rotate(${deg}deg)` }}>
                    <path d="M12 20 V4 M5 11 L12 4 L19 11" />
                  </svg>
                  <span className="text-[6px] font-black leading-none">{h === 'C' ? '' : h}</span>
                </button>
              ))}
            </div>

            <div className="w-8 flex flex-col items-center">
              <span className="text-[6px] font-black text-gray-400 uppercase tracking-widest mb-1">Offset</span>
              <div className="relative flex-1 w-full flex justify-center mb-1">
                <input
                  type="range" min="30" max="120"
                  value={aimOffset}
                  onChange={(e) => { const v = parseInt(e.target.value); setAimOffset(v); localStorage.setItem('grotx-aim-offset', v.toString()); }}
                  className="absolute inset-0 w-full h-full opacity-0 z-20 cursor-pointer"
                  style={{ writingMode: 'vertical-lr', direction: 'rtl' }}
                />
                {/* Przerywana linia - szyna */}
                <div className="absolute top-1 bottom-1 w-0 border-l-[2px] border-dotted border-gray-300"></div>
                {/* Celownik jako fizyczny uchwyt suwaka */}
                <div
                  className="absolute left-1/2 -translate-x-1/2 w-8 h-8 bg-white rounded-full shadow-md border border-gray-100 flex items-center justify-center text-emerald-600 z-10 pointer-events-none transition-transform duration-75"
                  style={{ bottom: `calc(${((aimOffset - 30) / 90) * 100}% - 16px)` }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <circle cx="12" cy="12" r="8" />
                    <line x1="12" y1="2" x2="12" y2="6" />
                    <line x1="12" y1="18" x2="12" y2="22" />
                    <line x1="2" y1="12" x2="6" y2="12" />
                    <line x1="18" y1="12" x2="22" y2="12" />
                    <circle cx="12" cy="12" r="1.5" fill="currentColor" />
                  </svg>
                </div>
              </div>
              <button onClick={(e) => { e.stopPropagation(); setShowOffsetSlider(false); }} className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 active:bg-gray-100 z-30">
                <span className="material-symbols-outlined text-lg">keyboard_arrow_down</span>
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={(e) => { e.stopPropagation(); setShowOffsetSlider(true); }}
            aria-label={t('targetInput.offset')}
            className="w-8 h-8 bg-white/95 backdrop-blur-md border border-gray-100 rounded-full shadow-sm flex flex-col items-center justify-center active:scale-90 transition-all pointer-events-auto text-[#0a3a2a] opacity-50 hover:opacity-100"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="relative top-[2px]">
              <circle cx="12" cy="12" r="8" />
              <line x1="12" y1="2" x2="12" y2="6" />
              <line x1="12" y1="18" x2="12" y2="22" />
              <line x1="2" y1="12" x2="6" y2="12" />
              <line x1="18" y1="12" x2="22" y2="12" />
              <circle cx="12" cy="12" r="1.5" fill="currentColor" />
            </svg>
            <div className="w-0 h-2 border-l-[2px] border-dotted border-current opacity-40 mt-0.5"></div>
          </button>
        )}
      </div>

      <div className={`flex-1 w-full relative flex items-start justify-center overflow-visible ${isFullscreen ? (embed?.padClass ?? 'pb-24') : 'min-h-0'}`}>
        {/* [KOLORY STRZAŁ] W pełnym ekranie strzała stoi po prawej przy tarczy.
            Na czas celowania znika — w tym rogu może stanąć lupa. */}
        {isFullscreen && nextArrow && !isAiming && (
          <div className="absolute right-3 top-0 z-10 pointer-events-none">
            <NextArrowChip index={currentCoords.length} />
          </div>
        )}

        {/* LUPA — okrągły magnifier ~4× zoom okolicy krzyżyka. Tylko podczas celowania. */}
        {isAiming && aimPos && (
          <div className={`absolute z-30 top-0 ${loupeRight ? (isFullscreen ? 'right-3' : 'right-1') : (isFullscreen ? 'left-3' : 'left-1')} ${isFullscreen ? 'w-[132px] h-[132px]' : 'w-[88px] h-[88px]'} rounded-full overflow-hidden bg-white shadow-[0_8px_24px_rgba(0,0,0,0.18)] border-[3px] border-white pointer-events-none`}>
            <svg
              viewBox={`${aimPos.x - 15} ${aimPos.y - 15} 30 30`}
              className="w-full h-full"
              preserveAspectRatio="xMidYMid meet"
            >
              {is3Spot ? (
                <SpotTarget isVertical={isVertical} isTarget2={isTarget2} />
              ) : (
                <StandardTarget targetType={targetType} />
              )}
              {currentCoords.map((d: any, i: number) => (
                <g key={`lupa-${i}`}>
                  <circle cx={d.x} cy={d.y} r="3" fill={dotColor(i).hex} stroke="black" strokeWidth="0.8" />
                  <text x={d.x} y={d.y+1.2} fontSize="3.5" fontWeight="bold" textAnchor="middle" fill={dotColor(i).text}>{i+1}</text>
                </g>
              ))}
              {/* Krzyżyk w lupie — cieńsze linie żeby pasowały do zoom'u */}
              <circle cx={aimPos.x} cy={aimPos.y} r="5" fill="white" fillOpacity="0.3" stroke="#0a3a2a" strokeWidth="0.6" />
              <circle cx={aimPos.x} cy={aimPos.y} r="0.7" fill="#ef4444" />
              <path d={`M ${aimPos.x-9} ${aimPos.y} L ${aimPos.x+9} ${aimPos.y}`} stroke="#0a3a2a" strokeWidth="0.4" opacity="0.8" />
              <path d={`M ${aimPos.x} ${aimPos.y-9} L ${aimPos.x} ${aimPos.y+9}`} stroke="#0a3a2a" strokeWidth="0.4" opacity="0.8" />
            </svg>
          </div>
        )}

        <svg
          ref={svgRef}
          viewBox={viewBox}
          onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerCancel={handlePointerUp}
          className="w-full touch-none transition-transform duration-300 pointer-events-auto"
          style={{
            // [WIĘKSZA TARCZA] Cała wysokość ekranu minus nagłówek (~90) i dół
            // pod celownik offsetu (~96) — wcześniej 58vh zostawiało 1/3 pustą.
            maxHeight: isFullscreen ? 'calc(100dvh - 190px - env(safe-area-inset-top) - env(safe-area-inset-bottom))' : '100%',
            // Wbudowana: tyle, ile ma okienko (rośnie z ekranem, user 2026-11-03).
            height: isFullscreen ? 'auto' : '100%',
            ...(embed?.svgStyle || {}),
          }}
        >
          {is3Spot ? <SpotTarget isVertical={isVertical} isTarget2={isTarget2} /> : <StandardTarget targetType={targetType} />}
          {currentCoords.map((d: any, i: number) => <g key={i}><circle cx={d.x} cy={d.y} r="6" fill={dotColor(i).hex} stroke="black" strokeWidth="1.5" /><text x={d.x} y={d.y+2.5} fontSize="7" fontWeight="bold" textAnchor="middle" fill={dotColor(i).text}>{i+1}</text></g>)}
          {isAiming && aimPos && (
            <g style={{ pointerEvents: 'none' }}>
              <circle cx={aimPos.x} cy={aimPos.y} r="14" fill="white" fillOpacity="0.3" stroke="#0a3a2a" strokeWidth="1.5" />
              <circle cx={aimPos.x} cy={aimPos.y} r="1.5" fill="#ef4444" />
              <path d={`M ${aimPos.x-22} ${aimPos.y} L ${aimPos.x+22} ${aimPos.y}`} stroke="#0a3a2a" strokeWidth="1" opacity="0.6" />
              <path d={`M ${aimPos.x} ${aimPos.y-22} L ${aimPos.x} ${aimPos.y+22}`} stroke="#0a3a2a" strokeWidth="1" opacity="0.6" />
              {touchPos && <path d={`M ${touchPos.x} ${touchPos.y} L ${aimPos.x} ${aimPos.y + 22}`} stroke="#0a3a2a" strokeWidth="1" strokeDasharray="2,2" opacity="0.4" />}

              {/* Score chip przyczepiony do krzyżyka.
                  Smart flip: domyślnie chip po prawej, jeśli krzyżyk jest
                  w prawej połowie kadru — chip skacze na lewo. */}
              {currentAimScore && (() => {
                const colors = getScoreColors(currentAimScore);
                const flipLeft = aimPos.x > viewCx;
                const chipX = flipLeft ? aimPos.x - 48 : aimPos.x + 48;
                return (
                  <g transform={`translate(${chipX}, ${aimPos.y})`}>
                    <circle r="22" fill={colors.bg} stroke={colors.stroke} strokeWidth="2.5"
                            style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.25))' }} />
                    <text textAnchor="middle" dominantBaseline="central"
                          fontSize="24" fontWeight="900" fill={colors.text}>
                      {currentAimScore}
                    </text>
                  </g>
                );
              })()}
            </g>
          )}
        </svg>
      </div>

      {/* UNDO: mały w trybie normalnym */}
      {!isFullscreen && (
        <button
          onClick={onUndo}
          className="absolute bottom-2 right-2 bg-white shadow-md border border-gray-100 flex items-center justify-center active:scale-90 transition-all pointer-events-auto w-12 h-12 rounded-full"
        >
          <span className="material-symbols-outlined text-red-500 font-bold text-2xl">undo</span>
        </button>
      )}

      <style>{`
        .animate-fade-in-up { animation: fadeInUp 0.2s ease-out forwards; }
        @keyframes fadeInUp { from { opacity: 0; transform: translateY(10px) scale(0.95); } to { opacity: 1; transform: translateY(0) scale(1); } }
        /* Totalna blokada domyślnych zachowań przeglądarki podczas interakcji z tarczą */
        svg {
          touch-action: none;
          -webkit-touch-callout: none;
          -webkit-user-select: none;
          user-select: none;
        }
      `}</style>
    </div>
  );
}
/** [KOLORY STRZAŁ] Pasek koloru pod polem strzały; następna do wpisania jest grubsza. */
export function ArrowColorBar({ index, isNext }: { index: number; isNext?: boolean }) {
  const c = arrowColorAt(index);
  if (!c) return null;
  return (
    <span
      className={`absolute left-1 right-1 rounded-full pointer-events-none ${isNext ? '-bottom-1 h-1.5' : '-bottom-0.5 h-1'}`}
      style={{ backgroundColor: c.hex, boxShadow: '0 0 0 1px rgba(10,58,42,0.35)' }}
    />
  );
}

/** [KOLORY STRZAŁ] „Teraz: strzała 2” — miniatura strzały z kolorową opaską nad tarczą. */
export function NextArrowChip({ index, className = 'h-11' }: { index: number; className?: string }) {
  const c = arrowColorAt(index);
  if (!c) return null;
  // Miniatura strzały jak na grafice w (i) — kółko z cyfrą wyglądało jak
  // licznik powiadomień i drażniło (user 2026-10-28).
  return (
    <svg viewBox="0 0 24 60" className={`${className} w-auto shrink-0 drop-shadow-sm`} role="img" aria-label={String(index + 1)}>
      <rect x={10} y={1} width={4} height={5} rx={1.5} fill="#9ca3af" />
      <path d="M 12 6 L 4 13 L 4 25 L 12 21 Z" fill="#d1d5db" />
      <path d="M 12 6 L 20 13 L 20 25 L 12 21 Z" fill="#e5e7eb" />
      <rect x={10.5} y={5} width={3} height={46} rx={1.5} fill="#6b7280" />
      <rect x={4} y={24} width={16} height={18} rx={3.5} fill={c.hex} stroke="#0a3a2a" strokeWidth={1.5} />
      <text x={12} y={37.5} textAnchor="middle" fontSize={12} fontWeight={900} fill={c.text}>{index + 1}</text>
      <path d="M 9 51 L 15 51 L 12 59 Z" fill="#374151" />
    </svg>
  );
}
