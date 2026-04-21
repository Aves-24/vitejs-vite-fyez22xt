import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, query, orderBy, limit, getDocs } from 'firebase/firestore';
import { useTranslation } from 'react-i18next';

interface AnnouncementsViewProps {
  userId: string;
  userClub: string;
  onNavigate: (view: string) => void;
}

export default function AnnouncementsView({ userId, userClub, onNavigate }: AnnouncementsViewProps) {
  const { t, i18n } = useTranslation();
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [dismissedIds, setDismissedIds] = useState<string[]>(() => {
    const raw = localStorage.getItem(`dismissed_ann_${userId}`);
    return raw ? JSON.parse(raw) : [];
  });
  const [confirmDismissId, setConfirmDismissId] = useState<string | null>(null);

  useEffect(() => {
    const fetchAndMarkSeen = async () => {
      if (!userId) return;
      setIsLoading(true);

      try {
        // Pobieramy ostatnie 20 ogłoszeń z Firebase (tyle samo co HomeView)
        const snap = await getDocs(
          query(collection(db, 'announcements'), orderBy('timestamp', 'desc'), limit(20))
        );
        const allAnn = snap.docs.map(d => ({ id: d.id, ...d.data() }));

        // Filtrujemy – ten sam algorytm co w HomeView
        const myAnnouncements = allAnn.filter((a: any) => {
          const langMatch = a.lang === 'all' || a.lang === i18n.language;
          if (!langMatch) return false;
          return (
            a.target === 'ALL' ||
            (a.target === 'CLUB' && a.targetId === userClub) ||
            (a.target === 'USER' && a.targetId === userId)
          );
        });

        setAnnouncements(myAnnouncements);

        // ─── MARK AS SEEN ────────────────────────────────────────────────────
        // Zapisujemy ID pierwszego (najnowszego) ogłoszenia.
        // HomeView porównuje z tym ID, żeby zdecydować czy świecić czerwoną kropką.
        // Dzięki temu po wejściu tutaj kropka znika przy następnym powrocie na HOME.
        if (myAnnouncements.length > 0) {
          localStorage.setItem(`last_seen_ann_${userId}`, myAnnouncements[0].id);
        }
        // ─────────────────────────────────────────────────────────────────────

      } catch (e) {
        console.error('Błąd pobierania ogłoszeń:', e);
      } finally {
        setIsLoading(false);
      }
    };

    fetchAndMarkSeen();
  }, [userId, userClub, i18n.language]);

  const formatDate = (timestamp: any) => {
    if (!timestamp) return '';
    const ms = timestamp?.toMillis
      ? timestamp.toMillis()
      : timestamp?.seconds
        ? timestamp.seconds * 1000
        : new Date(timestamp).getTime();
    return new Date(ms).toLocaleDateString(
      i18n.language === 'pl' ? 'pl-PL' : i18n.language === 'de' ? 'de-DE' : 'en-GB',
      { day: '2-digit', month: 'short', year: 'numeric' }
    );
  };

  const confirmAndDismiss = (id: string) => setConfirmDismissId(id);

  const dismissAnnouncement = () => {
    if (!confirmDismissId) return;
    const updated = [...dismissedIds, confirmDismissId];
    setDismissedIds(updated);
    localStorage.setItem(`dismissed_ann_${userId}`, JSON.stringify(updated));
    setConfirmDismissId(null);
  };

  // Ogłoszenia wysłane przez trenera (senderId) vs systemowe (bez senderId)
  const isCoachMessage = (ann: any) => !!ann.senderId;

  return (
    <div className="flex flex-col min-h-screen bg-[#fcfdfe] px-5 pt-[calc(env(safe-area-inset-top)+1rem)] pb-24 max-w-md mx-auto relative">

      {/* HEADER */}
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={() => onNavigate('HOME')}
          className="w-10 h-10 bg-white rounded-xl shadow-sm border border-gray-100 flex items-center justify-center active:scale-90 transition-all text-gray-500"
        >
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
        <div>
          <h1 className="text-2xl font-black text-[#0a3a2a] tracking-tight leading-none">
            {t('announcements.pageTitle')}
          </h1>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-0.5">
            {t('announcements.title', 'Wiadomości i ogłoszenia')}
          </p>
        </div>
      </div>

      {/* STAN ŁADOWANIA */}
      {isLoading && (
        <div className="flex flex-col gap-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-24 bg-gray-100 rounded-[20px] animate-pulse"></div>
          ))}
        </div>
      )}

      {/* BRAK OGŁOSZEŃ */}
      {!isLoading && announcements.length === 0 && (
        <div className="flex flex-col items-center justify-center flex-1 py-20 text-center">
          <span className="material-symbols-outlined text-5xl text-gray-200 mb-3">notifications_off</span>
          <p className="text-[12px] font-black text-gray-400 uppercase tracking-widest">{t('announcements.empty', 'Brak powiadomień')}</p>
          <p className="text-[11px] font-medium text-gray-300 mt-1">{t('announcements.emptyDesc', 'Tutaj pojawią się wiadomości od trenera i ogłoszenia systemowe.')}</p>
        </div>
      )}

      {/* LISTA OGŁOSZEŃ */}
      {!isLoading && announcements.filter(a => !dismissedIds.includes(a.id)).length > 0 && (
        <div className="space-y-3">
          {announcements.filter(a => !dismissedIds.includes(a.id)).map((ann) => {
            const fromCoach = isCoachMessage(ann);
            return (
              <div
                key={ann.id}
                className={`p-4 rounded-[20px] shadow-sm border relative overflow-hidden ${
                  fromCoach
                    ? 'bg-indigo-50 border-indigo-100'
                    : 'bg-white border-gray-100'
                }`}
              >
                {/* Ikona dekoracyjna w tle */}
                <div className="absolute right-[-8px] top-[-8px] opacity-[0.07] pointer-events-none">
                  <span className="material-symbols-outlined text-7xl">
                    {fromCoach ? 'sports' : 'campaign'}
                  </span>
                </div>

                {/* Przycisk odrzucenia */}
                <button
                  onClick={() => confirmAndDismiss(ann.id)}
                  className="absolute top-3 right-3 z-20 w-8 h-8 flex items-center justify-center rounded-full bg-red-50 text-red-400 hover:bg-red-100 hover:text-red-600 transition-all active:scale-90 border border-red-100"
                >
                  <span className="material-symbols-outlined text-[18px] font-bold">close</span>
                </button>

                {/* Górny pasek: badge + data */}
                <div className="flex items-center justify-between mb-2 relative z-10 pr-6">
                  <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md ${
                    fromCoach
                      ? 'bg-indigo-600 text-white'
                      : 'bg-[#0a3a2a] text-[#fed33e]'
                  }`}>
                    {fromCoach ? t('announcements.badgeCoach') : t('announcements.badgeSystem')}
                  </span>
                  <span className="text-[9px] font-bold text-gray-400">{formatDate(ann.timestamp)}</span>
                </div>

                {/* Tytuł */}
                <h2 className={`text-[15px] font-black mb-1 relative z-10 leading-tight ${
                  fromCoach ? 'text-indigo-900' : 'text-[#0a3a2a]'
                }`}>
                  {ann.title}
                </h2>

                {/* Treść */}
                <p className={`text-[12px] font-medium relative z-10 leading-snug ${
                  fromCoach ? 'text-indigo-800' : 'text-gray-600'
                }`}>
                  {ann.content}
                </p>
              </div>
            );
          })}
        </div>
      )}

      {/* BRAK WIDOCZNYCH - wszystkie odrzucone */}
      {!isLoading && announcements.length > 0 && announcements.filter(a => !dismissedIds.includes(a.id)).length === 0 && (
        <div className="flex flex-col items-center justify-center flex-1 py-20 text-center">
          <span className="material-symbols-outlined text-5xl text-gray-200 mb-3">notifications_off</span>
          <p className="text-[12px] font-black text-gray-400 uppercase tracking-widest">{t('announcements.empty', 'Brak powiadomień')}</p>
          <p className="text-[11px] font-medium text-gray-300 mt-1">{t('announcements.allDeleted', 'Usunąłeś wszystkie powiadomienia.')}</p>
        </div>
      )}

      <style>{`
        @keyframes fadeInUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>

      {/* MODAL POTWIERDZENIA USUNIĘCIA */}
      {confirmDismissId && (
        <div className="fixed inset-0 z-50 flex items-end justify-center pb-8 px-5" style={{ background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(4px)' }}>
          <div className="w-full max-w-md bg-white rounded-[28px] p-6 shadow-2xl">
            <div className="flex flex-col items-center text-center mb-6">
              <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center mb-4">
                <span className="material-symbols-outlined text-red-500 text-[32px]">delete</span>
              </div>
              <h2 className="text-[18px] font-black text-[#0a3a2a] leading-tight mb-1">{t('announcements.deleteTitle', 'Usunąć powiadomienie?')}</h2>
              <p className="text-[12px] font-medium text-gray-400">{t('announcements.deleteConfirmDesc')}</p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmDismissId(null)}
                className="flex-1 h-12 rounded-2xl border border-gray-200 text-[13px] font-black text-gray-500 active:scale-95 transition-all"
              >
                {t('setup.warningCancel')}
              </button>
              <button
                onClick={dismissAnnouncement}
                className="flex-1 h-12 rounded-2xl bg-red-500 text-white text-[13px] font-black active:scale-95 transition-all shadow-sm"
              >
                {t('announcements.deleteBtn', 'Usuń')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}