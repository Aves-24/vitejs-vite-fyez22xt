import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import TopicPicker from '../TopicPicker';
import { focusTitle, FocusDots, FocusProgressText } from './FocusCard';
import { FOCUS_GOAL_OPTIONS, FOCUS_GOAL_DEFAULT, FOCUS_TEXT_MAX, loadFocusSessionDates, type ActiveFocus } from '../../utils/focus';

// 0 = kropki wyłączone; stepper przechodzi 0 → 2 → 3 → 4 → 5.
const GOAL_STEPS = [0, ...FOCUS_GOAL_OPTIONS];

// Fokus ucznia w dzienniku — ten sam układ co panel trenera (CoachFocusModal,
// user 2026-09-18: „tam jest to dobrze rozłożone"). Zielone = OBECNY fokus
// (postęp, daty, liczba lekcji +/- z auto-zapisem, zakończenie), niebieskie =
// NOWY fokus, zawsze widoczny: tekst -> liczba lekcji -> temat. Wcześniej jeden
// edytor robił oba naraz i nowy fokus wymagał najpierw „Zakończ".
export default function FocusModal({ userId, focus, dots, goal, count, onSetGoal, onSetNew, onEnd, onClose }: {
  userId: string;
  focus: ActiveFocus | null;
  dots: boolean;
  goal: number;
  count: number;
  onSetGoal: (dots: boolean, goal: number) => Promise<void>;
  onSetNew: (topic: string, text: string, dots: boolean, goal: number) => Promise<void>;
  onEnd: () => Promise<void>;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();

  const [liveStep, setLiveStep] = useState(dots ? goal : 0);
  const [isBumping, setIsBumping] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [isEnding, setIsEnding] = useState(false);

  const [newText, setNewText] = useState('');
  const [newTopic, setNewTopic] = useState('');
  const [newStep, setNewStep] = useState(dots ? goal : FOCUS_GOAL_DEFAULT);
  const [isSavingNew, setIsSavingNew] = useState(false);
  const [error, setError] = useState(false);

  const [dates, setDates] = useState<number[]>([]);
  useEffect(() => {
    if (!focus?.topic) { setDates([]); return; }
    let cancelled = false;
    loadFocusSessionDates(userId, focus).then(d => { if (!cancelled) setDates(d); }).catch(() => {});
    return () => { cancelled = true; };
  }, [userId, focus?.topic, focus?.since]);

  const liveDots = liveStep > 0;
  const hasTopic = !!focus?.topic;
  const goalReached = hasTopic && dots && count >= goal;
  const alreadyDone = hasTopic && liveDots && liveStep !== goal && count >= liveStep;
  const endTopicLabel = focus ? focusTitle(focus, t) : '';

  const handleStep = async (delta: number) => {
    const idx = GOAL_STEPS.indexOf(liveStep as typeof GOAL_STEPS[number]);
    const next = GOAL_STEPS[Math.min(GOAL_STEPS.length - 1, Math.max(0, idx + delta))];
    if (next === liveStep) return;
    const prev = liveStep;
    setLiveStep(next);
    setIsBumping(true);
    setError(false);
    try {
      await onSetGoal(next > 0, next > 0 ? next : goal);
    } catch (e) {
      console.error('Tagebuch: błąd zmiany liczby lekcji', e);
      setLiveStep(prev);
      setError(true);
    }
    setIsBumping(false);
  };

  const handleEnd = async () => {
    setIsEnding(true);
    setError(false);
    try {
      await onEnd();
      onClose();
    } catch (e) {
      console.error('Tagebuch: błąd zakończenia fokusu', e);
      setError(true);
      setIsEnding(false);
    }
  };

  const handleSetNew = async () => {
    const cleanText = newText.trim().slice(0, FOCUS_TEXT_MAX);
    if (!newTopic && !cleanText) return;
    setIsSavingNew(true);
    setError(false);
    try {
      await onSetNew(newTopic, cleanText, newStep > 0, newStep > 0 ? newStep : goal);
      onClose();
    } catch (e) {
      console.error('Tagebuch: błąd ustawiania nowego fokusu', e);
      setError(true);
      setIsSavingNew(false);
    }
  };

  const formatDate = (ts: number) =>
    new Date(ts).toLocaleDateString(i18n.language, { day: '2-digit', month: 'short' });

  const stepLabel = (n: number) => (n === 0 ? t('tagebuch.focusDotsOff') : String(n));

  return createPortal(
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[500000] flex items-center justify-center p-4 animate-fade-in" onClick={onClose}>
      <div className="bg-white rounded-[32px] p-6 w-full max-w-[400px] shadow-2xl relative max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <button onClick={onClose} aria-label={t('tagebuch.cancel')} className="absolute top-5 right-5 p-2 bg-gray-100 rounded-full active:scale-90 transition-all">
          <span className="material-symbols-outlined">close</span>
        </button>

        <div className="flex items-center gap-3 mb-4 mt-2 shrink-0">
          <div className="w-10 h-10 rounded-full bg-[#0a3a2a] flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-[#fed33e]">track_changes</span>
          </div>
          <h2 className="text-xl font-black text-[#0a3a2a] leading-none">{t('tagebuch.focusLabel')}</h2>
        </div>

        <div className="overflow-y-auto flex-1 space-y-3 pr-1 pb-2 hide-scrollbar">
          {focus && (
            <>
              {/* Wszystko o obecnym fokusie — jedno zielone tło. */}
              <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3 space-y-2.5">
                <div>
                  <p className="text-[8px] font-black uppercase tracking-widest text-emerald-700">
                    {t('studentProfile.focusModalCurrentLabel')}
                    {focus.fromCoach && ` · ${t('tagebuch.focusFromCoach')}${focus.authorName ? ` ${focus.authorName}` : ''}`}
                  </p>
                  <p className="text-[13px] font-black text-[#0a3a2a] leading-snug break-words mt-0.5">{focusTitle(focus, t)}</p>
                  {focus.text && focus.topic && (
                    <p className="text-[10px] font-bold text-emerald-700/70 mt-0.5">{t(`sessionSetup.topic_${focus.topic}`)}</p>
                  )}
                  {hasTopic && dots && (
                    <div className="flex items-center gap-2 mt-1.5 bg-[#0a3a2a] rounded-lg px-2 py-1 w-fit">
                      <FocusDots count={count} goal={goal} small />
                      <FocusProgressText count={count} goal={goal} />
                    </div>
                  )}
                </div>

                {hasTopic && (
                  <div className="pt-1.5 border-t border-emerald-100/80">
                    <p className="text-[8px] font-black uppercase tracking-widest text-emerald-700/70 mb-1">{t('studentProfile.focusModalDates')}</p>
                    {dates.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {dates.map(ts => (
                          <span key={ts} className="bg-white/70 border border-emerald-100 text-emerald-800 px-2 py-1 rounded-lg text-[10px] font-bold">
                            {formatDate(ts)}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="text-[10px] font-bold text-emerald-700/60">{t('studentProfile.focusModalNoDates')}</p>
                    )}
                  </div>
                )}

                {hasTopic && (
                  <div className="pt-1.5 border-t border-emerald-100/80">
                    <p className="text-[8px] font-black uppercase tracking-widest text-emerald-700/70 mb-1">{t('coachLog.focusGoalLabel')}</p>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => handleStep(-1)}
                        disabled={isBumping || liveStep === GOAL_STEPS[0]}
                        aria-label="-1"
                        className="w-8 h-8 rounded-lg bg-white border border-emerald-200 text-emerald-700 flex items-center justify-center disabled:opacity-30 active:scale-90 transition-all"
                      >
                        <span className="material-symbols-outlined text-[16px]">remove</span>
                      </button>
                      <span className="text-[15px] font-black text-[#0a3a2a] min-w-[3ch] text-center">{stepLabel(liveStep)}</span>
                      <button
                        onClick={() => handleStep(1)}
                        disabled={isBumping || liveStep === GOAL_STEPS[GOAL_STEPS.length - 1]}
                        aria-label="+1"
                        className="w-8 h-8 rounded-lg bg-white border border-emerald-200 text-emerald-700 flex items-center justify-center disabled:opacity-30 active:scale-90 transition-all"
                      >
                        <span className="material-symbols-outlined text-[16px]">add</span>
                      </button>
                    </div>
                    {alreadyDone && (
                      <p className="text-[10px] font-bold text-amber-700 mt-1.5 leading-snug">{t('tagebuch.focusGoalWarning', { count })}</p>
                    )}
                  </div>
                )}
              </div>

              {/* Zakończenie — najpierw potwierdzenie, przy komplecie kropek gratulacje. */}
              {!confirmEnd ? (
                <button
                  onClick={() => setConfirmEnd(true)}
                  className={`w-full py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest active:scale-95 transition-all ${
                    goalReached ? 'bg-[#fed33e] text-[#0a3a2a]' : 'bg-red-50 text-red-600 border border-red-100'
                  }`}
                >
                  {goalReached ? t('tagebuch.focusComplete') : t('tagebuch.focusEnd')}
                </button>
              ) : goalReached ? (
                <div className="bg-[#0a3a2a] rounded-xl px-3 py-3 text-center">
                  <span className="material-symbols-outlined text-[34px] text-[#fed33e]">emoji_events</span>
                  <p className="text-[15px] font-black text-white leading-tight">{t('tagebuch.focusCongrats')}</p>
                  <p className="text-[11px] font-bold text-white/80 leading-snug mt-1">
                    {t('tagebuch.focusCongratsText', { goal, topic: endTopicLabel })}
                  </p>
                  <div className="flex justify-center mt-2">
                    <FocusDots count={count} goal={goal} />
                  </div>
                  <div className="flex items-center gap-2 mt-3">
                    <button onClick={() => setConfirmEnd(false)} className="flex-1 py-2.5 bg-white/10 text-white/80 rounded-xl font-black text-[10px] uppercase tracking-widest active:scale-95 transition-all">
                      {t('tagebuch.focusBack')}
                    </button>
                    <button onClick={handleEnd} disabled={isEnding} className="flex-1 py-2.5 bg-[#fed33e] text-[#0a3a2a] rounded-xl font-black text-[10px] uppercase tracking-widest active:scale-95 transition-all disabled:opacity-40">
                      {t('tagebuch.focusComplete')}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="bg-red-50 border border-red-100 rounded-xl p-3 space-y-2">
                  <p className="text-[11px] font-black text-red-700 leading-snug">{t('tagebuch.focusEndConfirm', { topic: endTopicLabel })}</p>
                  <p className="text-[10px] font-bold text-red-700/70 leading-snug">{t('tagebuch.focusEndConfirmHint')}</p>
                  <div className="flex gap-2">
                    <button onClick={() => setConfirmEnd(false)} className="flex-1 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest bg-white text-gray-500 border border-gray-200">
                      {t('tagebuch.focusBack')}
                    </button>
                    <button onClick={handleEnd} disabled={isEnding} className="flex-1 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest bg-red-500 text-white disabled:opacity-50">
                      {t('tagebuch.focusEndYes')}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Nowy fokus — zawsze widoczny, tekst -> liczba lekcji -> temat. */}
          <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 space-y-2.5">
            <p className="text-[8px] font-black uppercase tracking-widest text-blue-700">{t('studentProfile.focusModalNewTitle')}</p>
            <textarea
              value={newText}
              onChange={e => setNewText(e.target.value.slice(0, FOCUS_TEXT_MAX))}
              maxLength={FOCUS_TEXT_MAX}
              placeholder={t('tagebuch.focusNewPlaceholder')}
              className="w-full bg-white border border-gray-200 rounded-lg p-2.5 text-[11px] font-bold text-[#333] outline-none focus:border-blue-500 resize-none h-16"
            />

            <div>
              <p className="text-[8px] font-black uppercase tracking-widest text-blue-700/70 mb-1">{t('coachLog.focusGoalLabel')}</p>
              <div className="flex gap-1.5" role="radiogroup" aria-label={t('coachLog.focusGoalLabel')}>
                {GOAL_STEPS.map(n => (
                  <button
                    key={n}
                    role="radio"
                    aria-checked={newStep === n}
                    onClick={() => setNewStep(n)}
                    className={`flex-1 py-1.5 rounded-lg text-[11px] font-black border transition-all ${newStep === n ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-500 border-gray-200'}`}
                  >
                    {stepLabel(n)}
                  </button>
                ))}
              </div>
              <p className="text-[10px] font-bold text-blue-700/60 leading-snug mt-1.5">{t('tagebuch.focusDotsHint')}</p>
            </div>

            {/* Fokus to JEDEN temat — nowo kliknięty zastępuje poprzedni. */}
            <TopicPicker
              selectedTopics={newTopic ? [newTopic] : []}
              onChange={next => setNewTopic(next.filter(x => x !== newTopic)[0] ?? '')}
            />

            {error && <p className="text-[10px] font-bold text-red-600">{t('tagebuch.focusSaveError')}</p>}

            <button
              onClick={handleSetNew}
              disabled={isSavingNew || (!newTopic && !newText.trim())}
              className="w-full py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest bg-blue-600 text-white disabled:opacity-50"
            >
              {t('studentProfile.focusModalSaveNew')}
            </button>
          </div>
        </div>
      </div>
    </div>, document.body
  );
}
