import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import TopicPicker from '../TopicPicker';
import { FOCUS_GOAL, FOCUS_TEXT_MAX, type ActiveFocus } from '../../utils/focus';

// --- FOKUS ---
// Karta „Twój fokus" na górze dziennika, pasek na Home i edytor. Logika
// (który fokus obowiązuje, liczenie treningów) siedzi w utils/focus.ts.

export function focusTitle(focus: ActiveFocus, t: (k: string) => string): string {
  return focus.text || (focus.topic ? t(`sessionSetup.topic_${focus.topic}`) : '');
}

/** Kropki postępu: FOCUS_GOAL sztuk, po osiągnięciu celu wszystkie złote. */
export function FocusDots({ count, small = false }: { count: number; small?: boolean }) {
  const done = count >= FOCUS_GOAL;
  const size = small ? 'w-2 h-2' : 'w-2.5 h-2.5';
  return (
    <span className="flex items-center gap-1">
      {Array.from({ length: FOCUS_GOAL }, (_, i) => (
        <span
          key={i}
          className={`${size} rounded-full ${done ? 'bg-[#fed33e]' : i < count ? 'bg-emerald-400' : 'bg-white/25'}`}
        />
      ))}
    </span>
  );
}

function FocusProgressText({ count }: { count: number }) {
  const { t } = useTranslation();
  return (
    <span className="text-[10px] font-bold text-white/75">
      {count >= FOCUS_GOAL
        ? t('tagebuch.focusDone', { count })
        : t('tagebuch.focusCount', { hit: count, goal: FOCUS_GOAL })}
    </span>
  );
}

export function FocusCard({ focus, dots, count, onEdit }: {
  focus: ActiveFocus | null;
  dots: boolean;        // użytkownik włączył kropki
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
  const done = showDots && count >= FOCUS_GOAL;
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
            <FocusDots count={count} />
            <FocusProgressText count={count} />
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

/** Wąski pasek na Home — przypomina fokus przed treningiem, klik = dziennik. */
export function FocusStrip({ focus, dots, count, onOpen }: {
  focus: ActiveFocus;
  dots: boolean;
  count: number;
  onOpen: () => void;
}) {
  const { t } = useTranslation();
  const showDots = dots && !!focus.topic;
  return (
    <button
      onClick={onOpen}
      className="w-full flex items-center gap-3 bg-[#0a3a2a] rounded-[20px] px-4 py-2.5 text-left active:scale-[0.99] transition-all shadow-sm"
    >
      <span className="material-symbols-outlined text-[22px] text-[#fed33e] shrink-0">track_changes</span>
      <div className="flex-1 min-w-0">
        <p className="text-[9px] font-black uppercase tracking-widest text-[#fed33e] truncate">
          {t('tagebuch.focusLabel')}
          {focus.fromCoach && ` · ${t('tagebuch.focusFromCoach')}`}
        </p>
        <p className="text-[13px] font-black text-white leading-snug truncate">{focusTitle(focus, t)}</p>
        {showDots && (
          <div className="flex items-center gap-2 mt-1">
            <FocusDots count={count} small />
            <FocusProgressText count={count} />
          </div>
        )}
      </div>
      <span className="material-symbols-outlined text-[20px] text-white/60 shrink-0">chevron_right</span>
    </button>
  );
}

export function FocusEditor({ initial, initialDots, canEnd, onSave, onEnd, onCancel }: {
  initial: { topic: string; text: string };
  initialDots: boolean;
  canEnd: boolean;
  onSave: (topic: string, text: string, dots: boolean) => Promise<void>;
  onEnd: () => Promise<void>;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [topic, setTopic] = useState(initial.topic);
  const [text, setText] = useState(initial.text);
  const [dots, setDots] = useState(initialDots);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(false);

  const run = async (fn: () => Promise<void>) => {
    setIsSaving(true);
    setError(false);
    try {
      await fn();
    } catch (e) {
      console.error('Tagebuch: błąd zapisu fokusu', e);
      setError(true);
      setIsSaving(false);
    }
  };

  // Edytor otwiera się W MIEJSCU karty, na zielonym nagłówku — biały blok
  // niżej wyglądał, jakby karta fokusu zniknęła.
  return (
    <div className="mt-3 w-full bg-white/10 ring-1 ring-white/20 rounded-2xl px-3 py-2.5 space-y-3">
      <div className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-[#fed33e]">
        <span className="material-symbols-outlined text-[13px]">track_changes</span>
        {t('tagebuch.focusLabel')}
      </div>

      <div>
        <p className="text-[10px] font-bold text-white/70 mb-1.5">{t('tagebuch.focusPickTopic')}</p>
        {/* Fokus to JEDEN temat — nowo kliknięty zastępuje poprzedni. */}
        <TopicPicker
          onDark
          selectedTopics={topic ? [topic] : []}
          onChange={next => setTopic(next.filter(x => x !== topic)[0] ?? '')}
        />
      </div>

      <input
        value={text}
        onChange={e => setText(e.target.value.slice(0, FOCUS_TEXT_MAX))}
        placeholder={t('tagebuch.focusTextPlaceholder')}
        className="w-full text-[13px] font-medium text-white placeholder-white/40 bg-white/10 rounded-xl px-3 py-2 outline-none focus:ring-1 focus:ring-white/30"
      />

      {/* Kropki to opcja dla chętnych — kto trenuje dla zabawy, nie musi
          niczego zaznaczać. Ustawienie na konto, nie na jeden fokus. */}
      <button
        type="button"
        role="switch"
        aria-checked={dots}
        onClick={() => setDots(v => !v)}
        className="w-full flex items-center gap-3 bg-black/15 rounded-xl px-3 py-2 text-left"
      >
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-black text-white flex items-center gap-2">
            {t('tagebuch.focusDotsLabel')}
            <FocusDots count={dots ? 2 : 0} small />
          </p>
          <p className="text-[10px] font-bold text-white/55 leading-snug mt-0.5">{t('tagebuch.focusDotsHint', { goal: FOCUS_GOAL })}</p>
        </div>
        <span className={`relative w-9 h-5 rounded-full shrink-0 transition-colors ${dots ? 'bg-emerald-400' : 'bg-white/25'}`}>
          {/* bg-[#fff], nie bg-white — ciemny motyw remapuje bg-white na ciemne tło. */}
          <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-[#fff] transition-all ${dots ? 'left-[18px]' : 'left-0.5'}`} />
        </span>
      </button>

      {error && <p className="text-[10px] font-bold text-red-300">{t('tagebuch.focusSaveError')}</p>}

      <div className="flex items-center gap-2">
        {canEnd && (
          <button
            onClick={() => run(onEnd)}
            disabled={isSaving}
            className="text-[10px] font-black text-red-300 px-2 py-2 rounded-xl active:bg-white/10 disabled:opacity-40"
          >
            {t('tagebuch.focusEnd')}
          </button>
        )}
        <div className="flex-1" />
        <button
          onClick={onCancel}
          className="px-3 py-2 bg-white/10 text-white/80 rounded-xl font-black text-[10px] uppercase tracking-widest active:scale-95 transition-all"
        >
          {t('tagebuch.cancel')}
        </button>
        {/* bg i text-[#0a3a2a] na tym samym elemencie — ciemny motyw zostawia ciemny tekst na żółtym. */}
        <button
          onClick={() => run(() => onSave(topic, text.trim(), dots))}
          disabled={!topic || isSaving}
          className="bg-[#fed33e] text-[#0a3a2a] text-[10px] font-black uppercase tracking-widest px-4 py-2 rounded-xl disabled:opacity-40 active:scale-95 transition-all"
        >
          {t('tagebuch.save')}
        </button>
      </div>
    </div>
  );
}
