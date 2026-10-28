import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { ARROW_COLORS } from '../../config/arrowColors';

/**
 * [KOLORY STRZAŁ] Przełącznik w SPRZĘT → STRZAŁY + okienko (i) z grafiką.
 *
 * Opcja jest dla chętnych, więc opis musi sam wytłumaczyć cały system:
 * jak oznaczyć strzały, w jakiej kolejności strzelać i wpisywać, i co
 * z tego wynika. Grafika pokazuje sześć strzał z opaską przy lotkach.
 */

interface Props {
  enabled: boolean;
  onChange: (next: boolean) => void;
}

/** Sześć strzał pionowo, z kolorową opaską i numerem tuż pod lotkami. */
const ArrowsIllustration: React.FC = () => (
  <svg viewBox="0 0 300 190" className="w-full h-auto" role="img" aria-hidden="true">
    {ARROW_COLORS.map((c, i) => {
      const x = 30 + i * 48;
      return (
        <g key={c.id}>
          {/* nock */}
          <rect x={x - 3} y={8} width={6} height={8} rx={2} fill="#9ca3af" />
          {/* lotki */}
          <path d={`M ${x} 18 L ${x - 11} 30 L ${x - 11} 52 L ${x} 46 Z`} fill="#d1d5db" />
          <path d={`M ${x} 18 L ${x + 11} 30 L ${x + 11} 52 L ${x} 46 Z`} fill="#e5e7eb" />
          {/* rurka */}
          <rect x={x - 2.5} y={16} width={5} height={150} rx={2} fill="#6b7280" />
          {/* opaska pisakiem + numer */}
          <rect x={x - 8} y={60} width={16} height={26} rx={4} fill={c.hex} stroke="#0a3a2a" strokeWidth={1.5} />
          <text x={x} y={77} textAnchor="middle" fontSize={13} fontWeight={900} fill={c.text}>{i + 1}</text>
          {/* grot */}
          <path d={`M ${x - 4} 166 L ${x + 4} 166 L ${x} 180 Z`} fill="#374151" />
        </g>
      );
    })}
  </svg>
);

/** Kolejność wpisywania: kolorowe kółka połączone strzałkami. */
const OrderStrip: React.FC = () => (
  <div className="flex items-center justify-center gap-0.5">
    {ARROW_COLORS.map((c, i) => (
      <React.Fragment key={c.id}>
        <span
          className="w-6 h-6 shrink-0 rounded-full flex items-center justify-center text-[10px] font-black border-2 border-[#0a3a2a]"
          style={{ backgroundColor: c.hex, color: c.text }}
        >
          {i + 1}
        </span>
        {i < ARROW_COLORS.length - 1 && (
          <span className="material-symbols-outlined text-gray-300 text-[12px]">arrow_forward</span>
        )}
      </React.Fragment>
    ))}
  </div>
);

const ArrowColorOrderOption: React.FC<Props> = ({ enabled, onChange }) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  return (
    <div className="pt-3 border-t border-gray-50">
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 ml-1">
            <label className="text-[10px] font-black text-gray-400 uppercase">
              {t('settings.arrows.colorOrder.label')}
            </label>
            <button
              type="button"
              onClick={() => setOpen(true)}
              aria-label={t('settings.equipment.info.aria')}
              className="w-5 h-5 rounded-full bg-gray-200 flex items-center justify-center active:scale-90 transition-all shrink-0"
            >
              <span className="material-symbols-outlined text-gray-600 text-[12px]">info</span>
            </button>
          </div>
          <div className="flex gap-1 mt-1.5 ml-1">
            {ARROW_COLORS.map(c => (
              <span key={c.id} className="w-3 h-3 rounded-full border border-[#0a3a2a]/40" style={{ backgroundColor: c.hex }} />
            ))}
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          onClick={() => onChange(!enabled)}
          className={`w-12 h-7 rounded-full p-1 transition-all shrink-0 ${enabled ? 'bg-emerald-500' : 'bg-gray-200'}`}
        >
          <span className={`block w-5 h-5 rounded-full bg-white shadow transition-transform ${enabled ? 'translate-x-5' : ''}`} />
        </button>
      </div>

      {open && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-[100000] flex items-start justify-center pt-10 px-4 bg-black/50 backdrop-blur-sm animate-fade-in overflow-y-auto"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-white dark:bg-[#1a201d] rounded-[32px] w-full max-w-md p-6 shadow-2xl my-6"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-[#0a3a2a] flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-white text-[18px]">info</span>
              </div>
              <h2 className="text-[13px] font-black text-[#0a3a2a] dark:text-white uppercase tracking-widest">
                {t('settings.arrows.colorOrder.label')}
              </h2>
            </div>

            <p className="text-[12px] font-bold text-gray-500 dark:text-gray-300 leading-relaxed mb-4">
              {t('settings.arrows.colorOrder.intro')}
            </p>

            <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-2">
              1 · {t('settings.arrows.colorOrder.step1Title')}
            </p>
            <div className="bg-gray-50 dark:bg-white/5 rounded-2xl p-3 mb-2">
              <ArrowsIllustration />
            </div>
            <p className="text-[11px] font-bold text-gray-500 dark:text-gray-300 leading-relaxed mb-4">
              {t('settings.arrows.colorOrder.step1')}
            </p>

            <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-2">
              2 · {t('settings.arrows.colorOrder.step2Title')}
            </p>
            <div className="bg-gray-50 dark:bg-white/5 rounded-2xl p-3 mb-2">
              <OrderStrip />
            </div>
            <p className="text-[11px] font-bold text-gray-500 dark:text-gray-300 leading-relaxed mb-4">
              {t('settings.arrows.colorOrder.step2')}
            </p>

            <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-2">
              3 · {t('settings.arrows.colorOrder.step3Title')}
            </p>
            <div className="bg-[#0a3a2a]/5 dark:bg-white/5 border border-[#0a3a2a]/10 dark:border-white/10 rounded-2xl p-3 mb-4">
              <p className="text-[11px] font-bold text-[#0a3a2a] dark:text-[#9adbc0] leading-relaxed">
                {t('settings.arrows.colorOrder.step3')}
              </p>
            </div>

            <p className="text-[10px] font-bold text-gray-400 leading-relaxed mb-4">
              {t('settings.arrows.colorOrder.note')}
            </p>

            <button
              onClick={() => setOpen(false)}
              className="w-full py-3 rounded-2xl bg-[#0a3a2a] text-white text-[11px] font-black uppercase tracking-widest active:scale-95 transition-all"
            >
              {t('settings.arrows.colorOrder.close')}
            </button>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
};

export default ArrowColorOrderOption;
