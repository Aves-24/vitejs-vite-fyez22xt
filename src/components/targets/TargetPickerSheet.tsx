import React from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { TargetThumbnail } from './TargetThumbnail';
import { formatRange } from '../../config/targetDistanceRanges';
import { useBackClose } from '../../hooks/useBackClose';

/**
 * [WYBÓR TARCZY 2026-11-09] Okienko z listą tarcz i ich obrazkami (prośba
 * usera: w Einstellungen → DISTANZEN systemowy `<select>` pokazywał na
 * telefonie szarą listę bez obrazków). Kafelki rysują TĄ SAMĄ miniaturą co
 * Vorbereitung, więc nowa tarcza w katalogu pojawia się tu sama.
 */
export function TargetPickerSheet({
  options, value, onSelect, onClose, title,
}: {
  options: string[];
  value: string;
  onSelect: (id: string) => void;
  onClose: () => void;
  title?: string;
}) {
  const { t } = useTranslation();
  useBackClose(true, onClose);
  return createPortal(
    <div className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div
        role="dialog"
        aria-label={title || t('settings.sight.target')}
        className="relative w-full max-w-md bg-white rounded-t-3xl sm:rounded-3xl p-4 pb-[calc(env(safe-area-inset-bottom)+16px)] shadow-2xl max-h-[85vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[15px] font-black text-[#0a3a2a]">{title || t('settings.sight.target')}</h2>
          <button onClick={onClose} aria-label={t('common.close')} className="w-9 h-9 rounded-full bg-gray-100 text-gray-500 flex items-center justify-center active:scale-90">
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {options.map(id => {
            const on = id === value;
            const range = formatRange(id);
            return (
              <button
                key={id}
                onClick={() => { onSelect(id); onClose(); }}
                aria-pressed={on}
                className={`flex flex-col items-center gap-1.5 rounded-2xl border p-2 active:scale-95 transition-all ${on ? 'border-emerald-500 bg-emerald-50 shadow-sm' : 'border-gray-100 bg-white'}`}
              >
                <TargetThumbnail targetType={id} className="w-14 h-14" />
                <span className="text-[11px] font-black text-[#0a3a2a] leading-tight text-center">{id}</span>
                {range && <span className="text-[9px] font-bold text-gray-400 leading-none">{range}</span>}
              </button>
            );
          })}
        </div>
      </div>
    </div>,
    document.body,
  );
}
