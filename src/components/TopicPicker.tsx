import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TRAINING_TOPICS } from '../constants/trainingTopics';

interface TopicPickerProps {
  selectedTopics: string[];
  onChange: (topics: string[]) => void;
}

export default function TopicPicker({ selectedTopics, onChange }: TopicPickerProps) {
  const { t } = useTranslation();
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);

  const toggleTopic = (id: string) => {
    onChange(selectedTopics.includes(id)
      ? selectedTopics.filter(t => t !== id)
      : [...selectedTopics, id]
    );
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">
          {t('sessionSetup.trainingTopics')}
        </span>
        {selectedTopics.length > 0 && (
          <span className="text-[9px] font-black text-emerald-600">
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
                className="flex items-center gap-0.5 bg-emerald-50 text-emerald-700 border border-emerald-100 px-2 py-0.5 rounded-full text-[9px] font-black active:scale-95 transition-all"
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
                expandedCategory === cat.id
                  ? 'bg-emerald-600 text-white'
                  : hasSelected
                  ? 'bg-emerald-50 text-emerald-700 border-2 border-emerald-200'
                  : 'bg-gray-50 text-gray-500 border border-gray-100'
              }`}
            >
              {cat.num}
              {hasSelected && expandedCategory !== cat.id && (
                <span className="absolute -top-1 -right-1 w-2 h-2 bg-emerald-500 rounded-full" />
              )}
            </button>
          );
        })}
      </div>

      {/* Rozwinięte podtematy */}
      {expandedCategory && (
        <div className="bg-gray-50 rounded-xl p-2 space-y-0.5 border border-gray-100">
          <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1.5 px-1">
            {t(`sessionSetup.topicCat_${expandedCategory}`)}
          </p>
          {TRAINING_TOPICS.find(c => c.id === expandedCategory)?.subtopics.map(sub => {
            const checked = selectedTopics.includes(sub.id);
            return (
              <button
                key={sub.id}
                onClick={() => toggleTopic(sub.id)}
                className={`w-full flex items-center gap-2 py-1.5 px-2 rounded-lg text-left transition-all active:scale-[0.98] ${
                  checked ? 'bg-emerald-100' : 'hover:bg-gray-100'
                }`}
              >
                <span className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                  checked ? 'bg-emerald-500 border-emerald-500' : 'border-gray-300 bg-white'
                }`}>
                  {checked && <span className="material-symbols-outlined text-white text-[11px]">check</span>}
                </span>
                <div className="min-w-0">
                  <span className="text-[11px] font-black text-[#0a3a2a] block">
                    {t(`sessionSetup.topic_${sub.id}`)}
                  </span>
                  {t(`sessionSetup.topic_${sub.id}`) !== sub.term && (
                    <span className="text-[8px] text-gray-400 font-bold">{sub.term}</span>
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
