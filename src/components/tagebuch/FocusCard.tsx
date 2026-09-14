import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import TopicPicker from '../TopicPicker';

// --- FOKUS ---
// „Nad czym teraz pracuję" przypięte na górze dziennika. Własny fokus siedzi
// w users/{uid}.focus; trener ustawia fokus wpisem typu „Ziel" w coachLog.
// Obowiązuje nowszy z nich. Postęp = na ilu z ostatnich treningów od
// ustawienia fokusu uczeń zaznaczył „Fokus" (temat w session.topics).

export const FOCUS_TEXT_MAX = 120;

export interface ActiveFocus {
  topic: string;         // '' = bez tematu (cel trenera bez tematów) — bez licznika
  text: string;
  since: number;
  fromCoach: boolean;
  authorName?: string;
}

export function focusTitle(focus: ActiveFocus, t: (k: string) => string): string {
  return focus.text || (focus.topic ? t(`sessionSetup.topic_${focus.topic}`) : '');
}

export function FocusCard({ focus, progress, onEdit }: {
  focus: ActiveFocus | null;
  progress: boolean[];   // od najstarszego: czy trening miał zaznaczony fokus
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

  const hits = progress.filter(Boolean).length;
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
      <div className="flex items-center gap-1 mt-2">
        {focus.topic && progress.length > 0 ? (
          <>
            {progress.map((hit, i) => (
              <span key={i} className={`w-4 h-1.5 rounded-full ${hit ? 'bg-emerald-400' : 'bg-white/25'}`} />
            ))}
            <span className="text-[10px] font-bold text-white/75 ml-1.5">
              {t('tagebuch.focusProgress', { hit: hits, count: progress.length })}
            </span>
          </>
        ) : (
          <span className="text-[10px] font-bold text-white/60">
            {focus.topic
              ? t('tagebuch.focusHint')
              : t('tagebuch.focusSince', { date: new Date(focus.since).toLocaleDateString(i18n.language, { day: 'numeric', month: 'short' }) })}
          </span>
        )}
      </div>
    </button>
  );
}

export function FocusEditor({ initial, canEnd, onSave, onEnd, onCancel }: {
  initial: { topic: string; text: string };
  canEnd: boolean;
  onSave: (topic: string, text: string) => Promise<void>;
  onEnd: () => Promise<void>;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [topic, setTopic] = useState(initial.topic);
  const [text, setText] = useState(initial.text);
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

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-3 space-y-3">
      <div className="flex items-center gap-1.5 text-[11px] font-black text-[#0a3a2a]">
        <span className="material-symbols-outlined text-[16px] text-emerald-600">track_changes</span>
        {t('tagebuch.focusLabel')}
      </div>

      <div>
        <p className="text-[10px] font-bold text-gray-500 mb-1.5">{t('tagebuch.focusPickTopic')}</p>
        {/* Fokus to JEDEN temat — nowo kliknięty zastępuje poprzedni. */}
        <TopicPicker
          selectedTopics={topic ? [topic] : []}
          onChange={next => setTopic(next.filter(x => x !== topic)[0] ?? '')}
        />
      </div>

      <input
        value={text}
        onChange={e => setText(e.target.value.slice(0, FOCUS_TEXT_MAX))}
        placeholder={t('tagebuch.focusTextPlaceholder')}
        className="w-full text-[13px] font-medium text-gray-700 placeholder-gray-300 bg-gray-50 rounded-xl px-3 py-2 outline-none"
      />

      {error && <p className="text-[10px] font-bold text-red-500">{t('tagebuch.focusSaveError')}</p>}

      <div className="flex items-center gap-2">
        {canEnd && (
          <button
            onClick={() => run(onEnd)}
            disabled={isSaving}
            className="text-[10px] font-black text-red-500 px-2 py-2 rounded-xl active:bg-red-50 disabled:opacity-40"
          >
            {t('tagebuch.focusEnd')}
          </button>
        )}
        <div className="flex-1" />
        <button
          onClick={onCancel}
          className="px-3 py-2 bg-gray-100 text-gray-500 rounded-xl font-black text-[10px] uppercase tracking-widest active:scale-95 transition-all"
        >
          {t('tagebuch.cancel')}
        </button>
        <button
          onClick={() => run(() => onSave(topic, text.trim()))}
          disabled={!topic || isSaving}
          className="bg-[#0a3a2a] text-white text-[10px] font-black uppercase tracking-widest px-4 py-2 rounded-xl disabled:opacity-40 active:scale-95 transition-all"
        >
          {t('tagebuch.save')}
        </button>
      </div>
    </div>
  );
}
