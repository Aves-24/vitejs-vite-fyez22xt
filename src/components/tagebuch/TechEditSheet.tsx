import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import TopicPicker from '../TopicPicker';
import { TECH_ARROWS_MAX, type TechSessionEdit } from '../../utils/techSession';

// [TECHNIK] Poprawka treningu technicznego z dziennika (user 2026-10-25):
// liczba strzał, data + godzina, tematy i opis. Okno u góry jak NoteSheet.

const pad = (n: number) => String(n).padStart(2, '0');
const dateValue = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const timeValue = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

export function TechEditSheet({ initial, noteMax, onSave, onClose }: {
  initial: TechSessionEdit;
  /** Limit opisu: widoczny dla trenera krótszy (jak notatka sesji). */
  noteMax: number;
  onSave: (edit: TechSessionEdit) => Promise<void>;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const start = new Date(initial.ts || Date.now());
  const [arrows, setArrows] = useState(String(initial.arrows || ''));
  const [date, setDate] = useState(dateValue(start));
  const [time, setTime] = useState(timeValue(start));
  const [topics, setTopics] = useState<string[]>(initial.topics);
  const [note, setNote] = useState(initial.note);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(false);

  const count = Math.min(TECH_ARROWS_MAX, Math.max(0, parseInt(arrows, 10) || 0));
  const when = new Date(`${date}T${time || '12:00'}`);
  const today = dateValue(new Date());
  // Bez strzał i w przyszłości nie zapisujemy.
  const valid = count > 0 && !isNaN(when.getTime()) && date <= today;

  const step = (d: number) => setArrows(String(Math.min(TECH_ARROWS_MAX, Math.max(1, count + d))));

  const handleSave = async () => {
    if (!valid || isSaving) return;
    setIsSaving(true);
    setError(false);
    try {
      await onSave({ arrows: count, ts: when.getTime(), topics, note: note.trim().slice(0, noteMax) });
      onClose();
    } catch (e) {
      console.error('Tagebuch: błąd zapisu treningu technicznego', e);
      setError(true);
      setIsSaving(false);
    }
  };

  const field = 'w-full bg-gray-50 border border-gray-100 focus:border-sky-300 focus:bg-white rounded-xl px-3 py-2.5 text-[14px] font-black text-[#0a3a2a] outline-none transition-colors';

  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-start justify-center p-4 pt-[calc(env(safe-area-inset-top)+16px)]">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm tb-fade-in" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('tagebuch.editTech')}
        className="relative w-full max-w-[400px] bg-white rounded-[32px] shadow-2xl p-5 max-h-[85dvh] overflow-y-auto tb-fade-in"
      >
        <div className="flex items-center gap-2.5 mb-4">
          <span className="w-9 h-9 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-[20px]">fitness_center</span>
          </span>
          <p className="flex-1 min-w-0 text-[15px] font-black text-[#0a3a2a] leading-tight">{t('tagebuch.editTech')}</p>
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-gray-100 text-gray-500 flex items-center justify-center active:scale-90 transition-all" aria-label={t('tagebuch.cancel')}>
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1">{t('common.arrows')}</label>
        <div className="flex items-center gap-2 mb-3">
          <button onClick={() => step(-1)} className="w-11 h-11 rounded-xl bg-gray-100 text-gray-600 flex items-center justify-center active:scale-95 transition-all" aria-label="−1">
            <span className="material-symbols-outlined text-[20px]">remove</span>
          </button>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={TECH_ARROWS_MAX}
            value={arrows}
            onChange={e => setArrows(e.target.value.replace(/\D/g, '').slice(0, 3))}
            className={`${field} text-center flex-1`}
          />
          <button onClick={() => step(1)} className="w-11 h-11 rounded-xl bg-gray-100 text-gray-600 flex items-center justify-center active:scale-95 transition-all" aria-label="+1">
            <span className="material-symbols-outlined text-[20px]">add</span>
          </button>
        </div>

        <div className="flex gap-2 mb-3">
          <div className="flex-1 min-w-0">
            <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1">{t('tagebuch.techDate')}</label>
            <input type="date" value={date} max={today} onChange={e => setDate(e.target.value)} className={field} />
          </div>
          <div className="w-[110px] shrink-0">
            <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1">{t('tagebuch.techTime')}</label>
            <input type="time" value={time} onChange={e => setTime(e.target.value)} className={field} />
          </div>
        </div>

        <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1">{t('tagebuch.techNote')}</label>
        <textarea
          value={note}
          onChange={e => setNote(e.target.value.slice(0, noteMax))}
          rows={3}
          placeholder={t('tagebuch.notePlaceholder')}
          className="w-full mb-3 bg-gray-50 border border-gray-100 focus:border-sky-300 focus:bg-white rounded-xl px-3 py-2.5 text-[14px] font-medium text-gray-700 placeholder-gray-300 resize-none outline-none leading-relaxed transition-colors"
        />

        <TopicPicker selectedTopics={topics} onChange={setTopics} />

        {error && <p className="text-[10px] font-bold text-red-500 mt-2">{t('tagebuch.techSaveError')}</p>}

        <div className="flex items-center gap-2 mt-4">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl bg-gray-100 text-gray-500 text-[11px] font-black uppercase tracking-widest active:scale-95 transition-all">
            {t('tagebuch.cancel')}
          </button>
          <button
            onClick={handleSave}
            disabled={!valid || isSaving}
            className="flex-1 py-3 rounded-xl bg-[#0a3a2a] text-white text-[11px] font-black uppercase tracking-widest disabled:opacity-40 active:scale-95 transition-all"
          >
            {t('tagebuch.save')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
