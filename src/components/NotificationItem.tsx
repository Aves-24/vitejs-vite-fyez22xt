import React from 'react';
import { useTranslation } from 'react-i18next';
import type { NotificationItem as Notif } from '../utils/notificationTypes';

interface Props {
  item: Notif;
  onClick: (item: Notif) => void;
}

export default function NotificationItem({ item, onClick }: Props) {
  const { t } = useTranslation();
  const isRead = !!item.readAt;

  const title = item.titleKey
    ? t(item.titleKey, item.titleParams)
    : item.title || t('announcements.newAnnouncement');

  const ago = (() => {
    const createdMs = item.createdAt?.toMillis
      ? item.createdAt.toMillis()
      : 0;
    if (!createdMs) return '';
    const diff = Date.now() - createdMs;
    const m = Math.floor(diff / 60000);
    if (m < 1) return t('announcements.justNow');
    if (m < 60) return t('announcements.minutesAgo', { count: m });
    const h = Math.floor(m / 60);
    if (h < 24) return t('announcements.hoursAgo', { count: h });
    return t('announcements.daysAgo', { count: Math.floor(h / 24) });
  })();

  return (
    <button
      onClick={() => onClick(item)}
      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 active:bg-gray-100 transition-all text-left"
    >
      <div
        className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
          isRead ? 'bg-gray-50' : 'bg-gray-100'
        }`}
      >
        <span
          className={`material-symbols-outlined text-[16px] ${
            isRead ? 'text-gray-400' : item.iconColor
          }`}
        >
          {item.icon}
        </span>
      </div>
      <div className="flex-1 min-w-0">
        <p
          className={`text-[12px] font-black truncate ${
            isRead ? 'text-gray-400' : 'text-[#0a3a2a]'
          }`}
        >
          {title}
        </p>
        {item.senderName && (
          <p
            className={`text-[10px] font-semibold truncate ${
              isRead ? 'text-gray-300' : 'text-gray-500'
            }`}
          >
            {item.senderName}
          </p>
        )}
        {ago && (
          <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wide mt-0.5">
            {ago}
          </p>
        )}
      </div>
      <span className="material-symbols-outlined text-[14px] text-gray-300 shrink-0">
        chevron_right
      </span>
    </button>
  );
}
