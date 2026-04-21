import React from 'react';

interface FullFaceTargetProps {
  targetType: string;
  zoom: number;
  onPointerDown: (e: React.PointerEvent<SVGSVGElement>) => void;
  onPointerMove: (e: React.PointerEvent<SVGSVGElement>) => void;
  onPointerUp: (e: React.PointerEvent<SVGSVGElement>) => void;
  svgRef: React.RefObject<SVGSVGElement>;
}

export default function FullFaceTarget({ 
  targetType, 
  zoom, 
  onPointerDown, 
  onPointerMove, 
  onPointerUp, 
  svgRef 
}: FullFaceTargetProps) {
  
  const is6Ring = targetType === 'WA 80cm (6-Ring)';
  
  // Ustawiamy ramkę widoku tak, by tarcza była idealnie w centrum
  // Dla 6-Ring dodajemy lekki margines pionowy dla lepszego balansu
  const viewBox = is6Ring ? "0 -30 300 360" : "0 0 300 300";

  return (
    <svg
      ref={svgRef}
      viewBox={viewBox}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      className="cursor-crosshair transition-transform duration-100 ease-out"
      style={{
        touchAction: 'none',
        width: '100%',
        height: '100%',
        transform: `scale(${zoom})`,
        transformOrigin: 'center center',
      }}
    >
      {is6Ring ? (
        /* --- TARCZA 80cm (6-RING) --- */
        <g>
          {/* Niebieskie (6, 5) */}
          <circle cx="150" cy="150" r="90" fill="#2F80ED" stroke="#333" strokeWidth="0.5" />
          <circle cx="150" cy="150" r="75" fill="#2F80ED" stroke="#333" strokeWidth="0.5" />
          {/* Czerwone (8, 7) */}
          <circle cx="150" cy="150" r="60" fill="#EB5757" stroke="#333" strokeWidth="0.5" />
          <circle cx="150" cy="150" r="45" fill="#EB5757" stroke="#333" strokeWidth="0.5" />
          {/* Żółte (X, 10, 9) */}
          <circle cx="150" cy="150" r="30" fill="#F2C94C" stroke="#333" strokeWidth="0.5" />
          <circle cx="150" cy="150" r="15" fill="#F2C94C" stroke="#333" strokeWidth="0.5" />
          <circle cx="150" cy="150" r="7.5" fill="#F2C94C" stroke="#333" strokeWidth="0.5" />
        </g>
      ) : (
        /* --- STANDARDOWA TARCZA PEŁNA (10 PIERŚCIENI) --- */
        <g>
          {/* Białe (2, 1) */}
          <circle cx="150" cy="150" r="150" fill="white" stroke="#333" strokeWidth="0.5" />
          <circle cx="150" cy="150" r="135" fill="white" stroke="#333" strokeWidth="0.5" />
          {/* Czarne (4, 3) */}
          <circle cx="150" cy="150" r="120" fill="#333" stroke="#fff" strokeWidth="0.5" />
          <circle cx="150" cy="150" r="105" fill="#333" stroke="#fff" strokeWidth="0.5" />
          {/* Niebieskie (6, 5) */}
          <circle cx="150" cy="150" r="90" fill="#2F80ED" stroke="#333" strokeWidth="0.5" />
          <circle cx="150" cy="150" r="75" fill="#2F80ED" stroke="#333" strokeWidth="0.5" />
          {/* Czerwone (8, 7) */}
          <circle cx="150" cy="150" r="60" fill="#EB5757" stroke="#333" strokeWidth="0.5" />
          <circle cx="150" cy="150" r="45" fill="#EB5757" stroke="#333" strokeWidth="0.5" />
          {/* Żółte (X, 10, 9) */}
          <circle cx="150" cy="150" r="30" fill="#F2C94C" stroke="#333" strokeWidth="0.5" />
          <circle cx="150" cy="150" r="15" fill="#F2C94C" stroke="#333" strokeWidth="0.5" />
          <circle cx="150" cy="150" r="7.5" fill="#F2C94C" stroke="#333" strokeWidth="0.5" />
        </g>
      )}
    </svg>
  );
}