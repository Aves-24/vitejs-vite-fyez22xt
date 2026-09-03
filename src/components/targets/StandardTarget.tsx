import React from 'react';
import { resolveTargetFace } from '../../config/targetFaces';

interface StandardTargetProps {
  /** Typ tarczy z sesji — geometria pochodzi z katalogu (config/targetFaces). */
  targetType?: string;
}

export const StandardTarget: React.FC<StandardTargetProps> = ({ targetType }) => {
  const rings = resolveTargetFace(targetType).rings;
  const lastIndex = rings.length - 1;

  return (
    <g>
      {rings.map((ring, i) => (
        <circle
          key={ring.r}
          cx="150"
          cy="150"
          r={ring.r}
          fill={ring.fill}
          stroke={ring.stroke}
          // X (najmniejszy pierścień) grubszą kreską — tak było przed katalogiem.
          strokeWidth={i === lastIndex ? 1 : 0.5}
        />
      ))}
    </g>
  );
};
