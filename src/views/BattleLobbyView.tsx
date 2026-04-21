import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { db } from '../firebase';
import WorldQueueView from './WorldQueueView';
import { doc, setDoc, onSnapshot, collection, query, where, getDocs, updateDoc, arrayUnion, arrayRemove, getDoc, deleteDoc, deleteField } from 'firebase/firestore';
import { Html5Qrcode } from 'html5-qrcode';
import { useTranslation } from 'react-i18next';

interface BattleLobbyViewProps {
  userId: string;
  distance: string;
  targetType: string;
  onStartBattle: (battleId: string) => void;
  onBack?: () => void;
}

type BattleMode = 'LOCAL' | 'CLUB' | 'WORLD';

export default function BattleLobbyView({ userId, distance, targetType, onStartBattle, onBack }: BattleLobbyViewProps) {
  const { t } = useTranslation();
  const [battleId, setBattleId] = useState<string>('');
  const [participants, setParticipants] = useState<any[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [cameraError, setCameraError] = useState(false);
  const [manualJoinId, setManualJoinId] = useState('');
  const [battleData, setBattleData] = useState<any>(null);
  const [battleMode, setBattleMode] = useState<BattleMode>('LOCAL');
  
  const [isPremium, setIsPremium] = useState(false); 
  const [hostIsPremium, setHostIsPremium] = useState(false);

  const [isPrivacyModalOpen, setIsPrivacyModalOpen] = useState(false);
  const [currentUserData, setCurrentUserData] = useState<any>(null);
  const [showFullName, setShowFullName] = useState(true);
  const [showClub, setShowClub] = useState(true);
  const [showRegion, setShowRegion] = useState(true);
  const [showNickname, setShowNickname] = useState(true); 

  // NOWY STAN: Blokuje zapis do bazy, dopóki gracz nie kliknie "Utwórz Grę"
  const [isGameCreated, setIsGameCreated] = useState(false);

  // WORLD matchmaking — pokazuje ekran oczekiwania zamiast tworzenia lobby
  const [showWorldQueue, setShowWorldQueue] = useState(false);

  // Gracze-goście (bez konta, tylko dla LOCAL)
  const [guestNames, setGuestNames] = useState<string[]>([]);

  // WORLD cooldown dla FREE użytkowników (raz na 2 dni)
  const [lastWorldBattleAt, setLastWorldBattleAt] = useState<string | null>(null);
  const [showWorldCooldownModal, setShowWorldCooldownModal] = useState(false);

  // THE TARGET SERIES — poziom hosta do matchmakingu
  const [userLevel, setUserLevel] = useState(1);

  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const showToast = (msg: string) => { setToastMessage(msg); setTimeout(() => setToastMessage(null), 3500); };

  const formatUserName = (userData: any, showFull: boolean, showNick: boolean) => {
    if (!userData) return '';
    const fName = userData.firstName || '';
    const lName = userData.lastName || '';
    const nick = userData.nickname || '';

    const baseName = showFull
      ? `${fName} ${lName}`.trim()
      : `${fName} ${lName ? lName.charAt(0) + '.' : ''}`.trim();

    if (showNick && nick) {
       if (baseName) return `${fName} "${nick}" ${showFull ? lName : (lName ? lName.charAt(0) + '.' : '')}`.trim();
       return nick; 
    }
    if (!baseName && nick && !showNick) return t('battleLobby.archer');
    return baseName || nick; 
  };

  const formatUserClub = (userData: any, showCl: boolean, showReg: boolean) => {
    if (!userData) return '';
    const cName = userData.clubName || '';
    const cCity = userData.clubCity || '';
    
    const parts = [];
    if (showCl && cName) parts.push(cName);
    if (showReg && cCity) parts.push(cCity);
    
    if (parts.length === 0) return t('battleLobby.unaffiliated');
    return parts.join(' - ');
  };

  // EFEKT 1: Inicjalizacja Lobby (odczyt profilu i stanu gier, BEZ PRZEDWCZESNEGO ZAPISU)
  useEffect(() => {
    let isMounted = true;

    const initLobby = async () => {
      const userSnap = await getDoc(doc(db, 'users', userId));
      if (!isMounted) return;

      const ud = userSnap.exists() ? userSnap.data() : {};
      
      setCurrentUserData(ud);
      setShowFullName(ud.showFullName !== false);
      setShowClub(ud.showClub !== false);
      setShowRegion(ud.showRegion !== false);
      setShowNickname(ud.showNickname !== false);
      
      const isBought = ud.isPremium || false;
      const isPromo = ud.isPremiumPromo || false;
      let isTrial = false;
      if (ud.trialEndsAt) {
          isTrial = new Date(ud.trialEndsAt).getTime() > Date.now();
      }
      const currentUserIsPro = isBought || isPromo || isTrial;

      setIsPremium(currentUserIsPro);
      setLastWorldBattleAt(ud.lastWorldBattleAt || null);
      setUserLevel(ud.level || 1);

      const q = query(
        collection(db, 'battles'), 
        where('participants', 'array-contains', userId), 
        where('status', 'in', ['LOBBY', 'ACTIVE'])
      );
      const existing = await getDocs(q);
      
      if (!isMounted) return;

      let currentId = '';
      let shouldCreateNew = true;

      if (!existing.empty) {
        for (const docSnap of existing.docs) {
          const data = docSnap.data();
          
          if (data.hostId === userId && data.status === 'LOBBY') {
            await updateDoc(doc(db, 'battles', docSnap.id), { status: 'ABANDONED' });
            continue; 
          }

          const isTooOld = data.createdAt ? (Date.now() - new Date(data.createdAt).getTime() > 6 * 60 * 60 * 1000) : false;
          if (isTooOld) {
            if (data.hostId === userId) await updateDoc(doc(db, 'battles', docSnap.id), { status: 'ABANDONED' });
            continue; 
          }

          currentId = docSnap.id;
          setBattleMode(data.mode || 'LOCAL');
          setHostIsPremium(data.hostIsPremium || false);
          shouldCreateNew = false;
          break;
        }
      }

      if (shouldCreateNew) {
        // Zamiast pisać do Firebase, przygotowujemy tylko ekran lokalnie
        currentId = Math.random().toString(36).substring(2, 8).toUpperCase();
        setBattleId(currentId);
        setBattleMode('LOCAL');
        setHostIsPremium(currentUserIsPro);
        setIsGameCreated(false);
        setParticipants([{
          id: userId,
          name: formatUserName(ud, ud.showFullName !== false, ud.showNickname !== false) || t('battleLobby.archer'),
          club: formatUserClub(ud, ud.showClub !== false, ud.showRegion !== false) || t('battleLobby.unaffiliated'),
          country: ud.countryCode || 'PL'
        }]);
      } else {
        setBattleId(currentId);
        setIsGameCreated(true);
      }
    };

    initLobby();

    return () => { isMounted = false; };
  }, [userId, distance, targetType, t]);

  // EFEKT 2: Uruchomienie nasłuchiwania z Firebase (dopiero GDY GRA ZOSTANIE UTWORZONA)
  useEffect(() => {
    let isMounted = true;
    let unsubscribeSnapshot: (() => void) | undefined;

    if (isGameCreated && battleId) {
      unsubscribeSnapshot = onSnapshot(doc(db, 'battles', battleId), async (snapshot) => {
        if (!isMounted) return;
        
        if (snapshot.exists()) {
          const data = snapshot.data();
          setBattleData(data);
          setBattleMode(data.mode); 
          setHostIsPremium(data.hostIsPremium || false);
          
          // Dane uczestników z denormalizowanego pola — zero dodatkowych reads
          const memberDetails = data.participants.map((pId: string) => {
            const pd = data.participantsData?.[pId] || {};
            return {
              id: pId,
              name: pd.name || t('battleLobby.archer'),
              club: pd.club || t('battleLobby.unaffiliated'),
              country: pd.country || 'PL'
            };
          });
          setParticipants(memberDetails);

          if (data.status === 'START') {
            onStartBattle(battleId);
          }
        }
      });
    }

    return () => {
      isMounted = false;
      if (unsubscribeSnapshot) unsubscribeSnapshot();
    };
  }, [isGameCreated, battleId, t, onStartBattle]);

  // FUNKCJA PUBLIKUJĄCA: Strzela do bazy dopiero po kliknięciu "Utwórz Grę"
  const createBattleInDB = async () => {
    const now = new Date();
    let expiresAt = null;
    if (battleMode === 'CLUB') expiresAt = new Date(now.getTime() + 3 * 60 * 60 * 1000).toISOString(); 
    if (battleMode === 'WORLD') expiresAt = new Date(now.getTime() + 10 * 60 * 1000).toISOString();

    const hostName = formatUserName(currentUserData, showFullName, showNickname) || t('battleLobby.archer');
    const hostClub = formatUserClub(currentUserData, showClub, showRegion) || t('battleLobby.unaffiliated');
    const hostCountry = currentUserData?.countryCode || 'PL';

    const validGuests = guestNames.filter(n => n.trim());
    const guestsPayload = validGuests.map((name, i) => ({
      guestId: `guest_${battleId}_${i}`,
      name: name.trim()
    }));
    const guestLiveScores = Object.fromEntries(
      validGuests.map((_, i) => [`guest_${battleId}_${i}`, 0])
    );

    await setDoc(doc(db, 'battles', battleId), {
      hostId: userId,
      hostName,
      hostClub,
      hostCountry,
      hostIsPremium: isPremium,
      hostLevel: userLevel,
      status: battleMode === 'LOCAL' ? 'LOBBY' : 'ACTIVE',
      mode: battleMode,
      isPublic: battleMode === 'WORLD',
      expiresAt: expiresAt,
      distance,
      targetType,
      participants: [userId],
      liveScores: { [userId]: 0, ...guestLiveScores },
      guests: guestsPayload,
      // Denormalizacja — dane uczestników do wyświetlenia bez N+1 reads
      participantsData: {
        [userId]: { name: hostName, club: hostClub, country: hostCountry }
      },
      createdAt: now.toISOString()
    });

    // Zapisz czas ostatniej gry WORLD dla FREE użytkowników (throttling)
    if (battleMode === 'WORLD' && !isPremium) {
      const nowISO = now.toISOString();
      await updateDoc(doc(db, 'users', userId), { lastWorldBattleAt: nowISO });
      setLastWorldBattleAt(nowISO);
    }

    setIsGameCreated(true);
  };

  const [confirmCancelGame, setConfirmCancelGame] = useState(false);
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);

  const cancelGame = async () => {
    if (!battleId || !battleData) return;
    if (battleData.hostId !== userId) return;
    try {
      await deleteDoc(doc(db, 'battles', battleId));
    } catch (e) {
      console.error('Cancel game error:', e);
    }
    setConfirmCancelGame(false);
    if (onBack) onBack();
  };

  const removeParticipant = async (participantId: string) => {
    if (!battleId || !battleData) return;
    if (battleData.hostId !== userId) return;
    if (participantId === userId) return;
    try {
      await updateDoc(doc(db, 'battles', battleId), {
        participants: arrayRemove(participantId),
        [`liveScores.${participantId}`]: deleteField(),
        [`participantsData.${participantId}`]: deleteField(),
      });
    } catch (e) {
      console.error('Remove participant error:', e);
    }
    setConfirmRemoveId(null);
  };

  const removeGuest = (index: number) => {
    setGuestNames(prev => prev.filter((_, i) => i !== index));
  };

  const togglePrivacy = async (field: 'showFullName' | 'showClub' | 'showRegion' | 'showNickname', newValue: boolean) => {
    if (field === 'showFullName') setShowFullName(newValue);
    if (field === 'showClub') setShowClub(newValue);
    if (field === 'showRegion') setShowRegion(newValue);
    if (field === 'showNickname') setShowNickname(newValue);

    const updatedUserData = { ...currentUserData, [field]: newValue };
    setCurrentUserData(updatedUserData);

    await setDoc(doc(db, 'users', userId), { [field]: newValue }, { merge: true });

    if (isGameCreated && battleData?.hostId === userId) {
      const newName = formatUserName(updatedUserData, field === 'showFullName' ? newValue : showFullName, field === 'showNickname' ? newValue : showNickname) || t('battleLobby.archer');
      const newClub = formatUserClub(updatedUserData, field === 'showClub' ? newValue : showClub, field === 'showRegion' ? newValue : showRegion) || t('battleLobby.unaffiliated');
      await updateDoc(doc(db, 'battles', battleId), {
        hostName: newName,
        hostClub: newClub,
        [`participantsData.${userId}.name`]: newName,
        [`participantsData.${userId}.club`]: newClub,
      });
    }
  };

  const getFlagEmoji = (countryCode: string) => {
      const code = countryCode?.toUpperCase();
      if (!code) return '';
      const codePoints = code.split('').map(char => 127397 + char.charCodeAt(0));
      return String.fromCodePoint(...codePoints);
  };

  useEffect(() => {
    let html5QrCode: Html5Qrcode;
    if (isScanning && isGameCreated) {
      html5QrCode = new Html5Qrcode("reader");
      html5QrCode.start(
        { facingMode: "environment" }, 
        { fps: 10, qrbox: { width: 250, height: 250 } },
        async (decodedText) => {
          const maxAllowed = isPremium ? 4 : 2;
          const pendingInvites: string[] = battleData?.pendingInvites || [];
          if (participants.length + pendingInvites.length < maxAllowed
              && !participants.some(p => p.id === decodedText)
              && !pendingInvites.includes(decodedText)
              && decodedText !== userId) {
            const scannedSnap = await getDoc(doc(db, 'users', decodedText));
            const sd = scannedSnap.exists() ? scannedSnap.data() : {};
            await updateDoc(doc(db, 'battles', battleId), {
              pendingInvites: arrayUnion(decodedText),
              [`participantsData.${decodedText}`]: {
                name: formatUserName(sd, sd.showFullName !== false, sd.showNickname !== false) || t('battleLobby.archer'),
                club: formatUserClub(sd, sd.showClub !== false, sd.showRegion !== false) || t('battleLobby.unaffiliated'),
                country: sd.countryCode || 'PL'
              }
            });
            showToast(t('battleLobby.inviteSent', 'Zaproszenie wysłane'));
          }
          html5QrCode.stop().then(() => html5QrCode.clear());
          setIsScanning(false);
        },
        () => {}
      ).catch(() => setCameraError(true));
      return () => { if (html5QrCode?.isScanning) html5QrCode.stop(); };
    }
  }, [isScanning, isGameCreated, battleId, isPremium, participants]);

  // [SYNC] Synchronizuj lokalną listę gości z Firestore po utworzeniu gry.
  // Debounce 400ms — żeby nie pisać przy każdym wpisanym znaku.
  useEffect(() => {
    if (!isGameCreated || !battleId || battleData?.hostId !== userId) return;
    const timer = setTimeout(() => {
      const validGuests = guestNames.filter(n => n.trim());
      const guestsPayload = validGuests.map((name, i) => ({
        guestId: `guest_${battleId}_${i}`,
        name: name.trim()
      }));
      // Scal liveScores: zachowaj istniejące wyniki, usuń dla zniknietych gości,
      // dodaj 0 dla nowych.
      const existingLiveScores = (battleData?.liveScores || {}) as Record<string, number>;
      const newGuestIds = new Set(guestsPayload.map(g => g.guestId));
      const merged: Record<string, number> = {};
      Object.keys(existingLiveScores).forEach(k => {
        if (!k.startsWith(`guest_${battleId}_`) || newGuestIds.has(k)) {
          merged[k] = existingLiveScores[k];
        }
      });
      guestsPayload.forEach(g => {
        if (merged[g.guestId] === undefined) merged[g.guestId] = 0;
      });
      updateDoc(doc(db, 'battles', battleId), {
        guests: guestsPayload,
        liveScores: merged
      }).catch(e => console.error('Sync guests failed:', e));
    }, 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guestNames, isGameCreated, battleId, userId]);

  const isWorldOnCooldown = (): boolean => {
    if (isPremium) return false;
    if (!lastWorldBattleAt) return false;
    const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000;
    return Date.now() - new Date(lastWorldBattleAt).getTime() < TWO_DAYS_MS;
  };

  const getWorldCooldownHoursLeft = (): number => {
    if (!lastWorldBattleAt) return 0;
    const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000;
    const elapsed = Date.now() - new Date(lastWorldBattleAt).getTime();
    return Math.ceil((TWO_DAYS_MS - elapsed) / (60 * 60 * 1000));
  };

  const changeMode = async (newMode: BattleMode) => {
    if (newMode === 'CLUB' && !isPremium) return;
    if (newMode === 'WORLD' && isWorldOnCooldown()) {
      setShowWorldCooldownModal(true);
      return;
    }

    setBattleMode(newMode);
    
    // Jeśli gra już jest w Firebase, zaktualizuj ją na żywo
    if (isGameCreated) {
      const now = new Date();
      let expiresAt = null;
      if (newMode === 'CLUB') expiresAt = new Date(now.getTime() + 3 * 60 * 60 * 1000).toISOString(); 
      if (newMode === 'WORLD') expiresAt = new Date(now.getTime() + 10 * 60 * 1000).toISOString(); 
      
      await updateDoc(doc(db, 'battles', battleId), { 
          mode: newMode,
          isPublic: newMode === 'WORLD',
          expiresAt: expiresAt,
          status: newMode === 'LOCAL' ? 'LOBBY' : 'ACTIVE'
      });
    }
  };

  const getFriendlyTargetName = (type: string) => {
    if (type === 'Full') return '122cm';
    if (type === 'WA 80cm') return '80cm';
    if (type === '40cm') return '40cm'; 
    if (type === '3-Spot') return '3-Spot';
    return type;
  };

  const maxLocalParticipants = isPremium ? 4 : 2;
  const isLocalFull = battleMode === 'LOCAL' && participants.length >= maxLocalParticipants;

  const renderSlots = () => {
    const maxSlots = battleMode === 'CLUB' ? 12 : 4;
    const slots = [];
    
    for (let i = 0; i < participants.length; i++) {
      const p = participants[i];
      const isProSlot = (battleMode === 'LOCAL' || battleMode === 'WORLD') && i >= 2;
      const isMe = p.id === userId;
      const displayName = isMe ? formatUserName(currentUserData, showFullName, showNickname) : p.name;
      const displayClub = isMe ? formatUserClub(currentUserData, showClub, showRegion) : p.club;
      const flag = getFlagEmoji(p.country || 'PL');

      slots.push(
        <div key={p.id} className="bg-white/5 border border-white/10 p-3 rounded-[20px] flex items-center justify-between shadow-sm animate-fade-in relative overflow-hidden">
          <div className="flex items-center gap-3 relative z-10">
            <div className="w-8 h-8 bg-indigo-600 rounded-xl flex items-center justify-center font-black text-sm">{i + 1}</div>
            <div>
               <p className="font-black text-sm leading-none mb-0.5 flex items-center gap-1.5">
                 {flag} {displayName}
               </p>
               <p className="text-[9px] font-bold text-gray-400 uppercase tracking-tight">{displayClub}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 relative z-10 shrink-0">
             {isProSlot && <span className="bg-[#F2C94C] text-[#8B6508] text-[7px] font-black px-1.5 py-0.5 rounded-md uppercase tracking-wider shadow-sm">PRO</span>}
             {p.id === battleData?.hostId && <span className="text-[7px] font-black bg-indigo-50/20 text-indigo-400 border border-indigo-500/30 px-2 py-0.5 rounded-md uppercase">{t('battleLobby.host')}</span>}
             {battleData?.hostId === userId && p.id !== userId && battleData?.status !== 'START' && (
               <button
                 onClick={() => setConfirmRemoveId(p.id)}
                 className="w-7 h-7 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center justify-center text-red-400 active:scale-90 transition-all"
                 title={t('battleLobby.removePlayer', 'Usuń gracza')}
               >
                 <span className="material-symbols-outlined text-[14px]">close</span>
               </button>
             )}
          </div>
        </div>
      );
    }

    // Pending invites (awaiting acceptance)
    const pendingInvites: string[] = battleData?.pendingInvites || [];
    pendingInvites.forEach((pid) => {
      const pdata = battleData?.participantsData?.[pid] || {};
      slots.push(
        <div key={`pending-${pid}`} className="bg-yellow-500/5 border border-yellow-500/30 p-3 rounded-[20px] flex items-center justify-between shadow-sm animate-fade-in relative overflow-hidden">
          <div className="flex items-center gap-3 relative z-10">
            <div className="w-8 h-8 bg-yellow-500/30 rounded-xl flex items-center justify-center">
              <span className="material-symbols-outlined text-yellow-300 text-[18px] animate-pulse">hourglass_top</span>
            </div>
            <div>
              <p className="font-black text-sm leading-none mb-0.5">{pdata.name || pid}</p>
              <p className="text-[9px] font-bold text-yellow-400 uppercase tracking-tight">
                {t('battleLobby.awaitingAcceptance', 'Oczekuje akceptacji...')}
              </p>
            </div>
          </div>
          {battleData?.hostId === userId && battleData?.status !== 'START' && (
            <button
              onClick={async () => {
                await updateDoc(doc(db, 'battles', battleId), {
                  pendingInvites: arrayRemove(pid),
                  [`participantsData.${pid}`]: deleteField(),
                });
              }}
              className="w-7 h-7 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center justify-center text-red-400 active:scale-90 transition-all"
            >
              <span className="material-symbols-outlined text-[14px]">close</span>
            </button>
          )}
        </div>
      );
    });

    // Guest slots (LOCAL mode, named guests)
    if (battleMode === 'LOCAL') {
      guestNames.forEach((name, gi) => {
        if (name.trim()) {
          slots.push(
            <div key={`guest-${gi}`} className="bg-violet-500/10 border border-violet-500/30 p-3 rounded-[20px] flex items-center justify-between shadow-sm animate-fade-in relative overflow-hidden">
              <div className="flex items-center gap-3 relative z-10">
                <div className="w-8 h-8 bg-violet-600/40 rounded-xl flex items-center justify-center">
                  <span className="material-symbols-outlined text-violet-300 text-[18px]">person</span>
                </div>
                <div>
                  <p className="font-black text-sm leading-none mb-0.5">{name.trim()}</p>
                  <p className="text-[9px] font-bold text-violet-400 uppercase tracking-tight">👤 GOŚĆ</p>
                </div>
              </div>
            </div>
          );
        }
      });
    }

    if (battleMode === 'CLUB') {
      if (participants.length < maxSlots) {
        slots.push(
          <div key="club-empty-info" className="border border-dashed border-fuchsia-500/30 bg-fuchsia-500/5 p-3 rounded-[20px] flex items-center justify-center transition-all opacity-90 mt-1">
             <span className="material-symbols-outlined text-fuchsia-400 text-lg mr-2 animate-pulse">group_add</span>
             <span className="text-[10px] font-black uppercase tracking-widest text-fuchsia-400">
               {t('battleLobby.waitingForPlayers', 'Oczekujemy na graczy')} ({participants.length} / 12)
             </span>
          </div>
        );
      }
    } else {
      for (let i = participants.length; i < maxSlots; i++) {
        const isProSlot = (battleMode === 'LOCAL' || battleMode === 'WORLD') && i >= 2;
        slots.push(
          <div key={`empty-${i}`} className={`border border-dashed p-3 rounded-[20px] flex items-center justify-between transition-all ${isProSlot && !isPremium ? 'border-gray-700 bg-gray-900/40 opacity-50' : 'border-white/10 bg-white/5 opacity-40'}`}>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 border border-dashed border-white/20 rounded-xl flex items-center justify-center font-black text-sm text-white/30">{i + 1}</div>
              <span className="text-[9px] font-black uppercase tracking-widest text-gray-400">---</span>
            </div>
            {isProSlot && (
              <span className={`text-[7px] font-black px-1.5 py-0.5 rounded-md uppercase tracking-wider shadow-sm ${isPremium ? 'bg-[#F2C94C] text-[#8B6508]' : 'bg-gray-700 text-gray-400 border border-gray-600'}`}>
                PRO
              </span>
            )}
          </div>
        );
      }
    }

    return slots;
  };

  return (
    <div className="min-h-screen bg-[#0a0f1a] text-white p-4 pt-10 flex flex-col animate-fade-in overflow-y-auto pb-24">
      {/* Header — tylko back button */}
      <div className="flex items-center mb-3">
        <button
          onClick={() => { if (onBack) onBack(); }}
          className="w-10 h-10 bg-white/5 border border-white/10 rounded-xl flex items-center justify-center active:scale-90"
        >
          <span className="material-symbols-outlined text-lg">arrow_back</span>
        </button>
      </div>

      <div className="bg-indigo-600/10 border border-indigo-500/20 rounded-2xl p-2.5 mb-4 flex items-center justify-center gap-3">
        <span className="material-symbols-outlined text-indigo-400 text-2xl">target</span>
        <div className="text-center">
          <p className="text-[9px] font-black uppercase text-indigo-300 tracking-widest leading-none mb-1">{t('setup.targetTitle')}</p>
          <p className="text-lg font-black text-white leading-none">{getFriendlyTargetName(targetType)}</p>
        </div>
      </div>

      <div className="text-center mb-4">
        <div className="flex items-stretch justify-center gap-2 mx-auto max-w-[300px]">
          <div className="flex-1 bg-white/5 border border-white/10 rounded-[20px] py-2 flex flex-col items-center justify-center">
             <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-0.5">{t('battleHistory.title')} ID</span>
             <h1 className="text-3xl font-black tracking-widest text-indigo-400 leading-none">{battleId}</h1>
          </div>

          {battleMode === 'LOCAL' && (
             <button 
                onClick={() => {
                  if (!isGameCreated) {
                      showToast(t('battleLobby.createFirst', 'Zanim kogoś zeskanujesz, utwórz grę (przycisk na dole)!'));
                  } else if (!isLocalFull) {
                      setCameraError(false);
                      setManualJoinId('');
                      setIsScanning(true);
                  }
                }} 
                className={`w-[70px] rounded-[20px] flex flex-col items-center justify-center transition-all border ${
                  (isLocalFull || !isGameCreated) 
                    ? 'bg-red-500/10 border-red-500/30 text-red-500 opacity-50 cursor-not-allowed' 
                    : 'bg-indigo-500/10 border-indigo-500/30 text-indigo-400 active:scale-95'
                }`}
             >
               <span className="material-symbols-outlined text-2xl mb-1">
                 {(isLocalFull || !isGameCreated) ? 'block' : 'qr_code_scanner'}
               </span>
               <span className="text-[8px] font-black uppercase tracking-tighter">
                 {isLocalFull ? 'FULL' : t('battleLobby.scan')}
               </span>
             </button>
          )}
        </div>
      </div>

      {(!isGameCreated || userId === battleData?.hostId) && (
        <div className="mb-4 bg-black/30 p-2 rounded-[24px] border border-white/5">
          <div className="grid grid-cols-3 gap-2">
            
            <button onClick={() => changeMode('LOCAL')} className={`py-4 rounded-2xl border-2 flex flex-col items-center justify-center gap-1.5 transition-all ${battleMode === 'LOCAL' ? 'bg-indigo-600/20 border-indigo-500 text-indigo-400' : 'bg-white/5 border-transparent text-gray-500'}`}>
              <span className="material-symbols-outlined text-3xl">qr_code</span>
              <span className="font-black text-xs uppercase tracking-wider">{t('battleLobby.local')}</span>
              <span className="text-[10px] font-bold opacity-80">{isPremium ? 'Max 4' : 'Max 2 (Pro: 4)'}</span>
            </button>
            
            <button 
              onClick={() => isPremium && changeMode('CLUB')} 
              className={`py-4 rounded-2xl border-2 flex flex-col items-center justify-center gap-1.5 transition-all relative ${battleMode === 'CLUB' ? 'bg-fuchsia-600/20 border-fuchsia-500 text-fuchsia-400' : 'bg-white/5 border-transparent text-gray-500'} ${!isPremium ? 'opacity-50' : ''}`}
            >
              {!isPremium && <span className="absolute top-2 right-2 bg-gray-700 text-gray-400 border border-gray-600 text-[7px] font-black px-1.5 py-0.5 rounded-md uppercase tracking-wider">PRO</span>}
              {isPremium && <span className="absolute top-2 right-2 bg-[#F2C94C] text-[#8B6508] text-[7px] font-black px-1.5 py-0.5 rounded-md uppercase tracking-wider shadow-sm">PRO</span>}
              <span className="material-symbols-outlined text-3xl">shield</span>
              <span className="font-black text-xs uppercase tracking-wider">{t('battleLobby.club')}</span>
              <span className={`text-[10px] font-bold ${!isPremium ? 'text-fuchsia-500' : 'opacity-80'}`}>{!isPremium ? 'PRO ONLY' : 'Max 12'}</span>
            </button>

            <button
              disabled
              aria-disabled="true"
              className="py-4 rounded-2xl border-2 border-transparent bg-white/5 text-gray-600 flex flex-col items-center justify-center gap-1.5 relative opacity-50 cursor-not-allowed"
            >
              <span className="absolute top-2 right-2 bg-gray-700 text-gray-300 border border-gray-600 text-[7px] font-black px-1.5 py-0.5 rounded-md uppercase tracking-wider">
                {t('battleLobby.comingSoon', 'Soon')}
              </span>
              <span className="material-symbols-outlined text-3xl">public</span>
              <span className="font-black text-xs uppercase tracking-wider">{t('battleLobby.world')}</span>
              <span className="text-[10px] font-bold opacity-70">
                {t('battleLobby.comingSoonFull', 'Wkrótce')}
              </span>
            </button>
            
          </div>
        </div>
      )}

      {/* Info o aktualnym trybie */}
      <div className="mb-4 flex items-start gap-2 bg-white/5 border border-white/10 rounded-2xl px-4 py-3">
        <span className="material-symbols-outlined text-indigo-400 text-base shrink-0 mt-0.5">info</span>
        <p className="text-[11px] text-gray-400 font-medium leading-relaxed">
          {battleMode === 'LOCAL' && t('battleLobby.modeInfoLocal')}
          {battleMode === 'CLUB'  && t('battleLobby.modeInfoClub')}
          {battleMode === 'WORLD' && t('battleLobby.modeInfoWorld')}
        </p>
      </div>

      <div className="flex-1 space-y-2">
        {renderSlots()}
      </div>

      {battleMode === 'LOCAL' && (
        <div className={`mt-4 bg-black/30 border border-white/10 rounded-[20px] p-3 space-y-2 transition-opacity ${!isGameCreated ? 'opacity-40' : ''}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm">👤</span>
              <span className="text-[10px] font-black uppercase tracking-widest text-gray-300">
                {t('battleLobby.phonelessPlayers')}
              </span>
              {guestNames.filter(n => n.trim()).length > 0 && (
                <span className="text-[9px] font-bold text-violet-400">
                  ({guestNames.filter(n => n.trim()).length} {t('battleLobby.guests', 'gości')})
                </span>
              )}
            </div>
            <button
              onClick={() => {
                if (!isGameCreated) {
                  showToast(t('battleLobby.createFirst', 'Zanim dodasz gracza, utwórz grę (przycisk na dole)!'));
                  return;
                }
                const freeSlots = maxLocalParticipants - participants.length - guestNames.length;
                if (freeSlots > 0) {
                  setGuestNames(prev => [...prev, '']);
                }
              }}
              className="w-7 h-7 bg-violet-600/30 border border-violet-500/40 rounded-lg flex items-center justify-center text-violet-300 active:scale-90 transition-all font-black text-lg leading-none disabled:opacity-40"
              disabled={!isGameCreated || (maxLocalParticipants - participants.length - guestNames.length <= 0)}
            >
              +
            </button>
          </div>
          {guestNames.map((name, gi) => (
            <div key={gi} className="flex items-center gap-2">
              <input
                type="text"
                value={name}
                onChange={e => setGuestNames(prev => prev.map((n, i) => i === gi ? e.target.value : n))}
                placeholder={t('battleLobby.guestNamePlaceholder', 'Imię gracza...')}
                className="flex-1 bg-black/30 border border-white/10 text-white placeholder:text-gray-600 rounded-xl px-3 py-2 text-sm font-bold outline-none focus:border-violet-500/50 transition-all"
              />
              <button
                onClick={() => setGuestNames(prev => prev.filter((_, i) => i !== gi))}
                className="w-8 h-8 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center justify-center text-red-400 active:scale-90 transition-all shrink-0"
              >
                <span className="material-symbols-outlined text-[16px]">close</span>
              </button>
            </div>
          ))}
          {guestNames.length === 0 && (
            <p className="text-[9px] text-gray-600 font-bold text-center uppercase tracking-widest py-1">
              {t('battleLobby.addGuestDesc')}
            </p>
          )}
        </div>
      )}

      <div className="mt-4 pt-3 border-t border-white/10 flex items-center gap-3">
        <button
          onClick={() => {
            if (!isGameCreated) {
              if (battleMode === 'WORLD') {
                setShowWorldQueue(true);
              } else {
                createBattleInDB();
              }
            } else if (battleData?.hostId === userId) {
              updateDoc(doc(db, 'battles', battleId), { status: 'START' });
            }
          }}
          className={`flex-1 py-4 text-white rounded-[20px] font-black uppercase tracking-[0.1em] text-sm shadow-xl active:scale-95 transition-all disabled:opacity-30 ${!isGameCreated ? 'bg-indigo-500' : 'bg-indigo-600'}`}
          disabled={(isGameCreated && battleMode === 'LOCAL' && (participants.length + guestNames.filter(n => n.trim()).length) < 2) && userId === battleData?.hostId}
        >
          {!isGameCreated 
            ? t('battleLobby.create', 'UTWÓRZ GRĘ') 
            : (userId === battleData?.hostId ? t('battleLobby.startChallenge') : t('battleLobby.waitingForHost'))}
        </button>
        
        <button 
          onClick={() => setIsPrivacyModalOpen(true)}
          className="w-14 h-14 bg-white/5 border border-white/10 rounded-[20px] flex items-center justify-center text-gray-400 active:scale-95 transition-all hover:bg-white/10 shrink-0"
        >
          <span className="material-symbols-outlined text-2xl">settings_accessibility</span>
        </button>
      </div>

      {isGameCreated && battleData?.hostId === userId && battleData?.status !== 'START' && (
        <button
          onClick={() => setConfirmCancelGame(true)}
          className="mt-3 w-full py-3 bg-red-500/10 border border-red-500/20 rounded-[20px] flex items-center justify-center gap-2 text-red-400 active:scale-95 text-[11px] font-black uppercase tracking-widest"
        >
          <span className="material-symbols-outlined text-base">delete</span>
          {t('battleLobby.cancelGame', 'Anuluj grę')}
        </button>
      )}

      {isPrivacyModalOpen && (
        <div className="fixed inset-0 z-[200000] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-gray-900 border border-white/10 w-full max-w-md rounded-[32px] p-6 shadow-2xl transform transition-transform">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-lg font-black text-white">{t('battleLobby.privacyTitle')}</h2>
              <button onClick={() => setIsPrivacyModalOpen(false)} className="text-gray-400 p-2 active:scale-90 transition-transform">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            
            <div className="space-y-3">
               <label className="flex items-center gap-4 p-4 bg-white/5 border border-white/10 rounded-2xl cursor-pointer active:scale-[0.98] transition-all">
                 <input type="checkbox" checked={showFullName} onChange={e => togglePrivacy('showFullName', e.target.checked)} className="w-6 h-6 rounded border-gray-600 bg-gray-800 text-indigo-500 focus:ring-0 focus:ring-offset-0" />
                 <div className="flex flex-col">
                   <span className="text-xs font-black text-white">{t('battleLobby.privacyFullName')}</span>
                   <span className="text-[10px] font-bold text-gray-500 mt-0.5">{t('battleLobby.privacyFullNameDesc')}</span>
                 </div>
               </label>

               <label className="flex items-center gap-4 p-4 bg-white/5 border border-white/10 rounded-2xl cursor-pointer active:scale-[0.98] transition-all">
                 <input type="checkbox" checked={showNickname} onChange={e => togglePrivacy('showNickname', e.target.checked)} className="w-6 h-6 rounded border-gray-600 bg-gray-800 text-indigo-500 focus:ring-0 focus:ring-offset-0" />
                 <div className="flex flex-col">
                   <span className="text-xs font-black text-white">{t('battleLobby.privacyNickname')}</span>
                   <span className="text-[10px] font-bold text-gray-500 mt-0.5">{t('battleLobby.privacyNicknameDesc')}</span>
                 </div>
               </label>

               <label className="flex items-center gap-4 p-4 bg-white/5 border border-white/10 rounded-2xl cursor-pointer active:scale-[0.98] transition-all">
                 <input type="checkbox" checked={showClub} onChange={e => togglePrivacy('showClub', e.target.checked)} className="w-6 h-6 rounded border-gray-600 bg-gray-800 text-indigo-500 focus:ring-0 focus:ring-offset-0" />
                 <div className="flex flex-col">
                   <span className="text-xs font-black text-white">{t('battleLobby.privacyClub')}</span>
                   <span className="text-[10px] font-bold text-gray-500 mt-0.5">{t('battleLobby.unaffiliated')}?</span>
                 </div>
               </label>

               <label className="flex items-center gap-4 p-4 bg-white/5 border border-white/10 rounded-2xl cursor-pointer active:scale-[0.98] transition-all">
                 <input type="checkbox" checked={showRegion} onChange={e => togglePrivacy('showRegion', e.target.checked)} className="w-6 h-6 rounded border-gray-600 bg-gray-800 text-indigo-500 focus:ring-0 focus:ring-offset-0" />
                 <div className="flex flex-col">
                   <span className="text-xs font-black text-white">{t('battleLobby.privacyRegion')}</span>
                   <span className="text-[10px] font-bold text-gray-500 mt-0.5">City/Region</span>
                 </div>
               </label>
            </div>
            
            <p className="text-[10px] font-bold text-gray-500 text-center mt-6">
              {t('battleLobby.privacyAutoSave')}
            </p>
          </div>
        </div>
      )}

      {isScanning && (
        <div className="fixed inset-0 bg-[#0a0f1a]/95 backdrop-blur-md z-[100000] flex flex-col items-center justify-center p-6 animate-fade-in">
          {cameraError ? (
            <div className="w-full max-w-[280px] flex flex-col items-center gap-4">
              <span className="material-symbols-outlined text-red-400 text-5xl">no_photography</span>
              <p className="text-white font-black text-sm text-center">{t('battleLobby.cameraError', 'Brak dostępu do kamery')}</p>
              <p className="text-gray-400 text-xs text-center">{t('battleLobby.cameraErrorDesc', 'Wpisz UID uczestnika ręcznie:')}</p>
              <input
                type="text"
                value={manualJoinId}
                onChange={e => setManualJoinId(e.target.value)}
                placeholder="UID uczestnika..."
                className="w-full bg-white/10 border border-white/20 text-white rounded-xl px-4 py-3 text-sm font-bold outline-none focus:border-indigo-400"
                autoFocus
              />
              <button
                onClick={async () => {
                  if (!manualJoinId.trim()) return;
                  setIsScanning(false);
                  setCameraError(false);
                  const maxAllowed = isPremium ? 4 : 2;
                  const uid = manualJoinId.trim();
                  const pendingInvites: string[] = battleData?.pendingInvites || [];
                  if (participants.length + pendingInvites.length < maxAllowed
                      && !participants.some(p => p.id === uid)
                      && !pendingInvites.includes(uid)
                      && uid !== userId) {
                    const scannedSnap = await getDoc(doc(db, 'users', uid));
                    const sd = scannedSnap.exists() ? scannedSnap.data() : {};
                    await updateDoc(doc(db, 'battles', battleId), {
                      pendingInvites: arrayUnion(uid),
                      [`participantsData.${uid}`]: {
                        name: `${sd.firstName || ''} ${sd.lastName || ''}`.trim() || uid,
                        club: sd.clubName || '',
                        country: sd.countryCode || 'PL'
                      }
                    });
                    showToast(t('battleLobby.inviteSent', 'Zaproszenie wysłane'));
                  }
                  setManualJoinId('');
                }}
                disabled={!manualJoinId.trim()}
                className="w-full py-4 bg-indigo-500 text-white font-black uppercase text-xs rounded-xl disabled:opacity-40"
              >
                {t('battleLobby.addBtn', 'Dodaj uczestnika')}
              </button>
            </div>
          ) : (
            <div id="reader" className="w-full max-w-[280px] aspect-square rounded-[28px] overflow-hidden border-4 border-indigo-50 bg-black mb-6"></div>
          )}
          <button onClick={() => { setIsScanning(false); setCameraError(false); }} className="w-full max-w-[280px] py-4 mt-4 bg-red-500/10 text-red-500 font-black uppercase text-xs rounded-xl border border-red-500/20">{t('battleLobby.cancel')}</button>
        </div>
      )}

      {confirmCancelGame && createPortal(
        <div className="fixed inset-0 z-[300000] bg-black/70 backdrop-blur-sm flex items-center justify-center p-6 animate-fade-in">
          <div className="bg-gray-900 border border-white/10 w-full max-w-sm rounded-[28px] p-6 shadow-2xl">
            <div className="flex flex-col items-center text-center gap-3">
              <span className="material-symbols-outlined text-red-400 text-5xl">warning</span>
              <h3 className="text-lg font-black text-white">{t('battleLobby.cancelGameTitle', 'Anulować grę?')}</h3>
              <p className="text-[11px] text-gray-400 font-bold">{t('battleLobby.cancelGameDesc', 'Gra zostanie usunięta. Tej operacji nie można cofnąć.')}</p>
            </div>
            <div className="flex gap-2 mt-6">
              <button onClick={() => setConfirmCancelGame(false)} className="flex-1 py-3 bg-white/5 border border-white/10 rounded-xl font-black uppercase text-[10px] tracking-widest">
                {t('battleLobby.no', 'Nie')}
              </button>
              <button onClick={cancelGame} className="flex-1 py-3 bg-red-500 text-white rounded-xl font-black uppercase text-[10px] tracking-widest active:scale-95">
                {t('battleLobby.yesCancel', 'Tak, anuluj')}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {confirmRemoveId && createPortal(
        <div className="fixed inset-0 z-[300000] bg-black/70 backdrop-blur-sm flex items-center justify-center p-6 animate-fade-in">
          <div className="bg-gray-900 border border-white/10 w-full max-w-sm rounded-[28px] p-6 shadow-2xl">
            <div className="flex flex-col items-center text-center gap-3">
              <span className="material-symbols-outlined text-orange-400 text-5xl">person_remove</span>
              <h3 className="text-lg font-black text-white">{t('battleLobby.removePlayerTitle', 'Usunąć gracza?')}</h3>
              <p className="text-[11px] text-gray-400 font-bold">
                {participants.find(p => p.id === confirmRemoveId)?.name || ''}
              </p>
            </div>
            <div className="flex gap-2 mt-6">
              <button onClick={() => setConfirmRemoveId(null)} className="flex-1 py-3 bg-white/5 border border-white/10 rounded-xl font-black uppercase text-[10px] tracking-widest">
                {t('battleLobby.no', 'Nie')}
              </button>
              <button onClick={() => removeParticipant(confirmRemoveId)} className="flex-1 py-3 bg-red-500 text-white rounded-xl font-black uppercase text-[10px] tracking-widest active:scale-95">
                {t('battleLobby.yesRemove', 'Tak, usuń')}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {toastMessage && createPortal(
        <div className="fixed top-14 left-1/2 -translate-x-1/2 z-[500000] bg-[#0a3a2a] text-white px-6 py-3.5 rounded-full font-black text-[10px] uppercase tracking-widest shadow-2xl animate-fade-in flex items-center gap-2 whitespace-nowrap">
          <span className="material-symbols-outlined text-emerald-400 text-sm">check_circle</span>
          {toastMessage}
        </div>, document.body
      )}

      {/* WORLD COOLDOWN MODAL — dla FREE użytkowników */}
      {showWorldQueue && (
        <WorldQueueView
          userId={userId}
          firstName={currentUserData?.firstName || ''}
          lastName={currentUserData?.lastName || ''}
          clubName={currentUserData?.clubName || ''}
          country={currentUserData?.countryCode || 'PL'}
          userLevel={userLevel}
          distance={distance}
          targetType={targetType}
          onMatchFound={(foundBattleId) => {
            setShowWorldQueue(false);
            onStartBattle(foundBattleId);
          }}
          onCancel={() => setShowWorldQueue(false)}
        />
      )}

      {showWorldCooldownModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[200000] flex items-center justify-center p-6 animate-fade-in" onClick={() => setShowWorldCooldownModal(false)}>
          <div className="bg-[#0a0f1a] border border-emerald-500/30 w-full max-w-sm rounded-[32px] p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="text-center mb-5">
              <span className="material-symbols-outlined text-4xl text-orange-400 mb-2 block">schedule</span>
              <h2 className="text-xl font-black text-white tracking-tighter">{t('battleLobby.cooldownTitle')}</h2>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">WORLD BATTLE</p>
            </div>
            <p className="text-sm text-gray-300 font-medium text-center mb-2 leading-relaxed">
              {t('battleLobby.worldCooldownMsg', 'Darmowi gracze mogą dołączyć do rozgrywek WORLD raz na 2 dni.')}
            </p>
            <p className="text-xs text-orange-300 font-black text-center mb-6">
              {t('battleLobby.remaining', 'Pozostało')}: ~{getWorldCooldownHoursLeft()} {t('battleLobby.hours', 'godz.')}
            </p>
            <div className="space-y-2">
              <button
                onClick={() => { setShowWorldCooldownModal(false); /* TODO: nawigacja do PRO */ }}
                className="w-full py-3.5 bg-gradient-to-r from-yellow-400 to-[#fed33e] text-[#0a3a2a] rounded-xl font-black uppercase text-[10px] tracking-widest active:scale-95 transition-all flex items-center justify-center gap-2"
              >
                <span className="material-symbols-outlined text-[16px]">diamond</span>
                GROT-X PRO — Unlimited
              </button>
              <button
                onClick={() => setShowWorldCooldownModal(false)}
                className="w-full py-3.5 bg-white/5 text-gray-400 rounded-xl font-black uppercase text-[10px] tracking-widest active:scale-95 transition-all border border-white/10"
              >
                {t('home.close')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}