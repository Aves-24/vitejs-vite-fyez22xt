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
// [DMUCHAWKA] Nowe rodziny tarcz mieszkają w `./targets/*` i są tu tylko
// rejestrowane — patrz komentarz przy `BLOWGUN_FACE` w `TARGET_FACES`.
import { BLOWGUN_FACE } from './targets/blowgun';
import { BLOWGUN357_FACE } from './targets/blowgun357';
import { BLOWGUN40_FACE } from './targets/blowgun40';
import { WA_FIELD_80_FACE, WA_FIELD_60_FACE, WA_FIELD_40_FACE } from './targets/waField';
import { WA_FIELD20_FACE } from './targets/waField20Triple';
import { VEGAS_FACE } from './targets/vegas';
import { IFAA_FIELD_FACES, IFAA_INDOOR_FACE, IFAA_INDOOR5_FACE } from './targets/ifaa';
import { IFAA_EXPERT_FACES } from './targets/ifaaExpert';
import { IFAA_ANIMAL_FACE } from './targets/ifaaAnimal';
import { DBSV_WALD_FACE, DBSV_JAGD_FACE } from './targets/dbsv3d';
import { IFAA_3D_HUNTING_FACE, IFAA_3D_STANDARD_FACE } from './targets/ifaa3d';
import { WA_3D_FACE } from './targets/wa3d';
import type { FaceSpotSpec } from './spotGeometry';
// `isBlowgun` mieszka w equipmentSetups (czysty config bez zaleznosci), wiec
// ten import NIE tworzy cyklu — tamten plik nie wie o tarczach.
import { isBlowgun } from './equipmentSetups';

export type TargetLayout =
  | 'single'       // jedna tarcza koncentryczna, viewBox 300x300
  | 'spot3-double' // dwie kolumny po 3 spoty, viewBox 300x400
  | 'spot3-single' // jedna kolumna 3 spotów, viewBox 300x400
  | 'spots'        // [SPOTY] własna geometria z pola `spot` (Vegas, IFAA 4-Spot/5-Spot), viewBox 300x400
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
  /**
   * Jawny opis stref punktowych — od środka na zewnątrz, `r` to promień
   * ZEWNĘTRZNY strefy w viewBoxie 300x300.
   *
   * Potrzebne dla tarcz, których punktacji NIE da się wyliczyć wzorem
   * `10 - floor(d / krok)`: dmuchawkowa 3-5-7 ma trzy strefy o nierównych
   * wartościach, a tarcze IFAA Field (T1) mają 5-4-3. Gdy pole jest obecne,
   * `TargetInput` liczy z niego i ignoruje `scoringRingStep`/`minScoringRing`.
   */
  zones?: readonly { r: number; value: number }[];
  /**
   * Dyscyplina, do której należy tarcza. Brak = łucznictwo.
   *
   * Zastąpiło porównanie po `id` — filtr listy tarcz znał wcześniej DOKŁADNIE
   * JEDNĄ tarczę dmuchawki, więc druga pokazałaby się łucznikowi zamiast
   * dmuchawkarzowi. Teraz dodanie kolejnej to wpis z tym tagiem i nic więcej.
   */
  discipline?: 'blowgun';
  /**
   * [FELD 2026-11-09] Osobny świat statystyk. Tarcze terenowe WA punktują 6–1,
   * więc ich treningi nie mieszają się z formą, strefami i rangą tarcz WA —
   * liczą się we własnej skali (`config/statsGroups.ts`). Brak = tarcza WA.
   * Takie tarcze pokazujemy wyłącznie przy zestawie ustawionym na „Feld”.
   */
  statsGroup?: 'field' | 'ifaa' | 'animal';
  /**
   * [SPOTY 2026-11-09] Własny układ/kolory/strefy spotów (Vegas, teren 20 cm).
   * Brak = klasyczny spot WA w układzie z `layout`. Patrz `config/spotGeometry.ts`.
   */
  spot?: FaceSpotSpec;
  /**
   * [KOLORY KLAWISZY] Kolor przycisku/pola dla wartości, gdy inny niż na
   * tarczy WA (teren: 5 żółte; IFAA: 5 czarny/biały…). Patrz config/arrowKeyColors.
   */
  keyColors?: Record<string, 'gold' | 'red' | 'blue' | 'black' | 'white'>;
  /**
   * [IFAA] Format jak na zawodach: strzały w serii i liczba serii. Brak = 6 × 12.
   * IFAA Field/Hunter: 4 strzały na tarczę; Indoor: serie po 5.
   */
  round?: { arrowsPerEnd: number; ends: number };
  /**
   * [LICZNIK X] Promień X-ringu (viewBox 300) na tarczach ze strefami — X liczy
   * się jak strefa środkowa (IFAA: 5) i osobno do remisów. Dla tarcz wielospotowych
   * X idzie ze `spot.zones` (wartość 'X'); tu wystarczy > 0, żeby klawiatura miała X.
   */
  xRing?: number;
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
  // [DMUCHAWKA] Definicja mieszka w osobnym pliku — tutaj tylko rejestracja.
  // Nowa tarcza nie dotyka geometrii tarcz już przestrzelanych.
  BLOWGUN_FACE,
  // [DMUCHAWKA] Druga rodzina tarcz do rury (3-5-7). Nie ma jeszcze pickOrder,
  // wiec jest obslugiwana, ale nieproponowana — czeka na potwierdzenie wymiarow.
  BLOWGUN357_FACE,
  // [DMUCHAWKA] Pełna 40 cm jak łucznicza, ale z tagiem dmuchawki (2026-09-11).
  BLOWGUN40_FACE,
  // [FELD] Tarcze terenowe WA — definicje w targets/waField.ts.
  WA_FIELD_80_FACE,
  WA_FIELD_60_FACE,
  WA_FIELD_40_FACE,
  // [FELD] 20 cm 3-fach — targets/waField20Triple.ts.
  WA_FIELD20_FACE,
  // [VEGAS] 3×20 cm w trójkącie — targets/vegas.ts.
  VEGAS_FACE,
  // [IFAA] Field/Hunter 20–65 cm, Indoor 40 cm i 5-Spot — targets/ifaa.ts.
  ...IFAA_FIELD_FACES,
  IFAA_INDOOR_FACE,
  IFAA_INDOOR5_FACE,
  // [IFAA EXPERT] Field z liniami pośrednimi, 5–1 — targets/ifaaExpert.ts.
  ...IFAA_EXPERT_FACES,
  // [ANIMAL ROUND] Zwierzę: Kill/Wound/Miss, bez geometrii — targets/ifaaAnimal.ts.
  IFAA_ANIMAL_FACE,
  // [DBSV 3D] Wald- (3 strzały) i Jagdrunde (1 strzała), Kill/Körper — targets/dbsv3d.ts.
  DBSV_WALD_FACE,
  DBSV_JAGD_FACE,
  // [IFAA 3D] Hunting (1 strzała) i Standard (2 strzały), Kill/Vital/Wound — targets/ifaa3d.ts.
  IFAA_3D_HUNTING_FACE,
  IFAA_3D_STANDARD_FACE,
  // [WA 3D] 2 strzały, 11/10/8/5 (też PZŁucz, DSB) — targets/wa3d.ts.
  WA_3D_FACE,
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
  return l === 'spot3-double' || l === 'spot3-single' || l === 'spots';
}

/**
 * Klawisze punktów dla klawiatury treningu — tylko wartości, które na tej
 * tarczy da się trafić (bez 'M', który klawiatura dokłada zawsze).
 * Wcześniej klawiatura miała zawsze X i 10..1, więc na 3-Spocie (6–10)
 * można było wpisać 3 (user 2026-11-05).
 *  - strefy jawne (dmuchawka 3-5-7): dokładnie ich wartości, bez X,
 *  - 3-spot: najniżej 6 (WA), także gdy katalog ma domyślne minScoringRing,
 *  - reszta: X i 10..minScoringRing.
 */
export function keypadValuesFor(raw?: string | null): string[] {
  const face = resolveTargetFace(raw);
  if (face.zones?.length) {
    const vals = [...face.zones].map(z => z.value).sort((a, b) => b - a).map(String);
    return face.xRing ? ['X', ...vals] : vals;
  }
  const isSpot = face.layout === 'spot3-double' || face.layout === 'spot3-single' || face.layout === 'spots';
  const min = Math.max(1, isSpot ? Math.max(6, face.minScoringRing) : face.minScoringRing);
  const values = ['X'];
  for (let v = 10; v >= min; v--) values.push(String(v));
  return values;
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

/**
 * [DMUCHAWKA] Tarcze pasujące do dyscypliny aktywnego zestawu.
 *
 * Do 2026-09-04 lista była wspólna, co psuło się w OBIE strony:
 *  - łucznik mógł wybrać „Blowgun 20cm" i jego sesja po cichu wypadała
 *    z handicapu oraz z rangi (fallback po tarczy w `isBlowgunSession`),
 *  - dmuchawkarz widział siedem tarcz łuczniczych, z których żadnej
 *    nie używa.
 *
 * Gdy dyscyplina jest nieznana (sesja bez zestawu, konto sprzed zestawów),
 * pokazujemy wszystko — lepiej dać za dużo niż zablokować komuś wybór.
 */
export function selectableTargetIdsFor(discipline?: string | null, style?: string | null): string[] {
  // [FELD/IFAA] Tarcze terenowe/IFAA tylko przy zestawie o tym stylu, a przy nim WYŁĄCZNIE one.
  const want = style === 'field' || style === 'ifaa' ? style : undefined;
  if (!discipline) {
    return selectableTargetIds().filter(id => findTargetFace(id)?.statsGroup === want);
  }
  const wantBlowgun = isBlowgun(discipline);
  return TARGET_FACES
    .filter(f => f.scorable && f.pickOrder !== undefined)
    .filter(f => (f.discipline === 'blowgun') === wantBlowgun)
    .filter(f => wantBlowgun || f.statsGroup === want)
    .sort((a, b) => (a.pickOrder as number) - (b.pickOrder as number))
    .map(f => f.id);
}
