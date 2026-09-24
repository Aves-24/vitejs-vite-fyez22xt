import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { PENDING_WRITES_EVENT, WRITE_FAILED_EVENT, pendingWriteCount } from '../utils/offlineWrite';

// [C41] Pasek „offline — zapisy czekaja w telefonie". Bez niego zapis bez
// zasiegu wygladal jak zgubiony: przycisk wracal, a w statystykach niby jest,
// ale nic nie mowilo, ze serwer jeszcze go nie ma. Liczy zapisy wydane przez
// `settleWrite` — te, na ktore UI przestalo czekac.
// `hidden` w treningu i Delay Mirror — tam pasek zaslanialby naglowek, a Delay
// Mirror ma wlasny wskaznik synchronizacji.
export default function OfflineBanner({ hidden }: { hidden: boolean }) {
  const { t } = useTranslation();
  const [online, setOnline] = useState(() => navigator.onLine);
  const [pending, setPending] = useState(pendingWriteCount);
  const [flash, setFlash] = useState<'sent' | 'failed' | null>(null);
  const hadPending = useRef(false);

  useEffect(() => {
    const onNet = () => setOnline(navigator.onLine);
    const onPending = () => setPending(pendingWriteCount());
    const onFailed = () => setFlash('failed');
    window.addEventListener('online', onNet);
    window.addEventListener('offline', onNet);
    window.addEventListener(PENDING_WRITES_EVENT, onPending);
    window.addEventListener(WRITE_FAILED_EVENT, onFailed);
    return () => {
      window.removeEventListener('online', onNet);
      window.removeEventListener('offline', onNet);
      window.removeEventListener(PENDING_WRITES_EVENT, onPending);
      window.removeEventListener(WRITE_FAILED_EVENT, onFailed);
    };
  }, []);

  // Kolejka sie oproznila → krotkie „Wyslane".
  useEffect(() => {
    if (pending > 0) { hadPending.current = true; return; }
    if (hadPending.current) {
      hadPending.current = false;
      setFlash(f => f ?? 'sent');
    }
  }, [pending]);

  useEffect(() => {
    if (!flash) return;
    const id = setTimeout(() => setFlash(null), flash === 'failed' ? 6000 : 2500);
    return () => clearTimeout(id);
  }, [flash]);

  let icon = 'cloud_off';
  let text: string | null = null;
  let tone = 'bg-[#0a3a2a] text-white';
  if (flash === 'failed') {
    icon = 'error'; text = t('offline.failed'); tone = 'bg-red-600 text-white';
  } else if (pending > 0) {
    icon = online ? 'cloud_upload' : 'cloud_off';
    text = online ? t('offline.sending', { count: pending }) : t('offline.queued', { count: pending });
  } else if (!online) {
    text = t('offline.noNetwork');
  } else if (flash === 'sent') {
    icon = 'cloud_done'; text = t('offline.sent');
  }

  if (hidden || !text) return null;

  return createPortal(
    <div className="fixed top-[calc(env(safe-area-inset-top)+0.5rem)] inset-x-0 z-[999] px-3 flex justify-center pointer-events-none" role="status" aria-live="polite">
      <div className={`max-w-sm rounded-full shadow-lg flex items-center gap-1.5 px-3 py-1.5 ${tone}`}>
        <span className="material-symbols-outlined text-[16px] shrink-0">{icon}</span>
        <span className="text-[11px] font-black leading-tight">{text}</span>
      </div>
    </div>,
    document.body
  );
}
