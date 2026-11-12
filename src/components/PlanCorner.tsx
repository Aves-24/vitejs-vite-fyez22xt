// [TRÓJKĄCIK 2026-11-12] Znak treningu grupy z planu: różowy róg w prawym górnym rogu karty,
// zielona obwódka = temat zapisany. Rodzic musi mieć `relative overflow-hidden`.
export default function PlanCorner({ hasTopic, size = 15 }: { hasTopic: boolean; size?: number }) {
  const outer = size + 5;
  return (
    <span className="pointer-events-none absolute top-0 right-0" aria-hidden>
      {hasTopic && <span className="absolute top-0 right-0 w-0 h-0 border-l-transparent border-t-emerald-500" style={{ borderTopWidth: outer, borderLeftWidth: outer, borderStyle: 'solid', borderRightWidth: 0, borderBottomWidth: 0 }} />}
      <span className="absolute top-0 right-0 w-0 h-0 border-l-transparent border-t-rose-500" style={{ borderTopWidth: size, borderLeftWidth: size, borderStyle: 'solid', borderRightWidth: 0, borderBottomWidth: 0 }} />
    </span>
  );
}
