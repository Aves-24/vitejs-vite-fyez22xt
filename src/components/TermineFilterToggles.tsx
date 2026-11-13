// [TERMINE] Co pokazać obok własnych terminów trenera — te same ikonki w Liste i Monat
// (user 2026-11-13). Same ikonki: podpisy nie mieszczą się na telefonie obok Liste/Monat;
// wyłączone = szare i przekreślone, opis w title/aria-label.
export interface TermineFilter {
  on: boolean;
  toggle: () => void;
  icon: string;
  label: string;
  testId: string;
  hidden?: boolean;
}

export default function TermineFilterToggles({ filters }: { filters: TermineFilter[] }) {
  return (
    <div className="flex items-center gap-1.5">
      {filters.filter(b => !b.hidden).map(b => (
        <button
          key={b.testId}
          type="button"
          data-testid={b.testId}
          aria-pressed={b.on}
          aria-label={b.label}
          title={b.label}
          onClick={b.toggle}
          className={`relative w-9 h-9 rounded-xl flex items-center justify-center active:scale-95 transition-all border ${
            b.on ? 'bg-[#0a3a2a] text-[#fed33e] border-[#0a3a2a]' : 'bg-white text-gray-400 border-gray-200'
          }`}
        >
          <span className="material-symbols-outlined text-[18px]">{b.icon}</span>
          {!b.on && <span aria-hidden className="absolute w-[22px] h-[2px] bg-gray-400 rotate-45 rounded-full" />}
        </button>
      ))}
    </div>
  );
}
