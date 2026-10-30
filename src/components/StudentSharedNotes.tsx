import { useTranslation } from 'react-i18next';
import { collection, getDocs, query, where, limit } from 'firebase/firestore';
import { db } from '../firebase';
import { topicLabel } from '../constants/trainingTopics';

// [UDOSTĘPNIONY WPIS] (user 2026-10-23) Wpisy z dziennika ucznia, które uczeń
// sam udostępnił trenerom (privateNotes.shared). Reguła wpuszcza trenera tylko
// z filtrem shared == true; resztę notatek widzi wyłącznie uczeń.
// Od 2026-10-30 leżą na wspólnej osi czasu profilu ucznia (zakładka Tagebuch).
export interface SharedNote { id: string; title: string; text: string; topics: string[]; important: boolean; ts: number }

function toMs(v: any): number {
  if (!v) return 0;
  if (typeof v === 'number') return v;
  if (typeof v.toMillis === 'function') return v.toMillis();
  return 0;
}

/** Do 50 udostępnionych wpisów, od najnowszego. Bez orderBy — równość na jednym polu nie wymaga indeksu. */
export async function loadSharedNotes(studentId: string): Promise<SharedNote[]> {
  const snap = await getDocs(query(collection(db, `users/${studentId}/privateNotes`), where('shared', '==', true), limit(50)));
  return snap.docs.map(d => {
    const data = d.data();
    return { id: d.id, title: typeof data.title === 'string' ? data.title : '', text: data.text || '', topics: data.topics || [], important: data.important === true, ts: toMs(data.createdAt) };
  }).sort((a, b) => b.ts - a.ts);
}

export function SharedNoteCard({ note: n, time }: { note: SharedNote; time: string }) {
  const { t } = useTranslation();
  return (
    <div className={`tb-card border rounded-l-md rounded-r-2xl shadow-sm pl-2 pr-3 py-2.5 ${n.important ? 'tb-mark' : 'tb-private'}`}>
      <div className="flex items-start gap-2.5">
        <span className="tb-icon w-8 h-8 rounded-lg flex items-center justify-center shrink-0">
          <span className={`material-symbols-outlined text-[18px] ${n.important ? 'text-[#b8860b]' : 'text-indigo-500'}`}>{n.important ? 'star' : 'visibility'}</span>
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-1.5">
            <span className={`flex-1 text-[9px] font-black uppercase tracking-widest ${n.important ? 'text-[#a07400]' : 'text-indigo-600'}`}>
              {t(n.important ? 'tagebuch.kindMilestone' : 'tagebuch.kindNote')} · {t('tagebuch.sharedByStudent')}
            </span>
            <span className="tb-time shrink-0 text-[10px] font-bold text-gray-400">{time}</span>
          </div>
          {/* Meilenstein: tytuł pogrubiony, pod nim opis (starsze bez tytułu — tekst jako tytuł). */}
          {n.title && <p className="mt-0.5 text-[13px] font-black text-[#0a3a2a] leading-snug break-words">{n.title}</p>}
          {n.text && <p className={`mt-0.5 leading-relaxed whitespace-pre-wrap break-words ${n.important && !n.title ? 'text-[13px] font-black text-[#0a3a2a]' : 'text-[12px] font-medium text-gray-700'}`}>{n.text}</p>}
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
  );
}
