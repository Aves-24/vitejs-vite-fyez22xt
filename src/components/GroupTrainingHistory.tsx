import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import TopicLinks from './TopicLinks';
import { focusTitle } from './tagebuch/FocusCard';
import { CARD_PAD, CARD_SHAPE, EntryRow, TopicChips } from './tagebuch/TagebuchCards';
import { dayKeyOf } from '../utils/focus';
import { GroupSectionHeader, loadTopicStatus, TopicMemberList, type GroupTopic, type GroupTopicsByDay, type MemberStatus } from './GroupTopicPanel';

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

export default function GroupTrainingHistory({ groupId, coachId, members, topics, legacyNotes, onLegacyMigrated, onOpenStudent, onRepeat, onEdit }: {
  groupId: string;
  coachId: string;
  members: any[];
  topics: GroupTopicsByDay;
  legacyNotes: LooseNote[];
  onLegacyMigrated: () => void;
  onOpenStudent?: (studentId: string) => void;
  /** „Powtórz na dziś” przy wpisie (user 2026-10-22); null = dziś już jest temat. */
  onRepeat?: ((gt: GroupTopic) => void) | null;
  /** Edycja minionego tematu — to samo okno co przy zaplanowanych (user 2026-10-22). */
  onEdit?: (gt: GroupTopic) => void;
}) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<HistoryDoc | null>(null);
  const [shown, setShown] = useState(PAGE);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [status, setStatus] = useState<Record<string, Record<string, MemberStatus>>>({});
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  // Powtórka czeka na potwierdzenie (user 2026-10-22).
  const [repeatAsk, setRepeatAsk] = useState<GroupTopic | null>(null);
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
    // Bez różowej ramki i paska (user 2026-10-23): nagłówek sekcji + karty jak
    // „Training geleitet” w dzienniku. Edycja i „Powtórz” w rozwiniętej karcie,
    // z podpisem — w zwiniętej zostaje tylko to, co trzeba przeczytać.
    <section>
      <GroupSectionHeader
        icon="history"
        label={t('coachDashboard.historyTitle')}
        count={items.length}
        open={open}
        onToggle={() => setOpen(o => !o)}
      />
      {open && (
      <div className="space-y-2">
        <p className="flex items-center gap-1 text-[11px] font-bold text-gray-500 pl-1">
          <span className="material-symbols-outlined text-rose-500 text-[14px]">lock</span>{t('coachDashboard.historyPrivate')}
        </p>
        {items.slice(0, shown).map(it => {
          if (it.loose) {
            // Stary dziennik grupy — szary pasek, bo to nie trening z tematem.
            return (
              <div key={it.key} className={`${CARD_SHAPE} tb-skipped ${CARD_PAD}`}>
                <EntryRow
                  icon="edit_note"
                  iconCls="text-gray-500"
                  kind={t('coachDashboard.journalTitle')}
                  kindCls="text-gray-500"
                  time={new Date(it.ts).toLocaleDateString(i18n.language, { day: 'numeric', month: 'short', year: 'numeric' })}
                  extra={(
                    <button onClick={() => deleteLoose(it.loose!.id)} aria-label={t('coachDashboard.groupTopicDelete')} title={t('coachDashboard.groupTopicDelete')} className="order-last w-10 h-10 -mt-2 -mr-2 shrink-0 rounded-xl text-gray-400 hover:text-red-500 flex items-center justify-center active:scale-90 transition-all">
                      <span className="material-symbols-outlined text-[18px]">close</span>
                    </button>
                  )}
                >
                  <p className="text-[12px] font-medium text-[#333] leading-relaxed whitespace-pre-wrap break-words mt-0.5">{it.loose.text}</p>
                </EntryRow>
              </div>
            );
          }
          const day = it.day!;
          const gt = topics[day];
          const note = data?.notes?.[day];
          const isOpen = expanded === day;
          return (
            <div key={it.key} className={`${CARD_SHAPE} tb-led ${CARD_PAD}`}>
              <div role="button" tabIndex={0} aria-expanded={isOpen} onClick={() => toggle(day)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(day); } }} className="cursor-pointer">
                <EntryRow icon="sports" iconCls="text-rose-600" kind={t('tagebuch.ledTraining')} kindCls="text-rose-700" title={focusTitle(gt, t)} time={dayLabel(day)}>
                  <div className="flex items-end gap-2">
                    <div className="flex-1 min-w-0">
                      {gt.text && gt.topic && <TopicChips topics={[gt.topic]} />}
                      {note && !isOpen && (
                        <p className="mt-1.5 flex items-start gap-1 text-[11px] font-medium text-gray-600 leading-relaxed">
                          <span className="material-symbols-outlined text-[13px] text-rose-400 mt-0.5">lock</span>
                          <span className="line-clamp-2 break-words">„{note}”</span>
                        </p>
                      )}
                    </div>
                    <span className={`material-symbols-outlined text-[20px] text-gray-400 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`}>expand_more</span>
                  </div>
                </EntryRow>
              </div>
              {isOpen && (
                <div className="mt-2.5 pt-2.5 border-t border-gray-100 pl-1 space-y-2.5">
                  {gt.desc && <p className="text-[12px] font-medium text-[#333] leading-snug whitespace-pre-wrap break-words">{gt.desc}</p>}
                  <TopicLinks links={gt.links} titles={gt.linkTitles} tone="coach" />
                  <TopicMemberList members={members} gt={gt} status={status[day] || {}} onOpenStudent={onOpenStudent} />
                  <div>
                    <p className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-gray-500 mb-1">
                      <span className="material-symbols-outlined text-rose-500 text-[14px]">lock</span>{t('coachDashboard.historyNoteLabel')}
                    </p>
                    <textarea
                      value={draft}
                      onChange={e => setDraft(e.target.value.slice(0, NOTE_MAX))}
                      maxLength={NOTE_MAX}
                      placeholder={t('coachDashboard.historyNotePlaceholder')}
                      className="w-full bg-white border border-gray-200 rounded-xl p-2.5 text-[12px] font-medium text-[#333] outline-none focus:border-rose-500 resize-none h-20"
                    />
                    {draft.trim() !== (note || '') && (
                      <button
                        onClick={() => saveNote(day)}
                        disabled={saving}
                        className="mt-1.5 w-full min-h-[40px] rounded-xl text-[11px] font-black uppercase tracking-widest bg-rose-600 text-white disabled:opacity-40 active:scale-95 transition-all"
                      >
                        {t('coachDashboard.historyNoteSave')}
                      </button>
                    )}
                  </div>
                  {(onEdit || onRepeat) && (
                    <div className="flex gap-2">
                      {onEdit && (
                        <button
                          type="button"
                          onClick={() => onEdit(gt)}
                          className="flex-1 min-w-0 min-h-[40px] px-2 rounded-xl bg-white border border-gray-200 text-[#0a3a2a] flex items-center justify-center gap-1 text-[10px] font-black uppercase tracking-wide active:scale-95 transition-all"
                        >
                          <span className="material-symbols-outlined text-rose-600 text-[18px] shrink-0">edit</span>
                          <span className="truncate">{t('coachDashboard.groupTopicEdit')}</span>
                        </button>
                      )}
                      {onRepeat && (
                        <button
                          type="button"
                          onClick={() => setRepeatAsk(gt)}
                          className="flex-1 min-w-0 min-h-[40px] px-2 rounded-xl bg-white border border-gray-200 text-[#0a3a2a] flex items-center justify-center gap-1 text-[10px] font-black uppercase tracking-wide active:scale-95 transition-all"
                        >
                          <span className="material-symbols-outlined text-rose-600 text-[18px] shrink-0">replay</span>
                          <span className="truncate">{t('coachDashboard.groupTopicRepeat')}</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {items.length > shown && (
          <button onClick={() => setShown(n => n + PAGE)} className="w-full min-h-[40px] text-[11px] font-black uppercase tracking-widest text-[#0a3a2a] active:opacity-60">
            {t('coachDashboard.historyMore')}
          </button>
        )}
      </div>
      )}

      {repeatAsk && onRepeat && createPortal(
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[500000] flex items-center justify-center p-6 animate-fade-in" onClick={() => setRepeatAsk(null)}>
          <div className="bg-white rounded-[28px] p-5 w-full max-w-[340px] shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-rose-500 flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-white text-[20px]">replay</span>
              </div>
              <p className="text-[14px] font-black text-[#0a3a2a] leading-tight">{t('coachDashboard.groupTopicRepeatConfirm')}</p>
            </div>
            <p className="text-[12px] font-black text-[#0a3a2a] leading-snug break-words bg-gray-50 border border-gray-200 rounded-xl px-3 py-2">{focusTitle(repeatAsk, t)}</p>
            <div className="flex gap-2 mt-4">
              <button onClick={() => setRepeatAsk(null)} className="flex-1 py-3 bg-gray-100 text-gray-500 rounded-xl font-black text-[10px] uppercase tracking-widest active:scale-95">
                {t('coachDashboard.cancel')}
              </button>
              <button
                onClick={() => { onRepeat(repeatAsk); setRepeatAsk(null); }}
                className="flex-[2] py-3 bg-rose-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest active:scale-95 shadow-md"
              >
                {t('coachDashboard.groupTopicRepeat')}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </section>
  );
}
