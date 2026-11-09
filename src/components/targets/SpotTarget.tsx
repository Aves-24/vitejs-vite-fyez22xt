import React from 'react';
import { spotGeometryOf, DOUBLE_COLUMN, SINGLE_COLUMN, WA_SPOT_RINGS, WA_SPOT_ZONES, type SpotGeometry } from '../../config/spotGeometry';

interface SpotTargetProps {
  /** Typ tarczy — układ, kolory i strefy z katalogu (config/spotGeometry). */
  targetType?: string;
  /** Stare wywołania bez `targetType`: pionowa kolumna albo dwie kolumny. */
  isVertical?: boolean;
  /** Strzały 4–6 — aktywny drugi arkusz (prawa kolumna / dolna kartka Vegas). */
  isTarget2?: boolean;
  spotFocus?: 'ALL' | 'TOP' | 'MID' | 'BOT';
  setSpotFocus?: (focus: 'ALL' | 'TOP' | 'MID' | 'BOT') => void;
  /** Miniatura przy wyborze tarczy — wszystkie arkusze pełne, bez przygaszania. */
  preview?: boolean;
}

// Liczenie punktów spotu mieszka w utils/targetScoring.ts (testy).
export { calculateSpotScore } from '../../utils/targetScoring';

/**
 * [SPOTY 2026-11-09] Rysowanie z `spotGeometry` — dla 3-Spota (dwie kolumny
 * i pionowa) te same liczby co wcześniej wpisane na sztywno: kartki 140/150
 * szerokości, środki 75/150/225 × 66/200/333, pierścienie 62,5…6,25.
 */
export const SpotTarget: React.FC<SpotTargetProps> = ({ targetType, isVertical, isTarget2, preview }) => {
  const g: SpotGeometry = spotGeometryOf(targetType)
    ?? { ...(isVertical ? SINGLE_COLUMN : DOUBLE_COLUMN), rings: WA_SPOT_RINGS, zones: WA_SPOT_ZONES };
  const active = isTarget2 ? 1 : 0;
  return (
    <g>
      {g.sheets.map((s, i) => (
        <g
          key={i}
          style={{ transition: 'opacity 0.3s ease' }}
          opacity={preview || g.sheets.length === 1 || i === active ? 1 : 0.3}
        >
          <rect x={s.x} y={s.y} width={s.w} height={s.h} fill="#e8eaed" rx="8" stroke="#d1d5db" strokeWidth="2" />
          {g.spots.filter(p => p.sheet === i).map(p => (
            <g key={p.id}>
              {g.rings.map(ring => (
                <circle key={ring.f} cx={p.cx} cy={p.cy} r={g.r * ring.f} fill={ring.fill} stroke={ring.stroke} strokeWidth="0.5" />
              ))}
            </g>
          ))}
        </g>
      ))}
    </g>
  );
};
