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

// Rysuje siatkę bezpośrednio na canvasie nagrania (wypalana w plik wideo).
// Rozmiary skalowane do rozdzielczości klatki, żeby proporcje odpowiadały
// overlayowi na ekranie (~400px szerokości UI).
export function drawGridOnCanvas(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const minDim = Math.min(w, h);
  const scale = minDim / 400;
  const line = Math.max(1, Math.round(scale));
  const dot = Math.max(3, Math.round(DOT * scale));
  const arm = Math.round(ARM * scale);
  const corner = Math.round(50 * scale);
  const cornerBw = Math.max(2, Math.round(2 * scale));

  ctx.save();

  // Cienkie linie — poziome i pionowe
  ctx.globalAlpha = 0.45;
  gridPositions.forEach((p, i) => {
    ctx.fillStyle = gridColors[i];
    ctx.fillRect(0, (p / 100) * h - line / 2, w, line);
  });
  gridPositions.forEach((p, i) => {
    ctx.fillStyle = gridColors[i];
    ctx.fillRect((p / 100) * w - line / 2, 0, line, h);
  });
  ctx.globalAlpha = 1;

  // Krzyzyki + kropki na przecięciach
  gridPositions.forEach((py, yi) =>
    gridPositions.forEach((px, xi) => {
      const distY = Math.abs(yi - 2);
      const distX = Math.abs(xi - 2);
      const color = gridColors[Math.max(distY, distX) === 0 ? 2 : Math.max(distY, distX) === 1 ? 1 : 0];
      const cx = (px / 100) * w;
      const cy = (py / 100) * h;
      ctx.fillStyle = color;
      ctx.fillRect(cx - arm, cy - line / 2, arm * 2, line);
      ctx.fillRect(cx - line / 2, cy - arm, line, arm * 2);
      ctx.beginPath();
      ctx.arc(cx, cy, dot / 2, 0, Math.PI * 2);
      ctx.fill();
    })
  );

  // Corner brackets
  ctx.fillStyle = gridColors[0];
  ctx.fillRect(0, 0, corner, cornerBw); ctx.fillRect(0, 0, cornerBw, corner);
  ctx.fillRect(w - corner, 0, corner, cornerBw); ctx.fillRect(w - cornerBw, 0, cornerBw, corner);
  ctx.fillRect(0, h - cornerBw, corner, cornerBw); ctx.fillRect(0, h - corner, cornerBw, corner);
  ctx.fillRect(w - corner, h - cornerBw, corner, cornerBw); ctx.fillRect(w - cornerBw, h - corner, cornerBw, corner);

  ctx.restore();
}

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
