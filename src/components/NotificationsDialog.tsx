import { useTranslation } from "react-i18next";
import { useFocusTrap } from "../lib/useFocusTrap";
import type { NotificationEntry } from "../lib/useToast";
import "./Modal.css";
import "./NotificationsDialog.css";

interface NotificationsDialogProps {
  notifications: NotificationEntry[];
  onClear: () => void;
  onClose: () => void;
}

/** Render a wall-clock instant as a short relative label such as "just now",
 *  "3m ago", "2h ago", "5d ago". Coarse buckets because the popover is for
 *  eyeballing recency, not for precise audit. */
function formatRelative(
  at: number,
  now: number,
  t: (key: string, vars?: Record<string, unknown>) => string
): string {
  const deltaMs = Math.max(0, now - at);
  const deltaSec = Math.floor(deltaMs / 1000);
  if (deltaSec < 10) return t("notifications.relative.just_now");
  if (deltaSec < 60) return t("notifications.relative.seconds_ago", { count: deltaSec });
  const deltaMin = Math.floor(deltaSec / 60);
  if (deltaMin < 60) return t("notifications.relative.minutes_ago", { count: deltaMin });
  const deltaHr = Math.floor(deltaMin / 60);
  if (deltaHr < 24) return t("notifications.relative.hours_ago", { count: deltaHr });
  const deltaDay = Math.floor(deltaHr / 24);
  return t("notifications.relative.days_ago", { count: deltaDay });
}

export function NotificationsDialog({ notifications, onClear, onClose }: NotificationsDialogProps) {
  const { t } = useTranslation();
  const dialogRef = useFocusTrap<HTMLDivElement>();
  const now = Date.now();
  // Reverse so newest is on top; the underlying buffer is appended-to so
  // it's stored oldest-first.
  const ordered = [...notifications].reverse();

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.stopPropagation();
      onClose();
    }
  }

  return (
    <div className="modal-overlay" role="presentation">
      <button
        type="button"
        className="modal-backdrop"
        aria-label={t("common.close")}
        onClick={onClose}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={t("notifications.title")}
        className="modal-panel notifications-panel"
        onKeyDown={handleKeyDown}
      >
        <div className="notifications-header">
          <p className="modal-title">{t("notifications.title")}</p>
          <button
            type="button"
            className="notifications-close"
            onClick={onClose}
            aria-label={t("notifications.close_label")}
          >
            ×
          </button>
        </div>
        {ordered.length === 0 ? (
          <p className="modal-copy notifications-empty">{t("notifications.empty")}</p>
        ) : (
          <ul className="notifications-list">
            {ordered.map((entry) => (
              <li key={entry.id} className="notifications-item">
                <span className="notifications-message">{entry.message}</span>
                <span className="notifications-time" title={new Date(entry.at).toLocaleString()}>
                  {formatRelative(entry.at, now, t)}
                </span>
              </li>
            ))}
          </ul>
        )}
        <div className="modal-actions notifications-actions">
          <button
            type="button"
            className="modal-btn modal-btn-cancel"
            onClick={onClear}
            disabled={ordered.length === 0}
          >
            {t("notifications.clear")}
          </button>
          <div className="modal-spacer" />
          <button type="button" className="modal-btn modal-btn-cancel" onClick={onClose}>
            {t("notifications.close")}
          </button>
        </div>
      </div>
    </div>
  );
}
