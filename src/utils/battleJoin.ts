import { doc, getDoc, updateDoc, arrayUnion } from 'firebase/firestore';
import { db } from '../firebase';

/**
 * Dopisuje `uid` do bitwy (reguła JOIN w firestore.rules: tylko siebie, na
 * koniec listy). Wołane dopiero PO potwierdzeniu w oknie dołączania —
 * wcześniej sam klik w grę na Home dopisywał gracza, więc „Anuluj" zostawiał
 * go w grze (user 2026-10-21).
 *
 * Nazwa i klub według flag prywatności, jak w lobby — trafiają do
 * participantsData, z którego czyta ranking (bez dodatkowych odczytów).
 */
export async function joinBattleAsSelf(battleId: string, uid: string, labels: { archer: string; unaffiliated: string }): Promise<void> {
  const userSnap = await getDoc(doc(db, 'users', uid));
  const ud = userSnap.exists() ? userSnap.data() : {};
  const fName = ud.firstName || '';
  const lName = ud.lastName || '';
  const nick = ud.nickname || '';
  const showFull = ud.showFullName !== false;
  const showNick = ud.showNickname !== false;
  let displayName = showFull ? `${fName} ${lName}`.trim() : `${fName} ${lName ? lName.charAt(0) + '.' : ''}`.trim();
  if (showNick && nick) displayName = fName ? `${fName} "${nick}" ${showFull ? lName : (lName ? lName.charAt(0) + '.' : '')}`.trim() : nick;
  if (!displayName) displayName = nick || labels.archer;

  const clubParts: string[] = [];
  if (ud.showClub !== false && ud.clubName) clubParts.push(ud.clubName);
  if (ud.showRegion !== false && ud.clubCity) clubParts.push(ud.clubCity);

  await updateDoc(doc(db, 'battles', battleId), {
    participants: arrayUnion(uid),
    [`liveScores.${uid}`]: 0,
    [`participantsData.${uid}`]: {
      name: displayName,
      club: clubParts.join(' - ') || labels.unaffiliated,
      country: ud.countryCode || 'PL'
    }
  });
}
