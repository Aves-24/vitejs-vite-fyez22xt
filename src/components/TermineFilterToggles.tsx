import { useEffect, useRef, useState } from 'react';

// [TERMINE] Co pokazać obok własnych terminów trenera — te same ikonki w Liste i Monat
// (user 2026-11-13). Same ikonki: podpisy nie mieszczą się na telefonie obok Liste/Monat;
// wyłączone = szare i przekreślone, opis w title/aria-label. Po kliknięciu na chwilę
// dymek pod ikonkami mówi, co teraz widać (np. „Nur Termine als Trainer”).
export interface TermineFilter {
  on: boolean;
  toggle: () => void;
  icon: string;
  label: string;
  /** Dymek po włączeniu / wyłączeniu. */
  onText: string;
  offText: string;
  testId: string;
  hidden?: boolean;
}

const HINT_MS = 2200;

/** `sm` — mniejsze, do wiersza z nazwą miesiąca w prywatnym kalendarzu (user 2026-11-13). */
export default function TermineFilterToggles({ filters, size = 'md' }: { filters: TermineFilter[]; size?: 'md' | 'sm' }) {
  const [hint, setHint] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const click = (b: TermineFilter) => {
    b.toggle();
    // Stan po kliknięciu = odwrotność obecnego.
    setHint(b.on ? b.offText : b.onText);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setHint(null), HINT_MS);
  };

  return (
    <div className="relative flex items-center gap-1.5">
      {filters.filter(b => !b.hidden).map(b => (
        <button
          key={b.testId}
          type="button"
          data-testid={b.testId}
          aria-pressed={b.on}
          aria-label={b.label}
          title={b.label}
          onClick={() => click(b)}
          className={`relative ${size === 'sm' ? 'w-8 h-8 rounded-lg' : 'w-9 h-9 rounded-xl'} flex items-center justify-center active:scale-95 transition-all border ${
            b.on ? 'bg-[#0a3a2a] text-[#fed33e] border-[#0a3a2a]' : 'bg-white text-gray-400 border-gray-200'
          }`}
        >
          <span className={`material-symbols-outlined ${size === 'sm' ? 'text-[16px]' : 'text-[18px]'}`}>{b.icon}</span>
          {!b.on && <span aria-hidden className={`absolute ${size === 'sm' ? 'w-[19px]' : 'w-[22px]'} h-[2px] bg-gray-400 rotate-45 rounded-full`} />}
        </button>
      ))}
      {hint && (
        <span
          role="status"
          data-testid="termine-filter-hint"
          className="absolute top-full right-0 mt-1.5 z-30 whitespace-nowrap rounded-lg bg-[#0a3a2a] text-[#fed33e] text-[11px] font-black px-2.5 py-1 shadow-md animate-fade-in-up"
        >
          {hint}
        </span>
      )}
    </div>
  );
}
