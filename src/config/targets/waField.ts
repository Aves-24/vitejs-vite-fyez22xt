import type { TargetFace, TargetRing } from '../targetFaces';

/**
 * [WA FIELD] Tarcze terenowe World Archery (Feldbogen-Auflage) 80 / 60 / 40 cm.
 *
 * Osobny plik — zasada usera z 2026-09-03: nowa tarcza nie dopisuje się do
 * pliku z tarczami już przestrzelanymi. `targetFaces.ts` tylko je rejestruje.
 *
 * ── Wygląd i punktacja ─────────────────────────────────────────────────────
 * Czarna tarcza z żółtym środkiem, białe linie między strefami. Sześć stref
 * od środka: 6 i 5 (żółte), 4, 3, 2, 1 (czarne). Strefa 6 to „X” (od 2008
 * liczona jako 6 punktów). Punktacja NIE pasuje do wzoru `10 - floor(d/krok)`,
 * dlatego tarcza ma jawne `zones` (to samo pole co dmuchawka 3-5-7).
 *
 * ── Wymiary (2026-11-09) ───────────────────────────────────────────────────
 * Średnice stref jako ułamek średnicy tarczy D: 6 = D/10, 5 = D/5, 4 = 2D/5,
 * 3 = 3D/5, 2 = 4D/5, 1 = D. Dla 80 cm: 8 / 16 / 32 / 48 / 64 / 80 cm —
 * potwierdzone tabelą WA (worldarchery.org/rulebook/article/1360). Złoto
 * 4 / 8 / 12 cm dla 20 / 40 / 60 cm potwierdza bogenundpfeile.de (DSB),
 * więc ten sam wzór obowiązuje dla każdej wielkości. W viewBoxie 300×300
 * (promień tarczy 150) daje to promienie 15 / 30 / 60 / 90 / 120 / 150.
 *
 * ── Statystyki ─────────────────────────────────────────────────────────────
 * `statsGroup: 'field'` — treningi na tych tarczach mają WŁASNY świat
 * statystyk w skali 6 (decyzja usera 2026-11-09), nie mieszają się z formą,
 * strefami ani rangą z tarcz WA. Patrz `config/statsGroups.ts`.
 */

const YELLOW = '#F2C94C';
const BLACK = '#222222';

/** Rysowanie od największego. Na czarnym biała linia, na żółtym ciemna. */
export const WA_FIELD_RINGS: readonly TargetRing[] = [
  { r: 150, fill: BLACK,  stroke: '#ffffff' }, // 1
  { r: 120, fill: BLACK,  stroke: '#ffffff' }, // 2
  { r: 90,  fill: BLACK,  stroke: '#ffffff' }, // 3
  { r: 60,  fill: BLACK,  stroke: '#ffffff' }, // 4
  { r: 30,  fill: YELLOW, stroke: '#333333' }, // 5
  { r: 15,  fill: YELLOW, stroke: '#333333' }, // 6 (X)
];

/** Punktowanie od środka na zewnątrz — pierwsza pasująca strefa wygrywa. */
export const WA_FIELD_ZONES = [
  { r: 15,  value: 6 },
  { r: 30,  value: 5 },
  { r: 60,  value: 4 },
  { r: 90,  value: 3 },
  { r: 120, value: 2 },
  { r: 150, value: 1 },
] as const;

const fieldFace = (cm: 80 | 60 | 40, pickOrder: number): TargetFace => ({
  id: `Field ${cm}cm`,
  layout: 'single',
  diameterCm: cm,
  // Ignorowane przy `zones` w punktacji; `spread.ts` bierze krok jako
  // „szerokość pierścienia” do skupienia — zewnętrzne strefy mają 30.
  scoringRingStep: 30,
  minScoringRing: 1,
  rings: WA_FIELD_RINGS,
  zones: WA_FIELD_ZONES,
  aliases: [`WA Field ${cm}cm`, `Feld ${cm}cm`],
  scorable: true,
  statsGroup: 'field',
  pickOrder,
});

export const WA_FIELD_80_FACE = fieldFace(80, 10);
export const WA_FIELD_60_FACE = fieldFace(60, 11);
export const WA_FIELD_40_FACE = fieldFace(40, 12);

/**
 * Tarcza terenowa dla dystansu (gdy dystans pamięta tarczę WA, a zestaw jest
 * „Feld”). Zakresy wg Krügera: 40 cm 10–30 m, 60 cm 15–45 m, 80 cm 20–60 m —
 * bierzemy środek nakładających się przedziałów.
 */
export function fieldFaceForMeters(m?: number | null): string {
  const v = m || 0;
  // 20 cm 3-fach: 5–20 m — do 12 m bierzemy ją, wyżej 40 cm (10–30 m).
  if (v > 0 && v <= 12) return 'Field 20cm 3-Spot';
  if (v > 0 && v <= 25) return WA_FIELD_40_FACE.id;
  if (v > 0 && v <= 40) return WA_FIELD_60_FACE.id;
  return WA_FIELD_80_FACE.id;
}

/**
 * Kolory przycisków/pól strzał na tarczy terenowej: 6 i 5 żółte, 4–1 czarne
 * (na tarczach WA 6/5 są niebieskie — tu wprowadzałyby w błąd). `null` = bez
 * zmian (M, puste pole).
 */
export function fieldArrowClass(val: string): string | null {
  if (val === '6' || val === '5' || val === 'X') return 'bg-[#F2C94C] text-[#333] border-none shadow-sm';
  // UWAGA: Tailwind skanuje tylko *.tsx (tailwind.config.cjs) — klasy stąd MUSZĄ
  // istnieć też w jakimś .tsx, inaczej się nie wygenerują (złapane w e2e 2026-11-09:
  // bg-[#222222] dawało biały tekst na białym). Te same co getArrowStyles.
  if (['4', '3', '2', '1'].includes(val)) return 'bg-[#333333] text-white border-none shadow-sm';
  return null;
}
export function fieldScoreColors(val: string): { bg: string; text: string; stroke: string } | null {
  if (val === '6' || val === '5' || val === 'X') return { bg: '#F2C94C', text: '#333', stroke: '#fff' };
  if (['4', '3', '2', '1'].includes(val)) return { bg: '#222', text: '#fff', stroke: '#fff' };
  return null;
}

/** Czy to tarcza terenowa (osobny świat statystyk, inne kolory). */
export const isFieldFaceId = (id?: string | null) =>
  !!id && [WA_FIELD_80_FACE, WA_FIELD_60_FACE, WA_FIELD_40_FACE].some(f => f.id === id || f.aliases.includes(id));
