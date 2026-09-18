import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { collection, doc, getDoc, getDocs, limit, orderBy, query, Timestamp, updateDoc, where } from 'firebase/firestore';
import { db } from '../firebase';
import { buildSnapshot, type SnapSession, type StudentSnapshot } from '../utils/studentSnapshot';
import type { FocusState } from '../utils/focus';
import { FocusDots, FocusProgressText, focusTitle } from './tagebuch/FocusCard';
import { topicLabel } from '../constants/trainingTopics';
import { createNotification } from '../services/notificationService';
import { buildCoachNoteNotification } from '../utils/notificationTypes';

// [KARTA UCZNIA] Wysuwana od dołu karta po tapnięciu ucznia w panelu trenera
// (user 2026-09-18): ile trenuje, jak strzela, fokus, najbliższy start i
// ostatnia notatka ucznia z szybką odpowiedzią. Pełny profil dopiero przyciskiem.
// Dane wczytywane dopiero po otwarciu — lista uczniów nie płaci za to odczytami.

const WINDOW_DAYS = 28;
const COACH_NOTE_MAX = 100;   // jak CoachNoteModule w profilu ucznia

function toMs(v: any): number {
  if (!v) return 0;
  if (typeof v === 'number') return v;
  if (typeof v.toMillis === 'function') return v.toMillis();
  if (typeof v.seconds === 'number') return v.seconds * 1000;
  return 0;
}

interface NextStart { title: string; date: string }

export default function CoachStudentSheet({
  student, coachId, subtitle, focusState, pause, pauseReminder, onEndPause, onKeepPause, onClose, onOpenProfile, onOpenChat,
}: {
  student: any;
  coachId: string;
  subtitle: string;
  focusState?: FocusState;
  /** [PAUZA] Aktywna pauza (od kiedy) albo null. */
  pause: { at: number } | null;
  /** Minął miesiąc pauzy — jedno przypomnienie. */
  pauseReminder: boolean;
  onEndPause: () => void;
  onKeepPause: () => void;
  onClose: () => void;
  onOpenProfile: () => void;
  onOpenChat: () => void;
}) {
  const { t, i18n } = useTranslation();
  const [snap, setSnap] = useState<StudentSnapshot | null>(null);
  const [failed, setFailed] = useState(false);
  const [nextStart, setNextStart] = useState<NextStart | null>(null);
  const [reply, setReply] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);

  useEffect(() => {
    let alive = true;
    const since = Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000;
    getDocs(query(collection(db, `users/${student.id}/sessions`), where('timestamp', '>=', Timestamp.fromMillis(since))))
      .then(qs => {
        if (!alive) return;
        const list: SnapSession[] = qs.docs.map(d => ({ id: d.id, ...(d.data() as any), ts: toMs(d.data().timestamp) }));
        setSnap(buildSnapshot(list, student.pfeilzaehler));
      })
      .catch(e => { console.error('Karta ucznia: błąd odczytu treningów', e); if (alive) setFailed(true); });

    const today = new Date().toISOString().split('T')[0];
    getDocs(query(collection(db, `users/${student.id}/tournaments`), where('date', '>=', today), orderBy('date', 'asc'), limit(5)))
      .then(qs => {
        if (!alive) return;
        const e = qs.docs.map(d => d.data()).find(x => x.category === 'Turniej' || !x.category);
        setNextStart(e ? { title: String(e.title || ''), date: String(e.date) } : null);
      })
      .catch(() => { /* start to dodatek — bez niego karta i tak działa */ });
    return () => { alive = false; };
  }, [student.id]);

  const initials = `${student.firstName?.[0] || ''}${student.lastName?.[0] || ''}`.toUpperCase();
  const name = `${student.firstName || t('coachDashboard.defaultStudentName')} ${student.lastName || ''}`.trim();

  const sendReply = async () => {
    const note = snap?.note;
    const text = reply.trim().slice(0, COACH_NOTE_MAX);
    if (!note || !text) return;
    setSaving(true);
    setSaveError(false);
    try {
      const edits = (note.coachEditCount || 0) + 1;
      await updateDoc(doc(db, `users/${student.id}/sessions`, note.id), {
        coachNote: text,
        coachEditCount: edits,
        coachTopics: note.coachTopics || [],
      });
      setSnap(s => s && s.note ? { ...s, note: { ...s.note, coachNote: text, coachEditCount: edits } } : s);
      setReply('');
      // Dzwonek u ucznia — jak w profilu ucznia, tylko przy pierwszej notatce.
      if (edits === 1) {
        (async () => {
          let coachName: string | undefined;
          try {
            const cSnap = await getDoc(doc(db, 'users', coachId));
            if (cSnap.exists()) {
              const cd = cSnap.data();
              coachName = [cd.firstName, cd.lastName].filter(Boolean).join(' ') || undefined;
            }
          } catch { /* bez nazwiska też wyślemy */ }
          const { id, payload } = buildCoachNoteNotification({ sessionId: note.id, sessionDate: note.date, coachId, coachName });
          createNotification(student.id, id, payload).catch(() => { /* best effort */ });
        })();
      }
    } catch (e) {
      console.error('Karta ucznia: błąd zapisu notatki trenera', e);
      setSaveError(true);
    }
    setSaving(false);
  };

  const fmtDate = (ts: number) => new Date(ts).toLocaleDateString(i18n.language, { day: 'numeric', month: 'short' });
  const delta = (cur: number, prev: number, pct = false) => {
    if (!prev && !cur) return null;
    const d = pct ? (prev ? Math.round(((cur - prev) / prev) * 100) : null) : cur - prev;
    if (d === null || d === 0) return null;
    return <span className={`text-[10px] font-black ${d > 0 ? 'text-emerald-600' : 'text-orange-500'}`}>{d > 0 ? '+' : ''}{d}{pct ? '%' : ''}</span>;
  };
  const daysTo = (iso: string) => Math.round((new Date(iso + 'T00:00:00').getTime() - new Date().setHours(0, 0, 0, 0)) / 864e5);

  const sectionLabel = 'text-[9px] font-black uppercase tracking-widest text-gray-400 mb-1.5';

  return createPortal(
    <div className="fixed inset-0 z-[400000] bg-black/50 flex items-end justify-center animate-fade-in" onClick={onClose}>
      <div
        className="bg-white w-full max-w-md rounded-t-[28px] px-4 pt-3 pb-6 max-h-[88vh] overflow-y-auto hide-scrollbar animate-fade-in-up"
        onClick={e => e.stopPropagation()}
      >
        <button onClick={onClose} className="block mx-auto w-10 h-1.5 rounded-full bg-gray-200 mb-3" aria-label={t('coachSheet.close')} />

        {/* NAGŁÓWEK */}
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 bg-[#fed33e]/20 text-[#8B6508] border border-[#fed33e]/50 rounded-full flex items-center justify-center shrink-0 font-black text-[13px]">
            {initials || <span className="material-symbols-outlined text-[20px]">person</span>}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[16px] font-black text-[#0a3a2a] leading-tight truncate">{name}</p>
            <p className="text-[10px] font-bold text-gray-400 truncate mt-0.5">{subtitle}</p>
          </div>
          <button
            onClick={onOpenChat}
            className="w-10 h-10 shrink-0 rounded-full flex items-center justify-center bg-gray-50 text-gray-500 active:scale-90 transition-all"
            aria-label={t('coachSheet.chat')}
          >
            <span className="material-symbols-outlined text-[20px]">chat</span>
          </button>
        </div>

        {/* [PAUZA] Włącza się w sekcji „bez treningu 14+ dni" (user 2026-09-18);
            tu tylko stan i koniec pauzy. */}
        {pause && (
          <div className={`mt-3 rounded-xl px-3 py-2 border ${pauseReminder ? 'bg-amber-50 border-amber-200' : 'bg-gray-50 border-gray-200'}`}>
            <p className={`text-[11px] font-bold leading-snug ${pauseReminder ? 'text-amber-800' : 'text-gray-600'}`}>
              <span className="material-symbols-outlined text-[14px] align-[-3px] mr-1">pause_circle</span>
              {pauseReminder ? t('coachSheet.pauseReminderText') : t('coachSheet.pausedSince', { date: fmtDate(pause.at) })}
            </p>
            <div className="flex gap-2 mt-2">
              {pauseReminder && (
                <button onClick={onKeepPause} className="flex-1 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest bg-white text-gray-600 border border-gray-200 active:scale-95 transition-all">
                  {t('coachSheet.pauseKeep')}
                </button>
              )}
              <button onClick={onEndPause} className="flex-1 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest bg-[#0a3a2a] text-white active:scale-95 transition-all">
                {t('coachSheet.pauseEnd')}
              </button>
            </div>
          </div>
        )}

        {failed && <p className="text-[11px] font-bold text-red-500 mt-4">{t('coachSheet.loadError')}</p>}
        {!snap && !failed && (
          <div className="py-8 flex justify-center">
            <span className="material-symbols-outlined text-[24px] text-gray-300 animate-spin">progress_activity</span>
          </div>
        )}

        {snap && (
          <>
            {/* 1. OSTATNIE 14 DNI */}
            <div className="mt-4">
              <div className="flex items-center justify-between">
                <p className={sectionLabel}>{t('coachSheet.last14')}</p>
                {/* Legenda tylko kolorów, które faktycznie są na pasku. */}
                <p className="flex items-center gap-2 text-[9px] font-bold text-gray-400 mb-1.5">
                  {snap.days.includes('score') && <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-[#1f6e53]" />{t('coachSheet.legendScore')}</span>}
                  {snap.days.includes('practice') && <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-sky-400" />{t('coachSheet.legendPractice')}</span>}
                </p>
              </div>
              <div className="flex gap-[3px]">
                {snap.days.map((k, i) => (
                  <span
                    key={i}
                    className={`flex-1 h-4 rounded-[3px] flex items-center justify-center text-[8px] font-black text-white ${k === 'score' ? 'bg-[#1f6e53]' : k === 'practice' ? 'bg-sky-400' : 'bg-gray-100'}`}
                  >
                    {snap.dayCounts[i] > 1 ? snap.dayCounts[i] : ''}
                  </span>
                ))}
              </div>
              <div className="flex justify-between text-[8px] font-bold text-gray-400 mt-0.5 mb-2">
                <span>{fmtDate(snap.fromTs)}</span>
                <span>{t('coachSheet.today')}</span>
              </div>
              <p className="text-[9px] font-bold text-gray-400 mb-1">{t('coachSheet.tilesCaption')}</p>
              <div className="grid grid-cols-3 gap-1.5">
                <div className="bg-gray-50 rounded-xl px-2.5 py-1.5">
                  <p className="text-[9px] font-bold text-gray-400">{t('coachSheet.sessions')}</p>
                  <p className="text-[15px] font-black text-[#0a3a2a] leading-tight">{snap.sessions} {delta(snap.sessions, snap.sessionsPrev)}</p>
                </div>
                <div className="bg-gray-50 rounded-xl px-2.5 py-1.5">
                  <p className="text-[9px] font-bold text-gray-400">{t('coachSheet.arrows')}</p>
                  <p className="text-[15px] font-black text-[#0a3a2a] leading-tight">{snap.arrows} {delta(snap.arrows, snap.arrowsPrev, true)}</p>
                </div>
                <div className="bg-gray-50 rounded-xl px-2.5 py-1.5">
                  <p className="text-[9px] font-bold text-gray-400 truncate">{t('coachSheet.avgArrow', { distance: snap.distanceLabel || '' })}</p>
                  <p className="text-[15px] font-black text-[#0a3a2a] leading-tight">
                    {snap.avgArrow !== null ? snap.avgArrow.toFixed(1) : '–'}{' '}
                    {snap.avgArrow !== null && snap.avgArrowPrev !== null && Math.abs(snap.avgArrow - snap.avgArrowPrev) >= 0.05 && (
                      <span className={`text-[10px] font-black ${snap.avgArrow > snap.avgArrowPrev ? 'text-emerald-600' : 'text-orange-500'}`}>
                        {snap.avgArrow > snap.avgArrowPrev ? '+' : ''}{(snap.avgArrow - snap.avgArrowPrev).toFixed(1)}
                      </span>
                    )}
                  </p>
                </div>
              </div>
            </div>

            {/* 2 + 3. WYNIKI I SYGNAŁY — po średniej na strzałę, bo 36 i 72 strzały
                się nie porównują (user 2026-09-18). */}
            {snap.recent.length > 0 && (
              <div className="mt-4">
                <p className={sectionLabel}>{t('coachSheet.results', { distance: snap.distanceLabel || '' })}</p>
                <div className="flex items-center gap-3">
                  <Sparkline values={snap.recent.map(r => r.avg)} />
                  <div className="text-[11px] font-bold text-[#0a3a2a] leading-snug min-w-0">
                    <p>{t('coachSheet.lastAvg', { list: snap.recent.slice(-3).map(r => r.avg.toFixed(1)).join(' · ') })}</p>
                    <p className="text-[10px] text-gray-400">
                      {t('coachSheet.lastScores', { list: snap.recent.slice(-3).map(r => t('coachSheet.scoreOf', { score: r.score, arrows: r.arrows })).join(' · ') })}
                    </p>
                    {snap.goldOf > 0 && (
                      <p>
                        {t('coachSheet.gold', { count: snap.gold, of: snap.goldOf })}
                        {' · '}
                        <span className={snap.misses > 0 ? 'text-red-600' : ''}>{t('coachSheet.misses', { count: snap.misses })}</span>
                      </p>
                    )}
                  </div>
                </div>
                <div className="mt-2 space-y-1">
                  {snap.roundDiff !== null && Math.abs(snap.roundDiff) >= 5 && (
                    <Signal warn={snap.roundDiff < 0}>
                      {snap.roundDiff < 0
                        ? t('coachSheet.round2Weaker', { count: Math.abs(snap.roundDiff) })
                        : t('coachSheet.round2Stronger', { count: snap.roundDiff })}
                      {' '}{t('coachSheet.fromLast', { count: snap.roundN })}
                    </Signal>
                  )}
                  {snap.endRange && (
                    <Signal warn={snap.endRange[1] - snap.endRange[0] >= 12}>
                      {t('coachSheet.endRange', { min: snap.endRange[0], max: snap.endRange[1] })}
                    </Signal>
                  )}
                </div>
              </div>
            )}
            {snap.sessions === 0 && snap.recent.length === 0 && (
              <p className="text-[11px] font-bold text-gray-400 mt-4">{t('coachSheet.noData')}</p>
            )}
          </>
        )}

        {/* 4. FOKUS — z nagłówkiem jak reszta sekcji, prostokątny kafel (user
            2026-09-18: pigułka tu nie pasowała). */}
        {focusState?.focus && (
          <div className="mt-4">
            <p className={sectionLabel}>{t('tagebuch.focusLabel')}</p>
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 flex items-start gap-2">
              <span className="material-symbols-outlined text-[18px] text-amber-600 shrink-0 mt-px">track_changes</span>
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-black text-[#0a3a2a] leading-snug break-words">{focusTitle(focusState.focus, t)}</p>
                {focusState.focus.text && focusState.focus.topic && (
                  <p className="text-[10px] font-bold text-amber-700">{topicLabel(focusState.focus.topic, t)}</p>
                )}
                {focusState.dots && (
                  <div className="flex items-center gap-2 mt-1">
                    <FocusDots count={focusState.count} goal={focusState.goal} small light />
                    <FocusProgressText count={focusState.count} goal={focusState.goal} light />
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* 5. NAJBLIŻSZY START */}
        {nextStart && (
          <div className="mt-3 flex items-center gap-2 text-[11px] font-bold text-[#0a3a2a]">
            <span className="material-symbols-outlined text-[18px] text-[#1f6e53]">emoji_events</span>
            <span className="truncate">{nextStart.title}</span>
            <span className="text-gray-400 shrink-0">
              · {daysTo(nextStart.date) <= 0 ? t('coachSheet.today') : daysTo(nextStart.date) === 1 ? t('coachSheet.tomorrow') : t('coachSheet.inDays', { count: daysTo(nextStart.date) })}
            </span>
          </div>
        )}

        {/* 6. UCZEŃ NAPISAŁ + ODPOWIEDŹ JAKO NOTATKA TRENERA PRZY TYM TRENINGU */}
        {snap?.note && (
          <div className="mt-4">
            <p className={sectionLabel}>{t('coachSheet.studentWrote', { date: fmtDate(snap.note.ts) })}</p>
            <div className="bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2 text-[12px] font-bold text-[#0a3a2a] leading-snug break-words">
              „{snap.note.note}”
            </div>
            {snap.note.coachNote ? (
              <div className="mt-1.5 bg-blue-50 border border-blue-100 rounded-xl px-3 py-2">
                <p className="text-[9px] font-black uppercase tracking-widest text-blue-700">{t('coachSheet.yourReply')}</p>
                <p className="text-[12px] font-bold text-[#0a3a2a] leading-snug break-words">{snap.note.coachNote}</p>
              </div>
            ) : (
              <>
                <div className="flex gap-1.5 mt-1.5">
                  <input
                    value={reply}
                    onChange={e => setReply(e.target.value.slice(0, COACH_NOTE_MAX))}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); sendReply(); } }}
                    maxLength={COACH_NOTE_MAX}
                    placeholder={t('coachSheet.replyPlaceholder')}
                    className="flex-1 min-w-0 bg-white border border-gray-200 rounded-xl px-3 py-2 text-[12px] font-bold text-[#0a3a2a] outline-none focus:border-blue-400"
                  />
                  <button
                    onClick={sendReply}
                    disabled={saving || !reply.trim()}
                    className="w-10 shrink-0 rounded-xl bg-[#1f6e53] text-white flex items-center justify-center disabled:opacity-40 active:scale-90 transition-all"
                    aria-label={t('coachSheet.send')}
                  >
                    <span className="material-symbols-outlined text-[18px]">send</span>
                  </button>
                </div>
                <p className="text-[9px] font-bold text-gray-400 mt-1">{t('coachSheet.replyHint')}</p>
                {saveError && <p className="text-[10px] font-bold text-red-500 mt-1">{t('coachSheet.saveError')}</p>}
              </>
            )}
          </div>
        )}

        {/* 7. PEŁNY PROFIL */}
        <button
          onClick={onOpenProfile}
          className="mt-5 w-full py-3 rounded-2xl bg-[#0a3a2a] text-white text-[11px] font-black uppercase tracking-widest flex items-center justify-center gap-1 active:scale-[0.98] transition-all"
        >
          {t('coachSheet.fullProfile')}
          <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
        </button>
      </div>
    </div>,
    document.body,
  );
}

function Signal({ warn, children }: { warn: boolean; children: React.ReactNode }) {
  return (
    <p className={`flex items-center gap-1.5 text-[11px] font-bold ${warn ? 'text-orange-600' : 'text-gray-500'}`}>
      <span className="material-symbols-outlined text-[14px]">{warn ? 'warning' : 'info'}</span>
      {children}
    </p>
  );
}

function Sparkline({ values }: { values: number[] }) {
  const w = 120, h = 34, pad = 4;
  if (values.length < 2) {
    return <div className="w-[120px] h-[34px] flex items-center justify-center text-[15px] font-black text-[#0a3a2a]">{values[0]}</div>;
  }
  const min = Math.min(...values), max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => [
    pad + (i * (w - 2 * pad)) / (values.length - 1),
    h - pad - ((v - min) / span) * (h - 2 * pad),
  ]);
  const last = pts[pts.length - 1];
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="shrink-0" aria-hidden="true">
      <polyline points={pts.map(p => p.join(',')).join(' ')} fill="none" stroke="#1f6e53" strokeWidth="2" strokeLinejoin="round" />
      <circle cx={last[0]} cy={last[1]} r="3" fill="#fed33e" />
    </svg>
  );
}
