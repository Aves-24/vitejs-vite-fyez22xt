import React, { useState } from 'react';
import { auth, db } from '../../firebase';
import {
  deleteUser,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  EmailAuthProvider,
  GoogleAuthProvider,
} from 'firebase/auth';
import {
  collection, getDocs, getDoc, doc, writeBatch, query, where,
  deleteDoc, updateDoc, arrayRemove,
} from 'firebase/firestore';
import { useTranslation } from 'react-i18next';
import { privacyPolicyUrl, IMPRESSUM_URL } from '../../utils/legalLinks';

interface PrivacySectionProps {
  userId: string;
}

// Subkolekcje należące do użytkownika — kasowane przy usunięciu konta
// i dołączane do eksportu danych (RODO art. 17 i 20).
const OWNED_SUBCOLLECTIONS = [
  'sessions', 'techShots', 'coachLog', 'dailyStats', 'scores',
  'tournaments', 'privateNotes', 'notifications', 'studentMessages',
];

const PrivacySection: React.FC<PrivacySectionProps> = ({ userId }) => {
  const { t, i18n } = useTranslation();
  const [isExporting, setIsExporting] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [password, setPassword] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ text: string; isError: boolean } | null>(null);

  const showStatus = (text: string, isError: boolean) => {
    setStatusMsg({ text, isError });
    setTimeout(() => setStatusMsg(null), 4000);
  };

  const isPasswordUser = auth.currentUser?.providerData.some(p => p.providerId === 'password');
  const confirmWord = t('settings.deleteConfirmWord');

  // ─── RODO art. 20: eksport wszystkich danych użytkownika do JSON ───
  const handleExport = async () => {
    setIsExporting(true);
    try {
      const exportData: Record<string, unknown> = {
        exportedAt: new Date().toISOString(),
        app: 'GROT-X',
        userId,
      };

      const profileSnap = await getDoc(doc(db, 'users', userId));
      exportData.profile = profileSnap.exists() ? profileSnap.data() : null;

      for (const sub of OWNED_SUBCOLLECTIONS) {
        const snap = await getDocs(collection(db, `users/${userId}/${sub}`));
        if (!snap.empty) {
          exportData[sub] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        }
      }

      const worldStatsSnap = await getDoc(doc(db, 'world_stats', userId));
      if (worldStatsSnap.exists()) exportData.worldStats = worldStatsSnap.data();

      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `grotx-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showStatus(t('settings.exportDone'), false);
    } catch (e) {
      console.error('Eksport danych nieudany:', e);
      showStatus(t('settings.exportError'), true);
    } finally {
      setIsExporting(false);
    }
  };

  // ─── RODO art. 17: trwałe usunięcie konta i danych ───
  const deleteSubcollection = async (path: string) => {
    const snap = await getDocs(collection(db, path));
    // Firestore batch limit = 500 operacji — kasujemy porcjami po 400
    for (let i = 0; i < snap.docs.length; i += 400) {
      const batch = writeBatch(db);
      snap.docs.slice(i, i + 400).forEach(d => batch.delete(d.ref));
      await batch.commit();
    }
  };

  const handleDelete = async () => {
    const user = auth.currentUser;
    if (!user || confirmText.trim().toUpperCase() !== confirmWord.toUpperCase()) return;
    setIsDeleting(true);

    try {
      // 1. Re-autentykacja PRZED kasowaniem — deleteUser wymaga świeżego
      //    logowania; lepiej odpaść tutaj niż zostawić konto wpół-usunięte.
      try {
        if (isPasswordUser) {
          const cred = EmailAuthProvider.credential(user.email || '', password);
          await reauthenticateWithCredential(user, cred);
        } else {
          await reauthenticateWithPopup(user, new GoogleAuthProvider());
        }
      } catch (e: any) {
        const wrongPw = e?.code === 'auth/wrong-password' || e?.code === 'auth/invalid-credential';
        showStatus(wrongPw ? t('settings.deleteWrongPassword') : t('settings.deleteError'), true);
        setIsDeleting(false);
        return;
      }

      // 2. Zdjęcie relacji trener↔uczeń — mój UID znika z cudzych list
      //    (rules: Path F — students[], Path H — coaches[]).
      const meSnap = await getDoc(doc(db, 'users', userId));
      const me = meSnap.exists() ? meSnap.data() : {};
      for (const coachId of (me.coaches || []) as string[]) {
        await updateDoc(doc(db, 'users', coachId), { students: arrayRemove(userId) }).catch(() => {});
        // Wątek wiadomości w przestrzeni trenera — uczeń może go usunąć
        await deleteDoc(doc(db, `users/${coachId}/studentMessages/${userId}`)).catch(() => {});
      }
      for (const studentId of (me.students || []) as string[]) {
        await updateDoc(doc(db, 'users', studentId), { coaches: arrayRemove(userId) }).catch(() => {});
      }

      // 3. Zaproszenia trenerskie z moim udziałem
      for (const field of ['coachId', 'studentId']) {
        const invSnap = await getDocs(query(collection(db, 'coachInvites'), where(field, '==', userId)))
          .catch(() => null);
        if (invSnap) {
          for (const d of invSnap.docs) await deleteDoc(d.ref).catch(() => {});
        }
      }

      // 4. Subkolekcje, wpis matchmakingu i statystyki rankingowe
      for (const sub of OWNED_SUBCOLLECTIONS) {
        await deleteSubcollection(`users/${userId}/${sub}`).catch(() => {});
      }
      await deleteDoc(doc(db, 'world_queue', userId)).catch(() => {});
      await deleteDoc(doc(db, 'world_stats', userId)).catch(() => {});
      await deleteDoc(doc(db, 'profiles_public', userId)).catch(() => {});

      // 5. Dokument profilu i konto Firebase Auth
      await deleteDoc(doc(db, 'users', userId));
      localStorage.removeItem('grotX_activeSession');
      await deleteUser(user);
      // onAuthStateChanged w App.tsx przekieruje automatycznie na ekran logowania
    } catch (e) {
      console.error('Usuwanie konta nieudane:', e);
      showStatus(t('settings.deleteError'), true);
      setIsDeleting(false);
    }
  };

  return (
    <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 space-y-3">
      <h3 className="text-[10px] font-black text-emerald-600 uppercase tracking-widest border-b border-gray-50 pb-1.5">
        {t('settings.privacyData')}
      </h3>

      {statusMsg && (
        <div className={`px-3 py-2.5 rounded-xl text-[10px] font-black text-center ${statusMsg.isError ? 'bg-red-50 text-red-600 border border-red-100' : 'bg-emerald-50 text-emerald-700 border border-emerald-100'}`}>
          {statusMsg.text}
        </div>
      )}

      {/* Linki prawne */}
      <div className="flex gap-2">
        <a
          href={privacyPolicyUrl(i18n.language)}
          target="_blank" rel="noopener noreferrer"
          className="flex-1 py-3 bg-gray-50 border border-gray-100 rounded-xl text-[10px] font-black text-gray-600 uppercase tracking-wide text-center active:scale-95 transition-all flex items-center justify-center gap-1.5"
        >
          <span className="material-symbols-outlined text-sm">policy</span>
          {t('settings.privacyPolicyLink')}
        </a>
        <a
          href={IMPRESSUM_URL}
          target="_blank" rel="noopener noreferrer"
          className="flex-1 py-3 bg-gray-50 border border-gray-100 rounded-xl text-[10px] font-black text-gray-600 uppercase tracking-wide text-center active:scale-95 transition-all flex items-center justify-center gap-1.5"
        >
          <span className="material-symbols-outlined text-sm">gavel</span>
          {t('settings.impressumLink')}
        </a>
      </div>

      {/* Eksport danych (art. 20) */}
      <button
        onClick={handleExport}
        disabled={isExporting}
        className="w-full py-3 bg-gray-50 border border-gray-100 rounded-xl text-[10px] font-black text-[#0a3a2a] uppercase tracking-wide active:scale-95 transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
      >
        <span className={`material-symbols-outlined text-sm ${isExporting ? 'animate-spin' : ''}`}>
          {isExporting ? 'sync' : 'download'}
        </span>
        {isExporting ? t('settings.exportRunning') : t('settings.exportData')}
      </button>

      {/* Usunięcie konta (art. 17) */}
      <button
        onClick={() => { setShowDeleteModal(true); setConfirmText(''); setPassword(''); }}
        className="w-full py-3 bg-red-50 border border-red-100 rounded-xl text-[10px] font-black text-red-600 uppercase tracking-wide active:scale-95 transition-all flex items-center justify-center gap-1.5"
      >
        <span className="material-symbols-outlined text-sm">delete_forever</span>
        {t('settings.deleteAccount')}
      </button>

      {showDeleteModal && (
        <div className="fixed inset-0 z-[200000] bg-black/60 flex items-center justify-center p-6" onClick={() => !isDeleting && setShowDeleteModal(false)}>
          <div className="bg-white rounded-3xl p-6 w-full max-w-sm space-y-4 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-red-500 text-2xl">warning</span>
              <h4 className="font-black text-sm text-red-600 uppercase tracking-wide">{t('settings.deleteAccount')}</h4>
            </div>

            <p className="text-[11px] font-bold text-gray-600 leading-snug">{t('settings.deleteWarning')}</p>

            <div className="space-y-1">
              <label className="text-[10px] font-black text-gray-400 uppercase">{t('settings.deleteTypePrompt', { word: confirmWord })}</label>
              <input
                type="text"
                value={confirmText}
                onChange={e => setConfirmText(e.target.value)}
                placeholder={confirmWord}
                className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-sm font-black text-center outline-none focus:border-red-400"
              />
            </div>

            {isPasswordUser ? (
              <div className="space-y-1">
                <label className="text-[10px] font-black text-gray-400 uppercase">{t('settings.deletePasswordPrompt')}</label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-sm font-bold outline-none focus:border-red-400"
                />
              </div>
            ) : (
              <p className="text-[10px] font-bold text-gray-400">{t('settings.deleteReauthGoogle')}</p>
            )}

            <button
              onClick={handleDelete}
              disabled={isDeleting || confirmText.trim().toUpperCase() !== confirmWord.toUpperCase() || (isPasswordUser && !password)}
              className="w-full py-3.5 bg-red-600 text-white rounded-xl font-black text-[11px] uppercase tracking-widest active:scale-95 transition-all disabled:opacity-40 flex items-center justify-center gap-2"
            >
              {isDeleting && <span className="material-symbols-outlined text-sm animate-spin">sync</span>}
              {isDeleting ? t('settings.deleteRunning') : t('settings.deleteBtn')}
            </button>

            {!isDeleting && (
              <button
                onClick={() => setShowDeleteModal(false)}
                className="w-full text-center text-[10px] font-black text-gray-400 uppercase tracking-widest"
              >
                {t('common.cancel', '✕')}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default PrivacySection;
