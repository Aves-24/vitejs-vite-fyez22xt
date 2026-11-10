import { findTargetFace } from './targetFaces';
import { isBlowgunSession } from './targets/blowgun';
import { isBlowgun, styleOfSetup } from './equipmentSetups';

/**
 * [FELD 2026-11-09] Światy statystyk.
 *
 * Forma, strefy, Ringe/Pfeil i ranga mają sens tylko w JEDNEJ skali punktów.
 * Tarcze WA (i dmuchawka) liczą do 10, tarcze terenowe WA do 6 — średnia 5,2
 * z terenu obok 8,5 z hali wyglądałaby jak katastrofa. Dlatego każdy trening
 * należy do jednego świata, a Home pokazuje świat AKTYWNEGO zestawu
 * (decyzja usera: „jak ktoś wybierze Feld, statystyki muszą pod to pasować”).
 *
 *  - 'target'  — tarcze WA (hala i tory), jedyny świat z rangą z handicapu,
 *  - 'field'   — tarcze terenowe WA (6–1),
 *  - 'blowgun' — dmuchawka (6–10, ale osobne dystanse i bez rangi),
 *  - 'ifaa'    — tarcze IFAA (5–1, seria 4/5 strzał jak na zawodach),
 *  - 'animal'  — [ANIMAL ROUND 2026-11-10] runda zwierzęca IFAA (20…4 za
 *                stanowisko, config/animalRound.ts) — bez rangi, nie ma
 *                własnego zestawu (strzela się z zestawu IFAA).
 *
 * Trening przypisujemy po TARCZY (i stemplu dyscypliny dla dmuchawki), nie po
 * zestawie — tarcza jest zapisana w każdej sesji, także w starych.
 */
export type StatsGroup = 'target' | 'field' | 'blowgun' | 'ifaa' | 'animal';

export function statsGroupOf(s?: { bowClass?: string | null; targetType?: string | null } | null): StatsGroup {
  if (!s) return 'target';
  if (isBlowgunSession({ bowClass: s.bowClass, targetType: s.targetType })) return 'blowgun';
  const g = findTargetFace(s.targetType)?.statsGroup;
  if (g === 'field' || g === 'ifaa' || g === 'animal') return g;
  return 'target';
}

/** Tarcza terenowa (kolory 6/5 żółte, 4–1 czarne; świat 'field'). */
export const isFieldFace = (id?: string | null) => findTargetFace(id)?.statsGroup === 'field';

/** Świat statystyk aktywnego zestawu (Home, Schnellstatistik, strefy). */
export function statsGroupOfSetup(setup?: { discipline?: string | null; style?: string | null } | null): StatsGroup {
  if (isBlowgun(setup?.discipline)) return 'blowgun';
  const st = styleOfSetup(setup);
  return st === 'field' ? 'field' : st === 'ifaa' ? 'ifaa' : 'target';
}

/** Świat statystyk aktywnego zestawu zapamiętany przez Home (PRO Progress, karta stref). */
export function storedStatsGroup(userId?: string | null): StatsGroup {
  try { const v = localStorage.getItem(`grotX_statsGroup_${userId}`); return v === 'field' || v === 'blowgun' || v === 'ifaa' ? v : 'target'; } catch { return 'target'; }
}

export const STATS_GROUPS: readonly StatsGroup[] = ['target', 'field', 'blowgun', 'ifaa'];

/** Klucz cache statystyk Home dla danego świata. */
export const homeStatsCacheKey = (userId: string, g: StatsGroup) => `grotX_stats_v16_${userId}_${g}`;

/** Po nowym treningu: cache statystyk Home WSZYSTKICH światów do kosza. */
export function clearHomeStatsCache(userId: string) {
  try {
    for (const g of STATS_GROUPS) localStorage.removeItem(homeStatsCacheKey(userId, g));
    localStorage.removeItem(`grotX_stats_v15_${userId}`); // stary klucz sprzed światów
  } catch { /* prywatne okno — nic do czyszczenia */ }
}

/** Najwyższa wartość strzały w danym świecie (skala słupków, wykresów). */
export const scaleMaxOf = (g: StatsGroup): number => (g === 'field' ? 6 : g === 'ifaa' ? 5 : g === 'animal' ? 20 : 10);

/**
 * Strzała → indeks strefy [złoto, czerwień, niebieski, czarny, biały, M].
 * Tarcza terenowa ma tylko żółty środek (6, 5) i czerń (4–1).
 */
export function zoneIndexOf(v: unknown, g: StatsGroup = 'target'): number | null {
  if (v === 'M') return 5;
  const n = v === 'X' ? (g === 'field' ? 6 : g === 'ifaa' ? 5 : 10) : parseInt(String(v), 10);
  if (isNaN(n)) return null;
  if (n <= 0) return 5;
  // Zwierzę: Kill (20/16/12) = złoto, Wound (18/14/10) = biały.
  if (g === 'animal') return n === 20 || n === 16 || n === 12 ? 0 : 4;
  if (g === 'field') return n >= 5 ? 0 : 3;
  // IFAA: 5 = środek (najlepsza strefa), 4 = pierścień wewnętrzny, 3 = zewnętrzny; 2/1 tylko Indoor/Expert.
  if (g === 'ifaa') return n >= 5 ? 0 : n === 4 ? 1 : n === 3 ? 2 : 3;
  return n >= 9 ? 0 : n >= 7 ? 1 : n >= 5 ? 2 : n >= 3 ? 3 : 4;
}
