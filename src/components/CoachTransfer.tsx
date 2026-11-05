import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { getPublicProfile } from '../utils/publicProfile';
import { privacyPolicyUrl } from '../utils/legalLinks';
import {
  acceptTransferAsCoach, acceptTransferAsStudent, cancelTransfer, startTransfer,
  subscribeIncomingTransfers, subscribeOutgoingTransfers, subscribeStudentTransfers,
  TRANSFER_NOTE_MAX, type CoachTransfer,
} from '../utils/coachTransfers';

// [PRZEKAZANIE UCZNIA 2026-11-05] Interfejs trzech stron przekazania —
// logika i kolejność zapisów: utils/coachTransfers.ts.

const card = 'rounded-2xl border px-3 py-3';

/** Podgląd ucznia u NOWEGO trenera: notatka od poprzednika (po zakończonym przekazaniu). */
export function TransferReceivedNote({ coachId, studentId }: { coachId: string; studentId: string }) {
  const { t, i18n } = useTranslation();
  const [incoming, setIncoming] = useState<CoachTransfer[]>([]);
  useEffect(() => subscribeIncomingTransfers(coachId, setIncoming), [coachId]);
  const received = incoming.find(x => x.studentId === studentId && x.status === 'done');
  if (!received) return null;
  return (
    <div className={`${card} mt-2 bg-sky-50 border-sky-100`} data-testid="transfer-received">
      <p className="text-[10px] font-black uppercase tracking-widest text-sky-700">
        {t('coachTransfer.receivedFrom', { name: received.fromName, date: new Date(received.createdAt).toLocaleDateString(i18n.language) })}
      </p>
      {received.note && <p className="text-[12px] font-medium text-[#0a3a2a] mt-1 whitespace-pre-wrap">{received.note}</p>}
    </div>
  );
}

/**
 * Einst. trenera → Schülerliste: ikonka „Schüler übergeben” przy uczniu
 * (user 2026-11-05: tam, nie w podglądzie). Trwające przekazanie = klepsydra;
 * klik pokazuje stan i „Zurückziehen”.
 */
export function TransferStudentAction({ coachId, student }: { coachId: string; student: { id: string; firstName?: string; lastName?: string; nickname?: string } }) {
  const { t } = useTranslation();
  const [outgoing, setOutgoing] = useState<CoachTransfer[]>([]);
  const [open, setOpen] = useState(false);
  const [toId, setToId] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => subscribeOutgoingTransfers(coachId, setOutgoing), [coachId]);

  const studentName = `${student.firstName || ''} ${student.lastName || ''}`.trim() || student.nickname || '';
  const pending = outgoing.find(x => x.studentId === student.id && x.status !== 'done');

  const send = async () => {
    const id = toId.trim();
    if (!id) return;
    setError('');
    if (id === coachId) { setError(t('coachTransfer.errSelf')); return; }
    setBusy(true);
    try {
      const [to, me] = await Promise.all([getPublicProfile(id), getPublicProfile(coachId)]);
      if (!to) { setError(t('coachTransfer.errNotFound')); setBusy(false); return; }
      await startTransfer({
        fromCoachId: coachId, fromName: me?.displayName || '',
        toCoachId: id, toName: to.displayName || '',
        studentId: student.id, studentName, note,
      });
      setToId(''); setNote('');
    } catch (e) {
      // Reguła: konto bez trybu trenera albo już trener tego ucznia.
      console.error('Przekazanie: wniosek odrzucony', e);
      setError(t('coachTransfer.errNotCoach'));
    }
    setBusy(false);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => { setError(''); setOpen(true); }}
        aria-label={t('coachTransfer.start')}
        title={t('coachTransfer.start')}
        className={`w-10 h-10 shrink-0 rounded-full flex items-center justify-center active:scale-90 transition-all ${pending ? 'text-amber-600' : 'text-[#0a3a2a]'}`}
      >
        <span className="material-symbols-outlined text-[20px]">{pending ? 'hourglass_top' : 'swap_horiz'}</span>
      </button>

      {open && createPortal(
        <div className="fixed inset-0 z-[600000] bg-black/70 flex items-center justify-center p-4" onClick={() => setOpen(false)}>
          <div role="dialog" aria-label={t('coachTransfer.start')} className="bg-white rounded-[28px] p-5 w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <h2 className="text-[16px] font-black text-[#0a3a2a]">{t('coachTransfer.start')} · {studentName}</h2>
            {pending ? (
              <>
                <p className="text-[12px] font-bold text-amber-800 mt-3" data-testid="transfer-pending">
                  {t('coachTransfer.pendingTo', { name: pending.toName })} · {pending.status === 'pending_coach' ? t('coachTransfer.waitCoach', { name: pending.toName }) : t('coachTransfer.waitStudent', { name: studentName })}
                </p>
                <div className="flex gap-2 mt-4">
                  <button onClick={() => setOpen(false)} className="flex-1 py-3 rounded-xl bg-gray-100 text-gray-500 text-[11px] font-black uppercase">{t('coachTransfer.cancel')}</button>
                  <button onClick={() => cancelTransfer(pending)} className="flex-1 py-3 rounded-xl bg-amber-100 text-amber-800 text-[11px] font-black uppercase">{t('coachTransfer.withdraw')}</button>
                </div>
              </>
            ) : (
              <>
                <p className="text-[12px] font-medium text-gray-500 leading-snug mt-2">{t('coachTransfer.startInfo', { name: studentName })}</p>
                <input
                  value={toId}
                  onChange={e => setToId(e.target.value)}
                  placeholder={t('coachTransfer.toIdPlaceholder')}
                  className="mt-3 w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-[12px] font-bold outline-none focus:border-[#0a3a2a]"
                />
                <textarea
                  value={note}
                  onChange={e => setNote(e.target.value.slice(0, TRANSFER_NOTE_MAX))}
                  placeholder={t('coachTransfer.notePlaceholder')}
                  rows={3}
                  className="mt-2 w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-[12px] font-medium outline-none focus:border-[#0a3a2a] resize-none"
                />
                <p className="text-[10px] font-bold text-gray-400 text-right">{note.length}/{TRANSFER_NOTE_MAX}</p>
                {error && <p className="text-[11px] font-bold text-red-500 mt-1">{error}</p>}
                <div className="flex gap-2 mt-3">
                  <button onClick={() => setOpen(false)} className="flex-1 py-3 rounded-xl bg-gray-100 text-gray-500 text-[11px] font-black uppercase">{t('coachTransfer.cancel')}</button>
                  <button onClick={send} disabled={!toId.trim() || busy} className="flex-1 py-3 rounded-xl bg-[#0a3a2a] text-[#fed33e] text-[11px] font-black uppercase disabled:opacity-40">{t('coachTransfer.send')}</button>
                </div>
              </>
            )}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

/** Panel trenera: przychodzące przekazania (przyjęcie / odrzucenie). */
export function IncomingTransfersCard({ coachId, freeSlots }: { coachId: string; freeSlots: number }) {
  const { t } = useTranslation();
  const [list, setList] = useState<CoachTransfer[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  useEffect(() => subscribeIncomingTransfers(coachId, setList), [coachId]);
  const open = list.filter(x => x.status !== 'done');
  if (open.length === 0) return null;

  const run = async (id: string, fn: () => Promise<void>) => {
    setBusyId(id);
    try { await fn(); } catch (e) { console.error('Przekazanie:', e); }
    setBusyId(null);
  };

  return (
    <div className="space-y-2 mb-4">
      {open.map(x => (
        <div key={x.id} className={`${card} bg-sky-50 border-sky-100`} data-testid="transfer-incoming">
          <p className="text-[12px] font-black text-[#0a3a2a]">{t('coachTransfer.incoming', { from: x.fromName, student: x.studentName })}</p>
          {x.note && <p className="text-[12px] font-medium text-gray-600 mt-1 whitespace-pre-wrap">„{x.note}”</p>}
          {x.status === 'pending_student' ? (
            <p className="text-[11px] font-bold text-sky-700 mt-2">{t('coachTransfer.waitStudent', { name: x.studentName })}</p>
          ) : (
            <>
              {freeSlots <= 0 && <p className="text-[11px] font-bold text-amber-700 mt-2">{t('coachTransfer.noSlot')}</p>}
              <div className="flex gap-2 mt-2">
                <button disabled={busyId === x.id} onClick={() => run(x.id, () => cancelTransfer(x))} className="flex-1 py-2 rounded-xl bg-white border border-gray-200 text-gray-500 text-[10px] font-black uppercase">{t('coachTransfer.decline')}</button>
                <button disabled={busyId === x.id || freeSlots <= 0} onClick={() => run(x.id, () => acceptTransferAsCoach(x))} className="flex-1 py-2 rounded-xl bg-[#0a3a2a] text-[#fed33e] text-[10px] font-black uppercase disabled:opacity-40">{t('coachTransfer.accept')}</button>
              </div>
            </>
          )}
        </div>
      ))}
    </div>
  );
}

/** Uczeń: świadoma zgoda na zmianę trenera (RODO art. 6 ust. 1 lit. a, art. 7). */
export function StudentTransferPopup({ userId }: { userId: string }) {
  const { t, i18n } = useTranslation();
  const [list, setList] = useState<CoachTransfer[]>([]);
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  useEffect(() => (userId ? subscribeStudentTransfers(userId, setList) : undefined), [userId]);
  const x = list.find(tr => tr.status === 'pending_student');
  useEffect(() => { setAgreed(false); setError(false); }, [x?.id]);
  if (!x) return null;

  const decide = async (yes: boolean) => {
    setBusy(true); setError(false);
    try { await (yes ? acceptTransferAsStudent(x) : cancelTransfer(x)); }
    catch (e) { console.error('Przekazanie: zgoda nieudana', e); setError(true); }
    setBusy(false);
  };

  return createPortal(
    <div className="fixed inset-0 z-[650000] bg-black/70 flex items-center justify-center p-4">
      <div role="dialog" aria-label={t('coachTransfer.consentTitle')} className="bg-white rounded-[28px] p-5 w-full max-w-sm max-h-[90vh] overflow-y-auto">
        <span className="material-symbols-outlined text-[32px] text-sky-600">swap_horiz</span>
        <h2 className="text-[18px] font-black text-[#0a3a2a] mt-1">{t('coachTransfer.consentTitle')}</h2>
        <p className="text-[13px] font-bold text-gray-600 mt-1">{t('coachTransfer.consentLead', { from: x.fromName, to: x.toName })}</p>
        <div className="mt-3 rounded-2xl bg-gray-50 border border-gray-100 p-3 space-y-1.5">
          <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">{t('coachTransfer.consentWhat')}</p>
          {(['consentNew', 'consentOld', 'consentPrivate', 'consentRevoke'] as const).map(k => (
            <p key={k} className="text-[12px] font-medium text-[#0a3a2a] leading-snug">• {t(`coachTransfer.${k}`, { from: x.fromName, to: x.toName })}</p>
          ))}
        </div>
        {x.note && (
          <div className="mt-2 rounded-2xl bg-sky-50 border border-sky-100 p-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-sky-700">{t('coachTransfer.consentNote', { from: x.fromName, to: x.toName })}</p>
            <p className="text-[12px] font-medium text-[#0a3a2a] mt-1 whitespace-pre-wrap">{x.note}</p>
          </div>
        )}
        <p className="text-[11px] font-bold text-gray-400 mt-2">{t('coachTransfer.consentMinor')}</p>
        <label className="flex items-start gap-2 mt-3 cursor-pointer">
          <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} className="mt-0.5 w-4 h-4 accent-[#0a3a2a] shrink-0" />
          <span className="text-[11px] font-bold text-gray-600 leading-snug">
            {t('coachTransfer.consentCheck')}{' '}
            <a href={privacyPolicyUrl(i18n.language)} target="_blank" rel="noopener noreferrer" className="text-emerald-600 underline">{t('coachTransfer.consentPolicy')} ↗</a>
          </span>
        </label>
        {error && <p className="text-[11px] font-bold text-red-500 mt-2">{t('coachTransfer.consentError')}</p>}
        <div className="flex gap-2 mt-4">
          <button disabled={busy} onClick={() => decide(false)} className="flex-1 py-3 rounded-xl bg-gray-100 text-gray-500 text-[11px] font-black uppercase">{t('coachTransfer.decline')}</button>
          <button disabled={busy || !agreed} onClick={() => decide(true)} className="flex-1 py-3 rounded-xl bg-[#0a3a2a] text-[#fed33e] text-[11px] font-black uppercase disabled:opacity-40">{t('coachTransfer.consentYes')}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
