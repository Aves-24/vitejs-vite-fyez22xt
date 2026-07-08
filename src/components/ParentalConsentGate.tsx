import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { auth } from '../firebase';
import { signOut } from 'firebase/auth';
import {
  loadPrivateProfile,
  needsParentalConsent,
  saveParentalConsent,
  DIGITAL_CONSENT_AGE,
} from '../utils/privateProfile';
import { privacyPolicyUrl } from '../utils/legalLinks';

// ═══════════════════════════════════════════════════════════════════
//  [RODO art. 8] Bramka zgody opiekuna dla użytkowników < 16 lat
//  (próg dla Niemiec i Polski). Zamontowana na poziomie App — jeśli
//  profil wskazuje osobę małoletnią bez ważnej zgody, blokuje aplikację
//  do czasu potwierdzenia przez rodzica/opiekuna (oświadczenie + e-mail).
//  Reaguje na zdarzenie 'profile_saved' (zmiana daty urodzenia w kreatorze).
// ═══════════════════════════════════════════════════════════════════

interface Props {
  userId: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ParentalConsentGate({ userId }: Props) {
  const { t, i18n } = useTranslation();
  const [needed, setNeeded] = useState(false);
  const [birthDate, setBirthDate] = useState<string>('');
  const [guardianEmail, setGuardianEmail] = useState('');
  const [affirmed, setAffirmed] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  const recheck = useCallback(async () => {
    if (!userId) { setNeeded(false); return; }
    const priv = await loadPrivateProfile(userId);
    if (needsParentalConsent(priv)) {
      setBirthDate(priv?.birthDate || '');
      setNeeded(true);
    } else {
      setNeeded(false);
    }
  }, [userId]);

  useEffect(() => {
    recheck();
    const onSaved = () => { recheck(); };
    window.addEventListener('profile_saved', onSaved);
    return () => window.removeEventListener('profile_saved', onSaved);
  }, [recheck]);

  if (!needed) return null;

  const handleConfirm = async () => {
    setError('');
    if (!EMAIL_RE.test(guardianEmail.trim())) {
      setError(t('parentalConsent.errorEmail'));
      return;
    }
    if (!affirmed) {
      setError(t('parentalConsent.errorAffirm'));
      return;
    }
    setIsSaving(true);
    try {
      await saveParentalConsent(userId, birthDate, guardianEmail);
      setNeeded(false);
    } catch (e) {
      console.error('Zapis zgody opiekuna nieudany:', e);
      setError(t('parentalConsent.errorSave'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleLogout = async () => {
    try { await signOut(auth); } catch { /* ignore */ }
  };

  return createPortal(
    <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-[999999] flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-white rounded-[32px] p-7 w-full max-w-[420px] shadow-2xl relative flex flex-col max-h-[92vh] overflow-y-auto">
        <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center mb-4 self-center border border-emerald-100">
          <span className="material-symbols-outlined text-4xl text-emerald-600">family_restroom</span>
        </div>

        <h2 className="text-lg font-black text-[#0a3a2a] text-center mb-2 leading-tight">
          {t('parentalConsent.title')}
        </h2>
        <p className="text-[12px] text-gray-500 leading-relaxed font-medium text-center mb-5">
          {t('parentalConsent.intro', { age: DIGITAL_CONSENT_AGE })}
        </p>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">
              {t('parentalConsent.guardianEmail')}
            </label>
            <input
              type="email"
              inputMode="email"
              value={guardianEmail}
              onChange={(e) => setGuardianEmail(e.target.value)}
              className="w-full bg-gray-50 border border-gray-100 rounded-2xl p-4 text-sm font-bold text-[#0a3a2a] outline-none focus:border-emerald-500 transition-all placeholder:text-gray-300"
              placeholder={t('parentalConsent.guardianEmailPlaceholder')}
            />
          </div>

          <label className="flex items-start gap-3 px-1 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={affirmed}
              onChange={(e) => setAffirmed(e.target.checked)}
              className="mt-0.5 w-4 h-4 accent-[#0a3a2a] shrink-0"
            />
            <span className="text-[11px] font-bold text-gray-500 leading-snug">
              {t('parentalConsent.affirm')}{' '}
              <a
                href={privacyPolicyUrl(i18n.language)}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="text-emerald-600 font-black underline decoration-emerald-200 underline-offset-2"
              >
                {t('parentalConsent.privacyPolicy')}
              </a>
            </span>
          </label>

          {error && (
            <div className="bg-red-50 border border-red-100 text-red-600 px-4 py-3 rounded-2xl text-[11px] font-bold text-center">
              {error}
            </div>
          )}

          <button
            onClick={handleConfirm}
            disabled={isSaving}
            className="w-full py-4 bg-[#0a3a2a] text-white rounded-2xl font-black text-xs uppercase tracking-[0.15em] shadow-xl active:scale-95 transition-all flex justify-center items-center gap-2 disabled:opacity-50"
          >
            {isSaving
              ? <span className="material-symbols-outlined animate-spin text-lg">sync</span>
              : <span className="material-symbols-outlined text-lg">verified_user</span>}
            {t('parentalConsent.confirmBtn')}
          </button>

          <button
            onClick={handleLogout}
            className="w-full py-2 text-[11px] font-black text-gray-400 uppercase tracking-widest active:scale-95 transition-all"
          >
            {t('parentalConsent.logout')}
          </button>

          <p className="text-[10px] text-gray-400 leading-relaxed text-center pt-1">
            {t('parentalConsent.note')}
          </p>
        </div>
      </div>
      <style>{`.animate-fade-in { animation: fadeIn 0.4s ease-out forwards; } @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }`}</style>
    </div>,
    document.body
  );
}
