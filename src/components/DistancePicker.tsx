import React from 'react';
import { UserDistance } from '../config/distances';

interface DistancePickerProps {
  options: UserDistance[];
  /** `distanceId` → hex koloru zestawu; brak wpisu = dystans wspólny, bez kropki. */
  colors: Map<string, string>;
  selectedId?: string;
  onPick: (d: UserDistance) => void;
}

/**
 * [ZAWODY] Wybór dystansu z listy usera — kalendarz i historyczny start.
 *
 * Do 2026-09-10 oba formularze miały listę zaszytą na sztywno, więc zawodów na
 * własnym dystansie (np. „18m barebow", dmuchawka) nie dało się wpisać. Metry
 * idą pierwszą linijką, etykieta drugą — jak na starcie treningu, bo
 * „18m barebow" w jednym wierszu nie mieści się w kafelku.
 */
export default function DistancePicker({ options, colors, selectedId, onPick }: DistancePickerProps) {
  return (
    <div className="grid grid-cols-4 gap-1">
      {options.map(d => {
        const on = d.id === selectedId;
        const hex = colors.get(d.id);
        return (
          <button
            key={d.id}
            type="button"
            onClick={() => onPick(d)}
            aria-pressed={on}
            className={`py-1.5 px-1 rounded-xl text-[10px] font-black border transition-all min-w-0 ${on ? 'bg-emerald-100 border-emerald-500 text-emerald-700' : 'bg-gray-50 border-transparent text-gray-400'}`}
          >
            <span className="flex items-center justify-center gap-1 leading-none">
              {hex && <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: hex }} />}
              {d.m}
            </span>
            {d.label && <span className="block text-[8px] font-bold uppercase tracking-wide opacity-70 mt-0.5 truncate">{d.label}</span>}
          </button>
        );
      })}
    </div>
  );
}
