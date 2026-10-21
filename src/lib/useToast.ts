import { useCallback, useEffect, useRef, useState } from "react";

/** How a toast is presented: errors stay longer, can be dismissed, and are
 *  announced assertively; successes and info are brief and polite. */
export type ToastKind = "info" | "success" | "error";

export interface ToastOptions {
  kind?: ToastKind;
  /** Override the kind's default visible time. */
  durationMs?: number;
}

/** The app-wide toast function. Options are optional, so a plain
 *  `showToast(message)` is an info toast. */
export type ShowToast = (message: string, options?: ToastOptions) => void;

export interface Toast {
  id: number;
  message: string;
  kind: ToastKind;
  leaving?: boolean;
}

/** A toast that has been seen by the user (or auto-dismissed) but is kept
 *  in the in-memory history so it can be re-read later from the notifications
 *  popover. The `at` timestamp is the wall-clock time the toast fired. */
export interface NotificationEntry {
  id: number;
  message: string;
  kind: ToastKind;
  at: number;
}

/** Visible time by kind. Errors carry detail worth reading (they used to vanish
 *  after two seconds). */
const VISIBLE_MS: Record<ToastKind, number> = { info: 2500, success: 2500, error: 7000 };
const EXIT_MS = 180;
/** Cap on how many past toasts we retain. Twenty is enough to scroll through
 *  recent activity without making the popover feel like a log file; older
 *  entries drop off the bottom. */
const HISTORY_LIMIT = 20;
/** At most this many toasts on screen; the oldest leaves first. */
const MAX_VISIBLE = 4;

interface ToastTimer {
  handle: ReturnType<typeof setTimeout> | null;
  remainingMs: number;
  startedAt: number;
}

export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  // History stored as React state so the status-bar badge and the popover
  // both re-render when a new toast fires. unread is the count of entries
  // added since `markNotificationsRead` was last called; the badge dot uses
  // it directly.
  const [notifications, setNotifications] = useState<NotificationEntry[]>([]);
  const [unread, setUnread] = useState(0);
  const idRef = useRef(0);
  // Toasts on screen, kept in step synchronously (state lags a render), so a
  // burst of identical messages within one tick still de-duplicates.
  const liveRef = useRef<Toast[]>([]);
  const timersRef = useRef(new Map<number, ToastTimer>());

  const removeToast = useCallback((id: number) => {
    liveRef.current = liveRef.current.filter((t) => t.id !== id);
    const timer = timersRef.current.get(id);
    if (timer?.handle) clearTimeout(timer.handle);
    timersRef.current.delete(id);
    setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), EXIT_MS);
  }, []);

  const startTimer = useCallback(
    (id: number, ms: number) => {
      const existing = timersRef.current.get(id);
      if (existing?.handle) clearTimeout(existing.handle);
      timersRef.current.set(id, {
        handle: setTimeout(() => removeToast(id), ms),
        remainingMs: ms,
        startedAt: Date.now(),
      });
    },
    [removeToast]
  );

  const showToast = useCallback<ShowToast>(
    (message, options = {}) => {
      const kind = options.kind ?? "info";
      const visibleMs = options.durationMs ?? VISIBLE_MS[kind];

      // The same message already on screen (a save that keeps failing, a
      // repeated action) refreshes that toast instead of stacking copies.
      const duplicate = liveRef.current.find((t) => t.message === message && t.kind === kind);
      if (duplicate) {
        startTimer(duplicate.id, visibleMs);
        return;
      }

      const id = ++idRef.current;
      const at = Date.now();
      const toast: Toast = { id, message, kind };
      // Bound the stack: the oldest toasts on screen leave first.
      const live = [...liveRef.current, toast];
      const overflow = live.slice(0, Math.max(0, live.length - MAX_VISIBLE));
      liveRef.current = live.slice(overflow.length);
      for (const old of overflow) {
        const timer = timersRef.current.get(old.id);
        if (timer?.handle) clearTimeout(timer.handle);
        timersRef.current.delete(old.id);
      }
      const dropped = new Set(overflow.map((t) => t.id));
      setToasts((prev) => [...prev.filter((t) => !dropped.has(t.id)), toast]);
      setNotifications((prev) => {
        const next = [...prev, { id, message, kind, at }];
        // Drop oldest entries once we exceed the limit so memory stays bounded
        // over a long-running session.
        return next.length > HISTORY_LIMIT ? next.slice(next.length - HISTORY_LIMIT) : next;
      });
      setUnread((n) => n + 1);
      startTimer(id, visibleMs);
    },
    [startTimer]
  );

  /** Close a toast now (its dismiss button). */
  const dismissToast = useCallback((id: number) => removeToast(id), [removeToast]);

  /** Hovering a toast holds it on screen; leaving resumes the countdown. */
  const pauseToast = useCallback((id: number) => {
    const timer = timersRef.current.get(id);
    if (!timer?.handle) return;
    clearTimeout(timer.handle);
    timer.handle = null;
    timer.remainingMs = Math.max(0, timer.remainingMs - (Date.now() - timer.startedAt));
  }, []);

  const resumeToast = useCallback(
    (id: number) => {
      const timer = timersRef.current.get(id);
      if (!timer || timer.handle) return;
      startTimer(id, Math.max(1000, timer.remainingMs));
    },
    [startTimer]
  );

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      for (const timer of timers.values()) if (timer.handle) clearTimeout(timer.handle);
      timers.clear();
    };
  }, []);

  const markNotificationsRead = useCallback(() => {
    setUnread(0);
  }, []);

  const clearNotifications = useCallback(() => {
    setNotifications([]);
    setUnread(0);
  }, []);

  return {
    toasts,
    showToast,
    dismissToast,
    pauseToast,
    resumeToast,
    notifications,
    unread,
    markNotificationsRead,
    clearNotifications,
  };
}
