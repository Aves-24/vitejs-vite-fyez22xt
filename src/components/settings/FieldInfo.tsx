import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

/**
 * [ZESTAWY] Ikona (i) przy polu sprzętowym — etap 5.
 *
 * Dwa zdania wg stałego wzoru: „co to jest" + „co się stanie, jak zmienisz".
 * Drugie zdanie jest ważniejsze od pierwszego — definicję łucznik zna,
 * a konsekwencji zmiany zwykle nie.
 *
 * Ikona renderuje się WYŁĄCZNIE, gdy klucz tłumaczenia istnieje. Dzięki temu
 * podpowiedzi można dokładać warstwami, pole po polu, bez pustych dymków
 * i bez surowych kluczy w interfejsie. Wzorzec UI z `BiomechCard`.
 */

interface FieldInfoProps {
  /** Nazwa pola, np. `bow.lbs`. Klucze: settings.equipment.info.<pole>.what/.change */
  field: string;
}

const FieldInfo: React.FC<FieldInfoProps> = ({ field }) => {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);

  const whatKey = `settings.equipment.info.${field}.what`;
  const changeKey = `settings.equipment.info.${field}.change`;

  // Brak opisu = brak ikony. Nie pokazujemy dymka, żeby powiedzieć „nic tu nie ma".
  if (!i18n.exists(whatKey)) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t('settings.equipment.info.aria')}
        className="w-5 h-5 rounded-full bg-gray-200 flex items-center justify-center active:scale-90 transition-all shrink-0"
      >
        <span className="material-symbols-outlined text-gray-600 text-[12px]">info</span>
      </button>

      {open && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-[100000] flex items-start justify-center pt-16 px-4 bg-black/50 backdrop-blur-sm animate-fade-in overflow-y-auto"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-white dark:bg-[#1a201d] rounded-[32px] w-full max-w-md p-6 shadow-2xl my-8"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-[#0a3a2a] flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-white text-[18px]">info</span>
              </div>
              <h2 className="text-[13px] font-black text-[#0a3a2a] dark:text-white uppercase tracking-widest">
                {t(`settings.equipment.info.${field}.title`, { defaultValue: t('settings.equipment.info.aria') })}
              </h2>
            </div>

            <p className="text-[12px] font-bold text-gray-500 dark:text-gray-300 leading-relaxed mb-4">
              {t(whatKey)}
            </p>

            {i18n.exists(changeKey) && (
              <>
                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-2">
                  {t('settings.equipment.info.ifYouChange')}
                </p>
                <div className="bg-[#0a3a2a]/5 dark:bg-white/5 border border-[#0a3a2a]/10 dark:border-white/10 rounded-2xl p-3 mb-4">
                  <p className="text-[11px] font-bold text-[#0a3a2a] dark:text-[#9adbc0] leading-relaxed">
                    {t(changeKey)}
                  </p>
                </div>
              </>
            )}

            <button
              onClick={() => setOpen(false)}
              className="w-full py-3 rounded-2xl bg-[#0a3a2a] text-white text-[11px] font-black uppercase tracking-widest active:scale-95 transition-all"
            >
              {t('settings.equipment.info.close')}
            </button>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
};

export default FieldInfo;
