import React from 'react';
import { useTranslation } from 'react-i18next';

// [FREE 24 h] Zwinięta, zablokowana karta analizy (user 2026-10-29): po 24 h od
// treningu konto FREE widzi tylko nagłówki kart; dotknięcie prowadzi do PRO.
// Wygląd jak zwinięta SummaryCard, zamiast strzałki plakietka PRO.
export default function LockedCard({ icon, kind, stripe = 'tb-d2', onUnlock }: {
  icon: string;
  kind: string;
  stripe?: string;
  onUnlock: () => void;
}) {
  const { t } = useTranslation();
  return (
    <button
      onClick={onUnlock}
      className={`tb-card ${stripe} border rounded-l-md rounded-r-2xl shadow-sm w-full flex items-center gap-2.5 pl-2 pr-3 py-2.5 text-left active:opacity-60`}
      aria-label={`${kind} — GROT-X PRO`}
    >
      <span className="tb-icon w-8 h-8 rounded-lg flex items-center justify-center shrink-0">
        <span className="material-symbols-outlined text-[18px] text-gray-400">{icon}</span>
      </span>
      <span className="flex-1 min-w-0 text-[9px] font-black uppercase tracking-widest text-gray-500 truncate">{kind}</span>
      <span className="shrink-0 flex items-center gap-1 bg-[#0a3a2a] text-[#fed33e] rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-widest">
        <span className="material-symbols-outlined text-[12px]">lock</span>
        {t('stats.locked.pro')}
      </span>
    </button>
  );
}
