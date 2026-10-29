import React from 'react';
import { useTranslation } from 'react-i18next';

export type FocusResult = 'yes' | 'partly' | 'no';

export const isFocusResult = (v: unknown): v is FocusResult => v === 'yes' || v === 'partly' || v === 'no';

// [FOKUS UMGESETZT] Odpowiedź z zapisu treningu (trener 2026-10-29) — znaczek
// w dzienniku i w profilu ucznia u trenera. Kolory jak przyciski przy zapisie.
export default function FocusResultChip({ value }: { value: FocusResult }) {
  const { t } = useTranslation();
  const cls = value === 'yes' ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
    : value === 'partly' ? 'bg-amber-50 border-amber-200 text-amber-800'
    : 'bg-red-50 border-red-200 text-red-700';
  const icon = value === 'yes' ? 'check_circle' : value === 'partly' ? 'contrast' : 'cancel';
  return (
    <span className={`inline-flex items-center gap-1 border rounded-full px-2 py-0.5 text-[10px] font-black ${cls}`}>
      <span className="material-symbols-outlined text-[13px]">{icon}</span>
      {t(`scoring.focusResult.short.${value}`)}
    </span>
  );
}
