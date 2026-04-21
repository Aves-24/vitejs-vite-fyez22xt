import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { db, auth } from '../firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, collection, query, where, getDocs, deleteDoc, updateDoc, writeBatch, addDoc, serverTimestamp, setDoc, getDoc, orderBy, limit, startAfter, getCountFromServer } from 'firebase/firestore';
import { recalcUserRank } from '../utils/rankEngine';
import { useTranslation } from 'react-i18next';
import StatsView from './StatsView';

interface AdminDashboardViewProps {
  onNavigate: (view: any) => void;
}

type AdminTab = 'CLUBS' | 'USERS' | 'MESSAGES' | 'SYSTEM';

const ADMIN_EMAILS = ['info@aves-24.de', 'rafal.woropaj@googlemail.com'];

export default function AdminDashboardView({ onNavigate }: AdminDashboardViewProps) {
  const { t, i18n } = useTranslation();
  const [activeTab, setActiveTab] = useState<AdminTab>('USERS');
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setCurrentUserEmail(u?.email || null);
      setAdminUserId(u?.uid || '');
    });
    return () => unsub();
  }, []);
  const [clubs, setClubs] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  // Scalanie klubów
  const [selectedClubIds, setSelectedClubIds] = useState<string[]>([]);
  const [mergeModal, setMergeModal] = useState<{ clubA: any; clubB: any } | null>(null);
  const [mergeTargetName, setMergeTargetName] = useState('');
  const [mergeKeepId, setMergeKeepId] = useState(''); // ID dokumentu który zostaje
  const [isMerging, setIsMerging] = useState(false);
  const [clubSearch, setClubSearch] = useState('');

  // Drill-down klubów: lista członków + podgląd statystyk
  const [selectedClubView, setSelectedClubView] = useState<any>(null); // kliknięty klub
  const [clubMembers, setClubMembers] = useState<any[]>([]);
  const [isLoadingMembers, setIsLoadingMembers] = useState(false);
  const [viewingMemberId, setViewingMemberId] = useState<string | null>(null);
  const [adminUserId, setAdminUserId] = useState<string>('');

  // Tygodniowa aktualizacja rang (THE TARGET SERIES)
  const [isUpdatingRanks, setIsUpdatingRanks] = useState(false);
  const [rankUpdateResult, setRankUpdateResult] = useState<{ updated: number; checked: number } | null>(null);
  const [lastRankUpdateAt, setLastRankUpdateAt] = useState<string | null>(null);

  // Paginacja użytkowników
  const PAGE_SIZE = 50;
  const [lastVisible, setLastVisible] = useState<any>(null);
  const [hasMore, setHasMore] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // Liczniki z aggregate queries (bezpłatne)
  const [totalUsersCount, setTotalUsersCount] = useState(0);
  const [proUsersCount, setProUsersCount] = useState(0);

  // Toast + confirm modal
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ label: string; onConfirm: () => void } | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // [NOWE] Stan dla zaznaczonych użytkowników do wiadomości grupowej
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);

  // Stany dla nowej wiadomości (Dodano 'GROUP')
  const [msgTarget, setMsgTarget] = useState<'ALL' | 'CLUB' | 'USER' | 'GROUP'>('ALL');
  const [msgTargetId, setMsgTargetId] = useState('');
  const [msgTitle, setMsgTitle] = useState('');
  const [msgContent, setMsgContent] = useState('');
  const [msgLang, setMsgLang] = useState<string>('all');

  const availableLangs = [
    { id: 'all', label: 'Wszystkie Języki 🌍' },
    { id: 'pl', label: 'Polski 🇵🇱' },
    { id: 'de', label: 'Deutsch 🇩🇪' },
    { id: 'en', label: 'English 🇬🇧' }
  ];

  useEffect(() => {
    fetchAllData();
    // Wczytaj datę ostatniej aktualizacji rang
    const stored = localStorage.getItem('grotX_admin_lastRankUpdate');
    if (stored) setLastRankUpdateAt(stored);
  }, []);

  const fetchAllData = async () => {
    setIsLoading(true);
    try {
      // Kluby — max 100, rzadko więcej
      const clubsSnap = await getDocs(query(collection(db, 'clubs'), limit(100)));
      setClubs(clubsSnap.docs.map(d => ({ id: d.id, ...d.data() })));

      // Użytkownicy — pierwsza strona 50 rekordów
      const usersQ = query(collection(db, 'users'), orderBy('firstName', 'asc'), limit(PAGE_SIZE));
      const usersSnap = await getDocs(usersQ);
      setUsers(usersSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLastVisible(usersSnap.docs[usersSnap.docs.length - 1] ?? null);
      setHasMore(usersSnap.docs.length === PAGE_SIZE);

      // Ogłoszenia — ostatnie 30
      const msgSnap = await getDocs(query(collection(db, 'announcements'), orderBy('timestamp', 'desc'), limit(30)));
      setAnnouncements(msgSnap.docs.map(d => ({ id: d.id, ...d.data() })));

      // Liczniki — aggregate queries są bezpłatne (nie liczą odczytów dokumentów)
      const [totalSnap, proSnap, promoSnap] = await Promise.all([
        getCountFromServer(collection(db, 'users')),
        getCountFromServer(query(collection(db, 'users'), where('isPremium', '==', true))),
        getCountFromServer(query(collection(db, 'users'), where('isPremiumPromo', '==', true))),
      ]);
      const total = totalSnap.data().count;
      const pro = proSnap.data().count + promoSnap.data().count;
      setTotalUsersCount(total);
      setProUsersCount(pro);

      logHourlyStats(total, pro);
    } catch (e) { console.error(e); }
    setIsLoading(false);
  };

  const loadMoreUsers = async () => {
    if (!lastVisible || !hasMore || isLoadingMore) return;
    setIsLoadingMore(true);
    try {
      const usersQ = query(collection(db, 'users'), orderBy('firstName', 'asc'), startAfter(lastVisible), limit(PAGE_SIZE));
      const usersSnap = await getDocs(usersQ);
      setUsers(prev => [...prev, ...usersSnap.docs.map(d => ({ id: d.id, ...d.data() }))]);
      setLastVisible(usersSnap.docs[usersSnap.docs.length - 1] ?? null);
      setHasMore(usersSnap.docs.length === PAGE_SIZE);
    } catch (e) { console.error(e); }
    setIsLoadingMore(false);
  };

  const logHourlyStats = async (total: number, pro: number) => {
    const now = new Date();
    const statsId = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}_H${now.getHours()}`;
    const statsRef = doc(db, 'admin_stats_history', statsId);

    try {
      const snap = await getDoc(statsRef);
      if (!snap.exists()) {
        await setDoc(statsRef, {
          timestamp: serverTimestamp(),
          totalUsers: total,
          proUsers: pro,
          hour: now.getHours(),
          date: now.toISOString().split('T')[0]
        });
        console.log("Hourly stats saved:", statsId);
      }
    } catch (e) { console.error("Stats log error:", e); }
  };

  // [ZMIANA] Rozbudowana logika wysyłania (obsługa pętli dla trybu GROUP)
  const sendAnnouncement = async () => {
    if (!msgTitle || !msgContent) { showToast("Wypełnij tytuł i treść!"); return; }
    setIsLoading(true);
    
    try {
      if (msgTarget === 'GROUP') {
        if (selectedUserIds.length === 0) {
          setIsLoading(false);
          showToast("Nie wybrano żadnych odbiorców!");
          return;
        }

        const batch = writeBatch(db);
        selectedUserIds.forEach(id => {
          const docRef = doc(collection(db, 'announcements'));
          batch.set(docRef, {
            title: msgTitle,
            content: msgContent,
            target: 'USER', // Wysyłamy jako indywidualne per każdy uczeń, aby dzwoneczek to złapał
            targetId: id,
            lang: msgLang,
            timestamp: serverTimestamp()
          });
        });

        await batch.commit();
        showToast(`Wysłano masowo do ${selectedUserIds.length} uczniów!`);
        setSelectedUserIds([]); // Czyszczenie koszyka po wysłaniu
      } else {
        await addDoc(collection(db, 'announcements'), {
          title: msgTitle,
          content: msgContent,
          target: msgTarget,
          targetId: msgTargetId,
          lang: msgLang,
          timestamp: serverTimestamp()
        });
        showToast("Wysłano komunikat!");
      }

      setMsgTitle(''); setMsgContent(''); setMsgTargetId('');
      setMsgTarget('ALL');
      fetchAllData();
    } catch (e) { showToast("Błąd wysyłki"); }
    setIsLoading(false);
  };

  const runPromoAction = (enable: boolean) => {
    const action = enable ? "AKTYWOWAĆ PROMO" : "ZAKOŃCZYĆ PROMO";
    setConfirmAction({
      label: `Czy na pewno chcesz ${action} dla kont FREE? (Stałe konta PRO zostaną nienaruszone)`,
      onConfirm: async () => {
        setIsLoading(true);
        try {
          const usersSnap = await getDocs(collection(db, 'users'));

          // Firestore batch limit = 500 operacji — dzielimy na chunki
          const BATCH_SIZE = 500;
          const docs = usersSnap.docs;
          for (let i = 0; i < docs.length; i += BATCH_SIZE) {
            const chunk = docs.slice(i, i + BATCH_SIZE);
            const batch = writeBatch(db);
            chunk.forEach((userDoc) => {
              const data = userDoc.data();
              if (enable) {
                if (!data.isPremium) batch.update(userDoc.ref, { isPremiumPromo: true });
              } else {
                batch.update(userDoc.ref, { isPremiumPromo: false });
              }
            });
            await batch.commit();
          }

          showToast(`Akcja zakończona sukcesem!`);
          fetchAllData();
        } catch (e) { showToast("Błąd batcha."); }
        setIsLoading(false);
      }
    });
  };

  const runWeeklyRankUpdate = () => {
    setConfirmAction({
      label: 'Przeliczyć rangi dla użytkowników na poziomach 7–10? Ta operacja czyta tylko użytkowników z level >= 7.',
      onConfirm: async () => { await doRunWeeklyRankUpdate(); }
    });
  };

  const doRunWeeklyRankUpdate = async () => {
    setIsUpdatingRanks(true);
    setRankUpdateResult(null);
    try {
      // OPTYMALIZACJA: Czytamy TYLKO użytkowników na poziomach 7–10.
      // Poziomy 1–6 nie mają wymagań na rolling avg — ich ranga aktualizuje się
      // automatycznie w ScoringView po każdej sesji, więc nie wymagają batcha.
      // Firestore nie obsługuje where('level', 'in', [7,8,9,10]) razem z >=,
      // więc używamy where('level', '>=', 7) — wystarczy bo max to 10.
      const highLevelSnap = await getDocs(
        query(collection(db, 'users'), where('level', '>=', 7))
      );

      const BATCH_SIZE = 500;
      const docs = highLevelSnap.docs;
      let updatedCount = 0;

      for (let i = 0; i < docs.length; i += BATCH_SIZE) {
        const chunk = docs.slice(i, i + BATCH_SIZE);
        const batch = writeBatch(db);
        let batchHasOps = false;

        chunk.forEach((userDoc) => {
          const data = { id: userDoc.id, ...userDoc.data() };
          const result = recalcUserRank(data);
          if (result !== null) {
            batch.update(userDoc.ref, {
              level: result.level,
              rankName: result.rankName,
              rankColor: result.color,
              rankBorder: result.border,
              rankTextColor: result.textColor,
              rollingAvg: result.rollingAvg,
            });
            batchHasOps = true;
            updatedCount++;
          }
        });

        if (batchHasOps) await batch.commit();
      }

      const nowISO = new Date().toISOString();
      localStorage.setItem('grotX_admin_lastRankUpdate', nowISO);
      setLastRankUpdateAt(nowISO);
      setRankUpdateResult({ updated: updatedCount, checked: docs.length });
    } catch (e) {
      console.error('Błąd aktualizacji rang:', e);
      showToast('Błąd podczas aktualizacji rang.');
    }
    setIsUpdatingRanks(false);
  };

  const toggleUserPremium = (userId: string, currentStatus: boolean) => {
    setConfirmAction({
      label: `Zmienić STAŁY status PRO dla tego użytkownika?`,
      onConfirm: async () => { await doToggleUserPremium(userId, currentStatus); }
    });
  };

  const doToggleUserPremium = async (userId: string, currentStatus: boolean) => {
    try {
      if (currentStatus) {
        // Odbieranie PRO — czyścimy WSZYSTKIE źródła dostępu (isPremium, isPremiumPromo, trialEndsAt)
        await updateDoc(doc(db, 'users', userId), {
          isPremium: false,
          isPremiumPromo: false,
          trialEndsAt: new Date(0).toISOString(), // ustawiamy datę w przeszłości
        });
        // Czyścimy też cache po stronie klienta (jeśli admin jest na swoim koncie)
        localStorage.removeItem(`grotX_profile_${userId}`);
      } else {
        // Nadawanie PRO
        await updateDoc(doc(db, 'users', userId), { isPremium: true });
        localStorage.removeItem(`grotX_profile_${userId}`);
      }
      fetchAllData();
    } catch (e) { showToast("Błąd"); }
  };

  const toggleUserCoachStatus = (userId: string, currentStatus: boolean) => {
    setConfirmAction({
      label: currentStatus ? "Odebrać status trenera?" : "Nadać uprawnienia trenera? Otrzyma 10 miejsc na start.",
      onConfirm: async () => {
        try {
          await updateDoc(doc(db, 'users', userId), {
            isCoach: !currentStatus,
            coachLimit: !currentStatus ? 10 : 0
          });
          fetchAllData();
        } catch (e) { showToast("Błąd nadawania trenera"); }
      }
    });
  };

  const updateCoachLimit = (userId: string, currentLimit: number, change: number) => {
    const newLimit = currentLimit + change;
    if (newLimit < 0) return;
    setConfirmAction({
      label: `Zmienić pakiet trenera z ${currentLimit} na ${newLimit} miejsc?`,
      onConfirm: async () => {
        try {
          await updateDoc(doc(db, 'users', userId), { coachLimit: newLimit });
          fetchAllData();
        } catch (e) { showToast("Błąd zmiany limitu"); }
      }
    });
  };

  const toggleClubSelection = (clubId: string) => {
    setSelectedClubIds(prev => {
      if (prev.includes(clubId)) return prev.filter(id => id !== clubId);
      if (prev.length >= 2) return [prev[1], clubId]; // max 2 naraz
      return [...prev, clubId];
    });
  };

  const openMergeModal = () => {
    if (selectedClubIds.length !== 2) return;
    const a = clubs.find(c => c.id === selectedClubIds[0]);
    const b = clubs.find(c => c.id === selectedClubIds[1]);
    if (!a || !b) return;
    setMergeTargetName(a.name);
    setMergeKeepId(a.id); // domyślnie zostaje dokument pierwszego klubu
    setMergeModal({ clubA: a, clubB: b });
  };

  const executeClubMerge = async () => {
    if (!mergeModal || !mergeTargetName.trim()) return;
    setIsMerging(true);
    try {
      const { clubA, clubB } = mergeModal;
      const keepClub = mergeKeepId === clubA.id ? clubA : clubB;
      const deleteClub = mergeKeepId === clubA.id ? clubB : clubA;

      // Wszystkie unikalne nazwy obu klubów — szukamy userów po obu nazwach
      const allNames = Array.from(new Set([clubA.name, clubB.name]));

      const batch = writeBatch(db);

      // Aktualizujemy userów po każdej nazwie osobno (unikamy pustej tablicy w 'in')
      for (const name of allNames) {
        const snap = await getDocs(query(collection(db, 'users'), where('club', '==', name)));
        snap.docs.forEach(d => {
          batch.update(d.ref, { club: mergeTargetName, clubName: mergeTargetName });
        });
      }

      // Zostaje jeden dokument klubu z docelową nazwą, drugi usuwamy
      batch.update(doc(db, 'clubs', keepClub.id), { name: mergeTargetName });
      batch.delete(doc(db, 'clubs', deleteClub.id));

      await batch.commit();

      setMergeModal(null);
      setSelectedClubIds([]);
      fetchAllData();
    } catch (e) {
      console.error('Błąd scalania klubów:', e);
    } finally {
      setIsMerging(false);
    }
  };

  // [NOWE] Funkcja do zaznaczania odznaczania osób
  const toggleUserSelection = (userId: string) => {
    setSelectedUserIds(prev =>
      prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
    );
  };

  // Drill-down: wczytaj członków wybranego klubu
  const loadClubMembers = async (club: any) => {
    setSelectedClubView(club);
    setViewingMemberId(null);
    setIsLoadingMembers(true);
    try {
      // Szukamy po polu clubName (lub club jako fallback)
      const [snap1, snap2] = await Promise.all([
        getDocs(query(collection(db, 'users'), where('clubName', '==', club.name))),
        getDocs(query(collection(db, 'users'), where('club', '==', club.name))),
      ]);
      const seen = new Set<string>();
      const members: any[] = [];
      [...snap1.docs, ...snap2.docs].forEach(d => {
        if (!seen.has(d.id)) { seen.add(d.id); members.push({ id: d.id, ...d.data() }); }
      });
      members.sort((a, b) => (a.firstName || '').localeCompare(b.firstName || ''));
      setClubMembers(members);
    } catch (e) { console.error(e); }
    setIsLoadingMembers(false);
  };

  if (currentUserEmail !== null && !ADMIN_EMAILS.includes(currentUserEmail)) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-[#fcfdfe] max-w-md mx-auto px-8 text-center">
        <span className="material-symbols-outlined text-5xl text-gray-200 mb-4">lock</span>
        <p className="text-[13px] font-black text-gray-400 uppercase tracking-widest">Brak dostępu</p>
        <button onClick={() => onNavigate('HOME')} className="mt-6 px-6 py-3 bg-[#0a3a2a] text-white rounded-2xl font-black text-[12px] active:scale-95 transition-all">Wróć do aplikacji</button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-[#fcfdfe] pt-[env(safe-area-inset-top)] max-w-md mx-auto relative overflow-hidden text-[#333]">
      <div className="px-6 py-4 bg-white border-b border-gray-100 shrink-0">
        <div className="flex items-center gap-4 mb-4">
          <button onClick={() => onNavigate('SETTINGS')} className="w-10 h-10 bg-gray-50 rounded-full flex items-center justify-center text-[#0a3a2a] active:scale-90 transition-all">
            <span className="material-symbols-outlined">arrow_back</span>
          </button>
          <div>
            <h1 className="text-xl font-black text-[#0a3a2a] leading-none">Admin Center</h1>
            <p className="text-[8px] font-bold text-gray-400 uppercase mt-1 tracking-widest">Statystyki odświeżane na żywo</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 mb-4">
           <div className="bg-[#0a3a2a] p-3 rounded-2xl shadow-sm border border-[#0a3a2a]">
              <span className="text-[7px] font-black text-emerald-400 uppercase tracking-widest">Wszyscy Użytkownicy</span>
              <p className="text-2xl font-black text-white">{totalUsersCount}</p>
           </div>
           <div className="bg-[#fed33e] p-3 rounded-2xl shadow-sm border border-[#e5bd35]">
              <span className="text-[7px] font-black text-[#8B6508] uppercase tracking-widest">Aktywne Konta PRO/Promo</span>
              <p className="text-2xl font-black text-[#0a3a2a]">{proUsersCount}</p>
           </div>
        </div>

        <div className="flex p-1 bg-gray-100 rounded-xl overflow-x-auto gap-1">
          {['USERS', 'CLUBS', 'MESSAGES', 'SYSTEM'].map(tId => (
            <button key={tId} onClick={() => setActiveTab(tId as any)} className={`flex-1 min-w-[70px] py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${activeTab === tId ? 'bg-white text-[#0a3a2a] shadow-sm' : 'text-gray-400'}`}>
              {tId === 'USERS' ? 'Userzy' : tId === 'CLUBS' ? 'Kluby' : tId === 'MESSAGES' ? 'Komunikaty' : 'SYSTEM'}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-32 relative">
        {activeTab === 'USERS' && (
           <div className="space-y-3 pb-20">
             <div className="relative">
                <input type="text" placeholder="Szukaj łucznika..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="w-full bg-white border border-gray-200 rounded-xl p-3 pl-10 text-sm font-bold outline-none focus:border-[#0a3a2a]" />
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-gray-300">search</span>
             </div>
             {users.filter(u => (u.firstName + " " + u.lastName + " " + u.clubName).toLowerCase().includes(searchQuery.toLowerCase())).map(u => (
                <div key={u.id} className={`bg-white border p-4 rounded-2xl shadow-sm flex flex-col gap-1 transition-all ${selectedUserIds.includes(u.id) ? 'border-[#0a3a2a] ring-1 ring-[#0a3a2a]' : 'border-gray-100'}`}>
                   <div className="flex justify-between items-center">
                      <div className="flex items-center gap-3">
                        {/* Checkbox do zaznaczania do grupy */}
                        <button onClick={() => toggleUserSelection(u.id)} className={`w-5 h-5 rounded flex items-center justify-center transition-all ${selectedUserIds.includes(u.id) ? 'bg-[#0a3a2a] text-[#fed33e]' : 'bg-gray-100 border border-gray-200 text-transparent'}`}>
                          <span className="material-symbols-outlined text-[14px] font-black">check</span>
                        </button>
                        <span className="font-black text-sm">{u.firstName} {u.lastName}</span>
                      </div>
                      <div className="flex gap-1">
                         {u.isCoach && <span className="text-[6px] font-black bg-emerald-500 text-white px-1.5 py-0.5 rounded uppercase shadow-sm">Kadra</span>}
                         {u.isPremium && <span className="text-[6px] font-black bg-yellow-400 text-white px-1.5 py-0.5 rounded uppercase shadow-sm">Stałe PRO</span>}
                         {u.isPremiumPromo && <span className="text-[6px] font-black bg-indigo-500 text-white px-1.5 py-0.5 rounded uppercase shadow-sm">Promo</span>}
                         {!u.isPremium && !u.isPremiumPromo && u.trialEndsAt && new Date(u.trialEndsAt).getTime() > Date.now() && (
                           <span className="text-[6px] font-black bg-orange-400 text-white px-1.5 py-0.5 rounded uppercase shadow-sm">Trial</span>
                         )}
                         {!u.isPremium && !u.isPremiumPromo && (!u.trialEndsAt || new Date(u.trialEndsAt).getTime() <= Date.now()) && <span className="text-[6px] font-black bg-gray-100 text-gray-400 px-1.5 py-0.5 rounded uppercase">FREE</span>}
                      </div>
                   </div>
                   
                   <div className="flex justify-between items-center mt-1">
                      <p className="text-[10px] text-gray-400 font-bold uppercase ml-8">{u.clubName || 'Brak Klubu'}</p>
                      
                      <div className="flex gap-1">
                        <button onClick={() => toggleUserCoachStatus(u.id, u.isCoach)} className={`px-2 py-1 rounded text-[7px] font-black uppercase ${u.isCoach ? 'bg-red-50 text-red-500' : 'bg-emerald-50 text-emerald-600'}`}>
                           {u.isCoach ? 'Odbierz Trenera' : 'Zrób Trenerem'}
                        </button>
                        
                        {(() => {
                          const effectivePro = u.isPremium || u.isPremiumPromo || (u.trialEndsAt && new Date(u.trialEndsAt).getTime() > Date.now());
                          return (
                            <button onClick={() => toggleUserPremium(u.id, !!effectivePro)} className={`px-2 py-1 rounded text-[7px] font-black uppercase ${effectivePro ? 'bg-red-50 text-red-500' : 'bg-yellow-50 text-yellow-600'}`}>
                              {effectivePro ? 'Odbierz PRO' : 'Nadaj PRO'}
                            </button>
                          );
                        })()}
                      </div>
                   </div>

                   {u.isCoach && (
                     <div className="bg-emerald-50/50 border border-emerald-100 rounded-xl p-3 mt-3 ml-8 flex justify-between items-center">
                        <div className="flex flex-col">
                           <span className="text-[8px] font-black text-emerald-600 uppercase tracking-widest">Limit Miejsc Kadry</span>
                           <span className="text-xl font-black text-[#0a3a2a] leading-none mt-0.5">{u.coachLimit || 0}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                           <button onClick={() => updateCoachLimit(u.id, u.coachLimit || 0, -10)} className="w-8 h-8 bg-white border border-emerald-100 rounded-lg text-emerald-600 flex items-center justify-center font-black text-xs active:scale-90">-10</button>
                           <button onClick={() => updateCoachLimit(u.id, u.coachLimit || 0, -1)} className="w-8 h-8 bg-white border border-emerald-100 rounded-lg text-emerald-600 flex items-center justify-center font-black text-xs active:scale-90">-1</button>
                           <button onClick={() => updateCoachLimit(u.id, u.coachLimit || 0, 1)} className="w-8 h-8 bg-emerald-600 text-white rounded-lg flex items-center justify-center font-black text-xs shadow-sm active:scale-90">+1</button>
                           <button onClick={() => updateCoachLimit(u.id, u.coachLimit || 0, 10)} className="w-8 h-8 bg-[#fed33e] text-[#0a3a2a] border border-[#e5bd38] rounded-lg flex items-center justify-center font-black text-[10px] shadow-sm active:scale-90 tracking-tighter">+10</button>
                        </div>
                     </div>
                   )}

                   <div className="flex gap-2 mt-2 pt-2 border-t border-gray-50 ml-8">
                      <button onClick={() => {setMsgTarget('USER'); setMsgTargetId(u.id); setActiveTab('MESSAGES');}} className="text-[8px] font-black text-indigo-500 uppercase">✉️ Pojedyncza wiadomość</button>
                      <button onClick={() => { /* Tu w przyszłości podgląd sesji */ }} className="text-[8px] font-black text-emerald-600 uppercase ml-auto opacity-50 cursor-not-allowed">Podgląd aktywności</button>
                   </div>
                </div>
             ))}

             {hasMore && !searchQuery && (
               <button
                 onClick={loadMoreUsers}
                 disabled={isLoadingMore}
                 className="w-full py-3 bg-gray-50 border border-gray-200 rounded-2xl text-[10px] font-black uppercase tracking-widest text-gray-500 active:scale-95 transition-all disabled:opacity-50"
               >
                 {isLoadingMore ? 'Ładowanie...' : `Załaduj więcej (załadowano ${users.length} z ${totalUsersCount})`}
               </button>
             )}
           </div>
        )}

        {activeTab === 'MESSAGES' && (
          <div className="space-y-4">
            <div className="bg-indigo-50 p-5 rounded-[24px] border border-indigo-100 space-y-3 shadow-sm">
              <h3 className="text-xs font-black text-indigo-700 uppercase tracking-widest">Nowy Komunikat Systemowy</h3>
              
              <div className="flex gap-2">
                {['ALL', 'CLUB', 'USER', 'GROUP'].map(t => (
                  <button key={t} onClick={() => setMsgTarget(t as any)} className={`flex-1 py-2 rounded-lg text-[8px] font-black border transition-all ${msgTarget === t ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm' : 'bg-white border-indigo-200 text-indigo-400'}`}>
                    {t === 'ALL' ? 'WSZYSCY' : t === 'CLUB' ? 'KLUB' : t === 'USER' ? 'OSOBNO' : 'GRUPA'}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-1 gap-2">
                <label className="text-[8px] font-black text-indigo-400 uppercase ml-1">Język docelowy</label>
                <select value={msgLang} onChange={e => setMsgLang(e.target.value)} className="w-full bg-white border border-indigo-100 p-2.5 rounded-xl text-[10px] font-bold outline-none">
                  {availableLangs.map(l => <option key={l.id} value={l.id}>{l.label}</option>)}
                </select>
              </div>

              {msgTarget !== 'ALL' && msgTarget !== 'GROUP' && <input type="text" placeholder={msgTarget === 'CLUB' ? "Nazwa Klubu" : "Pełne User ID"} value={msgTargetId} onChange={e => setMsgTargetId(e.target.value)} className="w-full bg-white border border-indigo-100 p-2.5 rounded-xl text-[10px] font-bold" />}
              
              {msgTarget === 'GROUP' && (
                <div className="w-full bg-indigo-100 border border-indigo-200 p-3 rounded-xl text-[10px] font-bold text-indigo-800 flex items-center justify-between">
                  <span className="uppercase">Odbiorcy (Wybrani z listy):</span>
                  <span className="bg-indigo-600 text-white px-2 py-1 rounded-md text-xs">{selectedUserIds.length} osób</span>
                </div>
              )}

              <input type="text" placeholder="Tytuł komunikatu" value={msgTitle} onChange={e => setMsgTitle(e.target.value)} className="w-full bg-white border border-indigo-100 p-2.5 rounded-xl text-[11px] font-black outline-none" />
              <textarea placeholder="Treść..." value={msgContent} onChange={e => setMsgContent(e.target.value)} className="w-full bg-white border border-indigo-100 p-2.5 rounded-xl text-[11px] font-medium h-24 resize-none outline-none" />
              
              <button onClick={sendAnnouncement} disabled={isLoading} className="w-full py-3 bg-[#0a3a2a] text-white rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg active:scale-95 transition-all disabled:opacity-50">
                 {isLoading ? 'Przetwarzanie...' : 'Rozpocznij nadawanie'}
              </button>
            </div>

            <div className="space-y-2">
              <h3 className="text-[10px] font-black text-gray-400 uppercase ml-1">Ostatnio nadawane</h3>
              {announcements.map(a => (
                <div key={a.id} className="bg-white border border-gray-100 p-3 rounded-xl flex justify-between items-start shadow-sm">
                  <div className="flex-1 pr-4">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[7px] font-black bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded uppercase">{a.lang}</span>
                      <span className="text-[7px] font-black bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded uppercase">{a.target}</span>
                    </div>
                    <span className="font-bold text-xs block">{a.title}</span>
                  </div>
                  <button onClick={() => setConfirmAction({ label: "Usunąć komunikat?", onConfirm: async () => { await deleteDoc(doc(db, 'announcements', a.id)); fetchAllData(); } })} className="material-symbols-outlined text-gray-300 text-sm hover:text-red-500 transition-colors">delete</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'SYSTEM' && (
          <div className="space-y-6">
            <div className="bg-indigo-50 p-6 rounded-[32px] border border-indigo-100 shadow-sm">
               <h3 className="text-xs font-black text-indigo-700 uppercase tracking-widest mb-4 flex items-center gap-2">
                  <span className="material-symbols-outlined text-sm">event_available</span> Akcja: Darmowy Weekend
               </h3>
               <div className="space-y-3">
                  <button onClick={() => runPromoAction(true)} className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-md active:scale-95 transition-all">
                    🚀 Aktywuj Promo (Dla kont FREE)
                  </button>
                  <button onClick={() => runPromoAction(false)} className="w-full py-4 bg-white border-2 border-indigo-200 text-indigo-600 rounded-2xl font-black text-[10px] uppercase tracking-widest active:scale-95 transition-all">
                    🛑 Zakończ Promo (Reset)
                  </button>
               </div>
               <p className="text-[8px] text-indigo-400 font-medium mt-4 text-center leading-relaxed">
                  System automatycznie ominie użytkowników, którzy wykupili stały abonament. Ich dostęp pozostanie nienaruszony.
               </p>
            </div>

            <div className="bg-white p-5 rounded-[24px] border border-gray-100">
               <h3 className="text-xs font-black text-[#0a3a2a] uppercase tracking-widest mb-2">Monitor Aktywności</h3>
               <p className="text-[9px] text-gray-400 font-medium">Logowanie statystyk (Snapshots) odbywa się automatycznie przy każdym wejściu admina do panelu, sprawdzając unikalność godziny.</p>
            </div>

            {/* THE TARGET SERIES — Aktualizacja Rang */}
            <div className="bg-[#0a0f1a] p-6 rounded-[32px] border border-white/10 shadow-sm">
               <h3 className="text-xs font-black text-[#fed33e] uppercase tracking-widest mb-1 flex items-center gap-2">
                  <span className="material-symbols-outlined text-sm text-[#fed33e]">military_tech</span>
                  The Target Series — Rankingi
               </h3>
               <p className="text-[9px] text-gray-400 font-medium mb-2 leading-relaxed">
                  Przelicza rangi dla użytkowników na <span className="text-[#fed33e] font-black">poziomach 7–10</span> (RED / GOLD). Tylko te rangi wymagają cotygodniowej weryfikacji rolling avg.
               </p>
               <p className="text-[8px] text-emerald-400 font-bold mb-4 leading-relaxed">
                  ✦ Poziomy 1–6 aktualizują się automatycznie po każdym treningu — bez dodatkowych odczytów.
               </p>

               {lastRankUpdateAt && (
                 <div className="bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 mb-3 flex items-center gap-2">
                   <span className="material-symbols-outlined text-emerald-400 text-[16px]">check_circle</span>
                   <div>
                     <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest">Ostatnia aktualizacja</p>
                     <p className="text-[10px] font-black text-white">{new Date(lastRankUpdateAt).toLocaleString('pl-PL')}</p>
                   </div>
                 </div>
               )}

               {rankUpdateResult && (
                 <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl px-4 py-2.5 mb-3">
                   <p className="text-[10px] font-black text-emerald-400">
                     ✓ Zaktualizowano {rankUpdateResult.updated} z {rankUpdateResult.checked} kont
                   </p>
                 </div>
               )}

               <button
                 onClick={runWeeklyRankUpdate}
                 disabled={isUpdatingRanks}
                 className="w-full py-4 bg-gradient-to-r from-[#FFCC00] to-[#fed33e] text-[#0a3a2a] rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-md active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
               >
                 <span className="material-symbols-outlined text-[16px]">{isUpdatingRanks ? 'sync' : 'military_tech'}</span>
                 {isUpdatingRanks ? 'Aktualizowanie...' : 'Aktualizuj Rankingi (Wszyscy)'}
               </button>
            </div>
          </div>
        )}

        {activeTab === 'CLUBS' && !selectedClubView && (
           <div className="space-y-2">
             {/* Wyszukiwarka */}
             <div className="relative mb-1">
               <span className="absolute left-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-gray-400 text-[18px]">search</span>
               <input
                 type="text"
                 value={clubSearch}
                 onChange={e => setClubSearch(e.target.value)}
                 placeholder="Szukaj klubu lub miasta..."
                 className="w-full bg-gray-50 border border-gray-100 rounded-2xl pl-9 pr-4 py-2.5 text-sm font-bold text-[#333] outline-none focus:border-emerald-400"
               />
               {clubSearch && (
                 <button onClick={() => setClubSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-gray-300 text-[18px] active:scale-90">close</button>
               )}
             </div>

             {/* Info o scalaniu */}
             <div className="flex items-start gap-2 bg-blue-50 border border-blue-100 rounded-2xl px-4 py-3 mb-1">
               <span className="material-symbols-outlined text-blue-400 text-[16px] shrink-0 mt-0.5">info</span>
               <p className="text-[10px] font-bold text-blue-700 leading-snug">Zaznacz 2 kluby aby scalić. Kliknij nazwę klubu aby zobaczyć członków.</p>
             </div>

             {clubs.filter(c => {
               if (!clubSearch.trim()) return true;
               const q = clubSearch.toLowerCase();
               return c.name?.toLowerCase().includes(q) || c.city?.toLowerCase().includes(q);
             }).map(c => {
               const isSelected = selectedClubIds.includes(c.id);
               return (
                 <div key={c.id} className={`bg-white border p-3 rounded-2xl flex justify-between items-center shadow-sm transition-all ${isSelected ? 'border-orange-400 bg-orange-50/40' : 'border-gray-100'}`}>
                   <div className="flex items-center gap-3 flex-1 min-w-0">
                     <button
                       onClick={() => toggleClubSelection(c.id)}
                       className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${isSelected ? 'bg-orange-500 border-orange-500' : 'border-gray-300'}`}
                     >
                       {isSelected && <span className="material-symbols-outlined text-white text-[14px]">check</span>}
                     </button>
                     {/* Klik na nazwę → drill-down */}
                     <button onClick={() => loadClubMembers(c)} className="min-w-0 text-left flex-1 active:opacity-70">
                       <p className="font-black text-[#0a3a2a] text-sm truncate">{c.name}</p>
                       <p className="text-[10px] font-bold text-gray-400 uppercase">{c.city}{c.country ? `, ${c.country}` : ''}</p>
                     </button>
                   </div>
                   <div className="flex items-center gap-1 shrink-0 ml-2">
                     <button onClick={() => loadClubMembers(c)} className="w-9 h-9 bg-emerald-50 rounded-full flex items-center justify-center text-emerald-600 active:scale-90 transition-all">
                       <span className="material-symbols-outlined text-[18px]">group</span>
                     </button>
                     <button onClick={() => {setMsgTarget('CLUB'); setMsgTargetId(c.name); setActiveTab('MESSAGES');}} className="w-9 h-9 bg-indigo-50 rounded-full flex items-center justify-center text-indigo-500 active:scale-90 transition-all">
                       <span className="material-symbols-outlined text-[18px]">mail</span>
                     </button>
                   </div>
                 </div>
               );
             })}
           </div>
        )}

        {/* LISTA CZŁONKÓW KLUBU */}
        {activeTab === 'CLUBS' && selectedClubView && !viewingMemberId && (
          <div className="space-y-3 animate-fade-in">
            {/* Nagłówek z powrotem */}
            <button
              onClick={() => { setSelectedClubView(null); setClubMembers([]); }}
              className="flex items-center gap-2 text-[#0a3a2a] font-black text-sm active:opacity-70 transition-all"
            >
              <span className="material-symbols-outlined text-[20px]">arrow_back</span>
              <span>Kluby</span>
            </button>

            <div className="bg-[#0a3a2a] rounded-2xl p-4 flex items-center gap-3">
              <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-[#fed33e] text-[20px]">shield</span>
              </div>
              <div>
                <p className="font-black text-white text-base leading-tight">{selectedClubView.name}</p>
                <p className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest">{selectedClubView.city}{selectedClubView.country ? `, ${selectedClubView.country}` : ''} · {isLoadingMembers ? '...' : `${clubMembers.length} członków`}</p>
              </div>
            </div>

            {isLoadingMembers ? (
              <div className="text-center py-10 text-gray-400 animate-pulse">
                <span className="material-symbols-outlined text-3xl mb-2 block">sync</span>
                <p className="text-[10px] font-black uppercase tracking-widest">Ładowanie...</p>
              </div>
            ) : clubMembers.length === 0 ? (
              <div className="text-center py-10 opacity-30">
                <span className="material-symbols-outlined text-4xl mb-2 block">person_off</span>
                <p className="text-[10px] font-black uppercase tracking-widest">Brak użytkowników w tym klubie</p>
              </div>
            ) : (
              clubMembers.map(m => {
                const effectivePro = m.isPremium || m.isPremiumPromo || (m.trialEndsAt && new Date(m.trialEndsAt).getTime() > Date.now());
                return (
                  <button
                    key={m.id}
                    onClick={() => setViewingMemberId(m.id)}
                    className="w-full bg-white border border-gray-100 p-4 rounded-2xl flex items-center justify-between shadow-sm active:scale-[0.98] transition-all text-left"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center shrink-0">
                        <span className="material-symbols-outlined text-gray-400 text-[20px]">person</span>
                      </div>
                      <div>
                        <p className="font-black text-[#0a3a2a] text-sm leading-tight">{m.firstName} {m.lastName}</p>
                        <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wide mt-0.5">{m.bowType || 'Brak łuku'} · {m.competitionLevel || ''}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {effectivePro && (
                        <span className="text-[7px] font-black bg-[#fed33e] text-[#0a3a2a] px-1.5 py-0.5 rounded uppercase">PRO</span>
                      )}
                      {m.isCoach && (
                        <span className="text-[7px] font-black bg-emerald-500 text-white px-1.5 py-0.5 rounded uppercase">Trener</span>
                      )}
                      <span className="material-symbols-outlined text-gray-300 text-[18px]">chevron_right</span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        )}

        {/* PODGLĄD STATYSTYK CZŁONKA */}
        {activeTab === 'CLUBS' && selectedClubView && viewingMemberId && (
          <div className="animate-fade-in">
            {/* Nawigacja wstecz */}
            <button
              onClick={() => setViewingMemberId(null)}
              className="flex items-center gap-2 text-[#0a3a2a] font-black text-sm active:opacity-70 transition-all mb-3"
            >
              <span className="material-symbols-outlined text-[20px]">arrow_back</span>
              <span>{selectedClubView.name} — członkowie</span>
            </button>

            {/* Dane osoby */}
            {(() => {
              const m = clubMembers.find(x => x.id === viewingMemberId);
              if (!m) return null;
              return (
                <div className="bg-gray-50 border border-gray-100 rounded-2xl p-3 mb-3 flex items-center gap-3">
                  <div className="w-9 h-9 bg-[#0a3a2a] rounded-full flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-[#fed33e] text-[16px]">person</span>
                  </div>
                  <div>
                    <p className="font-black text-[#0a3a2a] text-sm leading-tight">{m.firstName} {m.lastName}</p>
                    <p className="text-[9px] font-bold text-gray-400 uppercase">{m.clubName} · Podgląd (tylko do odczytu)</p>
                  </div>
                </div>
              );
            })()}

            {/* StatsView embedded */}
            <div className="bg-[#fcfdfe] rounded-2xl border border-gray-100">
              <StatsView
                userId={adminUserId}
                viewingStudentId={viewingMemberId}
                isEmbedded={true}
                onNavigate={onNavigate}
              />
            </div>
          </div>
        )}
      </div>

      {/* [NOWE] Pływający pasek akcji na dole (Floating Action Bar) */}
      {selectedUserIds.length > 0 && activeTab === 'USERS' && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-[90%] bg-[#0a3a2a] p-4 rounded-2xl shadow-2xl flex items-center justify-between border border-[#124b38] z-50 animate-fade-in">
          <div className="text-white">
             <p className="text-[10px] font-bold text-gray-400 uppercase leading-none">Wybrano</p>
             <p className="font-black text-xl leading-none mt-1">{selectedUserIds.length} <span className="text-[10px] font-normal text-gray-300">uczniów</span></p>
          </div>
          <button 
            onClick={() => { setMsgTarget('GROUP'); setActiveTab('MESSAGES'); }} 
            className="bg-[#fed33e] text-[#0a3a2a] px-4 py-2.5 rounded-xl font-black text-[10px] uppercase shadow-sm active:scale-95 transition-all"
          >
            Napisz Wiadomość
          </button>
        </div>
      )}

      {/* Pasek scalania klubów */}
      {selectedClubIds.length === 2 && activeTab === 'CLUBS' && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-[90%] bg-orange-600 p-4 rounded-2xl shadow-2xl flex items-center justify-between border border-orange-500 z-50 animate-fade-in">
          <div className="text-white">
            <p className="text-[10px] font-bold text-orange-200 uppercase leading-none">Wybrano 2 kluby</p>
            <p className="font-black text-[13px] leading-tight mt-1 text-white">Scal w jeden klub</p>
          </div>
          <button
            onClick={openMergeModal}
            className="bg-white text-orange-600 px-4 py-2.5 rounded-xl font-black text-[10px] uppercase shadow-sm active:scale-95 transition-all"
          >
            Scal kluby
          </button>
        </div>
      )}

      {/* Modal scalania */}
      {mergeModal && (
        <div className="fixed inset-0 z-[200] flex items-end justify-center pb-8 px-5" style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}>
          <div className="w-full max-w-md bg-white rounded-[28px] p-6 shadow-2xl">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-12 h-12 rounded-full bg-orange-50 flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-orange-500 text-[24px]">merge</span>
              </div>
              <div>
                <h2 className="text-[16px] font-black text-[#0a3a2a] leading-tight">Scalanie klubów</h2>
                <p className="text-[11px] font-medium text-gray-400">Wszyscy użytkownicy obu klubów zostaną przypisani do wybranej nazwy.</p>
              </div>
            </div>

            {/* Dwa kluby */}
            <div className="flex items-center gap-2 mb-4">
              <div className="flex-1 bg-gray-50 rounded-2xl p-3 text-center">
                <p className="text-[11px] font-black text-[#0a3a2a] leading-tight">{mergeModal.clubA.name}</p>
                <p className="text-[9px] font-bold text-gray-400 mt-0.5">{mergeModal.clubA.city}</p>
              </div>
              <span className="material-symbols-outlined text-gray-400 text-[20px]">add</span>
              <div className="flex-1 bg-gray-50 rounded-2xl p-3 text-center">
                <p className="text-[11px] font-black text-[#0a3a2a] leading-tight">{mergeModal.clubB.name}</p>
                <p className="text-[9px] font-bold text-gray-400 mt-0.5">{mergeModal.clubB.city}</p>
              </div>
            </div>

            {/* Wybór docelowej nazwy */}
            <div className="mb-5">
              <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">Wybierz nazwę docelową:</p>
              <div className="flex flex-col gap-2 mb-3">
                {[mergeModal.clubA, mergeModal.clubB].map(club => (
                  <button
                    key={club.id}
                    onClick={() => { setMergeKeepId(club.id); setMergeTargetName(club.name); }}
                    className={`w-full px-4 py-3 rounded-2xl font-black text-[12px] text-left border transition-all flex items-center gap-2 ${
                      mergeKeepId === club.id ? 'bg-orange-50 border-orange-400 text-orange-700' : 'bg-gray-50 border-gray-100 text-gray-600'
                    }`}
                  >
                    <span className={`w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center ${mergeKeepId === club.id ? 'border-orange-500 bg-orange-500' : 'border-gray-300'}`}>
                      {mergeKeepId === club.id && <span className="w-1.5 h-1.5 bg-white rounded-full block" />}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block truncate">{club.name}</span>
                      <span className="text-[9px] font-bold text-gray-400 normal-case">{club.city}</span>
                    </span>
                  </button>
                ))}
              </div>
              <p className="text-[10px] font-bold text-gray-400 leading-snug mb-1">Lub wpisz nową nazwę docelową:</p>
              <input
                type="text"
                value={mergeTargetName}
                onChange={e => setMergeTargetName(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-sm font-bold text-[#333] outline-none focus:border-orange-400"
                placeholder="Nazwa docelowa klubu"
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => { setMergeModal(null); setSelectedClubIds([]); }}
                className="flex-1 h-12 rounded-2xl border border-gray-200 text-[13px] font-black text-gray-500 active:scale-95 transition-all"
              >
                Anuluj
              </button>
              <button
                onClick={executeClubMerge}
                disabled={isMerging || !mergeTargetName.trim()}
                className="flex-[2] h-12 rounded-2xl bg-orange-500 text-white text-[13px] font-black active:scale-95 transition-all shadow-sm disabled:opacity-50"
              >
                {isMerging ? 'Scalanie...' : 'Scal i zapisz'}
              </button>
            </div>
          </div>
        </div>
      )}

      {toastMessage && createPortal(
        <div className="fixed top-14 left-1/2 -translate-x-1/2 z-[500000] bg-[#0a3a2a] text-white px-6 py-3.5 rounded-full font-black text-[10px] uppercase tracking-widest shadow-2xl animate-fade-in flex items-center gap-2 whitespace-nowrap">
          <span className="material-symbols-outlined text-emerald-400 text-sm">check_circle</span>
          {toastMessage}
        </div>, document.body
      )}

      {confirmAction && createPortal(
        <div className="fixed inset-0 z-[400000] bg-black/80 backdrop-blur-sm flex items-center justify-center p-6 animate-fade-in">
          <div className="bg-white rounded-[32px] p-6 w-full max-w-sm text-center shadow-2xl">
            <div className="w-14 h-14 bg-orange-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="material-symbols-outlined text-orange-500 text-2xl">warning</span>
            </div>
            <h2 className="text-lg font-black text-[#0a3a2a] mb-2">Potwierdzenie</h2>
            <p className="text-sm font-bold text-gray-500 mb-6">{confirmAction.label}</p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmAction(null)} className="flex-1 py-3.5 bg-gray-100 text-gray-500 rounded-xl font-black uppercase text-[11px]">Anuluj</button>
              <button onClick={() => { const cb = confirmAction.onConfirm; setConfirmAction(null); cb(); }} className="flex-1 py-3.5 bg-[#0a3a2a] text-white rounded-xl font-black uppercase text-[11px]">Potwierdź</button>
            </div>
          </div>
        </div>, document.body
      )}

      <style>{`
        .hide-scrollbar::-webkit-scrollbar { display: none; }
        @keyframes fadeIn { from { opacity: 0; transform: translate(-50%, 20px); } to { opacity: 1; transform: translate(-50%, 0); } }
        .animate-fade-in { animation: fadeIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
      `}</style>
    </div>
  );
}