import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { SW_UPDATE_EVENT, applyUpdate, isUpdateReady } from '../utils/swUpdate';

// `hidden` w trakcie treningu — przeładowanie zabrałoby wpisywane strzały.
export default function UpdateBanner({ hidden }: { hidden: boolean }) {
  const { t } = useTranslation();
  const [ready, setReady] = useState(isUpdateReady);
  const [dismissed, setDismissed] = useState(false);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    const onReady = () => setReady(true);
    window.addEventListener(SW_UPDATE_EVENT, onReady);
    return () => window.removeEventListener(SW_UPDATE_EVENT, onReady);
  }, []);

  if (!ready || dismissed || hidden) return null;

  return createPortal(
    <div className="fixed top-[calc(env(safe-area-inset-top)+0.75rem)] inset-x-0 z-[1000] px-3 flex justify-center pointer-events-none">
      <div className="pointer-events-auto w-full max-w-sm bg-[#0a3a2a] text-white rounded-2xl shadow-2xl border border-white/10 flex items-center gap-2 pl-3 pr-1.5 py-1.5">
        <span className="material-symbols-outlined text-[#fed33e] text-[20px] shrink-0">sync</span>
        <span className="flex-1 min-w-0 text-[12px] font-black leading-tight">{t('appUpdate.available')}</span>
        <button
          onClick={() => { setApplying(true); applyUpdate(); }}
          disabled={applying}
          className="shrink-0 h-8 px-3 rounded-xl bg-[#fed33e] text-[#0a3a2a] text-[11px] font-black uppercase tracking-wide active:scale-95 transition-all disabled:opacity-60"
        >
          {t('appUpdate.reload')}
        </button>
        <button
          onClick={() => setDismissed(true)}
          aria-label={t('appUpdate.later')}
          className="shrink-0 w-8 h-8 rounded-full text-white/60 flex items-center justify-center active:scale-90 transition-all"
        >
          <span className="material-symbols-outlined text-[18px]">close</span>
        </button>
      </div>
    </div>,
    document.body
  );
}
