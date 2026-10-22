import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

// [LINKI W TEMACIE] (user 2026-10-16) Linki od trenera jako ikony. Klik =
// okno z pełnym adresem i pytaniem, czy wejść — dopiero wtedy przeglądarka
// łączy się z obcą stroną (RODO: bez osadzania, bez miniatur, bez referera).

export const isYouTube = (href: string) => {
  try {
    const h = new URL(href).hostname.replace(/^www\.|^m\./, '');
    return h === 'youtube.com' || h === 'youtu.be' || h === 'music.youtube.com';
  } catch { return false; }
};

// tone 'coach' (user 2026-10-16): trener sam otwiera swoje linki ponownie —
// różowy (rola trenera) i tekst bez „Twój trener dodał”.
export default function TopicLinks({ links, titles, className = '', tone = 'student', small = false }: {
  links?: string[];
  /** Tytuły linków (ten sam indeks) — z tytułem link jest pigułką z napisem zamiast samej ikony. */
  titles?: string[];
  className?: string;
  tone?: 'student' | 'coach';
  small?: boolean;
}) {
  const { t } = useTranslation();
  const coach = tone === 'coach';
  const [pending, setPending] = useState<{ href: string; title: string } | null>(null);
  if (!links?.length) return null;

  const open = () => {
    if (pending) window.open(pending.href, '_blank', 'noopener,noreferrer');
    setPending(null);
  };

  return (
    <>
      <div className={`flex flex-wrap items-center gap-1.5 min-w-0 ${className}`}>
        {links.map((href, i) => {
          const yt = isYouTube(href);
          const title = titles?.[i] || '';
          return (
            <button
              key={href + i}
              type="button"
              onClick={e => { e.stopPropagation(); setPending({ href, title }); }}
              aria-label={t(coach ? 'tagebuch.linkLabelCoach' : 'tagebuch.linkLabel', { n: i + 1 })}
              title={t(coach ? 'tagebuch.linkLabelCoach' : 'tagebuch.linkLabel', { n: i + 1 })}
              className={`${title ? `max-w-full min-w-0 gap-1 pl-1.5 pr-2.5 ${small ? 'h-7' : 'h-8'}` : `${small ? 'w-7 h-7' : 'w-8 h-8'} shrink-0`} rounded-full bg-white border flex items-center justify-center active:scale-90 transition-all ${coach ? 'border-rose-200 text-rose-600' : 'border-violet-200 text-violet-600'}`}
            >
              <span className={`material-symbols-outlined shrink-0 ${small ? 'text-[16px]' : 'text-[18px]'}`}>{yt ? 'smart_display' : 'open_in_new'}</span>
              {title && <span className="truncate text-[11px] font-bold text-[#0a3a2a]">{title}</span>}
            </button>
          );
        })}
      </div>

      {pending && createPortal(
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[500000] flex items-center justify-center p-4 animate-fade-in" onClick={e => { e.stopPropagation(); setPending(null); }}>
          <div className="bg-white rounded-[32px] p-6 w-full max-w-[360px] shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-3">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${coach ? 'bg-rose-500' : 'bg-violet-500'}`}>
                <span className="material-symbols-outlined text-white">{isYouTube(pending.href) ? 'smart_display' : 'open_in_new'}</span>
              </div>
              <h2 className="text-lg font-black text-[#0a3a2a] leading-tight">{t('tagebuch.linkOpenTitle')}</h2>
            </div>
            {pending.title && <p className="text-[13px] font-black text-[#0a3a2a] leading-snug mb-2 break-words">{pending.title}</p>}
            <p className="text-[12px] font-bold text-[#0a3a2a] bg-gray-50 border border-gray-200 rounded-xl p-3 break-all select-all">{pending.href}</p>
            <p className="text-[10px] font-bold text-gray-500 leading-snug mt-2">{t(coach ? 'tagebuch.linkOpenDescCoach' : 'tagebuch.linkOpenDesc')}</p>
            <div className="flex gap-2 mt-4">
              <button onClick={() => setPending(null)} className="flex-1 py-3 bg-gray-100 text-gray-500 rounded-xl font-black text-[10px] uppercase tracking-widest active:scale-95">
                {t('tagebuch.linkCancel')}
              </button>
              <button onClick={open} className={`flex-1 py-3 ${coach ? 'bg-rose-600' : 'bg-violet-600'} text-white rounded-xl font-black text-[10px] uppercase tracking-widest active:scale-95 shadow-md`}>
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
