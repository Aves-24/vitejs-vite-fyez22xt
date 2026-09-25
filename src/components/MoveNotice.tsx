import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { waitForPendingWrites } from 'firebase/firestore';
import { db } from '../firebase';
import { APP_HOST, APP_URL, isOldHost } from '../constants/appUrl';

// [C42] Przeprowadzka z Vercela na grotx.web.app. Na starym adresie aplikacja
// działa dalej, ale pokazuje tę kartę. Dane konta są w Firestore i nie zależą
// od adresu; w telefonie (osobno dla każdego adresu) zostaje tylko logowanie,
// ikona i zapisy offline — dlatego przed przejściem najpierw wysyłamy
// czekające zapisy, inaczej zostałyby w pamięci starego adresu.

const SNOOZE_KEY = 'grotX_moveSnoozeUntil';
const SNOOZE_MS = 24 * 60 * 60 * 1000;
const FLUSH_TIMEOUT_MS = 15000;

function isSnoozed(): boolean {
  try { return Number(localStorage.getItem(SNOOZE_KEY) || 0) > Date.now(); } catch { return false; }
}

// `hidden` w trakcie treningu — nie przerywamy wpisywania strzał.
export default function MoveNotice({ hidden }: { hidden: boolean }) {
  const { t } = useTranslation();
  const [snoozed, setSnoozed] = useState(isSnoozed);
  const [state, setState] = useState<'idle' | 'sending' | 'offline'>('idle');

  if (!isOldHost() || snoozed || hidden) return null;

  const later = () => {
    try { localStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_MS)); } catch { /* bez pamięci — pokaże się znowu */ }
    setSnoozed(true);
  };

  const open = async () => {
    if (!navigator.onLine) { setState('offline'); return; }
    setState('sending');
    let timer: ReturnType<typeof setTimeout> | undefined;
    const flushed = await Promise.race([
      waitForPendingWrites(db).then(() => true, () => true),
      new Promise<boolean>(resolve => { timer = setTimeout(() => resolve(false), FLUSH_TIMEOUT_MS); }),
    ]).finally(() => clearTimeout(timer));
    if (!flushed) { setState('offline'); return; }
    window.location.href = APP_URL;
  };

  return createPortal(
    <div className="fixed inset-0 z-[400000] bg-black/50 flex items-end sm:items-center justify-center p-3">
      <div className="w-full max-w-sm bg-white rounded-[28px] shadow-2xl p-5 space-y-3 mb-[env(safe-area-inset-bottom)]">
        <div className="flex items-center gap-3">
          <span className="w-10 h-10 rounded-full bg-[#fed33e] text-[#0a3a2a] flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-[22px]">home</span>
          </span>
          <h2 className="text-[16px] font-black text-[#0a3a2a] leading-tight">{t('appMove.title')}</h2>
        </div>
        <p className="text-[13px] font-bold text-gray-600 leading-snug">{t('appMove.body', { host: APP_HOST })}</p>
        <p className="text-[12px] font-bold text-gray-500 leading-snug">{t('appMove.steps')}</p>
        <p className="text-center text-[15px] font-black text-[#0a3a2a] bg-amber-50 border border-amber-200 rounded-xl py-2">{APP_HOST}</p>
        {state === 'offline' && (
          <p className="text-[11px] font-black text-red-600 leading-snug">{t('appMove.offline')}</p>
        )}
        <button
          onClick={open}
          disabled={state === 'sending'}
          className="w-full py-3 rounded-2xl bg-[#0a3a2a] text-white text-[11px] font-black uppercase tracking-widest active:scale-[0.98] transition-all disabled:opacity-60"
        >
          {state === 'sending' ? t('appMove.sending') : t('appMove.open')}
        </button>
        <button
          onClick={later}
          disabled={state === 'sending'}
          className="w-full py-2 text-[10px] font-black uppercase tracking-widest text-gray-400"
        >
          {t('appMove.later')}
        </button>
      </div>
    </div>,
    document.body
  );
}
