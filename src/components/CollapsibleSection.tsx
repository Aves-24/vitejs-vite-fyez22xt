import React from 'react';

/**
 * Zwijana sekcja (życzenie usera 2026-09-10): najpierw w formularzu
 * wydarzenia w kalendarzu, gdzie lista podpowiedzi, dystanse i podopieczni
 * rozpychały okno tak, że pola daty i zapisu uciekały pod krawędź; potem na
 * pulpicie trenera (najbliższe terminy). Zwinięta sekcja pokazuje
 * w nagłówku to, co jest wybrane — więc nie trzeba jej otwierać, żeby
 * sprawdzić wartość.
 *
 * Na poziomie modułu, nie w środku widoku: komponent zdefiniowany w renderze
 * dostawałby nową tożsamość przy każdym renderze i React montowałby jego
 * zawartość od nowa.
 */
export default function CollapsibleSection({ label, summary, open, onToggle, children }: {
  label: string;
  summary?: React.ReactNode;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-2 bg-gray-50 border border-gray-100 rounded-xl px-3 py-2.5 active:scale-[0.99] transition-all"
      >
        <span className="text-[10px] font-black text-gray-400 uppercase shrink-0">{label}</span>
        <span className="flex items-center gap-1 min-w-0 text-[10px] font-black text-[#0a3a2a]">
          <span className="truncate">{summary}</span>
          <span className="material-symbols-outlined text-[18px] text-gray-400 shrink-0">{open ? 'expand_less' : 'expand_more'}</span>
        </span>
      </button>
      {open && children}
    </div>
  );
}
