import type { TargetFace } from '../targetFaces';

/**
 * [IFAA 3D 2026-11-10] Rundy 3D IFAA — osobny plik (zasada usera: nowa tarcza
 * = nowy plik). Jak „IFAA Animal”: bez geometrii, wpisuje się strefą
 * Kill / Vital / Wound / Miss (config/animalRound.ts).
 *
 *  - 3-D Hunting Round (1 Arrow): jeden kołek, „Only one arrow is shot from the
 *    marker.” Kill 20, Vital 16, Wound 10.
 *  - 3-D Standard Round (2 Arrows): dwa kołki, „One arrow is shot from each
 *    marker.” i „Both arrows are counted for score.” Kill 10, Vital 8, Wound 5.
 *
 * Strefy (Hunting Round, sekcja 3): Kill = wewnętrzne koło, Vital = obszar
 * wokół (serce/płuca), Wound = reszta tułowia do linii przy podstawie;
 * strzały w podstawie i w porożu/rogach się nie liczą (w nogach — tak).
 * Źródło: IFAA Archers' Handbook 2021 (wyciąg z Book of Rules 2021).
 *
 * Świat statystyk 'animal' — bez rangi; bez `pickOrder` (kafelek w Vorbereitung).
 */
export const IFAA_3D_HUNTING_FACE_ID = 'IFAA 3D Hunting';
export const IFAA_3D_STANDARD_FACE_ID = 'IFAA 3D Standard';

const base = {
  layout: 'single' as const,
  diameterCm: 0,
  scoringRingStep: 30,
  minScoringRing: 1,
  rings: [],
  scorable: true,
  statsGroup: 'animal' as const,
};

export const IFAA_3D_HUNTING_FACE: TargetFace = {
  ...base,
  id: IFAA_3D_HUNTING_FACE_ID,
  aliases: ['IFAA 3-D Hunting Round'],
  // Kill złoty, Vital czerwony, Wound biały.
  keyColors: { '20': 'gold', '16': 'red', '10': 'white' },
  round: { arrowsPerEnd: 1, ends: 28 },
};

export const IFAA_3D_STANDARD_FACE: TargetFace = {
  ...base,
  id: IFAA_3D_STANDARD_FACE_ID,
  aliases: ['IFAA 3-D Standard Round'],
  keyColors: { '10': 'gold', '8': 'red', '5': 'white' },
  round: { arrowsPerEnd: 2, ends: 28 },
};
