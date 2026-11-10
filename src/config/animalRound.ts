import { IFAA_ANIMAL_FACE_ID } from './targets/ifaaAnimal';
import { DBSV_WALD_FACE_ID, DBSV_JAGD_FACE_ID } from './targets/dbsv3d';

/**
 * [ANIMAL ROUND 2026-11-10] Runda zwierzęca (IFAA Animal Round, DBSV 3D).
 *
 * Do każdego zwierzęcia kilka strzał, stanowisko kończy PIERWSZE trafienie.
 * Punkty zależą od numeru strzały i strefy: Kill (środek) / Wound albo Körper
 * (reszta sylwetki). Formaty (każdy to osobna „tarcza” w config/targets, więc
 * format jest zapisany w sesji jako targetType):
 *
 *  - IFAA Animal Round — do 3 strzał, Kill 20/16/12, Wound 18/14/10.
 *    Źródło: IFAA Archers' Handbook 2021 („A maximum of three shots is allowed,
 *    but an archer shoots only until a hit is made.”). Grupy 1–2: trzy kołki
 *    (walk-up), 3–4: jeden kołek.
 *  - DBSV 3D-Waldrunde — do 3 strzał, Kill 15/10/5, Körper 12/7/2.
 *  - DBSV 3D-Jagdrunde — 1 strzała, Kill 15, Körper 12.
 *    Źródło DBSV: WKO Teil 10 (Stand 2026-1) — ta sama tabela dla wszystkich
 *    kołków; Teil 9 (Stand 2023-2, Abb. 9-4) miał jeszcze wyjątek czerwonego
 *    kołka (Kill tylko w najmniejszej strefie).
 *
 * Zapis jak każda seria: `arrows` = strzały w kolejności (np. ['M', '16']).
 * Wartości się nakładają (12 = Kill w IFAA, Körper w DBSV), dlatego strefę
 * czytamy z NUMERU strzały i formatu, nie z samej wartości. Nazwa zwierzęcia
 * i obrys są na serii (`animal`, `outlineId`).
 */
export const ANIMAL_DISTANCE = 'Animal';
export const ANIMAL_DISTANCE_ID = 'd_animal';
export const ANIMAL_STATIONS = 28;
export const ANIMAL_MAX_ARROWS = 3;

export const isAnimalRound = (s?: { distance?: string | null } | null): boolean => s?.distance === ANIMAL_DISTANCE;

export type AnimalHit = 'K' | 'W';

export interface AnimalFormat {
  id: 'ifaa' | 'dbsv-wald' | 'dbsv-jagd';
  faceId: string;
  maxArrows: number;
  K: readonly number[];
  W: readonly number[];
  /** Klucz i18n strefy poza Kill (IFAA: Wound, DBSV: Körper). */
  woundKey: 'animal.wound' | 'animal.body';
}

export const ANIMAL_FORMATS: readonly AnimalFormat[] = [
  { id: 'ifaa', faceId: IFAA_ANIMAL_FACE_ID, maxArrows: 3, K: [20, 16, 12], W: [18, 14, 10], woundKey: 'animal.wound' },
  { id: 'dbsv-wald', faceId: DBSV_WALD_FACE_ID, maxArrows: 3, K: [15, 10, 5], W: [12, 7, 2], woundKey: 'animal.body' },
  { id: 'dbsv-jagd', faceId: DBSV_JAGD_FACE_ID, maxArrows: 1, K: [15], W: [12], woundKey: 'animal.body' },
];

/** Format z tarczy sesji (brak/nieznana = IFAA). */
export const animalFormatOf = (targetType?: string | null): AnimalFormat =>
  ANIMAL_FORMATS.find(f => f.faceId === targetType) ?? ANIMAL_FORMATS[0];

export const animalFormatById = (id?: string | null): AnimalFormat =>
  ANIMAL_FORMATS.find(f => f.id === id) ?? ANIMAL_FORMATS[0];

/** Czy tarcza to któryś format rundy zwierzęcej. */
export const isAnimalFace = (targetType?: string | null): boolean => ANIMAL_FORMATS.some(f => f.faceId === targetType);

const IFAA = ANIMAL_FORMATS[0];

/** Punkty za trafienie strzałą nr `arrowIndex` (0-based); poza limitem 0. */
export const animalPoints = (arrowIndex: number, hit: AnimalHit, f: AnimalFormat = IFAA): number => f[hit][arrowIndex] ?? 0;

/** Strefa strzały nr `i` o wartości `v` w danym formacie (null = Miss/nieznane). */
export function hitOf(v: string | null | undefined, i: number, f: AnimalFormat = IFAA): AnimalHit | null {
  const n = parseInt(String(v), 10);
  if (isNaN(n)) return null;
  if (f.K[i] === n) return 'K';
  if (f.W[i] === n) return 'W';
  return null;
}

/** Wynik stanowiska: którą strzałą trafione i gdzie, albo null (same Miss / niedokończone). */
export function stationResult(arrows?: readonly string[] | null, f: AnimalFormat = IFAA): { arrow: number; hit: AnimalHit; points: number } | null {
  const a = arrows || [];
  for (let i = 0; i < a.length; i++) {
    const h = hitOf(a[i], i, f);
    if (h) return { arrow: i + 1, hit: h, points: parseInt(a[i], 10) };
  }
  return null;
}

/** Czy stanowisko jest zamknięte (trafienie albo limit strzał). */
export const stationDone = (arrows: readonly string[], f: AnimalFormat = IFAA): boolean =>
  arrows.length >= f.maxArrows || stationResult(arrows, f) !== null;

export interface AnimalSummary {
  stations: number;
  score: number;
  /** Trafione 1., 2., 3. strzałą. */
  byArrow: [number, number, number];
  kills: number;
  wounds: number;
  misses: number;
  /** Średnio punktów na stanowisko. */
  perStation: number;
}

/** „Trefferquote” — podsumowanie rundy po stanowiskach. */
export function animalSummary(ends: readonly { arrows?: string[]; rawArrows?: string[] }[], f: AnimalFormat = IFAA): AnimalSummary {
  const s: AnimalSummary = { stations: 0, score: 0, byArrow: [0, 0, 0], kills: 0, wounds: 0, misses: 0, perStation: 0 };
  for (const e of ends) {
    const arrows = e.rawArrows || e.arrows || [];
    if (!arrows.length) continue;
    s.stations++;
    const r = stationResult(arrows, f);
    if (!r) { s.misses++; continue; }
    s.score += r.points;
    s.byArrow[r.arrow - 1]++;
    if (r.hit === 'K') s.kills++; else s.wounds++;
  }
  s.perStation = s.stations ? s.score / s.stations : 0;
  return s;
}
