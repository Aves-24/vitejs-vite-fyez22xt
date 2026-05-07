import React, { useState, useEffect, useCallback } from 'react';
import { db } from '../firebase';
import { doc, getDoc, updateDoc, collection, query, orderBy, limit, getDocs } from 'firebase/firestore';
import { useTranslation } from 'react-i18next';
import CoachLogPanel from '../components/CoachLogPanel';
import CoachPlanBanner from '../components/CoachPlanBanner';
import StudentMessageSheet from '../components/StudentMessageSheet';

const MAX_ACKED = 10;
const ackedCacheKey = (uid: string) => `grotX_acked_${uid}`;

interface MyCoachViewProps {
  userId: string;
  onBack: () => void;
  onNavigateToSettings?: () => void;
  onNavigateToStats?: (date: string) => void;
  pendingOpenCoachId?: string | null;
  onClearPending?: () => void;
}

interface CoachInfo {
  id: string;
  firstName: string;
  lastName: string;
  clubName?: string;
}

interface SessionWithNote {
  id: string;
  date: string;
  score: number;
  arrows: number;
  distance: string;
  coachNote: string;
  timestamp: number;
}

export default function MyCoachView({ userId, onBack, onNavigateToSettings, onNavigateToStats, pendingOpenCoachId, onClearPending }: MyCoachViewProps) {
  const { t } = useTranslation();
  const [coaches, setCoaches] = useState<CoachInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'plan' | 'diary' | 'tips'>('plan');
  const [planCount, setPlanCount] = useState(0);
  const [diaryCount, setDiaryCount] = useState(0);
  const [sessionNotes, setSessionNotes] = useState<SessionWithNote[]>([]);
  const [sessionNotesLoading, setSessionNotesLoading] = useState(true);
  const [unreadCoachIds, setUnreadCoachIds] = useState<Set<string>>(new Set());
  const [openMessageCoach, setOpenMessageCoach] = useState<CoachInfo | null>(null);

  useEffect(() => {
    if (!pendingOpenCoachId || isLoading) return;
    const coach = coaches.find(c => c.id === pendingOpenCoachId);
    if (coach) {
      setOpenMessageCoach(coach);
      onClearPending?.();
    } else {
      // Coach not found after load — clear pending to avoid stuck state
      onClearPending?.();
    }
  }, [pendingOpenCoachId, coaches, isLoading]);
  // ordered array (newest first, max MAX_ACKED) — source of truth for both display and cache
  const [acknowledgedList, setAcknowledgedList] = useState<string[]>(() => {
    try {
      const cached = localStorage.getItem(ackedCacheKey(userId));
      return cached ? JSON.parse(cached) : [];
    } catch { return []; }
  });
  const acknowledgedIds = new Set(acknowledgedList);

  useEffect(() => {
    const fetchCoaches = async () => {
      if (!userId) return;
      setIsLoading(true);
      try {
        const userDoc = await getDoc(doc(db, 'users', userId));
        if (!userDoc.exists()) { setIsLoading(false); return; }

        const data = userDoc.data();
        // merge Firebase list with local cache — keep newest MAX_ACKED unique IDs
        const remote: string[] = data.acknowledgedItems || [];
        setAcknowledgedList(prev => {
          const merged = [...new Set([...prev, ...remote])].slice(0, MAX_ACKED);
          try { localStorage.setItem(ackedCacheKey(userId), JSON.stringify(merged)); } catch { /* ignore */ }
          return merged;
        });

        const coachIds: string[] = data.coaches || [];
        if (coachIds.length === 0) { setCoaches([]); setIsLoading(false); return; }

        const list: CoachInfo[] = [];
        await Promise.all(coachIds.map(async cid => {
          try {
            const cDoc = await getDoc(doc(db, 'users', cid));
            if (cDoc.exists()) {
              const d = cDoc.data();
              list.push({ id: cid, firstName: d.firstName || '', lastName: d.lastName || '', clubName: d.clubName || '' });
            }
          } catch { /* ignore */ }
        }));
        setCoaches(list);

        const unread = new Set<string>();
        await Promise.all(list.map(async c => {
          try {
            const snap = await getDoc(doc(db, `users/${c.id}/studentMessages/${userId}`));
            if (snap.exists()) {
              const d = snap.data();
              if ((d.lastCoachAt || 0) > (d.lastStudentReadAt || 0)) unread.add(c.id);
            }
          } catch { /* ignore */ }
        }));
        setUnreadCoachIds(unread);
      } catch (e) {
        console.error('MyCoachView: błąd pobierania trenerów', e);
      }
      setIsLoading(false);
    };
    fetchCoaches();
  }, [userId]);

  useEffect(() => {
    const fetchSessionNotes = async () => {
      if (!userId) { setSessionNotesLoading(false); return; }
      setSessionNotesLoading(true);
      try {
        const snap = await getDocs(query(
          collection(db, `users/${userId}/sessions`),
          orderBy('timestamp', 'desc'),
          limit(60)
        ));
        const withNote: SessionWithNote[] = [];
        snap.docs.forEach(d => {
          const data = d.data();
          if (!data.coachNote) return;
          const ts = data.timestamp?.toMillis
            ? data.timestamp.toMillis()
            : data.timestamp?.seconds
            ? data.timestamp.seconds * 1000
            : (typeof data.timestamp === 'number' ? data.timestamp : 0);
          withNote.push({
            id: d.id, date: data.date || '', score: data.score || 0,
            arrows: data.arrows || 0, distance: data.distance || '',
            coachNote: data.coachNote, timestamp: ts,
          });
        });
        setSessionNotes(withNote);
      } catch (e) {
        console.error('MyCoachView: błąd pobierania notatek sesji', e);
      }
      setSessionNotesLoading(false);
    };
    fetchSessionNotes();
  }, [userId]);

  const handleAcknowledge = useCallback(async (id: string) => {
    setAcknowledgedList(prev => {
      const updated = [id, ...prev.filter(x => x !== id)].slice(0, MAX_ACKED);
      try { localStorage.setItem(ackedCacheKey(userId), JSON.stringify(updated)); } catch { /* ignore */ }
      updateDoc(doc(db, 'users', userId), { acknowledgedItems: updated }).catch(() => { /* ignore */ });
      return updated;
    });
  }, [userId]);

  const unreadNotes = sessionNotes.filter(s => !acknowledgedIds.has(s.id));
  const readNotes = sessionNotes.filter(s => acknowledgedIds.has(s.id)).slice(0, 10);

  return (
    <div className="flex flex-col min-h-screen bg-[#fcfdfe] relative overflow-x-hidden">

      {/* HEADER */}
      <div className="bg-gradient-to-b from-[#0a3a2a] to-[#0d4a36] pt-[calc(env(safe-area-inset-top)+1rem)] pb-4 px-5 rounded-b-[36px] shadow-xl shadow-[#0a3a2a]/20 relative z-20 shrink-0">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center text-white hover:bg-white/20 transition-all active:scale-90 shrink-0">
            <span className="material-symbols-outlined">arrow_back</span>
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-black text-white leading-tight truncate">{t('myCoach.headerLabel', { defaultValue: 'Schützen-Bereich' })}</h1>
            {!isLoading && coaches.length > 0 && (
              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                {coaches.map(c => {
                  const initials = `${c.firstName[0] || ''}${c.lastName[0] || ''}`.toUpperCase();
                  const hasUnread = unreadCoachIds.has(c.id);
                  return (
                    <button
                      key={c.id}
                      onClick={() => setOpenMessageCoach(c)}
                      className="flex items-center gap-1 bg-white/10 hover:bg-white/20 active:scale-95 transition-all rounded-full pl-0.5 pr-2 py-0.5 relative"
                    >
                      <div className="w-5 h-5 bg-[#fed33e] rounded-full flex items-center justify-center shrink-0 relative">
                        <span className="text-[8px] font-black text-[#0a3a2a]">{initials || '?'}</span>
                        {hasUnread && <div className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-red-500 border border-white rounded-full" />}
                      </div>
                      <span className="text-[9px] font-black text-white/80 truncate max-w-[80px]">{c.firstName} {c.lastName}</span>
                      <span className="material-symbols-outlined text-[11px] text-white/40">chat</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <div className="flex items-center shrink-0">
            <span className="text-base font-black text-white tracking-tighter leading-none">GROT-X</span>
            <div className="bg-[#fed33e] w-1.5 h-1.5 rounded-full ml-1" />
          </div>
        </div>
      </div>

      {/* TAB BAR */}
      <div className="bg-white shrink-0 z-10 px-3 pt-3 pb-2">
        <div className="bg-gray-50 rounded-2xl p-1 flex">
          {[
            { key: 'plan',  icon: 'event',     label: t('myCoach.tabPlan',  { defaultValue: 'Plan' }),      badge: planCount },
            { key: 'diary', icon: 'edit_note', label: t('myCoach.tabDiary', { defaultValue: 'Tagebuch' }),  badge: diaryCount },
            { key: 'tips',  icon: 'sports',    label: t('myCoach.tabTips',  { defaultValue: 'Wskazówki' }), badge: unreadNotes.length },
          ].map(tab => {
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key as any)}
                className={`flex-1 flex items-center justify-center gap-1 py-2.5 rounded-xl transition-all duration-200 ${
                  isActive ? 'bg-[#0a3a2a] text-[#fed33e] shadow-md' : 'text-gray-500 active:scale-95'
                }`}
              >
                <span className={`material-symbols-outlined text-[18px] ${isActive ? 'text-[#fed33e]' : 'text-gray-400'}`}>{tab.icon}</span>
                <span className="text-[10px] font-black uppercase tracking-wider">{tab.label}</span>
                {tab.badge > 0 && (
                  <span className={`min-w-[15px] h-[15px] px-0.5 rounded-full text-[8px] font-black flex items-center justify-center shrink-0 ${
                    isActive ? 'bg-[#fed33e] text-[#0a3a2a]' : 'bg-emerald-600 text-white'
                  }`}>{tab.badge}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* TAB CONTENT */}
      <div className="flex-1 overflow-y-auto pb-32 px-5 pt-3">

        {isLoading && (
          <div className="text-center py-10">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{t('myCoach.loading', { defaultValue: 'Lädt…' })}</span>
          </div>
        )}

        {/* Plan */}
        <div className={activeTab === 'plan' ? '' : 'hidden'}>
          {!isLoading && (
            coaches.length > 0 ? (
              <>
                <CoachPlanBanner
                  userId={userId}
                  compact={false}
                  onCountChange={setPlanCount}
                  acknowledgedIds={acknowledgedIds}
                  onAcknowledge={handleAcknowledge}
                />
                <div className="text-center mt-4">
                  <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">
                    {t('myCoach.planNote', { defaultValue: 'Heute & Morgen — vom Trainer geplant' })}
                  </p>
                </div>
              </>
            ) : (
              <div className="bg-gray-50 rounded-[20px] p-8 text-center border border-dashed border-gray-200">
                <span className="material-symbols-outlined text-gray-200 text-4xl mb-2 block">event_busy</span>
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{t('myCoach.noPlan', { defaultValue: 'Kein Plan' })}</p>
              </div>
            )
          )}
        </div>

        {/* Tagebuch */}
        <div className={activeTab === 'diary' ? '' : 'hidden'}>
          {!isLoading && (
            coaches.length > 0 ? (
              <CoachLogPanel
                studentId={userId}
                currentUserId={userId}
                mode="student"
                onCountChange={setDiaryCount}
                acknowledgedIds={acknowledgedIds}
                onAcknowledge={handleAcknowledge}
              />
            ) : (
              <div className="bg-gray-50 rounded-[20px] p-8 text-center border border-dashed border-gray-200">
                <span className="material-symbols-outlined text-gray-200 text-4xl mb-2 block">menu_book</span>
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{t('myCoach.noDiary', { defaultValue: 'Noch keine Einträge' })}</p>
              </div>
            )
          )}
        </div>

        {/* Wskazówki */}
        <div className={activeTab === 'tips' ? '' : 'hidden'}>
          {sessionNotesLoading ? (
            <div className="text-center py-10">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{t('myCoach.loading', { defaultValue: 'Lädt…' })}</span>
            </div>
          ) : unreadNotes.length === 0 && readNotes.length === 0 ? (
            <div className="bg-gray-50 rounded-[20px] p-8 text-center border border-dashed border-gray-200">
              <span className="material-symbols-outlined text-gray-200 text-4xl mb-2 block">sports</span>
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{t('myCoach.noTips', { defaultValue: 'Brak wskazówek' })}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {unreadNotes.length > 0 && (
                <div className="bg-white rounded-[20px] border border-gray-100 shadow-sm overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
                    <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center shrink-0">
                      <span className="material-symbols-outlined text-white text-[15px]">sports</span>
                    </div>
                    <div className="leading-tight">
                      <h3 className="text-sm font-black text-[#0a3a2a]">{t('myCoach.sessionNotesTitle', { defaultValue: 'Wskazówki do sesji' })}</h3>
                      <p className="text-[8px] font-bold text-gray-400 uppercase tracking-widest">
                        {t('myCoach.sessionNotesSubtitle', { defaultValue: 'Kliknij aby otworzyć trening' })} · {unreadNotes.length}
                      </p>
                    </div>
                  </div>
                  <div className="divide-y divide-gray-50">
                    {unreadNotes.map(s => {
                      const pts = s.arrows > 0 ? Math.round((s.score / (s.arrows * 10)) * 100) : 0;
                      const dateLabel = s.date
                        ? new Date(s.date + 'T00:00:00').toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })
                        : '';
                      return (
                        <div key={s.id} className="flex items-start">
                          <button
                            onClick={() => s.date && onNavigateToStats?.(s.date)}
                            className="flex-1 text-left p-3 flex items-start gap-2.5 active:bg-blue-50 transition-colors group"
                          >
                            <div className="w-7 h-7 rounded-lg bg-blue-50 group-active:bg-blue-100 flex items-center justify-center shrink-0 mt-0.5 transition-colors">
                              <span className="material-symbols-outlined text-[14px] text-blue-500">sports</span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-baseline justify-between gap-2 mb-0.5">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  {s.distance && <span className="text-[8px] font-black text-blue-700 uppercase tracking-widest">{s.distance}</span>}
                                  <span className="text-[8px] font-bold text-gray-400">{s.score} pkt · {pts}%</span>
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                  <span className="text-[8px] font-bold text-gray-400">{dateLabel}</span>
                                  <span className="material-symbols-outlined text-[12px] text-gray-300 group-active:text-blue-400 transition-colors">chevron_right</span>
                                </div>
                              </div>
                              <p className="text-[11px] font-bold text-[#333] leading-snug whitespace-pre-wrap break-words">"{s.coachNote}"</p>
                            </div>
                          </button>
                          <button
                            onClick={() => handleAcknowledge(s.id)}
                            className="shrink-0 w-10 flex items-center justify-center self-stretch text-gray-300 hover:text-emerald-500 active:scale-90 transition-all"
                            title="Wzięte do wiadomości"
                          >
                            <span className="material-symbols-outlined text-[20px]">check_circle</span>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              {readNotes.length > 0 && (
                <div className="bg-gray-50 rounded-[20px] border border-gray-100 overflow-hidden">
                  <div className="px-4 py-2 border-b border-gray-100 flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[14px] text-gray-400">check_circle</span>
                    <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest">{t('myCoach.readHistory', { defaultValue: 'Przeczytane' })} · {readNotes.length}</span>
                  </div>
                  <div className="divide-y divide-gray-100">
                    {readNotes.map(s => {
                      const pts = s.arrows > 0 ? Math.round((s.score / (s.arrows * 10)) * 100) : 0;
                      const dateLabel = s.date
                        ? new Date(s.date + 'T00:00:00').toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })
                        : '';
                      return (
                        <button
                          key={s.id}
                          onClick={() => s.date && onNavigateToStats?.(s.date)}
                          className="w-full text-left p-3 flex items-start gap-2.5 active:bg-gray-100 transition-colors group opacity-50"
                        >
                          <div className="w-7 h-7 rounded-lg bg-gray-200 flex items-center justify-center shrink-0 mt-0.5">
                            <span className="material-symbols-outlined text-[14px] text-gray-400">sports</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-baseline justify-between gap-2 mb-0.5">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                {s.distance && <span className="text-[8px] font-black text-gray-500 uppercase tracking-widest">{s.distance}</span>}
                                <span className="text-[8px] font-bold text-gray-400">{s.score} pkt · {pts}%</span>
                              </div>
                              <span className="text-[8px] font-bold text-gray-400 shrink-0">{dateLabel}</span>
                            </div>
                            <p className="text-[11px] font-bold text-gray-500 leading-snug whitespace-pre-wrap break-words">"{s.coachNote}"</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

      </div>

      {openMessageCoach && (
        <StudentMessageSheet
          coachId={openMessageCoach.id}
          studentId={userId}
          currentUserId={userId}
          mode="student"
          otherName={`${openMessageCoach.firstName} ${openMessageCoach.lastName}`.trim()}
          onClose={() => {
            setOpenMessageCoach(null);
            setUnreadCoachIds(prev => { const n = new Set(prev); n.delete(openMessageCoach.id); return n; });
          }}
        />
      )}
    </div>
  );
}
