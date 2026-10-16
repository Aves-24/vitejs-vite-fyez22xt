import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { addDoc, collection, deleteDoc, deleteField, doc, getDoc, getDocs, query, serverTimestamp, Timestamp, updateDoc, where } from 'firebase/firestore';
import { db } from '../firebase';
import TopicPicker from './TopicPicker';
import { focusTitle } from './tagebuch/FocusCard';
import { topicLabel } from '../constants/trainingTopics';
import { FOCUS_TEXT_MAX, TOPIC_LINKS_MAX, dayKeyOf, normalizeTopicLink, sessionTopicId } from '../utils/focus';

// [TEMAT TRENINGU] (user 2026-10-15) Trener ustawia grupie temat treningu na
// dziś albo planuje go na kolejne dni. Technicznie: wpis 'topic' w coachLog
// każdego członka (utils/focus.ts, sekcja TEMAT TRENINGU) — uczeń widzi go
// dopiero w jego dniu. Na dokumencie trenera coachGroupTopics.<groupId>.<day>
// zostają tematy grupy z id wpisów — stąd status uczniów, edycja i „Powtórz”
// (kopia na dziś). Różowy = rola trenera; fiolet zostaje dla ucznia (user 2026-10-15). Zastąpił „fokus grupy”.
// Każdy temat ma też termin w kalendarzu TRENERA (user 2026-10-15: wgląd
// w plan) — bez kopii u uczniów, bo ci widzą temat dopiero w jego dniu.

export interface GroupTopic {
  text: string;
  topic: string;
  day: string;          // YYYY-MM-DD
  setAt: number;
  /** studentId → id wpisu 'topic' w users/{studentId}/coachLog */
  entryIds: Record<string, string>;
  closedAt?: number;
  /** Termin „Trener” w kalendarzu trenera (users/{coachId}/tournaments) — wgląd w plan. */
  calendarEventId?: string;
  /** Do 3 linków (YouTube, strona) — uczeń otwiera je po potwierdzeniu. */
  links?: string[];
}

type TopicBase = { text: string; topic: string; links: string[] };

export type GroupTopicsByDay = Record<string, GroupTopic>;

export type MemberStatus = 'trained' | 'acked' | 'none';

/** Status uczniów przy temacie: trening pod temat (sesja z trainingTopic.id) albo „Zapoznałem się”. */
export async function loadTopicStatus(gt: GroupTopic): Promise<Record<string, MemberStatus>> {
  const from = new Date(`${gt.day}T00:00:00`).getTime();
  const list = await Promise.all(Object.entries(gt.entryIds).map(async ([sid, eid]) => {
    try {
      const sSnap = await getDocs(query(collection(db, `users/${sid}/sessions`), where('timestamp', '>=', Timestamp.fromMillis(from))));
      if (sSnap.docs.some(d => sessionTopicId(d.data()) === eid)) return [sid, 'trained'] as const;
      const e = await getDoc(doc(db, `users/${sid}/coachLog`, eid));
      return [sid, e.exists() && e.data().ackAt ? 'acked' : 'none'] as const;
    } catch {
      return [sid, 'none'] as const;
    }
  }));
  return Object.fromEntries(list);
}

/** Lista uczniów ze statusem przy temacie (panel tematu i historia treningów). */
export function TopicMemberList({ members, gt, status, onAssign, saving }: {
  members: any[];
  gt: GroupTopic;
  status: Record<string, MemberStatus>;
  onAssign?: (s: any) => void;   // tylko otwarty temat: dopisz ucznia, który doszedł później
  saving?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className="space-y-1">
      {members.map(s => {
        const name = `${s.firstName || t('coachDashboard.defaultStudentName')} ${s.lastName || ''}`.trim();
        const st = status[s.id];
        return (
          <div key={s.id} className="flex items-center gap-2 min-h-[22px]">
            <span className="flex-1 min-w-0 text-[11px] font-bold text-[#0a3a2a] truncate">{name}</span>
            {!gt.entryIds[s.id] ? (
              onAssign ? (
                <button
                  type="button"
                  onClick={() => onAssign(s)}
                  disabled={saving}
                  className="text-[9px] font-black uppercase tracking-wide text-[#0a3a2a] bg-white border border-rose-200 rounded-md px-2 py-0.5 active:scale-95 transition-all disabled:opacity-40"
                >
                  {t('coachDashboard.groupFocusAssign')}
                </button>
              ) : <span className="text-[9px] font-bold text-gray-300">—</span>
            ) : st === 'trained' ? (
              <span className="flex items-center gap-0.5 text-[9px] font-black text-emerald-700">
                <span className="material-symbols-outlined text-[13px]">check</span>{t('coachDashboard.groupTopicTrained')}
              </span>
            ) : st === 'acked' ? (
              <span className="flex items-center gap-0.5 text-[9px] font-black text-[#0a3a2a]">
                <span className="material-symbols-outlined text-rose-500 text-[13px]">visibility</span>{t('coachDashboard.groupTopicAcked')}
              </span>
            ) : (
              <span className="text-[9px] font-bold text-gray-400">{st ? '—' : '…'}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function GroupTopicPanel({ groupId, groupName, members, coachId, topics: byDay, onChanged, showToast }: {
  groupId: string;
  groupName: string;
  members: any[];
  coachId: string;
  topics: GroupTopicsByDay;
  onChanged: (next: GroupTopicsByDay) => void;
  showToast: (msg: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const [modal, setModal] = useState<{ day: string; edit: boolean } | null>(null);
  const [text, setText] = useState('');
  const [pickedTopics, setPickedTopics] = useState<string[]>([]);
  const [linkInputs, setLinkInputs] = useState<string[]>(['', '', '']);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<Record<string, MemberStatus>>({});

  const today = dayKeyOf(Date.now());
  const days = useMemo(() => Object.keys(byDay).sort(), [byDay]);
  const todayTopic = byDay[today];
  const upcoming = days.filter(d => d > today);
  const lastDay = [...days].reverse().find(d => d < today);
  const last = lastDay ? byDay[lastDay] : undefined;
  // Karta główna: tylko dzisiejszy temat — minione są w historii treningów.
  // Zakończony dziś trening od razu idzie do historii treningów.
  const shown = todayTopic && !todayTopic.closedAt ? todayTopic : undefined;
  const open = !!todayTopic && !todayTopic.closedAt;

  // Status uczniów: trening pod temat (sesja z trainingTopic.id) albo „Zapoznałem się”.
  useEffect(() => {
    if (!shown) { setStatus({}); return; }
    let cancelled = false;
    loadTopicStatus(shown).then(st => { if (!cancelled) setStatus(st); });
    return () => { cancelled = true; };
  }, [shown]);

  const coachName = async () => {
    const cached = localStorage.getItem(`grotX_userName_${coachId}`);
    if (cached) return cached;
    const d = (await getDoc(doc(db, 'users', coachId))).data() || {};
    return `${d.firstName || ''} ${d.lastName || ''}`.trim() || t('coachLog.defaultCoachName', { defaultValue: 'Trainer' });
  };

  const save = async (day: string, next: GroupTopic | null) => {
    const copy = { ...byDay };
    if (next) copy[day] = next; else delete copy[day];
    await updateDoc(doc(db, 'users', coachId), { [`coachGroupTopics.${groupId}.${day}`]: next ?? deleteField() });
    onChanged(copy);
  };

  // Wpis u każdego ucznia osobno — błąd u jednego nie blokuje reszty.
  const assignTo = async (list: any[], topic: { text: string; topic: string; day: string; links?: string[] }) => {
    const authorName = await coachName();
    const results = await Promise.all(list.map(async s => {
      try {
        const ref = await addDoc(collection(db, `users/${s.id}/coachLog`), {
          authorId: coachId,
          authorName,
          text: topic.text,
          type: 'topic',
          topics: topic.topic ? [topic.topic] : [],
          day: topic.day,
          groupId,
          ...(topic.links?.length ? { links: topic.links } : {}),
          createdAt: serverTimestamp(),
        });
        return [s.id, ref.id] as const;
      } catch (e) {
        console.error('Temat treningu: błąd zapisu u ucznia', s.id, e);
        return null;
      }
    }));
    const ok = results.filter(Boolean) as (readonly [string, string])[];
    if (ok.length < list.length) showToast(t('coachDashboard.groupFocusPartialError', { count: list.length - ok.length }));
    return Object.fromEntries(ok) as Record<string, string>;
  };

  const forEntries = (gt: GroupTopic, fn: (sid: string, eid: string) => Promise<unknown>) =>
    Promise.all(Object.entries(gt.entryIds).map(async ([sid, eid]) => {
      try { await fn(sid, eid); } catch (e) { console.error('Temat treningu: błąd u ucznia', sid, e); }
    }));

  // Kalendarz trenera — błąd tu nie blokuje tematu (temat jest ważniejszy).
  const calendarFields = (base: { text: string; topic: string }) => ({
    title: `${groupName}: ${base.text}`.slice(0, 200),
    topics: base.topic ? [base.topic] : [],
  });
  const addToCalendar = async (day: string, base: { text: string; topic: string }) => {
    try {
      const ref = await addDoc(collection(db, 'users', coachId, 'tournaments'), {
        ...calendarFields(base),
        category: 'Trener', type: 'Trener', date: day, time: '', address: '', note: '',
        distance: null, todo: false, coachStudents: [], trainingTopicGroupId: groupId,
      });
      localStorage.removeItem(`grotX_tournaments_${coachId}`);
      return { calendarEventId: ref.id };
    } catch (e) {
      console.error('Temat treningu: błąd zapisu w kalendarzu', e);
      return {};
    }
  };
  const syncCalendar = async (gt: GroupTopic, base: { text: string; topic: string } | null) => {
    if (!gt.calendarEventId) return;
    try {
      const ref = doc(db, 'users', coachId, 'tournaments', gt.calendarEventId);
      await (base ? updateDoc(ref, calendarFields(base)) : deleteDoc(ref));
      localStorage.removeItem(`grotX_tournaments_${coachId}`);
    } catch (e) { console.error('Temat treningu: błąd kalendarza', e); }
  };

  const run = async (fn: () => Promise<void>) => {
    setSaving(true);
    try { await fn(); } catch (e) {
      console.error('Temat treningu: błąd zapisu', e);
      showToast(t('coachDashboard.toastGroupError'));
    }
    setSaving(false);
  };

  const create = (day: string, base: TopicBase) => run(async () => {
    if (!base.text || members.length === 0) return;
    const entryIds = await assignTo(members, { ...base, day });
    const cal = await addToCalendar(day, base);
    const { links, ...rest } = base;
    await save(day, { ...rest, ...(links.length ? { links } : {}), day, setAt: Date.now(), entryIds, ...cal });
    setModal(null);
  });

  // Edycja: ten sam wpis u uczniów (data startu i id zostają — status się nie gubi).
  const edit = (gt: GroupTopic, base: TopicBase) => run(async () => {
    if (!base.text) return;
    await forEntries(gt, (sid, eid) => updateDoc(doc(db, `users/${sid}/coachLog`, eid), {
      text: base.text, topics: base.topic ? [base.topic] : [], links: base.links, editedAt: Date.now(),
    }));
    await syncCalendar(gt, base);
    const { links, ...rest } = base;
    const next: GroupTopic = { ...gt, ...rest };
    if (links.length) next.links = links; else delete next.links;
    await save(gt.day, next);
    setModal(null);
  });

  const close = (gt: GroupTopic) => run(async () => {
    const closedAt = Date.now();
    await forEntries(gt, (sid, eid) => updateDoc(doc(db, `users/${sid}/coachLog`, eid), { closedAt }));
    await save(gt.day, { ...gt, closedAt });
  });

  // Zaplanowany temat można jeszcze odwołać — wpisy znikają też u uczniów.
  const remove = (gt: GroupTopic) => run(async () => {
    await forEntries(gt, (sid, eid) => deleteDoc(doc(db, `users/${sid}/coachLog`, eid)));
    await syncCalendar(gt, null);
    await save(gt.day, null);
  });

  // Uczeń dołączył do grupy po ustawieniu tematu.
  const assignOne = (gt: GroupTopic, s: any) => run(async () => {
    const ids = await assignTo([s], gt);
    if (ids[s.id]) await save(gt.day, { ...gt, entryIds: { ...gt.entryIds, ...ids } });
  });

  const openModal = (day: string, gt?: GroupTopic) => {
    setText(gt?.text ?? '');
    setPickedTopics(gt?.topic ? [gt.topic] : []);
    setLinkInputs([0, 1, 2].map(i => gt?.links?.[i] ?? ''));
    setModal({ day, edit: !!gt });
  };

  const dayLabel = (day: string) => new Date(`${day}T12:00:00`).toLocaleDateString(i18n.language, { weekday: 'short', day: 'numeric', month: 'short' });
  const sectionLabel = 'text-[9px] font-black uppercase tracking-widest text-rose-500 mb-1.5 ml-1';
  const btn = 'flex-1 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest border active:scale-95 transition-all disabled:opacity-40';
  // Puste pole = brak linku; wpisane, ale złe = blokada zapisu z komunikatem.
  const linkChecks = linkInputs.map(v => (v.trim() ? normalizeTopicLink(v) : ''));
  const linksInvalid = linkChecks.some(v => v === null);
  const modalBase: TopicBase = {
    text: text.trim().slice(0, FOCUS_TEXT_MAX),
    topic: pickedTopics[0] || '',
    links: [...new Set(linkChecks.filter((v): v is string => !!v))].slice(0, TOPIC_LINKS_MAX),
  };

  return (
    <div className="space-y-2">
      {/* Odcienie różu od jasnego (temat) do ciemnego (lista grupy) — user 2026-10-16. */}
      <div className="space-y-2 bg-rose-50 border border-rose-100 rounded-xl p-2.5">
      <p className={sectionLabel}>{t('coachDashboard.groupTopicLabel')}</p>

      {todayTopic?.closedAt && (
        <p className="flex items-center gap-1 text-[10px] font-bold text-[#0a3a2a] ml-1">
          <span className="material-symbols-outlined text-rose-500 text-[14px]">check_circle</span>
          {t('coachDashboard.groupTopicClosedToday')}
        </p>
      )}

      {!todayTopic && (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => openModal(today)}
            disabled={members.length === 0 || saving}
            className="flex-1 py-2.5 rounded-xl border-2 border-dashed border-rose-300 bg-white text-[#0a3a2a] text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-1 active:scale-[0.98] transition-all disabled:opacity-40"
          >
            <span className="material-symbols-outlined text-rose-500 text-[16px]">sports</span>
            {t('coachDashboard.groupTopicSet')}
          </button>
          {last && (
            <button
              type="button"
              onClick={() => create(today, { text: last.text, topic: last.topic, links: last.links ?? [] })}
              disabled={members.length === 0 || saving}
              className="flex-1 py-2.5 rounded-xl bg-rose-500 text-white text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-1 active:scale-[0.98] transition-all disabled:opacity-40"
            >
              <span className="material-symbols-outlined text-[16px]">replay</span>
              {t('coachDashboard.groupTopicRepeat')}
            </button>
          )}
        </div>
      )}

      {/* Przypomnienie, co „Powtórz” skopiuje — bez wchodzenia w historię. */}
      {!todayTopic && last && (
        <p className="text-[10px] font-bold text-[#0a3a2a] leading-snug ml-1 line-clamp-2 break-words">
          <span className="text-[9px] font-black uppercase tracking-wide text-rose-500">{t('coachDashboard.groupTopicLast', { date: dayLabel(last.day) })}: </span>
          {focusTitle(last, t)}
        </p>
      )}

      {shown && (
        <div className={`rounded-xl px-3 py-2.5 border ${open ? 'bg-white border-rose-200' : 'bg-white border-gray-200'}`}>
          <div className="flex items-start gap-2">
            <span className={`material-symbols-outlined text-[18px] shrink-0 mt-px ${open ? 'text-rose-600' : 'text-gray-400'}`}>sports</span>
            <div className="flex-1 min-w-0">
              <p className={`text-[9px] font-black uppercase tracking-widest ${open ? 'text-rose-700' : 'text-gray-500'}`}>
                {shown === todayTopic
                  ? (open ? t('coachDashboard.groupTopicToday') : t('coachDashboard.groupTopicTodayClosed'))
                  : t('coachDashboard.groupTopicLast', { date: dayLabel(shown.day) })}
              </p>
              <p className="text-[12px] font-black text-[#0a3a2a] leading-snug break-words">{focusTitle(shown, t)}</p>
              {shown.text && shown.topic && (
                <p className={`text-[10px] font-bold ${open ? 'text-[#0a3a2a]' : 'text-gray-500'}`}>{topicLabel(shown.topic, t)}</p>
              )}
            </div>
            {shown === todayTopic && (
              <button
                onClick={() => openModal(today, todayTopic)}
                disabled={saving}
                aria-label={t('coachDashboard.groupTopicEdit')}
                title={t('coachDashboard.groupTopicEdit')}
                className="w-7 h-7 shrink-0 rounded-lg bg-white border border-rose-200 text-rose-600 flex items-center justify-center active:scale-90 transition-all"
              >
                <span className="material-symbols-outlined text-[16px]">edit</span>
              </button>
            )}
          </div>

          <div className="mt-2">
            <TopicMemberList members={members} gt={shown} status={status} onAssign={open ? s => assignOne(shown, s) : undefined} saving={saving} />
          </div>

          {open && (
            <div className="flex gap-2 mt-2.5 pt-2 border-t border-rose-200/70">
              <button onClick={() => close(todayTopic!)} disabled={saving} className={`${btn} bg-white text-red-600 border-red-100`}>
                {t('coachDashboard.groupTopicClose')}
              </button>
            </div>
          )}
        </div>
      )}
      </div>

      {/* Zaplanowane na kolejne dni — uczniowie zobaczą je dopiero w ich dniu. */}
      <div className="space-y-1 bg-rose-100 border border-rose-200 rounded-xl p-2.5">
      {upcoming.length > 0 && (
        <div className="space-y-1">
          <p className="text-[9px] font-black uppercase tracking-widest text-rose-600 ml-1">{t('coachDashboard.groupTopicPlanned')}</p>
          {upcoming.map(d => {
            const gt = byDay[d];
            return (
              <div key={d} className="flex items-center gap-2 bg-white border border-rose-200 rounded-xl pl-3 pr-1.5 py-1.5">
                <span className="text-[10px] font-black text-[#0a3a2a] shrink-0 w-20 truncate">{dayLabel(d)}</span>
                <span className="flex-1 min-w-0 text-[11px] font-bold text-[#0a3a2a] truncate">{focusTitle(gt, t)}</span>
                <button
                  onClick={() => openModal(d, gt)}
                  disabled={saving}
                  aria-label={t('coachDashboard.groupTopicEdit')}
                  className="w-7 h-7 shrink-0 rounded-lg text-rose-600 flex items-center justify-center active:scale-90 transition-all"
                >
                  <span className="material-symbols-outlined text-[16px]">edit</span>
                </button>
                <button
                  onClick={() => remove(gt)}
                  disabled={saving}
                  aria-label={t('coachDashboard.groupTopicDelete')}
                  className="w-7 h-7 shrink-0 rounded-lg text-red-400 flex items-center justify-center active:scale-90 transition-all"
                >
                  <span className="material-symbols-outlined text-[16px]">delete</span>
                </button>
              </div>
            );
          })}
        </div>
      )}

      <button
        type="button"
        onClick={() => {
          const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
          openModal(dayKeyOf(tomorrow.getTime()));
        }}
        disabled={members.length === 0 || saving}
        className="w-full py-1.5 text-[9px] font-black uppercase tracking-widest text-[#0a3a2a] flex items-center justify-center gap-1 active:scale-95 transition-all disabled:opacity-40"
      >
        <span className="material-symbols-outlined text-rose-500 text-[14px]">event</span>
        {t('coachDashboard.groupTopicPlan')}
      </button>
      </div>

      {modal && createPortal(
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[500000] flex items-center justify-center p-4 animate-fade-in" onClick={() => setModal(null)}>
          <div className="bg-white rounded-[32px] p-6 w-full max-w-[400px] shadow-2xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-3 shrink-0">
              <div className="w-10 h-10 rounded-full bg-rose-500 flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-white">sports</span>
              </div>
              <h2 className="text-xl font-black text-[#0a3a2a] leading-none">
                {t(modal.edit ? 'coachDashboard.groupTopicEdit' : 'coachDashboard.groupTopicModalTitle')}
              </h2>
            </div>
            <div className="overflow-y-auto flex-1 space-y-3 pr-1 pb-2 hide-scrollbar">
              {!modal.edit && <p className="text-[10px] font-bold text-gray-500 leading-snug">{t('coachDashboard.groupTopicModalHint')}</p>}
              <div>
                <p className="text-[8px] font-black uppercase tracking-widest text-gray-400 mb-1">{t('coachDashboard.groupTopicDay')}</p>
                {modal.edit ? (
                  <p className="text-[12px] font-black text-[#0a3a2a]">{dayLabel(modal.day)}</p>
                ) : (
                  <input
                    type="date"
                    value={modal.day}
                    min={today}
                    onChange={e => e.target.value && setModal({ ...modal, day: e.target.value })}
                    className="w-full bg-white border border-gray-200 rounded-lg p-2 text-[12px] font-bold text-[#333] outline-none focus:border-rose-500"
                  />
                )}
                {!modal.edit && byDay[modal.day] && (
                  <p className="text-[10px] font-bold text-red-500 mt-1">{t('coachDashboard.groupTopicDayTaken')}</p>
                )}
              </div>
              <textarea
                value={text}
                onChange={e => setText(e.target.value.slice(0, FOCUS_TEXT_MAX))}
                maxLength={FOCUS_TEXT_MAX}
                placeholder={t('coachDashboard.groupTopicPlaceholder')}
                className="w-full bg-white border border-gray-200 rounded-lg p-2.5 text-[11px] font-bold text-[#333] outline-none focus:border-rose-500 resize-none h-16"
              />
              <TopicPicker selectedTopics={pickedTopics} onChange={setPickedTopics} />
              <div>
                <p className="text-[8px] font-black uppercase tracking-widest text-gray-400 mb-1">{t('coachDashboard.groupTopicLinks')}</p>
                <div className="space-y-1.5">
                  {linkInputs.map((v, i) => (
                    <div key={i}>
                      <div className="flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-rose-500 text-[16px] shrink-0">link</span>
                        <input
                          type="url"
                          inputMode="url"
                          autoCapitalize="off"
                          autoCorrect="off"
                          value={v}
                          maxLength={500}
                          onChange={e => setLinkInputs(prev => prev.map((x, j) => (j === i ? e.target.value : x)))}
                          placeholder={t('coachDashboard.groupTopicLinkPlaceholder')}
                          className={`w-full bg-white border rounded-lg p-2 text-[11px] font-bold text-[#333] outline-none focus:border-rose-500 ${linkChecks[i] === null ? 'border-red-400' : 'border-gray-200'}`}
                        />
                      </div>
                      {linkChecks[i] === null && <p className="text-[10px] font-bold text-red-500 mt-0.5 ml-6">{t('coachDashboard.groupTopicLinkInvalid')}</p>}
                    </div>
                  ))}
                </div>
                <p className="text-[9px] font-bold text-gray-400 leading-snug mt-1.5">{t('coachDashboard.groupTopicLinksHint')}</p>
              </div>
            </div>
            <div className="flex gap-2 mt-3 shrink-0">
              <button onClick={() => setModal(null)} className="flex-1 py-3 bg-gray-100 text-gray-500 rounded-xl font-black text-[10px] uppercase tracking-widest active:scale-95">
                {t('coachDashboard.cancel')}
              </button>
              <button
                onClick={() => (modal.edit ? edit(byDay[modal.day], modalBase) : create(modal.day, modalBase))}
                disabled={saving || !text.trim() || linksInvalid || (!modal.edit && (!!byDay[modal.day] || modal.day < today))}
                className="flex-[2] py-3 bg-rose-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest active:scale-95 disabled:opacity-50 shadow-md"
              >
                {saving ? t('coachDashboard.processing') : modal.edit ? t('coachDashboard.groupTopicSaveEdit') : t('coachDashboard.groupTopicSave', { count: members.length })}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
