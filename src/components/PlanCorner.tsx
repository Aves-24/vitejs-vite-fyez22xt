// [TRÓJKĄCIK 2026-11-12] Znak treningu grupy z planu: róg w prawym górnym rogu karty,
// zielona obwódka = temat zapisany. Rodzic musi mieć `relative overflow-hidden`.
// Kolor wg słownika: różowy = ja jako trener, fioletowy = od trenera (uczeń, 2026-11-13),
// szary = trening odwołany.
const COLORS = { rose: 'border-t-rose-500', violet: 'border-t-violet-500', gray: 'border-t-gray-400' } as const;

export default function PlanCorner({ hasTopic, size = 15, color = 'rose' }: { hasTopic: boolean; size?: number; color?: keyof typeof COLORS }) {
  const outer = size + 5;
  return (
    <span className="pointer-events-none absolute top-0 right-0" aria-hidden>
      {hasTopic && <span className="absolute top-0 right-0 w-0 h-0 border-l-transparent border-t-emerald-500" style={{ borderTopWidth: outer, borderLeftWidth: outer, borderStyle: 'solid', borderRightWidth: 0, borderBottomWidth: 0 }} />}
      <span className={`absolute top-0 right-0 w-0 h-0 border-l-transparent ${COLORS[color]}`} style={{ borderTopWidth: size, borderLeftWidth: size, borderStyle: 'solid', borderRightWidth: 0, borderBottomWidth: 0 }} />
    </span>
  );
}
