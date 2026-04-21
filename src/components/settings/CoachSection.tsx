import React from 'react';
import { useTranslation } from 'react-i18next';

interface CoachSectionProps {
  isCoach: boolean;
  studentsCount: number;
  coachLimit: number;
  myCoachesData: any[];
  onShowQR: () => void;
  onRevokeCoach: (coachId: string) => void;
  onNavigate?: (view: string) => void;
}

const CoachSection: React.FC<CoachSectionProps> = ({
  isCoach,
  studentsCount,
  coachLimit,
  myCoachesData,
  onShowQR,
  onRevokeCoach,
  onNavigate
}) => {
  const { t } = useTranslation();

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
        <div className="bg-gray-50 rounded-2xl p-5 border border-gray-100 text-center">
          <span className="material-symbols-outlined text-gray-300 text-4xl mb-2">sports</span>
          <h4 className="text-xs font-black text-gray-500 uppercase tracking-widest mb-1">{t('settings.coach.becomeTitle')}</h4>
          <p className="text-[10px] text-gray-400 font-medium leading-relaxed">{t('settings.coach.becomeDesc')}</p>
        </div>
      )}
    </div>
  );
};

export default CoachSection;