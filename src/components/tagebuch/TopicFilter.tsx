import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TRAINING_TOPICS, CUSTOM_CATEGORY_ID, topicLabel } from '../../constants/trainingTopics';

/**
 * Filtr tematu w panelu filtrów dziennika (user 2026-10-23: systemowa lista
 * „jak nie z naszej aplikacji”). Układ jak TopicPicker przy treningu:
 * kategorie 1–5 (+ własne trenera), po kliknięciu tematy z liczbą wpisów.
 * Jeden temat naraz; drugi tap w wybrany = wszystkie tematy.
 */
export default function TopicFilter({ value, onChange, counts, customIds }: {
  value: string;
  onChange: (topic: string) => void;
  counts: Map<string, number>;
  customIds: string[];   // własne tematy trenera obecne we wpisach
}) {
  const { t } = useTranslation();
  const catOf = (id: string) => TRAINING_TOPICS.find(c => c.subtopics.some(s => s.id === id))?.id
    ?? (customIds.includes(id) ? CUSTOM_CATEGORY_ID : null);
  const [open, setOpen] = useState<string | null>(() => (value ? catOf(value) : null));

  const categories: { id: string; num: React.ReactNode; topics: string[] }[] = [
    ...TRAINING_TOPICS.map(c => ({ id: c.id, num: c.num as React.ReactNode, topics: c.subtopics.map(s => s.id) })),
    ...(customIds.length ? [{
      id: CUSTOM_CATEGORY_ID,
      num: <span className="material-symbols-outlined text-[13px] leading-none align-middle">edit_note</span>,
      topics: customIds,
    }] : []),
  ];
  const sum = (ids: string[]) => ids.reduce((a, id) => a + (counts.get(id) || 0), 0);
  const current = categories.find(c => c.id === open);

  return (
    <div className="mt-2 pt-2 border-t border-gray-100">
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className="material-symbols-outlined text-[15px] text-emerald-700">psychology</span>
        <span className="flex-1 text-[9px] font-black uppercase tracking-widest text-gray-400">{t('tagebuch.topic')}</span>
        {value && (
          <button onClick={() => onChange('')} className="text-[10px] font-black text-gray-400 px-1.5 active:text-gray-600">
            {t('tagebuch.allTopics')}
          </button>
        )}
      </div>
      {/* Kategorie — kropka = jest tu wybrany temat; mała liczba = wpisy w kategorii. */}
      <div className={`grid gap-1 ${categories.length > 5 ? 'grid-cols-6' : 'grid-cols-5'}`}>
        {categories.map(c => {
          const has = !!value && c.topics.includes(value);
          const n = sum(c.topics);
          return (
            <button
              key={c.id}
              onClick={() => setOpen(o => (o === c.id ? null : c.id))}
              aria-label={t(`sessionSetup.topicCat_${c.id}`)}
              aria-expanded={open === c.id}
              className={`relative py-1.5 rounded-xl text-[11px] font-black text-center leading-none transition-all ${
                open === c.id ? 'bg-emerald-600 text-white' : has ? 'bg-emerald-50 text-emerald-700 border-2 border-emerald-200' : 'bg-gray-50 text-gray-500 border border-gray-100'
              }`}
            >
              {c.num}
              <span className={`block text-[8px] font-bold mt-0.5 ${open === c.id ? 'text-white/70' : 'text-gray-400'}`}>{n}</span>
              {has && open !== c.id && <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-emerald-500" />}
            </button>
          );
        })}
      </div>
      {current && (
        <div className="mt-1.5 rounded-xl bg-gray-50 border border-gray-100 p-1.5 max-h-[34vh] overflow-y-auto">
          <p className="text-[8px] font-black uppercase tracking-widest text-gray-400 px-1.5 mb-1">{t(`sessionSetup.topicCat_${current.id}`)}</p>
          {current.topics.map(id => {
            const on = value === id;
            const n = counts.get(id) || 0;
            return (
              <button
                key={id}
                onClick={() => onChange(on ? '' : id)}
                aria-pressed={on}
                className={`w-full flex items-center gap-2 py-1.5 px-2 rounded-lg text-left transition-all active:scale-[0.98] ${on ? 'bg-emerald-100' : 'hover:bg-gray-100'}`}
              >
                <span className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${on ? 'bg-emerald-500 border-emerald-500' : 'border-gray-300 bg-white'}`}>
                  {on && <span className="material-symbols-outlined text-white text-[11px]">check</span>}
                </span>
                <span className={`flex-1 min-w-0 text-[11px] font-black break-words ${n ? 'text-[#0a3a2a]' : 'text-gray-400'}`}>{topicLabel(id, t)}</span>
                <span className={`shrink-0 min-w-[22px] text-center text-[10px] font-black tabular-nums rounded-full px-1.5 py-0.5 ${n ? 'bg-white text-emerald-700 border border-emerald-100' : 'text-gray-300'}`}>{n}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
