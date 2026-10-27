import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { db, auth } from '../../firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { FREE_COACH_SLOTS } from '../../utils/coachAccess';

interface CoachSectionProps {
  isCoach: boolean;
  studentsCount: number;
  coachLimit: number;
  myCoachesData: any[];
  onShowQR: () => void;
  onRevokeCoach: (coachId: string) => void;
  /** [TRENER] Po zapisaniu `isCoach` — rodzic przelicza miejsca. */
  onCoachModeChange?: (enabled: boolean) => void;
  onNavigate?: (view: string, tab?: string) => void;
  userId: string;
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
}) => {
  const { t } = useTranslation();
  const [modeBusy, setModeBusy] = useState(false);
  const [modeError, setModeError] = useState(false);
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

      {/* Trener: miejsca, prośba o więcej i wyłączenie trybu są w ustawieniach
          panelu trenera (zębatka w jego menu, user 2026-10-27) — tu tylko link. */}
      {isCoach && (
        <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-black text-[#0a3a2a] uppercase tracking-widest flex items-center gap-2">
              <span className="material-symbols-outlined text-[#0a3a2a]">sports</span> {t('settings.coach.commandCenter')}
            </h3>
            <span className="bg-gray-100 text-gray-600 text-[10px] font-black px-2 py-1 rounded-lg">
              {t('settings.coach.slots')} {studentsCount}/{coachLimit}
            </span>
          </div>
          <p className="text-[11px] text-gray-500 font-bold mb-3 leading-relaxed">{t('settings.coach.settingsMovedDesc')}</p>
          <button onClick={() => onNavigate?.('COACH', 'SETTINGS')} className="w-full py-3.5 bg-[#0a3a2a] text-[#fed33e] rounded-xl font-black text-[11px] uppercase tracking-widest active:scale-95 transition-all flex items-center justify-center gap-2">
            <span className="material-symbols-outlined text-base">settings</span>
            {t('settings.coach.openCoachSettings')}
          </button>
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

    </div>
  );
};

export default CoachSection;
