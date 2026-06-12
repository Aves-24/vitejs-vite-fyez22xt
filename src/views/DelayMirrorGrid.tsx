import React from 'react';

// Siatka pozycjonowania Delay Mirror — wspólna dla nagrywania (overlay na
// pełnym ekranie kamery) i podglądu nagrania (overlay na obszarze video).
// Skaluje się procentowo, więc na podglądzie pokrywa się 1:1 z kadrem.

const gridPositions = [16.7, 33.3, 50, 66.7, 83.3];
// Kolory od środka na zewnątrz: zielony (centrum) → żółty → czerwony
const gridColors = [
  'rgba(239,68,68,0.85)',   // red   — krawędź
  'rgba(250,204,21,0.85)',  // yellow
  'rgba(74,222,128,0.95)',  // green — środek
  'rgba(250,204,21,0.85)',  // yellow
  'rgba(239,68,68,0.85)',   // red   — krawędź
];
const DOT = 6;          // średnica kropki px
const ARM = DOT * 2;    // długość ramienia krzyzyka = 2x średnica

export default function DelayMirrorGrid() {
  return (
    <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 15 }}>

      {/* Cienkie linie poziome — kolor zalezy od wiersza */}
      {gridPositions.map((y, yi) => (
        <div key={`hl-${yi}`} style={{
          position: 'absolute', top: `${y}%`, left: 0, right: 0,
          height: 1, backgroundColor: gridColors[yi], opacity: 0.45,
          transform: 'translateY(-50%)',
        }} />
      ))}

      {/* Cienkie linie pionowe — kolor zalezy od kolumny */}
      {gridPositions.map((x, xi) => (
        <div key={`vl-${xi}`} style={{
          position: 'absolute', left: `${x}%`, top: 0, bottom: 0,
          width: 1, backgroundColor: gridColors[xi], opacity: 0.45,
          transform: 'translateX(-50%)',
        }} />
      ))}

      {/* Kropki + krzyzyki na każdym przecięciu */}
      {gridPositions.map((y, yi) =>
        gridPositions.map((x, xi) => {
          // Kolor = ciemniejszy z wiersza i kolumny (dalej od środka wygrywa)
          const distY = Math.abs(yi - 2);
          const distX = Math.abs(xi - 2);
          const color = gridColors[Math.max(distY, distX) === 0 ? 2 : Math.max(distY, distX) === 1 ? 1 : 0];
          return (
            <React.Fragment key={`cross-${xi}-${yi}`}>
              {/* Poziome ramię krzyzyka */}
              <div style={{
                position: 'absolute', left: `${x}%`, top: `${y}%`,
                width: ARM * 2, height: 1,
                backgroundColor: color,
                transform: `translate(-50%, -50%)`,
              }} />
              {/* Pionowe ramię krzyzyka */}
              <div style={{
                position: 'absolute', left: `${x}%`, top: `${y}%`,
                width: 1, height: ARM * 2,
                backgroundColor: color,
                transform: `translate(-50%, -50%)`,
              }} />
              {/* Kropka */}
              <div style={{
                position: 'absolute', left: `${x}%`, top: `${y}%`,
                width: DOT, height: DOT,
                borderRadius: '50%',
                backgroundColor: color,
                transform: 'translate(-50%, -50%)',
              }} />
            </React.Fragment>
          );
        })
      )}

      {/* Corner brackets */}
      {[
        { top: 0, left: 0, borderTop: `2px solid ${gridColors[0]}`, borderLeft: `2px solid ${gridColors[0]}` },
        { top: 0, right: 0, borderTop: `2px solid ${gridColors[0]}`, borderRight: `2px solid ${gridColors[0]}` },
        { bottom: 0, left: 0, borderBottom: `2px solid ${gridColors[0]}`, borderLeft: `2px solid ${gridColors[0]}` },
        { bottom: 0, right: 0, borderBottom: `2px solid ${gridColors[0]}`, borderRight: `2px solid ${gridColors[0]}` },
      ].map((style, i) => (
        <div key={`corner-${i}`} style={{ position: 'absolute', width: 50, height: 50, ...style }} />
      ))}
    </div>
  );
}
