import type { TargetFace, TargetRing } from '../targetFaces';
import { BLOWGUN_DISCIPLINE } from '../equipmentSetups';
// Bez cyklu: blowgun40 importuje z targetFaces wyłącznie typy.
import { BLOWGUN40_FACE } from './blowgun40';

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
 *  - układ: jak spot łuczniczy na 18 m — dwie kartki po trzy spoty obok
 *    siebie (zmiana 2026-09-11, patrz komentarz przy `layout`)
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
  // Dwie kolumny po trzy spoty, identycznie jak '3-Spot' na 18 m (decyzja
  // usera 2026-09-10/11). Do 2026-09-11 było tu `spot3-single` i każda strzała
  // od 4. w serii wpadała jako M: ScoringView pilnuje zasady „jedna strzała
  // na spot", a przy trzech spotach i serii 6 strzał od czwartej każdy spot
  // był już zajęty. W `spot3-double` strzały 4-6 idą na prawą kolumnę.
  layout: 'spot3-double',
  diameterCm: 20,
  // Spoty punktuje `calculateSpotScore` (krok 12,5 wpisany tam na sztywno);
  // te dwa pola opisują stan faktyczny, żeby katalog się nie rozjeżdżał
  // z kodem, gdy T5 przeniesie rysowanie i liczenie na katalog.
  scoringRingStep: 12.5,
  minScoringRing: 6,
  rings: BLOWGUN_RINGS,
  aliases: ['Blasrohr 20cm', 'Dmuchawka 20cm'],
  scorable: true,
  discipline: 'blowgun',
  // Na końcu listy wyboru — to inna dyscyplina, nie kolejna tarcza łucznicza.
  // Od 2026-09-04 pokazywana WYŁĄCZNIE przy dyscyplinie „dmuchawka"
  // (`selectableTargetIdsFor` w targetFaces.ts).
  pickOrder: 7,
};

/**
 * Czy ta sesja padła z dmuchawki.
 *
 * DLACZEGO to istnieje: dmuchawka NIE MOŻE karmić statystyk łuczniczych.
 * Handicap liczy się ze wzoru `średnica / dystans` odniesionego do 122 cm
 * na 70 m — dla tarczy 20 cm na 5 m wychodzi 4,0 przy wzorcu 1,743, czyli
 * ponad dwa razy „łatwiej". Trzy treningi z rury zafałszowałyby handicap
 * łuczniczy na miesiąc, bo liczy się go z ostatnich 10 sesji. Ta sama
 * pułapka dotyczy średniej (dmuchawka punktuje 6-10, więc średnia ~8,5
 * zawyża rangę) oraz licznika wystrzelonych strzał.
 *
 * `bowClass` ROZSTRZYGA, gdy jest obecny — niesie dyscyplinę wybranego zestawu.
 * Tarcza jest fallbackiem WYŁĄCZNIE dla sesji bez stempla, czyli wpisów
 * historycznych (świadomie zapisywanych bez `bowClass`, patrz `setupStamp.ts`).
 *
 * ZMIANA 2026-09-04: wcześniej tarcza działała jako drugi warunek OR, więc
 * łucznik, który wybrał „Blowgun 20cm", tracił sesję z handicapu i rangi —
 * po cichu, bez żadnego komunikatu. Był to świadomy bezpiecznik na czas, gdy
 * lista tarcz nie była filtrowana dyscypliną. Teraz jest
 * (`selectableTargetIdsFor`), więc bezpiecznik przestał być potrzebny i zaczął
 * szkodzić. Dotyczyło to też trybu Battle, gdzie `targetType` przychodzi
 * z dokumentu bitwy, czyli od DRUGIEGO gracza — cudzy wybór tarczy nie może
 * decydować o tym, czy mój trening liczy się do mojej rangi.
 */
export function isBlowgunSession(session?: {
  bowClass?: string | null;
  targetType?: string | null;
} | null): boolean {
  if (!session) return false;
  if (session.bowClass) return session.bowClass === BLOWGUN_DISCIPLINE;
  const t = session.targetType ?? '';
  return [BLOWGUN_FACE, BLOWGUN40_FACE].some(f => f.id === t || f.aliases.includes(t));
}
