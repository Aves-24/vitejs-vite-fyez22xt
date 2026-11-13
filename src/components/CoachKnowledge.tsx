import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { TRAINING_TOPICS, CUSTOM_CATEGORY_ID, topicLabel } from '../constants/trainingTopics';
import { useCustomTopics } from '../hooks/useCustomTopics';
import { useBackClose } from '../hooks/useBackClose';
import { buildKnowledge, matchesKnowledge, NO_TOPIC, type KnowledgeLink, type KnowledgeTopic } from '../utils/knowledgeBase';
import { upcomingOccurrences } from '../utils/groupSchedule';
import { dayKeyOf, TOPIC_LINKS_MAX } from '../utils/focus';
import { isYouTube } from './TopicLinks';
import type { CoachGroup } from '../utils/coachGroups';

// [WISSEN] (user 2026-11-13) Baza wiedzy w menu trenera: tematy treningów
// (kategorie jak w pickerze), przy temacie linki z „Kopieren” i „Ins nächste
// Training” oraz treningi, na których temat był — z tym, co trener wtedy pisał.
// Dane z planów grup (utils/knowledgeBase) — nic nowego nie zapisujemy.

const CAT_ORDER = [...TRAINING_TOPICS.map(c => c.id), CUSTOM_CATEGORY_ID];
const BUILTIN_CAT = new Map(TRAINING_TOPICS.flatMap(c => c.subtopics.map(s => [s.id, c.id] as const)));
/** Kategoria „bez tematu” — na końcu listy. */
const NO_TOPIC_CAT = '_none';

export interface KnowledgeTarget { groupId: string; day: string; link: { url: string; title: string }; topic: string }

export default function CoachKnowledge({ groups, showToast, onAddToTraining }: {
  groups: CoachGroup[];
  showToast: (msg: string) => void;
  /** Otwiera okienko tematu na ten trening z dopisanym linkiem. */
  onAddToTraining: (target: KnowledgeTarget) => void;
}) {
  const { t, i18n } = useTranslation();
  const { topics: customTopics } = useCustomTopics();
  const [query, setQuery] = useState('');
  const [cat, setCat] = useState<string>('all');
  const [openTopic, setOpenTopic] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [copied, setCopied] = useState<string | null>(null);
  const [pick, setPick] = useState<KnowledgeLink | null>(null);
  useBackClose(openTopic !== null, () => setOpenTopic(null), { key: 'knowledgeTopic', value: openTopic });
  useBackClose(!!pick, () => setPick(null));

  const catOf = useMemo(() => {
    const custom = new Map(customTopics.map(c => [c.id, c.cat]));
    return (topic: string) => topic === NO_TOPIC ? NO_TOPIC_CAT
      : BUILTIN_CAT.get(topic) ?? custom.get(topic) ?? CUSTOM_CATEGORY_ID;
  }, [customTopics]);
  const kb = useMemo(() => buildKnowledge(groups, catOf), [groups, catOf]);
  const label = (topic: string) => topic === NO_TOPIC ? t('coachKnowledge.noTopic') : topicLabel(topic, t);
  const catLabel = (c: string) => c === NO_TOPIC_CAT ? t('coachKnowledge.noTopic') : t(`sessionSetup.topicCat_${c}`);
  const fmtDay = (day: string, long = false) => new Date(`${day}T12:00:00`).toLocaleDateString(i18n.language,
    long ? { weekday: 'short', day: 'numeric', month: 'numeric', year: 'numeric' } : { day: 'numeric', month: 'numeric', year: '2-digit' });
  const today = dayKeyOf(Date.now());

  const linkCount = useMemo(() => kb.reduce((n, k) => n + k.links.length, 0), [kb]);
  const filtered = kb.filter(k => (cat === 'all' || k.cat === cat) && matchesKnowledge(k, label(k.topic), query));
  // Kategorie zawsze wszystkie (jak w pickerze); „bez tematu” tylko gdy coś tam jest.
  const cats = [...CAT_ORDER, ...(kb.some(k => k.cat === NO_TOPIC_CAT) ? [NO_TOPIC_CAT] : [])];
  // [PODKATEGORIE] (user 2026-11-13) Klik w kategorię rozwija jej tematy do kliknięcia —
  // także te, których jeszcze nie było na treningu (wyszarzone).
  const subtopicsOf = (c: string): string[] => {
    const builtin = TRAINING_TOPICS.find(x => x.id === c)?.subtopics.map(x => x.id) ?? [];
    const custom = customTopics.filter(x => x.cat === c).map(x => x.id);
    const used = kb.filter(k => k.cat === c).map(k => k.topic);
    return [...new Set([...builtin, ...custom, ...used])];
  };
  const kbOf = (topic: string) => kb.find(k => k.topic === topic);
  const current: KnowledgeTopic | undefined = openTopic === null ? undefined
    : kbOf(openTopic) ?? { topic: openTopic, cat: catOf(openTopic), links: [], trainings: [], lastDay: '' };

  const copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(url);
      window.setTimeout(() => setCopied(c => (c === url ? null : c)), 1500);
      showToast(t('coachKnowledge.copied'));
    } catch {
      showToast(t('coachKnowledge.copyFailed'));
    }
  };

  // Najbliższy trening każdej grupy (z planu; bez planu — dziś).
  const targets = groups.map(g => {
    const day = upcomingOccurrences(g.schedule, today, 8).find(o => !o.cancelled)?.date ?? today;
    const gt = g.topics?.[day];
    return { g, day, gt };
  });
  const addTo = (link: KnowledgeLink, groupId: string, day: string) => {
    setPick(null);
    onAddToTraining({ groupId, day, link: { url: link.url, title: link.title }, topic: current?.topic ?? NO_TOPIC });
  };
  const startAdd = (link: KnowledgeLink) => {
    const ok = targets.filter(x => !x.gt || ((x.gt.links?.length ?? 0) < TOPIC_LINKS_MAX && !x.gt.links?.includes(link.url)));
    if (targets.length === 1 && ok.length === 1) { addTo(link, ok[0].g.id, ok[0].day); return; }
    setPick(link);
  };

  const hostOf = (url: string) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; } };

  if (kb.length === 0) {
    return (
      <div className="text-center py-10 bg-gray-50 rounded-3xl border border-dashed border-gray-200 mt-2 px-6">
        <span className="material-symbols-outlined text-4xl text-gray-300 mb-2 block">local_library</span>
        <p className="text-[11px] font-black text-gray-400 uppercase tracking-widest mb-2">{t('coachKnowledge.emptyTitle')}</p>
        <p className="text-[12px] font-bold text-gray-400 leading-snug">{t('coachKnowledge.emptyText')}</p>
      </div>
    );
  }

  // ─── Ekran tematu ───────────────────────────────────────────────
  if (current) {
    return (
      <div className="space-y-4">
        <div className="flex items-start gap-3">
          <button onClick={() => setOpenTopic(null)} aria-label={t('coachKnowledge.back')}
            className="w-9 h-9 shrink-0 rounded-full bg-gray-100 text-[#0a3a2a] flex items-center justify-center active:scale-90">
            <span className="material-symbols-outlined text-[20px]">arrow_back</span>
          </button>
          <div className="min-w-0">
            <h2 className="text-xl font-black text-[#0a3a2a] leading-tight break-words">{label(current.topic)}</h2>
            <p className="text-[11px] font-bold text-gray-400 mt-0.5">
              {catLabel(current.cat)} · {t('coachKnowledge.trainingsCount', { count: current.trainings.length })}
            </p>
          </div>
        </div>

        <section>
          <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1 mb-2">
            {t('coachKnowledge.links')} ({current.links.length})
          </h3>
          {current.links.length === 0 ? (
            <p className="text-[12px] font-bold text-gray-400 ml-1">{t('coachKnowledge.noLinks')}</p>
          ) : (
            <div className="space-y-2">
              {current.links.map(l => (
                <div key={l.url} className="bg-white border border-gray-100 rounded-2xl p-3 shadow-sm">
                  <a href={l.url} target="_blank" rel="noopener noreferrer" className="flex items-start gap-2 min-w-0">
                    <span className={`material-symbols-outlined text-[20px] shrink-0 ${isYouTube(l.url) ? 'text-red-500' : 'text-gray-400'}`}>
                      {isYouTube(l.url) ? 'smart_display' : 'language'}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[13px] font-black text-[#0a3a2a] leading-snug break-words">{l.title || hostOf(l.url)}</span>
                      <span className="block text-[10px] font-bold text-gray-400 break-all mt-0.5">{l.url}</span>
                    </span>
                  </a>
                  <p className="text-[10px] font-bold text-gray-400 mt-1.5 ml-7">
                    {t('coachKnowledge.usedTimes', { count: l.count })} · {t('coachKnowledge.lastUsed', { date: fmtDay(l.lastDay) })}
                  </p>
                  <div className="flex gap-2 mt-2 ml-7">
                    <button onClick={() => copy(l.url)}
                      className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-[11px] font-black active:scale-95 transition-all ${copied === l.url ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-[#0a3a2a]'}`}>
                      <span className="material-symbols-outlined text-[16px]">{copied === l.url ? 'check' : 'content_copy'}</span>
                      {copied === l.url ? t('coachKnowledge.copiedShort') : t('coachKnowledge.copy')}
                    </button>
                    {groups.length > 0 && (
                      <button onClick={() => startAdd(l)}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-[11px] font-black bg-[#0a3a2a] text-[#fed33e] active:scale-95 transition-all min-w-0">
                        <span className="material-symbols-outlined text-[16px]">add</span>
                        <span className="truncate">{t('coachKnowledge.addToNext')}</span>
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section>
          <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1 mb-2">{t('coachKnowledge.trainings')}</h3>
          {current.trainings.length === 0 && <p className="text-[12px] font-bold text-gray-400 ml-1">{t('coachKnowledge.noTrainings')}</p>}
          <ol className="relative pl-5 space-y-2 before:content-[''] before:absolute before:left-[7px] before:top-2 before:bottom-2 before:w-0.5 before:bg-gray-200">
            {current.trainings.map(tr => {
              const key = `${tr.groupId}_${tr.day}`;
              const open = !!expanded[key];
              const long = tr.desc.length > 90 || tr.desc.includes('\n');
              const planned = tr.day > today;
              return (
                <li key={key} className="relative bg-white border border-gray-100 rounded-2xl p-3 shadow-sm">
                  <span aria-hidden className={`absolute -left-[18px] top-4 w-2.5 h-2.5 rounded-full ring-2 ring-[#fcfdfe] ${planned ? 'bg-gray-300' : 'bg-rose-400'}`} />
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-black text-rose-500 tabular-nums">
                      {fmtDay(tr.day, true)}{planned && <span className="ml-1.5 text-gray-400">· {t('coachKnowledge.planned')}</span>}
                    </span>
                    <span className="text-[10px] font-bold text-gray-400 truncate">{tr.groupName}</span>
                  </div>
                  <p className="text-[13px] font-black text-[#0a3a2a] leading-snug mt-1 break-words">{tr.text}</p>
                  {tr.desc && (
                    <>
                      <p className={`text-[12px] font-medium text-gray-600 leading-snug mt-1 whitespace-pre-line break-words ${open ? '' : 'line-clamp-2'}`}>{tr.desc}</p>
                      {long && (
                        <button onClick={() => setExpanded(e => ({ ...e, [key]: !open }))} className="text-[11px] font-black text-rose-500 mt-1">
                          {open ? t('coachKnowledge.less') : t('coachKnowledge.more')}
                        </button>
                      )}
                    </>
                  )}
                  {tr.links.length > 0 && (
                    <p className="text-[10px] font-bold text-gray-400 mt-1.5 flex items-center gap-1">
                      <span className="material-symbols-outlined text-[14px]">link</span>{tr.links.length}
                    </p>
                  )}
                  {tr.students > 0 && <p className="text-[10px] font-bold text-gray-400 mt-1">{t('coachKnowledge.students', { count: tr.students })}</p>}
                </li>
              );
            })}
          </ol>
        </section>

        {pick && typeof document !== 'undefined' && createPortal(
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[500000] flex items-center justify-center p-4 animate-fade-in" onClick={() => setPick(null)}>
            <div className="bg-white rounded-[32px] p-6 w-full max-w-[360px] shadow-2xl" onClick={e => e.stopPropagation()}>
              <h2 className="text-lg font-black text-[#0a3a2a] leading-tight">{t('coachKnowledge.pickTitle')}</h2>
              <p className="text-[11px] font-bold text-gray-500 mt-1 break-words">{pick.title || hostOf(pick.url)}</p>
              <div className="space-y-2 mt-4">
                {targets.map(({ g, day, gt }) => {
                  const has = !!gt?.links?.includes(pick.url);
                  const full = !has && (gt?.links?.length ?? 0) >= TOPIC_LINKS_MAX;
                  return (
                    <button key={g.id} disabled={has || full} onClick={() => addTo(pick, g.id, day)}
                      className="w-full text-left bg-gray-50 border border-gray-100 rounded-2xl p-3 active:scale-[0.98] transition-all disabled:opacity-50">
                      <span className="block text-[13px] font-black text-[#0a3a2a] truncate">{g.icon ? `${g.icon} ` : ''}{g.name}</span>
                      <span className="block text-[11px] font-bold text-gray-500 mt-0.5">
                        {fmtDay(day, true)}{gt ? ` · ${gt.text}` : ''}
                      </span>
                      {(has || full) && <span className="block text-[10px] font-black text-rose-500 mt-0.5">{has ? t('coachKnowledge.alreadyIn') : t('coachKnowledge.linksFull')}</span>}
                    </button>
                  );
                })}
              </div>
              <button onClick={() => setPick(null)} className="w-full mt-4 py-3 bg-gray-100 text-gray-500 rounded-xl font-black text-[11px] uppercase tracking-widest active:scale-95">
                {t('common.cancel')}
              </button>
            </div>
          </div>,
          document.body,
        )}
      </div>
    );
  }

  // ─── Lista tematów ─────────────────────────────────────────────
  const row = (k: KnowledgeTopic) => (
    <button key={k.topic || '_none'} onClick={() => setOpenTopic(k.topic)}
      className="w-full flex items-center gap-3 bg-white border border-gray-100 rounded-2xl px-4 py-3 shadow-sm text-left active:scale-[0.98] transition-all">
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-black leading-snug break-words text-[#0a3a2a]">{label(k.topic)}</span>
        <span className="block text-[10px] font-bold text-gray-400 mt-0.5">{t('coachKnowledge.lastTraining', { date: fmtDay(k.lastDay) })}</span>
      </span>
      {k.links.length > 0 && (
        <span className="flex items-center gap-0.5 text-[11px] font-black text-rose-500 bg-rose-50 rounded-full px-2 py-0.5 shrink-0 tabular-nums">
          <span className="material-symbols-outlined text-[14px]">link</span>{k.links.length}
        </span>
      )}
      <span className="text-[11px] font-black text-[#0a3a2a] bg-gray-100 rounded-full px-2 py-0.5 shrink-0 tabular-nums">{k.trainings.length}×</span>
      <span className="material-symbols-outlined text-gray-300 text-[20px] shrink-0">chevron_right</span>
    </button>
  );

  return (
    <div className="space-y-3">
      <p className="text-[11px] font-bold text-gray-400 ml-1">
        {t('coachKnowledge.topicsCount', { count: kb.length })} · {t('coachKnowledge.linksCount', { count: linkCount })}
      </p>
      <label className="flex items-center gap-2 bg-white border border-gray-200 rounded-2xl px-3 py-2.5 focus-within:border-[#0a3a2a]">
        <span className="material-symbols-outlined text-gray-400 text-[20px]">search</span>
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder={t('coachKnowledge.search')}
          className="flex-1 min-w-0 bg-transparent outline-none text-[13px] font-bold text-[#333]" />
        {query && (
          <button onClick={() => setQuery('')} aria-label={t('coachKnowledge.clear')} className="text-gray-400">
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        )}
      </label>
      <div className="flex gap-1.5 overflow-x-auto hide-scrollbar -mx-5 px-5">
        {['all', ...cats].map(c => (
          <button key={c} onClick={() => setCat(cat === c && c !== 'all' ? 'all' : c)} aria-pressed={cat === c}
            className={`shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-full text-[11px] font-black border transition-all ${cat === c ? 'bg-[#0a3a2a] text-[#fed33e] border-[#0a3a2a]' : 'bg-white text-gray-500 border-gray-200'}`}>
            {c === 'all' ? t('coachKnowledge.all') : catLabel(c)}
            {c !== 'all' && c !== NO_TOPIC_CAT && (
              <span className="material-symbols-outlined text-[16px] -mr-1">{cat === c ? 'expand_less' : 'expand_more'}</span>
            )}
          </button>
        ))}
      </div>
      {cat !== 'all' && cat !== NO_TOPIC_CAT && (
        <div className="flex flex-wrap gap-1.5 bg-gray-50 border border-gray-100 rounded-2xl p-2.5 animate-fade-in">
          {subtopicsOf(cat).map(id => {
            const k = kbOf(id);
            return (
              <button key={id} onClick={() => setOpenTopic(id)}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-[12px] font-black border active:scale-95 transition-all ${k ? 'bg-white text-[#0a3a2a] border-gray-200 shadow-sm' : 'bg-transparent text-gray-400 border-dashed border-gray-300'}`}>
                {label(id)}
                {k && <span className="text-[10px] font-black text-rose-500 tabular-nums">{k.trainings.length}×</span>}
              </button>
            );
          })}
        </div>
      )}
      {filtered.length === 0 ? (
        <p className="text-center text-[12px] font-bold text-gray-400 py-8">{t('coachKnowledge.nothingFound')}</p>
      ) : (
        [...CAT_ORDER, NO_TOPIC_CAT].map(c => {
          const list = filtered.filter(k => k.cat === c);
          if (!list.length) return null;
          return (
            <section key={c} className="space-y-2">
              <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1 pt-2">{catLabel(c)}</h3>
              {list.map(row)}
            </section>
          );
        })
      )}
    </div>
  );
}
