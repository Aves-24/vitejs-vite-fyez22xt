import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TRAINING_TOPICS } from '../constants/trainingTopics';

interface TopicPickerProps {
  selectedTopics: string[];
  onChange: (topics: string[]) => void;
  onDark?: boolean;   // na zielonym nagłówku (edytor fokusu w dzienniku)
}

// Klasy dla jasnego tła i dla zielonego nagłówku. Na ciemnym nie używamy
// bg-white / text-[#0a3a2a] — ciemny motyw je remapuje (src/tailwind.css).
const LIGHT = {
  caption: 'text-gray-400',
  count: 'text-emerald-600',
  chip: 'bg-emerald-50 text-emerald-700 border border-emerald-100',
  catOpen: 'bg-emerald-600 text-white',
  catHas: 'bg-emerald-50 text-emerald-700 border-2 border-emerald-200',
  catIdle: 'bg-gray-50 text-gray-500 border border-gray-100',
  dot: 'bg-emerald-500',
  panel: 'bg-gray-50 border border-gray-100',
  panelCaption: 'text-gray-400',
  rowOn: 'bg-emerald-100',
  rowOff: 'hover:bg-gray-100',
  boxOn: 'bg-emerald-500 border-emerald-500',
  boxOff: 'border-gray-300 bg-white',
  name: 'text-[#0a3a2a]',
  term: 'text-gray-400',
};
const DARK: typeof LIGHT = {
  caption: 'text-white/50',
  count: 'text-emerald-300',
  chip: 'bg-emerald-400/20 text-emerald-100 border border-emerald-300/30',
  catOpen: 'bg-[#fed33e] text-[#0a3a2a]',
  catHas: 'bg-emerald-400/20 text-emerald-100 border-2 border-emerald-300/50',
  catIdle: 'bg-white/10 text-white/80 border border-white/10',
  dot: 'bg-emerald-300',
  panel: 'bg-black/15 border border-white/10',
  panelCaption: 'text-white/50',
  rowOn: 'bg-emerald-400/20',
  rowOff: 'hover:bg-white/10',
  boxOn: 'bg-emerald-400 border-emerald-400',
  boxOff: 'border-white/40 bg-transparent',
  name: 'text-white',
  term: 'text-white/50',
};

export default function TopicPicker({ selectedTopics, onChange, onDark = false }: TopicPickerProps) {
  const { t } = useTranslation();
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const c = onDark ? DARK : LIGHT;

  const toggleTopic = (id: string) => {
    onChange(selectedTopics.includes(id)
      ? selectedTopics.filter(t => t !== id)
      : [...selectedTopics, id]
    );
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className={`text-[9px] font-black uppercase tracking-widest ${c.caption}`}>
          {t('sessionSetup.trainingTopics')}
        </span>
        {selectedTopics.length > 0 && (
          <span className={`text-[9px] font-black ${c.count}`}>
            {selectedTopics.length} {t('sessionSetup.topicsSelected')}
          </span>
        )}
      </div>

      {/* Wybrane tematy — chipy */}
      {selectedTopics.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {selectedTopics.map(id => {
            const sub = TRAINING_TOPICS.flatMap(c => c.subtopics).find(s => s.id === id);
            if (!sub) return null;
            return (
              <button
                key={id}
                onClick={() => toggleTopic(id)}
                className={`flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[9px] font-black active:scale-95 transition-all ${c.chip}`}
              >
                {t(`sessionSetup.topic_${sub.id}`)}
                <span className="material-symbols-outlined text-[10px] ml-0.5">close</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Przyciski kategorii 1–5 */}
      <div className="grid grid-cols-5 gap-1 mb-1">
        {TRAINING_TOPICS.map(cat => {
          const hasSelected = cat.subtopics.some(s => selectedTopics.includes(s.id));
          return (
            <button
              key={cat.id}
              onClick={() => setExpandedCategory(v => v === cat.id ? null : cat.id)}
              className={`py-1.5 rounded-xl text-[9px] font-black text-center leading-tight transition-all relative ${
                expandedCategory === cat.id ? c.catOpen : hasSelected ? c.catHas : c.catIdle
              }`}
            >
              {cat.num}
              {hasSelected && expandedCategory !== cat.id && (
                <span className={`absolute -top-1 -right-1 w-2 h-2 rounded-full ${c.dot}`} />
              )}
            </button>
          );
        })}
      </div>

      {/* Rozwinięte podtematy */}
      {expandedCategory && (
        <div className={`rounded-xl p-2 space-y-0.5 ${c.panel}`}>
          <p className={`text-[8px] font-black uppercase tracking-widest mb-1.5 px-1 ${c.panelCaption}`}>
            {t(`sessionSetup.topicCat_${expandedCategory}`)}
          </p>
          {TRAINING_TOPICS.find(c => c.id === expandedCategory)?.subtopics.map(sub => {
            const checked = selectedTopics.includes(sub.id);
            return (
              <button
                key={sub.id}
                onClick={() => toggleTopic(sub.id)}
                className={`w-full flex items-center gap-2 py-1.5 px-2 rounded-lg text-left transition-all active:scale-[0.98] ${
                  checked ? c.rowOn : c.rowOff
                }`}
              >
                <span className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                  checked ? c.boxOn : c.boxOff
                }`}>
                  {checked && <span className="material-symbols-outlined text-white text-[11px]">check</span>}
                </span>
                <div className="min-w-0">
                  <span className={`text-[11px] font-black block ${c.name}`}>
                    {t(`sessionSetup.topic_${sub.id}`)}
                  </span>
                  {t(`sessionSetup.topic_${sub.id}`) !== sub.term && (
                    <span className={`text-[8px] font-bold ${c.term}`}>{sub.term}</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
