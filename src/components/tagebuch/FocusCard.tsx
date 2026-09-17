import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import TopicPicker from '../TopicPicker';
import { FOCUS_GOAL_DEFAULT, FOCUS_GOAL_OPTIONS, FOCUS_TEXT_MAX, type ActiveFocus } from '../../utils/focus';

// --- FOKUS ---
// Karta „Twój fokus" na górze dziennika, pasek na Home i edytor. Logika
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

export function FocusEditor({ initial, initialDots, initialGoal, progress, canEnd, onSave, onEnd, onCancel }: {
  initial: { topic: string; text: string };
  initialDots: boolean;
  initialGoal: number;
  progress: { count: number; goal: number } | null;   // tylko przy włączonych kropkach
  canEnd: boolean;
  onSave: (topic: string, text: string, dots: boolean, goal: number) => Promise<void>;
  onEnd: () => Promise<void>;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [topic, setTopic] = useState(initial.topic);
  const [text, setText] = useState(initial.text);
  const [dots, setDots] = useState(initialDots);
  const [goal, setGoal] = useState(initialGoal || FOCUS_GOAL_DEFAULT);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  // Gratulacje dotyczą fokusu, który się kończy — nie tego, co ktoś właśnie
  // przeklikał w edytorze.
  const goalReached = !!progress && progress.count >= progress.goal;
  const endTopicLabel = initial.topic ? t(`sessionSetup.topic_${initial.topic}`) : initial.text;

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
          niczego zaznaczać. „Wył." albo ile treningów poświęcić na fokus.
          Ustawienie na konto, nie na jeden fokus (działa też z celem trenera). */}
      <div className="bg-black/15 rounded-xl px-3 py-2.5">
        <p className="text-[11px] font-black text-white">{t('tagebuch.focusDotsLabel')}</p>
        <div className="grid grid-cols-5 gap-1 mt-2" role="radiogroup" aria-label={t('tagebuch.focusDotsLabel')}>
          {[0, ...FOCUS_GOAL_OPTIONS].map(n => {
            const active = n === 0 ? !dots : dots && goal === n;
            return (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => { setDots(n > 0); if (n > 0) setGoal(n); }}
                className={`py-1.5 rounded-lg text-[11px] font-black transition-all active:scale-95 ${
                  active ? 'bg-[#fed33e] text-[#0a3a2a]' : 'bg-white/10 text-white/80'
                }`}
              >
                {n === 0 ? t('tagebuch.focusDotsOff') : n}
              </button>
            );
          })}
        </div>
        {dots && (
          <div className="flex items-center gap-2 mt-2">
            <FocusDots count={0} goal={goal} small />
            <span className="text-[10px] font-bold text-white/75">{t('tagebuch.focusDotsGoal', { goal })}</span>
          </div>
        )}
        <p className="text-[10px] font-bold text-white/55 leading-snug mt-1.5">{t('tagebuch.focusDotsHint')}</p>
      </div>

      {error && <p className="text-[10px] font-bold text-red-300">{t('tagebuch.focusSaveError')}</p>}

      {/* Zakończenie fokusu nie jest natychmiastowe — najpierw potwierdzenie.
          Przy komplecie kropek zamiast pytania są gratulacje. */}
      {confirmEnd ? (
        goalReached ? (
          <div className="bg-[rgba(254,211,62,0.15)] border border-[rgba(254,211,62,0.5)] rounded-xl px-3 py-3 text-center">
            <span className="material-symbols-outlined text-[34px] text-[#fed33e]">emoji_events</span>
            <p className="text-[15px] font-black text-white leading-tight">{t('tagebuch.focusCongrats')}</p>
            <p className="text-[11px] font-bold text-white/80 leading-snug mt-1">
              {t('tagebuch.focusCongratsText', { goal: progress!.goal, topic: endTopicLabel })}
            </p>
            <div className="flex justify-center mt-2">
              <FocusDots count={progress!.count} goal={progress!.goal} />
            </div>
            <div className="flex items-center gap-2 mt-3">
              <button
                onClick={() => setConfirmEnd(false)}
                className="flex-1 py-2.5 bg-white/10 text-white/80 rounded-xl font-black text-[10px] uppercase tracking-widest active:scale-95 transition-all"
              >
                {t('tagebuch.focusBack')}
              </button>
              <button
                onClick={() => run(onEnd)}
                disabled={isSaving}
                className="flex-1 py-2.5 bg-[#fed33e] text-[#0a3a2a] rounded-xl font-black text-[10px] uppercase tracking-widest active:scale-95 transition-all disabled:opacity-40"
              >
                {t('tagebuch.focusComplete')}
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-red-500/15 border border-red-300/40 rounded-xl px-3 py-3">
            <p className="text-[12px] font-black text-white leading-snug">{t('tagebuch.focusEndConfirm', { topic: endTopicLabel })}</p>
            <p className="text-[10px] font-bold text-white/70 leading-snug mt-1">{t('tagebuch.focusEndConfirmHint')}</p>
            <div className="flex items-center gap-2 mt-3">
              <button
                onClick={() => setConfirmEnd(false)}
                className="flex-1 py-2.5 bg-white/10 text-white/80 rounded-xl font-black text-[10px] uppercase tracking-widest active:scale-95 transition-all"
              >
                {t('tagebuch.focusBack')}
              </button>
              <button
                onClick={() => run(onEnd)}
                disabled={isSaving}
                className="flex-1 py-2.5 bg-red-500 text-white rounded-xl font-black text-[10px] uppercase tracking-widest active:scale-95 transition-all disabled:opacity-40"
              >
                {t('tagebuch.focusEndYes')}
              </button>
            </div>
          </div>
        )
      ) : (
      /* „Fokus beenden" zawsze pełnym napisem (samo „Beenden" było niejasne);
         Abbrechen/Speichern jako ikony, żeby rząd mieścił się na każdym telefonie. */
      <div className="flex items-center gap-2">
        {canEnd ? (
          <button
            onClick={() => setConfirmEnd(true)}
            disabled={isSaving}
            className="flex-1 whitespace-nowrap px-3 py-2.5 bg-red-500/25 text-red-100 border border-red-300/50 rounded-xl font-black text-[10px] uppercase tracking-widest active:scale-95 transition-all disabled:opacity-40"
          >
            {t('tagebuch.focusEnd')}
          </button>
        ) : (
          <div className="flex-1" />
        )}
        <button
          onClick={onCancel}
          aria-label={t('tagebuch.cancel')}
          title={t('tagebuch.cancel')}
          className="w-11 h-10 shrink-0 flex items-center justify-center bg-white/10 text-white/80 rounded-xl active:scale-95 transition-all"
        >
          <span className="material-symbols-outlined text-[22px]">close</span>
        </button>
        {/* bg i text-[#0a3a2a] na tym samym elemencie — ciemny motyw zostawia ciemny tekst na żółtym. */}
        <button
          onClick={() => run(() => onSave(topic, text.trim(), dots, goal))}
          disabled={!topic || isSaving}
          aria-label={t('tagebuch.save')}
          title={t('tagebuch.save')}
          className="w-14 h-10 shrink-0 flex items-center justify-center bg-[#fed33e] text-[#0a3a2a] rounded-xl disabled:opacity-40 active:scale-95 transition-all"
        >
          <span className="material-symbols-outlined text-[24px]">check</span>
        </button>
      </div>
      )}
    </div>
  );
}
