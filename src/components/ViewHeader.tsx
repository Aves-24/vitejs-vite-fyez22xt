import type { ReactNode } from 'react';

interface ViewHeaderProps {
  title: ReactNode;
  onBack?: () => void;
  eyebrow?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  // Na 375 px dwa duże przyciski + logo zgniatają tytuł do „…”.
  hideLogo?: boolean;
  children?: ReactNode;
  className?: string;
}

export default function ViewHeader({ title, onBack, eyebrow, subtitle, actions, hideLogo = false, children, className = '' }: ViewHeaderProps) {
  return (
    <div className={`bg-gradient-to-b from-[#0a3a2a] to-[#0d4a36] pt-[calc(env(safe-area-inset-top)+1rem)] pb-4 px-5 rounded-b-[36px] shadow-xl shadow-[#0a3a2a]/20 relative z-20 shrink-0 ${className}`}>
      <div className="flex items-center gap-3 min-h-[40px]">
        {onBack && (
          <button
            onClick={onBack}
            className="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center text-white hover:bg-white/20 transition-all active:scale-90 shrink-0"
          >
            <span className="material-symbols-outlined">arrow_back</span>
          </button>
        )}
        <div className="flex-1 min-w-0">
          {eyebrow && (
            <p className="text-[10px] font-black text-emerald-400 uppercase tracking-widest leading-none mb-1 truncate">{eyebrow}</p>
          )}
          <h1 className="text-lg font-black text-white leading-tight truncate">{title}</h1>
          {subtitle}
        </div>
        {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
        {!hideLogo && (
          <div className="flex items-center shrink-0">
            <span className="text-base font-black text-white tracking-tighter leading-none">GROT-X</span>
            <div className="bg-[#fed33e] w-1.5 h-1.5 rounded-full ml-1" />
          </div>
        )}
      </div>
      {children}
    </div>
  );
}
