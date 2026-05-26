import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNotifications } from '../hooks/useNotifications';
import NotificationItem from './NotificationItem';
import type {
  NotificationItem as Notif,
  NotificationType,
} from '../utils/notificationTypes';

interface Props {
  userId: string;
  onNavigate: (view: string, tab?: string, extraData?: string) => void;
}

// Badge color per priority type (matches the old dot-color UX).
const BADGE_BG: Record<NotificationType, string> = {
  message: 'bg-green-500',
  coach_note: 'bg-blue-500',
  coach_plan: 'bg-blue-500',
  announcement: 'bg-red-500',
  coach_request: 'bg-orange-500',
};

export default function NotificationBell({ userId, onNavigate }: Props) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const [showPanel, setShowPanel] = useState(false);

  const {
    notifications,
    unreadCount,
    priorityType,
    markAsRead,
    markAllAsRead,
  } = useNotifications(userId);

  // Close panel on outside click.
  useEffect(() => {
    if (!showPanel) return;
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowPanel(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showPanel]);

  const handleToggle = () => {
    setShowPanel(prev => {
      const next = !prev;
      // Opening the panel marks everything as read in Firestore.
      if (next && unreadCount > 0) {
        markAllAsRead();
      }
      return next;
    });
  };

  const handleItemClick = (item: Notif) => {
    setShowPanel(false);
    // Defensive — should already be read from markAllAsRead, but ensures
    // single-click navigation always clears the dot for this item.
    if (!item.readAt) {
      markAsRead(item.id);
    }
    onNavigate(item.navigateTo, undefined, item.extraData);
  };

  const badgeColor = priorityType ? BADGE_BG[priorityType] : 'bg-gray-400';
  const badgeText = unreadCount > 9 ? '9+' : String(unreadCount);

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={handleToggle}
        className={`w-12 h-12 bg-white rounded-2xl border border-gray-100 flex items-center justify-center transition-all relative shadow-sm active:scale-90 ${
          unreadCount > 0 ? 'opacity-100' : 'opacity-40'
        }`}
      >
        <span className="material-symbols-outlined text-gray-400 text-[26px] font-bold">
          notifications
        </span>
        {unreadCount > 0 && (
          <span
            className={`absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 ${badgeColor} rounded-full border-2 border-white flex items-center justify-center text-white text-[10px] font-black leading-none`}
          >
            {badgeText}
          </span>
        )}
      </button>

      {showPanel && (
        <div className="absolute right-0 top-14 w-72 bg-white rounded-2xl shadow-xl border border-gray-100 z-[9999] overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <p className="text-[11px] font-black text-[#0a3a2a] uppercase tracking-widest">
              {t('announcements.pageTitle')}
            </p>
            <button
              onClick={() => setShowPanel(false)}
              className="w-6 h-6 flex items-center justify-center text-gray-400 active:scale-90"
            >
              <span className="material-symbols-outlined text-[16px]">close</span>
            </button>
          </div>
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 gap-2">
              <span className="material-symbols-outlined text-gray-200 text-4xl">
                notifications_off
              </span>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                {t('announcements.empty')}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50 max-h-[60vh] overflow-y-auto">
              {notifications.map(item => (
                <NotificationItem
                  key={item.id}
                  item={item}
                  onClick={handleItemClick}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
