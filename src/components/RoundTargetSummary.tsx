import React from 'react';
import { useTranslation } from 'react-i18next';

export default function RoundTargetSummary({ title, ends, highlightedEnd, startIndex = 0, targetType = 'Full', onZoomClick }: any) {
  const { t } = useTranslation();
  const isFullFace = ['Full', 'WA 80cm', '122cm', '80cm', '60cm', '40cm'].includes(targetType);
  const is3Spot = targetType === '3-Spot' || targetType === 'Vertical 3-Spot' || targetType === '3-Spot (Vertical)';

  const totalArrows = ends.reduce((acc: number, end: any) => acc + (end.dots?.length || 0), 0);
  const isLargeSession = totalArrows > 18;

  const renderSpotCircle = (cx: number, cy: number) => (
    <g key={`spot-${cx}-${cy}`}>
      <circle cx={cx} cy={cy} r="62.5" fill="#2F80ED" stroke="#333" strokeWidth="0.5" />
      <circle cx={cx} cy={cy} r="50" fill="#EB5757" stroke="#333" strokeWidth="0.5" />
      <circle cx={cx} cy={cy} r="37.5" fill="#EB5757" stroke="#333" strokeWidth="0.5" />
      <circle cx={cx} cy={cy} r="25" fill="#F2C94C" stroke="#333" strokeWidth="0.5" />
      <circle cx={cx} cy={cy} r="12.5" fill="#F2C94C" stroke="#333" strokeWidth="0.5" />
      <circle cx={cx} cy={cy} r="6.25" fill="#F2C94C" stroke="#333" strokeWidth="0.5" />
    </g>
  );

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-3 shadow-sm relative flex flex-col items-center h-full">
      <div className="w-full flex justify-between items-center mb-3">
        <div className="flex flex-col">
          <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none">{title}</span>
          <span className="text-[8px] font-bold text-emerald-500 uppercase mt-1">{totalArrows} {t('common.arrows')}</span>
        </div>
        {onZoomClick && (
          <button 
            onClick={(e) => {
              e.stopPropagation();
              onZoomClick();
            }} 
            className="flex items-center gap-1 p-1.5 bg-gray-50 text-gray-500 rounded-lg active:scale-95 transition-all border border-gray-100 hover:bg-gray-100 shadow-sm"
          >
             <span className="material-symbols-outlined text-[14px] text-yellow-500 font-black">diamond</span>
             <span className="material-symbols-outlined text-[16px]">open_in_full</span>
          </button>
        )}
      </div>
      
      <div className="w-full flex-1 flex items-center justify-center min-h-[160px]">
        {/* Zunifikowany viewBox: 3-Spot używa 300x400 (żeby podwójna tarcza ładnie siadła) */}
        <svg viewBox={!isFullFace ? "0 0 300 400" : "0 0 300 300"} className="w-full h-auto max-h-[220px] drop-shadow-md">
          {isFullFace ? (
            <g>
              <circle cx="150" cy="150" r="150" fill="white" stroke="#333" strokeWidth="1" />
              <circle cx="150" cy="150" r="135" fill="white" stroke="#333" strokeWidth="1" />
              <circle cx="150" cy="150" r="120" fill="#333" stroke="#fff" strokeWidth="1" />
              <circle cx="150" cy="150" r="105" fill="#333" stroke="#fff" strokeWidth="1" />
              <circle cx="150" cy="150" r="90" fill="#2F80ED" stroke="#333" strokeWidth="1" />
              <circle cx="150" cy="150" r="75" fill="#2F80ED" stroke="#333" strokeWidth="1" />
              <circle cx="150" cy="150" r="60" fill="#EB5757" stroke="#333" strokeWidth="1" />
              <circle cx="150" cy="150" r="45" fill="#EB5757" stroke="#333" strokeWidth="1" />
              <circle cx="150" cy="150" r="30" fill="#F2C94C" stroke="#333" strokeWidth="1" />
              <circle cx="150" cy="150" r="15" fill="#F2C94C" stroke="#333" strokeWidth="1" />
              <circle cx="150" cy="150" r="7.5" fill="#F2C94C" stroke="#333" strokeWidth="1" />
            </g>
          ) : is3Spot ? (
            // TUTAJ POPRAWKA: Jeśli is3Spot jest prawda, ZAWSZE rysuj dwie pionowe połówki (Lewa na 75, Prawa na 225)
            <g>
              <rect x="5" y="0" width="140" height="400" fill="#f8f9fa" rx="8" stroke="#ddd" strokeWidth="2" />
              <rect x="155" y="0" width="140" height="400" fill="#f8f9fa" rx="8" stroke="#ddd" strokeWidth="2" />
              {[66, 200, 333].map(cy => renderSpotCircle(75, cy))}
              {[66, 200, 333].map(cy => renderSpotCircle(225, cy))}
            </g>
          ) : (
             // W razie gdyby ktoś kiedyś dodał inny typ (np. zwierzaka 3D), zostawiamy ten fallback 
            <g>
              <rect x="75" y="0" width="150" height="400" fill="#f9f9f9" rx="10" stroke="#eee" strokeWidth="2" />
              {[66, 200, 333].map(cy => renderSpotCircle(150, cy))}
            </g>
          )}
          
          {ends.map((end: any, idx: number) => {
            const globalIdx = startIndex + idx;
            const isHighlighted = highlightedEnd === null || highlightedEnd === undefined || highlightedEnd === globalIdx;
            
            return end.dots?.map((dot: any, dIdx: number) => {
              if (dot.x === null || dot.y === null) return null;
              const radius = isHighlighted ? (isLargeSession ? "4.5" : "6") : "3.5";
              
              return (
                <circle 
                  key={`${idx}-${dIdx}`} cx={dot.x} cy={dot.y} r={radius} fill="white" 
                  fillOpacity={isHighlighted ? 0.8 : 0.2} stroke={isHighlighted ? "#0a3a2a" : "#aaa"} 
                  strokeWidth={isHighlighted ? "1.5" : "0.5"} opacity={isHighlighted ? 1 : 0.3}
                  style={{ transition: 'all 0.3s ease' }}
                />
              );
            });
          })}
        </svg>
      </div>
    </div>
  );
}