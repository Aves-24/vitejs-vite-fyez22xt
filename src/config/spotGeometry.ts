import { resolveTargetFace, type TargetFace } from './targetFaces';

/**
 * [SPOTY 2026-11-09] Jedno źródło geometrii tarcz wielospotowych.
 *
 * Do tej pory środki spotów (75/225 × 66/200/333), promień 62,5 i kolory były
 * wpisane na sztywno w kilku plikach (rysowanie, liczenie, mapa trafień, PDF,
 * Delay Mirror, statystyki strzał). Nowe układy — Vegas (trójkąt) i terenowa
 * 20 cm 3-fach — potrzebują innych kolorów, wartości i pozycji, więc wszystko
 * czyta je stąd. Liczby dla dotychczasowego 3-Spota są DOKŁADNIE te same co
 * wcześniej (pilnują tego testy), żeby nic, co działa, się nie przesunęło.
 *
 * Jednostki: viewBox 300 × 400 (jak dotąd). Arkusz = kartka papieru; strzały
 * 1–3 idą na arkusz 0, 4–6 na arkusz 1 (jedna strzała na spot).
 */

export interface SpotSheet { x: number; y: number; w: number; h: number }
export interface SpotPos { id: string; cx: number; cy: number; sheet: number }
/** Pierścień spotu: promień jako ułamek promienia spotu, kolor, obrys. */
export interface SpotRing { f: number; fill: string; stroke: string }
/** Strefa punktowa: zewnętrzny promień (ułamek) i wartość ('X' albo liczba). */
export interface SpotZone { f: number; value: string }

export interface SpotGeometry {
  sheets: SpotSheet[];
  spots: SpotPos[];
  /** Promień spotu (pierścień o najniższej wartości). */
  r: number;
  rings: SpotRing[];
  /** Od środka na zewnątrz — pierwsza pasująca wygrywa; poza ostatnią = M. */
  zones: SpotZone[];
  /** Ile strzał na arkusz (dalsze idą na kolejny). */
  perSheet: number;
}

const GOLD = '#F2C94C', RED = '#EB5757', BLUE = '#2F80ED', LINE = '#333333'; // 6 znaków — PDF (hexRgb) nie czyta skrótu #333

/** Spot WA 40 cm (6–10 + X) — kolory jak dotąd w SpotTarget. */
export const WA_SPOT_RINGS: SpotRing[] = [
  { f: 1, fill: BLUE, stroke: LINE },
  { f: 0.8, fill: RED, stroke: LINE },
  { f: 0.6, fill: RED, stroke: LINE },
  { f: 0.4, fill: GOLD, stroke: LINE },
  { f: 0.2, fill: GOLD, stroke: LINE },
  { f: 0.1, fill: GOLD, stroke: LINE },
];
/** Punktacja spotu WA: X przy 0,1 r, potem 10…6 co 0,2 r — jak calculateSpotScore. */
export const WA_SPOT_ZONES: SpotZone[] = [
  { f: 0.1, value: 'X' },
  { f: 0.2, value: '10' },
  { f: 0.4, value: '9' },
  { f: 0.6, value: '8' },
  { f: 0.8, value: '7' },
  { f: 1, value: '6' },
];

const COLS = [66, 200, 333];

/** Dwie kartki po trzy spoty w pionie (hala 18 m, dmuchawka). */
export const DOUBLE_COLUMN: Pick<SpotGeometry, 'sheets' | 'spots' | 'r' | 'perSheet'> = {
  sheets: [{ x: 5, y: 0, w: 140, h: 400 }, { x: 155, y: 0, w: 140, h: 400 }],
  spots: [
    ...COLS.map((cy, i) => ({ id: `L${i}`, cx: 75, cy, sheet: 0 })),
    ...COLS.map((cy, i) => ({ id: `R${i}`, cx: 225, cy, sheet: 1 })),
  ],
  r: 62.5,
  perSheet: 3,
};

/** Jedna kartka, trzy spoty w pionie. */
export const SINGLE_COLUMN: Pick<SpotGeometry, 'sheets' | 'spots' | 'r' | 'perSheet'> = {
  sheets: [{ x: 75, y: 0, w: 150, h: 400 }],
  spots: COLS.map((cy, i) => ({ id: `V${i}`, cx: 150, cy, sheet: 0 })),
  r: 62.5,
  perSheet: 6,
};

/**
 * Definicja spotów niesiona przez tarczę (pole `spot` w TargetFace). Brak =
 * klasyczny spot WA w układzie z `layout`.
 */
export interface FaceSpotSpec {
  arrangement?: Pick<SpotGeometry, 'sheets' | 'spots' | 'r' | 'perSheet'>;
  rings?: SpotRing[];
  zones?: SpotZone[];
}

export function spotGeometryOfFace(face: TargetFace): SpotGeometry | null {
  const spec = (face as TargetFace & { spot?: FaceSpotSpec }).spot;
  const base = spec?.arrangement
    ?? (face.layout === 'spot3-double' ? DOUBLE_COLUMN : face.layout === 'spot3-single' ? SINGLE_COLUMN : null);
  if (!base) return null;
  return { ...base, rings: spec?.rings ?? WA_SPOT_RINGS, zones: spec?.zones ?? WA_SPOT_ZONES };
}

export function spotGeometryOf(targetType?: string | null): SpotGeometry | null {
  return spotGeometryOfFace(resolveTargetFace(targetType));
}

/** Arkusz, na który idzie strzała nr `index` (0-based) w serii. */
export const sheetForArrow = (g: SpotGeometry, index: number) =>
  Math.min(g.sheets.length - 1, Math.floor(index / g.perSheet));

/** Środek spotu po id (L0/R1/V2/…) albo null. */
export const spotById = (g: SpotGeometry, id?: string | null) => (id ? g.spots.find(s => s.id === id) ?? null : null);

/** Najbliższy spot do punktu (opcjonalnie tylko z danego arkusza). */
export function nearestSpot(g: SpotGeometry, x: number, y: number, sheet?: number): SpotPos {
  const pool = sheet === undefined ? g.spots : g.spots.filter(s => s.sheet === sheet);
  return pool.reduce((p, n) => (Math.hypot(x - n.cx, y - n.cy) < Math.hypot(x - p.cx, y - p.cy) ? n : p));
}

/**
 * Kliknięcie → wartość i id spotu. `sheet` = aktywny arkusz (punkt poza nim to
 * M, jak dotychczasowa „blokada Vegas”). `touch` — muśnięcie linii liczy wyżej.
 */
export function scoreSpot(g: SpotGeometry, x: number, y: number, sheet: number | null, touch = 0): { val: string; sId: string } {
  if (sheet !== null) {
    const s = g.sheets[sheet];
    if (s && (x < s.x || x > s.x + s.w || y < s.y || y > s.y + s.h)) return { val: 'M', sId: '' };
  }
  const spot = nearestSpot(g, x, y, sheet ?? undefined);
  const d = Math.max(0, Math.hypot(x - spot.cx, y - spot.cy) - touch);
  const zone = g.zones.find(z => d <= z.f * g.r);
  return zone ? { val: zone.value, sId: spot.id } : { val: 'M', sId: '' };
}

/** Kadr wokół arkusza (pełny ekran pokazuje tylko kartkę, w którą strzelamy). */
export function sheetViewBox(g: SpotGeometry, sheet: number, pad = 10): string {
  const s = g.sheets[sheet] ?? g.sheets[0];
  return `${s.x - pad} ${s.y - pad} ${s.w + 2 * pad} ${s.h + 2 * pad}`;
}
