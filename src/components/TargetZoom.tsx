// src/components/TargetZoom.tsx
import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

export function LargeTargetSVG({ ends, targetType, activeEnd }: { ends: any[], targetType: string, activeEnd: number | null }) {
  const isFullFace = ['Full', 'WA 80cm', '122cm', '80cm', '60cm', '40cm'].includes(targetType);
  const is3Spot = targetType === '3-Spot';

  const renderSpot = (cx: number, cy: number) => (
    <g key={`${cx}-${cy}`}>
      <circle cx={cx} cy={cy} r="62.5" fill="#2F80ED" stroke="#333" strokeWidth="0.5" />
      <circle cx={cx} cy={cy} r="50" fill="#2F80ED" stroke="#333" strokeWidth="0.5" />
      <circle cx={cx} cy={cy} r="37.5" fill="#EB5757" stroke="#333" strokeWidth="0.5" />
      <circle cx={cx} cy={cy} r="25" fill="#EB5757" stroke="#333" strokeWidth="0.5" />
      <circle cx={cx} cy={cy} r="12.5" fill="#F2C94C" stroke="#333" strokeWidth="0.5" />
      <circle cx={cx} cy={cy} r="6.25" fill="#F2C94C" stroke="#333" strokeWidth="0.5" />
    </g>
  );

  const renderDots = (end: any, localIdx: number, isHighlighted: boolean) => {
    const opacity = isHighlighted ? 1 : 0.15;
    const radius = isHighlighted ? "7" : "4"; 
    const strokeWidth = isHighlighted ? "1.5" : "0.5";
    const fillColor = isHighlighted ? "#fed33e" : "white";
    return end.dots?.map((dot: any, dotIdx: number) => {
      if (dot.x === null || dot.y === null) return null;
      const arrowNumber = dot.order || dotIdx + 1;
      return (
        <g key={`${localIdx}-${dotIdx}`} style={{ opacity, transition: 'all 0.3s ease' }}>
          <circle cx={dot.x} cy={dot.y} r={radius} fill={fillColor} stroke="#0a3a2a" strokeWidth={strokeWidth} />
          {isHighlighted && (
            <text x={dot.x} y={dot.y} fontSize="8" fontWeight="black" textAnchor="middle" dominantBaseline="central" fill="#0a3a2a" style={{ pointerEvents: 'none' }}>{arrowNumber}</text>
          )}
        </g>
      );
    });
  };

  return (
    <svg viewBox={!isFullFace ? "0 0 300 400" : "0 0 300 300"} className="w-full h-auto max-h-[55vh]">
      {isFullFace ? (
        <g>
          <circle cx="150" cy="150" r="150" fill="white" stroke="#333" strokeWidth="1" /><circle cx="150" cy="150" r="135" fill="white" stroke="#333" strokeWidth="1" /><circle cx="150" cy="150" r="120" fill="#333" stroke="#fff" strokeWidth="1" /><circle cx="150" cy="150" r="105" fill="#333" stroke="#fff" strokeWidth="1" /><circle cx="150" cy="150" r="90" fill="#2F80ED" stroke="#333" strokeWidth="1" /><circle cx="150" cy="150" r="75" fill="#2F80ED" stroke="#333" strokeWidth="1" /><circle cx="150" cy="150" r="60" fill="#EB5757" stroke="#333" strokeWidth="1" /><circle cx="150" cy="150" r="45" fill="#EB5757" stroke="#333" strokeWidth="1" /><circle cx="150" cy="150" r="30" fill="#F2C94C" stroke="#333" strokeWidth="1" /><circle cx="150" cy="150" r="15" fill="#F2C94C" stroke="#333" strokeWidth="1" /><circle cx="150" cy="150" r="7.5" fill="#F2C94C" stroke="#333" strokeWidth="1" />
        </g>
      ) : is3Spot ? (
        <g>
          <rect x="5" y="0" width="140" height="400" fill="#e8eaed" rx="8" stroke="#d1d5db" strokeWidth="2" />
          <rect x="155" y="0" width="140" height="400" fill="#e8eaed" rx="8" stroke="#d1d5db" strokeWidth="2" />
          {[66, 200, 333].map(cy => renderSpot(75, cy))}
          {[66, 200, 333].map(cy => renderSpot(225, cy))}
        </g>
      ) : (
        <g>
          <rect x="75" y="0" width="150" height="400" fill="#e8eaed" rx="8" stroke="#d1d5db" strokeWidth="2" />
          {[66, 200, 333].map(cy => renderSpot(150, cy))}
        </g>
      )}
      {ends.map((end: any, localIdx: number) => (activeEnd === null || activeEnd === localIdx ? null : renderDots(end, localIdx, false)))}
      {ends.map((end: any, localIdx: number) => (activeEnd !== null && activeEnd !== localIdx ? null : renderDots(end, localIdx, true)))}
    </svg>
  );
}

export default function TargetZoomModal({ roundTitle, ends, targetType, startIndex, onClose }: any) {  const { t } = useTranslation();

  const [activeEnd, setActiveEnd] = useState<number | null>(null);
  
  useEffect(() => { 
    document.body.style.overflow = 'hidden'; 
    return () => { document.body.style.overflow = 'auto'; }; 
  }, []);
  
  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100000] flex items-center justify-center p-4 transition-opacity duration-300" onClick={onClose}>
      <div className="bg-white rounded-[32px] p-6 w-full max-w-[500px] h-[85vh] shadow-2xl relative flex flex-col items-center border border-gray-100" onClick={e => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-5 right-5 p-2 bg-gray-100 text-gray-500 rounded-full active:scale-90 transition-all z-10">
          <span className="material-symbols-outlined font-bold text-xl">close</span>
        </button>
        <div className="text-center mb-6 w-full px-8 mt-2">
          <h3 className="text-[10px] font-black text-emerald-600 uppercase tracking-[0.2em] mb-1">{t('stats.zoom.title', 'Podgląd Rozrzutu')}</h3>
          <span className="text-xl font-black text-[#0a3a2a] leading-tight block">{roundTitle}</span>
        </div>
        <div className="flex gap-1.5 mb-6 justify-center w-full overflow-x-auto hide-scrollbar px-2 shrink-0">
          <button onClick={() => setActiveEnd(null)} className={`px-3 py-2 rounded-xl text-[10px] font-black transition-all ${activeEnd === null ? 'bg-[#0a3a2a] text-white shadow-md' : 'bg-gray-100 text-gray-500 active:bg-gray-200'}`}>WSZYSTKIE</button>
          {ends.map((_: any, i: number) => (
            <button key={i} onClick={() => setActiveEnd(i)} className={`w-10 py-2 rounded-xl text-[10px] font-black transition-all flex items-center justify-center ${activeEnd === i ? 'bg-[#fed33e] text-[#0a3a2a] shadow-md border border-[#e5bd38]' : 'bg-gray-100 text-gray-500 active:bg-gray-200 border border-transparent'}`}>P{startIndex + i + 1}</button>
          ))}
        </div>
        <div className="flex-1 w-full flex items-center justify-center bg-gray-50 rounded-2xl border border-gray-100 p-2 overflow-hidden">
          <LargeTargetSVG ends={ends} targetType={targetType} activeEnd={activeEnd} />
        </div>
      </div>
    </div>,
    document.body
  );

}