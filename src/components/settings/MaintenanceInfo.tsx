import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { maintenanceTextKey, MaintenanceTextPart } from '../../config/maintenanceTasks';

/**
 * [WARTUNG] Ikona (i) przy czynności konserwacji — warunek usera 2026-10-30:
 * „przy wszystkim ma być (i), żeby dokładnie wytłumaczyć co i jak”.
 *
 * W odróżnieniu od `FieldInfo` (dwa zdania) tu jest pełna instrukcja:
 * po co / jak (kroki) / uwaga / wskazówka. Każda część jest opcjonalna
 * poza tytułem. `taskId` = 'howItWorks' pokazuje opis samej funkcji.
 *
 * Używana w Ustawieniach (zakładka WARTUNG) i w kalendarzu przy wpisie.
 */

interface MaintenanceInfoProps {
  taskId: string;
  discipline?: string | null;
  /** Zamiast ikony (i) — np. pełnoszerokościowy przycisk w kalendarzu. */
  trigger?: (open: () => void) => React.ReactNode;
}

const SECTIONS: { part: Exclude<MaintenanceTextPart, 'title'>; icon: string; labelKey: string; tone: string }[] = [
  { part: 'why', icon: 'info', labelKey: 'maintenance.info.why', tone: 'text-gray-600 dark:text-gray-300' },
  { part: 'how', icon: 'build', labelKey: 'maintenance.info.how', tone: 'text-[#0a3a2a] dark:text-white' },
  { part: 'warn', icon: 'warning', labelKey: 'maintenance.info.warn', tone: 'text-red-700 dark:text-red-300' },
  { part: 'tip', icon: 'lightbulb', labelKey: 'maintenance.info.tip', tone: 'text-[#0a3a2a] dark:text-[#9adbc0]' },
];

const BOX: Record<string, string> = {
  why: 'bg-gray-50 dark:bg-white/5 border-gray-100 dark:border-white/10',
  how: 'bg-[#0a3a2a]/5 dark:bg-white/5 border-[#0a3a2a]/10 dark:border-white/10',
  warn: 'bg-red-50 dark:bg-red-500/10 border-red-100 dark:border-red-500/20',
  tip: 'bg-amber-50 dark:bg-amber-500/10 border-amber-100 dark:border-amber-500/20',
};

const MaintenanceInfo: React.FC<MaintenanceInfoProps> = ({ taskId, discipline, trigger }) => {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const exists = (k: string) => i18n.exists(k);
  const key = (part: MaintenanceTextPart) => maintenanceTextKey(taskId, part, discipline, exists);

  return (
    <>
      {trigger ? trigger(() => setOpen(true)) : (
        <button
          type="button"
          onClick={e => { e.stopPropagation(); setOpen(true); }}
          aria-label={t('maintenance.info.aria')}
          className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center active:scale-90 transition-all shrink-0"
        >
          <span className="material-symbols-outlined text-gray-600 text-[14px]">info</span>
        </button>
      )}

      {open && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-[400000] flex items-start justify-center pt-12 px-4 bg-black/50 backdrop-blur-sm animate-fade-in overflow-y-auto"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-white dark:bg-[#1a201d] rounded-[32px] w-full max-w-md p-6 shadow-2xl my-6"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-[#0a3a2a] flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-white text-[18px]">build</span>
              </div>
              <h2 className="text-[14px] font-black text-[#0a3a2a] dark:text-white leading-tight">
                {t(key('title'))}
              </h2>
            </div>

            <div className="space-y-3 mb-4">
              {SECTIONS.filter(s => exists(key(s.part))).map(s => (
                <div key={s.part} className={`border rounded-2xl p-3 ${BOX[s.part]}`}>
                  <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1.5 flex items-center gap-1">
                    <span className="material-symbols-outlined text-[13px]">{s.icon}</span>
                    {t(s.labelKey)}
                  </p>
                  <p className={`text-[12px] font-bold leading-relaxed whitespace-pre-line ${s.tone}`}>
                    {t(key(s.part))}
                  </p>
                </div>
              ))}
            </div>

            <button
              onClick={() => setOpen(false)}
              className="w-full py-3 rounded-2xl bg-[#0a3a2a] text-white text-[11px] font-black uppercase tracking-widest active:scale-95 transition-all"
            >
              {t('maintenance.info.close')}
            </button>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
};

export default MaintenanceInfo;
