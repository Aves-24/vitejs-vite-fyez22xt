import React from 'react';

interface SpotTargetProps {
  isVertical?: boolean;
  isTarget2?: boolean; // Prawa kolumna w Vegas
  spotFocus?: 'ALL' | 'TOP' | 'MID' | 'BOT';
  setSpotFocus?: (focus: 'ALL' | 'TOP' | 'MID' | 'BOT') => void;
}

// EKSPORTOWANA LOGIKA OBLICZEŃ - Sercem tarczy 3-Spot jest precyzyjny pomiar odległości
export const calculateSpotScore = (x: number, y: number, isVertical: boolean, isTarget2: boolean) => {
  const tX = !isVertical ? (isTarget2 ? 225 : 75) : 150;
  
  // 1. Blokada Vegas (nie pozwalamy na zaliczenie punktów z nieaktywnej połowy)
  if (!isVertical) {
    if ((!isTarget2 && x > 150) || (isTarget2 && x <= 150)) {
      return { val: "M", sId: "" };
    }
  }

  // 2. Szukamy najbliższego środka spośród 3 tarcz (TOP, MID, BOT)
  const centers = [66, 200, 333].map((cy, i) => ({ 
    id: `${!isVertical ? (isTarget2 ? 'R' : 'L') : 'V'}${i}`, 
    d: Math.hypot(x - tX, y - cy) 
  }));
  
  const closest = centers.reduce((p, n) => p.d < n.d ? p : n);
  
  // 3. WERYFIKACJA TRAFIENIA: Największy krąg (6 punktów) ma promień 62.5
  if (closest.d <= 62.5) {
    const s = 10 - Math.floor(closest.d / 12.5);
    const val = closest.d <= 6.25 ? "X" : s >= 6 ? s.toString() : "M";
    return { val, sId: closest.id }; // Trafienie w kolor - zwracamy ID spotu
  }

  // Trafienie w białe/szare tło - sId musi być PUSTE
  return { val: "M", sId: "" };
};

export const SpotTarget: React.FC<SpotTargetProps> = ({ isVertical, isTarget2 }) => {
  const renderOriginalSpot = (cx: number, cy: number) => (
    <g key={`${cx}-${cy}`}>
      <circle cx={cx} cy={cy} r="62.5" fill="#2F80ED" stroke="#333" strokeWidth="0.5" />
      <circle cx={cx} cy={cy} r="50" fill="#EB5757" stroke="#333" strokeWidth="0.5" />
      <circle cx={cx} cy={cy} r="37.5" fill="#EB5757" stroke="#333" strokeWidth="0.5" />
      <circle cx={cx} cy={cy} r="25" fill="#F2C94C" stroke="#333" strokeWidth="0.5" />
      <circle cx={cx} cy={cy} r="12.5" fill="#F2C94C" stroke="#333" strokeWidth="0.5" />
      <circle cx={cx} cy={cy} r="6.25" fill="#F2C94C" stroke="#333" strokeWidth="0.5" />
    </g>
  );

  if (isVertical) {
    return (
      <g>
        <rect x="75" y="0" width="150" height="400" fill="#e8eaed" rx="8" stroke="#d1d5db" strokeWidth="2" />
        {[66, 200, 333].map(cy => renderOriginalSpot(150, cy))}
      </g>
    );
  }

  return (
    <g>
      <g style={{ transition: 'opacity 0.3s ease' }} opacity={isTarget2 ? 0.3 : 1}>
        <rect x="5" y="0" width="140" height="400" fill="#e8eaed" rx="8" stroke="#d1d5db" strokeWidth="2" />
        {[66, 200, 333].map(cy => renderOriginalSpot(75, cy))}
      </g>
      <g style={{ transition: 'opacity 0.3s ease' }} opacity={isTarget2 ? 1 : 0.3}>
        <rect x="155" y="0" width="140" height="400" fill="#e8eaed" rx="8" stroke="#d1d5db" strokeWidth="2" />
        {[66, 200, 333].map(cy => renderOriginalSpot(225, cy))}
      </g>
    </g>
  );
};