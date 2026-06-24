import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { useTranslation } from 'react-i18next';
import i18n from 'i18next';

function getDateStrings() {
  const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const today = new Date();
  const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
  return { todayStr: fmt(today), tomorrowStr: fmt(tomorrow) };
}

// Format date label: "Heute" / "Morgen" / "Mi · 15. Aug" / "15. Aug 2027"
function formatDateLabel(dateStr: string, todayStr: string, tomorrowStr: string, t: any): string {
  if (dateStr === todayStr) return t('coachPlan.today', { defaultValue: 'Heute' });
  if (dateStr === tomorrowStr) return t('coachPlan.tomorrow', { defaultValue: 'Morgen' });
  try {
    const d = new Date(dateStr + 'T00:00:00');
    const today = new Date(todayStr + 'T00:00:00');
    const sameYear = d.getFullYear() === today.getFullYear();
    const opts: Intl.DateTimeFormatOptions = sameYear
      ? { weekday: 'short', day: 'numeric', month: 'short' }
      : { day: 'numeric', month: 'short', year: 'numeric' };
    return d.toLocaleDateString(i18n.language || 'de', opts);
  } catch { return dateStr; }
}

interface CoachPlanBannerProps {
  userId: string;
  compact?: boolean;
  onClick?: () => void;
  onCountChange?: (count: number) => void;
  onLatestEvent?: (event: CoachPlanEvent | null) => void;
  acknowledgedIds?: Set<string>;
  onAcknowledge?: (id: string) => void;
  // True once acknowledgements have loaded from Firestore — gates rendering so
  // events don't flash as unread before the read-state is known.
  acksReady?: boolean;
  // Reports IDs of currently-loaded events so the parent can prune stale acks.
  onEntriesLoaded?: (ids: string[]) => void;
}

export interface CoachPlanEvent {
  id: string;
  title: string;
  date: string;          // YYYY-MM-DD
  time?: string;
  address?: string;
  originCoachName?: string;
  description?: string;
}

export default function CoachPlanBanner({ userId, compact = false, onClick, onCountChange, onLatestEvent, acknowledgedIds, onAcknowledge, acksReady, onEntriesLoaded }: CoachPlanBannerProps) {
  const { t } = useTranslation();
  const [events, setEvents] = useState<CoachPlanEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchPlan = async () => {
      if (!userId) { setIsLoading(false); return; }
      setIsLoading(true);
      try {
        const { todayStr, tomorrowStr } = getDateStrings();

        // Tylko 1 prosty filtr — żeby nie wymagać composite index w Firestore.
        // Reszta filtrowania lokalnie (lista jest mała: max kilkanaście eventów / ucznia).
        const snap = await getDocs(query(
          collection(db, `users/${userId}/tournaments`),
          where('category', '==', 'Trener')
        ));

        const all: CoachPlanEvent[] = snap.docs.map(d => {
          const data = d.data();
          return {
            id: d.id,
            title: data.title || '',
            date: data.date || '',
            time: data.time || '',
            address: data.address || '',
            originCoachName: data.originCoachName || '',
            description: data.note || data.description || '',
          };
        });

        const sorted = all.sort((a, b) => {
          if (a.date !== b.date) return a.date.localeCompare(b.date);
          return (a.time || '').localeCompare(b.time || '');
        });

        // compact (HomeView) → tylko dziś/jutro
        // full (MyCoachView)  → wszystkie nadchodzące (date >= today)
        const filtered = compact
          ? sorted.filter(ev => ev.date === todayStr || ev.date === tomorrowStr)
          : sorted.filter(ev => ev.date >= todayStr);

        setEvents(filtered);
        onEntriesLoaded?.(filtered.map(ev => ev.id));
      } catch (e) {
        console.error('CoachPlanBanner: błąd pobierania', e);
      }
      setIsLoading(false);
    };
    fetchPlan();
  }, [userId, compact]);

  // Licznik + podgląd reaktywnie względem potwierdzeń (nie tylko przy pobraniu).
  useEffect(() => {
    if (isLoading) return;
    const visibleCount = events.filter(ev => !acknowledgedIds?.has(ev.id)).length;
    onCountChange?.(compact ? events.length : visibleCount);
    onLatestEvent?.(events[0] || null);
  }, [events, acknowledgedIds, isLoading, compact]);

  if (isLoading || acksReady === false || events.length === 0) return null;

  const { todayStr, tomorrowStr } = getDateStrings();

  // Compact mode (HomeView) — pokazuje tylko najbliższy event jako banner
  if (compact) {
    const nextEvent = events[0];
    const isToday = nextEvent.date === todayStr;
    const dateLabel = formatDateLabel(nextEvent.date, todayStr, tomorrowStr, t);
    return (
      <div
        onClick={onClick}
        className={`bg-gradient-to-br from-[#0a3a2a] to-[#0d4a36] rounded-[20px] p-3.5 flex items-center gap-3 relative overflow-hidden ${onClick ? 'cursor-pointer active:scale-[0.98] transition-all' : ''} shadow-md`}
      >
        <div className="absolute -right-5 -top-5 w-28 h-28 rounded-full border-[14px] border-[#fed33e]/10 pointer-events-none" />
        <div className="w-10 h-10 bg-[#fed33e] rounded-xl flex items-center justify-center shrink-0 relative z-10">
          <span className="material-symbols-outlined text-[#0a3a2a] text-[20px]">sports</span>
        </div>
        <div className="flex-1 min-w-0 relative z-10">
          <span className="text-[8px] font-black text-[#fed33e]/80 uppercase tracking-widest block mb-0.5">
            {dateLabel} · {t('coachPlan.label', { defaultValue: 'Trainerplan' })}
          </span>
          <h3 className="font-black text-white text-[13px] leading-tight truncate">{nextEvent.title}</h3>
          {(nextEvent.time || nextEvent.originCoachName) && (
            <div className="flex items-center gap-1.5 mt-0.5">
              {nextEvent.time && (
                <span className="flex items-center gap-0.5 text-[10px] font-bold text-emerald-300/80">
                  <span className="material-symbols-outlined text-[11px]">schedule</span>
                  {nextEvent.time}
                </span>
              )}
              {nextEvent.originCoachName && (
                <span className="text-[10px] font-bold text-emerald-300/60 truncate">· {nextEvent.originCoachName}</span>
              )}
            </div>
          )}
        </div>
        {events.length > 1 && (
          <div className="shrink-0 bg-[#fed33e] text-[#0a3a2a] w-7 h-7 rounded-full flex items-center justify-center font-black text-[10px] z-10">
            +{events.length - 1}
          </div>
        )}
      </div>
    );
  }

  // Full mode (MyCoachView) — pełna lista
  const visibleEvents = events.filter(ev => !acknowledgedIds?.has(ev.id));
  const acknowledgedEvents = events.filter(ev => acknowledgedIds?.has(ev.id)).slice(0, 10);

  if (visibleEvents.length === 0 && acknowledgedEvents.length === 0) return null;

  return (
    <div className="space-y-2">
      {visibleEvents.map(ev => {
        const isToday = ev.date === todayStr;
        const dateLabel = formatDateLabel(ev.date, todayStr, tomorrowStr, t);
        return (
          <div key={ev.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 flex items-stretch">
            <div className="flex-1 p-3">
              <div className="flex items-start gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${isToday ? 'bg-[#fed33e]' : 'bg-emerald-50'}`}>
                  <span className={`material-symbols-outlined text-[18px] ${isToday ? 'text-[#0a3a2a]' : 'text-emerald-600'}`}>sports</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className={`text-[8px] font-black uppercase tracking-widest ${isToday ? 'text-[#fed33e]' : 'text-emerald-600'}`}>
                      {dateLabel} · {t('coachPlan.label', { defaultValue: 'Trainerplan' })}
                    </span>
                    <span className="flex items-center gap-0.5 bg-emerald-50 border border-emerald-100 rounded-full px-1.5 py-0.5 shrink-0">
                      <span className="material-symbols-outlined text-[10px] text-emerald-600">person</span>
                      <span className="text-[9px] font-black text-emerald-700 truncate max-w-[80px]">
                        {ev.originCoachName || 'Trener'}
                      </span>
                    </span>
                  </div>
                  <h4 className="font-black text-[#0a3a2a] text-[13px] leading-tight">{ev.title}</h4>
                  <div className="flex flex-wrap items-center gap-2 mt-1">
                    {ev.time && (
                      <span className="flex items-center gap-0.5 text-[10px] font-bold text-gray-500">
                        <span className="material-symbols-outlined text-[12px]">schedule</span>
                        {ev.time}
                      </span>
                    )}
                    {ev.address && (
                      <span className="flex items-center gap-0.5 text-[10px] font-bold text-gray-500 truncate">
                        <span className="material-symbols-outlined text-[12px]">location_on</span>
                        {ev.address}
                      </span>
                    )}
                  </div>
                  {ev.description && (
                    <p className="text-[11px] text-[#333] font-medium leading-snug mt-2 bg-gray-50 rounded-lg px-2.5 py-2 italic">
                      "{ev.description}"
                    </p>
                  )}
                </div>
              </div>
            </div>
            {onAcknowledge && (
              <button
                onClick={() => onAcknowledge(ev.id)}
                className="shrink-0 w-11 flex items-center justify-center text-gray-300 hover:text-emerald-500 active:scale-90 transition-all border-l border-gray-100 rounded-r-2xl"
                title="Wzięte do wiadomości"
              >
                <span className="material-symbols-outlined text-[22px]">check_circle</span>
              </button>
            )}
          </div>
        );
      })}
      {acknowledgedEvents.length > 0 && (
        <>
          <div className="flex items-center gap-2 px-1 py-1">
            <span className="material-symbols-outlined text-[13px] text-gray-400">check_circle</span>
            <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest">
              {t('coachPlan.readHistory', { defaultValue: 'Przeczytane' })} · {acknowledgedEvents.length}
            </span>
          </div>
          {acknowledgedEvents.map(ev => {
            const dateLabel = formatDateLabel(ev.date, todayStr, tomorrowStr, t);
            return (
              <div key={ev.id} className="bg-gray-50 rounded-2xl border border-gray-100 flex items-start p-3 gap-3 opacity-75">
                <div className="w-10 h-10 rounded-xl bg-gray-200 flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-[18px] text-gray-400">sports</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-[8px] font-black uppercase tracking-widest text-gray-400">
                      {dateLabel} · {t('coachPlan.label', { defaultValue: 'Trainerplan' })}
                    </span>
                    {ev.originCoachName && (
                      <span className="text-[9px] font-black text-gray-400 truncate max-w-[80px]">{ev.originCoachName}</span>
                    )}
                  </div>
                  <h4 className="font-black text-gray-500 text-[13px] leading-tight">{ev.title}</h4>
                  <div className="flex flex-wrap items-center gap-2 mt-1">
                    {ev.time && (
                      <span className="flex items-center gap-0.5 text-[10px] font-bold text-gray-400">
                        <span className="material-symbols-outlined text-[12px]">schedule</span>
                        {ev.time}
                      </span>
                    )}
                    {ev.address && (
                      <span className="flex items-center gap-0.5 text-[10px] font-bold text-gray-400 truncate">
                        <span className="material-symbols-outlined text-[12px]">location_on</span>
                        {ev.address}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
