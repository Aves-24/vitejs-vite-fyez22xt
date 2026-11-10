import { IFAA_ANIMAL_FACE_ID } from './targets/ifaaAnimal';
import { DBSV_WALD_FACE_ID, DBSV_JAGD_FACE_ID } from './targets/dbsv3d';
import { IFAA_3D_HUNTING_FACE_ID, IFAA_3D_STANDARD_FACE_ID } from './targets/ifaa3d';
import { WA_3D_FACE_ID } from './targets/wa3d';

/**
 * [ANIMAL ROUND 2026-11-10] Rundy zwierzęce (2D i 3D) — IFAA i DBSV.
 *
 * Każdy format to osobna „tarcza” w config/targets, więc format jest zapisany
 * w sesji jako targetType. Wpisuje się strefą (Kill / Vital / Wound|Körper /
 * Miss), punkty wynikają z formatu i NUMERU strzały:
 *
 *  - IFAA Animal Round — do 3 strzał, pierwsze trafienie kończy:
 *    Kill 20/16/12, Wound 18/14/10.
 *  - IFAA 3D Hunting Round — 1 strzała: Kill 20, Vital 16, Wound 10.
 *  - IFAA 3D Standard Round — 2 strzały (dwa kołki), liczą się OBIE:
 *    Kill 10, Vital 8, Wound 5.
 *    Źródło IFAA: Archers' Handbook 2021 („A maximum of three shots is allowed,
 *    but an archer shoots only until a hit is made.”; 3-D Hunting „Only one
 *    arrow is shot”; 3-D Standard „Both arrows are counted for score.”).
 *  - World Archery 3D (też PZŁucz w Polsce i DSB w Niemczech) — 2 strzały,
 *    liczą się obie: 11 (małe koło w środku dziesiątki) / 10 / 8 (Vital) / 5
 *    (reszta ciała). Źródło: WA Book 4 (2026-09-14) 20.3.1 „In 3D, two arrows
 *    per target will be shot in all rounds.”, Book 2 8.2.2.1 (strefy 11/10/8/5).
 *  - DBSV 3D-Waldrunde — do 3 strzał, pierwsze trafienie kończy:
 *    Kill 15/10/5, Körper 12/7/2.
 *  - DBSV 3D-Jagdrunde — 1 strzała: Kill 15, Körper 12.
 *    Źródło DBSV: WKO Teil 10 (Stand 2026-1); Teil 9 (2023-2) miał jeszcze
 *    wyjątek czerwonego kołka (Kill tylko w najmniejszej strefie).
 *
 * Zapis jak każda seria: `arrows` = strzały w kolejności (np. ['M', '16']).
 * Wartości różnych formatów się nakładają (12 = Kill w IFAA, Körper w DBSV),
 * dlatego strefę czytamy z formatu i numeru strzały (`hitOf`), nie z samej
 * wartości. W obrębie jednego formatu wartość danej strzały jest jednoznaczna.
 */
export const ANIMAL_DISTANCE = 'Animal';
export const ANIMAL_DISTANCE_ID = 'd_animal';
export const ANIMAL_STATIONS = 28;
export const ANIMAL_MAX_ARROWS = 3;

export const isAnimalRound = (s?: { distance?: string | null } | null): boolean => s?.distance === ANIMAL_DISTANCE;

/** Strefa trafienia: X (11 w WA 3D), Kill, Vital (3D), Wound/Körper (reszta). */
export type AnimalHit = 'X' | 'K' | 'V' | 'W';

export interface AnimalZone {
  hit: AnimalHit;
  /** Klucz i18n nazwy strefy. */
  key: 'animal.center' | 'animal.kill' | 'animal.vital' | 'animal.wound' | 'animal.body';
  /** Punkty za trafienie strzałą nr 1, 2, 3… */
  pts: readonly number[];
}

export interface AnimalFormat {
  id: 'ifaa' | 'ifaa-3d-hunt' | 'ifaa-3d-std' | 'wa-3d' | 'dbsv-wald' | 'dbsv-jagd';
  faceId: string;
  maxArrows: number;
  /** Pierwsze trafienie kończy stanowisko (Animal Round, Waldrunde); 3D Standard — nie. */
  stopOnHit: boolean;
  /** Od środka na zewnątrz. */
  zones: readonly AnimalZone[];
}

const CENTER = 'animal.center', KILL = 'animal.kill', VITAL = 'animal.vital', WOUND = 'animal.wound', BODY = 'animal.body';

/**
 * Kolejność = kolejność na liście wyboru: od najmniejszej liczby strzał
 * (user 2026-11-10: nazwy z punktów, związek tylko jako podpis).
 */
export const ANIMAL_FORMATS: readonly AnimalFormat[] = [
  { id: 'ifaa-3d-hunt', faceId: IFAA_3D_HUNTING_FACE_ID, maxArrows: 1, stopOnHit: true,
    zones: [{ hit: 'K', key: KILL, pts: [20] }, { hit: 'V', key: VITAL, pts: [16] }, { hit: 'W', key: WOUND, pts: [10] }] },
  { id: 'dbsv-jagd', faceId: DBSV_JAGD_FACE_ID, maxArrows: 1, stopOnHit: true,
    zones: [{ hit: 'K', key: KILL, pts: [15] }, { hit: 'W', key: BODY, pts: [12] }] },
  { id: 'wa-3d', faceId: WA_3D_FACE_ID, maxArrows: 2, stopOnHit: false,
    zones: [{ hit: 'X', key: CENTER, pts: [11, 11] }, { hit: 'K', key: KILL, pts: [10, 10] }, { hit: 'V', key: VITAL, pts: [8, 8] }, { hit: 'W', key: BODY, pts: [5, 5] }] },
  { id: 'ifaa-3d-std', faceId: IFAA_3D_STANDARD_FACE_ID, maxArrows: 2, stopOnHit: false,
    zones: [{ hit: 'K', key: KILL, pts: [10, 10] }, { hit: 'V', key: VITAL, pts: [8, 8] }, { hit: 'W', key: WOUND, pts: [5, 5] }] },
  { id: 'ifaa', faceId: IFAA_ANIMAL_FACE_ID, maxArrows: 3, stopOnHit: true,
    zones: [{ hit: 'K', key: KILL, pts: [20, 16, 12] }, { hit: 'W', key: WOUND, pts: [18, 14, 10] }] },
  { id: 'dbsv-wald', faceId: DBSV_WALD_FACE_ID, maxArrows: 3, stopOnHit: true,
    zones: [{ hit: 'K', key: KILL, pts: [15, 10, 5] }, { hit: 'W', key: BODY, pts: [12, 7, 2] }] },
];

/** Domyślny format (stare sesje bez formatu) — IFAA Animal Round. */
const DEFAULT_FORMAT = ANIMAL_FORMATS.find(f => f.id === 'ifaa')!;

/** Format z tarczy sesji (brak/nieznana = IFAA Animal Round). */
export const animalFormatOf = (targetType?: string | null): AnimalFormat =>
  ANIMAL_FORMATS.find(f => f.faceId === targetType) ?? DEFAULT_FORMAT;

export const animalFormatById = (id?: string | null): AnimalFormat =>
  ANIMAL_FORMATS.find(f => f.id === id) ?? DEFAULT_FORMAT;

/** Czy tarcza to któryś format rundy zwierzęcej. */
export const isAnimalFace = (targetType?: string | null): boolean => ANIMAL_FORMATS.some(f => f.faceId === targetType);

const IFAA = DEFAULT_FORMAT;

/** Strefa formatu (null, gdy format jej nie ma). */
export const zoneOf = (f: AnimalFormat, hit: AnimalHit): AnimalZone | null => f.zones.find(z => z.hit === hit) ?? null;

/** Punkty za trafienie strzałą nr `arrowIndex` (0-based); poza limitem / bez strefy 0. */
export const animalPoints = (arrowIndex: number, hit: AnimalHit, f: AnimalFormat = IFAA): number =>
  zoneOf(f, hit)?.pts[arrowIndex] ?? 0;

/** Strefa strzały nr `i` o wartości `v` w danym formacie (null = Miss/nieznane). */
export function hitOf(v: string | null | undefined, i: number, f: AnimalFormat = IFAA): AnimalHit | null {
  const n = parseInt(String(v), 10);
  if (isNaN(n)) return null;
  return f.zones.find(z => z.pts[i] === n)?.hit ?? null;
}

/**
 * Wynik stanowiska. Formaty „do pierwszego trafienia”: którą strzałą i gdzie.
 * 3D Standard (obie strzały się liczą): pierwsza trafiona strzała i strefa,
 * a `points` = SUMA stanowiska. null = bez trafienia.
 */
export function stationResult(arrows?: readonly string[] | null, f: AnimalFormat = IFAA): { arrow: number; hit: AnimalHit; points: number } | null {
  const a = arrows || [];
  let first: { arrow: number; hit: AnimalHit } | null = null;
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const h = hitOf(a[i], i, f);
    if (!h) continue;
    sum += parseInt(a[i], 10);
    if (!first) first = { arrow: i + 1, hit: h };
    if (f.stopOnHit) break;
  }
  return first ? { ...first, points: sum } : null;
}

/** Czy stanowisko jest zamknięte (limit strzał albo trafienie w formacie „do pierwszego trafienia”). */
export const stationDone = (arrows: readonly string[], f: AnimalFormat = IFAA): boolean =>
  arrows.length >= f.maxArrows || (f.stopOnHit && stationResult(arrows, f) !== null);

export interface AnimalSummary {
  stations: number;
  score: number;
  /** Trafienia 1., 2., 3. strzałą (w „do pierwszego trafienia” = którą strzałą zaliczone). */
  byArrow: [number, number, number];
  /** Trafienia w każdą strefę (X/K/V/W). */
  zones: Record<AnimalHit, number>;
  kills: number;
  vitals: number;
  wounds: number;
  /** Stanowiska bez żadnego trafienia. */
  misses: number;
  /** Średnio punktów na stanowisko. */
  perStation: number;
}

/** „Trefferquote” — podsumowanie rundy po stanowiskach. */
export function animalSummary(ends: readonly { arrows?: string[]; rawArrows?: string[] }[], f: AnimalFormat = IFAA): AnimalSummary {
  const s: AnimalSummary = { stations: 0, score: 0, byArrow: [0, 0, 0], zones: { X: 0, K: 0, V: 0, W: 0 }, kills: 0, vitals: 0, wounds: 0, misses: 0, perStation: 0 };
  for (const e of ends) {
    const arrows = e.rawArrows || e.arrows || [];
    if (!arrows.length) continue;
    s.stations++;
    let any = false;
    for (let i = 0; i < arrows.length; i++) {
      const h = hitOf(arrows[i], i, f);
      if (!h) continue;
      any = true;
      s.score += parseInt(arrows[i], 10);
      if (i < 3) s.byArrow[i]++;
      s.zones[h]++;
      if (h === 'K' || h === 'X') s.kills++; else if (h === 'V') s.vitals++; else s.wounds++;
      if (f.stopOnHit) break;
    }
    if (!any) s.misses++;
  }
  s.perStation = s.stations ? s.score / s.stations : 0;
  return s;
}

/**
 * Nazwa formatu z jego danych (user 2026-11-10: zamiast „Niemcy/IFAA” — liczba
 * strzał i punkty, związek jako podpis). Np. „1 Pfeil · 20/16/10”,
 * „2 Pfeile · je 11/10/8/5”, „bis 3 · 20/18 → 16/14 → 12/10”.
 */
export function formatLabel(f: AnimalFormat, t: (k: string, o?: any) => string): string {
  const arrows = f.maxArrows === 1 ? t('animal.lbl.one') : f.stopOnHit ? t('animal.lbl.upTo', { n: f.maxArrows }) : t('animal.lbl.n', { n: f.maxArrows });
  const perArrow = Array.from({ length: f.maxArrows }, (_, i) => f.zones.map(z => z.pts[i]).join('/'));
  const pts = f.stopOnHit || f.maxArrows === 1
    ? perArrow.join(' → ')
    : `${t('animal.lbl.each')} ${perArrow[0]}`;
  return `${arrows} · ${pts}`;
}
