import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { addDoc, collection, deleteDoc, deleteField, doc, getDoc, getDocs, query, serverTimestamp, Timestamp, updateDoc, where } from 'firebase/firestore';
import { db } from '../firebase';
import TopicPicker from './TopicPicker';
import TopicLinks, { isYouTube } from './TopicLinks';
import { focusTitle } from './tagebuch/FocusCard';
import { topicLabel } from '../constants/trainingTopics';
import { FOCUS_TEXT_MAX, TOPIC_DESC_MAX, TOPIC_LINK_TITLE_MAX, TOPIC_LINKS_MAX, dayKeyOf, normalizeTopicLink, sessionTopicId } from '../utils/focus';

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
  /** Opis pod tytułem (jak treść maila). */
  desc?: string;
  /** Tytuły linków (ten sam indeks co links), '' = bez tytułu. */
  linkTitles?: string[];
}

type TopicBase = { text: string; topic: string; links: string[]; desc: string; linkTitles: string[] };

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
export function TopicMemberList({ members, gt, status, onAssign, saving, onOpenStudent }: {
  members: any[];
  gt: GroupTopic;
  status: Record<string, MemberStatus>;
  onAssign?: (s: any) => void;   // tylko otwarty temat: dopisz ucznia, który doszedł później
  saving?: boolean;
  onOpenStudent?: (studentId: string) => void; // klik w imię → karta ucznia (jak w liście uczniów)
}) {
  const { t } = useTranslation();
  return (
    <div className="space-y-1">
      {members.map(s => {
        const name = `${s.firstName || t('coachDashboard.defaultStudentName')} ${s.lastName || ''}`.trim();
        const st = status[s.id];
        return (
          <div key={s.id} className="flex items-center gap-2 min-h-[22px]">
            {onOpenStudent ? (
              <button
                type="button"
                onClick={() => onOpenStudent(s.id)}
                className="flex-1 min-w-0 flex items-center gap-0.5 text-left text-[11px] font-bold text-[#0a3a2a] active:opacity-60 transition-opacity"
              >
                <span className="truncate">{name}</span>
                <span className="material-symbols-outlined text-gray-300 text-[14px] shrink-0">chevron_right</span>
              </button>
            ) : (
              <span className="flex-1 min-w-0 text-[11px] font-bold text-[#0a3a2a] truncate">{name}</span>
            )}
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

export default function GroupTopicPanel({ groupId, groupName, members, coachId, topics: byDay, onChanged, showToast, onOpenStudent, renderHistory }: {
  groupId: string;
  groupName: string;
  members: any[];
  coachId: string;
  topics: GroupTopicsByDay;
  onChanged: (next: GroupTopicsByDay) => void;
  showToast: (msg: string) => void;
  onOpenStudent?: (studentId: string) => void;
  /** Historia treningów pod sekcją tematu — dostaje „Powtórz na dziś” (null, gdy dziś już jest temat) i edycję. */
  renderHistory?: (repeatToday: ((gt: GroupTopic) => void) | null, editTopic: (gt: GroupTopic) => void) => ReactNode;
}) {
  const { t, i18n } = useTranslation();
  const [modal, setModal] = useState<{ day: string; edit: boolean } | null>(null);
  const [text, setText] = useState('');
  const [pickedTopics, setPickedTopics] = useState<string[]>([]);
  const [linkInputs, setLinkInputs] = useState<string[]>(['', '', '']);
  const [desc, setDesc] = useState('');
  const [linkTitleInputs, setLinkTitleInputs] = useState<string[]>(['', '', '']);
  // Indeks linku, dla którego trwa pobieranie tytułu z YouTube.
  const [fetchingTitle, setFetchingTitle] = useState<number | null>(null);
  // Na slot linku: adres trwającego zapytania, ostatni tytuł wpisany automatycznie, timer.
  const titleReqRef = useRef<string[]>(['', '', '']);
  const autoTitleRef = useRef<string[]>(['', '', '']);
  const titleTimersRef = useRef<number[]>([]);
  useEffect(() => () => titleTimersRef.current.forEach(id => window.clearTimeout(id)), []);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<Record<string, MemberStatus>>({});

  const today = dayKeyOf(Date.now());
  const days = useMemo(() => Object.keys(byDay).sort(), [byDay]);
  const todayTopic = byDay[today];
  const upcoming = days.filter(d => d > today);
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
  const assignTo = async (list: any[], topic: { text: string; topic: string; day: string; links?: string[]; desc?: string; linkTitles?: string[] }) => {
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
          ...(topic.desc ? { desc: topic.desc } : {}),
          ...(topic.links?.length && topic.linkTitles?.some(Boolean) ? { linkTitles: topic.linkTitles } : {}),
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
    const { links, desc, linkTitles, ...rest } = base;
    await save(day, { ...rest, ...(links.length ? { links } : {}), ...(desc ? { desc } : {}), ...(linkTitles.some(Boolean) ? { linkTitles } : {}), day, setAt: Date.now(), entryIds, ...cal });
    setModal(null);
  });

  // Edycja: ten sam wpis u uczniów (data startu i id zostają — status się nie gubi).
  const edit = (gt: GroupTopic, base: TopicBase) => run(async () => {
    if (!base.text) return;
    await forEntries(gt, (sid, eid) => updateDoc(doc(db, `users/${sid}/coachLog`, eid), {
      text: base.text, topics: base.topic ? [base.topic] : [], links: base.links, desc: base.desc, linkTitles: base.linkTitles, editedAt: Date.now(),
    }));
    await syncCalendar(gt, base);
    const { links, desc, linkTitles, ...rest } = base;
    const next: GroupTopic = { ...gt, ...rest };
    if (links.length) next.links = links; else delete next.links;
    if (desc) next.desc = desc; else delete next.desc;
    if (linkTitles.some(Boolean)) next.linkTitles = linkTitles; else delete next.linkTitles;
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
    setDesc(gt?.desc ?? '');
    setLinkTitleInputs([0, 1, 2].map(i => gt?.linkTitles?.[i] ?? ''));
    titleTimersRef.current.forEach(id => window.clearTimeout(id));
    titleReqRef.current = ['', '', ''];
    autoTitleRef.current = ['', '', ''];
    setFetchingTitle(null);
    setModal({ day, edit: !!gt });
  };

  // Pierwszy dzień bez tematu, od dziś.
  const firstFreeDay = () => {
    const d = new Date();
    while (byDay[dayKeyOf(d.getTime())]) d.setDate(d.getDate() + 1);
    return dayKeyOf(d.getTime());
  };
  const dayLabel = (day: string) => new Date(`${day}T12:00:00`).toLocaleDateString(i18n.language, { weekday: 'short', day: 'numeric', month: 'short' });
  // Sekcja = biały środek, ramka i pasek nagłówka w odcieniu różu (user 2026-10-22).
  const sectionHeader = 'text-[9px] font-black uppercase tracking-widest px-3 py-2';
  const btn = 'flex-1 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest border active:scale-95 transition-all disabled:opacity-40';
  // Puste pole = brak linku; wpisane, ale złe = blokada zapisu z komunikatem.
  const linkChecks = linkInputs.map(v => (v.trim() ? normalizeTopicLink(v) : ''));
  const linksInvalid = linkChecks.some(v => v === null);
  // Link + jego tytuł; powtórzony link liczy się raz (pierwszy wygrywa).
  const linkPairs = linkChecks
    .map((link, i) => ({ link, title: (linkTitleInputs[i] || '').trim().slice(0, TOPIC_LINK_TITLE_MAX) }))
    .filter((p, i, all): p is { link: string; title: string } => !!p.link && all.findIndex(q => q.link === p.link) === i)
    .slice(0, TOPIC_LINKS_MAX);

  // [TYTUŁ Z YOUTUBE] (user 2026-10-23) Sam po wklejeniu linku YouTube przez
  // trenera (publiczny oEmbed), ikonka obok = pobierz ponownie. Trener tytuł
  // sprawdza/poprawia, a uczniowie dostają zapisany tekst — ich telefony nie
  // łączą się z YouTube. Opisane w Datenschutzerklärung (2.9).
  // auto: bez komunikatu o błędzie i bez nadpisywania tytułu wpisanego ręcznie
  // (nadpisuje tylko pusty albo poprzednio pobrany automatycznie).
  const fetchYouTubeTitle = async (i: number, url: string, auto: boolean) => {
    titleReqRef.current[i] = url;
    setFetchingTitle(i);
    let title = '';
    try {
      const res = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`, { referrerPolicy: 'no-referrer', credentials: 'omit' });
      const data = res.ok ? await res.json() : null;
      title = typeof data?.title === 'string' ? data.title.trim().slice(0, TOPIC_LINK_TITLE_MAX) : '';
    } catch { /* brak sieci / zły film */ }
    // Link zmieniony w trakcie — wynik starego zapytania już nie pasuje.
    if (titleReqRef.current[i] !== url) return;
    setFetchingTitle(prev => (prev === i ? null : prev));
    if (!title) {
      if (!auto) showToast(t('coachDashboard.groupTopicTitleFetchFail'));
      return;
    }
    const prevAuto = autoTitleRef.current[i];
    autoTitleRef.current[i] = title;
    setLinkTitleInputs(prev => prev.map((x, j) => (j === i && (!auto || !x.trim() || x === prevAuto) ? title : x)));
  };
  const onLinkChange = (i: number, value: string) => {
    setLinkInputs(prev => prev.map((x, j) => (j === i ? value : x)));
    window.clearTimeout(titleTimersRef.current[i]);
    titleReqRef.current[i] = '';
    setFetchingTitle(prev => (prev === i ? null : prev));
    const url = value.trim() ? normalizeTopicLink(value) : '';
    if (url && isYouTube(url)) {
      titleTimersRef.current[i] = window.setTimeout(() => fetchYouTubeTitle(i, url, true), 600);
    }
  };
  const modalBase: TopicBase = {
    text: text.trim().slice(0, FOCUS_TEXT_MAX),
    topic: pickedTopics[0] || '',
    links: linkPairs.map(p => p.link),
    desc: desc.trim().slice(0, TOPIC_DESC_MAX),
    linkTitles: linkPairs.map(p => p.title),
  };

  return (
    <div className="space-y-2">
      {/* Odcienie różu od jasnego (temat) do ciemnego (lista grupy) — user 2026-10-16. */}
      <div className="bg-white border-2 border-rose-100 rounded-xl overflow-hidden">
      {/* „+” = nowy temat (user 2026-10-22): na dziś, a gdy dziś już jest —
          na pierwszy wolny dzień; datę zmienia się w oknie. „Powtórz” jest przy wpisach historii. */}
      <div className={`${sectionHeader} bg-rose-50 text-rose-500 flex items-center justify-between gap-2`}>
        <span>{t('coachDashboard.groupTopicLabel')}</span>
        {(
          <button
            type="button"
            onClick={() => openModal(firstFreeDay())}
            disabled={members.length === 0 || saving}
            aria-label={t(todayTopic ? 'coachDashboard.groupTopicPlan' : 'coachDashboard.groupTopicSet')}
            title={t(todayTopic ? 'coachDashboard.groupTopicPlan' : 'coachDashboard.groupTopicSet')}
            className="-my-1 w-7 h-7 rounded-lg bg-rose-500 text-white flex items-center justify-center shadow-sm active:scale-90 transition-all disabled:opacity-40"
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
          </button>
        )}
      </div>
      <div className="space-y-2 p-2.5">

      {todayTopic?.closedAt && (
        <p className="flex items-center gap-1 text-[10px] font-bold text-[#0a3a2a] ml-1">
          <span className="material-symbols-outlined text-rose-500 text-[14px]">check_circle</span>
          {t('coachDashboard.groupTopicClosedToday')}
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
              {shown.desc && <p className="text-[11px] font-medium text-[#333] leading-snug whitespace-pre-wrap break-words mt-0.5">{shown.desc}</p>}
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

          <TopicLinks links={shown.links} titles={shown.linkTitles} tone="coach" small className="mt-2" />

          <div className="mt-2">
            <TopicMemberList members={members} gt={shown} status={status} onAssign={open ? s => assignOne(shown, s) : undefined} saving={saving} onOpenStudent={onOpenStudent} />
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

      {!todayTopic && upcoming.length === 0 && (
        <p className="text-[10px] font-bold text-gray-400 ml-1">{t('coachDashboard.groupTopicNone')}</p>
      )}

      {/* Zaplanowane na kolejne dni — w tej samej sekcji co dzisiejszy temat
          (user 2026-10-22); uczniowie zobaczą je dopiero w ich dniu. */}
      {upcoming.length > 0 && (
        <div className="space-y-1 pt-2 border-t border-rose-100">
          <p className="text-[9px] font-black uppercase tracking-widest text-rose-500 ml-1">{t('coachDashboard.groupTopicPlanned')}</p>
          {upcoming.map(d => {
            const gt = byDay[d];
            return (
              <div key={d} className="flex items-center gap-2 bg-white border border-rose-200 rounded-xl pl-3 pr-1.5 py-1.5">
                <span className="text-[10px] font-black text-[#0a3a2a] shrink-0 w-20 truncate">{dayLabel(d)}</span>
                <span className="flex-1 min-w-0 text-[11px] font-bold text-[#0a3a2a] truncate">{focusTitle(gt, t)}</span>
                {!!gt.links?.length && (
                  <span className="flex items-center text-[10px] font-black text-rose-500 shrink-0" aria-label={String(gt.links.length)}>
                    <span className="material-symbols-outlined text-[14px]">link</span>{gt.links.length}
                  </span>
                )}
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

      </div>
      </div>

      {renderHistory?.(!todayTopic && members.length > 0 && !saving
        ? gt => create(today, { text: gt.text, topic: gt.topic, links: gt.links ?? [], desc: gt.desc ?? '', linkTitles: gt.linkTitles ?? [] })
        : null, gt => openModal(gt.day, gt))}

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
              {/* Jak w mailu: temat (tytuł) u góry, opis pod nim (user 2026-10-22). */}
              <div>
                <p className="text-[8px] font-black uppercase tracking-widest text-gray-400 mb-1">{t('coachDashboard.groupTopicTitleLabel')}</p>
                <input
                  value={text}
                  onChange={e => setText(e.target.value.slice(0, FOCUS_TEXT_MAX))}
                  maxLength={FOCUS_TEXT_MAX}
                  placeholder={t('coachDashboard.groupTopicPlaceholder')}
                  className="w-full bg-white border border-gray-200 rounded-lg p-2.5 text-[12px] font-black text-[#333] outline-none focus:border-rose-500"
                />
              </div>
              <div>
                <p className="text-[8px] font-black uppercase tracking-widest text-gray-400 mb-1">{t('coachDashboard.groupTopicDescLabel')}</p>
                <textarea
                  value={desc}
                  onChange={e => setDesc(e.target.value.slice(0, TOPIC_DESC_MAX))}
                  maxLength={TOPIC_DESC_MAX}
                  placeholder={t('coachDashboard.groupTopicDescPlaceholder')}
                  className="w-full bg-white border border-gray-200 rounded-lg p-2.5 text-[11px] font-medium text-[#333] outline-none focus:border-rose-500 resize-none h-24"
                />
              </div>
              <TopicPicker selectedTopics={pickedTopics} onChange={setPickedTopics} />
              <div>
                <p className="text-[8px] font-black uppercase tracking-widest text-gray-400 mb-1">{t('coachDashboard.groupTopicLinks')}</p>
                <div className="space-y-1.5">
                  {linkInputs.map((v, i) => (
                    <div key={i}>
                      <div className="flex items-center gap-1.5">
                        {/* Poprawny link = ikona do otwarcia (z potwierdzeniem), inaczej sama ikona pola. */}
                        {linkChecks[i]
                          ? <TopicLinks links={[linkChecks[i] as string]} tone="coach" small />
                          : <span className="material-symbols-outlined text-rose-300 text-[16px] shrink-0 w-7 text-center">link</span>}
                        <input
                          type="url"
                          inputMode="url"
                          autoCapitalize="off"
                          autoCorrect="off"
                          value={v}
                          maxLength={500}
                          onChange={e => onLinkChange(i, e.target.value)}
                          placeholder={t('coachDashboard.groupTopicLinkPlaceholder')}
                          className={`w-full bg-white border rounded-lg p-2 text-[11px] font-bold text-[#333] outline-none focus:border-rose-500 ${linkChecks[i] === null ? 'border-red-400' : 'border-gray-200'}`}
                        />
                        {/* Usuń link razem z tytułem (user 2026-10-22); zapis tematu usuwa go też u uczniów. */}
                        {(v || linkTitleInputs[i]) && (
                          <button
                            type="button"
                            onClick={() => {
                              onLinkChange(i, '');
                              autoTitleRef.current[i] = '';
                              setLinkTitleInputs(prev => prev.map((x, j) => (j === i ? '' : x)));
                            }}
                            aria-label={t('coachDashboard.groupTopicLinkRemove')}
                            title={t('coachDashboard.groupTopicLinkRemove')}
                            className="w-8 h-8 shrink-0 rounded-lg text-red-400 hover:text-red-600 flex items-center justify-center active:scale-90 transition-all"
                          >
                            <span className="material-symbols-outlined text-[18px]">delete</span>
                          </button>
                        )}
                      </div>
                      {linkChecks[i] === null && <p className="text-[10px] font-bold text-red-500 mt-0.5 ml-9">{t('coachDashboard.groupTopicLinkInvalid')}</p>}
                      {linkChecks[i] && (
                        <div className="flex items-center gap-1.5 mt-1 ml-9">
                          <input
                            value={linkTitleInputs[i]}
                            maxLength={TOPIC_LINK_TITLE_MAX}
                            onChange={e => setLinkTitleInputs(prev => prev.map((x, j) => (j === i ? e.target.value.slice(0, TOPIC_LINK_TITLE_MAX) : x)))}
                            placeholder={t('coachDashboard.groupTopicLinkTitlePlaceholder')}
                            className="flex-1 min-w-0 bg-white border border-gray-200 rounded-lg p-2 text-[11px] font-bold text-[#333] outline-none focus:border-rose-500"
                          />
                          {isYouTube(linkChecks[i] as string) && (
                            <button
                              type="button"
                              onClick={() => fetchYouTubeTitle(i, linkChecks[i] as string, false)}
                              disabled={fetchingTitle === i}
                              aria-label={t('coachDashboard.groupTopicTitleFetch')}
                              title={t('coachDashboard.groupTopicTitleFetch')}
                              className="w-8 h-8 shrink-0 rounded-lg text-rose-400 hover:text-rose-600 flex items-center justify-center active:scale-90 transition-all disabled:opacity-60"
                            >
                              <span className={`material-symbols-outlined text-[18px] ${fetchingTitle === i ? 'animate-spin' : ''}`}>{fetchingTitle === i ? 'progress_activity' : 'refresh'}</span>
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <p className="text-[9px] font-bold text-gray-400 leading-snug mt-1.5">{t('coachDashboard.groupTopicLinksHint')}</p>
                {/* Zawsze widoczne — informacja przed wklejeniem, bo tytuł pobiera się sam (Datenschutz 2.9). */}
                <p className="text-[9px] font-bold text-gray-400 leading-snug mt-1">{t('coachDashboard.groupTopicTitleFetchHint')}</p>
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
