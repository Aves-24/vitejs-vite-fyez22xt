import { resolveTargetFace } from './targetFaces';
import { spotGeometryOfFace, spotById, nearestSpot } from './spotGeometry';

/**
 * [PARCOURS TREFFERBILD 2026-11-10] Strzały z całej trasy na jednej tarczy.
 *
 * W Parcours każda seria ma własną tarczę (IFAA 20/35/50/65 cm, teren WA
 * 20/40/60/80 cm). Wszystkie tarcze jednego świata mają TE SAME proporcje
 * stref (spot 0,2 D, pierścień 0,6 D … brzeg D), a kropki są zapisane
 * w viewBoxie tarczy (pełna: promień 150 wokół 150/150; spoty: promień spotu
 * wokół jego środka). Po przeskalowaniu do promienia 150 każda kropka leży
 * w tej samej strefie co na swojej tarczy — można je pokazać razem.
 *
 * Tarcza wzorcowa = najczęstsza pełna tarcza trasy; trasa tylko na tarczkach
 * 20 cm → ich pełny odpowiednik (ten sam wygląd i strefy).
 */

/** Tarczki 20 cm → pełna tarcza o tym samym wyglądzie i strefach. */
const SPOT_TO_SINGLE: Record<string, string> = {
  'IFAA Field 20cm 4-Spot': 'IFAA Field 35cm',
  'IFAA Hunter 20cm 4-Spot': 'IFAA Hunter 35cm',
  'IFAA Field 20cm 4-Spot Expert': 'IFAA Field 35cm Expert',
  'Field 20cm 3-Spot': 'Field 40cm',
};

const C = 150; // środek i promień pełnej tarczy w viewBoxie 300 × 300

export interface ParcoursTargetView { targetType: string; ends: any[] }

export function parcoursTargetView(ends: any[], fallbackFace?: string | null): ParcoursTargetView {
  const faceOf = (e: any) => resolveTargetFace(e?.targetType || fallbackFace);

  // Tarcza wzorcowa: najczęstsza pełna; remis → pierwsza na trasie.
  const counts = new Map<string, number>();
  ends.forEach(e => {
    const f = faceOf(e);
    const id = f.layout === 'single' ? f.id : SPOT_TO_SINGLE[f.id];
    if (id) counts.set(id, (counts.get(id) || 0) + (f.layout === 'single' ? 1 : 0.5));
  });
  let targetType = resolveTargetFace(fallbackFace).id;
  let best = -1;
  counts.forEach((n, id) => { if (n > best) { best = n; targetType = id; } });

  const scaled = ends.map(e => {
    const face = faceOf(e);
    if (face.layout === 'single') return e; // już w układzie 150/150, promień 150
    const g = spotGeometryOfFace(face);
    if (!g) return e;
    const dots = (e.dots || []).map((d: any) => {
      if (d?.x == null || d?.y == null) return d;
      const s = spotById(g, d.spotId) ?? nearestSpot(g, d.x, d.y);
      const k = C / g.r;
      return { ...d, x: C + (d.x - s.cx) * k, y: C + (d.y - s.cy) * k };
    });
    return { ...e, dots };
  });

  return { targetType, ends: scaled };
}
