import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { readSessionFocus, orderedTracks, type ActiveFocus, type FocusChoice, type FocusMilestone, type FocusState, type SessionFocus } from '../../utils/focus';
import { topicLabel } from '../../constants/trainingTopics';

// --- FOKUS ---
// Karta „Twój fokus" na górze dziennika i pasek na Home (edycja: FocusModal). Logika
// (który fokus obowiązuje, liczenie treningów) siedzi w utils/focus.ts.

export function focusTitle(focus: Pick<ActiveFocus, 'text' | 'topic'>, t: (k: string) => string): string {
  return focus.text || (focus.topic ? topicLabel(focus.topic, t) : '');
}

/**
 * [DWA FOKUSY] Fokus trenera na niebieskim tle, własny na żółtym (user
 * 2026-10-15) — od razu widać, czyj fokus jest na górze. Ukończony i tak szary.
 */
function focusPalette(coach: boolean | undefined) {
  return coach
    ? { bg: 'bg-sky-50 border-sky-200', icon: 'bg-sky-500 text-white', label: 'text-sky-800', sub: 'text-sky-700', accent: 'text-sky-500', pillIcon: 'text-sky-600', glassIcon: 'text-sky-300' }
    : { bg: 'bg-amber-50 border-amber-200', icon: 'bg-[#fed33e] text-[#0a3a2a]', label: 'text-amber-800', sub: 'text-amber-700', accent: 'text-amber-500', pillIcon: 'text-amber-600', glassIcon: 'text-[#fed33e]' };
}

/**
 * [DWA FOKUSY] Kropka drugiego fokusu po prawej stronie paska (user 2026-10-14):
 * niebieska z gwizdkiem = fokus trenera, żółta = własny. Tap zamienia fokusy
 * miejscami. Leży NAD kartą (absolute), bo karta sama jest przyciskiem.
 */
export function OtherFocusDot({ focus, onSwap, small = false, className = '' }: {
  focus: ActiveFocus;
  onSwap: () => void;
  small?: boolean;
  className?: string;
}) {
  const { t } = useTranslation();
  const coach = focus.fromCoach;
  const label = t(coach ? 'tagebuch.focusOtherCoach' : 'tagebuch.focusOtherOwn', { title: focusTitle(focus, t) });
  return (
    <button
      type="button"
      onClick={e => { e.stopPropagation(); onSwap(); }}
      aria-label={label}
      title={label}
      className={`${small ? 'w-6 h-6' : 'w-8 h-8'} rounded-full flex items-center justify-center shrink-0 ring-2 ring-white shadow-md active:scale-90 transition-all ${
        coach ? 'bg-sky-500 text-white' : 'bg-[#fed33e] text-[#0a3a2a]'
      } ${className}`}
    >
      <span className={`material-symbols-outlined ${small ? 'text-[13px]' : 'text-[17px]'}`}>{coach ? 'sports' : 'person'}</span>
    </button>
  );
}

/**
 * [DWA FOKUSY] Drugi fokus jako chip w prawym dolnym rogu karty: ikonka +
 * pierwsze 20 znaków (user 2026-10-15 — sama kropka nic nie mówiła). Tap
 * zamienia fokusy miejscami. Jak kropka leży NAD kartą (absolute).
 */
export function OtherFocusChip({ focus, onSwap, className = '' }: {
  focus: ActiveFocus;
  onSwap: () => void;
  className?: string;
}) {
  const { t } = useTranslation();
  const coach = focus.fromCoach;
  const full = focusTitle(focus, t);
  const chars = Array.from(full);
  const short = chars.length > 20 ? `${chars.slice(0, 20).join('').trimEnd()}…` : full;
  const label = t(coach ? 'tagebuch.focusOtherCoach' : 'tagebuch.focusOtherOwn', { title: full });
  return (
    <button
      type="button"
      onClick={e => { e.stopPropagation(); onSwap(); }}
      aria-label={label}
      title={label}
      className={`max-w-[45%] flex items-center gap-1 rounded-full border pl-0.5 pr-2 py-0.5 shadow-sm active:scale-95 transition-all ${
        coach ? 'bg-sky-100 border-sky-300 text-sky-900' : 'bg-amber-100 border-amber-300 text-amber-900'
      } ${className}`}
    >
      <span className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${coach ? 'bg-sky-500 text-white' : 'bg-[#fed33e] text-[#0a3a2a]'}`}>
        <span className="material-symbols-outlined text-[13px]">{coach ? 'sports' : 'person'}</span>
      </span>
      <span className="text-[10px] font-black truncate">{short}</span>
    </button>
  );
}

/**
 * [DWA FOKUSY] Pod jaki fokus idzie ten trening (user 2026-10-14): domyślnie
 * ten z góry, oba = jeden trening pod oba. Przy jednym fokusie — jeden chip
 * (zamiast dawnego przełącznika).
 */
export function FocusChoiceChips({ state, choice, onChange, dark = false }: {
  state: FocusState;
  choice: FocusChoice;
  onChange: (next: FocusChoice) => void;
  dark?: boolean;
}) {
  const { t } = useTranslation();
  const tracks = orderedTracks(state);
  if (!tracks.length) return null;
  const none = !tracks.some(tr => choice[tr.focus.fromCoach ? 'coach' : 'own']);
  return (
    <div>
      <p className={`text-[9px] font-black uppercase tracking-widest mb-1.5 ${dark ? 'text-white/60' : 'text-gray-400'}`}>{t('tagebuch.focusChoiceLabel')}</p>
      <div className="flex flex-wrap gap-1.5">
        {tracks.map(tr => {
          const side = tr.focus.fromCoach ? 'coach' : 'own';
          const on = choice[side];
          const onCls = side === 'coach' ? 'bg-sky-50 border-sky-400 text-[#0a3a2a]' : 'bg-amber-50 border-amber-400 text-[#0a3a2a]';
          const offCls = dark ? 'bg-white/5 border-white/20 text-white/50' : 'bg-white border-gray-200 text-gray-400';
          const icon = on ? 'check' : side === 'coach' ? 'sports' : 'person';
          return (
            <button
              key={side}
              type="button"
              role="checkbox"
              aria-checked={on}
              onClick={() => onChange({ ...choice, [side]: !on })}
              className={`max-w-full flex items-center gap-1.5 border rounded-full pl-1 pr-2.5 py-1 text-left active:scale-95 transition-all ${on ? onCls : offCls}`}
            >
              <span className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
                on ? (side === 'coach' ? 'bg-sky-500 text-white' : 'bg-[#fed33e] text-[#0a3a2a]') : (dark ? 'bg-white/10 text-white/40' : 'bg-gray-100 text-gray-300')
              }`}>
                <span className="material-symbols-outlined text-[13px]">{icon}</span>
              </span>
              <span className="text-[11px] font-black truncate">
                {t(side === 'coach' ? 'tagebuch.focusChoiceCoach' : 'tagebuch.focusChoiceOwn')}: <span className="font-bold">{focusTitle(tr.focus, t)}</span>
              </span>
            </button>
          );
        })}
      </div>
      {none && <p className={`text-[10px] font-bold mt-1 ${dark ? 'text-white/50' : 'text-gray-400'}`}>{t('tagebuch.focusChoiceNone')}</p>}
    </div>
  );
}

/** Kropki postępu: `goal` sztuk, po osiągnięciu celu wszystkie złote. */
export function FocusDots({ count, goal, small = false, light = false, muted = false, coach = false }: { count: number; goal: number; small?: boolean; light?: boolean; muted?: boolean; coach?: boolean }) {
  const done = count >= goal;
  const size = small ? 'w-2 h-2' : 'w-2.5 h-2.5';
  // muted: szara karta zakończonego fokusu (user 2026-10-14).
  const [doneCls, onCls, offCls] = muted
    ? ['bg-gray-400', 'bg-gray-500', 'bg-gray-200']
    : light
    ? ['bg-amber-400', 'bg-[#1f6e53]', coach ? 'bg-sky-200' : 'bg-amber-200']
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

export function FocusProgressText({ count, goal, light = false, coach = false }: { count: number; goal: number; light?: boolean; coach?: boolean }) {
  const { t } = useTranslation();
  return (
    <span className={`text-[10px] font-bold ${light ? (coach ? 'text-sky-800' : 'text-amber-800') : 'text-white/75'}`}>
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
export function FocusCard({ focus, ended, dots, goal, count, onEdit, other, onSwap }: {
  focus: ActiveFocus | null;
  other?: ActiveFocus | null;   // [DWA FOKUSY] drugi fokus — kropka po prawej
  onSwap?: () => void;
  ended?: (SessionFocus & { endedAt: number }) | null;  // zakończony „Fokus beenden” — zostaje w dzienniku
  dots: boolean;        // użytkownik włączył kropki
  goal: number;         // ile treningów do „zrobione"
  count: number;        // treningi z zaznaczonym fokusem od jego ustawienia
  onEdit: () => void;
}) {
  const { t, i18n } = useTranslation();
  const fmt = (ts: number) => new Date(ts).toLocaleDateString(i18n.language, { day: 'numeric', month: 'short' });

  if (!focus && ended) {
    const endedDots = !!(ended.step !== undefined && ended.goal);
    const endedTitle = focusTitle(ended, t);
    return (
      <button
        onClick={onEdit}
        className="w-full flex items-start gap-3 bg-gray-50 border border-gray-200 rounded-[20px] px-3.5 py-3 text-left active:scale-[0.99] transition-all"
      >
        {/* Zakończony fokus na szaro (user 2026-10-14) — żółty zostaje dla
            fokusu, nad którym się teraz pracuje. Przycisk dalej żółty. */}
        <span className="w-9 h-9 rounded-full bg-gray-200 text-gray-500 flex items-center justify-center shrink-0">
          <span className="material-symbols-outlined text-[20px]">track_changes</span>
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-[9px] font-black uppercase tracking-widest text-gray-500 truncate">
            {t('tagebuch.focusLastDone')}
            {ended.fromCoach && ` · ${t('tagebuch.focusFromCoach')}${ended.authorName ? ` ${ended.authorName}` : ''}`}
          </div>
          <p className="text-[14px] font-black text-gray-600 leading-snug mt-0.5 break-words">{endedTitle}</p>
          {ended.text && ended.topic && (
            <p className="text-[10px] font-bold text-gray-500 mt-0.5">{topicLabel(ended.topic, t)}</p>
          )}
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            {endedDots && <FocusDots count={ended.step!} goal={ended.goal!} muted />}
            <span className="text-[10px] font-bold text-gray-500">{fmt(ended.since)} – {fmt(ended.endedAt)}</span>
          </div>
          <span className="inline-block mt-2 bg-[#fed33e] text-[#0a3a2a] text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-xl">
            {t('tagebuch.focusPickNew')}
          </span>
        </div>
      </button>
    );
  }

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
  const pal = focusPalette(focus.fromCoach);
  const card = (
    <button
      onClick={onEdit}
      className={`w-full flex items-start gap-3 ${done ? 'bg-gray-50 border-gray-200' : pal.bg} border rounded-[20px] px-3.5 py-3 text-left active:scale-[0.99] transition-all`}
    >
      <span className={`w-9 h-9 rounded-full ${done ? 'bg-gray-200 text-gray-500' : pal.icon} flex items-center justify-center shrink-0`}>
        <span className="material-symbols-outlined text-[20px]">track_changes</span>
      </span>
      <div className="flex-1 min-w-0">
        <div className={`flex items-center gap-1 text-[9px] font-black uppercase tracking-widest ${done ? 'text-gray-500' : pal.label}`}>
          <span className="truncate">
            {t(done ? 'tagebuch.focusLastDone' : 'tagebuch.focusLabel')}
            {focus.fromCoach && ` · ${t('tagebuch.focusFromCoach')}${focus.authorName ? ` ${focus.authorName}` : ''}`}
          </span>
          <span className="flex-1" />
          {/* Fokusu trenera uczeń nie edytuje — bez ołówka (user 2026-10-15). */}
          {!focus.fromCoach && <span className={`material-symbols-outlined text-[14px] ${pal.accent}`}>edit</span>}
        </div>
        <p className="text-[14px] font-black text-[#0a3a2a] leading-snug mt-0.5 break-words">{focusTitle(focus, t)}</p>
        {focus.text && focus.topic && (
          <p className={`text-[10px] font-bold mt-0.5 ${pal.sub}`}>{topicLabel(focus.topic, t)}</p>
        )}
        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
          {dots ? (
            <>
              <FocusDots count={count} goal={goal} light muted={done} coach={focus.fromCoach} />
              <FocusProgressText count={count} goal={goal} light coach={focus.fromCoach} />
            </>
          ) : (
            <span className={`text-[10px] font-bold ${pal.sub}`}>
              {t('tagebuch.focusSince', { date: fmt(focus.since) })}
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
  if (!other || !onSwap) return card;
  return (
    <div className="relative">
      {card}
      <OtherFocusChip focus={other} onSwap={onSwap} className="absolute right-3 bottom-2" />
    </div>
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
export function FocusStrip({ focus, dots, goal, count, onOpen, label, sourceLabel, variant = 'card', other, onSwap }: {
  focus: ActiveFocus;
  other?: ActiveFocus | null;   // [DWA FOKUSY] drugi fokus — kropka po prawej
  onSwap?: () => void;
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

  const withDot = !!(other && onSwap);
  const pill = variant === 'pill';
  const inner = (cls: string, content: React.ReactNode) => onOpen
    ? <button onClick={onOpen} className={`w-full flex items-center text-left active:scale-[0.99] transition-all ${cls}`}>{content}</button>
    : <div className={`w-full flex items-center text-left ${cls}`}>{content}</div>;
  // Karta (Home, trening techniczny): drugi fokus jako chip w prawym dolnym
  // rogu (user 2026-10-15). Pigułka i nagłówek są za wąskie — tam kropka
  // nad paskiem, przed strzałką.
  const chip = withDot && variant === 'card';
  const wrap = (cls: string, content: React.ReactNode) => !withDot ? inner(cls, content) : chip ? (
    <div className="relative">
      {inner(cls, content)}
      <OtherFocusChip focus={other!} onSwap={onSwap!} className="absolute right-3 bottom-2" />
    </div>
  ) : (
    <div className="relative">
      {inner(`${cls} ${pill ? (onOpen ? 'pr-12' : 'pr-9') : (onOpen ? 'pr-16' : 'pr-12')}`, content)}
      <OtherFocusDot
        focus={other!}
        onSwap={onSwap!}
        small={pill}
        className={`absolute top-1/2 -translate-y-1/2 ${pill ? (onOpen ? 'right-7' : 'right-2') : (onOpen ? 'right-9' : 'right-3')}`}
      />
    </div>
  );

  const pal = focusPalette(focus.fromCoach);
  const coach = !!focus.fromCoach;

  if (variant === 'pill') {
    return wrap(`gap-2 border rounded-full px-3 py-1.5 ${pal.bg}`, (
      <>
        <span className={`material-symbols-outlined text-[18px] shrink-0 ${pal.pillIcon}`}>track_changes</span>
        <span className="flex-1 min-w-0 text-[12px] font-black text-[#0a3a2a] truncate">
          {title}{topic && <span className={`font-bold ${pal.sub}`}> · {topic}</span>}
        </span>
        {dots && <FocusDots count={count} goal={goal} small light coach={coach} />}
        {onOpen && <span className={`material-symbols-outlined text-[18px] shrink-0 ${pal.accent}`}>chevron_right</span>}
      </>
    ));
  }

  const glass = variant === 'glass';
  return wrap(glass
    ? 'gap-3 bg-white/[0.07] backdrop-blur-sm rounded-2xl px-3.5 py-2'
    : `gap-3 border rounded-[20px] px-3.5 py-2.5 ${pal.bg}`, (
    <>
      {glass
        ? <span className={`material-symbols-outlined text-[22px] shrink-0 ${pal.glassIcon}`}>track_changes</span>
        : (
          <span className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${pal.icon}`}>
            <span className="material-symbols-outlined text-[20px]">track_changes</span>
          </span>
        )}
      <div className="flex-1 min-w-0">
        <p className={`text-[9px] font-black uppercase tracking-widest truncate ${glass ? pal.glassIcon : pal.label}`}>
          {label ?? t('tagebuch.focusLabel')}
          {source && ` · ${source}`}
        </p>
        <p className={`text-[13px] font-black leading-snug truncate ${glass ? 'text-white' : 'text-[#0a3a2a]'}`}>{title}</p>
        {/* Temat pod tekstem (user 2026-09-18) — bez tekstu tytułem jest sam temat. */}
        {topic && <p className={`text-[10px] font-bold truncate ${glass ? 'text-white/60' : pal.sub}`}>{topic}</p>}
        {dots && (
          <div className="flex items-center gap-2 mt-1">
            <FocusDots count={count} goal={goal} small light={!glass} coach={coach} />
            <FocusProgressText count={count} goal={goal} light={!glass} coach={coach} />
          </div>
        )}
      </div>
      {/* Z chipem drugiego fokusu strzałka idzie do góry (user 2026-10-15). */}
      {onOpen && <span className={`material-symbols-outlined text-[20px] shrink-0 ${chip ? 'self-start' : ''} ${glass ? 'text-white/60' : pal.accent}`}>chevron_right</span>}
    </>
  ));
}

/**
 * Fokus zapisany w sesji (migawka z chwili treningu) — karta w statystykach.
 * Starsze sesje bez migawki nic tu nie pokazują (tematy mają swoje miejsce).
 */
export function SessionFocusCard({ session }: { session: any }) {
  const { t } = useTranslation();
  const snap = readSessionFocus(session);
  if (!snap) return null;
  const focus: ActiveFocus = { text: snap.text, topic: snap.topic, since: snap.since, fromCoach: snap.fromCoach, authorName: snap.authorName };
  const dots = !!(snap.step && snap.goal);
  return (
    <FocusStrip
      focus={focus}
      dots={dots}
      goal={snap.goal || 0}
      count={Math.min(snap.step || 0, snap.goal || 0)}
      label={t('stats.sessionFocus')}
    />
  );
}

/** Wpis na osi czasu dziennika: fokus ukończony (komplet kropek) albo zakończony. */
// onDelete (user 2026-10-14): wpisy z testów / błędnie zaliczone fokusy
// dało się wcześniej usunąć tylko z konsoli.
export function FocusMilestoneCard({ milestone, time, onDelete }: { milestone: FocusMilestone; time: string; onDelete?: () => Promise<void> }) {
  const { t, i18n } = useTranslation();
  const [confirm, setConfirm] = useState(false);
  const fmt = (ts: number) => new Date(ts).toLocaleDateString(i18n.language, { day: 'numeric', month: 'short' });
  const dots = milestone.step !== undefined && !!milestone.goal;
  return (
    <div className={`rounded-2xl border p-3 ${milestone.done ? 'bg-amber-50 border-amber-300' : 'bg-white border-amber-200'}`}>
      <div className="flex items-center gap-1 text-[10px] font-black text-amber-800 mb-1">
        <span className="material-symbols-outlined text-[14px]">{milestone.done ? 'emoji_events' : 'flag'}</span>
        <span className="flex-1 truncate">
          {t(milestone.done ? 'tagebuch.focusMilestoneDone' : 'tagebuch.focusMilestoneEnded')}
          {milestone.fromCoach && ` · ${t('tagebuch.focusFromCoach')}${milestone.authorName ? ` ${milestone.authorName}` : ''}`}
        </span>
        {time && <span className="text-[10px] font-bold text-gray-400">{time}</span>}
        {onDelete && (
          <button
            onClick={() => setConfirm(v => !v)}
            className={`shrink-0 -mr-1 active:scale-90 transition-all ${confirm ? 'text-red-400' : 'text-amber-300 hover:text-red-400'}`}
            aria-label={t('tagebuch.delete')}
          >
            <span className="material-symbols-outlined text-[16px]">delete</span>
          </button>
        )}
      </div>
      <p className="text-[13px] font-black text-[#0a3a2a] leading-snug break-words">{focusTitle(milestone, t)}</p>
      {milestone.text && milestone.topic && (
        <p className="text-[10px] font-bold text-amber-700 mt-0.5">{topicLabel(milestone.topic, t)}</p>
      )}
      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
        {dots && <FocusDots count={milestone.step!} goal={milestone.goal!} small light />}
        <span className="text-[10px] font-bold text-amber-700">{fmt(milestone.since)} – {fmt(milestone.endedAt)}</span>
      </div>
      {confirm && onDelete && (
        <div className="flex items-center gap-2 mt-2">
          <span className="text-[10px] font-black text-red-500 flex-1">{t('tagebuch.deleteEntryTitle')}</span>
          <button onClick={() => setConfirm(false)} className="px-3 py-1 bg-gray-100 text-gray-500 rounded-lg font-black text-[9px] uppercase tracking-widest">
            {t('tagebuch.cancel')}
          </button>
          <button onClick={() => onDelete()} className="px-3 py-1 bg-red-500 text-white rounded-lg font-black text-[9px] uppercase tracking-widest">
            {t('tagebuch.delete')}
          </button>
        </div>
      )}
    </div>
  );
}
