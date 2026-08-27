import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { auth, db } from '../firebase';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signInAnonymously,
  GoogleAuthProvider,
  sendPasswordResetEmail,
  getAdditionalUserInfo
} from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { useTranslation } from 'react-i18next';
import { switchLanguage } from '../i18n';
import { PRIVACY_POLICY_VERSION, privacyPolicyUrl } from '../utils/legalLinks';

// [RODO] Zapis zgody na politykę prywatności w profilu — rozliczalność (art. 7 ust. 1).
// Merge: dokument users/{uid} może jeszcze nie istnieć (tworzy go App.tsx) lub już istnieć.
async function writePrivacyConsent(uid: string) {
  try {
    await setDoc(doc(db, 'users', uid), {
      privacyConsent: { version: PRIVACY_POLICY_VERSION, acceptedAt: Date.now() }
    }, { merge: true });
  } catch (e) {
    console.error('Zapis privacyConsent nieudany:', e);
  }
}

export default function AuthView() {
  const { t, i18n } = useTranslation();
  const [isLogin, setIsLogin] = useState(true);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [acceptedPrivacy, setAcceptedPrivacy] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Ref do śledzenia czy komponent jest nadal zamontowany.
  // Po signIn/signUp auth state listener unmountuje AuthView (zastępuje HomeView),
  // więc setIsLoading(false) w finally musi być ograniczone do żywych instancji.
  const isMountedRef = useRef(true);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => {
      if (isMountedRef.current) setToastMessage(null);
    }, 4000);
  };

  const safeSetIsLoading = (v: boolean) => {
    if (isMountedRef.current) setIsLoading(v);
  };
  const safeSetError = (v: string) => {
    if (isMountedRef.current) setError(v);
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    safeSetError('');
    safeSetIsLoading(true);

    try {
      if (isForgotPassword) {
        await sendPasswordResetEmail(auth, email);
        showToast(t('auth.resetSuccess'));
        if (isMountedRef.current) setIsForgotPassword(false);
      } else if (isLogin) {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        // [RODO] Rejestracja wymaga aktywnej akceptacji polityki prywatności (opt-in).
        if (!acceptedPrivacy) {
          safeSetError(t('auth.privacyRequired'));
          safeSetIsLoading(false);
          return;
        }
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        await writePrivacyConsent(cred.user.uid);
      }
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password' || err.code === 'auth/user-not-found') {
        safeSetError(t('auth.errorInvalid'));
      } else {
        safeSetError(t('auth.errorGeneral'));
      }
    } finally {
      safeSetIsLoading(false);
    }
  };

  // [TRYB GOŚCIA] Konto anonimowe Firebase — pełna aplikacja bez rejestracji,
  // ale wszystkie dane wygasają 24h po utworzeniu konta (TTL Firestore).
  // Baner na Home przypomina o rejestracji; upgrade (linkWithCredential)
  // zachowuje uid i cały dorobek.
  const handleGuestAuth = async () => {
    safeSetError('');
    safeSetIsLoading(true);
    try {
      await signInAnonymously(auth);
    } catch (err: any) {
      console.error(err);
      safeSetError(t('auth.errorGeneral'));
    } finally {
      safeSetIsLoading(false);
    }
  };

  const handleGoogleAuth = async () => {
    safeSetError('');
    safeSetIsLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      // [RODO] Nowe konto Google = pierwsza rejestracja → zapis zgody
      // (informacja o akceptacji widnieje przy przycisku Google).
      if (getAdditionalUserInfo(result)?.isNewUser) {
        await writePrivacyConsent(result.user.uid);
      }
    } catch (err: any) {
      console.error(err);
      safeSetError(t('auth.googleError'));
    } finally {
      safeSetIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#fcfdfe] flex flex-col items-center justify-center p-5 relative overflow-hidden max-w-md mx-auto">
      {/* Ozdobniki tła */}
      <div className="absolute top-[-100px] left-[-50px] w-64 h-64 bg-emerald-100 rounded-full mix-blend-multiply filter blur-3xl opacity-50 animate-blob"></div>
      <div className="absolute top-[-50px] right-[-50px] w-64 h-64 bg-yellow-100 rounded-full mix-blend-multiply filter blur-3xl opacity-50 animate-blob animation-delay-2000"></div>

      {/* Przełącznik języka — widoczny przed zalogowaniem, żeby pierwsza wizyta
          nie utknęła w obcym języku (wybór zapisuje się w localStorage) */}
      <div className="absolute top-[max(0.5rem,env(safe-area-inset-top))] right-5 z-20 flex gap-1">
        {(['pl', 'de', 'en'] as const).map(lng => (
          <button
            key={lng}
            type="button"
            onClick={() => switchLanguage(lng)}
            className={`px-2.5 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 ${
              (i18n.resolvedLanguage || i18n.language) === lng
                ? 'bg-[#0a3a2a] text-white shadow-md'
                : 'bg-white/80 text-gray-400 border border-gray-100'
            }`}
          >
            {lng}
          </button>
        ))}
      </div>
      
      <div className="relative z-10 w-full space-y-3 flex flex-col items-center">
        {/* LOGO */}
        <div className="text-center w-full pt-5">
          <div className="flex items-baseline justify-center mb-1.5">
            <span className="text-4xl font-black text-[#0a3a2a] tracking-tighter leading-none">GROT-X</span>
            {/* Kropka wyśrodkowana w pionie względem litery X, nie na linii
                bazowej. Przy text-4xl (36px) wysokość wersalika to 25px, więc
                środek X leży 12,5px nad baseline; kropka ma 10px, jej dolna
                krawędź musi trafić na 12,5 - 5 = 7,5px. Wartość w px, a nie
                em — obie wielkości (36px tekst, 10px kropka) są stałe, więc
                offset nie może zależeć od dziedziczonego font-size. */}
            <div className="w-2.5 h-2.5 bg-[#fed33e] rounded-full ml-1.5 relative bottom-[7.5px] animate-pulse"></div>
          </div>
          <p className="text-gray-400 font-black text-[10px] uppercase tracking-[0.2em] opacity-80">
            {isForgotPassword ? t('auth.resetTitle') : t('auth.subtitle')}
          </p>
        </div>

        {/* Zakładki Zaloguj / Załóż konto — obie ścieżki widoczne od razu,
            nowy użytkownik nie musi szukać małego linku do rejestracji */}
        {!isForgotPassword && (
          <div className="w-full flex p-1 bg-gray-100 rounded-2xl">
            <button
              type="button"
              onClick={() => { setIsLogin(true); setError(''); }}
              className={`flex-1 py-2 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all ${isLogin ? 'bg-[#0a3a2a] text-white shadow-md' : 'text-gray-400'}`}
            >
              {t('auth.tabLogin')}
            </button>
            <button
              type="button"
              onClick={() => { setIsLogin(false); setError(''); }}
              className={`flex-1 py-2 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all ${!isLogin ? 'bg-[#0a3a2a] text-white shadow-md' : 'text-gray-400'}`}
            >
              {t('auth.tabRegister')}
            </button>
          </div>
        )}

        {error && (
          <div className="w-full bg-red-50 border border-red-100 text-red-600 px-4 py-3 rounded-2xl text-[11px] font-bold text-center animate-fade-in-up">
            {error}
          </div>
        )}

        <form onSubmit={handleEmailAuth} className="w-full bg-white p-5 rounded-[32px] shadow-[0_20px_50px_rgba(0,0,0,0.05)] border border-gray-50 space-y-3">
          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">{t('auth.email')}</label>
            <input 
              type="email" 
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-gray-50 border border-gray-100 rounded-2xl p-3 text-sm font-bold text-[#0a3a2a] outline-none focus:border-emerald-500 transition-all placeholder:text-gray-300"
              placeholder="e-mail"
            />
          </div>

          {!isForgotPassword && (
            <div className="space-y-1.5">
              <div className="flex justify-between items-center px-1">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{t('auth.password')}</label>
                {isLogin && (
                  <button 
                    type="button" 
                    onClick={() => setIsForgotPassword(true)}
                    className="text-[9px] font-black text-emerald-600 uppercase tracking-tight"
                  >
                    {t('auth.forgotPassword')}
                  </button>
                )}
              </div>
              <input 
                type="password" 
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-gray-50 border border-gray-100 rounded-2xl p-3 text-sm font-bold text-[#0a3a2a] outline-none focus:border-emerald-500 transition-all placeholder:text-gray-300"
                placeholder="••••••••"
              />
            </div>
          )}
          
          {!isLogin && !isForgotPassword && (
            <label className="flex items-start gap-3 px-1 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={acceptedPrivacy}
                onChange={(e) => setAcceptedPrivacy(e.target.checked)}
                className="mt-0.5 w-4 h-4 accent-[#0a3a2a] shrink-0"
              />
              <span className="text-[11px] font-bold text-gray-500 leading-snug">
                {t('auth.privacyAccept')}{' '}
                <a
                  href={privacyPolicyUrl(i18n.language)}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="text-emerald-600 font-black underline decoration-emerald-200 underline-offset-2"
                >
                  {t('auth.privacyPolicy')}
                </a>
              </span>
            </label>
          )}

          <button
            type="submit"
            disabled={isLoading || (!isLogin && !isForgotPassword && !acceptedPrivacy)}
            className="w-full py-3.5 bg-[#0a3a2a] text-white rounded-2xl font-black text-xs uppercase tracking-[0.15em] shadow-xl active:scale-95 transition-all flex justify-center items-center gap-2 disabled:opacity-50 mt-1"
          >
            {isLoading ? (
              <span className="material-symbols-outlined animate-spin text-lg">sync</span>
            ) : (
              <span className="material-symbols-outlined text-lg">
                {isForgotPassword ? 'mail' : (isLogin ? 'login' : 'person_add')}
              </span>
            )}
            {isForgotPassword ? t('auth.resetBtn') : (isLogin ? t('auth.loginBtn') : t('auth.registerBtn'))}
          </button>

          {isForgotPassword && (
            <button 
              type="button" 
              onClick={() => setIsForgotPassword(false)}
              className="w-full text-center text-[10px] font-black text-gray-400 uppercase tracking-widest pt-2"
            >
              {t('auth.backToLogin')}
            </button>
          )}
        </form>

        {!isForgotPassword && (
          <div className="w-full space-y-2.5">
            <div className="flex items-center gap-4 px-4">
              <div className="h-[1px] bg-gray-100 flex-1"></div>
              <span className="text-[9px] font-black text-gray-300 uppercase tracking-[0.2em]">{t('auth.or')}</span>
              <div className="h-[1px] bg-gray-100 flex-1"></div>
            </div>

            <button 
              onClick={handleGoogleAuth}
              disabled={isLoading}
              type="button"
              className="w-full bg-white border border-gray-100 py-3.5 rounded-2xl font-black text-[11px] text-[#333] shadow-sm active:scale-95 transition-all flex justify-center items-center gap-3 uppercase tracking-widest"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              {t('auth.googleAuth')}
            </button>

            <p className="text-center text-[9px] font-bold text-gray-400 leading-snug px-6">
              {t('auth.privacyGoogleNote')}{' '}
              <a
                href={privacyPolicyUrl(i18n.language)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-emerald-600 underline decoration-emerald-200 underline-offset-2"
              >
                ↗
              </a>
            </p>

            {/* Tryb gościa — wyraźny żółty przycisk (akcent marki), nie mały link */}
            <button
              onClick={handleGuestAuth}
              disabled={isLoading}
              type="button"
              className="w-full py-3 bg-[#fed33e] rounded-2xl shadow-[0_8px_24px_rgba(254,211,62,0.35)] active:scale-95 transition-all text-center"
            >
              <span className="text-[11px] font-black text-[#5d4a00] uppercase tracking-widest">
                {t('auth.guestBtn')}
              </span>
              <span className="block text-[9px] font-bold text-[#5d4a00]/70 mt-0.5 normal-case tracking-normal">
                {t('auth.guestNote')}
              </span>
            </button>
          </div>
        )}
      </div>

      {toastMessage && typeof document !== 'undefined' && createPortal(
        <div className="fixed top-12 left-1/2 -translate-x-1/2 z-[300000] bg-[#0a3a2a] text-white px-6 py-4 rounded-3xl font-black text-[10px] uppercase tracking-widest shadow-2xl border border-emerald-900 animate-fade-in-up flex items-center gap-3 text-center max-w-[90%]">
          <span className="material-symbols-outlined text-emerald-400 text-base">check_circle</span>
          {toastMessage}
        </div>, document.body
      )}

      <style>{`
       .animate-fade-in-up { animation: fadeInUp 0.4s ease-out forwards; } 
       @keyframes fadeInUp { from { opacity: 0; transform: translateY(15px); } to { opacity: 1; transform: translateY(0); } }
       @keyframes blob {
         0% { transform: translate(0px, 0px) scale(1); }
         33% { transform: translate(30px, -50px) scale(1.1); }
         66% { transform: translate(-20px, 20px) scale(0.9); }
         100% { transform: translate(0px, 0px) scale(1); }
       }
       .animate-blob { animation: blob 7s infinite; }
       .animation-delay-2000 { animation-delay: 2s; }
      `}</style>
    </div>
  );
}