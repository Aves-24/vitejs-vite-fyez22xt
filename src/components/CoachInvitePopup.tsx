import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { db } from '../firebase';
import {
  collection, query, where, onSnapshot,
  doc, updateDoc, arrayUnion, deleteDoc, getDoc
} from 'firebase/firestore';
import { useTranslation } from 'react-i18next';

interface CoachInvitePopupProps {
  userId: string;
}

interface Invite {
  id: string;
  coachId: string;
  studentId: string;
  coachName?: string;
  coachClub?: string;
}

/**
 * [BEZPIECZEŃSTWO]
 * Globalny nasłuch na zaproszenia od trenerów (collection `coachInvites`
 * where studentId == currentUser). Gdy jakieś przyjdzie — pokazujemy popup
 * z "Akceptuj / Odrzuć". Dopóki uczeń nie kliknie Akceptuj, trener NIE ma
 * dostępu do jego sesji (reguły Firestore wymagają obecności invite
 * w momencie dopisania siebie do coach.students, a coach.coaches ucznia
 * ustawia sam uczeń przy akceptacji).
 */
export default function CoachInvitePopup({ userId }: CoachInvitePopupProps) {
  const { t } = useTranslation();
  const [invites, setInvites] = useState<Invite[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!userId) return;
    const q = query(
      collection(db, 'coachInvites'),
      where('studentId', '==', userId)
    );
    const unsub = onSnapshot(q, async (snap) => {
      const items: Invite[] = [];
      for (const d of snap.docs) {
        const data = d.data() as any;
        // Dociągnij imię/klub trenera do wyświetlenia w popupie
        let coachName = t('coachInvite.unknownCoach', 'Trener');
        let coachClub = '';
        try {
          const coachSnap = await getDoc(doc(db, 'users', data.coachId));
          if (coachSnap.exists()) {
            const c = coachSnap.data();
            const first = c.firstName || '';
            const last = c.lastName || '';
            coachName = `${first} ${last}`.trim() || coachName;
            coachClub = c.clubName || c.club || '';
          }
        } catch (e) {
          console.warn('Nie udało się pobrać danych trenera:', e);
        }
        items.push({
          id: d.id,
          coachId: data.coachId,
          studentId: data.studentId,
          coachName,
          coachClub,
        });
      }
      setInvites(items);
    }, (err) => {
      console.error('Coach invites listener error:', err);
    });
    return () => unsub();
  }, [userId, t]);

  const currentInvite = invites[0];

  const handleAccept = async () => {
    if (!currentInvite || busy) return;
    setBusy(true);
    try {
      // 1) Dodaj siebie do students[] trenera (reguła wymaga istniejącego invite)
      await updateDoc(doc(db, 'users', currentInvite.coachId), {
        students: arrayUnion(userId),
      });
      // 2) Dodaj trenera do własnego coaches[] (własny doc — isSelf)
      await updateDoc(doc(db, 'users', userId), {
        coaches: arrayUnion(currentInvite.coachId),
      });
      // 3) Skasuj invite (obaj mogą)
      await deleteDoc(doc(db, 'coachInvites', currentInvite.id));
    } catch (e) {
      console.error('Accept coach invite failed:', e);
    } finally {
      setBusy(false);
    }
  };

  const handleReject = async () => {
    if (!currentInvite || busy) return;
    setBusy(true);
    try {
      await deleteDoc(doc(db, 'coachInvites', currentInvite.id));
    } catch (e) {
      console.error('Reject coach invite failed:', e);
    } finally {
      setBusy(false);
    }
  };

  if (!currentInvite) return null;

  return createPortal(
    <div className="fixed inset-0 z-[40000] bg-black/60 flex items-center justify-center p-6 animate-fade-in-up">
      <div className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl">
        <div className="flex justify-center mb-4">
          <div className="w-14 h-14 rounded-full bg-blue-50 flex items-center justify-center border-2 border-blue-100">
            <span className="material-symbols-outlined text-blue-500 text-3xl">sports</span>
          </div>
        </div>
        <h2 className="text-center text-lg font-black text-[#0a3a2a] mb-2">
          {t('coachInvite.title', 'Zaproszenie trenera')}
        </h2>
        <p className="text-center text-sm font-bold text-gray-600 mb-1">
          {t('coachInvite.message', '{{name}} chce Cię obserwować jako trener.', { name: currentInvite.coachName })}
        </p>
        {currentInvite.coachClub && (
          <p className="text-center text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-3">
            {currentInvite.coachClub}
          </p>
        )}
        <p className="text-center text-[11px] font-bold text-gray-400 mb-6 leading-relaxed">
          {t('coachInvite.desc', 'Akceptując dajesz mu dostęp do Twoich sesji strzeleckich i statystyk. Możesz cofnąć ten dostęp w każdej chwili w Ustawieniach.')}
        </p>
        <div className="flex gap-2">
          <button
            onClick={handleReject}
            disabled={busy}
            className="flex-1 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest text-gray-500 bg-gray-100 active:scale-95 transition-all disabled:opacity-50"
          >
            {t('coachInvite.reject', 'Odrzuć')}
          </button>
          <button
            onClick={handleAccept}
            disabled={busy}
            className="flex-[2] py-3 rounded-xl font-black text-[10px] uppercase tracking-widest text-white bg-[#0a3a2a] shadow-md active:scale-95 transition-all disabled:opacity-50"
          >
            {busy ? '...' : t('coachInvite.accept', 'Akceptuj')}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
