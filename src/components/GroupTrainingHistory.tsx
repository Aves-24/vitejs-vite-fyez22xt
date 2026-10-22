import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import CollapsibleSection from './CollapsibleSection';
import TopicLinks from './TopicLinks';
import { focusTitle } from './tagebuch/FocusCard';
import { topicLabel } from '../constants/trainingTopics';
import { dayKeyOf } from '../utils/focus';
import { loadTopicStatus, TopicMemberList, type GroupTopicsByDay, type MemberStatus } from './GroupTopicPanel';

// [HISTORIA TRENINGÓW] (user 2026-10-15) Zastępuje „Dziennik grupy”: minione
// tematy treningu grupy od najnowszego — kto trenował pod temat, kto
// przeczytał — i prywatna notatka trenera do każdego treningu („jak poszło”).
// Notatki leżą w users/{coachId}/private/groupTraining_<groupId> — tylko trener
// (dokument users/{coachId} czytają też jego uczniowie, więc nie tam).
// Stare wpisy dziennika grupy (users.groupNotes) przenosimy tu jako `loose`.

const NOTE_MAX = 500;
const PAGE = 5;

interface LooseNote { id: string; text: string; timestamp: number }
interface HistoryDoc { notes?: Record<string, string>; loose?: LooseNote[] }

export default function GroupTrainingHistory({ groupId, coachId, members, topics, legacyNotes, onLegacyMigrated, onOpenStudent }: {
  groupId: string;
  coachId: string;
  members: any[];
  topics: GroupTopicsByDay;
  legacyNotes: LooseNote[];
  onLegacyMigrated: () => void;
  onOpenStudent?: (studentId: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<HistoryDoc | null>(null);
  const [shown, setShown] = useState(PAGE);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [status, setStatus] = useState<Record<string, Record<string, MemberStatus>>>({});
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const ref = doc(db, 'users', coachId, 'private', `groupTraining_${groupId}`);

  useEffect(() => {
    let cancelled = false;
    getDoc(ref)
      .then(snap => { if (!cancelled) setData((snap.exists() ? snap.data() : {}) as HistoryDoc); })
      .catch(e => { console.error('Historia treningów: błąd odczytu', e); if (!cancelled) setData({}); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId, coachId]);

  // Stary dziennik grupy → tutaj (raz). Dopiero po zapisie znika z profilu trenera.
  useEffect(() => {
    if (!data || legacyNotes.length === 0) return;
    const known = new Set((data.loose || []).map(n => n.id));
    const loose = [...(data.loose || []), ...legacyNotes.filter(n => !known.has(n.id))];
    setDoc(ref, { loose }, { merge: true })
      .then(() => { setData(d => ({ ...d, loose })); onLegacyMigrated(); })
      .catch(e => console.error('Historia treningów: błąd przenoszenia dziennika', e));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data === null, legacyNotes]);

  const today = dayKeyOf(Date.now());
  const items = useMemo(() => {
    const list: { key: string; ts: number; day?: string; loose?: LooseNote }[] = [];
    // Minione dni i dzisiejszy, jeśli trener już zakończył trening.
    Object.keys(topics)
      .filter(d => d < today || (d === today && !!topics[d].closedAt))
      .forEach(d => list.push({ key: d, ts: d === today ? topics[d].closedAt! : new Date(`${d}T12:00:00`).getTime(), day: d }));
    (data?.loose || legacyNotes).forEach(n => list.push({ key: n.id, ts: n.timestamp, loose: n }));
    return list.sort((a, b) => b.ts - a.ts);
  }, [topics, data, legacyNotes, today]);

  const toggle = (day: string) => {
    if (expanded === day) { setExpanded(null); return; }
    setExpanded(day);
    setDraft(data?.notes?.[day] || '');
    if (!status[day]) loadTopicStatus(topics[day]).then(st => setStatus(prev => ({ ...prev, [day]: st })));
  };

  const saveNote = async (day: string) => {
    setSaving(true);
    try {
      const text = draft.trim().slice(0, NOTE_MAX);
      await setDoc(ref, { notes: { [day]: text } }, { merge: true });
      setData(d => ({ ...d, notes: { ...(d?.notes || {}), [day]: text } }));
      setExpanded(null);
    } catch (e) {
      console.error('Historia treningów: błąd zapisu notatki', e);
    }
    setSaving(false);
  };

  const deleteLoose = async (id: string) => {
    const loose = (data?.loose || []).filter(n => n.id !== id);
    try {
      await setDoc(ref, { loose }, { merge: true });
      setData(d => ({ ...d, loose }));
    } catch (e) { console.error('Historia treningów: błąd usuwania', e); }
  };

  if (items.length === 0) return null;
  const dayLabel = (day: string) => new Date(`${day}T12:00:00`).toLocaleDateString(i18n.language, { weekday: 'short', day: 'numeric', month: 'short' });

  return (
    <CollapsibleSection
      label={t('coachDashboard.historyTitle')}
      open={open}
      onToggle={() => setOpen(o => !o)}
      summary={t('coachDashboard.historyCount', { count: items.length })}
      className="bg-white border-2 border-rose-200 rounded-xl overflow-hidden"
      headerClassName="bg-rose-200"
      flush
      labelClassName="text-rose-800"
    >
      <div className="space-y-1.5">
        <p className="flex items-center gap-1 text-[9px] font-bold text-[#0a3a2a] ml-1">
          <span className="material-symbols-outlined text-rose-500 text-[11px]">lock</span>{t('coachDashboard.historyPrivate')}
        </p>
        {items.slice(0, shown).map(it => {
          if (it.loose) {
            return (
              <div key={it.key} className="bg-white border border-gray-100 rounded-xl pl-3 pr-1.5 py-2 flex items-start gap-2">
                <span className="material-symbols-outlined text-[16px] text-gray-400 mt-px">edit_note</span>
                <div className="flex-1 min-w-0">
                  <p className="text-[9px] font-black text-gray-400">{new Date(it.ts).toLocaleDateString(i18n.language, { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                  <p className="text-[11px] font-medium text-[#333] leading-relaxed whitespace-pre-wrap break-words">{it.loose.text}</p>
                </div>
                <button onClick={() => deleteLoose(it.loose!.id)} aria-label={t('coachDashboard.groupTopicDelete')} className="w-7 h-7 shrink-0 text-gray-300 hover:text-red-500 flex items-center justify-center">
                  <span className="material-symbols-outlined text-[16px]">close</span>
                </button>
              </div>
            );
          }
          const day = it.day!;
          const gt = topics[day];
          const note = data?.notes?.[day];
          const isOpen = expanded === day;
          return (
            <div key={it.key} className={`bg-white border rounded-xl ${isOpen ? 'border-rose-300' : 'border-rose-100'}`}>
              <button onClick={() => toggle(day)} className="w-full flex items-start gap-2 pl-3 pr-2 py-2 text-left active:opacity-70">
                <span className="material-symbols-outlined text-[16px] text-rose-500 mt-px">sports</span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[9px] font-black text-[#0a3a2a]">{dayLabel(day)}</span>
                  <span className="block text-[12px] font-black text-[#0a3a2a] leading-snug break-words">{focusTitle(gt, t)}</span>
                  {gt.text && gt.topic && <span className="block text-[10px] font-bold text-[#0a3a2a]">{topicLabel(gt.topic, t)}</span>}
                  {note && !isOpen && <span className="block text-[10px] font-medium text-gray-500 truncate mt-0.5">„{note}”</span>}
                </span>
                {note && !isOpen && <span className="material-symbols-outlined text-[15px] text-gray-400 mt-px">edit_note</span>}
                <span className={`material-symbols-outlined text-[18px] text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}>expand_more</span>
              </button>
              {isOpen && (
                <div className="px-3 pb-2.5 space-y-2 border-t border-rose-100 pt-2">
                  <TopicLinks links={gt.links} tone="coach" small />
                  <TopicMemberList members={members} gt={gt} status={status[day] || {}} onOpenStudent={onOpenStudent} />
                  <textarea
                    value={draft}
                    onChange={e => setDraft(e.target.value.slice(0, NOTE_MAX))}
                    maxLength={NOTE_MAX}
                    placeholder={t('coachDashboard.historyNotePlaceholder')}
                    className="w-full bg-white border border-gray-200 rounded-lg p-2 text-[11px] font-medium text-[#333] outline-none focus:border-rose-500 resize-none h-16"
                  />
                  <button
                    onClick={() => saveNote(day)}
                    disabled={saving || draft.trim() === (note || '')}
                    className="w-full py-2 rounded-lg text-[9px] font-black uppercase tracking-widest bg-rose-600 text-white disabled:opacity-40 active:scale-95 transition-all"
                  >
                    {t('coachDashboard.groupTopicSaveEdit')}
                  </button>
                </div>
              )}
            </div>
          );
        })}
        {items.length > shown && (
          <button onClick={() => setShown(n => n + PAGE)} className="w-full py-1.5 text-[9px] font-black uppercase tracking-widest text-[#0a3a2a]">
            {t('coachDashboard.historyMore')}
          </button>
        )}
      </div>
    </CollapsibleSection>
  );
}
