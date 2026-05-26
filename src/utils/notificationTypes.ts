import type { Timestamp } from 'firebase/firestore';

// ──────────────────────────────────────────────────────────────────────────────
// TYPES
// ──────────────────────────────────────────────────────────────────────────────

export type NotificationType =
  | 'message'
  | 'coach_note'
  | 'coach_plan'
  | 'announcement'
  | 'coach_request';

export type NavigateTarget =
  | 'MY_COACH'
  | 'COACH'
  | 'ANNOUNCEMENTS'
  | 'ADMIN'
  | 'CALENDAR';

export interface NotificationDoc {
  type: NotificationType;
  refId: string;                       // stable source id — deduplication key
  title?: string;                      // literal title (used as fallback)
  titleKey?: string;                   // i18n key — preferred, resolved at render
  titleParams?: Record<string, string | number>;
  senderName?: string;
  senderId?: string;
  icon: string;
  iconColor: string;
  navigateTo: NavigateTarget;
  extraData?: string;
  createdAt: Timestamp;
  readAt: Timestamp | null;
}

export interface NotificationItem extends NotificationDoc {
  id: string;                          // doc id = notificationId(type, refId)
}

export type NotificationPayload = Omit<NotificationDoc, 'createdAt' | 'readAt'>;

// Priority order for the bell-icon outline color (highest first)
export const PRIORITY_ORDER: NotificationType[] = [
  'message',
  'coach_note',
  'coach_plan',
  'announcement',
  'coach_request',
];

// ──────────────────────────────────────────────────────────────────────────────
// ID helpers — deterministic, used for setDoc deduplication
// ──────────────────────────────────────────────────────────────────────────────

export function notificationId(type: NotificationType, refId: string): string {
  return `${type}_${refId}`;
}

// ──────────────────────────────────────────────────────────────────────────────
// BUILDERS — one factory per type. Keeps icon/color/navigateTo consistent
// across all call-sites that emit a notification.
// ──────────────────────────────────────────────────────────────────────────────

export function buildMessageNotification(params: {
  senderId: string;
  senderName?: string;
  recipientRole: 'student' | 'coach';
}): { id: string; payload: NotificationPayload } {
  return {
    id: notificationId('message', params.senderId),
    payload: {
      type: 'message',
      refId: params.senderId,
      titleKey: 'announcements.newMessage',
      senderName: params.senderName,
      senderId: params.senderId,
      icon: 'chat',
      iconColor: 'text-green-600',
      navigateTo: params.recipientRole === 'student' ? 'MY_COACH' : 'COACH',
      extraData: params.senderId,
    },
  };
}

export function buildCoachNoteNotification(params: {
  sessionId: string;
  sessionDate?: string;        // for title — "notatka do treningu z DATE"
  coachName?: string;
  coachId?: string;
}): { id: string; payload: NotificationPayload } {
  return {
    id: notificationId('coach_note', params.sessionId),
    payload: {
      type: 'coach_note',
      refId: params.sessionId,
      titleKey: 'announcements.newCoachNote',
      titleParams: params.sessionDate ? { date: params.sessionDate } : undefined,
      senderName: params.coachName,
      senderId: params.coachId,
      icon: 'rate_review',
      iconColor: 'text-blue-600',
      navigateTo: 'MY_COACH',
      extraData: params.sessionId,
    },
  };
}

export function buildCoachPlanNotification(params: {
  eventId: string;
  coachName?: string;
  coachId?: string;
}): { id: string; payload: NotificationPayload } {
  return {
    id: notificationId('coach_plan', params.eventId),
    payload: {
      type: 'coach_plan',
      refId: params.eventId,
      titleKey: 'announcements.newCoachPlan',
      senderName: params.coachName,
      senderId: params.coachId,
      icon: 'event',
      iconColor: 'text-[#0a3a2a]',
      navigateTo: 'MY_COACH',
      extraData: params.eventId,
    },
  };
}

export function buildAnnouncementNotification(params: {
  announcementId: string;
  title: string;
  fromCoach: boolean;
  senderName?: string;
  senderId?: string;
}): { id: string; payload: NotificationPayload } {
  return {
    id: notificationId('announcement', params.announcementId),
    payload: {
      type: 'announcement',
      refId: params.announcementId,
      title: params.title,
      senderName: params.senderName,
      senderId: params.senderId,
      icon: params.fromCoach ? 'campaign' : 'notifications',
      iconColor: params.fromCoach ? 'text-blue-600' : 'text-red-500',
      navigateTo: 'ANNOUNCEMENTS',
      extraData: params.announcementId,
    },
  };
}

export function buildCoachRequestNotification(params: {
  requestId: string;
  studentName?: string;
  studentId?: string;
}): { id: string; payload: NotificationPayload } {
  return {
    id: notificationId('coach_request', params.requestId),
    payload: {
      type: 'coach_request',
      refId: params.requestId,
      titleKey: 'announcements.newCoachRequest',
      senderName: params.studentName,
      senderId: params.studentId,
      icon: 'sports',
      iconColor: 'text-orange-500',
      navigateTo: 'ADMIN',
      extraData: params.requestId,
    },
  };
}
