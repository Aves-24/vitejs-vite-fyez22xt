import React from 'react';
import { useTranslation } from 'react-i18next';
import { privacyPolicyUrl, termsUrl } from '../utils/legalLinks';

// „Akceptuję Regulamin i Politykę prywatności” z dwoma linkami — wspólne dla
// rejestracji, upgrade'u konta gościa i bramki regulaminu (C36).
// stopPropagation: tekst siedzi w <label> checkboxa, klik w link nie może
// przełączać zgody.
export default function LegalAcceptText({ prefix }: { prefix?: string }) {
  const { t, i18n } = useTranslation();
  const linkCls = 'text-emerald-600 font-black underline decoration-emerald-200 underline-offset-2';
  return (
    <>
      {prefix ?? t('auth.privacyAccept')}{' '}
      <a href={termsUrl(i18n.language)} target="_blank" rel="noopener noreferrer"
         onClick={(e) => e.stopPropagation()} className={linkCls}>
        {t('auth.terms')}
      </a>{' '}
      {t('auth.and')}{' '}
      <a href={privacyPolicyUrl(i18n.language)} target="_blank" rel="noopener noreferrer"
         onClick={(e) => e.stopPropagation()} className={linkCls}>
        {t('auth.privacyPolicy')}
      </a>
      {/* DE: „… und habe die Datenschutzerklärung gelesen” — PL/EN puste. */}
      {t('auth.privacyPolicySuffix') && <>{' '}{t('auth.privacyPolicySuffix')}</>}
    </>
  );
}
