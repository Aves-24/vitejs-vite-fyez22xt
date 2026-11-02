import { useTranslation } from 'react-i18next';
import type { TermineView } from '../utils/termineView';

// [TERMINE] Przełącznik Liste | Monat — ten sam w obu widokach jednego ekranu.
export default function TermineViewToggle({ value, onChange }: { value: TermineView; onChange: (v: TermineView) => void }) {
  const { t } = useTranslation();
  const opt = (v: TermineView, icon: string, label: string) => (
    <button
      type="button"
      aria-pressed={value === v}
      onClick={() => { if (value !== v) onChange(v); }}
      className={`py-2 px-2 rounded-lg text-[12px] font-black flex items-center gap-1 transition-all active:scale-95 ${
        value === v ? 'bg-[#0a3a2a] text-[#fed33e] shadow-sm' : 'text-gray-500'
      }`}
    >
      <span className="material-symbols-outlined text-[16px]">{icon}</span>
      {label}
    </button>
  );
  return (
    <div className="flex items-center gap-0.5 p-0.5 rounded-xl bg-white border border-gray-200">
      {opt('LIST', 'list', t('coachTermine.list'))}
      {opt('MONTH', 'calendar_month', t('coachTermine.month'))}
    </div>
  );
}
