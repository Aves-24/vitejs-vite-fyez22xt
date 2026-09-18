import React from 'react';
import { useTranslation } from 'react-i18next';
import type { ActiveFocus } from '../../utils/focus';

// --- FOKUS ---
// Karta „Twój fokus" na górze dziennika i pasek na Home (edycja: FocusModal). Logika
// (który fokus obowiązuje, liczenie treningów) siedzi w utils/focus.ts.

export function focusTitle(focus: ActiveFocus, t: (k: string) => string): string {
  return focus.text || (focus.topic ? t(`sessionSetup.topic_${focus.topic}`) : '');
}

/** Kropki postępu: `goal` sztuk, po osiągnięciu celu wszystkie złote. */
export function FocusDots({ count, goal, small = false }: { count: number; goal: number; small?: boolean }) {
  const done = count >= goal;
  const size = small ? 'w-2 h-2' : 'w-2.5 h-2.5';
  return (
    <span className="flex items-center gap-1">
      {Array.from({ length: goal }, (_, i) => (
        <span
          key={i}
          className={`${size} rounded-full ${done ? 'bg-[#fed33e]' : i < count ? 'bg-emerald-400' : 'bg-white/25'}`}
        />
      ))}
    </span>
  );
}

export function FocusProgressText({ count, goal }: { count: number; goal: number }) {
  const { t } = useTranslation();
  return (
    <span className="text-[10px] font-bold text-white/75">
      {count >= goal
        ? t('tagebuch.focusDone', { count })
        : t('tagebuch.focusCount', { hit: count, goal })}
    </span>
  );
}

export function FocusCard({ focus, dots, goal, count, onEdit }: {
  focus: ActiveFocus | null;
  dots: boolean;        // użytkownik włączył kropki
  goal: number;         // ile treningów do „utrwalone"
  count: number;        // treningi z zaznaczonym fokusem od jego ustawienia
  onEdit: () => void;
}) {
  const { t, i18n } = useTranslation();

  if (!focus) {
    return (
      <button
        onClick={onEdit}
        className="mt-3 w-full flex items-center gap-2.5 bg-white/10 hover:bg-white/15 border border-dashed border-white/30 rounded-2xl px-3 py-2.5 text-left active:scale-[0.99] transition-all"
      >
        <span className="material-symbols-outlined text-[20px] text-[#fed33e] shrink-0">track_changes</span>
        <span className="text-[12px] font-bold text-white/90 leading-snug">{t('tagebuch.focusEmpty')}</span>
      </button>
    );
  }

  const showDots = dots && !!focus.topic;
  const done = showDots && count >= goal;
  return (
    <button
      onClick={onEdit}
      className="mt-3 w-full bg-white/10 hover:bg-white/15 rounded-2xl px-3 py-2.5 text-left active:scale-[0.99] transition-all"
    >
      <div className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-[#fed33e]">
        <span className="material-symbols-outlined text-[13px]">track_changes</span>
        <span className="truncate">
          {t('tagebuch.focusLabel')}
          {focus.fromCoach && ` · ${t('tagebuch.focusFromCoach')}${focus.authorName ? ` ${focus.authorName}` : ''}`}
        </span>
        <span className="flex-1" />
        <span className="material-symbols-outlined text-[14px] text-white/50">edit</span>
      </div>
      <p className="text-[14px] font-black text-white leading-snug mt-1 break-words">{focusTitle(focus, t)}</p>
      {focus.text && focus.topic && (
        <p className="text-[10px] font-bold text-white/60 mt-0.5">{t(`sessionSetup.topic_${focus.topic}`)}</p>
      )}
      <div className="flex items-center gap-2 mt-2 flex-wrap">
        {showDots ? (
          <>
            <FocusDots count={count} goal={goal} />
            <FocusProgressText count={count} goal={goal} />
          </>
        ) : (
          <span className="text-[10px] font-bold text-white/60">
            {t('tagebuch.focusSince', { date: new Date(focus.since).toLocaleDateString(i18n.language, { day: 'numeric', month: 'short' }) })}
          </span>
        )}
      </div>
      {/* Cała karta i tak otwiera edytor — to tylko zachęta, nie osobny przycisk. */}
      {done && (
        <span className="inline-block mt-2 bg-[#fed33e] text-[#0a3a2a] text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-xl">
          {t('tagebuch.focusPickNew')}
        </span>
      )}
    </button>
  );
}

/**
 * Wąski pasek fokusu. Na Home przypomina fokus przed treningiem (klik =
 * dziennik). W profilu ucznia trener widzi go w nagłówku — tam bez klikania
 * (user 2026-09-16: przejście do dziennika po kliknięciu było niezrozumiałe)
 * i w stylu kafelków nagłówka (`glass`), bo pełne tło zlewało się z zielenią.
 */
export function FocusStrip({ focus, dots, goal, count, onOpen, label, sourceLabel, glass = false }: {
  focus: ActiveFocus;
  dots: boolean;
  goal: number;
  count: number;
  onOpen?: () => void;   // brak = pasek tylko do czytania, bez strzałki
  // Podpisy z perspektywy oglądającego. Domyślnie uczeń („Twój fokus · od
  // trenera"); trener w profilu ucznia podaje własne („Fokus ucznia · …").
  label?: string;
  sourceLabel?: string;
  glass?: boolean;
}) {
  const { t } = useTranslation();
  const showDots = dots && !!focus.topic;
  const source = sourceLabel ?? (focus.fromCoach
    ? `${t('tagebuch.focusFromCoach')}${focus.authorName ? ` ${focus.authorName}` : ''}`
    : '');
  const tone = glass
    ? 'bg-white/[0.07] backdrop-blur-sm rounded-2xl px-3.5 py-2'
    : 'bg-[#0a3a2a] rounded-[20px] px-4 py-2.5 shadow-sm';
  const content = (
    <>
      <span className="material-symbols-outlined text-[22px] text-[#fed33e] shrink-0">track_changes</span>
      <div className="flex-1 min-w-0">
        <p className="text-[9px] font-black uppercase tracking-widest text-[#fed33e] truncate">
          {label ?? t('tagebuch.focusLabel')}
          {source && ` · ${source}`}
        </p>
        <p className="text-[13px] font-black text-white leading-snug truncate">{focusTitle(focus, t)}</p>
        {showDots && (
          <div className="flex items-center gap-2 mt-1">
            <FocusDots count={count} goal={goal} small />
            <FocusProgressText count={count} goal={goal} />
          </div>
        )}
      </div>
      {onOpen && <span className="material-symbols-outlined text-[20px] text-white/60 shrink-0">chevron_right</span>}
    </>
  );
  if (!onOpen) {
    return <div className={`w-full flex items-center gap-3 text-left ${tone}`}>{content}</div>;
  }
  return (
    <button onClick={onOpen} className={`w-full flex items-center gap-3 text-left active:scale-[0.99] transition-all ${tone}`}>
      {content}
    </button>
  );
}
