import React from 'react';
import { useTranslation } from 'react-i18next';
import MaintenanceInfo from './MaintenanceInfo';
import { EquipmentSetup, MaintenanceRule } from '../../config/equipmentSetups';
import { MAINTENANCE_INTERVALS, tasksForDiscipline } from '../../config/maintenanceTasks';
import { addMonths, doneKey, localDateStr, nextDue, visibleFrom } from '../../utils/maintenanceSchedule';

/**
 * [WARTUNG] Podzakładka WARTUNG zestawu — plan konserwacji (2026-10-30).
 *
 * Każda czynność z katalogu dyscypliny: włącznik, data pierwszego
 * przypomnienia, rytm w miesiącach i (i) z pełną instrukcją. Przypomnienia
 * same trafiają do kalendarza jako todo 21 dni przed terminem
 * (`maintenanceSync.ts`) — tu nic nie zapisuje się do kalendarza.
 */

interface MaintenanceSectionProps {
  setup: EquipmentSetup;
  /** `users/{uid}.maintenanceDone` — daty wykonania, tylko do odczytu. */
  done: Record<string, string>;
  onChange: (maintenance: Record<string, MaintenanceRule>) => void;
}

const MaintenanceSection: React.FC<MaintenanceSectionProps> = ({ setup, done, onChange }) => {
  const { t, i18n } = useTranslation();
  const rules = setup.maintenance ?? {};
  const tasks = tasksForDiscipline(setup.discipline);
  const today = localDateStr(new Date());
  const fmt = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString(i18n.language, { day: 'numeric', month: 'short', year: 'numeric' });

  const patch = (taskId: string, next: Partial<MaintenanceRule>, every: number) => {
    // Pierwsze włączenie: termin na 1. dzień następnego miesiąca — user od razu
    // widzi datę i może ją zmienić. Rytm z katalogu.
    const base: MaintenanceRule = rules[taskId] ?? {
      on: false,
      start: addMonths(`${today.slice(0, 8)}01`, 1),
      every,
    };
    onChange({ ...rules, [taskId]: { ...base, ...next } });
  };

  const activeCount = tasks.filter(task => rules[task.id]?.on).length;

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2 bg-[#0a3a2a]/5 border border-[#0a3a2a]/10 rounded-2xl p-3">
        <span className="material-symbols-outlined text-[#0a3a2a] text-[20px] shrink-0">build</span>
        <div className="flex-1 min-w-0">
          <p className="text-[12px] font-black text-[#0a3a2a] leading-tight">{t('maintenance.section.title')}</p>
          <p className="text-[10px] font-bold text-gray-500 leading-snug mt-0.5">
            {t('maintenance.section.hint', { count: activeCount })}
          </p>
        </div>
        <MaintenanceInfo taskId="howItWorks" />
      </div>

      <div className="space-y-2">
        {tasks.map(task => {
          const rule = rules[task.id];
          const on = !!rule?.on;
          const lastDone = done[doneKey(setup.id, task.id)];
          const due = rule ? nextDue(rule, lastDone) : null;
          return (
            <div
              key={task.id}
              className={`rounded-2xl border p-3 transition-all ${on ? 'border-emerald-300 bg-emerald-50/40' : 'border-gray-100 bg-white'}`}
            >
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  role="switch"
                  aria-checked={on}
                  onClick={() => patch(task.id, { on: !on }, task.every)}
                  className={`w-10 h-6 rounded-full relative shrink-0 transition-all ${on ? 'bg-emerald-500' : 'bg-gray-200'}`}
                >
                  <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${on ? 'left-[18px]' : 'left-0.5'}`} />
                </button>
                <button
                  type="button"
                  onClick={() => patch(task.id, { on: !on }, task.every)}
                  className="flex-1 min-w-0 text-left"
                >
                  <span className={`block text-[13px] font-black leading-tight ${on ? 'text-[#0a3a2a]' : 'text-gray-500'}`}>
                    {t(`maintenance.tasks.${task.id}.title`)}
                  </span>
                  {!on && (
                    <span className="block text-[10px] font-bold text-gray-400 mt-0.5">
                      {t('maintenance.section.suggested', { count: task.every })}
                    </span>
                  )}
                </button>
                <MaintenanceInfo taskId={task.id} discipline={setup.discipline} />
              </div>

              {on && rule && due && (
                <div className="mt-3 pl-[50px] space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <label className="block">
                      <span className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">
                        {t('maintenance.section.start')}
                      </span>
                      <input
                        type="date"
                        value={rule.start}
                        onChange={e => e.target.value && patch(task.id, { start: e.target.value }, task.every)}
                        className="w-full bg-white border border-gray-200 rounded-xl px-2 py-2 text-[12px] font-bold text-[#0a3a2a] outline-none focus:border-emerald-500"
                      />
                    </label>
                    <label className="block">
                      <span className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">
                        {t('maintenance.section.every')}
                      </span>
                      <select
                        value={rule.every}
                        onChange={e => patch(task.id, { every: Number(e.target.value) }, task.every)}
                        className="w-full bg-white border border-gray-200 rounded-xl px-2 py-2 text-[12px] font-bold text-[#0a3a2a] outline-none focus:border-emerald-500"
                      >
                        {MAINTENANCE_INTERVALS.map(m => (
                          <option key={m} value={m}>{t('maintenance.section.months', { count: m })}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <p className="text-[10px] font-bold text-gray-500 leading-snug">
                    <span className="material-symbols-outlined text-[12px] align-[-2px] mr-1 text-emerald-600">event</span>
                    {t('maintenance.section.next', { date: fmt(due) })}
                    {' · '}
                    {today >= visibleFrom(due)
                      ? t('maintenance.section.inCalendar')
                      : t('maintenance.section.visibleFrom', { date: fmt(visibleFrom(due)) })}
                  </p>
                  {lastDone && (
                    <p className="text-[10px] font-bold text-gray-400 leading-snug">
                      <span className="material-symbols-outlined text-[12px] align-[-2px] mr-1">history</span>
                      {t('maintenance.section.lastDone', { date: fmt(lastDone) })}
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default MaintenanceSection;
