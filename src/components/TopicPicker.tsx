import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  TRAINING_TOPICS, CUSTOM_CATEGORY_ID, CUSTOM_TOPIC_MAX_LEN, isKnownTopic, topicLabel,
} from '../constants/trainingTopics';
import { useCustomTopics } from '../hooks/useCustomTopics';

interface TopicPickerProps {
  selectedTopics: string[];
  onChange: (topics: string[]) => void;
  onDark?: boolean;   // na zielonym nagłówku (edytor fokusu w dzienniku)
  /** Temat oznaczony ikoną fokusu na chipie (formularz treningu). */
  markedTopic?: string;
  /** Bez podpisu „Tematy treningowe” — gdy rodzic ma własny nagłówek. */
  hideCaption?: boolean;
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
  input: 'bg-white border border-gray-200 text-[#0a3a2a] placeholder:text-gray-300',
  add: 'bg-emerald-600 text-white',
  remove: 'text-gray-300 hover:text-red-500',
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
  input: 'bg-white/10 border border-white/20 text-white placeholder:text-white/40',
  add: 'bg-[#fed33e] text-[#0a3a2a]',
  remove: 'text-white/40 hover:text-red-300',
};

export default function TopicPicker({ selectedTopics, onChange, onDark = false, markedTopic, hideCaption = false }: TopicPickerProps) {
  const { t } = useTranslation();
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const custom = useCustomTopics();
  const c = onDark ? DARK : LIGHT;

  const toggleTopic = (id: string) => {
    onChange(selectedTopics.includes(id)
      ? selectedTopics.filter(t => t !== id)
      : [...selectedTopics, id]
    );
  };

  // [C39] Tematy w kategorii: wbudowane + własne trenera przypięte do niej.
  const topicsIn = (catId: string): string[] => [
    ...(TRAINING_TOPICS.find(x => x.id === catId)?.subtopics.map(s => s.id) || []),
    ...custom.topics.filter(x => x.cat === catId).map(x => x.id),
  ];
  const customIds = new Set(custom.topics.map(x => x.id));
  // Szósta kategoria: trener zawsze (tam dopisuje), reszta tylko gdy coś w niej ma.
  const showCustomCat = custom.canEdit || custom.topics.some(x => x.cat === CUSTOM_CATEGORY_ID);
  const categories: { id: string; num: React.ReactNode }[] = [
    ...TRAINING_TOPICS.map(x => ({ id: x.id, num: x.num })),
    ...(showCustomCat ? [{
      id: CUSTOM_CATEGORY_ID,
      num: <span className="material-symbols-outlined text-[13px] leading-none align-middle">edit_note</span>,
    }] : []),
  ];

  const addDraft = async () => {
    if (!expandedCategory || !draft.trim()) return;
    const id = await custom.add(draft, expandedCategory).catch(() => null);
    if (id) {
      setDraft('');
      if (!selectedTopics.includes(id)) onChange([...selectedTopics, id]);
    }
  };

  const shown = selectedTopics.filter(isKnownTopic);

  return (
    <div>
      {!hideCaption && (
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
      )}

      {/* Wybrane tematy — chipy (także własne tematy trenera przypisane uczniowi) */}
      {shown.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {shown.map(id => (
            <button
              key={id}
              onClick={() => toggleTopic(id)}
              className={`flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[9px] font-black active:scale-95 transition-all ${c.chip}`}
            >
              {id === markedTopic && <span className="material-symbols-outlined text-[11px] text-[#b8860b] mr-0.5" aria-label={t('tagebuch.focusLabel')}>track_changes</span>}
              {topicLabel(id, t)}
              <span className="material-symbols-outlined text-[10px] ml-0.5">close</span>
            </button>
          ))}
        </div>
      )}

      {/* Przyciski kategorii 1–5 (+ własne) */}
      <div className={`grid gap-1 mb-1 ${categories.length > 5 ? 'grid-cols-6' : 'grid-cols-5'}`}>
        {categories.map(cat => {
          const hasSelected = topicsIn(cat.id).some(id => selectedTopics.includes(id));
          return (
            <button
              key={cat.id}
              onClick={() => { setExpandedCategory(v => v === cat.id ? null : cat.id); setDraft(''); }}
              aria-label={t(`sessionSetup.topicCat_${cat.id}`)}
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
          {topicsIn(expandedCategory).map(id => {
            const checked = selectedTopics.includes(id);
            const own = customIds.has(id);
            return (
              <div key={id} className="flex items-center gap-1">
                <button
                  onClick={() => toggleTopic(id)}
                  className={`flex-1 min-w-0 flex items-center gap-2 py-1.5 px-2 rounded-lg text-left transition-all active:scale-[0.98] ${
                    checked ? c.rowOn : c.rowOff
                  }`}
                >
                  <span className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                    checked ? c.boxOn : c.boxOff
                  }`}>
                    {checked && <span className="material-symbols-outlined text-white text-[11px]">check</span>}
                  </span>
                  <span className={`text-[11px] font-black min-w-0 break-words ${c.name}`}>
                    {topicLabel(id, t)}
                  </span>
                  {own && <span className={`material-symbols-outlined text-[12px] ml-auto shrink-0 ${c.panelCaption}`}>edit_note</span>}
                </button>
                {own && custom.canEdit && (
                  <button
                    onClick={() => { custom.remove(id).catch(() => {}); }}
                    className={`w-7 h-7 shrink-0 flex items-center justify-center rounded-lg transition-all active:scale-90 ${c.remove}`}
                    aria-label={t('sessionSetup.customTopicRemove')}
                    title={t('sessionSetup.customTopicRemove')}
                  >
                    <span className="material-symbols-outlined text-[15px]">delete</span>
                  </button>
                )}
              </div>
            );
          })}

          {/* [C39] Trener dopisuje własny temat do otwartej kategorii */}
          {custom.canEdit && (
            <div className="flex items-center gap-1 pt-1">
              <input
                value={draft}
                onChange={e => setDraft(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addDraft(); } }}
                maxLength={CUSTOM_TOPIC_MAX_LEN}
                placeholder={t('sessionSetup.customTopicPlaceholder')}
                className={`flex-1 min-w-0 rounded-lg px-2 py-1.5 text-[11px] font-bold outline-none ${c.input}`}
              />
              <button
                onClick={addDraft}
                disabled={!draft.trim()}
                className={`h-7 px-2.5 shrink-0 flex items-center gap-0.5 rounded-lg text-[10px] font-black transition-all active:scale-95 disabled:opacity-40 ${c.add}`}
              >
                <span className="material-symbols-outlined text-[14px]">add</span>
                {t('sessionSetup.customTopicAdd')}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
