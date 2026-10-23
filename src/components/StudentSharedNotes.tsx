import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { collection, getDocs, query, where, limit } from 'firebase/firestore';
import { db } from '../firebase';
import { topicLabel } from '../constants/trainingTopics';

// [UDOSTĘPNIONY WPIS] (user 2026-10-23) Wpisy z dziennika ucznia, które uczeń
// sam udostępnił trenerom (privateNotes.shared). Reguła wpuszcza trenera tylko
// z filtrem shared == true; resztę notatek widzi wyłącznie uczeń.
interface SharedNote { id: string; text: string; topics: string[]; important: boolean; ts: number }

const PREVIEW = 3;

function toMs(v: any): number {
  if (!v) return 0;
  if (typeof v === 'number') return v;
  if (typeof v.toMillis === 'function') return v.toMillis();
  return 0;
}

export default function StudentSharedNotes({ studentId }: { studentId: string }) {
  const { t, i18n } = useTranslation();
  const [notes, setNotes] = useState<SharedNote[]>([]);
  const [all, setAll] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // Bez orderBy — równość na jednym polu nie wymaga indeksu; sortujemy tutaj.
    getDocs(query(collection(db, `users/${studentId}/privateNotes`), where('shared', '==', true), limit(50)))
      .then(snap => {
        if (cancelled) return;
        setNotes(snap.docs.map(d => {
          const data = d.data();
          return { id: d.id, text: data.text || '', topics: data.topics || [], important: data.important === true, ts: toMs(data.createdAt) };
        }).sort((a, b) => b.ts - a.ts));
      })
      .catch(e => console.error('Udostępnione wpisy ucznia:', e));
    return () => { cancelled = true; };
  }, [studentId]);

  if (!notes.length) return null;
  const shown = all ? notes : notes.slice(0, PREVIEW);
  const fmt = (ts: number) => (ts ? new Date(ts).toLocaleDateString(i18n.language, { day: 'numeric', month: 'short', year: 'numeric' }) : '');

  return (
    <div className="mb-4">
      <p className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-gray-400 mb-1.5 px-1">
        <span className="material-symbols-outlined text-[14px] text-emerald-600">visibility</span>
        {t('tagebuch.sharedByStudent')} · {notes.length}
      </p>
      <div className="space-y-2">
        {shown.map(n => (
          <div key={n.id} className={`tb-card border rounded-l-md rounded-r-2xl shadow-sm pl-2 pr-3 py-2.5 ${n.important ? 'tb-mark' : 'tb-private'}`}>
            <div className="flex items-start gap-2.5">
              <span className="tb-icon w-8 h-8 rounded-lg flex items-center justify-center shrink-0">
                <span className={`material-symbols-outlined text-[18px] ${n.important ? 'text-[#b8860b]' : 'text-indigo-500'}`}>{n.important ? 'star' : 'edit_note'}</span>
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-start gap-1.5">
                  <span className={`flex-1 text-[9px] font-black uppercase tracking-widest ${n.important ? 'text-[#a07400]' : 'text-indigo-600'}`}>
                    {t(n.important ? 'tagebuch.kindMilestone' : 'tagebuch.kindNote')}
                  </span>
                  <span className="shrink-0 text-[10px] font-bold text-gray-400">{fmt(n.ts)}</span>
                </div>
                <p className={`mt-0.5 leading-relaxed whitespace-pre-wrap break-words ${n.important ? 'text-[13px] font-black text-[#0a3a2a]' : 'text-[12px] font-medium text-gray-700'}`}>{n.text}</p>
                {n.topics.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {n.topics.map(id => (
                      <span key={id} className="border px-2 py-0.5 rounded-full text-[9px] font-black bg-indigo-50 text-indigo-600 border-indigo-100">{topicLabel(id, t)}</span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
      {notes.length > PREVIEW && (
        <button onClick={() => setAll(v => !v)} className="mt-1.5 w-full py-1.5 text-[10px] font-black text-gray-500 uppercase tracking-widest active:opacity-60">
          {all ? t('tagebuch.showLess') : t('tagebuch.showAllCount', { count: notes.length })}
        </button>
      )}
    </div>
  );
}
