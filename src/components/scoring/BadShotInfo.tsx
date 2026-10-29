import React from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

// [FEHLSCHUSS] Okno (i) przy tabeli serii (user 2026-10-29): co to jest zły
// strzał, jak go oznaczyć i na co wpływa w aplikacji. Styl jak okno (i)
// korekty celownika w Statystykach.

function Cell({ v, state }: { v: string; state: 'off' | 'on' }) {
  return (
    <span className={`relative w-9 h-8 rounded-md flex items-center justify-center text-[12px] font-bold bg-[#F2C94C] text-[#333] ${state === 'on' ? 'ring-2 ring-red-500 ring-inset' : ''}`}>
      {v}
      <span className={`absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full flex items-center justify-center border shadow-sm ${state === 'on' ? 'bg-red-500 border-red-600 text-white' : 'bg-white border-gray-300 text-gray-400'}`}>
        <span className="material-symbols-outlined text-[10px] leading-none">flag</span>
      </span>
    </span>
  );
}

export default function BadShotInfo({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  if (typeof document === 'undefined') return null;
  const affected = ['group', 'sight', 'axis', 'arrows', 'trend', 'spread'] as const;

  return createPortal(
    <div className="fixed inset-0 z-[200000] flex items-start justify-center pt-12 pb-6 bg-black/40 backdrop-blur-sm overflow-y-auto" onClick={onClose}>
      <div className="bg-white rounded-[32px] w-full max-w-md mx-4 p-6 shadow-2xl" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="badshot-info-title">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-red-500 flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-white text-[18px]">flag</span>
          </div>
          <h2 id="badshot-info-title" className="text-[13px] font-black text-[#0a3a2a] uppercase tracking-widest">{t('scoring.badShot.info.title')}</h2>
        </div>

        {/* Co to jest */}
        <p className="text-[12px] font-bold text-gray-600 leading-relaxed">{t('scoring.badShot.info.what')}</p>
        <p className="text-[11px] font-bold text-gray-400 leading-relaxed mt-1.5">{t('scoring.badShot.info.notWhat')}</p>

        {/* Jak oznaczyć */}
        <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mt-5 mb-2">{t('scoring.badShot.info.howTitle')}</p>
        <div className="bg-gray-50 border border-gray-100 rounded-2xl p-3 flex items-center gap-3">
          <div className="flex gap-2 shrink-0"><Cell v="9" state="off" /><span className="material-symbols-outlined text-gray-300 text-[16px] self-center">arrow_forward</span><Cell v="9" state="on" /></div>
          <p className="text-[11px] font-bold text-gray-600 leading-snug">{t('scoring.badShot.info.how')}</p>
        </div>
        <p className="text-[11px] font-bold text-gray-500 leading-relaxed mt-2">{t('scoring.badShot.info.when')}</p>

        {/* Na co wpływa */}
        <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mt-5 mb-2">{t('scoring.badShot.info.effectTitle')}</p>
        <div className="flex items-start gap-2 bg-emerald-50 border border-emerald-100 rounded-2xl px-3 py-2.5">
          <span className="material-symbols-outlined text-emerald-600 text-[18px] shrink-0">check_circle</span>
          <p className="text-[11px] font-black text-emerald-800 leading-snug">{t('scoring.badShot.info.scoreStays')}</p>
        </div>
        <p className="text-[11px] font-black text-[#0a3a2a] mt-3 mb-1.5">{t('scoring.badShot.info.excludedTitle')}</p>
        <ul className="space-y-1.5">
          {affected.map(k => (
            <li key={k} className="flex items-start gap-2 text-[11px] font-bold text-gray-600 leading-snug">
              <span className="material-symbols-outlined text-red-500 text-[14px] shrink-0 mt-px">block</span>
              {t(`scoring.badShot.info.ex.${k}`)}
            </li>
          ))}
        </ul>
        <p className="text-[11px] font-bold text-gray-500 leading-relaxed mt-3">{t('scoring.badShot.info.shown')}</p>

        <div className="bg-[#0a3a2a]/5 border border-[#0a3a2a]/10 rounded-2xl p-3 mt-4">
          <p className="text-[11px] font-black text-[#0a3a2a] leading-relaxed">{t('scoring.badShot.info.tip')}</p>
        </div>

        <button onClick={onClose} className="w-full mt-5 py-3 bg-[#0a3a2a] text-white rounded-2xl text-[11px] font-black uppercase tracking-widest active:scale-95 transition-all">
          OK
        </button>
      </div>
    </div>,
    document.body
  );
}
