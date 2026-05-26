import { db } from '../firebase';
import {
  doc,
  collection,
  setDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  writeBatch,
  serverTimestamp,
  Timestamp,
  type QuerySnapshot,
  type DocumentData,
  type Unsubscribe,
} from 'firebase/firestore';
import type {
  NotificationDoc,
  NotificationItem,
  NotificationPayload,
} from '../utils/notificationTypes';

const notificationsCol = (userId: string) =>
  collection(db, `users/${userId}/notifications`);

const notificationRef = (userId: string, id: string) =>
  doc(db, `users/${userId}/notifications/${id}`);

// ──────────────────────────────────────────────────────────────────────────────
// createNotification
// ──────────────────────────────────────────────────────────────────────────────
// Create-only, idempotent — if doc with same id already exists, this is a no-op.
// Trade-off: a repeated event (e.g. same sender writing 3 messages) doesn't move
// the notification to top of list. The unread chat indicator on the user doc
// (unreadMsgFrom) remains the authoritative live signal; this notification is
// the "an event happened" record.
//
// Cost: 1 read + max 1 write per call.
// Rules: only `create` is needed for senders; only `update readAt` for recipient.
// ──────────────────────────────────────────────────────────────────────────────

export async function createNotification(
  recipientId: string,
  id: string,
  payload: NotificationPayload
): Promise<void> {
  const ref = notificationRef(recipientId, id);
  const existing = await getDoc(ref);
  if (existing.exists()) return;

  // Strip undefined fields — Firestore rejects them.
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(payload)) {
    if (v !== undefined) clean[k] = v;
  }

  await setDoc(ref, {
    ...clean,
    createdAt: serverTimestamp(),
    readAt: null,
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// markAsRead / markAllAsRead
// ──────────────────────────────────────────────────────────────────────────────

export async function markAsRead(userId: string, id: string): Promise<void> {
  await updateDoc(notificationRef(userId, id), {
    readAt: serverTimestamp(),
  });
}

export async function markAllAsRead(userId: string): Promise<void> {
  const q = query(notificationsCol(userId), where('readAt', '==', null));
  const snap = await getDocs(q);
  if (snap.empty) return;

  const batch = writeBatch(db);
  const now = serverTimestamp();
  snap.docs.forEach(d => batch.update(d.ref, { readAt: now }));
  await batch.commit();
}

export async function deleteNotification(
  userId: string,
  id: string
): Promise<void> {
  await deleteDoc(notificationRef(userId, id));
}

// ──────────────────────────────────────────────────────────────────────────────
// pruneOldNotifications — retention policy
// ──────────────────────────────────────────────────────────────────────────────
// Deletes notifications older than 30 days. Caller should throttle this
// (max 1x/day per user) — the throttling lives in useNotifications hook.
// Returns number deleted. Limit 100 per call to keep batch small; if more
// were eligible, the next call (next day) catches the rest.
// ──────────────────────────────────────────────────────────────────────────────

const RETENTION_DAYS = 30;
const RETENTION_MS = RETENTION_DAYS * 24 * 60 * 60 * 1000;

export async function pruneOldNotifications(userId: string): Promise<number> {
  const cutoff = Timestamp.fromMillis(Date.now() - RETENTION_MS);
  const q = query(
    notificationsCol(userId),
    where('createdAt', '<', cutoff),
    limit(100)
  );
  const snap = await getDocs(q);
  if (snap.empty) return 0;

  const batch = writeBatch(db);
  snap.docs.forEach(d => batch.delete(d.ref));
  await batch.commit();
  return snap.size;
}

// ──────────────────────────────────────────────────────────────────────────────
// listenToNotifications — real-time subscription
// ──────────────────────────────────────────────────────────────────────────────

export function listenToNotifications(
  userId: string,
  callback: (items: NotificationItem[]) => void,
  maxItems: number = 50
): Unsubscribe {
  const q = query(
    notificationsCol(userId),
    orderBy('createdAt', 'desc'),
    limit(maxItems)
  );
  return onSnapshot(q, (snap: QuerySnapshot<DocumentData>) => {
    const items: NotificationItem[] = snap.docs.map(d => {
      const data = d.data() as NotificationDoc;
      return { id: d.id, ...data };
    });
    callback(items);
  });
}
