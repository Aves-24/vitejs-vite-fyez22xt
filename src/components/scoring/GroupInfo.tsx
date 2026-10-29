import React from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

// [BIOMECHANIK → TREFFERBILD] Okno (i) przy grupie na tarczy (2026-10-29, wariant A):
// przy pojedynczym treningu podpowiedzi dawnej karty Biomechanik siedzą tu.
//  - 'axis'   — oś błędu: pełne wskazówki „Dominanter Fehler” (Sehnenbild, Anker…)
//  - 'offset' — przesunięcie grupy: w jednym treningu to sprawa celownika; technika
//               dopiero przy stałym przesunięciu przez kilka treningów (Pro Progress)
export default function GroupInfo({ mode, axis, onClose }: {
  mode: 'axis' | 'offset';
  axis?: 'vert' | 'horiz' | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  if (typeof document === 'undefined') return null;
  const isAxis = mode === 'axis';

  return createPortal(
    <div className="fixed inset-0 z-[200000] flex items-start justify-center pt-12 pb-6 px-4 bg-black/40 backdrop-blur-sm overflow-y-auto" onClick={onClose}>
      <div className="bg-white rounded-[32px] w-full max-w-md p-6 shadow-2xl" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="group-info-title">
        <div className="flex items-center gap-3 mb-4">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${isAxis ? 'bg-orange-500' : 'bg-[#0a3a2a]'}`}>
            <span className={`material-symbols-outlined text-[18px] ${isAxis ? 'text-white' : 'text-[#fed33e]'}`}>{isAxis ? 'scatter_plot' : 'my_location'}</span>
          </div>
          <h2 id="group-info-title" className="text-[13px] font-black text-[#0a3a2a] uppercase tracking-widest">
            {isAxis ? t('stats.cards.bio.errorTitle') : t('scoring.group.offsetInfo.title')}
          </h2>
        </div>

        {isAxis ? (
          <>
            <div className="text-sm font-black text-[#0a3a2a] mb-3">{axis ? t(`scoring.group.axis.${axis}`) : ''}</div>
            <p className="text-[12px] font-bold text-gray-500 leading-relaxed mb-4">{t('stats.cards.bio.errorAbout')}</p>
            <div className="bg-[#0a3a2a]/5 border border-[#0a3a2a]/10 rounded-2xl p-3 mb-3">
              <p className="text-[11px] font-bold text-[#0a3a2a] leading-relaxed">{t('stats.cards.bio.coachFirst')}</p>
            </div>
            <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-2">{t('stats.cards.bio.whatToDo')}</p>
            <div className="bg-gray-50 border border-gray-100 rounded-2xl p-3">
              <p className="text-[11px] font-bold text-[#0a3a2a] leading-relaxed">{t(axis === 'horiz' ? 'stats.cards.bio.errHoriz' : 'stats.cards.bio.errVert')}</p>
            </div>
          </>
        ) : (
          <>
            <p className="text-[12px] font-bold text-gray-600 leading-relaxed">{t('scoring.group.offsetInfo.single')}</p>
            <div className="flex items-start gap-2 bg-emerald-50 border border-emerald-100 rounded-2xl px-3 py-2.5 mt-3">
              <span className="material-symbols-outlined text-emerald-600 text-[18px] shrink-0">my_location</span>
              <p className="text-[11px] font-black text-emerald-800 leading-snug">{t('scoring.sight.rule')}</p>
            </div>
            <p className="text-[12px] font-bold text-gray-500 leading-relaxed mt-3">{t('scoring.group.offsetInfo.multi')}</p>
            <p className="text-[11px] font-bold text-gray-400 leading-relaxed mt-3">{t('scoring.group.offsetInfo.howMeasured')}</p>
          </>
        )}

        <button onClick={onClose} className="w-full mt-5 py-3 bg-[#0a3a2a] text-white rounded-2xl text-[11px] font-black uppercase tracking-widest active:scale-95 transition-all">
          OK
        </button>
      </div>
    </div>,
    document.body
  );
}
