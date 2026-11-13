// [TRÓJKĄCIK 2026-11-12] Znak treningu grupy z planu: róg w górnym rogu karty,
// zielona obwódka = temat zapisany. Rodzic musi mieć `relative overflow-hidden`.
// Kolor wg słownika: różowy = ja jako trener, fioletowy = od trenera (uczeń, 2026-11-13),
// szary = trening odwołany. `side="left"` — fioletowy róg w siatce miesiąca jest po lewej,
// żeby nie zasłaniał różowego, gdy trener sam trenuje w cudzej grupie (user 2026-11-13).
const COLORS = { rose: 'border-t-rose-500', violet: 'border-t-violet-500', gray: 'border-t-gray-400' } as const;

export default function PlanCorner({ hasTopic, size = 15, color = 'rose', side = 'right' }: {
  hasTopic: boolean; size?: number; color?: keyof typeof COLORS; side?: 'right' | 'left';
}) {
  const outer = size + 5;
  const left = side === 'left';
  const pos = left ? 'top-0 left-0' : 'top-0 right-0';
  const tri = (w: number) => ({ borderTopWidth: w, borderStyle: 'solid' as const, borderBottomWidth: 0, ...(left ? { borderRightWidth: w, borderLeftWidth: 0 } : { borderLeftWidth: w, borderRightWidth: 0 }) });
  const clear = left ? 'border-r-transparent' : 'border-l-transparent';
  return (
    <span className={`pointer-events-none absolute ${pos}`} aria-hidden>
      {hasTopic && <span className={`absolute ${pos} w-0 h-0 ${clear} border-t-emerald-500`} style={tri(outer)} />}
      <span className={`absolute ${pos} w-0 h-0 ${clear} ${COLORS[color]}`} style={tri(size)} />
    </span>
  );
}
