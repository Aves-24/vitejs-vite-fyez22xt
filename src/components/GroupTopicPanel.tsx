import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { addDoc, collection, doc, getDoc, getDocs, query, serverTimestamp, Timestamp, updateDoc, where } from 'firebase/firestore';
import { db } from '../firebase';
import TopicPicker from './TopicPicker';
import { focusTitle } from './tagebuch/FocusCard';
import { topicLabel } from '../constants/trainingTopics';
import { FOCUS_TEXT_MAX, dayKeyOf, isTopicOpen, sessionTopicId } from '../utils/focus';

// [TEMAT TRENINGU] (user 2026-10-15) Trener rano ustawia grupie temat
// dzisiejszego treningu. Technicznie: wpis 'topic' w coachLog każdego członka
// (utils/focus.ts, sekcja TEMAT TRENINGU). Na dokumencie trenera
// (coachGroupTopic.<groupId>) zostaje ostatni temat grupy z id wpisów —
// stąd status uczniów i „Powtórz” (kopia na dziś). Fioletowy jak u ucznia.
// Zastępuje dawny „fokus grupy” (GroupFocusPanel).

export interface GroupTopic {
  text: string;
  topic: string;
  day: string;          // YYYY-MM-DD
  setAt: number;
  /** studentId → id wpisu 'topic' w users/{studentId}/coachLog */
  entryIds: Record<string, string>;
  closedAt?: number;
}

type MemberStatus = 'trained' | 'acked' | 'none';

export default function GroupTopicPanel({ groupId, members, coachId, groupTopic, onChanged, showToast }: {
  groupId: string;
  members: any[];
  coachId: string;
  groupTopic: GroupTopic | undefined;
  onChanged: (next: GroupTopic) => void;
  showToast: (msg: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const [modalOpen, setModalOpen] = useState(false);
  const [text, setText] = useState('');
  const [topics, setTopics] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<Record<string, MemberStatus>>({});

  const open = !!groupTopic && isTopicOpen(groupTopic);

  // Status uczniów: trening pod temat (sesja z trainingTopic.id) albo „Zapoznałem się”.
  useEffect(() => {
    if (!groupTopic) { setStatus({}); return; }
    let cancelled = false;
    const from = new Date(`${groupTopic.day}T00:00:00`).getTime();
    Promise.all(Object.entries(groupTopic.entryIds).map(async ([sid, eid]) => {
      try {
        const sSnap = await getDocs(query(collection(db, `users/${sid}/sessions`), where('timestamp', '>=', Timestamp.fromMillis(from))));
        if (sSnap.docs.some(d => sessionTopicId(d.data()) === eid)) return [sid, 'trained'] as const;
        const e = await getDoc(doc(db, `users/${sid}/coachLog`, eid));
        return [sid, e.exists() && e.data().ackAt ? 'acked' : 'none'] as const;
      } catch {
        return [sid, 'none'] as const;
      }
    })).then(list => { if (!cancelled) setStatus(Object.fromEntries(list)); });
    return () => { cancelled = true; };
  }, [groupTopic]);

  const coachName = async () => {
    const cached = localStorage.getItem(`grotX_userName_${coachId}`);
    if (cached) return cached;
    const d = (await getDoc(doc(db, 'users', coachId))).data() || {};
    return `${d.firstName || ''} ${d.lastName || ''}`.trim() || t('coachLog.defaultCoachName', { defaultValue: 'Trainer' });
  };

  // Wpis u każdego ucznia osobno — błąd u jednego nie blokuje reszty.
  const assignTo = async (list: any[], topic: { text: string; topic: string; day: string }) => {
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

  const create = async (base: { text: string; topic: string }) => {
    if (!base.text || members.length === 0) return;
    setSaving(true);
    try {
      // Poprzedni otwarty temat (np. zmiana zdania rano) zamykamy — jeden temat = jeden trening.
      if (open) await closeEntries(groupTopic!);
      const day = dayKeyOf(Date.now());
      const entryIds = await assignTo(members, { ...base, day });
      const next: GroupTopic = { ...base, day, setAt: Date.now(), entryIds };
      await updateDoc(doc(db, 'users', coachId), { [`coachGroupTopic.${groupId}`]: next });
      onChanged(next);
      setModalOpen(false);
    } catch (e) {
      console.error('Temat treningu: błąd zapisu', e);
      showToast(t('coachDashboard.toastGroupError'));
    }
    setSaving(false);
  };

  const closeEntries = async (gt: GroupTopic) => {
    const at = Date.now();
    await Promise.all(Object.entries(gt.entryIds).map(async ([sid, eid]) => {
      try { await updateDoc(doc(db, `users/${sid}/coachLog`, eid), { closedAt: at }); }
      catch (e) { console.error('Temat treningu: błąd zamknięcia u ucznia', sid, e); }
    }));
    return at;
  };

  const handleClose = async () => {
    if (!groupTopic) return;
    setSaving(true);
    try {
      const closedAt = await closeEntries(groupTopic);
      const next = { ...groupTopic, closedAt };
      await updateDoc(doc(db, 'users', coachId), { [`coachGroupTopic.${groupId}.closedAt`]: closedAt });
      onChanged(next);
    } catch (e) {
      console.error('Temat treningu: błąd zamknięcia', e);
      showToast(t('coachDashboard.toastGroupError'));
    }
    setSaving(false);
  };

  // Uczeń dołączył do grupy po ustawieniu tematu.
  const handleAssignOne = async (s: any) => {
    if (!groupTopic || !open) return;
    setSaving(true);
    const ids = await assignTo([s], groupTopic);
    if (ids[s.id]) {
      try {
        await updateDoc(doc(db, 'users', coachId), { [`coachGroupTopic.${groupId}.entryIds.${s.id}`]: ids[s.id] });
        onChanged({ ...groupTopic, entryIds: { ...groupTopic.entryIds, ...ids } });
      } catch (e) { console.error('Temat treningu: błąd zapisu', e); }
    }
    setSaving(false);
  };

  const openModal = () => { setText(''); setTopics([]); setModalOpen(true); };
  const dayLabel = (day: string) => new Date(`${day}T12:00:00`).toLocaleDateString(i18n.language, { weekday: 'short', day: 'numeric', month: 'short' });
  const sectionLabel = 'text-[9px] font-black uppercase tracking-widest text-gray-400 mb-1.5 ml-2';
  const btn = 'flex-1 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest border active:scale-95 transition-all disabled:opacity-40';

  return (
    <div>
      <p className={sectionLabel}>{t('coachDashboard.groupTopicLabel')}</p>

      {!groupTopic ? (
        <button
          type="button"
          onClick={openModal}
          disabled={members.length === 0}
          className="w-full py-2.5 rounded-xl border-2 border-dashed border-violet-200 text-violet-700 text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-1 active:scale-[0.98] transition-all disabled:opacity-40"
        >
          <span className="material-symbols-outlined text-[16px]">sports</span>
          {t('coachDashboard.groupTopicSet')}
        </button>
      ) : (
        <div className={`rounded-xl px-3 py-2.5 border ${open ? 'bg-violet-50 border-violet-200' : 'bg-gray-50 border-gray-200'}`}>
          <div className="flex items-start gap-2">
            <span className={`material-symbols-outlined text-[18px] shrink-0 mt-px ${open ? 'text-violet-600' : 'text-gray-400'}`}>sports</span>
            <div className="flex-1 min-w-0">
              <p className={`text-[9px] font-black uppercase tracking-widest ${open ? 'text-violet-700' : 'text-gray-500'}`}>
                {open ? t('coachDashboard.groupTopicToday') : t('coachDashboard.groupTopicLast', { date: dayLabel(groupTopic.day) })}
              </p>
              <p className="text-[12px] font-black text-[#0a3a2a] leading-snug break-words">{focusTitle(groupTopic, t)}</p>
              {groupTopic.text && groupTopic.topic && (
                <p className={`text-[10px] font-bold ${open ? 'text-violet-700' : 'text-gray-500'}`}>{topicLabel(groupTopic.topic, t)}</p>
              )}
            </div>
          </div>

          <div className="mt-2 space-y-1">
            {members.map(s => {
              const name = `${s.firstName || t('coachDashboard.defaultStudentName')} ${s.lastName || ''}`.trim();
              const st = status[s.id];
              return (
                <div key={s.id} className="flex items-center gap-2 min-h-[22px]">
                  <span className="flex-1 min-w-0 text-[11px] font-bold text-[#0a3a2a] truncate">{name}</span>
                  {!groupTopic.entryIds[s.id] ? (
                    open ? (
                      <button
                        type="button"
                        onClick={() => handleAssignOne(s)}
                        disabled={saving}
                        className="text-[9px] font-black uppercase tracking-wide text-violet-700 bg-white border border-violet-200 rounded-md px-2 py-0.5 active:scale-95 transition-all disabled:opacity-40"
                      >
                        {t('coachDashboard.groupFocusAssign')}
                      </button>
                    ) : <span className="text-[9px] font-bold text-gray-300">—</span>
                  ) : st === 'trained' ? (
                    <span className="flex items-center gap-0.5 text-[9px] font-black text-emerald-700">
                      <span className="material-symbols-outlined text-[13px]">check</span>{t('coachDashboard.groupTopicTrained')}
                    </span>
                  ) : st === 'acked' ? (
                    <span className="flex items-center gap-0.5 text-[9px] font-black text-violet-700">
                      <span className="material-symbols-outlined text-[13px]">visibility</span>{t('coachDashboard.groupTopicAcked')}
                    </span>
                  ) : (
                    <span className="text-[9px] font-bold text-gray-400">{st ? '—' : '…'}</span>
                  )}
                </div>
              );
            })}
          </div>

          <div className={`flex gap-2 mt-2.5 pt-2 border-t ${open ? 'border-violet-200/70' : 'border-gray-200'}`}>
            <button onClick={openModal} disabled={saving} className={`${btn} bg-white text-violet-800 border-violet-200`}>
              {t('coachDashboard.groupTopicNew')}
            </button>
            {open ? (
              <button onClick={handleClose} disabled={saving} className={`${btn} bg-white text-red-600 border-red-100`}>
                {t('coachDashboard.groupTopicClose')}
              </button>
            ) : (
              <button
                onClick={() => create({ text: groupTopic.text, topic: groupTopic.topic })}
                disabled={saving || members.length === 0}
                className={`${btn} bg-violet-500 text-white border-violet-500`}
              >
                {t('coachDashboard.groupTopicRepeat')}
              </button>
            )}
          </div>
        </div>
      )}

      {modalOpen && createPortal(
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[500000] flex items-center justify-center p-4 animate-fade-in" onClick={() => setModalOpen(false)}>
          <div className="bg-white rounded-[32px] p-6 w-full max-w-[400px] shadow-2xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-3 shrink-0">
              <div className="w-10 h-10 rounded-full bg-violet-500 flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-white">sports</span>
              </div>
              <h2 className="text-xl font-black text-[#0a3a2a] leading-none">{t('coachDashboard.groupTopicModalTitle')}</h2>
            </div>
            <div className="overflow-y-auto flex-1 space-y-3 pr-1 pb-2 hide-scrollbar">
              <p className="text-[10px] font-bold text-gray-500 leading-snug">
                {t('coachDashboard.groupTopicModalHint')}
                {open && <> {t('coachDashboard.groupTopicReplaceHint')}</>}
              </p>
              <textarea
                value={text}
                onChange={e => setText(e.target.value.slice(0, FOCUS_TEXT_MAX))}
                maxLength={FOCUS_TEXT_MAX}
                placeholder={t('coachDashboard.groupTopicPlaceholder')}
                className="w-full bg-white border border-gray-200 rounded-lg p-2.5 text-[11px] font-bold text-[#333] outline-none focus:border-violet-500 resize-none h-16"
              />
              <TopicPicker selectedTopics={topics} onChange={setTopics} />
            </div>
            <div className="flex gap-2 mt-3 shrink-0">
              <button onClick={() => setModalOpen(false)} className="flex-1 py-3 bg-gray-100 text-gray-500 rounded-xl font-black text-[10px] uppercase tracking-widest active:scale-95">
                {t('coachDashboard.cancel')}
              </button>
              <button
                onClick={() => create({ text: text.trim().slice(0, FOCUS_TEXT_MAX), topic: topics[0] || '' })}
                disabled={saving || !text.trim()}
                className="flex-[2] py-3 bg-violet-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest active:scale-95 disabled:opacity-50 shadow-md"
              >
                {saving ? t('coachDashboard.processing') : t('coachDashboard.groupTopicSave', { count: members.length })}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
