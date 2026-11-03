import { resolveTargetFace } from '../config/targetFaces';
import { scoreSingleFace, calculateSpotScore } from './targetScoring';

/**
 * [SCHREIBER-TRAINING] Gra edukacyjna: szybkie liczenie w głowie serii
 * z tarczy, jak na zawodach (pomysł usera 2026-11-01 — dorośli na turniejach
 * mylą się przy dodawaniu). Wszystko lokalne: zawodnicy są symulowani,
 * nie ma sieci ani Firestore.
 *
 * Na jednej tarczy strzela 1–4 zawodników (A–D, jak pozycje na stanowisku) —
 * ich strzały mieszają się, gracz rozpoznaje swoje po kształcie i kolorze
 * i podaje sumę serii albo nową sumę narastającą.
 *
 * Punkty liczą `scoreSingleFace` / `calculateSpotScore`, te same funkcje co
 * przy wpisywaniu treningu, więc gra nie może liczyć inaczej niż aplikacja.
 */

/** „Gemischt” = każdy zawodnik losuje swój poziom (Einsteiger/Verein/Kader). */
export type SchreiberLevel = 'beginner' | 'club' | 'mixed';
/** Pełna tarcza (40/60/80/122 rysują się tak samo), 6-Ring, pionowy 3-Spot. */
export type SchreiberTarget = 'full' | 'six' | 'spot3';

export const SCHREIBER_FACE_ID: Record<SchreiberTarget, string> = {
  full: '122cm',
  six: '80cm (6-Ring)',
  spot3: 'Vertical 3-Spot',
};

export interface SchreiberArrow {
  x: number;
  y: number;
  /** 'X' | '10'..'1' | 'M' — jak w zapisie treningu. */
  value: string;
  points: number;
  /** Indeks zawodnika 0..3 (A..D). */
  shooter: number;
}

export interface ShooterProfile {
  /** Rozrzut (odchylenie standardowe) w jednostkach pełnej tarczy 300x300. */
  sigma: number;
  /** Stałe przesunięcie grupy — każdy ma „swoją” stronę tarczy. */
  dx: number;
  dy: number;
}

export interface SchreiberEnd {
  arrows: SchreiberArrow[];
  /** Suma serii dla każdego zawodnika. */
  sums: number[];
}

export type Rand = () => number;

/** Pudło musi jeszcze zmieścić się na macie wokół tarczy (viewBox z zapasem). */
export const MAT_RADIUS = 172;

/** 3-Spot: środki spotów w pionowym układzie (viewBox 300x400). */
export const SPOT_CENTERS = [66, 200, 333].map(cy => ({ x: 150, y: cy }));
const SPOT_STEP = 12.5;
/** Dalej niż tyle od swojego spotu strzała wpadałaby w sąsiedni — losujemy jeszcze raz. */
const SPOT_LIMIT = 66;

/** Środek strzały nie bliżej linii niż tyle — bez sporów „liner czy nie”. */
const LINE_MARGIN = 3;
/** Minimalny odstęp między strzałami, żeby znaczki dało się odróżnić. */
const MIN_GAP = 11;

const LEVEL_SIGMA = {
  beginner: 42,
  club: 27,
  elite: 16,
} as const;
const MIXED_POOL = ['beginner', 'club', 'elite'] as const;

export const arrowPoints = (value: string): number =>
  value === 'X' ? 10 : value === 'M' ? 0 : Number(value) || 0;

/** Ziarnisty generator (testy, powtarzalne serie). */
export const seededRand = (seed: number): Rand => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const gauss = (rand: Rand): number => {
  const u = Math.max(rand(), 1e-9);
  const v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};

const shuffle = <T,>(list: T[], rand: Rand): T[] => {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

/** Każdy zawodnik trochę inny: rozrzut ±25 % poziomu i własne przesunięcie. */
export const createShooterProfiles = (count: number, level: SchreiberLevel, rand: Rand): ShooterProfile[] =>
  Array.from({ length: count }, () => {
    const base = level === 'mixed' ? MIXED_POOL[Math.floor(rand() * MIXED_POOL.length)] : level;
    const sigma = LEVEL_SIGMA[base] * (0.8 + rand() * 0.45);
    const angle = rand() * 2 * Math.PI;
    const shift = sigma * 0.35 * rand();
    return { sigma, dx: Math.cos(angle) * shift, dy: Math.sin(angle) * shift };
  });

/**
 * Wszystkie linie pierścieni, także X — gracz wpisuje X osobno od 10, więc
 * strzała na linii X też byłaby sporna. Pełna tarcza 7.5..150, 6-Ring
 * 7.5..90, spot 6.25..62.5.
 */
const lineRadii = (target: SchreiberTarget): number[] => {
  if (target === 'spot3') return [SPOT_STEP / 2, ...[1, 2, 3, 4, 5].map(k => k * SPOT_STEP)];
  return resolveTargetFace(SCHREIBER_FACE_ID[target]).rings.map(r => r.r);
};

/** Za blisko linii pierścienia (także krawędzi tarczy) — losujemy jeszcze raz. */
export const isNearLine = (x: number, y: number, target: SchreiberTarget = 'full'): boolean => {
  const centers = target === 'spot3' ? SPOT_CENTERS : [{ x: 150, y: 150 }];
  const radii = lineRadii(target);
  return centers.some(c => {
    const d = Math.hypot(x - c.x, y - c.y);
    return radii.some(r => Math.abs(d - r) < LINE_MARGIN);
  });
};

export const scoreArrow = (x: number, y: number, target: SchreiberTarget): string =>
  target === 'spot3'
    ? calculateSpotScore(x, y, true, false).val
    : scoreSingleFace(resolveTargetFace(SCHREIBER_FACE_ID[target]), x, y).val;

/** 3-Spot: jedna strzała na spot, więc zawsze 3 na zawodnika. */
export const arrowsFor = (target: SchreiberTarget, arrows: number): number =>
  target === 'spot3' ? 3 : arrows;

/**
 * Jedna seria: `arrowsPerShooter` strzał każdego zawodnika na wspólnej
 * tarczy. Strzały na linii i nachodzące na siebie są losowane ponownie.
 * Na 3-Spocie każdy zawodnik strzela po jednej strzale w każdy spot,
 * w losowej kolejności.
 */
export const generateEnd = (
  profiles: ShooterProfile[],
  arrowsPerShooter: number,
  rand: Rand,
  target: SchreiberTarget = 'full',
): SchreiberEnd => {
  const arrows: SchreiberArrow[] = [];
  const isSpot = target === 'spot3';
  // Spot ma pierścienie co 12.5 zamiast 15 — rozrzut skalujemy tak samo.
  const scale = isSpot ? SPOT_STEP / 15 : 1;
  const count = arrowsFor(target, arrowsPerShooter);

  profiles.forEach((p, shooter) => {
    const aims = isSpot ? shuffle(SPOT_CENTERS, rand) : Array.from({ length: count }, () => ({ x: 150, y: 150 }));
    for (let i = 0; i < count; i++) {
      const aim = aims[i];
      let x = aim.x;
      let y = aim.y;
      for (let attempt = 0; attempt < 200; attempt++) {
        x = aim.x + (p.dx + gauss(rand) * p.sigma) * scale;
        y = aim.y + (p.dy + gauss(rand) * p.sigma) * scale;
        const d = Math.hypot(x - aim.x, y - aim.y);
        if (d > (isSpot ? SPOT_LIMIT : MAT_RADIUS)) continue;
        if (isNearLine(x, y, target)) continue;
        if (arrows.some(a => Math.hypot(a.x - x, a.y - y) < MIN_GAP)) continue;
        break;
      }
      const value = scoreArrow(x, y, target);
      arrows.push({ x, y, value, points: arrowPoints(value), shooter });
    }
  });
  const sums = profiles.map((_, s) =>
    arrows.filter(a => a.shooter === s).reduce((acc, a) => acc + a.points, 0),
  );
  return { arrows, sums };
};

/** Kolejność jak na kartce: od najwyższej, X przed 10, pudło na końcu. */
export const sortedValues = (arrows: SchreiberArrow[]): string[] =>
  [...arrows]
    .sort((a, b) => b.points - a.points || (a.value === 'X' ? -1 : b.value === 'X' ? 1 : 0))
    .map(a => a.value);

/** Komórki sum w wierszu arkusza (kolejność wpisywania). */
export type SumCell = 't1' | 't2' | 'sum' | 'carry';

/** 6 strzał: suma 1–3, suma 4–6, Summe, Übertrag. 3 strzały: Summe, Übertrag. */
export const sumCellsFor = (arrowsPerShooter: number): SumCell[] =>
  arrowsPerShooter === 6 ? ['t1', 't2', 'sum', 'carry'] : ['sum', 'carry'];

export interface SheetRow {
  /** Wartości jak na kartce: od najwyższej. */
  values: string[];
  cells: Record<SumCell, number>;
}

/**
 * Prawidłowy wiersz arkusza dla zawodnika po serii `endIndex`. Übertrag liczy
 * się z PRAWIDŁOWYCH sum — błąd gracza w jednej serii nie psuje kolejnych.
 */
export const expectedRow = (ends: SchreiberEnd[], endIndex: number, shooter: number): SheetRow => {
  const values = sortedValues(ends[endIndex].arrows.filter(a => a.shooter === shooter));
  const pts = values.map(arrowPoints);
  const sumOf = (list: number[]) => list.reduce((acc, p) => acc + p, 0);
  let carry = 0;
  for (let i = 0; i <= endIndex; i++) carry += ends[i].sums[shooter];
  return {
    values,
    cells: { t1: sumOf(pts.slice(0, 3)), t2: sumOf(pts.slice(3, 6)), sum: sumOf(pts), carry },
  };
};

/** Czy gracz odczytał te same strzały (kolejność dowolna, X ≠ 10). */
export const sameArrowSet = (entered: string[], actual: string[]): boolean => {
  if (entered.length !== actual.length) return false;
  const key = (list: string[]) => [...list].sort().join(',');
  return key(entered) === key(actual);
};

export interface SchreiberAnswer {
  kind: 'arrows' | 'sum';
  correct: boolean;
  ms: number;
}

export interface SchreiberResult {
  correct: number;
  total: number;
  totalMs: number;
  /** Średni czas na jeden wiersz arkusza (zawodnik × seria). */
  avgMs: number;
}

export const summarizeGame = (answers: SchreiberAnswer[], rows: number): SchreiberResult => {
  const totalMs = answers.reduce((acc, a) => acc + a.ms, 0);
  return {
    correct: answers.filter(a => a.correct).length,
    total: answers.length,
    totalMs,
    avgMs: rows > 0 ? Math.round(totalMs / rows) : 0,
  };
};

/** Lepszy wynik = więcej dobrych sum; przy remisie szybszy średni czas. */
export const isBetterResult = (next: SchreiberResult, best: SchreiberResult | null | undefined): boolean => {
  // Pierwszy rekord dopiero z co najmniej jedną dobrą sumą — „rekord 0/5” nic nie mówi.
  if (!best) return next.correct > 0;
  if (next.correct !== best.correct) return next.correct > best.correct;
  return next.avgMs < best.avgMs;
};

export interface ShooterStanding {
  shooter: number;
  total: number;
  /** Dziesiątki razem z X — pierwsze kryterium przy remisie (WA/DSB). */
  tens: number;
  xs: number;
  /** Miejsce 1..n; przy pełnym remisie (suma, 10, X) to samo miejsce. */
  place: number;
}

/** Klasyfikacja końcowa: suma, potem liczba 10 (z X), potem liczba X. */
export const standings = (ends: SchreiberEnd[], shooters: number): ShooterStanding[] => {
  const rows = Array.from({ length: shooters }, (_, shooter) => {
    const arrows = ends.flatMap(e => e.arrows.filter(a => a.shooter === shooter));
    return {
      shooter,
      total: arrows.reduce((acc, a) => acc + a.points, 0),
      tens: arrows.filter(a => a.points === 10).length,
      xs: arrows.filter(a => a.value === 'X').length,
      place: 0,
    };
  });
  const cmp = (a: ShooterStanding, b: ShooterStanding) => b.total - a.total || b.tens - a.tens || b.xs - a.xs;
  rows.sort((a, b) => cmp(a, b) || a.shooter - b.shooter);
  rows.forEach((r, i) => { r.place = i > 0 && cmp(rows[i - 1], r) === 0 ? rows[i - 1].place : i + 1; });
  return rows;
};

export interface SchreiberConfig {
  target: SchreiberTarget;
  shooters: number;
  arrows: number;
  level: SchreiberLevel;
  ends: number;
}

/** Klucz rekordu — rekord liczy się osobno dla każdego ustawienia gry. */
export const configKey = (c: SchreiberConfig): string =>
  `${c.target}-${c.shooters}-${arrowsFor(c.target, c.arrows)}-${c.level}-${c.ends}`;
