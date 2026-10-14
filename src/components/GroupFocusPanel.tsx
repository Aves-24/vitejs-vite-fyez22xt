import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { addDoc, collection, deleteField, doc, getDoc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import TopicPicker from './TopicPicker';
import { FocusDots, focusTitle } from './tagebuch/FocusCard';
import { topicLabel } from '../constants/trainingTopics';
import { FOCUS_GOAL_DEFAULT, FOCUS_GOAL_OPTIONS, FOCUS_TEXT_MAX, endedFocusSnapshot, type FocusState } from '../utils/focus';

// [FOKUS GRUPY] (user 2026-10-14) Trener daje całej grupie jeden fokus.
// Technicznie to zwykły fokus trenera (wpis 'goal' w coachLog) u każdego
// członka — kropki, dziennik ucznia i liczenie działają bez zmian; nowszy
// własny fokus ucznia wygrywa, jak przy fokusie ustawionym pojedynczo.
// Na dokumencie trenera (coachGroupFocus.<groupId>) zostaje tylko, który
// wpis u którego ucznia należy do grupy — stąd postęp w karcie grupy.

export interface GroupFocus {
  text: string;
  topic: string;
  goal: number;
  setAt: number;
  /** studentId → id wpisu 'goal' w users/{studentId}/coachLog */
  goalIds: Record<string, string>;
}

export default function GroupFocusPanel({ groupId, members, coachId, groupFocus, studentFocus, onChanged, showToast }: {
  groupId: string;
  members: any[];
  coachId: string;
  groupFocus: GroupFocus | undefined;
  studentFocus: Record<string, FocusState>;
  /** Nowy stan fokusu grupy (null = usunięty) + uczniowie do przeładowania fokusu. */
  onChanged: (next: GroupFocus | null, refreshIds: string[]) => void;
  showToast: (msg: string) => void;
}) {
  const { t } = useTranslation();
  const [modalOpen, setModalOpen] = useState(false);
  const [text, setText] = useState('');
  const [topics, setTopics] = useState<string[]>([]);
  const [goal, setGoal] = useState<number>(FOCUS_GOAL_DEFAULT);
  const [saving, setSaving] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);

  const coachName = async () => {
    const cached = localStorage.getItem(`grotX_userName_${coachId}`);
    if (cached) return cached;
    const d = (await getDoc(doc(db, 'users', coachId))).data() || {};
    return `${d.firstName || ''} ${d.lastName || ''}`.trim() || t('coachLog.defaultCoachName', { defaultValue: 'Trainer' });
  };

  // Ten sam zapis co CoachFocusModal.handleSetNew, dla każdego ucznia osobno —
  // błąd u jednego nie blokuje reszty.
  const assignTo = async (list: any[], focus: { text: string; topic: string; goal: number }) => {
    const authorName = await coachName();
    const results = await Promise.all(list.map(async s => {
      try {
        const ref = await addDoc(collection(db, `users/${s.id}/coachLog`), {
          authorId: coachId,
          authorName,
          text: focus.text,
          type: 'goal',
          topics: focus.topic ? [focus.topic] : [],
          groupId,
          createdAt: serverTimestamp(),
        });
        await updateDoc(doc(db, 'users', s.id), { focusGoal: focus.goal, focusDots: true });
        return [s.id, ref.id] as const;
      } catch (e) {
        console.error('Fokus grupy: błąd zapisu u ucznia', s.id, e);
        return null;
      }
    }));
    const ok = results.filter(Boolean) as (readonly [string, string])[];
    if (ok.length < list.length) showToast(t('coachDashboard.groupFocusPartialError', { count: list.length - ok.length }));
    return Object.fromEntries(ok) as Record<string, string>;
  };

  const handleSet = async () => {
    const clean = text.trim().slice(0, FOCUS_TEXT_MAX);
    if (!clean || members.length === 0) return;
    setSaving(true);
    try {
      const focus = { text: clean, topic: topics[0] || '', goal };
      const goalIds = await assignTo(members, focus);
      const next: GroupFocus = { ...focus, setAt: Date.now(), goalIds };
      await updateDoc(doc(db, 'users', coachId), { [`coachGroupFocus.${groupId}`]: next });
      onChanged(next, Object.keys(goalIds));
      setModalOpen(false);
    } catch (e) {
      console.error('Fokus grupy: błąd zapisu', e);
      showToast(t('coachDashboard.toastGroupError'));
    }
    setSaving(false);
  };

  // Uczeń dołączył do grupy po ustawieniu fokusu.
  const handleAssignOne = async (s: any) => {
    if (!groupFocus) return;
    setSaving(true);
    const ids = await assignTo([s], groupFocus);
    if (ids[s.id]) {
      const next = { ...groupFocus, goalIds: { ...groupFocus.goalIds, ...ids } };
      try {
        await updateDoc(doc(db, 'users', coachId), { [`coachGroupFocus.${groupId}.goalIds.${s.id}`]: ids[s.id] });
        onChanged(next, [s.id]);
      } catch (e) { console.error('Fokus grupy: błąd zapisu', e); }
    }
    setSaving(false);
  };

  // Kończy fokus tylko u tych, którzy nadal nad nim pracują — kto ma już
  // własny nowszy fokus, zostaje nietknięty.
  const handleEnd = async () => {
    if (!groupFocus) return;
    setSaving(true);
    const working = members.filter(s => isGroupFocus(s));
    await Promise.all(working.map(async s => {
      const fs = studentFocus[s.id];
      try {
        await updateDoc(doc(db, 'users', s.id), {
          focus: { cleared: true, setAt: Date.now(), ended: endedFocusSnapshot(fs.focus!, fs.dots, fs.count, fs.goal) },
        });
      } catch (e) { console.error('Fokus grupy: błąd zakończenia u ucznia', s.id, e); }
    }));
    try {
      await updateDoc(doc(db, 'users', coachId), { [`coachGroupFocus.${groupId}`]: deleteField() });
      onChanged(null, working.map(s => s.id));
    } catch (e) {
      console.error('Fokus grupy: błąd zakończenia', e);
      showToast(t('coachDashboard.toastGroupError'));
    }
    setConfirmEnd(false);
    setSaving(false);
  };

  const isGroupFocus = (s: any) => {
    const gid = groupFocus?.goalIds[s.id];
    return !!gid && studentFocus[s.id]?.focus?.goalId === gid;
  };
  const isDone = (s: any) => {
    const fs = studentFocus[s.id];
    return isGroupFocus(s) && !!fs?.dots && fs.count >= fs.goal;
  };

  const openModal = () => {
    setText(''); setTopics([]); setGoal(groupFocus?.goal ?? FOCUS_GOAL_DEFAULT);
    setModalOpen(true);
  };

  const sectionLabel = 'text-[9px] font-black uppercase tracking-widest text-gray-400 mb-1.5 ml-2';
  const assigned = members.filter(s => groupFocus?.goalIds[s.id]);

  return (
    <div>
      <p className={sectionLabel}>{t('coachDashboard.groupFocusLabel')}</p>

      {!groupFocus ? (
        <button
          type="button"
          onClick={openModal}
          disabled={members.length === 0}
          className="w-full py-2.5 rounded-xl border-2 border-dashed border-amber-200 text-amber-700 text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-1 active:scale-[0.98] transition-all disabled:opacity-40"
        >
          <span className="material-symbols-outlined text-[16px]">track_changes</span>
          {t('coachDashboard.groupFocusSet')}
        </button>
      ) : (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
          <div className="flex items-start gap-2">
            <span className="material-symbols-outlined text-[18px] text-amber-600 shrink-0 mt-px">track_changes</span>
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-black text-[#0a3a2a] leading-snug break-words">{focusTitle(groupFocus, t)}</p>
              {groupFocus.topic && (
                <p className="text-[10px] font-bold text-amber-700">{topicLabel(groupFocus.topic, t)}</p>
              )}
            </div>
            <span className="text-[10px] font-black text-amber-800 shrink-0">
              {t('coachDashboard.groupFocusDone', { done: assigned.filter(isDone).length, total: assigned.length })}
            </span>
          </div>

          <div className="mt-2 space-y-1">
            {members.map(s => {
              const fs = studentFocus[s.id];
              const name = `${s.firstName || t('coachDashboard.defaultStudentName')} ${s.lastName || ''}`.trim();
              return (
                <div key={s.id} className="flex items-center gap-2 min-h-[22px]">
                  <span className="flex-1 min-w-0 text-[11px] font-bold text-[#0a3a2a] truncate">{name}</span>
                  {!groupFocus.goalIds[s.id] ? (
                    <button
                      type="button"
                      onClick={() => handleAssignOne(s)}
                      disabled={saving}
                      className="text-[9px] font-black uppercase tracking-wide text-amber-700 bg-white border border-amber-200 rounded-md px-2 py-0.5 active:scale-95 transition-all disabled:opacity-40"
                    >
                      {t('coachDashboard.groupFocusAssign')}
                    </button>
                  ) : isGroupFocus(s) ? (
                    <FocusDots count={fs.count} goal={fs.goal} small light />
                  ) : (
                    <span className="text-[9px] font-bold text-gray-400">
                      {fs?.focus ? t('coachDashboard.groupFocusOwn') : t('coachDashboard.groupFocusEnded')}
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {confirmEnd ? (
            <div className="mt-2.5 pt-2 border-t border-amber-200/70">
              <p className="text-[10px] font-bold text-red-700 leading-snug mb-1.5">{t('coachDashboard.groupFocusEndConfirm')}</p>
              <div className="flex gap-2">
                <button onClick={() => setConfirmEnd(false)} className="flex-1 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest bg-white text-gray-500 border border-gray-200">
                  {t('coachDashboard.cancel')}
                </button>
                <button onClick={handleEnd} disabled={saving} className="flex-1 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest bg-red-500 text-white disabled:opacity-50">
                  {t('coachDashboard.groupFocusEnd')}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2 mt-2.5 pt-2 border-t border-amber-200/70">
              <button onClick={openModal} className="flex-1 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest bg-white text-amber-800 border border-amber-200 active:scale-95 transition-all">
                {t('coachDashboard.groupFocusNew')}
              </button>
              <button onClick={() => setConfirmEnd(true)} className="flex-1 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest bg-white text-red-600 border border-red-100 active:scale-95 transition-all">
                {t('coachDashboard.groupFocusEnd')}
              </button>
            </div>
          )}
        </div>
      )}

      {modalOpen && createPortal(
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[500000] flex items-center justify-center p-4 animate-fade-in" onClick={() => setModalOpen(false)}>
          <div className="bg-white rounded-[32px] p-6 w-full max-w-[400px] shadow-2xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-3 shrink-0">
              <div className="w-10 h-10 rounded-full bg-[#0a3a2a] flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-[#fed33e]">track_changes</span>
              </div>
              <h2 className="text-xl font-black text-[#0a3a2a] leading-none">{t('coachDashboard.groupFocusModalTitle')}</h2>
            </div>
            <div className="overflow-y-auto flex-1 space-y-3 pr-1 pb-2 hide-scrollbar">
              <p className="text-[10px] font-bold text-gray-500 leading-snug">
                {t('coachDashboard.groupFocusModalHint')}
                {groupFocus && <> {t('coachDashboard.groupFocusReplaceHint')}</>}
              </p>
              <textarea
                value={text}
                onChange={e => setText(e.target.value.slice(0, FOCUS_TEXT_MAX))}
                maxLength={FOCUS_TEXT_MAX}
                placeholder={t('studentProfile.focusModalNewPlaceholder', { defaultValue: 'Krótko opisz, na czym ma się skupić uczeń…' })}
                className="w-full bg-white border border-gray-200 rounded-lg p-2.5 text-[11px] font-bold text-[#333] outline-none focus:border-blue-500 resize-none h-16"
              />
              <div>
                <p className="text-[8px] font-black uppercase tracking-widest text-gray-400 mb-1">{t('coachLog.focusGoalLabel', { defaultValue: 'Ile treningów?' })}</p>
                <div className="flex gap-1.5">
                  {FOCUS_GOAL_OPTIONS.map(n => (
                    <button
                      key={n}
                      onClick={() => setGoal(n)}
                      className={`flex-1 py-1.5 rounded-lg text-[11px] font-black border transition-all ${goal === n ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-500 border-gray-200'}`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
              <TopicPicker selectedTopics={topics} onChange={setTopics} />
            </div>
            <div className="flex gap-2 mt-3 shrink-0">
              <button onClick={() => setModalOpen(false)} className="flex-1 py-3 bg-gray-100 text-gray-500 rounded-xl font-black text-[10px] uppercase tracking-widest active:scale-95">
                {t('coachDashboard.cancel')}
              </button>
              <button
                onClick={handleSet}
                disabled={saving || !text.trim()}
                className="flex-[2] py-3 bg-[#0a3a2a] text-white rounded-xl font-black text-[10px] uppercase tracking-widest active:scale-95 disabled:opacity-50 shadow-md"
              >
                {saving ? t('coachDashboard.processing') : t('coachDashboard.groupFocusSave', { count: members.length })}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
