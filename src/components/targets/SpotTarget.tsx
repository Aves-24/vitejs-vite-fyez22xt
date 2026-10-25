import React from 'react';

interface SpotTargetProps {
  isVertical?: boolean;
  isTarget2?: boolean; // Prawa kolumna w Vegas
  spotFocus?: 'ALL' | 'TOP' | 'MID' | 'BOT';
  setSpotFocus?: (focus: 'ALL' | 'TOP' | 'MID' | 'BOT') => void;
  /** Miniatura przy wyborze tarczy — obie kolumny pełne, bez przygaszania. */
  preview?: boolean;
}

// Liczenie punktów spotu mieszka w utils/targetScoring.ts (testy).
export { calculateSpotScore } from '../../utils/targetScoring';

export const SpotTarget: React.FC<SpotTargetProps> = ({ isVertical, isTarget2, preview }) => {
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
      <g style={{ transition: 'opacity 0.3s ease' }} opacity={isTarget2 && !preview ? 0.3 : 1}>
        <rect x="5" y="0" width="140" height="400" fill="#e8eaed" rx="8" stroke="#d1d5db" strokeWidth="2" />
        {[66, 200, 333].map(cy => renderOriginalSpot(75, cy))}
      </g>
      <g style={{ transition: 'opacity 0.3s ease' }} opacity={isTarget2 || preview ? 1 : 0.3}>
        <rect x="155" y="0" width="140" height="400" fill="#e8eaed" rx="8" stroke="#d1d5db" strokeWidth="2" />
        {[66, 200, 333].map(cy => renderOriginalSpot(225, cy))}
      </g>
    </g>
  );
};