import React from 'react';
import { useTranslation } from 'react-i18next';
import { animalPoints, ANIMAL_MAX_ARROWS, type AnimalHit } from '../../config/animalRound';

// [ANIMAL ROUND 2026-11-10] Trzy duże przyciski zamiast klawiatury z punktami:
// Kill / Wound / Miss. Punkty wynikają z numeru strzały (20/14/8, 16/10/4),
// więc na przycisku widać, ile da TA strzała. Trafienie zamyka stanowisko.
export default function AnimalKeypad({ arrowIndex, onShot, onUndo }: {
  arrowIndex: number;
  onShot: (hit: AnimalHit | 'M') => void;
  onUndo: () => void;
}) {
  const { t } = useTranslation();
  const n = Math.min(arrowIndex, ANIMAL_MAX_ARROWS - 1);
  const big = 'rounded-2xl flex flex-col items-center justify-center active:scale-95 transition-all shadow-sm';
  return (
    <div className="flex flex-col gap-1.5 h-full w-full" data-testid="animal-keypad">
      <div className="text-center text-[10px] font-black uppercase tracking-widest text-gray-400">{t('animal.arrowN', { n: n + 1 })}</div>
      <div className="grid grid-cols-2 gap-1.5 flex-1">
        <button onClick={() => onShot('K')} className={`${big} bg-[#F2C94C] text-[#333]`} aria-label={`${t('animal.kill')} ${animalPoints(n, 'K')}`}>
          <span className="text-2xl font-black leading-none">{animalPoints(n, 'K')}</span>
          <span className="text-[11px] font-black uppercase tracking-widest">{t('animal.kill')}</span>
          <span className="text-[9px] font-bold opacity-60">{t('animal.killHint')}</span>
        </button>
        <button onClick={() => onShot('W')} className={`${big} bg-white border border-gray-200 text-[#333]`} aria-label={`${t('animal.wound')} ${animalPoints(n, 'W')}`}>
          <span className="text-2xl font-black leading-none">{animalPoints(n, 'W')}</span>
          <span className="text-[11px] font-black uppercase tracking-widest">{t('animal.wound')}</span>
          <span className="text-[9px] font-bold opacity-60">{t('animal.woundHint')}</span>
        </button>
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
