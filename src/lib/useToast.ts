import { useCallback, useRef, useState } from "react";

export interface Toast {
  id: number;
  message: string;
  leaving?: boolean;
}

/** A toast that has been seen by the user (or auto-dismissed) but is kept
 *  in the in-memory history so it can be re-read later from the notifications
 *  popover. The `at` timestamp is the wall-clock time the toast fired. */
export interface NotificationEntry {
  id: number;
  message: string;
  at: number;
}

const VISIBLE_MS = 2000;
const EXIT_MS = 180;
/** Cap on how many past toasts we retain. Twenty is enough to scroll through
 *  recent activity without making the popover feel like a log file; older
 *  entries drop off the bottom. */
const HISTORY_LIMIT = 20;

export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  // History stored as React state so the status-bar badge and the popover
  // both re-render when a new toast fires. unread is the count of entries
  // added since `markNotificationsRead` was last called; the badge dot uses
  // it directly.
  const [notifications, setNotifications] = useState<NotificationEntry[]>([]);
  const [unread, setUnread] = useState(0);
  const idRef = useRef(0);

  const showToast = useCallback((message: string) => {
    const id = ++idRef.current;
    const at = Date.now();
    setToasts((prev) => [...prev, { id, message }]);
    setNotifications((prev) => {
      const next = [...prev, { id, message, at }];
      // Drop oldest entries once we exceed the limit so memory stays bounded
      // over a long-running session.
      return next.length > HISTORY_LIMIT ? next.slice(next.length - HISTORY_LIMIT) : next;
    });
    setUnread((n) => n + 1);
    setTimeout(() => {
      setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
      setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), EXIT_MS);
    }, VISIBLE_MS);
  }, []);

  const markNotificationsRead = useCallback(() => {
    setUnread(0);
  }, []);

  const clearNotifications = useCallback(() => {
    setNotifications([]);
    setUnread(0);
  }, []);

  return { toasts, showToast, notifications, unread, markNotificationsRead, clearNotifications };
}
