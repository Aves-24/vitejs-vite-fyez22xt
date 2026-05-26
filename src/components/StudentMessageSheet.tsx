import React, { useState, useEffect, useRef } from 'react';
import { db } from '../firebase';
import { doc, getDoc, setDoc, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { createNotification, markAsRead as markNotifAsRead } from '../services/notificationService';
import { buildMessageNotification, notificationId } from '../utils/notificationTypes';

export interface ThreadMessage {
  from: 'student' | 'coach';
  text: string;
  at: number;
  name: string;
}

interface ThreadDoc {
  thread: ThreadMessage[];
  lastStudentAt: number;
  lastCoachAt: number;
  lastStudentReadAt: number;
  lastCoachReadAt: number;
}

interface StudentMessageSheetProps {
  coachId: string;
  studentId: string;
  currentUserId: string;
  mode: 'student' | 'coach';
  otherName: string;
  onClose: () => void;
}

const MAX_THREAD = 10;
const MAX_TEXT = 200;
const COOLDOWN_MS = 10 * 60 * 1000;

function cooldownKey(coachId: string, studentId: string, mode: string) {
  return `grotX_msgCooldown_${coachId}_${studentId}_${mode}`;
}

function secsLeft(coachId: string, studentId: string, mode: string): number {
  try {
    const ts = parseInt(localStorage.getItem(cooldownKey(coachId, studentId, mode)) || '0', 10);
    const remaining = COOLDOWN_MS - (Date.now() - ts);
    return remaining > 0 ? Math.ceil(remaining / 1000) : 0;
  } catch { return 0; }
}

export function hasUnread(thread: ThreadDoc | null, mode: 'student' | 'coach'): boolean {
  if (!thread) return false;
  if (mode === 'student') return thread.lastCoachAt > (thread.lastStudentReadAt || 0);
  return thread.lastStudentAt > (thread.lastCoachReadAt || 0);
}

export default function StudentMessageSheet({
  coachId, studentId, currentUserId, mode, otherName, onClose,
}: StudentMessageSheetProps) {
  const { t } = useTranslation();
  const [thread, setThread] = useState<ThreadMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [text, setText] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [cooldownSecs, setCooldownSecs] = useState(() => secsLeft(coachId, studentId, mode));
  const bottomRef = useRef<HTMLDivElement>(null);

  const docRef = doc(db, `users/${coachId}/studentMessages/${studentId}`);

  // Tick cooldown every second
  useEffect(() => {
    if (cooldownSecs <= 0) return;
    const id = setInterval(() => {
      const s = secsLeft(coachId, studentId, mode);
      setCooldownSecs(s);
      if (s <= 0) clearInterval(id);
    }, 1000);
    return () => clearInterval(id);
  }, [cooldownSecs > 0]);

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      try {
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          const data = snap.data() as ThreadDoc;
          setThread(data.thread || []);
          const readField = mode === 'student' ? 'lastStudentReadAt' : 'lastCoachReadAt';
          const senderId = mode === 'student' ? coachId : studentId;
          await Promise.all([
            updateDoc(docRef, { [readField]: Date.now() }),
            updateDoc(doc(db, 'users', currentUserId), { unreadMsgFrom: arrayRemove(senderId) }),
          ]);
          // Also clear the matching bell notification (refId = senderId).
          markNotifAsRead(currentUserId, notificationId('message', senderId))
            .catch(() => { /* non-critical — notif may not exist yet */ });
        }
      } catch { /* ignore */ }
      setIsLoading(false);
    };
    load();
  }, [coachId, studentId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [thread]);

  const handleSend = async () => {
    const clean = text.trim().slice(0, MAX_TEXT);
    if (!clean || cooldownSecs > 0) return;
    setIsSaving(true);
    setSendError(null);
    try {
      const snap = await getDoc(docRef);
      const existing: ThreadDoc = snap.exists()
        ? (snap.data() as ThreadDoc)
        : { thread: [], lastStudentAt: 0, lastCoachAt: 0, lastStudentReadAt: 0, lastCoachReadAt: 0 };

      const newMsg: ThreadMessage = { from: mode, text: clean, at: Date.now(), name: '' };
      const newThread = [...existing.thread, newMsg].slice(-MAX_THREAD);

      const now = Date.now();
      const update: Partial<ThreadDoc> = {
        thread: newThread,
        ...(mode === 'student'
          ? { lastStudentAt: now, lastStudentReadAt: now }
          : { lastCoachAt: now, lastCoachReadAt: now }),
      };

      if (snap.exists()) {
        await updateDoc(docRef, update);
      } else {
        await setDoc(docRef, { ...existing, ...update });
      }

      const recipientId = mode === 'student' ? coachId : studentId;
      const recipientRole: 'student' | 'coach' = mode === 'student' ? 'coach' : 'student';
      try { await updateDoc(doc(db, 'users', recipientId), { unreadMsgFrom: arrayUnion(currentUserId) }); } catch { /* ignore — notification flag, non-critical */ }

      // Bell notification at recipient — fire and forget, non-blocking.
      (async () => {
        let senderName: string | undefined;
        try {
          const meSnap = await getDoc(doc(db, 'users', currentUserId));
          if (meSnap.exists()) {
            const me = meSnap.data();
            senderName = [me.firstName, me.lastName].filter(Boolean).join(' ') || undefined;
          }
        } catch { /* ignore */ }
        const { id, payload } = buildMessageNotification({
          senderId: currentUserId,
          senderName,
          recipientRole,
        });
        createNotification(recipientId, id, payload).catch(() => { /* best effort */ });
      })();

      localStorage.setItem(cooldownKey(coachId, studentId, mode), String(Date.now()));
      setCooldownSecs(COOLDOWN_MS / 1000);
      setThread(newThread);
      setText('');
    } catch (e: any) {
      console.error('StudentMessageSheet: błąd zapisu', e);
      setSendError(e?.code === 'permission-denied' ? t('messages.errorPermission') : t('messages.errorConnection'));
    }
    setIsSaving(false);
  };

  const formatCooldown = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return m > 0 ? `${m}:${String(s).padStart(2, '0')} ${t('messages.min')}` : `${s} ${t('messages.sek')}`;
  };

  const formatTime = (ts: number) => {
    if (!ts) return '';
    const d = new Date(ts);
    const today = new Date();
    const isToday = d.toDateString() === today.toDateString();
    if (isToday) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return d.toLocaleDateString([], { day: '2-digit', month: 'short' }) + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  if (typeof document === 'undefined') return null;

  const isBlocked = cooldownSecs > 0;

  return createPortal(
    <div className="fixed inset-0 z-[600000] flex flex-col justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      <div
        className="relative bg-white rounded-t-[32px] flex flex-col shadow-2xl max-h-[80vh]"
        onClick={e => e.stopPropagation()}
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1 bg-gray-200 rounded-full" />
        </div>

        {/* Header */}
        <div className="flex items-center gap-3 px-5 pb-3 pt-1 border-b border-gray-100 shrink-0">
          <div className="w-9 h-9 bg-[#0a3a2a] rounded-full flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-[#fed33e] text-[16px]">person</span>
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-black text-[#0a3a2a] text-[14px] leading-tight truncate">{otherName}</h3>
            <p className="text-[8px] font-bold text-gray-400 uppercase tracking-widest">
              {t('messages.headerSubtitle', { max: MAX_THREAD })}
            </p>
          </div>
          <button onClick={onClose} className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center active:scale-90 transition-all shrink-0">
            <span className="material-symbols-outlined text-[16px] text-gray-500">close</span>
          </button>
        </div>

        {/* Thread */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2 min-h-[120px]">
          {isLoading ? (
            <div className="flex items-center justify-center h-20">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{t('messages.loading')}</span>
            </div>
          ) : thread.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-20 gap-1">
              <span className="material-symbols-outlined text-gray-200 text-3xl">chat_bubble_outline</span>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{t('messages.empty')}</p>
            </div>
          ) : (
            thread.map((msg, i) => {
              const isMe = msg.from === mode;
              const isLast = i === thread.length - 1;
              return (
                <div key={i} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[78%] rounded-2xl px-3 py-2 ${
                    isMe
                      ? `${isLast ? 'bg-[#145f40]' : 'bg-[#0a3a2a]'} text-white rounded-br-sm`
                      : `${isLast ? 'bg-emerald-50 border border-emerald-200' : 'bg-gray-100'} text-[#333] rounded-bl-sm`
                  }`}>
                    <p className="text-[12px] font-medium leading-snug break-words whitespace-pre-wrap">{msg.text}</p>
                    <p className={`text-[8px] font-bold mt-1 ${isMe ? 'text-white/50' : 'text-gray-400'}`}>
                      {formatTime(msg.at)}
                    </p>
                  </div>
                </div>
              );
            })
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="px-4 pb-4 pt-2 border-t border-gray-100 shrink-0">
          {sendError && (
            <p className="text-[10px] font-bold text-red-500 mb-2 text-center">{sendError}</p>
          )}
          {isBlocked ? (
            <div className="flex items-center justify-center gap-2 py-3 bg-gray-50 rounded-2xl">
              <span className="material-symbols-outlined text-gray-400 text-[18px]">timer</span>
              <p className="text-[11px] font-black text-gray-500 uppercase tracking-widest">
                {t('messages.cooldown')} {formatCooldown(cooldownSecs)}
              </p>
            </div>
          ) : (
            <div className="flex gap-2 items-end">
              <textarea
                value={text}
                onChange={e => setText(e.target.value.slice(0, MAX_TEXT))}
                placeholder={t('messages.placeholder')}
                rows={1}
                className="flex-1 bg-gray-50 border border-gray-200 rounded-2xl px-3 py-2.5 text-[12px] font-medium text-[#333] outline-none focus:border-[#0a3a2a] resize-none leading-snug"
                style={{ maxHeight: 80 }}
                onInput={e => {
                  const t = e.target as HTMLTextAreaElement;
                  t.style.height = 'auto';
                  t.style.height = Math.min(t.scrollHeight, 80) + 'px';
                }}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
                }}
              />
              <button
                onClick={handleSend}
                disabled={isSaving || !text.trim()}
                className="w-10 h-10 bg-[#0a3a2a] text-[#fed33e] rounded-full flex items-center justify-center shrink-0 active:scale-90 disabled:opacity-40 transition-all shadow-md"
              >
                <span className="material-symbols-outlined text-[18px]">send</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
