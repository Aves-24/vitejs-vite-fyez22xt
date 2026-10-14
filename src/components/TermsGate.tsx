import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { doc, setDoc } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { auth, db } from '../firebase';
import { termsAcceptedField, termsUrl } from '../utils/legalLinks';

// ═══════════════════════════════════════════════════════════════════
//  [C36] Bramka regulaminu. Konto bez akceptacji aktualnej wersji
//  (TERMS_VERSION) — konta sprzed wprowadzenia regulaminu albo po jego
//  zmianie — musi go wyraźnie zaakceptować, zanim użyje aplikacji.
//  W DE zmiana AGB przez „dalsze używanie” jest nieskuteczna (BGH
//  XI ZR 26/20), dlatego przycisk, a nie cicha informacja.
//  App.tsx decyduje, kiedy pokazać (z profilu w onSnapshot).
// ═══════════════════════════════════════════════════════════════════

export default function TermsGate({ userId }: { userId: string }) {
  const { t, i18n } = useTranslation();
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  const handleAccept = async () => {
    setError('');
    setIsSaving(true);
    try {
      // Snapshot profilu w App.tsx zobaczy pole i sam schowa bramkę.
      await setDoc(doc(db, 'users', userId), termsAcceptedField(), { merge: true });
    } catch (e) {
      console.error('Zapis termsAccepted nieudany:', e);
      setError(t('termsGate.errorSave'));
      setIsSaving(false);
    }
  };

  const handleLogout = async () => {
    try { await signOut(auth); } catch { /* ignore */ }
  };

  return createPortal(
    <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-[999999] flex items-center justify-center p-4">
      <div className="bg-white rounded-[32px] p-7 w-full max-w-[420px] shadow-2xl relative flex flex-col max-h-[92vh] overflow-y-auto">
        <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center mb-4 self-center border border-emerald-100">
          <span className="material-symbols-outlined text-4xl text-emerald-600">gavel</span>
        </div>

        <h2 className="text-lg font-black text-[#0a3a2a] text-center mb-2 leading-tight">
          {t('termsGate.title')}
        </h2>
        <p className="text-[12px] text-gray-500 leading-relaxed font-medium text-center mb-5">
          {t('termsGate.intro')}
        </p>

        <a
          href={termsUrl(i18n.language)}
          target="_blank"
          rel="noopener noreferrer"
          className="w-full py-3 mb-3 bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-2xl font-black text-[11px] uppercase tracking-widest text-center active:scale-95 transition-all"
        >
          {t('termsGate.read')} ↗
        </a>

        {error && (
          <div className="bg-red-50 border border-red-100 text-red-600 px-4 py-3 rounded-2xl text-[11px] font-bold text-center mb-3">
            {error}
          </div>
        )}

        <button
          onClick={handleAccept}
          disabled={isSaving}
          className="w-full py-4 bg-[#0a3a2a] text-white rounded-2xl font-black text-xs uppercase tracking-[0.15em] shadow-xl active:scale-95 transition-all flex justify-center items-center gap-2 disabled:opacity-50"
        >
          {isSaving
            ? <span className="material-symbols-outlined animate-spin text-lg">sync</span>
            : <span className="material-symbols-outlined text-lg">verified_user</span>}
          {t('termsGate.acceptBtn')}
        </button>

        <button
          onClick={handleLogout}
          className="w-full py-2 mt-2 text-[11px] font-black text-gray-400 uppercase tracking-widest active:scale-95 transition-all"
        >
          {t('termsGate.logout')}
        </button>

        <p className="text-[10px] text-gray-400 leading-relaxed text-center pt-1">
          {t('termsGate.note')}
        </p>
      </div>
    </div>,
    document.body
  );
}
