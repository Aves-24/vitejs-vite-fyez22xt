import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { collection, getDocs, limit, query, where } from 'firebase/firestore';
import { db } from '../firebase';

// [WYSŁANE 2026-11-06] Lista wiadomości wysłanych przez trenera — na dole okna
// „Nachricht” (✉ przy grupie: tylko wiadomości tej grupy; user 2026-11-06).
// Każda wiadomość to kilka dokumentów announcements/ (po jednym na ucznia) —
// łączymy je po batchId (starsze bez batchId: po tytule, treści i sekundzie).
// Czytane raz przy rozwinięciu (i po wysłaniu nowej), bez nasłuchu.
// Bez statusu „przeczytane”: readAt leży w prywatnej skrzynce ucznia.

interface SentGroup {
  key: string;
  title: string;
  content: string;
  ms: number;
  groupName?: string;
  recipients: string[];
}

const toMs = (ts: any): number =>
  typeof ts?.toMillis === 'function' ? ts.toMillis() : typeof ts === 'number' ? ts : 0;

const SHOWN = 20;

export default function CoachSentMessages({ userId, studentNames, refreshKey, groupName, memberIds }: {
  userId: string;
  /** okno otwarte z ✉ grupy → pokazujemy tylko jej wiadomości */
  groupName?: string | null;
  /** członkowie grupy — starsze wiadomości nie mają groupName, liczy się skład */
  memberIds?: string[];
  /** id ucznia → imię do wyświetlenia */
  studentNames: Record<string, string>;
  /** zmienia się po wysłaniu wiadomości — lista czyta się na nowo */
  refreshKey: number;
}) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<SentGroup[] | null>(null);
  const [error, setError] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !userId) return;
    let alive = true;
    setError(false);
    getDocs(query(collection(db, 'announcements'), where('authorId', '==', userId), limit(300)))
      .then(snap => {
        if (!alive) return;
        const groups = new Map<string, SentGroup>();
        for (const d of snap.docs) {
          const a: any = d.data();
          const ms = toMs(a.timestamp);
          const key = a.batchId || `${a.title}|${a.content}|${Math.floor(ms / 1000)}`;
          const g: SentGroup = groups.get(key) || { key, title: a.title || '', content: a.content || '', ms, groupName: a.groupName, recipients: [] };
          if (a.targetId) g.recipients.push(a.targetId);
          groups.set(key, g);
        }
        const members = new Set(memberIds || []);
        const forGroup = (g: SentGroup) => !groupName
          || g.groupName === groupName
          || (!g.groupName && g.recipients.length > 1 && g.recipients.every(id => members.has(id)));
        setItems([...groups.values()].filter(forGroup).sort((x, y) => y.ms - x.ms).slice(0, SHOWN));
      })
      .catch(e => { console.warn('Wysłane wiadomości:', e); if (alive) setError(true); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, userId, refreshKey, groupName]);

  const recipientsLabel = (g: SentGroup) => {
    if (g.groupName) return t('coachSent.toGroup', { group: g.groupName, count: g.recipients.length });
    const names = g.recipients.map(id => studentNames[id] || t('coachSent.formerStudent'));
    return names.length > 3
      ? t('coachSent.toMany', { names: names.slice(0, 3).join(', '), count: names.length - 3 })
      : names.join(', ');
  };

  return (
    <div className="rounded-xl border border-gray-100 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left bg-gray-50 active:bg-gray-100 transition-all"
      >
        <span className="material-symbols-outlined text-[18px] text-[#0a3a2a] shrink-0">outgoing_mail</span>
        <span className="flex-1 text-[12px] font-black uppercase tracking-wider text-[#0a3a2a]">{groupName ? t('coachSent.titleGroup', { group: groupName }) : t('coachSent.title')}</span>
        <span className="material-symbols-outlined text-gray-400 text-[22px] shrink-0">{open ? 'expand_less' : 'expand_more'}</span>
      </button>
      {open && (
        <div className="border-t border-gray-100">
          {error ? (
            <p className="px-3 py-3 text-[12px] font-bold text-red-500">{t('coachSent.error')}</p>
          ) : items === null ? (
            <div className="p-3 space-y-2">
              {[1, 2].map(i => <div key={i} className="h-12 bg-gray-100 rounded-xl animate-pulse" />)}
            </div>
          ) : items.length === 0 ? (
            <p className="px-3 py-3 text-[12px] font-bold text-gray-400">{t('coachSent.empty')}</p>
          ) : (
            <ul className="divide-y divide-gray-50 max-h-[40vh] overflow-y-auto" data-testid="coach-sent-list">
              {items.map(g => {
                const isOpen = expanded === g.key;
                return (
                  <li key={g.key}>
                    <button
                      type="button"
                      onClick={() => setExpanded(isOpen ? null : g.key)}
                      className="w-full text-left px-3 py-2.5 active:bg-gray-50 transition-all"
                    >
                      <span className="flex items-baseline gap-2">
                        <span className="flex-1 min-w-0 text-[13px] font-black text-[#0a3a2a] truncate">{g.title}</span>
                        <span className="shrink-0 text-[10px] font-bold text-gray-400">
                          {g.ms ? new Date(g.ms).toLocaleDateString(i18n.language, { day: 'numeric', month: 'short' }) : ''}
                        </span>
                      </span>
                      <span className={`block text-[12px] font-bold text-gray-500 mt-0.5 whitespace-pre-line ${isOpen ? '' : 'line-clamp-1'}`}>{g.content}</span>
                      <span className="flex items-center gap-1 text-[11px] font-bold text-indigo-600 mt-1">
                        <span className="material-symbols-outlined text-[14px]">group</span>
                        <span className="truncate">{recipientsLabel(g)}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="px-3 pb-2.5 pt-1 text-[10px] font-bold text-gray-400">{t('coachSent.hint', { count: SHOWN })}</p>
        </div>
      )}
    </div>
  );
}
