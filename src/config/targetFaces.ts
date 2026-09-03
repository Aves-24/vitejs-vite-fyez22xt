/**
 * [KATALOG TARCZ] Jedno źródło prawdy o tarczach.
 *
 * Wcześniej typ tarczy był luźnym stringiem porównywanym przez `===` w
 * kilkunastu plikach, a geometria i punktacja siedziały wpisane na sztywno
 * w SVG. Efektem były cztery błędy: tarcza 80cm 6-Ring nigdy nie rysowała
 * się jako 6-ring (konsumenci sprawdzali `'WA 80cm (6-Ring)'`, którego nikt
 * nie zapisywał), ta sama tarcza w widoku sesji spadała do gałęzi `else`
 * i wyświetlała się jako pionowy 3-spot, opcja `'Field'` prowadziła donikąd,
 * a handicap liczył tarczę 122cm jako 80cm.
 *
 * Dodanie nowej tarczy = JEDEN wpis w TARGET_FACES (+ ewentualnie kształt
 * pierścieni). Nie dotykamy już porównań w widokach.
 *
 * `id` jest jednocześnie wartością zapisywaną w Firestore i etykietą w UI —
 * dzięki temu `friendlyTargetName()` to zwykłe rozwiązanie aliasu.
 */

/** Jak tarcza jest rozłożona na ekranie. */
export type TargetLayout =
  | 'single'       // jedna tarcza koncentryczna, viewBox 300x300
  | 'spot3-double' // dwie kolumny po 3 spoty, viewBox 300x400
  | 'spot3-single' // jedna kolumna 3 spotów, viewBox 300x400
  | 'none';        // sesja bez tarczy (trening techniczny)

export interface TargetRing {
  /** Promień w jednostkach viewBoxa 300x300. */
  r: number;
  fill: string;
  /** Kolor obrysu — na ciemnych pierścieniach biały, żeby linia była widoczna. */
  stroke: string;
}

export interface TargetFace {
  /** Kanoniczny identyfikator = wartość w Firestore = etykieta w UI. */
  id: string;
  layout: TargetLayout;
  /** Fizyczna średnica w cm — używana przez handicapEngine. */
  diameterCm: number;
  /**
   * Szerokość pierścienia przy przeliczaniu kliknięcia na punkty (layout
   * 'single'). MUSI zgadzać się z geometrią `rings` — pierścienie są rysowane
   * w viewBoxie 300x300 co 15, więc 15 jest jedyną poprawną wartością dla
   * pełnej tarczy. 40cm miało tu 12.5 (błąd sprzed katalogu, naprawiony
   * 2026-09-03): skrajny pierścień punktował się jako pudło, X liczył się przy
   * r=6.25 zamiast 7.5, a wszystkie granice były przesunięte względem rysunku.
   */
  scoringRingStep: number;
  /** Najniższy punktowany pierścień; poniżej = pudło. 6-Ring punktuje 10..5. */
  minScoringRing: number;
  /** Kształt do narysowania (layout 'single'). */
  rings: readonly TargetRing[];
  /** Stare stringi z Firestore, które muszą dalej działać. */
  aliases: readonly string[];
  /** Czy w ogóle się na nią strzela (trening techniczny — nie). */
  scorable: boolean;
  /**
   * Pozycja na liście wyboru tarczy. Brak = tarcza jest obsługiwana (stare
   * sesje, tryb Battle), ale nie proponujemy jej przy starcie treningu.
   */
  pickOrder?: number;
}

/** Pełna tarcza WA: 10 pierścieni + X. Promienie w viewBoxie 300x300. */
const FULL_RINGS: readonly TargetRing[] = [
  { r: 150,  fill: '#ffffff', stroke: '#333333' },
  { r: 135,  fill: '#ffffff', stroke: '#333333' },
  { r: 120,  fill: '#333333', stroke: '#ffffff' },
  { r: 105,  fill: '#333333', stroke: '#ffffff' },
  { r: 90,   fill: '#2F80ED', stroke: '#333333' },
  { r: 75,   fill: '#2F80ED', stroke: '#333333' },
  { r: 60,   fill: '#EB5757', stroke: '#333333' },
  { r: 45,   fill: '#EB5757', stroke: '#333333' },
  { r: 30,   fill: '#F2C94C', stroke: '#333333' },
  { r: 15,   fill: '#F2C94C', stroke: '#333333' },
  { r: 7.5,  fill: '#F2C94C', stroke: '#333333' },
];

/** Tarcza 6-Ring (compound plener) — te same pierścienie bez czterech zewnętrznych. */
const SIX_RINGS: readonly TargetRing[] = FULL_RINGS.slice(4);

const face = (
  id: string,
  diameterCm: number,
  extra: Partial<TargetFace> = {},
): TargetFace => ({
  id,
  layout: 'single',
  diameterCm,
  scoringRingStep: 15,
  minScoringRing: 1,
  rings: FULL_RINGS,
  aliases: [],
  scorable: true,
  ...extra,
});

export const TARGET_FACES: readonly TargetFace[] = [
  face('122cm', 122, { aliases: ['Full'], pickOrder: 6 }),
  face('80cm', 80, { aliases: ['WA 80cm'], pickOrder: 5 }),
  face('80cm (6-Ring)', 80, {
    aliases: ['WA 80cm (6-Ring)'],
    minScoringRing: 5,
    rings: SIX_RINGS,
    pickOrder: 4,
  }),
  face('60cm', 60, { pickOrder: 3 }),
  face('40cm', 40, { pickOrder: 2 }),
  face('3-Spot', 40, { layout: 'spot3-double', pickOrder: 1 }),
  // Obsługiwana (stare sesje, Battle), ale nie na liście wyboru — tak było
  // przed katalogiem i nie zmieniamy tego przy okazji refaktoru.
  face('Vertical 3-Spot', 40, {
    layout: 'spot3-single',
    aliases: ['3-Spot (Vertical)'],
  }),
  face('TECHNICAL', 0, { layout: 'none', scorable: false }),
];

/** Tarcza domyślna — używana, gdy sesja nie ma typu albo string jest nieznany. */
export const DEFAULT_TARGET_FACE = TARGET_FACES[0]; // 122cm

const BY_KEY = new Map<string, TargetFace>();
for (const f of TARGET_FACES) {
  BY_KEY.set(f.id, f);
  for (const alias of f.aliases) BY_KEY.set(alias, f);
}

/** Zwraca definicję tarczy albo null, jeśli string jest nieznany. */
export function findTargetFace(raw?: string | null): TargetFace | null {
  if (!raw) return null;
  return BY_KEY.get(raw) ?? null;
}

/** Jak wyżej, ale zawsze zwraca definicję — nieznane wpada na 122cm. */
export function resolveTargetFace(raw?: string | null): TargetFace {
  return findTargetFace(raw) ?? DEFAULT_TARGET_FACE;
}

/** Etykieta do UI: kanoniczne id (rozwiązuje aliasy typu 'Full' → '122cm'). */
export function friendlyTargetName(raw?: string | null, fallback = ''): string {
  if (!raw) return fallback;
  return findTargetFace(raw)?.id ?? raw;
}

/** Jedna tarcza koncentryczna (nie spot). */
export function isFullFace(raw?: string | null): boolean {
  return resolveTargetFace(raw).layout === 'single';
}

/** Dowolny 3-spot — pionowy albo dwukolumnowy. */
export function isSpotFace(raw?: string | null): boolean {
  const l = resolveTargetFace(raw).layout;
  return l === 'spot3-double' || l === 'spot3-single';
}

/** 3-spot w jednej kolumnie. */
export function isVerticalSpotFace(raw?: string | null): boolean {
  return resolveTargetFace(raw).layout === 'spot3-single';
}

/** 3-spot w dwóch kolumnach. */
export function isDoubleSpotFace(raw?: string | null): boolean {
  return resolveTargetFace(raw).layout === 'spot3-double';
}

/** Fizyczna średnica w cm — dla normalizacji handicapu. */
export function getTargetDiameterCm(raw?: string | null): number {
  const face = resolveTargetFace(raw);
  // Sesje bez tarczy (trening techniczny) mają diameterCm = 0 — zgodnie z prawdą,
  // ale handicap dzieli przez tę wartość. Nie wypuszczamy stąd zera.
  return face.scorable ? face.diameterCm : DEFAULT_TARGET_FACE.diameterCm;
}

/** Identyfikatory tarcz oferowanych użytkownikowi, w kolejności wyświetlania. */
export function selectableTargetIds(): string[] {
  return TARGET_FACES
    .filter(f => f.scorable && f.pickOrder !== undefined)
    .sort((a, b) => (a.pickOrder as number) - (b.pickOrder as number))
    .map(f => f.id);
}
