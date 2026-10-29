import React, { useState } from 'react';

// [PODSUMOWANIE TRENINGU] Zwijana karta w stylu dziennika (user 2026-10-29):
// pasek z lewej, ikonka, mała etykieta + pogrubiony tytuł, strzałka zwijania.
// `storageKey` — stan zwinięcia zapamiętany na urządzeniu (localStorage);
// bez niego karta zawsze startuje z `defaultOpen`.
export default function SummaryCard({ icon, iconCls = 'text-emerald-600', stripe = 'tb-d2', kind, kindCls = 'text-emerald-700', title, right, storageKey, defaultOpen = true, children }: {
  icon: string;
  iconCls?: string;
  stripe?: string;
  kind: string;
  kindCls?: string;
  title?: React.ReactNode;
  right?: React.ReactNode; // np. podpowiedź przy otwartej karcie
  storageKey?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState<boolean>(() => {
    if (!storageKey) return defaultOpen;
    try {
      const v = localStorage.getItem(`grotx-card-${storageKey}`);
      return v === null ? defaultOpen : v === '1';
    } catch { return defaultOpen; }
  });
  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (storageKey) {
      try { localStorage.setItem(`grotx-card-${storageKey}`, next ? '1' : '0'); } catch { /* bez pamięci — tylko w tej sesji */ }
    }
  };

  return (
    <div className={`tb-card ${stripe} border rounded-l-md rounded-r-2xl shadow-sm w-full`}>
      <button onClick={toggle} className="w-full flex items-center gap-2.5 pl-2 pr-3 py-2.5 text-left active:opacity-60" aria-expanded={open}>
        <span className="tb-icon w-8 h-8 rounded-lg flex items-center justify-center shrink-0">
          <span className={`material-symbols-outlined text-[18px] ${iconCls}`}>{icon}</span>
        </span>
        <span className="block min-w-0 flex-1">
          <span className={`block text-[9px] font-black uppercase tracking-widest leading-tight ${kindCls}`}>{kind}</span>
          {title && <span className="block text-[13px] font-black leading-snug text-[#0a3a2a] truncate">{title}</span>}
        </span>
        {open && right}
        <span className={`material-symbols-outlined text-gray-400 transition-transform duration-300 ${open ? 'rotate-180' : ''}`}>keyboard_arrow_down</span>
      </button>
      {open && <div className="px-3 pb-3 tb-fade-in">{children}</div>}
    </div>
  );
}
