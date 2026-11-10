/**
 * [ANIMAL ROUND 2026-11-10] Runda zwierzęca IFAA.
 *
 * Do każdego zwierzęcia najwyżej 3 strzały (z trzech kołków, coraz bliżej),
 * stanowisko kończy PIERWSZE trafienie. Punkty zależą od numeru strzały
 * i strefy: Kill (środek) / Wound (reszta sylwetki):
 *
 *   1. strzała 20 / 18,  2. strzała 16 / 14,  3. strzała 12 / 10,  3 × Miss = 0.
 *
 * Źródło (2026-11-10): IFAA Archers' Handbook 2021, Animal Round — tabela
 * KILL/WOUND oraz „A maximum of three shots is allowed, but an archer shoots
 * only until a hit is made.” Grupy 1–2: trzy kołki (walk-up), 3–4: jeden kołek.
 *
 * Zapis jak każda seria: `arrows` = strzały w kolejności (np. ['M', '16']),
 * więc sumy, wznowienie i eksport działają bez zmian. Kill/Wound wynika
 * z wartości (20/16/12 = Kill). Nazwa zwierzęcia i obrys są na serii
 * (`animal`, `outlineId`) — nazwy wpisuje się samemu (decyzja usera).
 */
export const ANIMAL_DISTANCE = 'Animal';
export const ANIMAL_DISTANCE_ID = 'd_animal';
export const ANIMAL_STATIONS = 28;
export const ANIMAL_MAX_ARROWS = 3;

export const isAnimalRound = (s?: { distance?: string | null } | null): boolean => s?.distance === ANIMAL_DISTANCE;

export type AnimalHit = 'K' | 'W';

const POINTS: Record<AnimalHit, readonly number[]> = { K: [20, 16, 12], W: [18, 14, 10] };

/** Punkty za trafienie strzałą nr `arrowIndex` (0-based); poza 3. strzałą 0. */
export const animalPoints = (arrowIndex: number, hit: AnimalHit): number => POINTS[hit][arrowIndex] ?? 0;

const KILL = new Set(['20', '16', '12']);
const WOUND = new Set(['18', '14', '10']);
export const isKill = (v?: string | null) => !!v && KILL.has(v);
export const isWound = (v?: string | null) => !!v && WOUND.has(v);

/** Wynik stanowiska: którą strzałą trafione (1–3) i gdzie, albo null (3 × Miss / niedokończone). */
export function stationResult(arrows?: readonly string[] | null): { arrow: number; hit: AnimalHit; points: number } | null {
  const a = arrows || [];
  const i = a.findIndex(v => isKill(v) || isWound(v));
  if (i < 0) return null;
  return { arrow: i + 1, hit: isKill(a[i]) ? 'K' : 'W', points: parseInt(a[i], 10) };
}

/** Czy stanowisko jest zamknięte (trafienie albo 3 strzały). */
export const stationDone = (arrows: readonly string[]): boolean =>
  arrows.length >= ANIMAL_MAX_ARROWS || stationResult(arrows) !== null;

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
export function animalSummary(ends: readonly { arrows?: string[]; rawArrows?: string[] }[]): AnimalSummary {
  const s: AnimalSummary = { stations: 0, score: 0, byArrow: [0, 0, 0], kills: 0, wounds: 0, misses: 0, perStation: 0 };
  for (const e of ends) {
    const arrows = e.rawArrows || e.arrows || [];
    if (!arrows.length) continue;
    s.stations++;
    const r = stationResult(arrows);
    if (!r) { s.misses++; continue; }
    s.score += r.points;
    s.byArrow[r.arrow - 1]++;
    if (r.hit === 'K') s.kills++; else s.wounds++;
  }
  s.perStation = s.stations ? s.score / s.stations : 0;
  return s;
}
