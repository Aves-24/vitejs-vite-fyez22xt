import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { auth, db } from '../firebase';
import {
  EmailAuthProvider, GoogleAuthProvider,
  linkWithCredential, linkWithPopup, signOut
} from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { useTranslation } from 'react-i18next';
import { guestExpiresAtMs, clearGuestExpiry } from '../utils/guestMode';
import { PRIVACY_POLICY_VERSION, privacyPolicyUrl } from '../utils/legalLinks';

// ═══════════════════════════════════════════════════════════════════
//  [GOŚĆ] Stały baner trybu gościa (Home) — wymóg produktowy: widoczny
//  CAŁY CZAS, dopóki gość nie założy konta.
//   - odliczanie do wygaśnięcia danych (utworzenie konta + 24h),
//   - po terminie: signOut (dokumenty kasuje TTL Firestore),
//   - „Załóż konto": linkWithCredential / linkWithPopup — TO SAMO uid,
//     więc cały dorobek gościa zostaje; clearGuestExpiry zdejmuje
//     expiresAt, żeby TTL niczego nie zabrał.
// ═══════════════════════════════════════════════════════════════════

interface GuestBannerProps {
  userId: string;
}

export default function GuestBanner({ userId }: GuestBannerProps) {
  const { t, i18n } = useTranslation();
  const [now, setNow] = useState(Date.now());
  const [upgraded, setUpgraded] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [acceptedPrivacy, setAcceptedPrivacy] = useState(false);
  const [error, setError] = useState('');
  const [isBusy, setIsBusy] = useState(false);

  const isGuest = !!auth.currentUser?.isAnonymous && !upgraded;
  const expiresAt = guestExpiresAtMs();

  // Odliczanie co 30 s; po terminie wylogowanie (dane skasuje TTL).
  useEffect(() => {
    if (!isGuest) return;
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, [isGuest]);

  useEffect(() => {
    if (isGuest && expiresAt && now >= expiresAt) {
      signOut(auth).catch(() => {});
    }
  }, [isGuest, expiresAt, now]);

  if (!isGuest || !expiresAt) return null;

  const msLeft = Math.max(0, expiresAt - now);
  const h = Math.floor(msLeft / 3_600_000);
  const m = Math.floor((msLeft % 3_600_000) / 60_000);
  const timeLeft = h > 0 ? `${h} h ${m} min` : `${m} min`;

  // Po udanym linku: zgoda RODO (jak przy zwykłej rejestracji) + zdjęcie
  // expiresAt ze wszystkich dokumentów gościa.
  const finalizeUpgrade = async () => {
    try {
      await setDoc(doc(db, 'users', userId), {
        privacyConsent: { version: PRIVACY_POLICY_VERSION, acceptedAt: Date.now() }
      }, { merge: true });
    } catch (e) { console.error('Zapis privacyConsent nieudany:', e); }
    await clearGuestExpiry(userId);
    setUpgraded(true);
    setShowUpgrade(false);
  };

  const handleEmailUpgrade = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!acceptedPrivacy) { setError(t('auth.privacyRequired')); return; }
    if (!auth.currentUser) return;
    setIsBusy(true);
    try {
      await linkWithCredential(auth.currentUser, EmailAuthProvider.credential(email, password));
      await finalizeUpgrade();
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/email-already-in-use' || err.code === 'auth/credential-already-in-use') {
        setError(t('guest.emailInUse'));
      } else if (err.code === 'auth/weak-password') {
        setError(t('guest.weakPassword'));
      } else {
        setError(t('auth.errorGeneral'));
      }
    } finally {
      setIsBusy(false);
    }
  };

  const handleGoogleUpgrade = async () => {
    setError('');
    if (!auth.currentUser) return;
    setIsBusy(true);
    try {
      await linkWithPopup(auth.currentUser, new GoogleAuthProvider());
      await finalizeUpgrade();
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/credential-already-in-use' || err.code === 'auth/email-already-in-use') {
        setError(t('guest.emailInUse'));
      } else {
        setError(t('auth.googleError'));
      }
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <>
      {/* Pasek nad treścią Home — nieusuwalny do czasu założenia konta */}
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-full max-w-md z-[150] pt-[env(safe-area-inset-top)]">
        <button
          onClick={() => setShowUpgrade(true)}
          className="w-full bg-[#fed33e] px-4 py-2.5 flex items-center justify-center gap-2 shadow-md active:brightness-95 transition-all"
        >
          <span className="material-symbols-outlined text-[#5d4a00] text-base">hourglass_top</span>
          <span className="text-[10px] font-black text-[#5d4a00] uppercase tracking-wide leading-tight">
            {t('guest.banner', { time: timeLeft })}
          </span>
          <span className="text-[10px] font-black text-[#0a3a2a] uppercase tracking-widest underline underline-offset-2 shrink-0">
            {t('guest.bannerCta')}
          </span>
        </button>
      </div>

      {/* Modal upgrade'u konta */}
      {showUpgrade && createPortal(
        <div className="fixed inset-0 z-[250000] bg-black/60 flex items-end justify-center" onClick={() => !isBusy && setShowUpgrade(false)}>
          <div
            className="w-full max-w-md bg-white rounded-t-[32px] p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] space-y-4 animate-fade-in-up"
            onClick={e => e.stopPropagation()}
          >
            <div className="text-center">
              <h2 className="text-lg font-black text-[#0a3a2a]">{t('guest.upgradeTitle')}</h2>
              <p className="text-[11px] font-bold text-gray-400 mt-1 leading-snug">{t('guest.upgradeDesc')}</p>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-100 text-red-600 px-4 py-3 rounded-2xl text-[11px] font-bold text-center">
                {error}
              </div>
            )}

            <form onSubmit={handleEmailUpgrade} className="space-y-3">
              <input
                type="email" required value={email} onChange={e => setEmail(e.target.value)}
                placeholder="e-mail"
                className="w-full bg-gray-50 border border-gray-100 rounded-2xl p-4 text-sm font-bold text-[#0a3a2a] outline-none focus:border-emerald-500 transition-all placeholder:text-gray-300"
              />
              <input
                type="password" required value={password} onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-gray-50 border border-gray-100 rounded-2xl p-4 text-sm font-bold text-[#0a3a2a] outline-none focus:border-emerald-500 transition-all placeholder:text-gray-300"
              />
              <label className="flex items-start gap-3 px-1 cursor-pointer select-none">
                <input
                  type="checkbox" checked={acceptedPrivacy}
                  onChange={e => setAcceptedPrivacy(e.target.checked)}
                  className="mt-0.5 w-4 h-4 accent-[#0a3a2a] shrink-0"
                />
                <span className="text-[11px] font-bold text-gray-500 leading-snug">
                  {t('auth.privacyAccept')}{' '}
                  <a
                    href={privacyPolicyUrl(i18n.language)} target="_blank" rel="noopener noreferrer"
                    onClick={e => e.stopPropagation()}
                    className="text-emerald-600 font-black underline decoration-emerald-200 underline-offset-2"
                  >
                    {t('auth.privacyPolicy')}
                  </a>
                </span>
              </label>
              <button
                type="submit" disabled={isBusy || !acceptedPrivacy}
                className="w-full py-4 bg-[#0a3a2a] text-white rounded-2xl font-black text-xs uppercase tracking-[0.15em] shadow-xl active:scale-95 transition-all disabled:opacity-50 flex justify-center items-center gap-2"
              >
                {isBusy
                  ? <span className="material-symbols-outlined animate-spin text-lg">sync</span>
                  : <span className="material-symbols-outlined text-lg">person_add</span>}
                {t('guest.upgradeBtn')}
              </button>
            </form>

            <button
              onClick={handleGoogleUpgrade} disabled={isBusy} type="button"
              className="w-full bg-white border border-gray-100 py-4 rounded-2xl font-black text-[11px] text-[#333] shadow-sm active:scale-95 transition-all flex justify-center items-center gap-3 uppercase tracking-widest"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              {t('guest.upgradeGoogle')}
            </button>

            <button
              onClick={() => setShowUpgrade(false)} disabled={isBusy} type="button"
              className="w-full text-center text-[10px] font-black text-gray-400 uppercase tracking-widest py-2"
            >
              {t('home.close')}
            </button>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
