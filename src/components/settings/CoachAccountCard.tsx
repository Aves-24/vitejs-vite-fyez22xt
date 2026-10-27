import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { db } from '../../firebase';
import { collection, addDoc, query, where, getDocs, Timestamp, doc, updateDoc, arrayUnion } from 'firebase/firestore';
import { createNotification } from '../../services/notificationService';
import { buildCoachRequestNotification } from '../../utils/notificationTypes';

// Prośba o miejsca trenerskie żyje najdłużej 6 miesięcy (polityka prywatności §2.4).
const COACH_REQUEST_TTL_MS = 183 * 24 * 60 * 60 * 1000;
const ADMIN_UID = 'b55wNdZf17gH5wxziuzG9bkaQKo2';

interface CoachAccountCardProps {
  userId: string;
  userName: string;
  userEmail: string;
  studentsCount: number;
  /** Po wyłączeniu trybu trenera — rodzic wraca do trybu zawodnika. */
  onDisabled?: () => void;
}

/**
 * [TRENER] Konto trenera: prośba o więcej miejsc i wyłączenie trybu.
 * Przeniesione z Ustawień → TRENER do ustawień w panelu trenera (user 2026-10-27).
 */
const CoachAccountCard: React.FC<CoachAccountCardProps> = ({ userId, userName, userEmail, studentsCount, onDisabled }) => {
  const { t } = useTranslation();
  const [desiredStudents, setDesiredStudents] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'alreadySent' | 'error'>('idle');
  const [modeBusy, setModeBusy] = useState(false);
  const [modeError, setModeError] = useState(false);
  // Wyłączenie trybu wymaga trafienia w „0" spośród 8 · 0 · 8 — żeby nie
  // wyłączyć go przypadkowym stuknięciem (decyzja usera).
  const [showDisableConfirm, setShowDisableConfirm] = useState(false);
  const [wrongDigit, setWrongDigit] = useState(false);

  const disableCoachMode = async () => {
    setModeBusy(true);
    setModeError(false);
    try {
      await updateDoc(doc(db, 'users', userId), { isCoach: false });
      setShowDisableConfirm(false);
      onDisabled?.();
    } catch {
      setModeError(true);
    }
    setModeBusy(false);
  };

  // Więcej miejsc niż darmowe — na razie prośba do admina, który nadaje
  // pakiet (coachLimit) w Admin Center. Później tu wejdą płatności.
  const handleSendRequest = async () => {
    const count = parseInt(desiredStudents, 10);
    if (!desiredStudents || isNaN(count) || count < 1) return;

    setStatus('sending');
    try {
      const existing = await getDocs(
        query(collection(db, 'coachRequests'), where('userId', '==', userId), where('status', '==', 'pending'))
      );
      if (!existing.empty) {
        setStatus('alreadySent');
        return;
      }

      const ref = await addDoc(collection(db, 'coachRequests'), {
        userId,
        userName,
        userEmail,
        desiredStudents: count,
        status: 'pending',
        timestamp: Timestamp.now(),
        // [RODO C36] Polityka §2.4: najdłużej 6 miesięcy — kasuje TTL (Blaze).
        expiresAt: Timestamp.fromMillis(Date.now() + COACH_REQUEST_TTL_MS),
      });
      await updateDoc(doc(db, 'users', ADMIN_UID), {
        newCoachRequests: arrayUnion(ref.id),
      });

      // Bell notification for admin — fire-and-forget.
      const { id, payload } = buildCoachRequestNotification({
        requestId: ref.id,
        studentName: userName,
        studentId: userId,
      });
      createNotification(ADMIN_UID, id, payload).catch(() => { /* best effort */ });

      setStatus('sent');
    } catch {
      setStatus('error');
    }
  };

  return (
    <div className="space-y-2">
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-3.5">
        <p className="text-[14px] font-black text-[#0a3a2a]">{t('settings.coach.moreSlotsTitle')}</p>
        <p className="text-[12px] font-bold text-gray-500 leading-snug mt-0.5 mb-3">{t('settings.coach.moreSlotsDesc')}</p>

        {status === 'sent' ? (
          <div className="text-center bg-emerald-50 border border-emerald-100 rounded-xl p-3">
            <p className="text-[12px] font-black text-emerald-700">{t('settings.coach.becomeSent')}</p>
            <p className="text-[11px] font-bold text-emerald-600 mt-0.5">{t('settings.coach.becomeSentDesc')}</p>
          </div>
        ) : status === 'alreadySent' ? (
          <p className="text-[12px] font-bold text-amber-700 bg-amber-50 border border-amber-100 rounded-xl p-3">{t('settings.coach.becomeAlreadySent')}</p>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="1"
                value={desiredStudents}
                onChange={e => setDesiredStudents(e.target.value)}
                placeholder={t('settings.coach.becomeStudentsPlaceholder')}
                aria-label={t('settings.coach.becomeStudentsLabel')}
                className="flex-1 min-w-0 px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold text-[#0a3a2a] focus:outline-none focus:border-emerald-300"
              />
              <button
                onClick={handleSendRequest}
                disabled={status === 'sending' || !desiredStudents}
                className="shrink-0 px-4 py-2.5 bg-[#0a3a2a] text-[#fed33e] rounded-xl font-black text-[12px] active:scale-95 transition-all disabled:opacity-40 flex items-center gap-1"
              >
                <span className="material-symbols-outlined text-[16px]">send</span>
                {status === 'sending' ? t('settings.coach.becomeSending') : t('settings.coach.becomeRequestBtn')}
              </button>
            </div>
            {status === 'error' && <p className="text-[11px] text-red-500 font-bold">{t('settings.coach.becomeError')}</p>}
            <p className="text-[11px] text-gray-400 font-bold leading-snug">{t('settings.coach.becomeRequestPrivacy')}</p>
          </div>
        )}
      </div>

      {/* Wyłączenie tylko bez uczniów — inaczej zostaliby w students[]
          u kogoś, kto nie widzi już panelu trenera. */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-3.5">
        {studentsCount === 0 ? (
          <button
            onClick={() => { setWrongDigit(false); setShowDisableConfirm(true); }}
            disabled={modeBusy}
            className="w-full flex items-center gap-2 text-left text-red-500 active:scale-[0.98] transition-all disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-[20px]">block</span>
            <span className="text-[14px] font-black">{t('settings.coach.disableBtn')}</span>
          </button>
        ) : (
          <p className="flex items-center gap-2 text-[12px] font-bold text-gray-400">
            <span className="material-symbols-outlined text-[18px]">block</span>
            {t('settings.coach.disableBlocked')}
          </p>
        )}
        {modeError && <p className="text-[11px] text-red-500 font-bold mt-2">{t('settings.coach.modeError')}</p>}
      </div>

      {showDisableConfirm && createPortal(
        <div className="fixed inset-0 z-[400000] bg-black/80 backdrop-blur-sm flex items-center justify-center p-6" onClick={() => setShowDisableConfirm(false)}>
          <div className="bg-white rounded-[32px] p-6 w-full max-w-sm text-center shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="w-14 h-14 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="material-symbols-outlined text-red-500 text-2xl">block</span>
            </div>
            <h2 className="text-lg font-black text-[#0a3a2a] mb-2">{t('settings.coach.disableConfirmTitle')}</h2>
            <p className="text-sm font-bold text-gray-500 mb-5">{t('settings.coach.disableConfirmHint')}</p>
            <div className="flex justify-center gap-3 mb-3">
              {['8', '0', '8'].map((digit, i) => (
                <button
                  key={i}
                  disabled={modeBusy}
                  onClick={() => { if (digit !== '0') { setWrongDigit(true); return; } disableCoachMode(); }}
                  className="w-16 h-16 rounded-2xl bg-gray-50 border border-gray-200 text-3xl font-black text-[#0a3a2a] active:scale-90 transition-all disabled:opacity-50"
                >
                  {digit}
                </button>
              ))}
            </div>
            <p className={`text-[10px] font-bold text-red-500 mb-3 h-4 ${wrongDigit ? '' : 'invisible'}`}>{t('settings.coach.disableWrongDigit')}</p>
            <button
              onClick={() => setShowDisableConfirm(false)}
              className="w-full py-3.5 bg-gray-100 text-gray-500 rounded-xl font-black uppercase text-[11px] active:scale-95 transition-all"
            >
              {t('common.cancel')}
            </button>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default CoachAccountCard;
