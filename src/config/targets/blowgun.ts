import type { TargetFace, TargetRing } from '../targetFaces';

/**
 * [DMUCHAWKA] Tarcza do dmuchawki (Blasrohr) — osobny plik, świadomie.
 *
 * User poprosił 2026-09-03, żeby każda NOWA tarcza mieszkała we własnym pliku
 * i nie dotykała definicji tarcz już przestrzelanych. Katalog `targetFaces.ts`
 * tylko importuje ten wpis i wstawia go do rejestru — nic tu nie nadpisuje
 * geometrii 122cm ani 80cm.
 *
 * Import typu jest `import type`, więc znika przy kompilacji i nie tworzy
 * cyklu z `targetFaces.ts`, który importuje ten plik z powrotem.
 *
 * ŹRÓDŁO DANYCH — potwierdzone przez usera 2026-09-04, nie z pamięci:
 *  - „Gezielt wird auf Scheiben mit einer Wertung von 6 bis 10 Ringen"
 *  - wygląda IDENTYCZNIE jak nasz spot
 *  - w środku JEST X i liczy się jako 10 (rozstrzyga remisy)
 *  - układ: trzy spoty na kartce
 *  - średnica 20 cm, dystans zwykle 10 m
 *
 * Punktacja wychodzi więc dokładnie taka sama jak na spocie łuczniczym,
 * a X w całej aplikacji już dziś liczy się jako 10 punktów i osobno jako X
 * (ExportPanel, TournamentScoreInput, ScoringView) — nic nie trzeba zmieniać.
 */

/**
 * Geometria w jednostkach viewBoxa 300×300, identyczna z rysowanym spotem.
 * Kolory jak w `components/targets/SpotTarget.tsx`: 6 niebieski, 7–8 czerwone,
 * 9–10 i X żółte.
 *
 * UWAGA: dziś te pierścienie są DOKUMENTACJĄ, nie źródłem rysowania — spoty
 * rysuje `SpotTarget` z wartościami wpisanymi na sztywno, a punktuje
 * `calculateSpotScore`. Zacznie z tego korzystać dopiero T5 (ujednolicenie
 * rysowania tarcz).
 */
const BLOWGUN_RINGS: readonly TargetRing[] = [
  { r: 62.5, fill: '#2F80ED', stroke: '#333333' }, // 6
  { r: 50,   fill: '#EB5757', stroke: '#333333' }, // 7
  { r: 37.5, fill: '#EB5757', stroke: '#333333' }, // 8
  { r: 25,   fill: '#F2C94C', stroke: '#333333' }, // 9
  { r: 12.5, fill: '#F2C94C', stroke: '#333333' }, // 10
  { r: 6.25, fill: '#F2C94C', stroke: '#333333' }, // X (liczy się jako 10)
];

/** Id jest wyświetlane wprost w UI — nazwy tarcz nie mają dziś tłumaczeń. */
export const BLOWGUN_FACE_ID = 'Blowgun 20cm';

export const BLOWGUN_FACE: TargetFace = {
  id: BLOWGUN_FACE_ID,
  // Trzy spoty w jednej kolumnie. NIE `spot3-double` — tamten układ rysuje
  // dwie kolumny po trzy (sześć kółek), a dmuchawka ma trzy.
  layout: 'spot3-single',
  diameterCm: 20,
  // Spoty punktuje `calculateSpotScore` (krok 12,5 wpisany tam na sztywno);
  // te dwa pola opisują stan faktyczny, żeby katalog się nie rozjeżdżał
  // z kodem, gdy T5 przeniesie rysowanie i liczenie na katalog.
  scoringRingStep: 12.5,
  minScoringRing: 6,
  rings: BLOWGUN_RINGS,
  aliases: ['Blasrohr 20cm', 'Dmuchawka 20cm'],
  scorable: true,
  // Na końcu listy wyboru — to inna dyscyplina, nie kolejna tarcza łucznicza.
  // TODO: pokazywać ją WYŁĄCZNIE gdy dyscyplina zestawu = dmuchawka.
  // Dziś SessionSetup nie zna dyscypliny, więc tarcza jest widoczna zawsze.
  pickOrder: 7,
};
