import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { db } from '../firebase';
import { doc, updateDoc, addDoc, collection, getDoc, serverTimestamp } from 'firebase/firestore';
import TopicPicker from './TopicPicker';
import { focusTitle } from './tagebuch/FocusCard';
import { topicLabel } from '../constants/trainingTopics';
import { FOCUS_GOAL_OPTIONS, FOCUS_GOAL_DEFAULT, FOCUS_TEXT_MAX, loadFocusSessionDates, type FocusState } from '../utils/focus';

const MIN_GOAL = FOCUS_GOAL_OPTIONS[0];
const MAX_GOAL = FOCUS_GOAL_OPTIONS[FOCUS_GOAL_OPTIONS.length - 1];

// Panel otwierany klikiem na pasek fokusu w profilu ucznia. Łączy w jednym
// miejscu to, co wcześniej wymagało przejścia do Dziennika: zmianę liczby
// lekcji, ustawienie nowego fokusu, zakończenie obecnego przed czasem i
// podgląd dat treningów, które się do niego zaliczyły.
//
// Układ (user 2026-09-17): wszystko o OBECNYM fokusie (etykieta, tytuł,
// kropki, daty treningów, liczba lekcji do utrwalenia) na jednym zielonym
// tle — liczba lekcji dotyczy TEGO fokusu, więc żyje przy nim (+1/-1), a nie
// w formularzu „Nowy fokus" niżej, gdzie sugerowałoby że dotyczy przyszłego.
// Panel „Nowy fokus" zawsze widoczny pod spodem — tekst -> liczba lekcji -> tematy.
export default function CoachFocusModal({ studentId, coachId, focusState, onClose, onChange }: {
  studentId: string;
  coachId: string;
  focusState: FocusState | null;
  onClose: () => void;
  onChange: () => void;
}) {
  const { t, i18n } = useTranslation();
  const focus = focusState?.focus ?? null;

  // Liczba lekcji OBECNEGO fokusu — +/-1 na ekranie, zapis przyciskiem ✓ obok.
  const [liveGoal, setLiveGoal] = useState<number>(focusState?.goal ?? FOCUS_GOAL_DEFAULT);
  useEffect(() => { if (focusState) setLiveGoal(focusState.goal); }, [focusState?.goal]);

  // Liczba lekcji dla NOWEGO fokusu — niezależny stan, ustawiany razem z
  // tekstem/tematami przy zapisie "Ustaw fokus".
  const [newGoal, setNewGoal] = useState<number>(focusState?.goal ?? FOCUS_GOAL_DEFAULT);

  const [dates, setDates] = useState<number[]>([]);
  useEffect(() => {
    if (!focus) { setDates([]); return; }
    let cancelled = false;
    loadFocusSessionDates(studentId, focus).then(d => { if (!cancelled) setDates(d); }).catch(() => {});
    return () => { cancelled = true; };
  }, [studentId, focus?.topic, focus?.since]);

  const [isBumping, setIsBumping] = useState(false);
  const [isEnding, setIsEnding] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);

  // [C39] Zmiana tematu OBECNEGO fokusu — tylko autor wpisu (reguła coachLog).
  // Data startu zostaje, kropki przeliczą się pod nowy temat. Fokus liczy
  // tylko pierwszy temat, więc wybór jest pojedynczy.
  const canEditTopic = !!focus?.fromCoach && !!focus.goalId && focus.authorId === coachId;
  const [editingTopic, setEditingTopic] = useState(false);
  const [editTopics, setEditTopics] = useState<string[]>([]);
  const [isSavingTopic, setIsSavingTopic] = useState(false);
  const startEditTopic = () => { setEditTopics(focus?.topic ? [focus.topic] : []); setEditingTopic(true); };
  const pickSingleTopic = (next: string[]) => {
    const added = next.filter(x => !editTopics.includes(x));
    setEditTopics(added.length ? [added[added.length - 1]] : next);
  };
  const handleSaveTopic = async () => {
    if (!focus?.goalId) return;
    setIsSavingTopic(true);
    try {
      await updateDoc(doc(db, `users/${studentId}/coachLog`, focus.goalId), { topics: editTopics, editedAt: Date.now() });
      setEditingTopic(false);
      onChange();
    } catch (e) { console.error('Fokus: błąd zmiany tematu', e); }
    setIsSavingTopic(false);
  };

  const [newText, setNewText] = useState('');
  const [newTopics, setNewTopics] = useState<string[]>([]);
  const [isSavingNew, setIsSavingNew] = useState(false);

  // +/- zmienia tylko liczbę na ekranie; zapis dopiero przyciskiem ✓ obok
  // (user 2026-09-18: szukał zapisu, auto-zapis był niejasny).
  const savedGoal = focusState?.goal ?? FOCUS_GOAL_DEFAULT;
  const goalChanged = liveGoal !== savedGoal || !focusState?.dots;
  const handleBumpDelta = (delta: number) => {
    setLiveGoal(g => Math.min(MAX_GOAL, Math.max(MIN_GOAL, g + delta)));
  };

  const handleSaveGoal = async () => {
    const next = liveGoal;
    if (!goalChanged) return;
    setIsBumping(true);
    try {
      await updateDoc(doc(db, 'users', studentId), { focusGoal: next, focusDots: true });
      onChange();
    } catch (e) {
      console.error('Fokus: błąd zmiany liczby lekcji', e);
      setLiveGoal(focusState?.goal ?? next);
    }
    setIsBumping(false);
  };

  const handleEnd = async () => {
    setIsEnding(true);
    try {
      await updateDoc(doc(db, 'users', studentId), { focus: { cleared: true, setAt: Date.now() } });
      onChange();
      onClose();
    } catch (e) { console.error('Fokus: błąd zakończenia', e); }
    setIsEnding(false);
    setConfirmEnd(false);
  };

  const handleSetNew = async () => {
    const cleanText = newText.trim().slice(0, FOCUS_TEXT_MAX);
    if (!cleanText) return;
    setIsSavingNew(true);
    try {
      const cacheKey = `grotX_userName_${coachId}`;
      let authorName = localStorage.getItem(cacheKey) || '';
      if (!authorName) {
        const coachDoc = await getDoc(doc(db, 'users', coachId));
        const d = coachDoc.exists() ? coachDoc.data() : {};
        authorName = `${d.firstName || ''} ${d.lastName || ''}`.trim() || t('coachLog.defaultCoachName', { defaultValue: 'Trainer' });
      }
      await addDoc(collection(db, `users/${studentId}/coachLog`), {
        authorId: coachId,
        authorName,
        text: cleanText,
        type: 'goal',
        topics: newTopics,
        createdAt: serverTimestamp(),
      });
      await updateDoc(doc(db, 'users', studentId), { focusGoal: newGoal, focusDots: true });
      onChange();
      onClose();
    } catch (e) { console.error('Fokus: błąd ustawiania nowego fokusu', e); }
    setIsSavingNew(false);
  };

  const formatDate = (ts: number) =>
    new Date(ts).toLocaleDateString(i18n.language, { day: '2-digit', month: 'short' });

  const alreadyDone = !!focusState?.dots && liveGoal !== savedGoal && liveGoal <= focusState.count;

  return createPortal(
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[500000] flex items-center justify-center p-4 animate-fade-in" onClick={onClose}>
      <div className="bg-white rounded-[32px] p-6 w-full max-w-[400px] shadow-2xl relative max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-5 right-5 p-2 bg-gray-100 rounded-full active:scale-90 transition-all">
          <span className="material-symbols-outlined">close</span>
        </button>

        <div className="flex items-center gap-3 mb-4 mt-2 shrink-0">
          <div className="w-10 h-10 rounded-full bg-[#0a3a2a] flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-[#fed33e]">track_changes</span>
          </div>
          <h2 className="text-xl font-black text-[#0a3a2a] leading-none">{t('studentProfile.focusModalTitle', { defaultValue: 'Fokus ucznia' })}</h2>
        </div>

        <div className="overflow-y-auto flex-1 space-y-3 pr-1 pb-2 hide-scrollbar">
          {focus ? (
            <>
              {/* Wszystko o obecnym fokusie — jedno zielone tło. */}
              <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3 space-y-2.5">
                <div>
                  <p className="text-[8px] font-black uppercase tracking-widest text-emerald-700">
                    {t('studentProfile.focusModalCurrentLabel', { defaultValue: 'Aktualny fokus' })}
                  </p>
                  <p className="text-[13px] font-black text-[#0a3a2a] leading-snug break-words mt-0.5">{focusTitle(focus, t)}</p>
                  {focusState?.dots && (
                    <p className="text-[10px] font-bold text-emerald-700 mt-1">{focusState.count}/{focusState.goal}</p>
                  )}
                </div>

                <div className="pt-1.5 border-t border-emerald-100/80">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-[8px] font-black uppercase tracking-widest text-emerald-700/70">
                      {t('studentProfile.focusModalTopic', { defaultValue: 'Temat' })}
                    </p>
                    {canEditTopic && !editingTopic && (
                      <button onClick={startEditTopic} className="flex items-center gap-0.5 text-[9px] font-black text-emerald-700 active:scale-95 transition-all">
                        <span className="material-symbols-outlined text-[12px]">edit</span>
                        {t('studentProfile.focusModalTopicChange', { defaultValue: 'Zmień' })}
                      </button>
                    )}
                  </div>
                  {!editingTopic ? (
                    focus.topic ? (
                      <span className="inline-block bg-white/70 border border-emerald-100 text-emerald-800 px-2 py-1 rounded-lg text-[10px] font-black">
                        {topicLabel(focus.topic, t)}
                      </span>
                    ) : (
                      <p className="text-[10px] font-bold text-emerald-700/60">
                        {t('studentProfile.focusModalNoTopic', { defaultValue: 'Bez tematu — liczy się każdy trening' })}
                      </p>
                    )
                  ) : (
                    <div className="space-y-2">
                      <TopicPicker selectedTopics={editTopics} onChange={pickSingleTopic} hideCaption />
                      <p className="text-[10px] font-bold text-emerald-700/70 leading-snug">
                        {t('studentProfile.focusModalTopicHint', { defaultValue: 'Data startu zostaje — kropki przeliczą się pod nowy temat.' })}
                      </p>
                      <div className="flex gap-2">
                        <button onClick={() => setEditingTopic(false)} className="flex-1 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest bg-white text-gray-500 border border-gray-200">
                          {t('coachLog.cancel', { defaultValue: 'Abbrechen' })}
                        </button>
                        <button
                          onClick={handleSaveTopic}
                          disabled={isSavingTopic || (editTopics[0] || '') === (focus.topic || '')}
                          className="flex-1 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest bg-emerald-600 text-white disabled:opacity-50"
                        >
                          {isSavingTopic ? t('coachLog.saving') : t('tagebuch.save')}
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <div className="pt-1.5 border-t border-emerald-100/80">
                  <p className="text-[8px] font-black uppercase tracking-widest text-emerald-700/70 mb-1">
                    {t('studentProfile.focusModalDates', { defaultValue: 'Treningi nad tym tematem' })}
                  </p>
                  {dates.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {dates.map(ts => (
                        <span key={ts} className="bg-white/70 border border-emerald-100 text-emerald-800 px-2 py-1 rounded-lg text-[10px] font-bold">
                          {formatDate(ts)}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[10px] font-bold text-emerald-700/60">{t('studentProfile.focusModalNoDates', { defaultValue: 'Jeszcze żadnego' })}</p>
                  )}
                </div>

                <div className="pt-1.5 border-t border-emerald-100/80">
                  <p className="text-[8px] font-black uppercase tracking-widest text-emerald-700/70 mb-1">{t('coachLog.focusGoalLabel', { defaultValue: 'Liczba lekcji do utrwalenia' })}</p>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => handleBumpDelta(-1)}
                      disabled={isBumping || liveGoal <= MIN_GOAL}
                      className="w-8 h-8 rounded-lg bg-white border border-emerald-200 text-emerald-700 flex items-center justify-center disabled:opacity-30 active:scale-90 transition-all"
                    >
                      <span className="material-symbols-outlined text-[16px]">remove</span>
                    </button>
                    <span className="text-[15px] font-black text-[#0a3a2a] min-w-[1.5ch] text-center">{liveGoal}</span>
                    <button
                      onClick={() => handleBumpDelta(1)}
                      disabled={isBumping || liveGoal >= MAX_GOAL}
                      className="w-8 h-8 rounded-lg bg-white border border-emerald-200 text-emerald-700 flex items-center justify-center disabled:opacity-30 active:scale-90 transition-all"
                    >
                      <span className="material-symbols-outlined text-[16px]">add</span>
                    </button>
                    <button
                      onClick={handleSaveGoal}
                      disabled={isBumping || !goalChanged}
                      aria-label={t('tagebuch.save')}
                      title={t('tagebuch.save')}
                      className="w-10 h-8 ml-auto rounded-lg bg-[#fed33e] text-[#0a3a2a] flex items-center justify-center disabled:bg-white disabled:text-emerald-300 disabled:border disabled:border-emerald-100 active:scale-90 transition-all"
                    >
                      <span className="material-symbols-outlined text-[20px]">check</span>
                    </button>
                  </div>
                  {alreadyDone && (
                    <p className="text-[10px] font-bold text-amber-700 mt-1.5 leading-snug">
                      {t('studentProfile.focusModalGoalWarning', { defaultValue: 'Uczeń ma już {{count}} treningów — ten fokus zostanie oznaczony jako ukończony.', count: focusState?.count })}
                    </p>
                  )}
                </div>
              </div>

              {!confirmEnd ? (
                <button
                  onClick={() => setConfirmEnd(true)}
                  className="w-full py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest bg-red-50 text-red-600 border border-red-100 active:scale-95 transition-all"
                >
                  {t('studentProfile.focusModalEnd', { defaultValue: 'Zakończ fokus przed czasem' })}
                </button>
              ) : (
                <div className="bg-red-50 border border-red-100 rounded-xl p-3 space-y-2">
                  <p className="text-[11px] font-bold text-red-700 leading-snug">
                    {t('studentProfile.focusModalEndConfirm', { defaultValue: 'Zakończyć ten fokus? Uczeń zobaczy, że nie ma aktywnego fokusu, dopóki nie ustawisz nowego.' })}
                  </p>
                  <div className="flex gap-2">
                    <button onClick={() => setConfirmEnd(false)} className="flex-1 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest bg-white text-gray-500 border border-gray-200">
                      {t('coachLog.cancel', { defaultValue: 'Abbrechen' })}
                    </button>
                    <button onClick={handleEnd} disabled={isEnding} className="flex-1 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest bg-red-500 text-white disabled:opacity-50">
                      {isEnding ? t('coachLog.saving') : t('studentProfile.focusModalEndConfirmBtn', { defaultValue: 'Tak, zakończ' })}
                    </button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <p className="text-[11px] font-bold text-gray-400">{t('studentProfile.focusNone')}</p>
          )}

          {/* Nowy fokus — zawsze widoczny, tekst -> liczba lekcji -> tematy. */}
          <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 space-y-2.5">
            <p className="text-[8px] font-black uppercase tracking-widest text-blue-700">
              {t('studentProfile.focusModalNewTitle', { defaultValue: 'Nowy fokus' })}
            </p>
            <textarea
              value={newText}
              onChange={e => setNewText(e.target.value.slice(0, FOCUS_TEXT_MAX))}
              maxLength={FOCUS_TEXT_MAX}
              placeholder={t('studentProfile.focusModalNewPlaceholder', { defaultValue: 'Krótko opisz, na czym ma się skupić uczeń…' })}
              className="w-full bg-white border border-gray-200 rounded-lg p-2.5 text-[11px] font-bold text-[#333] outline-none focus:border-blue-500 resize-none h-16"
            />

            <div>
              <p className="text-[8px] font-black uppercase tracking-widest text-blue-700/70 mb-1">{t('coachLog.focusGoalLabel', { defaultValue: 'Liczba lekcji do utrwalenia' })}</p>
              <div className="flex gap-1.5">
                {FOCUS_GOAL_OPTIONS.map(n => (
                  <button
                    key={n}
                    onClick={() => setNewGoal(n)}
                    className={`flex-1 py-1.5 rounded-lg text-[11px] font-black border transition-all ${newGoal === n ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-500 border-gray-200'}`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>

            <TopicPicker selectedTopics={newTopics} onChange={setNewTopics} />

            <button
              onClick={handleSetNew}
              disabled={isSavingNew || !newText.trim()}
              className="w-full py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest bg-blue-600 text-white disabled:opacity-50"
            >
              {isSavingNew ? t('coachLog.saving') : t('studentProfile.focusModalSaveNew', { defaultValue: 'Ustaw fokus' })}
            </button>
          </div>
        </div>
      </div>
    </div>, document.body
  );
}
