import React from 'react';
import { useTranslation } from 'react-i18next';
import { ARROW_COLORS } from '../../config/arrowColors';

// [KOLORY STRZAŁ] Filtr nad tarczami rund (user 2026-10-29): dotknięcie np. zielonej
// pokazuje na tarczach tylko pierwsze strzały ze wszystkich serii. Drugie
// dotknięcie tej samej albo „Alle” wraca do wszystkich. Wartość = miejsce w serii.
export default function ArrowColorFilter({ value, onChange, count = 6, bare = false }: {
  value: number | null;
  onChange: (v: number | null) => void;
  count?: number; // strzał w serii — 3-strzałowe serie pokazują 3 kolory
  bare?: boolean; // wewnątrz innej karty (Trefferbild po treningu) — bez własnej ramki
}) {
  const { t } = useTranslation();
  const colors = ARROW_COLORS.slice(0, count);
  return (
    <div className={bare ? 'w-full' : 'bg-white border border-gray-200 rounded-2xl px-2.5 pt-2 pb-2 shadow-sm'}>
      <span className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1.5">{t('scoring.colorFilter')}</span>
      <div className="flex items-center justify-between gap-1">
      <button
        onClick={() => onChange(null)}
        className={`px-2.5 h-7 rounded-full text-[10px] font-black border transition-all active:scale-95 ${value === null ? 'bg-[#0a3a2a] border-[#0a3a2a] text-white' : 'bg-white border-gray-200 text-gray-500'}`}
        aria-pressed={value === null}
      >
        {t('scoring.colorFilterAll')}
      </button>
      {colors.map((c, i) => {
        const on = value === i;
        return (
          <button
            key={c.id}
            onClick={() => onChange(on ? null : i)}
            className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-black border-2 transition-all active:scale-90 ${on ? 'border-[#0a3a2a] scale-110 shadow-md' : 'border-gray-300'} ${value !== null && !on ? 'opacity-40' : ''}`}
            style={{ backgroundColor: c.hex, color: c.text }}
            aria-pressed={on}
            aria-label={t('scoring.colorFilterArrow', { n: i + 1 })}
          >
            {i + 1}
          </button>
        );
      })}
      </div>
    </div>
  );
}
