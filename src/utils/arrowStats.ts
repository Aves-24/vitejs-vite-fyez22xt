import { resolveTargetFace, isSpotFace } from '../config/targetFaces';
import { centerFor } from './spread';
import { ARROW_COLORS } from '../config/arrowColors';

/**
 * [KOLORY STRZAŁ] Statystyka per strzała — etap 2 (2026-10-28).
 *
 * Sesja wpisana w kolorowej kolejności (`arrowColors: true`) ma w każdej serii
 * `dots[i]` / `rawArrows[i]` = strzała nr i+1. Dla każdej strzały liczymy, gdzie
 * ląduje WZGLĘDEM SWOJEJ SERII, nie względem środka tarczy: przesunięcie
 * celownika czy wiatr przesuwają całą serię, a krzywa strzała odstaje od
 * reszty niezależnie od tego, gdzie akurat siedzi grupa.
 *
 * Jednostka to szerokość pierścienia — pełna tarcza i spot mają różne skale
 * w SVG, a pierścień jest porównywalny. Do pokazania przeliczamy na cm.
 */

/** Ile serii z daną strzałą, zanim cokolwiek pokażemy jako ostrzeżenie. */
export const ARROW_MIN_ENDS = 12;
/** Od jakiego średniego odchylenia (w pierścieniach) strzała jest podejrzana. */
export const ARROW_SUSPECT_RINGS = 0.5;

export interface ArrowStat {
  index: number;
  /** Serie, w których strzała miała pozycję na tarczy (bez M). */
  n: number;
  /** Średnie odchylenie od środka serii, w pierścieniach (x w prawo, y w dół). */
  dx: number;
  dy: number;
  /** Długość średniego odchylenia, w pierścieniach i w cm. */
  dist: number;
  distCm: number;
  /** Rozrzut wokół własnego średniego punktu (RMS), w pierścieniach. */
  spread: number;
  /** Średnia punktów — z każdej serii, także wpisanej klawiaturą. */
  avgScore: number;
  scored: number;
  misses: number;
  /** Stałe przesunięcie, a nie przypadek: dość danych, duże i statystycznie pewne. */
  suspect: boolean;
}

export interface ArrowStatsResult {
  arrows: ArrowStat[];
  sessions: number;
  /** Najmniejsza liczba serii wśród strzał — do napisu „jeszcze N serii”. */
  minEnds: number;
  /** Ile cm ma jeden pierścień na tej tarczy (ostatniej sesji). */
  ringCm: number;
}

interface SessionLike {
  arrowColors?: boolean;
  targetType?: string;
  ends?: Array<{ rawArrows?: string[]; arrows?: string[]; dots?: Array<{ x: number | null; y: number | null; spotId?: string | null }> }>;
}

const valueOf = (v?: string): number | null => {
  if (!v) return null;
  if (v === 'X') return 10;
  if (v === 'M') return 0;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
};

const median = (v: number[]): number => {
  const s = [...v].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** Szerokość pierścienia w jednostkach SVG i w cm dla danej tarczy. */
export function ringScale(targetType?: string): { unit: number; cm: number } {
  const face = resolveTargetFace(targetType);
  if (isSpotFace(targetType)) {
    // Spot 40 cm: pierścienie 6–10 po 2 cm, w SVG po 12.5 (patrz targetScoring).
    return { unit: 12.5, cm: (face.diameterCm || 40) / 20 };
  }
  return { unit: face.scoringRingStep || 15, cm: (face.diameterCm || 122) / 20 };
}

/** Środek spotu z jego id (L0/R1/V2) — pewniejszy niż zgadywanie po pozycji. */
function spotCenter(spotId: string | null | undefined, x: number, y: number, targetType?: string) {
  const m = spotId ? /^([LRV])([012])$/.exec(spotId) : null;
  if (m) {
    const cX = m[1] === 'L' ? 75 : m[1] === 'R' ? 225 : 150;
    return { cX, cY: [66, 200, 333][Number(m[2])] };
  }
  return centerFor(targetType || 'Full', x, y);
}

export function computeArrowStats(sessions: SessionLike[]): ArrowStatsResult | null {
  const used = sessions.filter(s => s.arrowColors && s.ends?.length);
  if (used.length === 0) return null;

  const acc = ARROW_COLORS.map(() => ({ dxs: [] as number[], dys: [] as number[], score: 0, scored: 0, misses: 0 }));

  for (const s of used) {
    const { unit } = ringScale(s.targetType);
    for (const end of s.ends || []) {
      const raw = end.rawArrows;
      // Bez rawArrows nie wiemy, która strzała jest która (`arrows` jest posortowane).
      if (!raw || raw.length === 0) continue;

      raw.forEach((v, i) => {
        if (i >= acc.length) return;
        const val = valueOf(v);
        if (val === null) return;
        acc[i].score += val;
        acc[i].scored++;
        if (v === 'M') acc[i].misses++;
      });

      // Pozycje względem środka TARCZY (spotu), w pierścieniach; M pomijamy —
      // pudło poza tarczą rozwaliłoby środek serii.
      const pts: Array<{ i: number; x: number; y: number }> = [];
      (end.dots || []).forEach((d, i) => {
        if (i >= acc.length || d?.x == null || d?.y == null || raw[i] === 'M') return;
        const { cX, cY } = isSpotFace(s.targetType)
          ? spotCenter(d.spotId, d.x, d.y, s.targetType)
          : { cX: 150, cY: 150 };
        pts.push({ i, x: (d.x - cX) / unit, y: (d.y - cY) / unit });
      });
      // Środek serii z mniej niż 3 strzał to szum, nie grupa.
      if (pts.length < 3) continue;

      for (const p of pts) {
        // Środek grupy BEZ tej strzały i MEDIANĄ, nie średnią — inaczej krzywa
        // strzała ciągnie środek za sobą: jej odchylenie wychodzi mniejsze,
        // a zdrowe strzały dostają pozorne przesunięcie w drugą stronę.
        const others = pts.filter(q => q.i !== p.i);
        const gx = median(others.map(q => q.x));
        const gy = median(others.map(q => q.y));
        acc[p.i].dxs.push(p.x - gx);
        acc[p.i].dys.push(p.y - gy);
      }
    }
  }

  const last = used[used.length - 1];
  const { cm: ringCm } = ringScale(last.targetType);

  const arrows: ArrowStat[] = acc.map((a, index) => {
    const n = a.dxs.length;
    const dx = n ? a.dxs.reduce((x, y) => x + y, 0) / n : 0;
    const dy = n ? a.dys.reduce((x, y) => x + y, 0) / n : 0;
    const spread = n
      ? Math.sqrt(a.dxs.reduce((s, v, k) => s + (v - dx) ** 2 + (a.dys[k] - dy) ** 2, 0) / n)
      : 0;
    const dist = Math.hypot(dx, dy);
    // Średnia ma błąd ~ rozrzut/√n — przesunięcie musi go wyraźnie przebić.
    const confident = n > 1 && dist > 2 * (spread / Math.sqrt(n));
    return {
      index,
      n,
      dx,
      dy,
      dist,
      distCm: dist * ringCm,
      spread,
      avgScore: a.scored ? a.score / a.scored : 0,
      scored: a.scored,
      misses: a.misses,
      suspect: n >= ARROW_MIN_ENDS && dist >= ARROW_SUSPECT_RINGS && confident,
    };
  });

  const withData = arrows.filter(a => a.scored > 0);
  if (withData.length === 0) return null;

  return {
    arrows: withData,
    sessions: used.length,
    minEnds: Math.min(...withData.map(a => a.n)),
    ringCm,
  };
}

/**
 * Kierunek odchylenia jako klucz tłumaczenia (8 stron), y rośnie w dół.
 * Małe odchylenie = „w grupie”.
 */
export function directionKey(dx: number, dy: number): string {
  if (Math.hypot(dx, dy) < 0.15) return 'center';
  const deg = (Math.atan2(-dy, dx) * 180) / Math.PI; // 0 = w prawo, 90 = w górę
  const dirs = ['right', 'upRight', 'up', 'upLeft', 'left', 'downLeft', 'down', 'downRight'];
  const idx = Math.round(((deg + 360) % 360) / 45) % 8;
  return dirs[idx];
}
