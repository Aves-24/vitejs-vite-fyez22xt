import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { db, auth } from '../../firebase';
import { collection, addDoc, query, where, getDocs, Timestamp, doc, updateDoc, arrayUnion } from 'firebase/firestore';
import { createNotification } from '../../services/notificationService';
import { buildCoachRequestNotification } from '../../utils/notificationTypes';
import { FREE_COACH_SLOTS } from '../../utils/coachAccess';

const ADMIN_UID = 'b55wNdZf17gH5wxziuzG9bkaQKo2';

interface CoachSectionProps {
  isCoach: boolean;
  studentsCount: number;
  coachLimit: number;
  myCoachesData: any[];
  onShowQR: () => void;
  onRevokeCoach: (coachId: string) => void;
  /** [TRENER] Po zapisaniu `isCoach` — rodzic przelicza miejsca. */
  onCoachModeChange?: (enabled: boolean) => void;
  onNavigate?: (view: string) => void;
  userId: string;
  userName: string;
  userEmail: string;
}

const CoachSection: React.FC<CoachSectionProps> = ({
  isCoach,
  studentsCount,
  coachLimit,
  myCoachesData,
  onShowQR,
  onRevokeCoach,
  onCoachModeChange,
  onNavigate,
  userId,
  userName,
  userEmail,
}) => {
  const { t } = useTranslation();
  const [desiredStudents, setDesiredStudents] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'alreadySent' | 'error'>('idle');
  const [modeBusy, setModeBusy] = useState(false);
  const [modeError, setModeError] = useState(false);
  // Wyłączenie trybu wymaga trafienia w „0" spośród 8 · 0 · 8 — żeby nie
  // wyłączyć go przypadkowym stuknięciem (decyzja usera).
  const [showDisableConfirm, setShowDisableConfirm] = useState(false);
  const [wrongDigit, setWrongDigit] = useState(false);
  // Gość (konto anonimowe) nie może tworzyć zaproszeń (reguła coachInvites: !isAnon).
  const isGuest = !!auth.currentUser?.isAnonymous;

  // [TRENER] Tryb trenera włącza każdy sam — FREE_COACH_SLOTS miejsc gratis.
  // Serwer pilnuje limitu przy dopisaniu ucznia (firestore.rules, Path E).
  const setCoachMode = async (enabled: boolean) => {
    setModeBusy(true);
    setModeError(false);
    try {
      await updateDoc(doc(db, 'users', userId), { isCoach: enabled });
      onCoachModeChange?.(enabled);
    } catch {
      setModeError(true);
    }
    setModeBusy(false);
  };

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
    <div className="space-y-4 animate-fade-in-up">
      {/* Sekcja Moja Kadra (Uczeń widzi swoich trenerów) */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm space-y-3">
        <div className="flex items-center gap-2 mb-2">
          <span className="material-symbols-outlined text-blue-500">security</span>
          <h3 className="text-sm font-black text-[#0a3a2a] uppercase tracking-widest">{t('settings.coach.myTeam')}</h3>
        </div>
        <p className="text-[10px] text-gray-500 font-bold mb-3 leading-relaxed">
          {t('settings.coach.shareDesc')}
        </p>

        <button onClick={onShowQR} className="w-full py-3.5 bg-blue-50 text-blue-600 border border-blue-100 rounded-xl font-black text-[10px] uppercase tracking-widest active:scale-95 transition-all flex items-center justify-center gap-2">
          <span className="material-symbols-outlined text-base">qr_code_2</span> {t('settings.coach.shareBtn')}
        </button>

        {myCoachesData.length > 0 ? (
          <div className="space-y-2 mt-4 pt-4 border-t border-gray-50">
            <h4 className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-2">{t('settings.coach.activeFor')}</h4>
            {myCoachesData.map(coach => (
              <div key={coach.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-100">
                <div>
                  <p className="font-black text-xs text-[#0a3a2a]">{coach.firstName} {coach.lastName}</p>
                  <p className="text-[9px] font-bold text-gray-400 uppercase">{coach.clubName || 'GROT-X'}</p>
                </div>
                <button onClick={() => onRevokeCoach(coach.id)} className="px-3 py-1.5 bg-red-50 text-red-500 rounded-lg text-[9px] font-black uppercase active:scale-90 transition-all border border-red-100">
                  {t('settings.coach.revokeBtn')}
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center p-4 bg-gray-50 rounded-xl border border-dashed border-gray-200 mt-4">
            <p className="text-[10px] font-black text-gray-400 uppercase">{t('settings.coach.noCoach')}</p>
          </div>
        )}
      </div>

      {/* Sekcja Centrum Dowodzenia (Jeśli użytkownik jest trenerem) */}
      {isCoach && (
        <div className="bg-gradient-to-br from-indigo-900 to-blue-900 rounded-2xl p-5 shadow-xl border border-indigo-700 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-full bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10 pointer-events-none"></div>
          <div className="relative z-10">
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-2">
                <span className="material-symbols-outlined text-blue-400">sports</span> {t('settings.coach.commandCenter')}
              </h3>
              <span className="bg-blue-500/30 text-blue-200 text-[9px] font-black px-2 py-1 rounded-lg border border-blue-500/50">
                {t('settings.coach.slots')} {studentsCount}/{coachLimit}
              </span>
            </div>
            <p className="text-[10px] text-blue-100/80 font-medium mb-4 leading-relaxed">{t('settings.coach.panelDesc')}</p>
            <button onClick={() => onNavigate?.('COACH')} className="w-full py-4 bg-blue-500 text-white rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg active:scale-95 transition-all">
              {t('settings.coach.openPanel')}
            </button>
          </div>
        </div>
      )}

      {!isCoach && (
        <div className="bg-gray-50 rounded-2xl p-5 border border-gray-100">
          <div className="flex flex-col items-center text-center mb-4">
            <span className="material-symbols-outlined text-gray-300 text-4xl mb-2">sports</span>
            <h4 className="text-xs font-black text-gray-500 uppercase tracking-widest mb-1">{t('settings.coach.becomeTitle')}</h4>
            <p className="text-[10px] text-gray-400 font-medium leading-relaxed">{t('settings.coach.becomeDesc', { count: FREE_COACH_SLOTS })}</p>
          </div>
          {isGuest ? (
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">{t('settings.coach.guestBlocked')}</p>
          ) : (
            <button
              onClick={() => setCoachMode(true)}
              disabled={modeBusy}
              className="w-full py-3.5 bg-emerald-500 text-white rounded-xl font-black text-[10px] uppercase tracking-widest active:scale-95 transition-all disabled:opacity-50 disabled:scale-100 flex items-center justify-center gap-2"
            >
              <span className="material-symbols-outlined text-base">sports</span>
              {modeBusy ? t('settings.coach.enabling') : t('settings.coach.enableBtn')}
            </button>
          )}
          {modeError && <p className="text-[10px] text-red-500 font-bold mt-2 text-center">{t('settings.coach.modeError')}</p>}
        </div>
      )}

      {/* [TRENER] Więcej miejsc niż darmowe — na razie prośba do admina, który
          nadaje pakiet (coachLimit) w Admin Center. Później tu wejdą płatności. */}
      {isCoach && (
        <div className="bg-gray-50 rounded-2xl p-5 border border-gray-100">
          <h4 className="text-xs font-black text-gray-500 uppercase tracking-widest mb-1">{t('settings.coach.moreSlotsTitle')}</h4>
          <p className="text-[10px] text-gray-400 font-medium leading-relaxed mb-4">{t('settings.coach.moreSlotsDesc')}</p>

          {status === 'sent' ? (
            <div className="text-center bg-emerald-50 border border-emerald-100 rounded-xl p-4">
              <span className="material-symbols-outlined text-emerald-500 text-2xl mb-1">check_circle</span>
              <p className="text-xs font-black text-emerald-600 uppercase tracking-widest">{t('settings.coach.becomeSent')}</p>
              <p className="text-[10px] text-emerald-500 mt-1">{t('settings.coach.becomeSentDesc')}</p>
            </div>
          ) : status === 'alreadySent' ? (
            <div className="text-center bg-yellow-50 border border-yellow-100 rounded-xl p-4">
              <span className="material-symbols-outlined text-yellow-500 text-2xl mb-1">schedule</span>
              <p className="text-[10px] font-bold text-yellow-600 leading-relaxed">{t('settings.coach.becomeAlreadySent')}</p>
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-1">
                  {t('settings.coach.becomeStudentsLabel')}
                </label>
                <input
                  type="number"
                  min="1"
                  value={desiredStudents}
                  onChange={e => setDesiredStudents(e.target.value)}
                  placeholder={t('settings.coach.becomeStudentsPlaceholder')}
                  className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-bold text-[#0a3a2a] focus:outline-none focus:border-emerald-300"
                />
              </div>
              {status === 'error' && (
                <p className="text-[10px] text-red-500 font-bold">{t('settings.coach.becomeError')}</p>
              )}
              <button
                onClick={handleSendRequest}
                disabled={status === 'sending' || !desiredStudents}
                className="w-full py-3.5 bg-emerald-500 text-white rounded-xl font-black text-[10px] uppercase tracking-widest active:scale-95 transition-all disabled:opacity-50 disabled:scale-100 flex items-center justify-center gap-2"
              >
                <span className="material-symbols-outlined text-base">send</span>
                {status === 'sending' ? t('settings.coach.becomeSending') : t('settings.coach.becomeRequestBtn')}
              </button>
            </div>
          )}

          {/* Wyłączenie tylko bez uczniów — inaczej zostaliby w students[]
              u kogoś, kto nie widzi już panelu trenera. */}
          <div className="mt-4 pt-4 border-t border-gray-100 text-center">
            {studentsCount === 0 ? (
              <button
                onClick={() => { setWrongDigit(false); setShowDisableConfirm(true); }}
                disabled={modeBusy}
                className="w-full py-3 bg-red-50 text-red-500 border border-red-100 rounded-xl text-[10px] font-black uppercase tracking-widest active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <span className="material-symbols-outlined text-base">block</span>
                {t('settings.coach.disableBtn')}
              </button>
            ) : (
              <p className="text-[9px] font-bold text-gray-400">{t('settings.coach.disableBlocked')}</p>
            )}
            {modeError && <p className="text-[10px] text-red-500 font-bold mt-2">{t('settings.coach.modeError')}</p>}
          </div>
        </div>
      )}

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
                  onClick={async () => {
                    if (digit !== '0') { setWrongDigit(true); return; }
                    await setCoachMode(false);
                    setShowDisableConfirm(false);
                  }}
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

export default CoachSection;
