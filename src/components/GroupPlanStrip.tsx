import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { subscribeMyGroupPlans, type GroupPlan } from '../utils/groupPlans';
import { dayKeyOfDate, listOccurrences, upcomingOccurrences, type Occurrence } from '../utils/groupSchedule';

// [PLAN DLA UCZNIA 2026-11-05] Najbliższy trening grup ucznia na Home
// (user: „pokazuj”). Dane z lustra groupPlans/ — patrz utils/groupPlans.

interface Row { plan: GroupPlan; today: Occurrence[]; next: Occurrence | null }

const addDay = (key: string, n: number) => {
  const d = new Date(`${key}T12:00:00`);
  d.setDate(d.getDate() + n);
  return dayKeyOfDate(d);
};

export default function GroupPlanStrip({ userId }: { userId: string }) {
  const { t, i18n } = useTranslation();
  const [plans, setPlans] = useState<GroupPlan[]>([]);

  useEffect(() => {
    if (!userId) return;
    return subscribeMyGroupPlans(userId, setPlans);
  }, [userId]);

  const todayKey = dayKeyOfDate(new Date());
  const rows: Row[] = plans
    .filter(p => p.schedule)
    .map(p => {
      const today = listOccurrences(p.schedule, todayKey, addDay(todayKey, 1));
      const fromKey = today.some(o => !o.cancelled) ? todayKey : addDay(todayKey, 1);
      return { plan: p, today, next: upcomingOccurrences(p.schedule, fromKey, 1)[0] ?? null };
    })
    .filter(r => r.today.length > 0 || r.next)
    .sort((a, b) => {
      const ka = a.today.some(o => !o.cancelled) ? `0${a.today[0].time}` : `1${a.next?.date}${a.next?.time}`;
      const kb = b.today.some(o => !o.cancelled) ? `0${b.today[0].time}` : `1${b.next?.date}${b.next?.time}`;
      return ka.localeCompare(kb);
    })
    .slice(0, 2);

  if (rows.length === 0) return null;

  const fmtDay = (key: string) =>
    new Date(`${key}T12:00:00`).toLocaleDateString(i18n.language, { weekday: 'short', day: 'numeric', month: 'numeric' });

  return (
    <div className="mt-2 space-y-1.5">
      {rows.map(({ plan, today, next }) => {
        const todayOn = today.filter(o => !o.cancelled);
        const todayCancelled = today.length > 0 && todayOn.length === 0;
        const shown = todayOn[0] ?? next;
        const place = shown?.place ? ` · ${shown.place}` : '';
        return (
          <div
            key={plan.groupId}
            data-testid="group-plan"
            className={`rounded-2xl border px-3 py-2.5 flex items-center gap-3 ${todayOn.length ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-gray-100'}`}
          >
            <span className={`material-symbols-outlined text-[22px] shrink-0 ${todayOn.length ? 'text-emerald-600' : 'text-gray-400'}`}>
              {plan.icon || 'groups'}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 leading-none">
                {todayOn.length ? t('groupPlan.today') : todayCancelled ? t('groupPlan.cancelledToday') : t('groupPlan.next')}
              </p>
              <p className="text-[13px] font-black text-[#0a3a2a] truncate mt-1">
                {todayOn.length
                  ? `${todayOn.map(o => o.time).join(', ')} · ${plan.name}${place}`
                  : next ? `${fmtDay(next.date)} · ${next.time} · ${plan.name}${place}` : plan.name}
              </p>
              {todayCancelled && next && (
                <p className="text-[11px] font-bold text-gray-400 truncate mt-0.5">
                  {t('groupPlan.next')}: {fmtDay(next.date)} · {next.time}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
