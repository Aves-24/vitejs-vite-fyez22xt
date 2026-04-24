import React, { useState, useEffect, useRef } from 'react';
import { StandardTarget } from './StandardTarget';
import { SpotTarget, calculateSpotScore } from './SpotTarget'; 

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

export default function TargetInput({ onShot, isFullscreen, onToggleFullscreen, currentArrows, currentCoords, onUndo, targetType }: any) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [zoom] = useState(() => parseFloat(localStorage.getItem('grotx-zoom') || '1'));
  const [isAiming, setIsAiming] = useState(false);
  const [aimPos, setAimPos] = useState<{x: number, y: number} | null>(null);
  const [touchPos, setTouchPos] = useState<{x: number, y: number} | null>(null);
  const [currentAimScore, setCurrentAimScore] = useState<string | null>(null);
  const [spotFocus, setSpotFocus] = useState<'ALL' | 'TOP' | 'MID' | 'BOT'>('ALL');

  const [aimOffset, setAimOffset] = useState(() => parseInt(localStorage.getItem('grotx-aim-offset') || '55'));
  const [showOffsetSlider, setShowOffsetSlider] = useState(false);

  const is3Spot = targetType === '3-Spot' || targetType === 'Vertical 3-Spot';
  const isVertical = targetType === 'Vertical 3-Spot';
  const is6Ring = targetType === 'WA 80cm (6-Ring)';
  const isTarget2 = currentArrows.length >= 3;

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
    if (currentArrows.length === 6 && isFullscreen) {
      const timer = setTimeout(() => {
        onToggleFullscreen();
      }, 500); 
      return () => clearTimeout(timer);
    }
  }, [currentArrows.length, isFullscreen, onToggleFullscreen]);

  const getSvgCoords = (clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return null;
    const pt = svg.createSVGPoint(); pt.x = clientX; pt.y = clientY;
    return pt.matrixTransform(svg.getScreenCTM()?.inverse());
  };

  const calculateScore = (x: number, y: number) => {
    if (is3Spot) {
      return calculateSpotScore(x, y, isVertical, isTarget2);
    } 
    let val = "M"; const sId = "";
    const d = Math.hypot(x - 150, y - 150);
    const ring = (targetType === '40cm') ? 12.5 : 15;
    const maxRadius = ring * 10;
    if (d <= maxRadius) {
      const s = 10 - Math.floor(d / ring);
      val = d <= ring / 2 ? "X" : s >= 1 ? s.toString() : "M";
      if (is6Ring && s < 5) val = "M";
    }
    return { val, sId: sId || "" };
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (currentCoords.length >= 6) return;
    (e.target as Element).setPointerCapture(e.pointerId);
    const c = getSvgCoords(e.clientX, e.clientY);
    if (c) {
      setIsAiming(true);
      setTouchPos({ x: c.x, y: c.y });
      setAimPos({ x: c.x, y: c.y - aimOffset });
      setCurrentAimScore(calculateScore(c.x, c.y - aimOffset).val);
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isAiming) return;
    const c = getSvgCoords(e.clientX, e.clientY);
    if (c) {
      setTouchPos({ x: c.x, y: c.y });
      setAimPos({ x: c.x, y: c.y - aimOffset });
      setCurrentAimScore(calculateScore(c.x, c.y - aimOffset).val);
    }
  };

  const handlePointerUp = () => {
    if (isAiming && aimPos) {
      const { val, sId } = calculateScore(aimPos.x, aimPos.y);
      onShot(val, aimPos.x, aimPos.y, sId);
    }
    setIsAiming(false); setAimPos(null); setTouchPos(null); setCurrentAimScore(null);
  };

  const getOrigin = () => {
    if (spotFocus === 'TOP') return '50% 22%';
    if (spotFocus === 'MID') return '50% 50%';
    if (spotFocus === 'BOT') return '50% 78%';
    return 'center';
  };

  return (
    <div className={`flex flex-col items-center ${isFullscreen ? 'fixed inset-0 z-[99999] bg-[#fcfdfe] pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] justify-start touch-none' : 'w-full h-full relative justify-center overflow-hidden'}`}>
      
      {/* HEADER: 3-kolumnowy layout.
          LEWO: lupa (absolute, gdy celujesz).
          ŚRODEK: shot badges + undo — wycentrowane by nie nachodziły na lupę.
          PRAWO: fullscreen / close button. */}
      <div className={`w-full flex justify-between items-start z-20 pointer-events-none shrink-0 ${isFullscreen ? 'relative px-6 pt-6 mb-4' : 'px-2 pt-2 absolute top-0'}`}>

        {/* LEWO: kontener dla lupy. Zarezerwowana szerokość mała (lupa jest
            absolute i wystaje do 115px/88px wizualnie). Duża kolumna przepełniała
            header — badges lądowały na lupie. */}
        <div className={`${isFullscreen ? 'w-[8px]' : 'w-[8px]'} relative shrink-0`}>
          {/* LUPA — okrągły magnifier ~4× zoom okolicy krzyżyka.
              Widoczny tylko podczas celowania. */}
          {isAiming && aimPos && (
            <div className={`absolute ${isFullscreen ? 'top-0 w-[115px] h-[115px]' : 'top-0 w-[88px] h-[88px]'} left-0 rounded-full overflow-hidden bg-white shadow-[0_8px_24px_rgba(0,0,0,0.15)] border-[3px] border-white pointer-events-none animate-fade-in-up`}>
              <svg
                viewBox={`${aimPos.x - 15} ${aimPos.y - 15} 30 30`}
                className="w-full h-full"
                preserveAspectRatio="xMidYMid meet"
              >
                {is3Spot ? (
                  <SpotTarget isVertical={isVertical} isTarget2={isTarget2} spotFocus={spotFocus} setSpotFocus={() => {}} />
                ) : (
                  <StandardTarget is6Ring={is6Ring} />
                )}
                {currentCoords.map((d: any, i: number) => (
                  <g key={`lupa-${i}`}>
                    <circle cx={d.x} cy={d.y} r="3" fill="white" stroke="black" strokeWidth="0.8" />
                    <text x={d.x} y={d.y+1.2} fontSize="3.5" fontWeight="bold" textAnchor="middle" fill="black">{i+1}</text>
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
        </div>

        {/* PRAWO: badges + undo + (separator) + close.
            Wszystko zgrupowane po prawej, close oddzielony marginesem. */}
        {isFullscreen ? (
          <div className="flex items-center gap-2 pointer-events-auto ml-auto">
            <div className="flex gap-0.5 bg-white/90 p-1 rounded-xl shadow-sm border border-gray-100">
              {[0,1,2,3,4,5].map(i => <div key={i} className={`w-6 h-6 flex items-center justify-center text-[9px] font-black rounded-md ${getArrowStyles(currentArrows[i] || '')}`}>{currentArrows[i] || ''}</div>)}
            </div>
            <button onClick={onUndo} className="p-2 bg-white border border-red-100 shadow-md rounded-full active:scale-90 transition-all">
              <span className="material-symbols-outlined text-red-500 font-bold text-xl">undo</span>
            </button>
            {/* Close — ten sam design co undo, z separatorem */}
            <button onClick={onToggleFullscreen} className="ml-3 p-2 bg-white border border-red-100 shadow-md rounded-full active:scale-90 transition-all">
              <span className="material-symbols-outlined text-red-500 font-bold text-xl">close</span>
            </button>
          </div>
        ) : (
          <button onClick={onToggleFullscreen} className="p-2 bg-white/90 border border-gray-200 rounded-full shadow-md text-gray-400 active:scale-90 pointer-events-auto transition-all"><span className="material-symbols-outlined text-lg">fullscreen</span></button>
        )}
      </div>

      {/* LEWY DÓŁ: INTUICYJNY CELOWNIK (OFFSET) POMNIEJSZONY I W 80% KRYCIA */}
      <div className={`absolute z-[100] flex flex-col items-center justify-end transition-all duration-300 origin-bottom ${isFullscreen ? 'left-6 bottom-8' : 'left-2 bottom-2'}`}>
        {showOffsetSlider ? (
          <div className="relative w-11 h-44 bg-white/95 backdrop-blur-md rounded-[22px] shadow-xl border border-gray-100 flex flex-col items-center pb-2 pt-3 pointer-events-auto animate-fade-in-up">
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
              
              {/* Celownik jako fizyczny uchwyt suwaka (też mniejszy: w-8 h-8) */}
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
        ) : (
          <button 
            onClick={(e) => { e.stopPropagation(); setShowOffsetSlider(true); }} 
            // IKONA POMNIEJSZONA O 1/3 (w-8 h-8) I ZMNIEJSZONE KRYCIE (opacity-50)
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

      <div className={`flex-1 w-full relative flex items-start justify-center overflow-visible ${isFullscreen ? 'pb-24' : ''}`}>
        <svg 
          ref={svgRef} 
          viewBox={is3Spot ? "-20 -40 340 480" : is6Ring ? (isFullscreen ? "-20 -50 340 410" : "-20 -30 340 360") : (isFullscreen ? "-20 -50 340 390" : "-20 0 340 300")}
          onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} 
          className="w-full touch-none transition-transform duration-300 pointer-events-auto" 
          style={{ 
            transform: spotFocus !== 'ALL' ? 'scale(1.8)' : `scale(${zoom})`, 
            transformOrigin: getOrigin(),
            maxHeight: isFullscreen ? '58vh' : '100%',
            height: isFullscreen ? 'auto' : '230px'
          }}
        >
          {is3Spot ? <SpotTarget isVertical={isVertical} isTarget2={isTarget2} spotFocus={spotFocus} setSpotFocus={setSpotFocus} /> : <StandardTarget is6Ring={is6Ring} />}
          {currentCoords.map((d: any, i: number) => <g key={i}><circle cx={d.x} cy={d.y} r="6" fill="white" stroke="black" strokeWidth="1.5" /><text x={d.x} y={d.y+2.5} fontSize="7" fontWeight="bold" textAnchor="middle" fill="black">{i+1}</text></g>)}
          {isAiming && aimPos && (
            <g style={{ pointerEvents: 'none' }}>
              <circle cx={aimPos.x} cy={aimPos.y} r="14" fill="white" fillOpacity="0.3" stroke="#0a3a2a" strokeWidth="1.5" />
              <circle cx={aimPos.x} cy={aimPos.y} r="1.5" fill="#ef4444" />
              <path d={`M ${aimPos.x-22} ${aimPos.y} L ${aimPos.x+22} ${aimPos.y}`} stroke="#0a3a2a" strokeWidth="1" opacity="0.6" />
              <path d={`M ${aimPos.x} ${aimPos.y-22} L ${aimPos.x} ${aimPos.y+22}`} stroke="#0a3a2a" strokeWidth="1" opacity="0.6" />
              {touchPos && <path d={`M ${touchPos.x} ${touchPos.y} L ${aimPos.x} ${aimPos.y + 22}`} stroke="#0a3a2a" strokeWidth="1" strokeDasharray="2,2" opacity="0.4" />}

              {/* Score chip przyczepiony do krzyżyka.
                  Smart flip: domyślnie chip po prawej, jeśli krzyżyk jest
                  w prawej połowie tarczy (x > 150) — chip skacze na lewo. */}
              {currentAimScore && (() => {
                const colors = getScoreColors(currentAimScore);
                const flipLeft = aimPos.x > 150;
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
        .animate-fade-in-right { animation: fadeInRight 0.15s ease-out forwards; } 
        @keyframes fadeInRight { from { opacity: 0; transform: translateX(-20px); } to { opacity: 1; transform: translateX(0); } }
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