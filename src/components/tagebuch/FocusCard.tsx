import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ActiveFocus } from '../../utils/focus';
import { topicLabel } from '../../constants/trainingTopics';

// --- FOKUS ---
// Karta „Twój fokus" na górze dziennika i pasek na Home (edycja: FocusModal). Logika
// (który fokus obowiązuje, liczenie treningów) siedzi w utils/focus.ts.

export function focusTitle(focus: ActiveFocus, t: (k: string) => string): string {
  return focus.text || (focus.topic ? topicLabel(focus.topic, t) : '');
}

/** Kropki postępu: `goal` sztuk, po osiągnięciu celu wszystkie złote. */
export function FocusDots({ count, goal, small = false, light = false }: { count: number; goal: number; small?: boolean; light?: boolean }) {
  const done = count >= goal;
  const size = small ? 'w-2 h-2' : 'w-2.5 h-2.5';
  const [doneCls, onCls, offCls] = light
    ? ['bg-amber-400', 'bg-[#1f6e53]', 'bg-amber-200']
    : ['bg-[#fed33e]', 'bg-emerald-400', 'bg-white/25'];
  return (
    <span className="flex items-center gap-1">
      {Array.from({ length: goal }, (_, i) => (
        <span
          key={i}
          className={`${size} rounded-full ${done ? doneCls : i < count ? onCls : offCls}`}
        />
      ))}
    </span>
  );
}

export function FocusProgressText({ count, goal, light = false }: { count: number; goal: number; light?: boolean }) {
  const { t } = useTranslation();
  return (
    <span className={`text-[10px] font-bold ${light ? 'text-amber-800' : 'text-white/75'}`}>
      {count >= goal
        ? t('tagebuch.focusDone', { count, goal })
        : t(goal === 1 ? 'tagebuch.focusCountOne' : 'tagebuch.focusCount', { hit: count, goal })}
    </span>
  );
}

/**
 * Postęp obecnego fokusu w oknach fokusu (uczeń i trener): kropki, a pod nimi
 * daty treningów, które je zapełniły — każda data to jedna kropka (user
 * 2026-09-18: osobna sekcja „Treningi zaliczone…" przy zerze nic nie mówiła).
 * Przy zerze same kropki; bez kropek same daty „od …", a przy zerze nic.
 */
export function FocusProgress({ dots, count, goal, dates, since }: {
  dots: boolean;
  count: number;
  goal: number;
  dates: number[];
  since: number;
}) {
  const { t, i18n } = useTranslation();
  const fmt = (ts: number) => new Date(ts).toLocaleDateString(i18n.language, { day: 'numeric', month: 'short' });
  const list = dates.map(fmt).join(' · ');
  if (!dots && !list) return null;
  return (
    <div className="mt-1.5">
      {dots && (
        <div className="flex items-center gap-2 bg-[#0a3a2a] rounded-lg px-2 py-1 w-fit">
          <FocusDots count={count} goal={goal} small />
          <FocusProgressText count={count} goal={goal} />
        </div>
      )}
      {list && (
        <p className="text-[10px] font-bold text-emerald-800/80 mt-1 leading-snug">
          {!dots && `${t('tagebuch.focusSince', { date: fmt(since) })}: `}
          {list}
        </p>
      )}
    </div>
  );
}

/**
 * Przycisk zapisu nowego fokusu (uczeń i trener). Przy obecnym fokusie to
 * „Zastąp fokus", a gdy obecny nie jest ukończony — najpierw pytanie, bo jego
 * postęp się zamyka (user 2026-09-18). Ukończonego nie ma czego żałować.
 */
export function SetFocusButton({ current, unfinished, disabled, saving, onConfirm }: {
  current: string | null;   // tytuł obecnego fokusu; null = brak fokusu
  unfinished: boolean;
  disabled: boolean;
  saving: boolean;
  onConfirm: () => void;
}) {
  const { t } = useTranslation();
  const [asking, setAsking] = useState(false);
  const replace = current !== null;
  const label = saving ? t('coachLog.saving') : t(replace ? 'studentProfile.focusModalReplace' : 'studentProfile.focusModalSaveNew');

  if (asking) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-2">
        <p className="text-[11px] font-black text-amber-800 leading-snug">{t('studentProfile.focusReplaceConfirm', { title: current })}</p>
        <p className="text-[10px] font-bold text-amber-800/70 leading-snug">{t('studentProfile.focusReplaceHint')}</p>
        <div className="flex gap-2">
          <button onClick={() => setAsking(false)} className="flex-1 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest bg-white text-gray-500 border border-gray-200">
            {t('tagebuch.focusBack')}
          </button>
          <button
            onClick={() => { setAsking(false); onConfirm(); }}
            disabled={disabled || saving}
            className="flex-1 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest bg-blue-600 text-white disabled:opacity-50"
          >
            {t('studentProfile.focusReplaceYes')}
          </button>
        </div>
      </div>
    );
  }
  return (
    <button
      onClick={() => (replace && unfinished ? setAsking(true) : onConfirm())}
      disabled={disabled || saving}
      className="w-full py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest bg-blue-600 text-white disabled:opacity-50"
    >
      {label}
    </button>
  );
}

// W dzienniku pod nagłówkiem, na jasnym tle — ta sama jasnożółta karta co na
// Home (user 2026-09-18: wyjęta z ciemnozielonego nagłówka).
export function FocusCard({ focus, dots, goal, count, onEdit }: {
  focus: ActiveFocus | null;
  dots: boolean;        // użytkownik włączył kropki
  goal: number;         // ile treningów do „zrobione"
  count: number;        // treningi z zaznaczonym fokusem od jego ustawienia
  onEdit: () => void;
}) {
  const { t, i18n } = useTranslation();

  if (!focus) {
    return (
      <button
        onClick={onEdit}
        className="w-full flex items-center gap-2.5 bg-amber-50 border border-dashed border-amber-300 rounded-[20px] px-3.5 py-2.5 text-left active:scale-[0.99] transition-all"
      >
        <span className="w-9 h-9 rounded-full bg-[#fed33e] text-[#0a3a2a] flex items-center justify-center shrink-0">
          <span className="material-symbols-outlined text-[20px]">track_changes</span>
        </span>
        <span className="text-[12px] font-bold text-amber-900 leading-snug">{t('tagebuch.focusEmpty')}</span>
      </button>
    );
  }

  const done = dots && count >= goal;
  return (
    <button
      onClick={onEdit}
      className="w-full flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-[20px] px-3.5 py-3 text-left active:scale-[0.99] transition-all"
    >
      <span className="w-9 h-9 rounded-full bg-[#fed33e] text-[#0a3a2a] flex items-center justify-center shrink-0">
        <span className="material-symbols-outlined text-[20px]">track_changes</span>
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-amber-800">
          <span className="truncate">
            {t('tagebuch.focusLabel')}
            {focus.fromCoach && ` · ${t('tagebuch.focusFromCoach')}${focus.authorName ? ` ${focus.authorName}` : ''}`}
          </span>
          <span className="flex-1" />
          <span className="material-symbols-outlined text-[14px] text-amber-500">edit</span>
        </div>
        <p className="text-[14px] font-black text-[#0a3a2a] leading-snug mt-0.5 break-words">{focusTitle(focus, t)}</p>
        {focus.text && focus.topic && (
          <p className="text-[10px] font-bold text-amber-700 mt-0.5">{topicLabel(focus.topic, t)}</p>
        )}
        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
          {dots ? (
            <>
              <FocusDots count={count} goal={goal} light />
              <FocusProgressText count={count} goal={goal} light />
            </>
          ) : (
            <span className="text-[10px] font-bold text-amber-700">
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
      </div>
    </button>
  );
}

/**
 * Pasek fokusu. Na Home i w oknie treningu technicznego jasnożółta karta (B),
 * na ekranie Vorbereitung wąska pigułka w tych samych kolorach (C) — user
 * 2026-09-18: ciemnozielony blok był ciężki i zlewał się z kartą zawodów.
 * Żółty = kolor fokusu (ikona celu), zielony zostaje dla zawodów.
 * W profilu ucznia trener widzi go w nagłówku jako `glass` (zielone tło
 * nagłówka), bez klikania (user 2026-09-16).
 */
export function FocusStrip({ focus, dots, goal, count, onOpen, label, sourceLabel, variant = 'card' }: {
  focus: ActiveFocus;
  dots: boolean;
  goal: number;
  count: number;
  onOpen?: () => void;   // brak = pasek tylko do czytania, bez strzałki
  // Podpisy z perspektywy oglądającego. Domyślnie uczeń („Twój fokus · od
  // trenera"); trener w profilu ucznia podaje własne („Fokus ucznia · …").
  label?: string;
  sourceLabel?: string;
  variant?: 'card' | 'pill' | 'glass';
}) {
  const { t } = useTranslation();
  const source = sourceLabel ?? (focus.fromCoach
    ? `${t('tagebuch.focusFromCoach')}${focus.authorName ? ` ${focus.authorName}` : ''}`
    : '');
  const title = focusTitle(focus, t);
  const topic = focus.text && focus.topic ? topicLabel(focus.topic, t) : '';

  const wrap = (cls: string, content: React.ReactNode) => onOpen
    ? <button onClick={onOpen} className={`w-full flex items-center text-left active:scale-[0.99] transition-all ${cls}`}>{content}</button>
    : <div className={`w-full flex items-center text-left ${cls}`}>{content}</div>;

  if (variant === 'pill') {
    return wrap('gap-2 bg-amber-50 border border-amber-200 rounded-full px-3 py-1.5', (
      <>
        <span className="material-symbols-outlined text-[18px] text-amber-600 shrink-0">track_changes</span>
        <span className="flex-1 min-w-0 text-[12px] font-black text-[#0a3a2a] truncate">
          {title}{topic && <span className="text-amber-700 font-bold"> · {topic}</span>}
        </span>
        {dots && <FocusDots count={count} goal={goal} small light />}
        {onOpen && <span className="material-symbols-outlined text-[18px] text-amber-500 shrink-0">chevron_right</span>}
      </>
    ));
  }

  const glass = variant === 'glass';
  return wrap(glass
    ? 'gap-3 bg-white/[0.07] backdrop-blur-sm rounded-2xl px-3.5 py-2'
    : 'gap-3 bg-amber-50 border border-amber-200 rounded-[20px] px-3.5 py-2.5', (
    <>
      {glass
        ? <span className="material-symbols-outlined text-[22px] text-[#fed33e] shrink-0">track_changes</span>
        : (
          <span className="w-9 h-9 rounded-full bg-[#fed33e] text-[#0a3a2a] flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-[20px]">track_changes</span>
          </span>
        )}
      <div className="flex-1 min-w-0">
        <p className={`text-[9px] font-black uppercase tracking-widest truncate ${glass ? 'text-[#fed33e]' : 'text-amber-800'}`}>
          {label ?? t('tagebuch.focusLabel')}
          {source && ` · ${source}`}
        </p>
        <p className={`text-[13px] font-black leading-snug truncate ${glass ? 'text-white' : 'text-[#0a3a2a]'}`}>{title}</p>
        {/* Temat pod tekstem (user 2026-09-18) — bez tekstu tytułem jest sam temat. */}
        {topic && <p className={`text-[10px] font-bold truncate ${glass ? 'text-white/60' : 'text-amber-700'}`}>{topic}</p>}
        {dots && (
          <div className="flex items-center gap-2 mt-1">
            <FocusDots count={count} goal={goal} small light={!glass} />
            <FocusProgressText count={count} goal={goal} light={!glass} />
          </div>
        )}
      </div>
      {onOpen && <span className={`material-symbols-outlined text-[20px] shrink-0 ${glass ? 'text-white/60' : 'text-amber-500'}`}>chevron_right</span>}
    </>
  ));
}
