import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  listenToNotifications,
  markAsRead as svcMarkAsRead,
  markAllAsRead as svcMarkAllAsRead,
  deleteNotification as svcDeleteNotification,
  pruneOldNotifications,
} from '../services/notificationService';
import type {
  NotificationItem,
  NotificationType,
} from '../utils/notificationTypes';
import { PRIORITY_ORDER } from '../utils/notificationTypes';

export interface UseNotificationsReturn {
  notifications: NotificationItem[];
  unreadCount: number;
  unreadByType: Record<NotificationType, number>;
  priorityType: NotificationType | null;     // highest priority type with unread
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  deleteNotification: (id: string) => Promise<void>;
}

// Throttle pruneOldNotifications to max 1x / 24h per user (localStorage).
// Reason: pruning runs a query on every hook mount; without throttle we'd hit
// Firestore on every HomeView open. The work is non-critical — missing a day
// just delays cleanup by 24h.
const PRUNE_KEY = (uid: string) => `grotX_notifPrune_${uid}`;
const PRUNE_INTERVAL_MS = 24 * 60 * 60 * 1000;

function maybePrune(userId: string): void {
  try {
    const last = parseInt(localStorage.getItem(PRUNE_KEY(userId)) || '0', 10);
    if (Date.now() - last < PRUNE_INTERVAL_MS) return;
    // Mark BEFORE awaiting — prevents N parallel prunes if hook remounts.
    localStorage.setItem(PRUNE_KEY(userId), String(Date.now()));
    pruneOldNotifications(userId).catch(() => {
      // non-critical — try again tomorrow
    });
  } catch {
    // localStorage unavailable — skip prune (will retry on next mount)
  }
}

const EMPTY_BY_TYPE: Record<NotificationType, number> = {
  message: 0,
  coach_note: 0,
  coach_plan: 0,
  announcement: 0,
  coach_request: 0,
};

export function useNotifications(userId: string | null): UseNotificationsReturn {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);

  useEffect(() => {
    if (!userId) {
      setNotifications([]);
      return;
    }
    const unsub = listenToNotifications(userId, setNotifications);
    maybePrune(userId);
    return unsub;
  }, [userId]);

  const { unreadCount, unreadByType, priorityType } = useMemo(() => {
    const byType: Record<NotificationType, number> = { ...EMPTY_BY_TYPE };
    let total = 0;
    for (const n of notifications) {
      if (!n.readAt) {
        byType[n.type]++;
        total++;
      }
    }
    let prio: NotificationType | null = null;
    for (const t of PRIORITY_ORDER) {
      if (byType[t] > 0) {
        prio = t;
        break;
      }
    }
    return { unreadCount: total, unreadByType: byType, priorityType: prio };
  }, [notifications]);

  const markAsRead = useCallback(
    async (id: string) => {
      if (!userId) return;
      try {
        await svcMarkAsRead(userId, id);
      } catch {
        // optimistic UI keeps working — Firestore will retry via SDK
      }
    },
    [userId]
  );

  const markAllAsRead = useCallback(async () => {
    if (!userId) return;
    try {
      await svcMarkAllAsRead(userId);
    } catch {
      // non-critical
    }
  }, [userId]);

  const deleteNotification = useCallback(
    async (id: string) => {
      if (!userId) return;
      try {
        await svcDeleteNotification(userId, id);
      } catch {
        // non-critical
      }
    },
    [userId]
  );

  return {
    notifications,
    unreadCount,
    unreadByType,
    priorityType,
    markAsRead,
    markAllAsRead,
    deleteNotification,
  };
}
