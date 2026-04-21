import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { db } from '../firebase';
import {
  collection, query, where, onSnapshot,
  doc, updateDoc, arrayUnion, arrayRemove, deleteField, getDoc
} from 'firebase/firestore';
import { useTranslation } from 'react-i18next';

interface BattleInvitePopupProps {
  userId: string;
  onJoinBattle?: (battleId: string, distance: string, targetType: string) => void;
}

interface Invite {
  id: string;
  hostId: string;
  mode?: string;
  distance?: string;
  targetType?: string;
  hostName?: string;
  hostClub?: string;
}

/**
 * [BEZPIECZEŃSTWO]
 * Globalny nasłuch na zaproszenia do pojedynku — battles gdzie
 * currentUser jest w pendingInvites i jeszcze nie dołączył (participants).
 * Popup z Akceptuj/Odrzuć zanim użytkownik trafi do participants i rozpocznie grę.
 */
export default function BattleInvitePopup({ userId, onJoinBattle }: BattleInvitePopupProps) {
  const { t } = useTranslation();
  const [invites, setInvites] = useState<Invite[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!userId) return;
    const q = query(
      collection(db, 'battles'),
      where('pendingInvites', 'array-contains', userId)
    );
    const unsub = onSnapshot(q, async (snap) => {
      const items: Invite[] = [];
      for (const d of snap.docs) {
        const data = d.data() as any;
        const participants: string[] = data.participants || [];
        if (participants.includes(userId)) continue;

        let hostName = t('battleInvite.unknownHost', 'Zawodnik');
        let hostClub = '';
        try {
          const hostSnap = await getDoc(doc(db, 'users', data.hostId));
          if (hostSnap.exists()) {
            const c = hostSnap.data();
            const first = c.firstName || '';
            const last = c.lastName || '';
            hostName = `${first} ${last}`.trim() || c.nickname || hostName;
            hostClub = c.clubName || c.club || '';
          }
        } catch (e) {
          console.warn('Nie udało się pobrać danych hosta:', e);
        }

        items.push({
          id: d.id,
          hostId: data.hostId,
          mode: data.mode,
          distance: data.distance,
          targetType: data.targetType,
          hostName,
          hostClub,
        });
      }
      setInvites(items);
    }, (err) => {
      console.error('Battle invites listener error:', err);
    });
    return () => unsub();
  }, [userId, t]);

  const currentInvite = invites[0];

  const handleAccept = async () => {
    if (!currentInvite || busy) return;
    setBusy(true);
    try {
      await updateDoc(doc(db, 'battles', currentInvite.id), {
        participants: arrayUnion(userId),
        pendingInvites: arrayRemove(userId),
        [`liveScores.${userId}`]: 0,
      });
      if (onJoinBattle && currentInvite.distance && currentInvite.targetType) {
        onJoinBattle(currentInvite.id, currentInvite.distance, currentInvite.targetType);
      }
    } catch (e) {
      console.error('Accept battle invite failed:', e);
    } finally {
      setBusy(false);
    }
  };

  const handleReject = async () => {
    if (!currentInvite || busy) return;
    setBusy(true);
    try {
      await updateDoc(doc(db, 'battles', currentInvite.id), {
        pendingInvites: arrayRemove(userId),
        [`participantsData.${userId}`]: deleteField(),
      });
    } catch (e) {
      console.error('Reject battle invite failed:', e);
    } finally {
      setBusy(false);
    }
  };

  if (!currentInvite) return null;

  return createPortal(
    <div className="fixed inset-0 z-[40000] bg-black/60 flex items-center justify-center p-6 animate-fade-in-up">
      <div className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl">
        <div className="flex justify-center mb-4">
          <div className="w-14 h-14 rounded-full bg-amber-50 flex items-center justify-center border-2 border-amber-100">
            <span className="material-symbols-outlined text-amber-500 text-3xl">swords</span>
          </div>
        </div>
        <h2 className="text-center text-lg font-black text-[#0a3a2a] mb-2">
          {t('battleInvite.title', 'Zaproszenie do pojedynku')}
        </h2>
        <p className="text-center text-sm font-bold text-gray-600 mb-1">
          {t('battleInvite.message', '{{name}} zaprasza Cię do pojedynku.', { name: currentInvite.hostName })}
        </p>
        {currentInvite.hostClub && (
          <p className="text-center text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-3">
            {currentInvite.hostClub}
          </p>
        )}
        <div className="flex justify-center gap-4 mb-6 text-[11px] font-bold text-gray-500 uppercase tracking-widest">
          {currentInvite.mode && <span>{currentInvite.mode}</span>}
          {currentInvite.distance && <span>{currentInvite.distance}</span>}
          {currentInvite.targetType && <span>{currentInvite.targetType}</span>}
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleReject}
            disabled={busy}
            className="flex-1 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest text-gray-500 bg-gray-100 active:scale-95 transition-all disabled:opacity-50"
          >
            {t('battleInvite.reject', 'Odrzuć')}
          </button>
          <button
            onClick={handleAccept}
            disabled={busy}
            className="flex-[2] py-3 rounded-xl font-black text-[10px] uppercase tracking-widest text-white bg-[#0a3a2a] shadow-md active:scale-95 transition-all disabled:opacity-50"
          >
            {busy ? '...' : t('battleInvite.accept', 'Akceptuj')}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
