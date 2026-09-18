import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import TopicPicker from '../TopicPicker';
import { FOCUS_TEXT_MAX } from '../../utils/focus';

/**
 * Edycja OBECNEGO fokusu — tytuł i temat naraz (user 2026-09-18). Wspólna dla
 * okna ucznia (dziennik) i trenera (profil ucznia). Data startu zostaje po
 * stronie zapisu, więc postęp się nie resetuje. Fokus liczy jeden temat —
 * nowo kliknięty zastępuje poprzedni.
 */
export default function FocusEditForm({ initialText, initialTopic, textRequired = false, hint, onCancel, onSave }: {
  initialText: string;
  initialTopic: string;
  /** Trener: wpis w coachLog musi mieć tekst (reguła). Uczeń: tekst albo temat. */
  textRequired?: boolean;
  hint?: string;
  onCancel: () => void;
  onSave: (text: string, topic: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [text, setText] = useState(initialText);
  const [topic, setTopic] = useState(initialTopic);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);

  const clean = text.trim().slice(0, FOCUS_TEXT_MAX);
  const unchanged = clean === initialText.trim() && topic === initialTopic;
  const valid = textRequired ? !!clean : !!(clean || topic);

  const save = async () => {
    setSaving(true);
    setError(false);
    try {
      await onSave(clean, topic);
    } catch (e) {
      console.error('Fokus: błąd edycji', e);
      setError(true);
      setSaving(false);
    }
  };

  return (
    <div className="space-y-2">
      <textarea
        value={text}
        onChange={e => setText(e.target.value.slice(0, FOCUS_TEXT_MAX))}
        maxLength={FOCUS_TEXT_MAX}
        placeholder={t('tagebuch.focusNewPlaceholder')}
        className="w-full bg-white border border-emerald-200 rounded-lg p-2.5 text-[12px] font-bold text-[#0a3a2a] outline-none focus:border-emerald-500 resize-none h-16"
      />
      <TopicPicker
        selectedTopics={topic ? [topic] : []}
        onChange={next => setTopic(next.filter(x => x !== topic)[0] ?? '')}
      />
      <p className="text-[10px] font-bold text-emerald-700/70 leading-snug">
        {hint || t('studentProfile.focusModalTopicHint')}
      </p>
      {error && <p className="text-[10px] font-bold text-red-600">{t('tagebuch.focusSaveError')}</p>}
      <div className="flex gap-2">
        <button onClick={onCancel} className="flex-1 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest bg-white text-gray-500 border border-gray-200">
          {t('tagebuch.focusBack')}
        </button>
        <button
          onClick={save}
          disabled={saving || unchanged || !valid}
          className="flex-1 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest bg-emerald-600 text-white disabled:opacity-50"
        >
          {t('tagebuch.save')}
        </button>
      </div>
    </div>
  );
}
