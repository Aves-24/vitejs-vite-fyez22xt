import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { listCourses, saveCourse, deleteCourse, canAddCourse, MAX_STATIONS, type Course, type CourseStation } from '../../utils/courses';
import OutlinePicker, { OutlineSvg, useOutline } from '../scoring/OutlinePicker';
import { outlineName } from '../../config/animals/loadOutlines';
import { ANIMAL_STATIONS } from '../../config/animalRound';

// [ANIMAL ROUND 2026-11-10] Trasy (parcours) w Ustawieniach → Distanzen (user:
// „jako dystans wybrać parcours i tam dodać swoje zwierzątka lub cele”).
// Trasa = nazwa + stanowiska (nazwa zwierzęcia/celu, obrys w PRO). W Vorbereitung
// każda trasa jest kafelkiem obok dystansów. FREE 1 trasa, PRO bez limitu.

function StationOutline({ id }: { id?: string }) {
  const o = useOutline(id);
  return o ? <OutlineSvg o={o} className="h-6 w-8 text-[#0a3a2a]" /> : null;
}

function CourseEditor({ userId, course, isPro, onClose, onSaved }: {
  userId: string;
  course: Course | null;
  isPro: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t, i18n } = useTranslation();
  const [name, setName] = useState(course?.name || '');
  const [stations, setStations] = useState<CourseStation[]>(course?.stations?.length ? course.stations : Array.from({ length: 4 }, () => ({ name: '' })));
  const [pickFor, setPickFor] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [proHint, setProHint] = useState(false);

  const setAt = (i: number, s: Partial<CourseStation>) => setStations(prev => prev.map((x, k) => {
    if (k !== i) return x;
    const next = { ...x, ...s };
    if (!next.outlineId) delete next.outlineId;
    return next;
  }));
  const add = (n: number) => setStations(prev => [...prev, ...Array.from({ length: n }, () => ({ name: '' }))].slice(0, MAX_STATIONS));
  const remove = (i: number) => setStations(prev => (prev.length > 1 ? prev.filter((_, k) => k !== i) : prev));
  const move = (i: number, d: -1 | 1) => setStations(prev => {
    const j = i + d;
    if (j < 0 || j >= prev.length) return prev;
    const a = [...prev]; [a[i], a[j]] = [a[j], a[i]]; return a;
  });

  const save = async () => {
    setBusy(true);
    try {
      await saveCourse(userId, { id: course?.id, name, stations: stations.map(s => ({ ...s, name: s.name.trim().slice(0, 40) })), createdAt: course?.createdAt });
      onSaved();
    } finally { setBusy(false); }
  };

  return createPortal(
    <div className="fixed inset-0 z-[250] bg-black/40 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div role="dialog" aria-label={t('animal.courseEdit')} className="bg-white w-full sm:max-w-lg max-h-[90dvh] rounded-t-3xl sm:rounded-3xl flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-4 pt-4 pb-2">
          <span className="flex-1 text-[14px] font-black text-[#0a3a2a]">{t('animal.courseEdit')}</span>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center" aria-label={t('common.close', 'Schließen')}>
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>
        <div className="px-4 pb-2">
          <input value={name} onChange={e => setName(e.target.value)} maxLength={60} placeholder={t('animal.courseNamePh')} aria-label={t('animal.courseName')}
            className="w-full h-10 px-3 bg-gray-50 rounded-xl text-[14px] font-black text-[#0a3a2a] outline-none border border-gray-100" />
        </div>
        <div className="flex-1 overflow-y-auto px-4 space-y-1" data-testid="course-stations">
          {stations.map((s, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <span className="w-6 text-[11px] font-black text-gray-400 text-right shrink-0">{i + 1}</span>
              <input value={s.name} onChange={e => setAt(i, { name: e.target.value })} maxLength={40} placeholder={t('animal.stationPh')}
                aria-label={t('animal.stationN', { n: i + 1 })}
                className="flex-1 min-w-0 h-9 px-2 bg-gray-50 rounded-lg text-[13px] font-bold text-[#0a3a2a] outline-none border border-gray-100" />
              <button onClick={() => (isPro ? setPickFor(i) : setProHint(true))} className="w-10 h-9 shrink-0 rounded-lg border border-gray-100 bg-gray-50 flex items-center justify-center" aria-label={t('animal.outlineTitle')}>
                {s.outlineId ? <StationOutline id={s.outlineId} /> : <span className={`material-symbols-outlined text-[16px] ${isPro ? 'text-gray-400' : 'text-amber-600'}`}>{isPro ? 'add' : 'diamond'}</span>}
              </button>
              <div className="flex flex-col shrink-0">
                <button onClick={() => move(i, -1)} disabled={i === 0} className="h-4 text-gray-400 disabled:opacity-20" aria-label={t('animal.moveUp')}><span className="material-symbols-outlined text-[16px] leading-none">expand_less</span></button>
                <button onClick={() => move(i, 1)} disabled={i === stations.length - 1} className="h-4 text-gray-400 disabled:opacity-20" aria-label={t('animal.moveDown')}><span className="material-symbols-outlined text-[16px] leading-none">expand_more</span></button>
              </div>
              <button onClick={() => remove(i)} className="w-7 h-9 shrink-0 text-gray-300" aria-label={t('animal.stationDelete', { n: i + 1 })}>
                <span className="material-symbols-outlined text-[18px]">delete</span>
              </button>
            </div>
          ))}
          {proHint && <p className="flex items-center gap-1 text-[11px] font-bold text-amber-700 py-1"><span className="material-symbols-outlined text-[14px]">diamond</span>{t('animal.outlinePro')}</p>}
        </div>
        <div className="px-4 pt-2 pb-4 space-y-2 border-t border-gray-100 mt-2">
          <div className="flex gap-1.5">
            <button onClick={() => add(1)} disabled={stations.length >= MAX_STATIONS} className="flex-1 h-9 rounded-xl border border-dashed border-gray-300 text-[11px] font-black text-gray-500 disabled:opacity-40">+1 {t('animal.station1')}</button>
            <button onClick={() => add(Math.max(0, ANIMAL_STATIONS - stations.length))} disabled={stations.length >= ANIMAL_STATIONS} className="flex-1 h-9 rounded-xl border border-dashed border-gray-300 text-[11px] font-black text-gray-500 disabled:opacity-40">{t('animal.fillTo', { n: ANIMAL_STATIONS })}</button>
          </div>
          <button onClick={save} disabled={busy || !name.trim()} className="w-full h-11 rounded-xl bg-[#0a3a2a] text-white text-[13px] font-black active:scale-95 disabled:opacity-40" data-testid="course-editor-save">
            {t('animal.courseSave')} · {t('animal.stations', { n: stations.length })}
          </button>
        </div>
      </div>
      {pickFor !== null && (
        <OutlinePicker
          value={stations[pickFor]?.outlineId}
          onClose={() => setPickFor(null)}
          onPick={o => {
            const i = pickFor;
            setAt(i, { outlineId: o?.id, ...(o && !stations[i]?.name.trim() ? { name: outlineName(o, i18n.language) } : {}) });
            setPickFor(null);
          }}
        />
      )}
    </div>,
    document.body,
  );
}

export default function CoursesSection({ userId, isPro }: { userId: string; isPro: boolean }) {
  const { t } = useTranslation();
  const [courses, setCourses] = useState<Course[] | null>(null);
  const [editing, setEditing] = useState<Course | 'new' | null>(null);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const reload = () => listCourses(userId).then(setCourses).catch(() => setCourses([]));
  useEffect(() => { if (userId) reload(); }, [userId]);

  const allowed = courses !== null && canAddCourse(courses.length, isPro);
  return (
    <div className="mt-4 space-y-2" data-testid="courses-section">
      <div className="px-1">
        <span className="block text-[11px] font-black text-[#0a3a2a] uppercase tracking-widest">{t('animal.coursesTitle')}</span>
        <span className="block text-[10px] font-bold text-gray-400">{t('animal.coursesHint')}</span>
      </div>
      {(courses || []).map(c => (
        <div key={c.id} className="p-2.5 rounded-xl border bg-white border-gray-100 shadow-sm flex items-center gap-2">
          <span className="material-symbols-outlined text-[20px] text-emerald-700">distance</span>
          <span className="flex-1 min-w-0">
            <span className="block text-sm font-black text-[#333] truncate">{c.name}</span>
            <span className="block text-[10px] font-bold text-gray-400 truncate">{t('animal.stations', { n: c.stations.length })} · {c.stations.map(s => s.name).filter(Boolean).slice(0, 4).join(', ')}</span>
          </span>
          <button onClick={() => setEditing(c)} className="w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center" aria-label={t('animal.courseEditN', { name: c.name })}>
            <span className="material-symbols-outlined text-[16px] text-gray-500">edit</span>
          </button>
          {confirmDel === c.id ? (
            <button onClick={async () => { await deleteCourse(userId, c.id); setConfirmDel(null); reload(); }} className="h-8 px-2 rounded-full bg-red-500 text-white text-[10px] font-black">{t('animal.courseDeleteConfirm')}</button>
          ) : (
            <button onClick={() => setConfirmDel(c.id)} className="w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center" aria-label={t('animal.courseDelete')}>
              <span className="material-symbols-outlined text-[16px] text-gray-400">delete</span>
            </button>
          )}
        </div>
      ))}
      {allowed ? (
        <button onClick={() => setEditing('new')} className="w-full py-3 rounded-xl border-2 border-dashed border-gray-200 text-gray-400 font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-1.5 active:scale-95" data-testid="course-add">
          <span className="material-symbols-outlined text-[16px]">add</span>{t('animal.courseNew')}
        </button>
      ) : courses !== null && (
        <p className="flex items-center gap-1 text-[11px] font-bold text-amber-700 px-1"><span className="material-symbols-outlined text-[14px]">diamond</span>{t('animal.courseProLimit')}</p>
      )}
      {editing && (
        <CourseEditor userId={userId} course={editing === 'new' ? null : editing} isPro={isPro} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />
      )}
    </div>
  );
}
