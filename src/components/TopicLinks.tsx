import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

// [LINKI W TEMACIE] (user 2026-10-16) Linki od trenera jako ikony. Klik =
// okno z pełnym adresem i pytaniem, czy wejść — dopiero wtedy przeglądarka
// łączy się z obcą stroną (RODO: bez osadzania, bez miniatur, bez referera).

const isYouTube = (href: string) => {
  try {
    const h = new URL(href).hostname.replace(/^www\.|^m\./, '');
    return h === 'youtube.com' || h === 'youtu.be' || h === 'music.youtube.com';
  } catch { return false; }
};

export default function TopicLinks({ links, className = '' }: { links?: string[]; className?: string }) {
  const { t } = useTranslation();
  const [pending, setPending] = useState<string | null>(null);
  if (!links?.length) return null;

  const open = () => {
    if (pending) window.open(pending, '_blank', 'noopener,noreferrer');
    setPending(null);
  };

  return (
    <>
      <div className={`flex items-center gap-1.5 ${className}`}>
        {links.map((href, i) => {
          const yt = isYouTube(href);
          return (
            <button
              key={href + i}
              type="button"
              onClick={e => { e.stopPropagation(); setPending(href); }}
              aria-label={t('tagebuch.linkLabel', { n: i + 1 })}
              title={t('tagebuch.linkLabel', { n: i + 1 })}
              className="w-8 h-8 rounded-full bg-white border border-violet-200 text-violet-600 flex items-center justify-center active:scale-90 transition-all"
            >
              <span className="material-symbols-outlined text-[18px]">{yt ? 'smart_display' : 'link'}</span>
            </button>
          );
        })}
      </div>

      {pending && createPortal(
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[500000] flex items-center justify-center p-4 animate-fade-in" onClick={() => setPending(null)}>
          <div className="bg-white rounded-[32px] p-6 w-full max-w-[360px] shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-violet-500 flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-white">{isYouTube(pending) ? 'smart_display' : 'open_in_new'}</span>
              </div>
              <h2 className="text-lg font-black text-[#0a3a2a] leading-tight">{t('tagebuch.linkOpenTitle')}</h2>
            </div>
            <p className="text-[12px] font-bold text-[#0a3a2a] bg-gray-50 border border-gray-200 rounded-xl p-3 break-all select-all">{pending}</p>
            <p className="text-[10px] font-bold text-gray-500 leading-snug mt-2">{t('tagebuch.linkOpenDesc')}</p>
            <div className="flex gap-2 mt-4">
              <button onClick={() => setPending(null)} className="flex-1 py-3 bg-gray-100 text-gray-500 rounded-xl font-black text-[10px] uppercase tracking-widest active:scale-95">
                {t('tagebuch.linkCancel')}
              </button>
              <button onClick={open} className="flex-1 py-3 bg-violet-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest active:scale-95 shadow-md">
                {t('tagebuch.linkOpen')}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
