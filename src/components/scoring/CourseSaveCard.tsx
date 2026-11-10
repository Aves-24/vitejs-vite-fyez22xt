import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import SummaryCard from './SummaryCard';
import { listCourses, saveCourse, stationsFromEnds, canAddCourse, type Course } from '../../utils/courses';

// [ANIMAL ROUND 2026-11-10] Po rundzie: zapisz trasę (nazwy zwierząt na następny
// raz) albo przenieś zmiany do zapisanej trasy. FREE 1 trasa, PRO bez limitu.
export default function CourseSaveCard({ userId, ends, course, isPro, onSaved }: {
  userId: string;
  ends: any[];
  course: Course | null;
  isPro: boolean;
  onSaved: (c: Course) => void;
}) {
  const { t } = useTranslation();
  const [count, setCount] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  useEffect(() => {
    listCourses(userId).then(cs => setCount(cs.length)).catch(() => setCount(0));
  }, [userId]);

  const stations = stationsFromEnds(ends);
  // Zmiany względem zapisanej trasy: inna nazwa/obrys na już przejściowanym stanowisku.
  const changed = !!course && stations.some((s, i) => {
    const c = course.stations[i];
    if (!c) return true;
    if (s.name && s.name !== c.name) return true;
    return !!s.outlineId && s.outlineId !== c.outlineId;
  });
  // Do trasy idą nowe nazwy; stanowiska dalej niż przejściowane zostają z trasy.
  const merged = course
    ? course.stations.map((c, i) => (stations[i] ? { name: stations[i].name || c.name, ...((stations[i].outlineId || c.outlineId) ? { outlineId: stations[i].outlineId || c.outlineId } : {}) } : c))
        .concat(stations.slice(course.stations.length))
    : stations;

  const save = async () => {
    setBusy(true);
    try {
      const id = await saveCourse(userId, course ? { id: course.id, name: course.name, stations: merged, createdAt: course.createdAt } : { name, stations });
      const now = Date.now();
      onSaved({ id, name: course ? course.name : name.trim(), stations: merged, createdAt: course?.createdAt || now, updatedAt: now });
      setDone(true);
    } finally { setBusy(false); }
  };

  if (done) {
    return (
      <SummaryCard icon="distance" kind={t('animal.course')} title={course?.name || name} storageKey="sum-course">
        <p className="text-[12px] font-bold text-emerald-700" data-testid="course-saved">{t('animal.courseSaved')}</p>
      </SummaryCard>
    );
  }

  if (course) {
    return (
      <SummaryCard icon="distance" kind={t('animal.course')} title={course.name} storageKey="sum-course">
        {changed ? (
          <div className="space-y-2">
            <p className="text-[11px] font-bold text-gray-500">{t('animal.courseChanged')}</p>
            <button onClick={save} disabled={busy} className="w-full h-10 rounded-xl bg-[#0a3a2a] text-white text-[12px] font-black active:scale-95 disabled:opacity-50" data-testid="course-update">
              {t('animal.courseUpdate')}
            </button>
          </div>
        ) : (
          <p className="text-[11px] font-bold text-gray-500">{t('animal.courseSame')}</p>
        )}
      </SummaryCard>
    );
  }

  const allowed = count !== null && canAddCourse(count, isPro);
  return (
    <SummaryCard icon="distance" kind={t('animal.course')} title={t('animal.courseSaveTitle')} storageKey="sum-course">
      {count === null ? null : allowed ? (
        <div className="flex gap-2">
          <input value={name} onChange={e => setName(e.target.value)} maxLength={60} placeholder={t('animal.courseNamePh')} aria-label={t('animal.courseName')}
            className="flex-1 min-w-0 h-10 px-3 bg-gray-50 rounded-xl text-[13px] font-bold outline-none border border-gray-100" />
          <button onClick={save} disabled={busy || !name.trim()} className="h-10 px-4 rounded-xl bg-[#0a3a2a] text-white text-[12px] font-black active:scale-95 disabled:opacity-40" data-testid="course-save">
            {t('animal.courseSave')}
          </button>
        </div>
      ) : (
        <p className="flex items-center gap-1 text-[11px] font-bold text-amber-700">
          <span className="material-symbols-outlined text-[14px]">diamond</span>{t('animal.courseProLimit')}
        </p>
      )}
    </SummaryCard>
  );
}
