import React from 'react';
import { resolveTargetFace } from '../../config/targetFaces';
import { StandardTarget } from './StandardTarget';
import { SpotTarget } from './SpotTarget';

interface TargetThumbnailProps {
  targetType?: string | null;
  /** Rozmiar ustala rodzic (np. `w-7 h-7`) — SVG wpisuje się proporcjonalnie. */
  className?: string;
}

/**
 * [PODGLĄD TARCZY] Miniatura przy wyborze tarczy (prośba usera 2026-09-11).
 *
 * Rysuje TYMI SAMYMI komponentami co tarcza w trakcie serii (`StandardTarget`,
 * `SpotTarget`), więc podgląd nie może rozjechać się z tym, co user zobaczy
 * po starcie. Nowa tarcza w katalogu dostaje miniaturę bez zmian tutaj.
 *
 * Tarcze pełne mają identyczny rysunek niezależnie od średnicy (40/60/80/122)
 * — różnią je nazwa i przeliczenie handicapu, nie wygląd.
 */
export const TargetThumbnail: React.FC<TargetThumbnailProps> = ({ targetType, className }) => {
  const face = resolveTargetFace(targetType);
  if (face.layout === 'none') return null;

  if (face.layout === 'single') {
    // Tarcze bez zewnętrznych pierścieni (6-Ring, 3-5-7) kadrujemy do ich
    // największego pierścienia, żeby nie pływały w pustym polu.
    const r = (face.rings[0]?.r ?? 150) + 2;
    return (
      <svg viewBox={`${150 - r} ${150 - r} ${2 * r} ${2 * r}`} className={className} aria-hidden="true">
        <StandardTarget targetType={face.id} />
      </svg>
    );
  }

  const isVertical = face.layout === 'spot3-single';
  return (
    <svg viewBox={isVertical ? '73 -2 154 404' : '3 -2 294 404'} className={className} aria-hidden="true">
      <SpotTarget isVertical={isVertical} preview />
    </svg>
  );
};
