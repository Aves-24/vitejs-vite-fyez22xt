import React from 'react';
import { useTranslation } from 'react-i18next';
import type { AnimalHit, AnimalFormat } from '../../config/animalRound';

// [ANIMAL ROUND 2026-11-10] Duże przyciski stref zamiast klawiatury z punktami:
// Kill / (Vital) / Wound|Körper / Miss. Punkty wynikają z formatu i numeru
// strzały (IFAA Animal 20/16/12 + 18/14/10, IFAA 3D Hunting 20/16/10,
// IFAA 3D Standard 10/8/5 ×2, DBSV Wald 15/10/5 + 12/7/2, DBSV Jagd 15/12),
// więc na przycisku widać, ile da TA strzała.

const ZONE_CLS: Record<AnimalHit, string> = {
  K: 'bg-[#F2C94C] text-[#333]',
  V: 'bg-[#EB5757] text-white',
  W: 'bg-white border border-gray-200 text-[#333]',
};
const HINT_KEY: Record<AnimalHit, string> = { K: 'animal.killHint', V: 'animal.vitalHint', W: 'animal.woundHint' };

export default function AnimalKeypad({ arrowIndex, onShot, onUndo, format }: {
  arrowIndex: number;
  onShot: (hit: AnimalHit | 'M') => void;
  onUndo: () => void;
  format: AnimalFormat;
}) {
  const { t } = useTranslation();
  const n = Math.min(arrowIndex, format.maxArrows - 1);
  const big = 'rounded-2xl flex flex-col items-center justify-center active:scale-95 transition-all shadow-sm';
  return (
    <div className="flex flex-col gap-1.5 h-full w-full" data-testid="animal-keypad">
      <div className="text-center text-[10px] font-black uppercase tracking-widest text-gray-400">
        {t('animal.arrowN', { n: n + 1 })}{format.maxArrows > 1 && !format.stopOnHit ? ` / ${format.maxArrows}` : ''}
      </div>
      <div className="grid gap-1.5 flex-1" style={{ gridTemplateColumns: `repeat(${format.zones.length}, minmax(0, 1fr))` }}>
        {format.zones.map(z => {
          const pts = z.pts[n] ?? 0;
          const label = t(z.key);
          return (
            <button key={z.hit} onClick={() => onShot(z.hit)} className={`${big} ${ZONE_CLS[z.hit]}`} aria-label={`${label} ${pts}`}>
              <span className="text-2xl font-black leading-none">{pts}</span>
              <span className="text-[11px] font-black uppercase tracking-widest">{label}</span>
              <span className="text-[9px] font-bold opacity-60 text-center px-1">{t(HINT_KEY[z.hit])}</span>
            </button>
          );
        })}
      </div>
      <div className="grid grid-cols-[2fr_1fr] gap-1.5 h-14 shrink-0">
        <button onClick={() => onShot('M')} className={`${big} bg-indigo-900 text-white`} aria-label={t('animal.miss')}>
          <span className="text-[13px] font-black uppercase tracking-widest">{t('animal.miss')}</span>
          <span className="text-[9px] font-bold opacity-70">{t('animal.missHint')}</span>
        </button>
        <button onClick={onUndo} className="rounded-2xl bg-white border border-red-100 text-red-500 shadow-sm flex items-center justify-center active:scale-95 transition-all" aria-label="undo">
          <span className="material-symbols-outlined text-lg font-black">undo</span>
        </button>
      </div>
    </div>
  );
}
